import * as path from 'path';

import * as fs from 'fs-extra';
import * as yaml from 'js-yaml';

import { OfflineSyncConfig } from './types';

export class ConfigManager {
  private config: OfflineSyncConfig | null = null;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
  }

  /**
   * Load configuration from file
   */
  public async loadConfig(): Promise<OfflineSyncConfig> {
    try {
      if (!(await fs.pathExists(this.configPath))) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const configContent = await fs.readFile(this.configPath, 'utf8');
      const parsedConfig = yaml.load(configContent) as OfflineSyncConfig;

      // Validate configuration
      this.validateConfig(parsedConfig);

      this.config = parsedConfig;
      this.log(`Configuration loaded from: ${this.configPath}`);

      return parsedConfig;
    } catch (error) {
      this.logError('Failed to load configuration', error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): OfflineSyncConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Reload configuration from file
   */
  public async reloadConfig(): Promise<OfflineSyncConfig> {
    this.config = null;
    return await this.loadConfig();
  }

  /**
   * Save configuration to file
   */
  public async saveConfig(config: OfflineSyncConfig): Promise<void> {
    try {
      this.validateConfig(config);

      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
      });

      await fs.ensureDir(path.dirname(this.configPath));
      await fs.writeFile(this.configPath, yamlContent, 'utf8');

      this.config = config;
      this.log(`Configuration saved to: ${this.configPath}`);
    } catch (error) {
      this.logError('Failed to save configuration', error);
      throw error;
    }
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

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    // Default to data directory
    return '/app/data/config.yaml';
  }

  /**
   * Validate configuration structure
   */
  private validateConfig(config: unknown): asserts config is OfflineSyncConfig {
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration must be an object');
    }

    const typedConfig = config as Record<string, unknown>;

    if (!typedConfig.offline_sync || typeof typedConfig.offline_sync !== 'object') {
      throw new Error('Configuration must have offline_sync section');
    }

    const offlineSync = typedConfig.offline_sync as Record<string, unknown>;

    // Validate required sections
    const requiredSections = ['storage', 'device_detection', 'content_types', 'sync', 'logging'];
    for (const section of requiredSections) {
      if (!offlineSync[section] || typeof offlineSync[section] !== 'object') {
        throw new Error(`Configuration missing required section: ${section}`);
      }
    }

    // Validate storage section
    const storage = offlineSync.storage as Record<string, unknown>;
    const requiredStorageFields = ['content_directory', 'mount_base', 'temp_directory'];
    for (const field of requiredStorageFields) {
      if (!storage[field] || typeof storage[field] !== 'string') {
        throw new Error(`Storage section missing required field: ${field}`);
      }
    }

    // Validate device_detection section
    const deviceDetection = offlineSync.device_detection as Record<string, unknown>;
    if (!Array.isArray(deviceDetection.monitor_device_types)) {
      throw new Error('device_detection.monitor_device_types must be an array');
    }

    // Validate content_types section
    const contentTypes = offlineSync.content_types as Record<string, unknown>;
    if (Object.keys(contentTypes).length === 0) {
      throw new Error('At least one content type must be configured');
    }

    for (const [contentType, contentConfig] of Object.entries(contentTypes)) {
      if (!contentConfig || typeof contentConfig !== 'object') {
        throw new Error(`Invalid configuration for content type: ${contentType}`);
      }

      const config = contentConfig as Record<string, unknown>;
      const requiredFields = ['local_path', 'card_path', 'sync_direction', 'file_extensions'];

      for (const field of requiredFields) {
        if (!config[field]) {
          throw new Error(`Content type ${contentType} missing required field: ${field}`);
        }
      }

      if (!Array.isArray(config.file_extensions)) {
        throw new Error(`Content type ${contentType} file_extensions must be an array`);
      }

      const validDirections = ['bidirectional', 'to_card', 'from_card'];
      if (!validDirections.includes(config.sync_direction as string)) {
        throw new Error(
          `Content type ${contentType} has invalid sync_direction: ${config.sync_direction}`
        );
      }
    }

    // Validate sync section
    const sync = offlineSync.sync as Record<string, unknown>;
    const requiredSyncFields = ['check_interval', 'max_concurrent_transfers'];
    for (const field of requiredSyncFields) {
      if (typeof sync[field] !== 'number') {
        throw new Error(`Sync section field ${field} must be a number`);
      }
    }

    // Validate logging section
    const logging = offlineSync.logging as Record<string, unknown>;
    const requiredLoggingFields = ['level', 'file'];
    for (const field of requiredLoggingFields) {
      if (!logging[field] || typeof logging[field] !== 'string') {
        throw new Error(`Logging section missing required field: ${field}`);
      }
    }

    const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (!validLogLevels.includes(logging.level as string)) {
      throw new Error(`Invalid log level: ${logging.level}`);
    }
  }

  /**
   * Get configuration value by path
   */
  public getConfigValue<T>(path: string): T | undefined {
    if (!this.config) {
      return undefined;
    }

    const parts = path.split('.');
    let current: unknown = this.config;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current as T;
  }

  /**
   * Set configuration value by path
   */
  public setConfigValue(path: string, value: unknown): void {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const parts = path.split('.');
    const lastPart = parts.pop();

    if (!lastPart) {
      throw new Error('Invalid configuration path');
    }

    let current: Record<string, unknown> = this.config as unknown as Record<string, unknown>;

    for (const part of parts) {
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[lastPart] = value;
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

    await this.saveConfig(defaultConfig);
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    console.log(`[ConfigManager] ${new Date().toISOString()} - ${message}`);
  }

  /**
   * Log an error
   */
  private logError(message: string, error: unknown): void {
    console.error(`[ConfigManager] ${new Date().toISOString()} - ${message}:`, error);
  }
}
