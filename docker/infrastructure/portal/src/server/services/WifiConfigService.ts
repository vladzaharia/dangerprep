import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

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

    let ssid: string;
    let password: string;
    let source: 'hostapd' | 'environment' | 'default';

    if (hostapdConfig.ssid && hostapdConfig.password) {
      // Both values from hostapd
      ssid = hostapdConfig.ssid;
      password = hostapdConfig.password;
      source = 'hostapd';
    } else if (process.env.WIFI_SSID || process.env.WIFI_PASSWORD) {
      // At least one value from environment
      ssid = hostapdConfig.ssid || process.env.WIFI_SSID || 'DangerPrep';
      password = hostapdConfig.password || process.env.WIFI_PASSWORD || 'change_me';
      source = 'environment';
    } else {
      // Using defaults
      ssid = hostapdConfig.ssid || 'DangerPrep';
      password = hostapdConfig.password || 'change_me';
      source = 'default';
    }

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
      if (ssidMatch) {
        config.ssid = ssidMatch[1].trim();
      }

      // Parse password
      const passwordMatch = hostapdContent.match(/^wpa_passphrase=(.+)$/m);
      if (passwordMatch) {
        config.password = passwordMatch[1].trim();
      }

      return config;
    } catch (error) {
      // Silently handle missing hostapd configuration - this is expected in development
      if (error instanceof Error && error.message.includes('ENOENT')) {
        // File doesn't exist, which is normal in development environments
        return {};
      }
      // Log other errors that might indicate real issues
      console.warn('Could not read hostapd configuration:', error);
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
        console.warn('No active WiFi interface found');
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
      console.error('Failed to get network information:', error);
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
      console.error('Failed to get active WiFi interface:', error);
      return undefined;
    }
  }

  /**
   * Get IP address and subnet mask for an interface
   */
  private async getInterfaceIpInfo(interfaceName: string): Promise<{ ipAddress: string; subnetMask: string } | undefined> {
    try {
      const { stdout } = await execAsync(`nmcli -t -f IP4.ADDRESS dev show "${interfaceName}"`);
      const addressLine = stdout.trim();

      if (addressLine && addressLine.includes(':')) {
        const address = addressLine.split(':')[1];
        if (address && address.includes('/')) {
          const [ipAddress, cidr] = address.split('/');
          const subnetMask = this.cidrToSubnetMask(parseInt(cidr, 10));
          return { ipAddress, subnetMask };
        }
      }

      return undefined;
    } catch (error) {
      console.error(`Failed to get IP info for interface ${interfaceName}:`, error);
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
      console.error(`Failed to get gateway for interface ${interfaceName}:`, error);
      return undefined;
    }
  }

  /**
   * Get DNS servers for an interface
   */
  private async getInterfaceDns(interfaceName: string): Promise<string[] | undefined> {
    try {
      const { stdout } = await execAsync(`nmcli -t -f IP4.DNS dev show "${interfaceName}"`);
      const dnsLines = stdout.trim().split('\n').filter(line => line.includes(':'));

      const dnsServers = dnsLines
        .map(line => line.split(':')[1])
        .filter(dns => dns && dns.trim())
        .map(dns => dns.trim());

      return dnsServers.length > 0 ? dnsServers : undefined;
    } catch (error) {
      console.error(`Failed to get DNS for interface ${interfaceName}:`, error);
      return undefined;
    }
  }

  /**
   * Convert CIDR notation to subnet mask
   */
  private cidrToSubnetMask(cidr: number): string {
    const mask = (0xffffffff << (32 - cidr)) >>> 0;
    return [
      (mask >>> 24) & 0xff,
      (mask >>> 16) & 0xff,
      (mask >>> 8) & 0xff,
      mask & 0xff,
    ].join('.');
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

