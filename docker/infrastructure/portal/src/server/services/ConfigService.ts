import { LoggerFactory, LogLevel } from '../../../../../../packages/logging/dist/index';

/**
 * Application configuration data - only app-level settings
 * Service-specific configuration is handled by ServiceDiscoveryService
 * WiFi configuration is handled by WifiConfigService
 */
export interface AppConfig {
  app: {
    title: string;
    description: string;
  };
  global: {
    baseDomain: string;
    kioskMode: boolean;
  };
  metadata: {
    lastUpdated: string;
    nodeEnv: string;
  };
}

/**
 * Service for managing application configuration
 * Reads from environment variables
 */
export class ConfigService {
  private logger = LoggerFactory.createStructuredLogger(
    'ConfigService',
    '/var/log/dangerprep/portal.log',
    process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
  );

  /**
   * Get environment variable with fallback
   */
  private getEnvVar(key: string, fallback: string): string {
    const value = process.env[key] || fallback;
    this.logger.debug('Environment variable', {
      key,
      value: value === fallback ? `using fallback '${fallback}'` : `found '${value}'`,
    });
    return value;
  }

  /**
   * Get application configuration - only app-level settings
   */
  getAppConfig(): AppConfig {
    this.logger.debug('Building application configuration');

    const config = {
      app: {
        title: this.getEnvVar('VITE_APP_TITLE', 'DangerPrep Portal'),
        description: this.getEnvVar('VITE_APP_DESCRIPTION', 'Your portable hotspot services portal'),
      },
      global: {
        baseDomain: this.getEnvVar('BASE_DOMAIN', 'danger.diy'),
        kioskMode: this.getEnvVar('KIOSK_MODE', 'false').toLowerCase() === 'true',
      },
      metadata: {
        lastUpdated: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV || 'production',
      },
    };

    this.logger.debug('Application configuration built', config);
    return config;
  }

  /**
   * Update application configuration (placeholder for future CRUD operations)
   */
  async updateAppConfig(_config: Partial<AppConfig>): Promise<AppConfig> {
    this.logger.warn('updateAppConfig called (not implemented)');
    this.logger.debug('Attempted config update', _config);
    // TODO: Implement configuration update
    // This would involve updating environment variables or a config file
    throw new Error('Application configuration update not yet implemented');
  }
}

