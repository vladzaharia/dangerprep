import { z } from '@dangerprep/configuration';
import { StandardizedServiceConfig } from '@dangerprep/sync';

// Service-specific configuration schema
const KiwixServiceConfigSchema = z.object({
  kiwix_manager: z.object({
    storage: z.object({
      zim_directory: z.string().describe('Directory to store ZIM files'),
      library_file: z.string().describe('Path to Kiwix library file'),
      temp_directory: z.string().describe('Temporary directory for downloads'),
      max_total_size: z.string().describe('Maximum total size for ZIM files'),
    }),
    scheduler: z.object({
      update_schedule: z.string().describe('Cron schedule for updates'),
      cleanup_schedule: z.string().describe('Cron schedule for cleanup'),
    }),
    download: z.object({
      concurrent_downloads: z.number().positive().describe('Number of concurrent downloads'),
      retry_attempts: z.number().nonnegative().describe('Number of retry attempts'),
      retry_delay: z.number().positive().describe('Delay between retries (ms)'),
      bandwidth_limit: z.string().describe('Bandwidth limit for downloads'),
    }),
    logging: z.object({
      level: z.string().describe('Logging level'),
      file: z.string().describe('Log file path'),
      max_size: z.string().describe('Maximum log file size'),
      backup_count: z.number().positive().describe('Number of backup log files'),
    }),
    api: z.object({
      base_url: z.string().url('Invalid base URL').describe('Base API URL'),
      catalog_url: z.string().url('Invalid catalog URL').describe('Catalog API URL'),
      timeout: z.number().positive().describe('API timeout (ms)'),
    }),
  }),
});

// Create standardized configuration schema by merging with base schema
export const KiwixConfigSchema = z
  .object({
    service_name: z.string().default('kiwix-sync'),
    version: z.string().default('1.0.0'),
    enabled: z.boolean().default(true),
    log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    data_directory: z.string().default('/app/data'),
    temp_directory: z.string().default('/tmp'),
    max_concurrent_operations: z.number().min(1).max(20).default(5),
    operation_timeout_minutes: z.number().min(1).max(120).default(30),
    health_check_interval_minutes: z.number().min(1).max(60).default(5),
    enable_notifications: z.boolean().default(true),
    enable_progress_tracking: z.boolean().default(true),
    enable_auto_recovery: z.boolean().default(true),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .merge(KiwixServiceConfigSchema);

// TypeScript type - intersection of standardized config and service-specific config
export type KiwixConfig = StandardizedServiceConfig & z.infer<typeof KiwixServiceConfigSchema>;

export interface ZimPackage {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly size: string;
  readonly date: string;
  readonly url?: string;
  readonly path?: string;
  readonly version?: string;
}

// Download status types with const assertion
export const DOWNLOAD_STATUSES = ['downloading', 'completed', 'failed', 'paused'] as const;
export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];

export interface DownloadProgress {
  readonly packageName: string;
  readonly progress: number;
  readonly speed: string;
  readonly eta: string;
  readonly status: DownloadStatus;
}

export interface LibraryEntry {
  readonly id: string;
  readonly path: string;
  readonly url: string;
  readonly title: string;
  readonly description: string;
  readonly language: string;
  readonly creator: string;
  readonly publisher: string;
  readonly date: string;
  readonly tags: string;
  readonly articleCount: number;
  readonly mediaCount: number;
  readonly size: number;
}

// Define sync types locally for Kiwix service
export const KIWIX_SYNC_TYPES = [
  'full_sync',
  'metadata_filtered',
  'folder_filtered',
  'kiwix_updater',
] as const;
export type SyncType = (typeof KIWIX_SYNC_TYPES)[number];

// Type guards for runtime validation
export const isSyncType = (value: string): value is SyncType =>
  KIWIX_SYNC_TYPES.includes(value as SyncType);

export const isDownloadStatus = (value: string): value is DownloadStatus =>
  DOWNLOAD_STATUSES.includes(value as DownloadStatus);
