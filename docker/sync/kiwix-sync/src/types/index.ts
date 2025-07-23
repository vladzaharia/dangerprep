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
  name: string;
  title: string;
  description: string;
  size: string;
  date: string;
  url?: string;
  path?: string;
  version?: string;
}

export interface DownloadProgress {
  packageName: string;
  progress: number;
  speed: string;
  eta: string;
  status: 'downloading' | 'completed' | 'failed' | 'paused';
}

export interface LibraryEntry {
  id: string;
  path: string;
  url: string;
  title: string;
  description: string;
  language: string;
  creator: string;
  publisher: string;
  date: string;
  tags: string;
  articleCount: number;
  mediaCount: number;
  size: number;
}
