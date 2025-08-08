import { z } from '@dangerprep/configuration';

/**
 * Common storage configuration schema
 */
export const StorageConfigSchema = z.object({
  base_path: z.string().describe('Base directory for content storage'),
  temp_directory: z.string().describe('Temporary directory for processing'),
  max_total_size: z.string().describe('Maximum total storage size (e.g., "1TB", "500GB")'),
});

/**
 * Common performance/transfer configuration schema
 */
export const TransferConfigSchema = z.object({
  max_concurrent_transfers: z
    .number()
    .positive()
    .default(3)
    .describe('Maximum concurrent file transfers'),
  retry_attempts: z
    .number()
    .nonnegative()
    .default(3)
    .describe('Number of retry attempts for failed operations'),
  retry_delay: z.number().positive().default(5000).describe('Delay between retry attempts (ms)'),
  timeout: z.number().positive().default(300000).describe('Operation timeout (ms)'),
  bandwidth_limit: z.string().optional().describe('Bandwidth limit (e.g., "25MB/s", "unlimited")'),
  transfer_chunk_size: z.string().default('10MB').describe('Chunk size for file transfers'),
  verify_transfers: z.boolean().default(true).describe('Verify file integrity after transfer'),
});

/**
 * Common logging configuration schema
 */
export const LoggingConfigSchema = z.object({
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO').describe('Log level'),
  file: z.string().optional().describe('Log file path'),
  max_size: z.string().default('50MB').describe('Maximum log file size'),
  backup_count: z.number().positive().default(3).describe('Number of log backup files to keep'),
});

/**
 * Common notification configuration schema
 */
export const NotificationConfigSchema = z
  .object({
    enabled: z.boolean().default(false).describe('Enable notifications'),
    webhook_url: z
      .string()
      .url('Invalid webhook URL')
      .optional()
      .describe('Webhook URL for notifications'),
    events: z.array(z.string()).default([]).describe('Events to notify about'),
  })
  .optional();

/**
 * Common scheduling configuration schema
 */
export const SchedulingConfigSchema = z.object({
  update_schedule: z.string().describe('Cron expression for update schedule'),
  cleanup_schedule: z.string().optional().describe('Cron expression for cleanup schedule'),
  check_interval: z.number().positive().default(30).describe('Check interval in seconds'),
});

/**
 * Content type configuration schema for sync services
 */
export const ContentTypeConfigSchema = z.object({
  local_path: z.string().describe('Local path for this content type'),
  max_size: z.string().describe('Maximum size for this content type'),
  file_extensions: z.array(z.string()).optional().describe('Allowed file extensions'),
  schedule: z.string().optional().describe('Cron schedule for this content type'),
  priority: z.number().optional().describe('Priority for processing (lower = higher priority)'),
  auto_update: z.boolean().default(true).describe('Enable automatic updates'),
});

/**
 * Filter rule schema for content filtering
 */
export const FilterRuleSchema = z.object({
  type: z.string().describe('Filter type (e.g., "size", "date", "name")'),
  operator: z
    .enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'regex'])
    .describe('Filter operator'),
  value: z.union([z.string(), z.number()]).describe('Filter value'),
});

/**
 * Priority rule schema for content prioritization
 */
export const PriorityRuleSchema = z.object({
  type: z.string().describe('Priority rule type'),
  weight: z.number().describe('Priority weight (higher = more important)'),
});

/**
 * Standardized service configuration schema
 */
export const StandardizedServiceConfigSchema = z.object({
  service_name: z.string().describe('Service name'),
  version: z.string().describe('Service version'),
  enabled: z.boolean().default(true).describe('Whether the service is enabled'),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info').describe('Logging level'),
  data_directory: z.string().describe('Data directory path'),
  temp_directory: z.string().optional().describe('Temporary directory path'),
  max_concurrent_operations: z
    .number()
    .min(1)
    .max(20)
    .default(5)
    .describe('Maximum concurrent operations'),
  operation_timeout_minutes: z
    .number()
    .min(1)
    .max(120)
    .default(30)
    .describe('Operation timeout in minutes'),
  health_check_interval_minutes: z
    .number()
    .min(1)
    .max(60)
    .default(5)
    .describe('Health check interval in minutes'),
  enable_notifications: z.boolean().default(true).describe('Enable notifications'),
  enable_progress_tracking: z.boolean().default(true).describe('Enable progress tracking'),
  enable_auto_recovery: z.boolean().default(true).describe('Enable automatic error recovery'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Additional metadata'),
});

/**
 * Base sync service configuration schema
 */
export const BaseSyncServiceConfigSchema = StandardizedServiceConfigSchema.extend({
  storage: StorageConfigSchema,
  performance: TransferConfigSchema,
  logging: LoggingConfigSchema,
  notifications: NotificationConfigSchema,
  scheduling: SchedulingConfigSchema.optional(),
  content_types: z
    .record(z.string(), ContentTypeConfigSchema)
    .describe('Content type configurations'),
});

/**
 * Extended content type schema with additional sync-specific fields
 */
export const ExtendedContentTypeConfigSchema = ContentTypeConfigSchema.extend({
  sync_type: z
    .enum(['full_sync', 'metadata_filtered', 'folder_filtered', 'incremental'])
    .default('full_sync'),
  filters: z.array(FilterRuleSchema).optional().describe('Content filters'),
  priority_rules: z.array(PriorityRuleSchema).optional().describe('Priority rules'),
  include_folders: z.array(z.string()).optional().describe('Specific folders to include'),
  exclude_patterns: z.array(z.string()).optional().describe('Patterns to exclude'),
});

/**
 * Network/API configuration schema
 */
export const NetworkConfigSchema = z.object({
  base_url: z.string().url('Invalid base URL').describe('Base API URL'),
  timeout: z.number().positive().default(30000).describe('Request timeout (ms)'),
  retry_attempts: z.number().nonnegative().default(3).describe('Number of retry attempts'),
  retry_delay: z.number().positive().default(1000).describe('Delay between retries (ms)'),
  headers: z.record(z.string(), z.string()).optional().describe('Custom headers'),
});

/**
 * Device detection configuration schema (for offline sync)
 */
export const DeviceDetectionConfigSchema = z.object({
  monitor_device_types: z
    .array(z.string())
    .default(['mass_storage', 'sd_card'])
    .describe('Device types to monitor'),
  min_device_size: z.string().default('1GB').describe('Minimum device size to consider'),
  mount_timeout: z.number().positive().default(30).describe('Mount timeout in seconds'),
  mount_retry_attempts: z.number().nonnegative().default(3).describe('Mount retry attempts'),
  mount_retry_delay: z
    .number()
    .positive()
    .default(5)
    .describe('Delay between mount retries (seconds)'),
});

/**
 * Mirror configuration schema (for download services)
 */
export const MirrorConfigSchema = z.object({
  preferred: z.string().url('Invalid preferred mirror URL').describe('Preferred mirror URL'),
  available: z.array(z.string().url('Invalid mirror URL')).describe('Available mirror URLs'),
  fallback: z.string().url('Invalid fallback mirror URL').describe('Fallback mirror URL'),
  speed_test: z
    .object({
      enabled: z.boolean().default(true).describe('Enable speed testing'),
      test_timeout: z.number().positive().default(30).describe('Speed test timeout (seconds)'),
      test_size_limit: z.string().default('10MB').describe('Speed test size limit'),
      cache_duration: z
        .number()
        .positive()
        .default(86400)
        .describe('Cache duration for speed test results (seconds)'),
    })
    .optional(),
});

/**
 * Sync direction schema
 */
export const SyncDirectionSchema = z.enum([
  'bidirectional',
  'to_destination',
  'from_source',
  'to_card',
  'from_card',
]);

/**
 * Factory functions for creating service-specific schemas
 */
export class SyncConfigSchemas {
  /**
   * Create a schema for NFS-based sync services
   */
  static createNFSSyncSchema<T extends z.ZodRawShape>(additionalFields: T = {} as T) {
    return z.object({
      sync_config: z.object({
        central_nas: z.object({
          host: z.string().describe('NFS server hostname or IP'),
          nfs_shares: z.record(z.string(), z.string()).describe('NFS share mappings'),
        }),
        plex: z
          .object({
            server: z.string().describe('Plex server address'),
            token: z.string().describe('Plex authentication token'),
          })
          .optional(),
        local_storage: StorageConfigSchema,
        content_types: z.record(
          z.string(),
          ExtendedContentTypeConfigSchema.extend({
            nfs_path: z.string().optional().describe('NFS path for this content type'),
            max_episodes_per_show: z.number().optional().describe('Maximum episodes per TV show'),
          })
        ),
        performance: TransferConfigSchema,
        logging: LoggingConfigSchema,
        notifications: NotificationConfigSchema,
        ...additionalFields,
      }),
    });
  }

  /**
   * Create a schema for offline/device sync services
   */
  static createOfflineSyncSchema<T extends z.ZodRawShape>(additionalFields: T = {} as T) {
    return z.object({
      offline_sync: z.object({
        storage: StorageConfigSchema.extend({
          mount_base: z.string().describe('Base directory for mounting devices'),
          max_card_size: z.string().describe('Maximum card size to handle'),
        }),
        device_detection: DeviceDetectionConfigSchema,
        content_types: z.record(
          z.string(),
          ContentTypeConfigSchema.extend({
            card_path: z.string().describe('Path on the card for this content type'),
            sync_direction: SyncDirectionSchema.describe('Sync direction'),
          })
        ),
        sync: TransferConfigSchema.extend({
          delete_after_sync: z.boolean().default(false).describe('Delete source files after sync'),
          create_completion_markers: z
            .boolean()
            .default(true)
            .describe('Create completion marker files'),
        }),
        logging: LoggingConfigSchema,
        notifications: NotificationConfigSchema,
        ...additionalFields,
      }),
    });
  }

  /**
   * Create a schema for download-based sync services (like Kiwix)
   */
  static createDownloadSyncSchema<T extends z.ZodRawShape>(additionalFields: T = {} as T) {
    return z.object({
      kiwix_manager: z.object({
        storage: StorageConfigSchema.extend({
          zim_directory: z.string().describe('Directory for ZIM files'),
          library_file: z.string().describe('Library XML file path'),
        }),
        scheduler: SchedulingConfigSchema,
        download: TransferConfigSchema.extend({
          concurrent_downloads: z.number().positive().default(2).describe('Concurrent downloads'),
        }),
        api: NetworkConfigSchema.extend({
          catalog_url: z.string().url().describe('Catalog API URL'),
        }),
        mirrors: MirrorConfigSchema.optional(),
        zim_files: z
          .array(
            z.object({
              name: z.string().describe('ZIM file name'),
              priority: z.number().describe('Download priority'),
              auto_update: z.boolean().default(true).describe('Enable automatic updates'),
            })
          )
          .optional(),
        logging: LoggingConfigSchema,
        ...additionalFields,
      }),
    });
  }
}
