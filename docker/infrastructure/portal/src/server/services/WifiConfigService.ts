import { readFileSync } from 'fs';

/**
 * WiFi configuration data
 */
export interface WifiConfig {
  ssid: string;
  password: string;
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

