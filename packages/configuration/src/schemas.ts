/**
 * Standard configuration schemas for common service components
 */

import { z } from 'zod';

import { ConfigUtils, SIZE, TIME } from './utils.js';

/**
 * Standard storage configuration schema
 */
export const StorageConfigSchema = z.object({
  /** Base directory for content storage */
  base_path: z.string().min(1),
  /** Temporary directory for operations */
  temp_directory: z.string().min(1),
  /** Maximum total storage size */
  max_total_size: ConfigUtils.sizeTransformer().optional(),
  /** Whether to create directories if they don't exist */
  create_directories: z.boolean().default(true),
  /** File permissions for created directories */
  directory_permissions: z
    .string()
    .regex(/^[0-7]{3,4}$/)
    .default('755'),
  /** File permissions for created files */
  file_permissions: z
    .string()
    .regex(/^[0-7]{3,4}$/)
    .default('644'),
});

/**
 * Standard logging configuration schema
 */
export const LoggingConfigSchema = z.object({
  /** Log level */
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
  /** Log file path (optional for console-only logging) */
  file: z.string().optional(),
  /** Maximum log file size before rotation */
  max_size: ConfigUtils.sizeTransformer().default(50 * SIZE.MB),
  /** Number of backup files to keep */
  backup_count: z.number().int().min(0).default(3),
  /** Log format */
  format: z.enum(['json', 'text']).default('text'),
  /** Whether to include timestamps */
  include_timestamp: z.boolean().default(true),
  /** Whether to include log level in output */
  include_level: z.boolean().default(true),
  /** Whether to include component name in output */
  include_component: z.boolean().default(true),
});

/**
 * Standard scheduling configuration schema
 */
export const SchedulingConfigSchema = z.object({
  /** Cron expression for scheduling */
  schedule: ConfigUtils.cronValidator(),
  /** Whether the scheduled task is enabled */
  enabled: z.boolean().default(true),
  /** Timezone for schedule interpretation */
  timezone: z.string().default('UTC'),
  /** Maximum execution time before timeout */
  timeout: ConfigUtils.durationTransformer().default(1 * TIME.HOUR),
  /** Whether to run immediately on startup */
  run_on_startup: z.boolean().default(false),
});

/**
 * Standard network/API configuration schema
 */
export const NetworkConfigSchema = z.object({
  /** Request timeout */
  timeout: ConfigUtils.durationTransformer().default(30 * TIME.SECOND),
  /** Number of retry attempts */
  retry_attempts: z.number().int().min(0).default(3),
  /** Delay between retry attempts */
  retry_delay: ConfigUtils.durationTransformer().default(1 * TIME.SECOND),
  /** Maximum retry delay (for exponential backoff) */
  max_retry_delay: ConfigUtils.durationTransformer().default(30 * TIME.SECOND),
  /** User agent string */
  user_agent: z.string().optional(),
  /** Custom headers */
  headers: z.record(z.string(), z.string()).default({}),
});

/**
 * Standard performance configuration schema
 */
export const PerformanceConfigSchema = z.object({
  /** Maximum number of concurrent operations */
  max_concurrent: z.number().int().min(1).default(3),
  /** Chunk size for file operations */
  chunk_size: ConfigUtils.sizeTransformer().default(10 * SIZE.MB),
  /** Buffer size for streaming operations */
  buffer_size: ConfigUtils.sizeTransformer().default(64 * SIZE.KB),
  /** Memory limit for operations */
  memory_limit: ConfigUtils.sizeTransformer().optional(),
  /** CPU limit (percentage) */
  cpu_limit: z.number().min(0).max(100).optional(),
});

/**
 * Standard health check configuration schema
 */
export const HealthCheckConfigSchema = z.object({
  /** Whether health checks are enabled */
  enabled: z.boolean().default(true),
  /** Health check interval */
  interval: ConfigUtils.durationTransformer().default(5 * TIME.MINUTE),
  /** Health check timeout */
  timeout: ConfigUtils.durationTransformer().default(10 * TIME.SECOND),
  /** Endpoint for external health checks */
  endpoint: z.string().optional(),
  /** Port for health check server */
  port: z.number().int().min(1).max(65535).optional(),
});

/**
 * Standard notification configuration schema
 */
export const NotificationConfigSchema = z.object({
  /** Whether notifications are enabled */
  enabled: z.boolean().default(true),
  /** Notification levels to send */
  levels: z.array(z.enum(['INFO', 'WARN', 'ERROR', 'CRITICAL'])).default(['ERROR', 'CRITICAL']),
  /** Notification channels */
  channels: z.array(z.enum(['console', 'file', 'webhook', 'email'])).default(['console']),
  /** Webhook URL for notifications */
  webhook_url: z.string().url().optional(),
  /** Email configuration */
  email: z
    .object({
      smtp_host: z.string(),
      smtp_port: z.number().int().min(1).max(65535).default(587),
      username: z.string(),
      password: z.string(),
      from: z.string().email(),
      to: z.array(z.string().email()),
    })
    .optional(),
  /** Rate limiting for notifications */
  rate_limit: z
    .object({
      max_per_minute: z.number().int().min(1).default(10),
      max_per_hour: z.number().int().min(1).default(100),
    })
    .default({
      max_per_minute: 10,
      max_per_hour: 100,
    }),
});

/**
 * Standard content type configuration schema
 */
export const ContentTypeConfigSchema = z.object({
  /** Local storage path */
  local_path: z.string().min(1),
  /** Remote or target path */
  remote_path: z.string().min(1),
  /** Sync direction */
  sync_direction: z.enum(['bidirectional', 'to_remote', 'from_remote']).default('bidirectional'),
  /** Maximum size for this content type */
  max_size: ConfigUtils.sizeTransformer().optional(),
  /** Allowed file extensions */
  file_extensions: ConfigUtils.extensionsTransformer().default([]),
  /** Excluded patterns (glob patterns) */
  exclude_patterns: z.array(z.string()).default([]),
  /** Whether to verify file integrity */
  verify_integrity: z.boolean().default(true),
  /** Whether to compress files */
  compress: z.boolean().default(false),
  /** Priority for sync operations */
  priority: z.number().int().min(1).max(10).default(5),
});

/**
 * Standard service metadata schema
 */
export const ServiceMetadataSchema = z.object({
  /** Service name */
  name: z.string().min(1),
  /** Service version */
  version: z.string().min(1),
  /** Service description */
  description: z.string().optional(),
  /** Service author */
  author: z.string().optional(),
  /** Service license */
  license: z.string().optional(),
  /** Service homepage */
  homepage: z.string().url().optional(),
  /** Service repository */
  repository: z.string().url().optional(),
});

/**
 * Standard environment configuration schema
 */
export const EnvironmentConfigSchema = z.object({
  /** Environment name */
  environment: z.enum(['development', 'staging', 'production']).default('production'),
  /** Debug mode */
  debug: z.boolean().default(false),
  /** Verbose logging */
  verbose: z.boolean().default(false),
  /** Dry run mode */
  dry_run: z.boolean().default(false),
  /** Configuration file path */
  config_path: z.string().optional(),
  /** Data directory */
  data_directory: z.string().default('./data'),
  /** Process ID file */
  pid_file: z.string().optional(),
});

/**
 * Utility functions for creating composite schemas
 */
export class StandardSchemas {
  /**
   * Create a base service configuration schema
   * @param additionalFields Additional schema fields
   * @returns Combined schema with standard service fields
   */
  static createServiceSchema<T extends z.ZodRawShape>(additionalFields: T) {
    return z.object({
      metadata: ServiceMetadataSchema.optional(),
      environment: EnvironmentConfigSchema.optional(),
      logging: LoggingConfigSchema.optional(),
      health_check: HealthCheckConfigSchema.optional(),
      notifications: NotificationConfigSchema.optional(),
      ...additionalFields,
    });
  }

  /**
   * Create a storage service schema with standard storage configuration
   * @param additionalFields Additional schema fields
   * @returns Combined schema with storage fields
   */
  static createStorageServiceSchema<T extends z.ZodRawShape>(additionalFields: T) {
    return StandardSchemas.createServiceSchema({
      storage: StorageConfigSchema,
      performance: PerformanceConfigSchema.optional(),
      ...additionalFields,
    });
  }

  /**
   * Create a sync service schema with standard sync configuration
   * @param additionalFields Additional schema fields
   * @returns Combined schema with sync fields
   */
  static createSyncServiceSchema<T extends z.ZodRawShape>(additionalFields: T) {
    return StandardSchemas.createStorageServiceSchema({
      content_types: z.record(z.string(), ContentTypeConfigSchema),
      scheduling: SchedulingConfigSchema.optional(),
      ...additionalFields,
    });
  }

  /**
   * Create a network service schema with standard network configuration
   * @param additionalFields Additional schema fields
   * @returns Combined schema with network fields
   */
  static createNetworkServiceSchema<T extends z.ZodRawShape>(additionalFields: T) {
    return StandardSchemas.createServiceSchema({
      network: NetworkConfigSchema,
      performance: PerformanceConfigSchema.optional(),
      ...additionalFields,
    });
  }

  /**
   * Create a scheduled service schema with standard scheduling configuration
   * @param additionalFields Additional schema fields
   * @returns Combined schema with scheduling fields
   */
  static createScheduledServiceSchema<T extends z.ZodRawShape>(additionalFields: T) {
    return StandardSchemas.createServiceSchema({
      scheduling: SchedulingConfigSchema,
      ...additionalFields,
    });
  }
}

// Individual schemas are already exported above
