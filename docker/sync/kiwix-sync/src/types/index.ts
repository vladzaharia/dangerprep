import { z } from '@dangerprep/shared/config';

// Zod schema for KiwixConfig
export const KiwixConfigSchema = z.object({
  kiwix_manager: z.object({
    storage: z.object({
      zim_directory: z.string(),
      library_file: z.string(),
      temp_directory: z.string(),
      max_total_size: z.string(),
    }),
    scheduler: z.object({
      update_schedule: z.string(),
      cleanup_schedule: z.string(),
    }),
    download: z.object({
      concurrent_downloads: z.number().positive(),
      retry_attempts: z.number().nonnegative(),
      retry_delay: z.number().positive(),
      bandwidth_limit: z.string(),
    }),
    logging: z.object({
      level: z.string(),
      file: z.string(),
      max_size: z.string(),
      backup_count: z.number().positive(),
    }),
    api: z.object({
      base_url: z.string().url(),
      catalog_url: z.string().url(),
      timeout: z.number().positive(),
    }),
  }),
});

// TypeScript type inferred from Zod schema
export type KiwixConfig = z.infer<typeof KiwixConfigSchema>;

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
