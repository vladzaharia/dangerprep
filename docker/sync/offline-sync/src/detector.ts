import { exec } from 'child_process';
import { EventEmitter } from 'events';
import { promisify } from 'util';

import { Logger, LoggerFactory } from '@dangerprep/logging';
import { usb } from 'usb';

import { DetectedDevice, OfflineSyncConfig, LsblkOutput, DiskSpaceInfo } from './types';

const execAsync = promisify(exec);

// Type for USB device from the usb library
interface USBLibDevice {
  deviceDescriptor?: {
    idVendor?: number;
    idProduct?: number;
    bDeviceClass?: number;
    iManufacturer?: number;
    iProduct?: number;
    iSerialNumber?: number;
  };
  busNumber?: number;
  deviceAddress?: number;
  portNumbers?: number[];
}

export class DeviceDetector extends EventEmitter {
  private config: OfflineSyncConfig['offline_sync'];
  private detectedDevices: Map<string, DetectedDevice> = new Map();
  private isMonitoring = false;
  private logger: Logger;

  constructor(config: OfflineSyncConfig) {
    super();
    this.config = config.offline_sync;
    this.logger = LoggerFactory.createConsoleLogger('DeviceDetector');
  }

  /**
   * Start monitoring for USB device changes
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.log('Starting USB device monitoring...');

    // Listen for USB device attach events
    usb.on('attach', (device: USBLibDevice) => {
      this.handleDeviceAttach(device);
    });

    // Listen for USB device detach events
    usb.on('detach', (device: USBLibDevice) => {
      this.handleDeviceDetach(device);
    });

    // Scan for existing devices
    this.scanExistingDevices();

    this.log('USB device monitoring started');
  }

  /**
   * Stop monitoring for USB device changes
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    usb.removeAllListeners('attach');
    usb.removeAllListeners('detach');

    this.log('USB device monitoring stopped');
  }

  /**
   * Get all currently detected devices
   */
  public getDetectedDevices(): DetectedDevice[] {
    return Array.from(this.detectedDevices.values());
  }

  /**
   * Get a specific device by device path
   */
  public getDevice(devicePath: string): DetectedDevice | undefined {
    return this.detectedDevices.get(devicePath);
  }

  /**
   * Handle USB device attach event
   */
  private async handleDeviceAttach(device: USBLibDevice): Promise<void> {
    try {
      this.log(
        `USB device attached: VID=${device.deviceDescriptor?.idVendor?.toString(16)}, PID=${device.deviceDescriptor?.idProduct?.toString(16)}`
      );

      // Check if this is a mass storage device
      if (!this.isMassStorageDevice(device)) {
        return;
      }

      // Wait a moment for the device to be ready
      await this.sleep(2000);

      // Find the corresponding block device
      const blockDevices = await this.findBlockDevices(device);

      for (const blockDevice of blockDevices) {
        const detectedDevice = await this.analyzeDevice(device, blockDevice);

        if (detectedDevice && this.isValidDevice(detectedDevice)) {
          this.detectedDevices.set(detectedDevice.devicePath, detectedDevice);
          this.emit('device_detected', detectedDevice);
          this.log(`Valid storage device detected: ${detectedDevice.devicePath}`);
        }
      }
    } catch (error) {
      this.logError('Error handling device attach', error);
    }
  }

  /**
   * Handle USB device detach event
   */
  private handleDeviceDetach(device: USBLibDevice): void {
    try {
      this.log(
        `USB device detached: VID=${device.deviceDescriptor?.idVendor?.toString(16)}, PID=${device.deviceDescriptor?.idProduct?.toString(16)}`
      );

      // Find and remove the corresponding detected device
      for (const [devicePath, detectedDevice] of this.detectedDevices.entries()) {
        if (
          detectedDevice.deviceInfo.vendorId === device.deviceDescriptor?.idVendor &&
          detectedDevice.deviceInfo.productId === device.deviceDescriptor?.idProduct
        ) {
          this.detectedDevices.delete(devicePath);
          this.emit('device_removed', detectedDevice);
          this.log(`Storage device removed: ${devicePath}`);
          break;
        }
      }
    } catch (error) {
      this.logError('Error handling device detach', error);
    }
  }

  /**
   * Scan for existing USB devices on startup
   */
  private async scanExistingDevices(): Promise<void> {
    try {
      this.log('Scanning for existing USB storage devices...');

      const devices = usb.getDeviceList();

      for (const device of devices) {
        if (this.isMassStorageDevice(device)) {
          await this.handleDeviceAttach(device);
        }
      }

      this.log(`Found ${this.detectedDevices.size} existing storage devices`);
    } catch (error) {
      this.logError('Error scanning existing devices', error);
    }
  }

  /**
   * Check if a USB device is a mass storage device
   */
  private isMassStorageDevice(device: USBLibDevice): boolean {
    try {
      const descriptor = device.deviceDescriptor;
      if (!descriptor) return false;

      // Check device class for mass storage (0x08)
      if (descriptor.bDeviceClass === 0x08) {
        return true;
      }

      // If device class is 0 (defined at interface level), check interfaces
      if (descriptor.bDeviceClass === 0x00) {
        // We'll need to open the device to check interfaces, but for now
        // we'll use a heuristic based on common mass storage device characteristics
        return this.config.device_detection.monitor_device_types.includes('mass_storage');
      }

      return false;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Find block devices associated with a USB device
   */
  private async findBlockDevices(_device: USBLibDevice): Promise<string[]> {
    try {
      // Use lsblk to find block devices
      const { stdout } = await execAsync('lsblk -J -o NAME,TYPE,SIZE,MOUNTPOINT,FSTYPE');
      const lsblkOutput = JSON.parse(stdout) as LsblkOutput;

      const blockDevices: string[] = [];

      // This is a simplified approach - in a real implementation, you'd need to
      // match the USB device to its corresponding block device more precisely
      for (const blockDevice of lsblkOutput.blockdevices ?? []) {
        if (blockDevice.type === 'disk' && blockDevice.name.startsWith('sd')) {
          blockDevices.push(`/dev/${blockDevice.name}`);
        }
      }

      return blockDevices;
    } catch (error) {
      this.logError('Error finding block devices', error);
      return [];
    }
  }

  /**
   * Analyze a detected device to gather information
   */
  private async analyzeDevice(
    usbDevice: USBLibDevice,
    blockDevice: string
  ): Promise<DetectedDevice | null> {
    try {
      const descriptor = usbDevice.deviceDescriptor;

      // Get device size and filesystem info
      const deviceInfo = await this.getDeviceInfo(blockDevice);

      const manufacturer = await this.getStringDescriptor(usbDevice, descriptor?.iManufacturer);
      const product = await this.getStringDescriptor(usbDevice, descriptor?.iProduct);
      const serialNumber = await this.getStringDescriptor(usbDevice, descriptor?.iSerialNumber);

      const detectedDevice: DetectedDevice = {
        devicePath: blockDevice,
        deviceInfo: {
          vendorId: descriptor?.idVendor || 0,
          productId: descriptor?.idProduct || 0,
          ...(manufacturer && { manufacturer }),
          ...(product && { product }),
          ...(serialNumber && { serialNumber }),
          size: deviceInfo.size,
        },
        fileSystem: deviceInfo.fstype,
        isMounted: deviceInfo.mounted,
        ...(deviceInfo.mountpoint && { mountPath: deviceInfo.mountpoint }),
        isReady: true,
      };

      return detectedDevice;
    } catch (error) {
      this.logError(`Error analyzing device ${blockDevice}`, error);
      return null;
    }
  }

  /**
   * Get device information using system tools
   */
  private async getDeviceInfo(devicePath: string): Promise<DiskSpaceInfo> {
    try {
      const { stdout } = await execAsync(`lsblk -J -b -o SIZE,FSTYPE,MOUNTPOINT ${devicePath}`);
      const lsblkOutput = JSON.parse(stdout) as LsblkOutput;

      const device = lsblkOutput.blockdevices?.[0];
      return {
        size: parseInt(device?.size ?? '0') || 0,
        fstype: device?.fstype ?? 'unknown',
        mounted: !!device?.mountpoint,
        mountpoint: device?.mountpoint,
      };
    } catch (_error) {
      return {
        size: 0,
        fstype: 'unknown',
        mounted: false,
        mountpoint: undefined,
      };
    }
  }

  /**
   * Get string descriptor from USB device
   */
  private async getStringDescriptor(
    _device: USBLibDevice,
    index?: number
  ): Promise<string | undefined> {
    if (!index) return undefined;

    try {
      // This would require opening the device, which needs proper permissions
      // For now, return undefined - this can be enhanced later
      return undefined;
    } catch (_error) {
      return undefined;
    }
  }

  /**
   * Check if a detected device meets our criteria
   */
  private isValidDevice(device: DetectedDevice): boolean {
    // Check minimum size requirement
    const minSize = this.parseSize(this.config.device_detection.min_device_size);
    if (device.deviceInfo.size && device.deviceInfo.size < minSize) {
      return false;
    }

    // Check if filesystem is supported
    const supportedFileSystems = ['ext4', 'ext3', 'ext2', 'ntfs', 'fat32', 'exfat', 'vfat'];
    if (device.fileSystem && !supportedFileSystems.includes(device.fileSystem.toLowerCase())) {
      this.log(`Unsupported filesystem: ${device.fileSystem} on ${device.devicePath}`);
      return false;
    }

    return true;
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(sizeStr: string): number {
    const units: { [key: string]: number } = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
    if (!match?.[1] || !match[2]) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    return Math.floor(value * (units[unit] ?? 1));
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    this.logger.debug(message);
  }

  /**
   * Log an error
   */
  private logError(message: string, error: unknown): void {
    this.logger.error(message, { error: error instanceof Error ? error.message : String(error) });
  }
}
