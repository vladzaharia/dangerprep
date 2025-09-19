import { join } from 'path';
import { FileSystemManager } from './filesystem.js';
import { ContentMatcher } from './matcher.js';
import { getConfig } from '../config/loader.js';
import type { WebTVChannel } from '../config/schema.js';

export interface WebTVVideoInfo {
  name: string;
  path: string;
  size_gb: number;
}

export interface WebTVChannelInfo {
  name: string;
  path: string;
  size_gb: number;
  video_count: number;
  media_file_count: number;
  match_score?: number;
  avg_video_size_gb?: number;
  videos?: WebTVVideoInfo[]; // Individual video files for partial selection
  selected_videos?: WebTVVideoInfo[]; // Videos selected for copying (optional channels only)
  selected_size_gb?: number; // Total size of selected videos (different from size_gb for optional channels)
  is_required?: boolean; // Whether this is a required channel (copy entirely) or optional (partial selection)
  copy_mode?: 'entire' | 'partial'; // How this channel should be copied
}

export interface WebTVScanResult {
  channels: WebTVChannelInfo[];
  total_size_gb: number;
  total_channels: number;
}

export class WebTVChannelScanner {
  private fs: FileSystemManager;
  private matcher: ContentMatcher;
  private config = getConfig();

  constructor() {
    this.fs = new FileSystemManager();
    this.matcher = new ContentMatcher();
  }

  /**
   * Scan the WebTV directory and identify all available channels
   */
  async scanChannels(): Promise<WebTVScanResult> {
    console.log('🔍 Scanning WebTV channels...');
    
    const webtvPath = this.config.nfs_paths.webtv;
    const availableDirectories = await this.fs.listDirectories(webtvPath);
    
    console.log(`📁 Found ${availableDirectories.length} directories in ${webtvPath}`);

    const channels: WebTVChannelInfo[] = [];
    let totalSize = 0;

    for (const dirName of availableDirectories) {
      const channelPath = join(webtvPath, dirName);
      
      try {
        // Get directory info
        const dirInfo = await this.fs.getDirectoryInfo(channelPath);
        
        // Skip empty directories or very small ones (likely metadata only)
        if (dirInfo.isEmpty || dirInfo.sizeGB < 0.1) {
          console.log(`⏭️  Skipping ${dirName} (empty or too small: ${dirInfo.sizeGB.toFixed(2)}GB)`);
          continue;
        }

        // Calculate average video size for informational purposes
        const avgVideoSize = dirInfo.mediaFileCount > 0 ? dirInfo.sizeGB / dirInfo.mediaFileCount : 0;

        const channelInfo: WebTVChannelInfo = {
          name: dirName,
          path: channelPath,
          size_gb: dirInfo.sizeGB,
          video_count: dirInfo.fileCount,
          media_file_count: dirInfo.mediaFileCount,
          avg_video_size_gb: avgVideoSize,
        };

        channels.push(channelInfo);
        totalSize += dirInfo.sizeGB;
        
        console.log(`📺 Found channel: ${dirName} (${dirInfo.sizeGB.toFixed(1)}GB, ${dirInfo.mediaFileCount} videos, avg: ${avgVideoSize.toFixed(2)}GB/video)`);
      } catch (error) {
        console.warn(`⚠️  Warning: Could not analyze ${dirName}:`, error);
      }
    }

    // Sort channels by size (largest first) - this naturally favors marathon content
    channels.sort((a, b) => b.size_gb - a.size_gb);

    console.log(`✅ Scanned ${channels.length} channels, total size: ${totalSize.toFixed(1)}GB`);

    return {
      channels,
      total_size_gb: totalSize,
      total_channels: channels.length,
    };
  }

  /**
   * Find channels that match the configured channel names using fuzzy matching
   * Optimized to only analyze configured channels, not all available channels
   */
  async findConfiguredChannels(configuredChannels: WebTVChannel[]): Promise<Map<string, WebTVChannelInfo | null>> {
    console.log('🔍 Finding configured WebTV channels...');

    const webtvPath = this.config.nfs_paths.webtv;
    const availableDirectories = await this.fs.listDirectories(webtvPath);

    console.log(`📁 Found ${availableDirectories.length} directories in ${webtvPath}`);

    const results = new Map<string, WebTVChannelInfo | null>();

    for (const configChannel of configuredChannels) {
      console.log(`🔍 Looking for configured channel: ${configChannel.name}`);

      // Try to find a match using the content matcher
      const match = this.matcher.findBestMatch(configChannel.name, availableDirectories, 0.6);

      if (match) {
        // Only analyze the matched directory (expensive operation)
        const channelPath = join(webtvPath, match.item);

        try {
          // Get directory info
          const dirInfo = await this.fs.getDirectoryInfo(channelPath);

          // Skip empty directories or very small ones (likely metadata only)
          if (dirInfo.isEmpty || dirInfo.sizeGB < 0.1) {
            console.log(`⏭️  Skipping ${match.item} (empty or too small: ${dirInfo.sizeGB.toFixed(2)}GB)`);
            results.set(configChannel.name, null);
            continue;
          }

          // Calculate average video size for informational purposes
          const avgVideoSize = dirInfo.mediaFileCount > 0 ? dirInfo.sizeGB / dirInfo.mediaFileCount : 0;

          const channelInfo: WebTVChannelInfo = {
            name: match.item,
            path: channelPath,
            size_gb: dirInfo.sizeGB,
            video_count: dirInfo.fileCount,
            media_file_count: dirInfo.mediaFileCount,
            avg_video_size_gb: avgVideoSize,
            match_score: match.score,
          };

          results.set(configChannel.name, channelInfo);
          console.log(`✅ Found match: "${configChannel.name}" -> "${match.item}" (score: ${match.score.toFixed(2)}, ${dirInfo.sizeGB.toFixed(1)}GB, ${dirInfo.mediaFileCount} videos, avg: ${avgVideoSize.toFixed(2)}GB/video)`);
        } catch (error) {
          console.warn(`⚠️  Warning: Could not analyze ${match.item}:`, error);
          results.set(configChannel.name, null);
        }
      } else {
        results.set(configChannel.name, null);
        console.log(`❌ No match found for: ${configChannel.name}`);
      }
    }

    return results;
  }

  /**
   * Get detailed information about a specific channel
   */
  async getChannelDetails(channelName: string): Promise<WebTVChannelInfo | null> {
    const webtvPath = this.config.nfs_paths.webtv;
    const channelPath = join(webtvPath, channelName);
    
    try {
      const dirInfo = await this.fs.getDirectoryInfo(channelPath);
      const avgVideoSize = dirInfo.mediaFileCount > 0 ? dirInfo.sizeGB / dirInfo.mediaFileCount : 0;
      
      return {
        name: channelName,
        path: channelPath,
        size_gb: dirInfo.sizeGB,
        video_count: dirInfo.fileCount,
        media_file_count: dirInfo.mediaFileCount,
        avg_video_size_gb: avgVideoSize,
      };
    } catch (error) {
      console.warn(`⚠️  Could not get details for channel ${channelName}:`, error);
      return null;
    }
  }

  /**
   * List all available channels with basic info (faster than full scan)
   */
  async listAvailableChannels(): Promise<string[]> {
    const webtvPath = this.config.nfs_paths.webtv;
    return await this.fs.listDirectories(webtvPath);
  }

  /**
   * Get individual video files within a channel for partial selection
   */
  async getChannelVideos(channelPath: string): Promise<WebTVVideoInfo[]> {
    try {
      const videos: WebTVVideoInfo[] = [];

      // Use the filesystem manager to recursively find all media files
      const mediaFiles = await this.fs.findMediaFiles(channelPath);

      for (const filePath of mediaFiles) {
        try {
          const stats = await this.fs.getFileSize(filePath);
          const sizeGB = stats / (1024 * 1024 * 1024); // Convert bytes to GB

          // Get relative path from channel root for cleaner display
          const relativePath = filePath.replace(channelPath + '/', '');

          videos.push({
            name: relativePath,
            path: filePath,
            size_gb: sizeGB,
          });
        } catch (error) {
          console.warn(`⚠️  Could not get size for ${filePath}:`, error);
        }
      }

      // Shuffle videos randomly for diverse selection instead of prioritizing large files
      for (let i = videos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = videos[i]!;
        videos[i] = videos[j]!;
        videos[j] = temp;
      }

      return videos;
    } catch (error) {
      console.warn(`⚠️  Could not scan videos in ${channelPath}:`, error);
      return [];
    }
  }
}
