import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { promisify } from 'util';

import { LoggerFactory, LogLevel } from '@dangerprep/logging';

const execAsync = promisify(exec);

/**
 * WiFi configuration data
 */
export interface WifiConfig {
  ssid: string;
  password: string;
}

/**
 * Network information for WiFi interface
 */
export interface NetworkInfo {
  ipAddress?: string;
  gateway?: string;
  dnsServers?: string[];
  subnetMask?: string;
  interface?: string;
}

/**
 * WiFi configuration with metadata
 */
export interface WifiConfigWithMetadata {
  ssid: string;
  password: string;
  source: 'hostapd' | 'environment' | 'default';
}

/**
 * WiFi configuration with network information
 */
export interface WifiConfigWithNetwork extends WifiConfigWithMetadata {
  network?: NetworkInfo;
}

/**
 * Service for managing WiFi configuration
 * Reads from system hostapd configuration with fallback to environment variables
 */
export class WifiConfigService {
  private readonly hostapdPath = '/etc/hostapd/hostapd.conf';
  private logger = LoggerFactory.createStructuredLogger(
    'WifiConfigService',
    '/var/log/dangerprep/portal.log',
    process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  );

  /**
   * Get WiFi configuration from system or environment variables
   */
  getWifiConfig(): WifiConfig {
    const configWithMetadata = this.getWifiConfigWithMetadata();
    return {
      ssid: configWithMetadata.ssid,
      password: configWithMetadata.password,
    };
  }

  /**
   * Get WiFi configuration with source metadata
   */
  getWifiConfigWithMetadata(): WifiConfigWithMetadata {
    // Try to read from hostapd configuration first
    const hostapdConfig = this.readHostapdConfig();

    // Use intelligent fallback: prefer hostapd values, fall back to environment, then defaults
    const ssid = hostapdConfig.ssid || process.env.WIFI_SSID || 'DangerPrep';
    const password = hostapdConfig.password || process.env.WIFI_PASSWORD || 'change_me';

    // Determine source based on where the values actually came from
    let source: 'hostapd' | 'environment' | 'default';

    if (hostapdConfig.ssid && hostapdConfig.password) {
      // Both values successfully read from hostapd
      source = 'hostapd';
    } else if (
      (hostapdConfig.ssid || hostapdConfig.password) &&
      (process.env.WIFI_SSID || process.env.WIFI_PASSWORD)
    ) {
      // Mixed sources: some from hostapd, some from environment
      source = 'environment';
    } else if (process.env.WIFI_SSID || process.env.WIFI_PASSWORD) {
      // Values from environment variables
      source = 'environment';
    } else {
      // Using default values
      source = 'default';
    }

    this.logger.debug('Final WiFi config', {
      ssid,
      hasPassword: !!password,
      source,
    });
    this.logger.debug('Environment variables', {
      hasWifiSsid: !!process.env.WIFI_SSID,
      hasWifiPassword: !!process.env.WIFI_PASSWORD,
    });

    return { ssid, password, source };
  }

  /**
   * Read WiFi configuration from hostapd.conf
   * @private
   */
  private readHostapdConfig(): Partial<WifiConfig> {
    try {
      const hostapdContent = readFileSync(this.hostapdPath, 'utf8');
      const config: Partial<WifiConfig> = {};

      // Parse SSID
      const ssidMatch = hostapdContent.match(/^ssid=(.+)$/m);
      if (ssidMatch && ssidMatch[1]) {
        config.ssid = ssidMatch[1].trim();
      }

      // Parse password
      const passwordMatch = hostapdContent.match(/^wpa_passphrase=(.+)$/m);
      if (passwordMatch && passwordMatch[1]) {
        config.password = passwordMatch[1].trim();
      }

      this.logger.debug('Read hostapd config', {
        hasSsid: !!config.ssid,
        hasPassword: !!config.password,
      });
      return config;
    } catch (error) {
      // Silently handle missing hostapd configuration - this is expected in development
      if (error instanceof Error && error.message.includes('ENOENT')) {
        // File doesn't exist, which is normal in development environments
        this.logger.debug('Hostapd config file not found', {
          path: this.hostapdPath,
        });
        return {};
      }
      // Log other errors that might indicate real issues
      this.logger.warn('Could not read hostapd configuration', {
        path: this.hostapdPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  /**
   * Get WiFi configuration with network information
   */
  async getWifiConfigWithNetwork(): Promise<WifiConfigWithNetwork> {
    const config = this.getWifiConfigWithMetadata();
    const network = await this.getNetworkInfo();

    return {
      ...config,
      ...(network && { network }),
    };
  }

  /**
   * Get network information for the active WiFi interface
   */
  async getNetworkInfo(): Promise<NetworkInfo | undefined> {
    try {
      // First, find the active WiFi interface
      const activeInterface = await this.getActiveWifiInterface();
      if (!activeInterface) {
        this.logger.warn('No active WiFi interface found');
        return undefined;
      }

      // Get network details for the interface
      const [ipInfo, gatewayInfo, dnsInfo] = await Promise.allSettled([
        this.getInterfaceIpInfo(activeInterface),
        this.getInterfaceGateway(activeInterface),
        this.getInterfaceDns(activeInterface),
      ]);

      const networkInfo: NetworkInfo = {
        interface: activeInterface,
      };

      // Process IP information
      if (ipInfo.status === 'fulfilled' && ipInfo.value) {
        networkInfo.ipAddress = ipInfo.value.ipAddress;
        networkInfo.subnetMask = ipInfo.value.subnetMask;
      }

      // Process gateway information
      if (gatewayInfo.status === 'fulfilled' && gatewayInfo.value) {
        networkInfo.gateway = gatewayInfo.value;
      }

      // Process DNS information
      if (dnsInfo.status === 'fulfilled' && dnsInfo.value) {
        networkInfo.dnsServers = dnsInfo.value;
      }

      return networkInfo;
    } catch (error) {
      this.logger.error('Failed to get network information', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Find the active WiFi interface
   */
  private async getActiveWifiInterface(): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync('nmcli -t -f DEVICE,TYPE,STATE device status');
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const [device, type, state] = line.split(':');
        if (type === 'wifi' && state === 'connected') {
          return device;
        }
      }

      return undefined;
    } catch (error) {
      this.logger.error('Failed to get active WiFi interface', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Get IP address and subnet mask for an interface
   */
  private async getInterfaceIpInfo(
    interfaceName: string
  ): Promise<{ ipAddress: string; subnetMask: string } | undefined> {
    try {
      const { stdout } = await execAsync(`nmcli -t -f IP4.ADDRESS dev show "${interfaceName}"`);
      const addressLine = stdout.trim();

      if (addressLine && addressLine.includes(':')) {
        const address = addressLine.split(':')[1];
        if (address && address.includes('/')) {
          const [ipAddress, cidr] = address.split('/');
          if (ipAddress && cidr) {
            const subnetMask = this.cidrToSubnetMask(parseInt(cidr, 10));
            return { ipAddress, subnetMask };
          }
        }
      }

      return undefined;
    } catch (error) {
      this.logger.error('Failed to get IP info for interface', {
        interface: interfaceName,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Get gateway for an interface
   */
  private async getInterfaceGateway(interfaceName: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`nmcli -t -f IP4.GATEWAY dev show "${interfaceName}"`);
      const gatewayLine = stdout.trim();

      if (gatewayLine && gatewayLine.includes(':')) {
        const gateway = gatewayLine.split(':')[1];
        return gateway || undefined;
      }

      return undefined;
    } catch (error) {
      this.logger.error('Failed to get gateway for interface', {
        interface: interfaceName,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Get DNS servers for an interface
   */
  private async getInterfaceDns(interfaceName: string): Promise<string[] | undefined> {
    try {
      const { stdout } = await execAsync(`nmcli -t -f IP4.DNS dev show "${interfaceName}"`);
      const dnsLines = stdout
        .trim()
        .split('\n')
        .filter(line => line.includes(':'));

      const dnsServers = dnsLines
        .map(line => line.split(':')[1])
        .filter((dns): dns is string => dns !== undefined && dns !== null && dns.trim() !== '')
        .map(dns => dns.trim());

      return dnsServers.length > 0 ? dnsServers : undefined;
    } catch (error) {
      this.logger.error('Failed to get DNS for interface', {
        interface: interfaceName,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Convert CIDR notation to subnet mask
   */
  private cidrToSubnetMask(cidr: number): string {
    const mask = (0xffffffff << (32 - cidr)) >>> 0;
    return [(mask >>> 24) & 0xff, (mask >>> 16) & 0xff, (mask >>> 8) & 0xff, mask & 0xff].join('.');
  }

  /**
   * Update WiFi configuration (placeholder for future CRUD operations)
   * @param config - New WiFi configuration
   */
  async updateWifiConfig(_config: Partial<WifiConfig>): Promise<WifiConfig> {
    // TODO: Implement WiFi configuration update
    // This would involve:
    // 1. Validating the new configuration
    // 2. Updating the hostapd.conf file
    // 3. Restarting the hostapd service
    // 4. Returning the updated configuration
    throw new Error('WiFi configuration update not yet implemented');
  }
}
