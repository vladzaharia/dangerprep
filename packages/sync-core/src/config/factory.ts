import { ConfigManager, ConfigOptions, z } from '@dangerprep/configuration';

import { SyncConfigSchemas, BaseSyncServiceConfigSchema } from './schemas';

/**
 * Factory for creating standardized sync service configurations
 */
export class SyncConfigFactory {
  /**
   * Create a configuration manager for NFS-based sync services
   */
  static createNFSSyncConfig<T extends z.ZodRawShape>(
    configPath: string,
    additionalFields: T = {} as T,
    options: ConfigOptions = {}
  ) {
    const schema = SyncConfigSchemas.createNFSSyncSchema(additionalFields);

    return new ConfigManager(configPath, schema, {
      enableEnvSubstitution: true,
      enableTransformations: true,
      createDirs: true,
      ...options,
    });
  }

  /**
   * Create a configuration manager for offline/device sync services
   */
  static createOfflineSyncConfig<T extends z.ZodRawShape>(
    configPath: string,
    additionalFields: T = {} as T,
    options: ConfigOptions = {}
  ) {
    const schema = SyncConfigSchemas.createOfflineSyncSchema(additionalFields);

    return new ConfigManager(configPath, schema, {
      enableEnvSubstitution: true,
      enableTransformations: true,
      createDirs: true,
      ...options,
    });
  }

  /**
   * Create a configuration manager for download-based sync services
   */
  static createDownloadSyncConfig<T extends z.ZodRawShape>(
    configPath: string,
    additionalFields: T = {} as T,
    options: ConfigOptions = {}
  ) {
    const schema = SyncConfigSchemas.createDownloadSyncSchema(additionalFields);

    return new ConfigManager(configPath, schema, {
      enableEnvSubstitution: true,
      enableTransformations: true,
      createDirs: true,
      ...options,
    });
  }

  /**
   * Create a generic sync service configuration manager
   */
  static createGenericSyncConfig<T extends z.ZodRawShape>(
    configPath: string,
    customSchema: T,
    options: ConfigOptions = {}
  ) {
    const schema = BaseSyncServiceConfigSchema.extend(customSchema);

    return new ConfigManager(configPath, schema, {
      enableEnvSubstitution: true,
      enableTransformations: true,
      createDirs: true,
      ...options,
    });
  }

  /**
   * Create default configuration values for sync services
   */
  static createSyncDefaults(serviceName: string, customDefaults: Record<string, unknown> = {}) {
    return {
      storage: {
        base_path: '/content',
        temp_directory: '/tmp/sync',
        max_total_size: '1TB',
      },
      performance: {
        max_concurrent_transfers: 3,
        retry_attempts: 3,
        retry_delay: 5000,
        timeout: 300000,
        transfer_chunk_size: '10MB',
        verify_transfers: true,
      },
      logging: {
        level: 'INFO' as const,
        file: `/app/data/logs/${serviceName}.log`,
        max_size: '50MB',
        backup_count: 3,
      },
      notifications: {
        enabled: false,
        events: [],
      },
      content_types: {},
      ...customDefaults,
    };
  }

  /**
   * Create default configuration for NFS sync services
   */
  static createNFSSyncDefaults(customDefaults: Record<string, unknown> = {}) {
    return {
      sync_config: {
        central_nas: {
          host: 'localhost',
          nfs_shares: {},
        },
        local_storage: {
          base_path: '/content',
          temp_directory: '/tmp/nfs-sync',
          max_total_size: '1TB',
        },
        content_types: {},
        performance: {
          max_concurrent_transfers: 3,
          retry_attempts: 3,
          retry_delay: 5000,
          timeout: 300000,
          bandwidth_limit: 'unlimited',
          transfer_chunk_size: '10MB',
          verify_transfers: true,
        },
        logging: {
          level: 'INFO' as const,
          file: '/app/data/logs/nfs-sync.log',
          max_size: '50MB',
          backup_count: 3,
        },
        notifications: {
          enabled: false,
          events: [],
        },
        ...customDefaults,
      },
    };
  }

  /**
   * Create default configuration for offline sync services
   */
  static createOfflineSyncDefaults(customDefaults: Record<string, unknown> = {}) {
    return {
      offline_sync: {
        storage: {
          base_path: '/content',
          temp_directory: '/tmp/offline-sync',
          max_total_size: '2TB',
          mount_base: '/mnt/microsd',
          max_card_size: '2TB',
        },
        device_detection: {
          monitor_device_types: ['mass_storage', 'sd_card'],
          min_device_size: '1GB',
          mount_timeout: 30,
          mount_retry_attempts: 3,
          mount_retry_delay: 5,
        },
        content_types: {},
        sync: {
          max_concurrent_transfers: 3,
          retry_attempts: 3,
          retry_delay: 5000,
          timeout: 300000,
          transfer_chunk_size: '10MB',
          verify_transfers: true,
          delete_after_sync: false,
          create_completion_markers: true,
        },
        logging: {
          level: 'INFO' as const,
          file: '/app/data/logs/offline-sync.log',
          max_size: '50MB',
          backup_count: 3,
        },
        notifications: {
          enabled: false,
          events: [],
        },
        ...customDefaults,
      },
    };
  }

  /**
   * Create default configuration for download sync services
   */
  static createDownloadSyncDefaults(customDefaults: Record<string, unknown> = {}) {
    return {
      kiwix_manager: {
        storage: {
          base_path: '/content',
          temp_directory: '/tmp/kiwix-downloads',
          max_total_size: '100GB',
          zim_directory: '/content/kiwix',
          library_file: '/content/kiwix/library.xml',
        },
        scheduler: {
          update_schedule: '0 6 * * *', // Daily at 6 AM
          cleanup_schedule: '0 2 * * 0', // Weekly on Sunday at 2 AM
          check_interval: 3600, // 1 hour
        },
        download: {
          max_concurrent_transfers: 2,
          retry_attempts: 3,
          retry_delay: 300000, // 5 minutes
          timeout: 1800000, // 30 minutes
          bandwidth_limit: '25MB/s',
          transfer_chunk_size: '10MB',
          verify_transfers: true,
          concurrent_downloads: 2,
        },
        api: {
          base_url: 'https://library.kiwix.org',
          timeout: 30000,
          retry_attempts: 3,
          retry_delay: 1000,
          catalog_url: 'https://library.kiwix.org/catalog/v2/entries',
        },
        zim_files: [],
        logging: {
          level: 'INFO' as const,
          file: '/app/data/logs/kiwix-manager.log',
          max_size: '50MB',
          backup_count: 3,
        },
        ...customDefaults,
      },
    };
  }

  /**
   * Validate and normalize a sync configuration
   */
  static validateSyncConfig<T>(config: T, schema: z.ZodSchema<T>): T {
    try {
      return schema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(', ');
        throw new Error(`Configuration validation failed: ${issues}`);
      }
      throw error;
    }
  }

  /**
   * Merge configuration with defaults
   */
  static mergeWithDefaults<T extends Record<string, unknown>>(config: Partial<T>, defaults: T): T {
    const merged = { ...defaults };

    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          merged[key as keyof T] = {
            ...(defaults[key as keyof T] as Record<string, unknown>),
            ...(value as Record<string, unknown>),
          } as T[keyof T];
        } else {
          merged[key as keyof T] = value as T[keyof T];
        }
      }
    }

    return merged;
  }
}
