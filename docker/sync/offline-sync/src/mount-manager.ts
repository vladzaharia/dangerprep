import { exec } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import { promisify } from 'util';

import * as fs from 'fs-extra';

import { DetectedDevice, OfflineSyncConfig } from './types';

const execAsync = promisify(exec);

export class MountManager extends EventEmitter {
  private config: OfflineSyncConfig['offline_sync'];
  private mountedDevices: Map<string, string> = new Map(); // devicePath -> mountPath

  constructor(config: OfflineSyncConfig['offline_sync']) {
    super();
    this.config = config;
  }

  /**
   * Mount a detected device
   */
  public async mountDevice(device: DetectedDevice): Promise<string | null> {
    try {
      // Check if already mounted
      if (device.isMounted && device.mountPath) {
        this.log(`Device ${device.devicePath} already mounted at ${device.mountPath}`);
        this.mountedDevices.set(device.devicePath, device.mountPath);
        return device.mountPath;
      }

      // Create mount point
      const mountPath = await this.createMountPoint(device);
      if (!mountPath) {
        throw new Error('Failed to create mount point');
      }

      // Try different mounting approaches
      let success = false;
      let error: Error | null = null;

      // First try udisks2 (preferred for user-space mounting)
      try {
        await this.mountWithUdisks2(device.devicePath, mountPath);
        success = true;
        this.log(`Successfully mounted ${device.devicePath} at ${mountPath} using udisks2`);
      } catch (udisksError) {
        this.log(`udisks2 mount failed for ${device.devicePath}: ${udisksError}`);
        error = udisksError instanceof Error ? udisksError : new Error(String(udisksError));
      }

      // Fallback to direct mount command
      if (!success) {
        try {
          await this.mountWithSystemMount(device, mountPath);
          success = true;
          this.log(`Successfully mounted ${device.devicePath} at ${mountPath} using system mount`);
        } catch (mountError) {
          this.log(`System mount failed for ${device.devicePath}: ${mountError}`);
          error = mountError instanceof Error ? mountError : new Error(String(mountError));
        }
      }

      if (!success) {
        await this.cleanupMountPoint(mountPath);
        throw error || new Error('All mounting methods failed');
      }

      // Verify mount was successful
      const isMounted = await this.verifyMount(mountPath);
      if (!isMounted) {
        await this.cleanupMountPoint(mountPath);
        throw new Error('Mount verification failed');
      }

      // Update device info
      device.isMounted = true;
      device.mountPath = mountPath;
      device.isReady = true;

      this.mountedDevices.set(device.devicePath, mountPath);
      this.emit('device_mounted', device, mountPath);

      return mountPath;
    } catch (error) {
      this.logError(`Failed to mount device ${device.devicePath}`, error);
      this.emit('mount_failed', device, error);
      return null;
    }
  }

  /**
   * Unmount a device
   */
  public async unmountDevice(device: DetectedDevice): Promise<boolean> {
    try {
      if (!device.isMounted || !device.mountPath) {
        this.log(`Device ${device.devicePath} is not mounted`);
        return true;
      }

      const mountPath = device.mountPath;

      // Try udisks2 first
      let success = false;
      try {
        await this.unmountWithUdisks2(device.devicePath);
        success = true;
        this.log(`Successfully unmounted ${device.devicePath} using udisks2`);
      } catch (udisksError) {
        this.log(`udisks2 unmount failed for ${device.devicePath}: ${udisksError}`);
      }

      // Fallback to system umount
      if (!success) {
        try {
          await this.unmountWithSystemUmount(mountPath);
          success = true;
          this.log(`Successfully unmounted ${device.devicePath} using system umount`);
        } catch (umountError) {
          this.log(`System umount failed for ${device.devicePath}: ${umountError}`);
        }
      }

      if (success) {
        // Clean up mount point
        await this.cleanupMountPoint(mountPath);

        // Update device info
        device.isMounted = false;
        device.mountPath = undefined;
        device.isReady = false;

        this.mountedDevices.delete(device.devicePath);
        this.emit('device_unmounted', device);
      }

      return success;
    } catch (error) {
      this.logError(`Failed to unmount device ${device.devicePath}`, error);
      this.emit('unmount_failed', device, error);
      return false;
    }
  }

  /**
   * Get all currently mounted devices
   */
  public getMountedDevices(): Map<string, string> {
    return new Map(this.mountedDevices);
  }

  /**
   * Check if a device is mounted
   */
  public isDeviceMounted(devicePath: string): boolean {
    return this.mountedDevices.has(devicePath);
  }

  /**
   * Get mount path for a device
   */
  public getMountPath(devicePath: string): string | undefined {
    return this.mountedDevices.get(devicePath);
  }

  /**
   * Create a mount point for the device
   */
  private async createMountPoint(device: DetectedDevice): Promise<string | null> {
    try {
      const baseName = path.basename(device.devicePath);
      const timestamp = Date.now();
      const mountPath = path.join(this.config.storage.mount_base, `${baseName}_${timestamp}`);

      await fs.ensureDir(mountPath);
      await fs.chmod(mountPath, 0o755);

      this.log(`Created mount point: ${mountPath}`);
      return mountPath;
    } catch (error) {
      this.logError('Failed to create mount point', error);
      return null;
    }
  }

  /**
   * Mount device using udisks2
   */
  private async mountWithUdisks2(devicePath: string, mountPath: string): Promise<void> {
    // udisks2 typically mounts to /media/username/label, but we want our custom path
    // First mount with udisks2, then bind mount to our desired location

    try {
      // Mount with udisks2
      const { stdout } = await execAsync(`udisksctl mount -b ${devicePath}`);

      // Extract the actual mount path from udisks2 output
      const mountMatch = stdout.match(/Mounted .+ at (.+)/);
      if (!mountMatch?.[1]) {
        throw new Error('Could not determine udisks2 mount path');
      }

      const udisksMountPath = mountMatch[1].trim();

      // Bind mount to our desired location
      await execAsync(`mount --bind "${udisksMountPath}" "${mountPath}"`);

      this.log(`Bind mounted ${udisksMountPath} to ${mountPath}`);
    } catch (error) {
      throw new Error(`udisks2 mount failed: ${error}`);
    }
  }

  /**
   * Mount device using system mount command
   */
  private async mountWithSystemMount(device: DetectedDevice, mountPath: string): Promise<void> {
    try {
      let mountOptions = 'rw,user,exec';

      // Add filesystem-specific options
      if (device.fileSystem) {
        switch (device.fileSystem.toLowerCase()) {
          case 'ntfs':
            mountOptions += ',uid=1001,gid=1001,umask=0022';
            break;
          case 'vfat':
          case 'fat32':
            mountOptions += ',uid=1001,gid=1001,umask=0022,iocharset=utf8';
            break;
          case 'exfat':
            mountOptions += ',uid=1001,gid=1001,umask=0022';
            break;
        }
      }

      const mountCommand = `mount -o ${mountOptions} ${device.devicePath} ${mountPath}`;
      await execAsync(mountCommand);

      this.log(`Mounted ${device.devicePath} at ${mountPath} with options: ${mountOptions}`);
    } catch (error) {
      throw new Error(`System mount failed: ${error}`);
    }
  }

  /**
   * Unmount device using udisks2
   */
  private async unmountWithUdisks2(devicePath: string): Promise<void> {
    try {
      await execAsync(`udisksctl unmount -b ${devicePath}`);
    } catch (error) {
      throw new Error(`udisks2 unmount failed: ${error}`);
    }
  }

  /**
   * Unmount device using system umount command
   */
  private async unmountWithSystemUmount(mountPath: string): Promise<void> {
    try {
      // Try graceful unmount first
      await execAsync(`umount ${mountPath}`);
    } catch (error) {
      // If graceful unmount fails, try lazy unmount
      try {
        await execAsync(`umount -l ${mountPath}`);
        this.log(`Used lazy unmount for ${mountPath}`);
      } catch (lazyError) {
        throw new Error(`System umount failed: ${error}, lazy unmount also failed: ${lazyError}`);
      }
    }
  }

  /**
   * Verify that a mount was successful
   */
  private async verifyMount(mountPath: string): Promise<boolean> {
    try {
      // Check if mount point exists and is accessible
      const stats = await fs.stat(mountPath);
      if (!stats.isDirectory()) {
        return false;
      }

      // Try to read the directory to ensure it's properly mounted
      await fs.readdir(mountPath);

      // Check if it appears in /proc/mounts
      const { stdout } = await execAsync('cat /proc/mounts');
      return stdout.includes(mountPath);
    } catch (error) {
      this.logError(`Mount verification failed for ${mountPath}`, error);
      return false;
    }
  }

  /**
   * Clean up mount point directory
   */
  private async cleanupMountPoint(mountPath: string): Promise<void> {
    try {
      if (await fs.pathExists(mountPath)) {
        // Check if directory is empty before removing
        const files = await fs.readdir(mountPath);
        if (files.length === 0) {
          await fs.rmdir(mountPath);
          this.log(`Cleaned up mount point: ${mountPath}`);
        } else {
          this.log(`Mount point ${mountPath} not empty, leaving it`);
        }
      }
    } catch (error) {
      this.logError(`Failed to cleanup mount point ${mountPath}`, error);
    }
  }

  /**
   * Initialize mount manager
   */
  public async initialize(): Promise<void> {
    try {
      // Ensure mount base directory exists
      await fs.ensureDir(this.config.storage.mount_base);
      await fs.chmod(this.config.storage.mount_base, 0o755);

      // Clean up any stale mount points
      await this.cleanupStaleMounts();

      this.log('Mount manager initialized');
    } catch (error) {
      this.logError('Failed to initialize mount manager', error);
      throw error;
    }
  }

  /**
   * Clean up stale mount points on startup
   */
  private async cleanupStaleMounts(): Promise<void> {
    try {
      if (!(await fs.pathExists(this.config.storage.mount_base))) {
        return;
      }

      const entries = await fs.readdir(this.config.storage.mount_base);

      for (const entry of entries) {
        const mountPath = path.join(this.config.storage.mount_base, entry);
        const stats = await fs.stat(mountPath);

        if (stats.isDirectory()) {
          // Check if this mount point is still active
          const isActive = await this.verifyMount(mountPath);

          if (!isActive) {
            // Try to clean up
            await this.cleanupMountPoint(mountPath);
          }
        }
      }
    } catch (error) {
      this.logError('Failed to cleanup stale mounts', error);
    }
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    console.log(`[MountManager] ${new Date().toISOString()} - ${message}`);
  }

  /**
   * Log an error
   */
  private logError(message: string, error: unknown): void {
    console.error(`[MountManager] ${new Date().toISOString()} - ${message}:`, error);
  }
}
