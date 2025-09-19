import { z } from 'zod';

// Media Item Schema
export const MediaItemSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty'),
  type: z.string().min(1, 'Type cannot be empty'),
  seasons: z.array(z.number().positive()).optional(),
  episodes: z.number().positive().optional(),
  reserved_space_gb: z.number().positive().optional(),
  use_smart_selection: z.boolean().optional(),
});

// WebTV Channel Schema (for individual channels in collection)
export const WebTVChannelItemSchema = z.object({
  name: z.string().min(1, 'Channel name cannot be empty'),
  type: z.literal('WebTV'),
  priority: z.enum(['required', 'optional']).default('optional'),
  max_size_gb: z.number().positive().optional(),
  reserved_space_gb: z.number().positive().optional(),
});

// Kiwix Item Schema (for individual ZIM files in collection)
export const KiwixItemSchema = z.object({
  name: z.string().min(1, 'ZIM file name cannot be empty'),
  type: z.literal('Kiwix'),
  priority: z.enum(['required', 'optional']).default('required'),
  expected_size_gb: z.number().positive('Expected size must be positive'),
  category: z.string().min(1, 'Category cannot be empty'),
  description: z.string().optional(),
});

// Collection Schema
export const CollectionSchema = z.object({
  movies: z.array(MediaItemSchema),
  tv_shows: z.array(MediaItemSchema),
  webtv_channels: z.array(WebTVChannelItemSchema),
  kiwix: z.array(KiwixItemSchema),
  other: z.array(MediaItemSchema),
});

// NFS Paths Schema
export const NFSPathsSchema = z.object({
  base: z.string().min(1, 'Base path cannot be empty'),
  movies: z.string().min(1, 'Movies path cannot be empty'),
  tv: z.string().min(1, 'TV path cannot be empty'),
  games: z.string().min(1, 'Games path cannot be empty'),
  webtv: z.string().min(1, 'WebTV path cannot be empty'),
});

// Drive Config Schema
export const DriveConfigSchema = z.object({
  size_gb: z.number().positive('Drive size must be positive'),
  recommended_max_usage: z.number().min(0).max(1, 'Usage must be between 0 and 1'),
  safe_usage_threshold: z.number().min(0).max(1, 'Threshold must be between 0 and 1'),
});

// Output Config Schema
export const OutputConfigSchema = z.object({
  default_csv_name: z.string().min(1, 'CSV name cannot be empty'),
  default_rsync_script: z.string().min(1, 'Rsync script name cannot be empty'),
  default_markdown_name: z.string().min(1, 'Markdown name cannot be empty'),
  default_destination: z.string().min(1, 'Destination cannot be empty'),
});

// Rsync Config Schema
export const RsyncConfigSchema = z.object({
  options: z.array(z.string().min(1, 'Rsync option cannot be empty')),
});

// WebTV Channel Schema
export const WebTVChannelSchema = z.object({
  name: z.string().min(1, 'Channel name cannot be empty'),
  priority: z.enum(['required', 'optional']),
  max_size_gb: z.number().positive().optional(),
});

// WebTV Selection Config Schema (for global WebTV selection settings)
export const WebTVSelectionConfigSchema = z.object({
  reserved_space_gb: z.number().positive('Space target must be positive'),
  selection_strategy: z.enum(['fill_to_target', 'exact_channels']).default('fill_to_target'),
  allow_partial_channels: z.boolean().default(true),
});

// WebTV Config Schema (combines channels and selection settings for the space manager)
export const WebTVConfigSchema = z.object({
  channels: z.array(WebTVChannelSchema),
  reserved_space_gb: z.number().positive('Space target must be positive'),
  selection_strategy: z.enum(['fill_to_target', 'exact_channels']).default('fill_to_target'),
  allow_partial_channels: z.boolean().default(true),
});

// Kiwix Mirror Schema
export const KiwixMirrorSchema = z.object({
  name: z.string().min(1, 'Mirror name cannot be empty'),
  url: z.string().url('Mirror URL must be valid'),
  priority: z.number().int().min(1, 'Priority must be positive integer'),
  enabled: z.boolean().default(true),
});

// Kiwix Config Schema
export const KiwixConfigSchema = z.object({
  mirrors: z.array(KiwixMirrorSchema),
  download_path: z.string().min(1, 'Download path cannot be empty'),
  speed_test_timeout_seconds: z.number().positive().default(30),
  speed_test_size_mb: z.number().positive().default(10),
  parallel_downloads: z.number().int().min(1).max(10).default(3),
  retry_attempts: z.number().int().min(1).default(3),
  verify_checksums: z.boolean().default(true),
});

// Main App Config Schema
export const AppConfigSchema = z.object({
  nfs_paths: NFSPathsSchema,
  drive_config: DriveConfigSchema,
  output_config: OutputConfigSchema,
  rsync_config: RsyncConfigSchema,
  media_extensions: z.array(z.string().min(1, 'Extension cannot be empty')),
  collection: CollectionSchema,
  webtv_selection_config: WebTVSelectionConfigSchema.optional(),
  kiwix_config: KiwixConfigSchema.optional(),
});

// Export types inferred from schemas
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type Collection = z.infer<typeof CollectionSchema>;
export type NFSPaths = z.infer<typeof NFSPathsSchema>;
export type DriveConfig = z.infer<typeof DriveConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type RsyncConfig = z.infer<typeof RsyncConfigSchema>;
export type WebTVChannel = z.infer<typeof WebTVChannelSchema>;
export type WebTVChannelItem = z.infer<typeof WebTVChannelItemSchema>;
export type WebTVSelectionConfig = z.infer<typeof WebTVSelectionConfigSchema>;
export type WebTVConfig = z.infer<typeof WebTVConfigSchema>;
export type KiwixItem = z.infer<typeof KiwixItemSchema>;
export type KiwixMirror = z.infer<typeof KiwixMirrorSchema>;
export type KiwixConfig = z.infer<typeof KiwixConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
