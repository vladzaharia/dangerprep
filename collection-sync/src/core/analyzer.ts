import { join } from 'path';
import { FileSystemManager } from './filesystem.js';
import { ContentMatcher, type MatchResult } from './matcher.js';
import { MetadataCache } from './cache.js';
import { getConfig } from '../config/loader.js';
import { WebTVSpaceManager, type WebTVSelectionResult } from './webtv-space-manager.js';
import { KiwixAnalyzer } from './kiwix-analyzer.js';
import type { MediaItem, WebTVConfig } from '../config/schema.js';

export interface ContentAnalysis {
  name: string;
  type: string;
  actual_name?: string | undefined;
  size_gb: number;
  episodes: number;
  match_score?: number | undefined;
  nfs_path: string;
  status: 'found' | 'missing' | 'empty';
  seasons?: number[] | undefined;
  reserved_space_gb?: number | undefined;
  file_count: number;
  media_file_count: number;
  season_info?: {
    selected_seasons: number[];
    season_sizes: { season: number; size: number; path: string }[];
    has_all_seasons: boolean;
    is_partial_selection: boolean;
  };
  webtv_selection?: WebTVSelectionResult;
  webtv_channel_info?: {
    copy_mode: 'entire' | 'partial';
    is_required: boolean;
    selected_videos?: Array<{ name: string; path: string; size_gb: number }> | undefined;
    total_channel_size_gb: number;
    selected_size_gb: number;
  };
}

export interface ContentTypeStats {
  count: number;
  found_count: number;
  missing_count: number;
  empty_count: number;
  total_size_gb: number;
  found_size_gb: number;
  missing_size_gb: number;
  required_download_size_gb: number;
}

export interface SpaceAllocationBreakdown {
  movies: ContentTypeStats;
  tv_shows: ContentTypeStats;
  webtv_channels: ContentTypeStats;
  kiwix: ContentTypeStats;
  other: ContentTypeStats;
  totals: ContentTypeStats;
}

export interface SpaceAllocationWarnings {
  exceeds_capacity: boolean;
  exceeds_recommended: boolean;
  exceeds_safe_threshold: boolean;
  total_required_gb: number;
  available_space_gb: number;
  recommendations: string[];
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
  space_allocation: SpaceAllocationBreakdown;
  space_warnings: SpaceAllocationWarnings;
}

export class CollectionAnalyzer {
  private fs: FileSystemManager;
  private matcher: ContentMatcher;
  private cache: MetadataCache;
  private webtvManager: WebTVSpaceManager;
  private kiwixAnalyzer: KiwixAnalyzer;
  private config = getConfig();
  private webtvSelectionResult?: WebTVSelectionResult;

  constructor(cacheDir?: string) {
    this.fs = new FileSystemManager();
    this.matcher = new ContentMatcher();
    this.cache = new MetadataCache(cacheDir);
    this.webtvManager = new WebTVSpaceManager();
    this.kiwixAnalyzer = new KiwixAnalyzer();
  }

  /**
   * Initialize the analyzer by loading cache
   */
  async initialize(): Promise<void> {
    await this.cache.loadCache();
    this.cache.clearExpired();
  }

  /**
   * Analyze the complete collection
   */
  async analyzeCollection(): Promise<{
    analyses: ContentAnalysis[];
    stats: CollectionStats;
  }> {
    console.log('🔍 Starting collection analysis...');

    // Get available content from NFS
    const availableContent = await this.fs.getAvailableContent();
    console.log(`📁 Found content: ${availableContent.movies.length} movies, ${availableContent.tv.length} TV shows, ${availableContent.games.length} games, ${availableContent.webtv.length} WebTV`);

    // Perform WebTV smart selection if configured
    let selectedWebTVChannels: Set<string> = new Set();
    if (this.config.webtv_selection_config && this.config.collection.webtv_channels.length > 0) {
      console.log('🎯 Performing WebTV smart selection...');

      // Convert collection WebTV channels to the format expected by WebTVSpaceManager
      const webtvConfig: WebTVConfig = {
        channels: this.config.collection.webtv_channels.map(item => ({
          name: item.name,
          priority: item.priority,
          max_size_gb: item.max_size_gb,
        })),
        reserved_space_gb: this.config.webtv_selection_config.reserved_space_gb,
        selection_strategy: this.config.webtv_selection_config.selection_strategy,
        allow_partial_channels: this.config.webtv_selection_config.allow_partial_channels,
      };

      this.webtvSelectionResult = await this.webtvManager.selectChannels(webtvConfig);
      selectedWebTVChannels = new Set(this.webtvSelectionResult.selected_channels.map(c => c.name));

      console.log(`✅ WebTV selection complete: ${this.webtvSelectionResult.selected_channels.length} channels selected, ${this.webtvSelectionResult.channel_breakdown.excluded.length} excluded`);
    }

    // Analyze Kiwix content separately (doesn't use NFS)
    const kiwixAnalyses = await this.kiwixAnalyzer.analyzeKiwixCollection();

    // Combine all media items (excluding WebTV channels that weren't selected)
    const allItems = [
      ...this.config.collection.movies,
      ...this.config.collection.tv_shows,
      // Only include WebTV channels that were selected (or all if no smart selection)
      ...this.config.collection.webtv_channels.filter(item =>
        !this.config.webtv_selection_config || selectedWebTVChannels.has(item.name)
      ),
      ...this.config.collection.other,
    ];

    console.log(`📋 Analyzing ${allItems.length} items from collection...`);

    // Find matches for all items
    const matches = this.matcher.findBatchMatches(allItems, availableContent);

    // Analyze each item
    const analyses: ContentAnalysis[] = [];
    for (const item of allItems) {
      const match = matches.get(item.name) ?? null;
      const analysis = await this.analyzeItem(item, match);

      // Add WebTV selection info to WebTV channel analyses
      if (item.type.toLowerCase() === 'webtv' && this.webtvSelectionResult) {
        analysis.webtv_selection = this.webtvSelectionResult;

        // Find the specific channel info from the selection result
        const selectedChannel = this.webtvSelectionResult.selected_channels.find(c => c.name === item.name);
        if (selectedChannel) {
          analysis.webtv_channel_info = {
            copy_mode: selectedChannel.copy_mode || 'entire',
            is_required: selectedChannel.is_required || false,
            selected_videos: selectedChannel.selected_videos?.map(v => ({
              name: v.name,
              path: v.path,
              size_gb: v.size_gb
            })),
            total_channel_size_gb: selectedChannel.size_gb,
            selected_size_gb: selectedChannel.selected_size_gb || selectedChannel.size_gb
          };

          // Update the analysis size to reflect only selected content
          analysis.size_gb = selectedChannel.selected_size_gb || selectedChannel.size_gb;

          // Update episode count for partial selections
          if (selectedChannel.copy_mode === 'partial' && selectedChannel.selected_videos) {
            analysis.episodes = selectedChannel.selected_videos.length;
          }
        }
      }

      analyses.push(analysis);
    }

    // Add Kiwix analyses to the main analyses array
    analyses.push(...kiwixAnalyses);

    // Calculate statistics (include Kiwix items in the total)
    const allItemsWithKiwix = [...allItems, ...(this.config.collection.kiwix || [])];

    // Get effective drive size (actual filesystem capacity if destination exists)
    const effectiveDriveSize = await this.fs.getEffectiveDriveSize(
      this.config.output_config.default_destination,
      this.config.drive_config.size_gb
    );

    const stats = await this.calculateStats(analyses, allItemsWithKiwix, effectiveDriveSize);

    // Save cache
    await this.cache.saveCache();

    console.log('✅ Collection analysis complete');
    return { analyses, stats };
  }

  /**
   * Analyze a single media item
   */
  private async analyzeItem(
    item: MediaItem,
    match: MatchResult | null
  ): Promise<ContentAnalysis> {
    // Handle WebTV channels as individual items
    if (item.type.toLowerCase() === 'webtv') {
      return await this.analyzeWebTVChannelItem(item, match);
    }

    const basePath = this.getBasePath(item.type);

    if (!match) {
      const result: ContentAnalysis = {
        name: item.name,
        type: item.type,
        size_gb: item.reserved_space_gb || 0,
        episodes: item.episodes || 0,
        nfs_path: join(basePath, item.name),
        status: 'missing',
        file_count: 0,
        media_file_count: 0,
      };

      if (item.seasons) {
        result.seasons = item.seasons;
      }

      if (item.reserved_space_gb) {
        result.reserved_space_gb = item.reserved_space_gb;
      }

      return result;
    }

    const actualPath = join(basePath, match.item);

    // Try to get from cache first
    let directoryInfo = this.cache.getCachedInfo(actualPath);

    if (!directoryInfo) {
      // Not in cache, scan the directory
      directoryInfo = await this.fs.getDirectoryInfo(actualPath);
      this.cache.setCachedInfo(actualPath, directoryInfo);
    }

    const status = directoryInfo.isEmpty ? 'empty' : 'found';
    const episodes = item.type.toLowerCase() === 'movie' ? 1 : directoryInfo.mediaFileCount;

    // For TV shows with specific seasons, calculate season-specific size
    let finalSize = directoryInfo.sizeGB;
    let seasonInfo: ContentAnalysis['season_info'];

    if (item.type.toLowerCase() === 'tv' && item.seasons && item.seasons.length > 0) {
      const seasonData = await this.fs.getSeasonSpecificSize(actualPath, item.seasons);
      finalSize = seasonData.totalSize;

      seasonInfo = {
        selected_seasons: item.seasons,
        season_sizes: seasonData.seasonSizes,
        has_all_seasons: seasonData.hasAllSeasons,
        is_partial_selection: true
      };
    }

    const result: ContentAnalysis = {
      name: item.name,
      type: item.type,
      size_gb: finalSize,
      episodes,
      match_score: match.score,
      nfs_path: actualPath,
      status,
      file_count: directoryInfo.fileCount,
      media_file_count: directoryInfo.mediaFileCount,
      actual_name: undefined,
    };

    if (seasonInfo) {
      result.season_info = seasonInfo;
    }

    if (match.item !== item.name) {
      result.actual_name = match.item;
    }

    if (item.seasons) {
      result.seasons = item.seasons;
    }

    if (item.reserved_space_gb) {
      result.reserved_space_gb = item.reserved_space_gb;
    }

    return result;
  }

  /**
   * Analyze a WebTV channel as an individual collection item
   */
  private async analyzeWebTVChannelItem(item: MediaItem, match: MatchResult | null): Promise<ContentAnalysis> {
    console.log(`📺 Analyzing WebTV channel: ${item.name}`);

    const basePath = this.config.nfs_paths.webtv;

    if (!match) {
      const result: ContentAnalysis = {
        name: item.name,
        type: item.type,
        size_gb: item.reserved_space_gb || 0,
        episodes: 0,
        nfs_path: join(basePath, item.name),
        status: 'missing',
        file_count: 0,
        media_file_count: 0,
      };

      if (item.reserved_space_gb) {
        result.reserved_space_gb = item.reserved_space_gb;
      }

      return result;
    }

    const actualPath = join(basePath, match.item);

    // Try to get from cache first
    let directoryInfo = this.cache.getCachedInfo(actualPath);

    if (!directoryInfo) {
      // Not in cache, scan the directory
      directoryInfo = await this.fs.getDirectoryInfo(actualPath);
      this.cache.setCachedInfo(actualPath, directoryInfo);
    }

    const status = directoryInfo.isEmpty ? 'empty' : 'found';
    const episodes = directoryInfo.mediaFileCount;

    const result: ContentAnalysis = {
      name: item.name,
      type: item.type,
      actual_name: match.score < 1 ? match.item : undefined,
      size_gb: directoryInfo.sizeGB,
      episodes,
      match_score: match.score < 1 ? match.score : undefined,
      nfs_path: actualPath,
      status,
      file_count: directoryInfo.fileCount,
      media_file_count: directoryInfo.mediaFileCount,
    };

    if (item.reserved_space_gb) {
      result.reserved_space_gb = item.reserved_space_gb;
    }

    console.log(`✅ WebTV channel analysis complete: ${item.name} -> ${match.item} (${directoryInfo.sizeGB.toFixed(1)}GB, ${episodes} videos)`);

    return result;
  }

  /**
   * Get the base NFS path for a content type
   */
  private getBasePath(type: string): string {
    switch (type.toLowerCase()) {
      case 'movie':
        return this.config.nfs_paths.movies;
      case 'tv':
        return this.config.nfs_paths.tv;
      case 'games':
        return this.config.nfs_paths.games;
      case 'webtv':
      case 'youtube':
        return this.config.nfs_paths.webtv;
      default:
        return this.config.nfs_paths.base;
    }
  }

  /**
   * Calculate collection statistics
   */
  private async calculateStats(
    analyses: ContentAnalysis[],
    originalItems: MediaItem[],
    effectiveDriveSize: number
  ): Promise<CollectionStats> {
    const foundItems = analyses.filter(a => a.status === 'found');
    const missingItems = analyses.filter(a => a.status === 'missing');
    const emptyItems = analyses.filter(a => a.status === 'empty');

    const totalSizeGB = foundItems.reduce((sum, item) => sum + item.size_gb, 0);
    const driveUsagePercent = (totalSizeGB / effectiveDriveSize) * 100;

    // Get largest items (top 10)
    const largestItems = [...foundItems]
      .sort((a, b) => b.size_gb - a.size_gb)
      .slice(0, 10);

    // Get missing items list
    const missingItemsSet = new Set(missingItems.map(a => a.name));
    const missingItemsList = originalItems.filter(item => missingItemsSet.has(item.name));

    // Calculate space allocation breakdown
    const spaceAllocation = this.calculateSpaceAllocation(analyses);

    // Calculate space warnings
    const spaceWarnings = this.calculateSpaceWarnings(spaceAllocation.totals.total_size_gb, effectiveDriveSize);

    return {
      total_items: analyses.length,
      found_items: foundItems.length,
      missing_items: missingItems.length,
      empty_items: emptyItems.length,
      total_size_gb: totalSizeGB,
      drive_usage_percent: driveUsagePercent,
      movies_count: analyses.filter(a => a.type.toLowerCase() === 'movie').length,
      tv_shows_count: analyses.filter(a => a.type.toLowerCase() === 'tv').length,
      webtv_channels_count: analyses.filter(a => a.type.toLowerCase() === 'webtv').length,
      kiwix_count: analyses.filter(a => a.type.toLowerCase() === 'kiwix').length,
      other_count: analyses.filter(a => !['movie', 'tv', 'webtv', 'kiwix'].includes(a.type.toLowerCase())).length,
      largest_items: largestItems,
      missing_items_list: missingItemsList,
      space_allocation: spaceAllocation,
      space_warnings: spaceWarnings,
    };
  }

  /**
   * Calculate space allocation breakdown by content type
   */
  private calculateSpaceAllocation(analyses: ContentAnalysis[]): SpaceAllocationBreakdown {
    // Helper function to calculate stats for a content type
    const calculateTypeStats = (items: ContentAnalysis[]): ContentTypeStats => {
      const found = items.filter(a => a.status === 'found');
      const missing = items.filter(a => a.status === 'missing');
      const empty = items.filter(a => a.status === 'empty');

      const foundSizeGB = found.reduce((sum, item) => sum + item.size_gb, 0);
      const missingSizeGB = missing.reduce((sum, item) => sum + item.size_gb, 0);
      const totalSizeGB = foundSizeGB + missingSizeGB;

      return {
        count: items.length,
        found_count: found.length,
        missing_count: missing.length,
        empty_count: empty.length,
        total_size_gb: totalSizeGB,
        found_size_gb: foundSizeGB,
        missing_size_gb: missingSizeGB,
        required_download_size_gb: missingSizeGB, // Space needed for missing items
      };
    };

    // Group analyses by content type
    const movies = analyses.filter(a => a.type.toLowerCase() === 'movie');
    const tvShows = analyses.filter(a => a.type.toLowerCase() === 'tv');
    const webtvChannels = analyses.filter(a => a.type.toLowerCase() === 'webtv');
    const kiwix = analyses.filter(a => a.type.toLowerCase() === 'kiwix');
    const other = analyses.filter(a => !['movie', 'tv', 'webtv', 'kiwix'].includes(a.type.toLowerCase()));

    // Calculate stats for each type
    const movieStats = calculateTypeStats(movies);
    const tvStats = calculateTypeStats(tvShows);
    const webtvStats = calculateTypeStats(webtvChannels);
    const kiwixStats = calculateTypeStats(kiwix);
    const otherStats = calculateTypeStats(other);

    // Calculate totals
    const totals: ContentTypeStats = {
      count: movieStats.count + tvStats.count + webtvStats.count + kiwixStats.count + otherStats.count,
      found_count: movieStats.found_count + tvStats.found_count + webtvStats.found_count + kiwixStats.found_count + otherStats.found_count,
      missing_count: movieStats.missing_count + tvStats.missing_count + webtvStats.missing_count + kiwixStats.missing_count + otherStats.missing_count,
      empty_count: movieStats.empty_count + tvStats.empty_count + webtvStats.empty_count + kiwixStats.empty_count + otherStats.empty_count,
      total_size_gb: movieStats.total_size_gb + tvStats.total_size_gb + webtvStats.total_size_gb + kiwixStats.total_size_gb + otherStats.total_size_gb,
      found_size_gb: movieStats.found_size_gb + tvStats.found_size_gb + webtvStats.found_size_gb + kiwixStats.found_size_gb + otherStats.found_size_gb,
      missing_size_gb: movieStats.missing_size_gb + tvStats.missing_size_gb + webtvStats.missing_size_gb + kiwixStats.missing_size_gb + otherStats.missing_size_gb,
      required_download_size_gb: movieStats.required_download_size_gb + tvStats.required_download_size_gb + webtvStats.required_download_size_gb + kiwixStats.required_download_size_gb + otherStats.required_download_size_gb,
    };

    return {
      movies: movieStats,
      tv_shows: tvStats,
      webtv_channels: webtvStats,
      kiwix: kiwixStats,
      other: otherStats,
      totals,
    };
  }

  /**
   * Calculate space warnings based on drive capacity and usage thresholds
   */
  private calculateSpaceWarnings(totalRequiredGB: number, effectiveDriveSize: number): SpaceAllocationWarnings {
    const driveConfig = this.config.drive_config;
    const driveSizeGB = effectiveDriveSize;
    const recommendedMaxGB = driveSizeGB * driveConfig.recommended_max_usage;
    const safeThresholdGB = driveSizeGB * driveConfig.safe_usage_threshold;

    const exceedsCapacity = totalRequiredGB > driveSizeGB;
    const exceedsRecommended = totalRequiredGB > recommendedMaxGB;
    const exceedsSafeThreshold = totalRequiredGB > safeThresholdGB;

    const recommendations: string[] = [];

    if (exceedsCapacity) {
      const excessGB = totalRequiredGB - driveSizeGB;
      recommendations.push(`Collection requires ${totalRequiredGB.toFixed(1)}GB but drive is only ${driveSizeGB}GB. Need ${excessGB.toFixed(1)}GB more capacity.`);
      recommendations.push('Consider upgrading to a larger drive or removing some content from the collection.');
    } else if (exceedsRecommended) {
      const excessGB = totalRequiredGB - recommendedMaxGB;
      const usagePercent = (totalRequiredGB / driveSizeGB * 100).toFixed(1);
      recommendations.push(`Collection will use ${usagePercent}% of drive capacity (${totalRequiredGB.toFixed(1)}GB of ${driveSizeGB}GB).`);
      recommendations.push(`This exceeds the recommended maximum of ${(driveConfig.recommended_max_usage * 100).toFixed(0)}% by ${excessGB.toFixed(1)}GB.`);
      recommendations.push('Consider reducing collection size to maintain optimal drive performance.');
    } else if (exceedsSafeThreshold) {
      const usagePercent = (totalRequiredGB / driveSizeGB * 100).toFixed(1);
      recommendations.push(`Collection will use ${usagePercent}% of drive capacity, approaching the safe threshold.`);
      recommendations.push('Monitor drive space closely and consider removing less important content if needed.');
    } else {
      const usagePercent = (totalRequiredGB / driveSizeGB * 100).toFixed(1);
      const remainingGB = driveSizeGB - totalRequiredGB;
      recommendations.push(`Collection fits comfortably within drive capacity (${usagePercent}% usage).`);
      recommendations.push(`${remainingGB.toFixed(1)}GB of space will remain available.`);
    }

    return {
      exceeds_capacity: exceedsCapacity,
      exceeds_recommended: exceedsRecommended,
      exceeds_safe_threshold: exceedsSafeThreshold,
      total_required_gb: totalRequiredGB,
      available_space_gb: Math.max(0, driveSizeGB - totalRequiredGB),
      recommendations,
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clearAll();
  }

  /**
   * Get the WebTV selection result from the last analysis
   */
  getWebTVSelectionResult(): WebTVSelectionResult | undefined {
    return this.webtvSelectionResult;
  }

  /**
   * Get the Kiwix analyzer instance
   */
  getKiwixAnalyzer(): KiwixAnalyzer {
    return this.kiwixAnalyzer;
  }
}
