export interface SyncConfig {
  sync_config: {
    central_nas: {
      host: string;
      nfs_shares: Record<string, string>;
    };
    plex: {
      server: string;
      token: string;
    };
    local_storage: {
      base_path: string;
      max_total_size: string;
    };
    content_types: {
      [key: string]: ContentTypeConfig;
    };
    performance: {
      max_concurrent_transfers: number;
      bandwidth_limit: string;
      retry_attempts: number;
      retry_delay: number;
    };
    logging: {
      level: string;
      file: string;
      max_size: string;
      backup_count: number;
    };
    notifications?: {
      enabled: boolean;
      webhook_url?: string;
      email?: {
        enabled: boolean;
        smtp_server: string;
        smtp_port: number;
        username: string;
        password: string;
        to: string;
      };
    };
  };
}

export interface ContentTypeConfig {
  type: 'full_sync' | 'metadata_filtered' | 'folder_filtered' | 'kiwix_updater';
  schedule: string;
  local_path: string;
  nfs_path?: string;
  max_size: string;
  filters?: FilterRule[];
  priority_rules?: PriorityRule[];
  include_folders?: string[];
  max_episodes_per_show?: number;
  zim_files?: string[];
}

export interface FilterRule {
  type: string;
  operator: string;
  value: string | number;
}

export interface PriorityRule {
  type: string;
  weight: number;
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
