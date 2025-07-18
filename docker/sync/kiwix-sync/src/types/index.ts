export interface KiwixConfig {
  kiwix_manager: {
    storage: {
      zim_directory: string;
      library_file: string;
      temp_directory: string;
      max_total_size: string;
    };
    scheduler: {
      update_schedule: string;
      cleanup_schedule: string;
    };
    download: {
      concurrent_downloads: number;
      retry_attempts: number;
      retry_delay: number;
      bandwidth_limit: string;
    };
    logging: {
      level: string;
      file: string;
      max_size: string;
      backup_count: number;
    };
    api: {
      base_url: string;
      catalog_url: string;
      timeout: number;
    };
  };
}

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
