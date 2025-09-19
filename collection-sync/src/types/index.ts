export interface MediaItem {
  name: string;
  type: 'Movie' | 'TV' | 'Games' | 'WebTV' | 'YouTube' | string;
  seasons?: number[];
  episodes?: number;
  reserved_space_gb?: number;
}

export interface WebTVChannelItem {
  name: string;
  type: 'WebTV';
  priority: 'required' | 'optional';
  max_size_gb?: number;
  reserved_space_gb?: number;
}

export interface KiwixItem {
  name: string;
  type: 'Kiwix';
  priority: 'required' | 'optional';
  expected_size_gb: number;
  category: string;
  description?: string;
}

export interface Collection {
  movies: MediaItem[];
  tv_shows: MediaItem[];
  webtv_channels: WebTVChannelItem[];
  kiwix: KiwixItem[];
  other: MediaItem[];
}

export interface NFSPaths {
  base: string;
  movies: string;
  tv: string;
  games: string;
  webtv: string;
}

export interface DriveConfig {
  size_gb: number;
  recommended_max_usage: number;
  safe_usage_threshold: number;
}

export interface OutputConfig {
  default_csv_name: string;
  default_rsync_script: string;
  default_markdown_name: string;
  default_destination: string;
}

export interface RsyncConfig {
  options: string[];
}

export interface WebTVSelectionConfig {
  reserved_space_gb: number;
  selection_strategy: 'fill_to_target' | 'exact_channels';
  allow_partial_channels: boolean;
}

export interface KiwixMirror {
  name: string;
  url: string;
  priority: number;
  enabled: boolean;
}

export interface KiwixConfig {
  mirrors: KiwixMirror[];
  download_path: string;
  speed_test_timeout_seconds: number;
  speed_test_size_mb: number;
  parallel_downloads: number;
  retry_attempts: number;
  verify_checksums: boolean;
}

export interface AppConfig {
  nfs_paths: NFSPaths;
  drive_config: DriveConfig;
  output_config: OutputConfig;
  rsync_config: RsyncConfig;
  media_extensions: string[];
  collection: Collection;
  webtv_selection_config?: WebTVSelectionConfig;
  kiwix_config?: KiwixConfig;
}

export interface ContentAnalysis {
  name: string;
  type: string;
  actual_name?: string;
  size_gb: number;
  episodes: number;
  match_score?: number;
  nfs_path: string;
  status: 'found' | 'missing' | 'empty';
  seasons?: number[];
  reserved_space_gb?: number;
}

export interface CollectionStats {
  total_items: number;
  found_items: number;
  missing_items: number;
  empty_items: number;
  total_size_gb: number;
  drive_usage_percent: number;
  movies_count: number;
  tv_shows_count: number;
  webtv_channels_count: number;
  kiwix_count: number;
  other_count: number;
  largest_items: ContentAnalysis[];
  missing_items_list: MediaItem[];
}

export interface ExportOptions {
  csv_name?: string;
  script_name?: string;
  markdown_name?: string;
  destination?: string;
  output_dir?: string;
}
