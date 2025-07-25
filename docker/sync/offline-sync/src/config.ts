import { ConfigManager as SharedConfigManager } from '@dangerprep/configuration';
import { Logger, LoggerFactory } from '@dangerprep/logging';

import { OfflineSyncConfig, OfflineSyncConfigSchema } from './types';

export class ConfigManager {
  private sharedConfigManager: SharedConfigManager<OfflineSyncConfig>;
  private logger: Logger;

  constructor(configPath?: string) {
    const finalConfigPath = configPath || this.getDefaultConfigPath();
    this.logger = LoggerFactory.createConsoleLogger('ConfigManager');
    this.sharedConfigManager = new SharedConfigManager(finalConfigPath, OfflineSyncConfigSchema, {
      logger: this.logger,
    });
  }

  /**
   * Load configuration from file
   */
  public async loadConfig(): Promise<OfflineSyncConfig> {
    return this.sharedConfigManager.loadConfig();
  }

  /**
   * Get current configuration
   */
  public getConfig(): OfflineSyncConfig {
    return this.sharedConfigManager.getConfig();
  }

  /**
   * Reload configuration from file
   */
  public async reloadConfig(): Promise<OfflineSyncConfig> {
    return this.sharedConfigManager.reloadConfig();
  }

  /**
   * Save configuration to file
   */
  public async saveConfig(config: OfflineSyncConfig): Promise<void> {
    return this.sharedConfigManager.saveConfig(config);
  }

  /**
   * Get default configuration path
   */
  private getDefaultConfigPath(): string {
    // Check for config file in various locations
    const possiblePaths = [
      '/app/data/config.yaml',
      '/app/config.yaml',
      './config.yaml',
      './config.yaml.example',
    ];

    // Use synchronous fs for this check since it's in constructor
    const fs = require('fs');
    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    // Default to data directory
    return '/app/data/config.yaml';
  }

  /**
   * Check if configuration file exists
   */
  public async configExists(): Promise<boolean> {
    return this.sharedConfigManager.configExists();
  }

  /**
   * Get configuration value by path
   */
  public getConfigValue<T>(path: string): T | undefined {
    return this.sharedConfigManager.getConfigValue<T>(path);
  }

  /**
   * Set configuration value by path
   */
  public setConfigValue(path: string, value: unknown): void {
    return this.sharedConfigManager.setConfigValue(path, value);
  }

  /**
   * Create default configuration file
   */
  public async createDefaultConfig(): Promise<void> {
    const defaultConfig: OfflineSyncConfig = {
      offline_sync: {
        storage: {
          content_directory: '/content',
          mount_base: '/mnt/microsd',
          temp_directory: '/tmp/offline-sync',
          max_card_size: '2TB',
        },
        device_detection: {
          monitor_device_types: ['mass_storage', 'sd_card'],
          min_device_size: '1GB',
          mount_timeout: 30,
          mount_retry_attempts: 3,
          mount_retry_delay: 5,
        },
        content_types: {
          movies: {
            local_path: '/content/movies',
            card_path: 'movies',
            sync_direction: 'bidirectional',
            max_size: '800GB',
            file_extensions: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'],
          },
          books: {
            local_path: '/content/books',
            card_path: 'books',
            sync_direction: 'bidirectional',
            max_size: '20GB',
            file_extensions: ['.epub', '.pdf', '.mobi', '.azw', '.azw3', '.fb2', '.txt'],
          },
        },
        sync: {
          check_interval: 30,
          max_concurrent_transfers: 3,
          transfer_chunk_size: '10MB',
          verify_transfers: true,
          delete_after_sync: false,
          create_completion_markers: true,
        },
        logging: {
          level: 'INFO',
          file: '/app/data/logs/offline-sync.log',
          max_size: '50MB',
          backup_count: 3,
        },
        notifications: {
          enabled: false,
          events: ['card_inserted', 'card_removed', 'sync_completed', 'sync_failed'],
        },
      },
    };

    return this.sharedConfigManager.createDefaultConfig(defaultConfig);
  }
}
