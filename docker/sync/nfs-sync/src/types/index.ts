import { z } from '@dangerprep/configuration';
import { StandardizedServiceConfig } from '@dangerprep/sync';

// Service-specific configuration schema
const NFSSyncServiceConfigSchema = z.object({
  sync_config: z.object({
    central_nas: z.object({
      host: z.string(),
      nfs_shares: z.record(z.string(), z.string()),
    }),
    plex: z.object({
      server: z.string(),
      token: z.string(),
    }),
    local_storage: z.object({
      base_path: z.string(),
      max_total_size: z.string(),
    }),
    content_types: z.record(
      z.string(),
      z.object({
        type: z.enum(['full_sync', 'metadata_filtered', 'folder_filtered', 'kiwix_updater']),
        schedule: z.string(),
        local_path: z.string(),
        nfs_path: z.string().optional(),
        max_size: z.string(),
        filters: z
          .array(
            z.object({
              type: z.string(),
              operator: z.string(),
              value: z.union([z.string(), z.number()]),
            })
          )
          .optional(),
        priority_rules: z
          .array(
            z.object({
              type: z.string(),
              weight: z.number(),
            })
          )
          .optional(),
        include_folders: z.array(z.string()).optional(),
        max_episodes_per_show: z.number().optional(),
        zim_files: z.array(z.string()).optional(),
      })
    ),
    performance: z.object({
      max_concurrent_transfers: z.number().positive(),
      bandwidth_limit: z.string(),
      retry_attempts: z.number().nonnegative(),
      retry_delay: z.number().positive(),
    }),
    logging: z.object({
      level: z.string(),
      file: z.string(),
      max_size: z.string(),
      backup_count: z.number().positive(),
    }),
    notifications: z
      .object({
        enabled: z.boolean(),
        webhook_url: z.string().url().optional(),
        email: z
          .object({
            enabled: z.boolean(),
            smtp_server: z.string(),
            smtp_port: z.number().positive(),
            username: z.string(),
            password: z.string(),
            to: z.string(),
          })
          .optional(),
      })
      .optional(),
  }),
});

// Create standardized configuration schema
export const NFSSyncConfigSchema = z
  .object({
    service_name: z.string().default('nfs-sync'),
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
  .merge(NFSSyncServiceConfigSchema);

// TypeScript type - intersection of standardized config and service-specific config
export type NFSSyncConfig = StandardizedServiceConfig & z.infer<typeof NFSSyncServiceConfigSchema>;

// Legacy export for backward compatibility
export const SyncConfigSchema = NFSSyncConfigSchema;
export type SyncConfig = NFSSyncConfig;

// Sync types with const assertion
export const SYNC_TYPES = [
  'full_sync',
  'metadata_filtered',
  'folder_filtered',
  'kiwix_updater',
] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

// Content type configuration derived from schema
export type ContentTypeConfig = NFSSyncConfig['sync_config']['content_types'][string];

export interface FilterRule {
  readonly type: string;
  readonly operator: string;
  readonly value: string | number;
}

export interface PriorityRule {
  readonly type: string;
  readonly weight: number;
}

// Plex XML API response interfaces
export interface PlexVideoXML {
  '@_title': string;
  '@_year'?: string;
  '@_rating'?: string;
  '@_duration'?: string;
  '@_addedAt'?: string;
  Genre?: PlexGenreXML | PlexGenreXML[];
  Media?: PlexMediaXML | PlexMediaXML[];
}

export interface PlexGenreXML {
  '@_tag': string;
}

export interface PlexMediaXML {
  '@_duration'?: string;
  '@_height'?: string;
  Part?: PlexPartXML | PlexPartXML[];
}

export interface PlexPartXML {
  '@_file': string;
  '@_size'?: string;
}

export interface PlexShowXML {
  '@_title': string;
  '@_year'?: string;
  '@_leafCount'?: string;
  '@_addedAt'?: string;
}

export interface PlexEpisodeXML {
  '@_title': string;
  '@_parentIndex'?: string;
  '@_index'?: string;
  '@_duration'?: string;
  '@_addedAt'?: string;
  Media?: PlexMediaXML | PlexMediaXML[];
}

export interface PlexMovie {
  title: string;
  year: number;
  rating: number;
  genres: string[];
  resolution: string;
  size: number;
  path: string;
  priorityScore?: number;
}

export interface PlexTVShow {
  title: string;
  year: number;
  rating: number;
  genres: string[];
  episodes: PlexEpisode[];
  path: string;
}

export interface PlexEpisode {
  title: string;
  season: number;
  episode: number;
  size: number;
  path: string;
}

export interface SyncResult {
  contentType: string;
  success: boolean;
  itemsProcessed: number;
  totalSize: number;
  duration: number;
  errors: string[];
}

export interface SyncStatus {
  isRunning: boolean;
  currentContentType?: string | undefined;
  progress: number;
  startTime?: Date | undefined;
  estimatedCompletion?: Date | undefined;
  lastSync?: Date | undefined;
  results: SyncResult[];
}
