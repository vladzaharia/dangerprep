import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config/loader.js';
import { KiwixDownloader } from './kiwix-downloader.js';
import type { KiwixItem } from '../config/schema.js';
import type { ContentAnalysis } from './analyzer.js';

export interface KiwixAnalysisInfo {
  name: string;
  filename: string;
  local_path: string;
  exists: boolean;
  size_gb: number;
  expected_size_gb: number;
  needs_update: boolean;
  category: string;
  description: string | undefined;
  priority: 'required' | 'optional';
}

export class KiwixAnalyzer {
  private config = getConfig();
  private downloader: KiwixDownloader;

  constructor() {
    this.downloader = new KiwixDownloader();
  }

  /**
   * Analyze all Kiwix items in the collection
   */
  async analyzeKiwixCollection(): Promise<ContentAnalysis[]> {
    console.log('📚 Analyzing Kiwix collection...');
    
    const kiwixItems = this.config.collection.kiwix || [];
    if (kiwixItems.length === 0) {
      console.log('📚 No Kiwix items configured');
      return [];
    }

    const analyses: ContentAnalysis[] = [];

    for (const item of kiwixItems) {
      const analysis = await this.analyzeKiwixItem(item);
      analyses.push(analysis);
    }

    console.log(`✅ Kiwix analysis complete: ${analyses.length} items analyzed`);
    return analyses;
  }

  /**
   * Analyze a single Kiwix item
   */
  async analyzeKiwixItem(item: KiwixItem): Promise<ContentAnalysis> {
    console.log(`📖 Analyzing Kiwix item: ${item.name}`);

    const kiwixInfo = await this.getKiwixItemInfo(item);

    // Determine status based on file existence and size
    let status: 'found' | 'missing' | 'empty';
    let actualSize = 0;

    if (kiwixInfo.exists) {
      actualSize = kiwixInfo.size_gb;

      // Check if file is empty or significantly smaller than expected
      if (actualSize < 0.01) { // Less than 10MB
        status = 'empty';
      } else if (kiwixInfo.needs_update) {
        status = 'found'; // Treat outdated files as found but needing update
      } else {
        status = 'found';
      }
    } else {
      // Kiwix content is considered "found" since it's available for download
      // We just need to sync it from Kiwix servers instead of NFS
      status = 'found';
      actualSize = item.expected_size_gb; // Use expected space for planning
    }

    const analysis: ContentAnalysis = {
      name: item.name,
      type: item.type,
      size_gb: actualSize, // Use actual size (which includes expected size for missing files)
      episodes: 1, // ZIM files are single files
      nfs_path: kiwixInfo.local_path,
      status,
      file_count: kiwixInfo.exists ? 1 : 0,
      media_file_count: kiwixInfo.exists ? 1 : 0,
    };

    // Add additional Kiwix-specific information
    if (item.description) {
      analysis.actual_name = item.description;
    }

    console.log(`✅ Kiwix item analysis: ${item.name} -> ${status} (${actualSize.toFixed(1)}GB)`);
    return analysis;
  }

  /**
   * Get detailed information about a Kiwix item (for analysis purposes)
   */
  private async getKiwixItemInfo(item: KiwixItem): Promise<KiwixAnalysisInfo> {
    const downloadPath = this.config.kiwix_config?.download_path || '/content/kiwix';

    // Map item names to actual ZIM filenames
    const filenameMap: Record<string, string> = {
      'wikivoyage_en_all_maxi': 'wikivoyage_en_all_maxi_2025-09.zim',
      'wikipedia_en_top_maxi': 'wikipedia_en_top_maxi_2025-09.zim',
      'bulbagarden_en_all_maxi': 'bulbagarden_en_all_maxi_2025-09.zim',
      'wikinews_en_all_maxi': 'wikinews_en_all_maxi_2025-09.zim',
    };

    const filename = filenameMap[item.name] || `${item.name}.zim`;
    const localPath = join(downloadPath, filename);

    // For analysis, we check if the file exists but don't create directories
    let exists = false;
    let actualSizeGB = 0;
    let needsUpdate = false;

    try {
      if (existsSync(localPath)) {
        exists = true;
        const stats = statSync(localPath);
        actualSizeGB = stats.size / (1024 * 1024 * 1024);

        // Check if file size matches expected size (simple update check)
        const sizeDifference = Math.abs(actualSizeGB - item.expected_size_gb);
        needsUpdate = sizeDifference > 0.1; // Allow 100MB difference
      }
    } catch (error) {
      // If we can't access the file system (e.g., directory doesn't exist),
      // just treat as not existing - this is fine for analysis
      console.log(`📝 Kiwix file not accessible during analysis: ${localPath} (this is normal if not downloaded yet)`);
      exists = false;
      actualSizeGB = 0;
      needsUpdate = false;
    }

    return {
      name: item.name,
      filename,
      local_path: localPath,
      exists,
      size_gb: actualSizeGB,
      expected_size_gb: item.expected_size_gb,
      needs_update: needsUpdate,
      category: item.category,
      description: item.description,
      priority: item.priority,
    };
  }

  /**
   * Check which Kiwix files need updates
   */
  async checkForUpdates(): Promise<KiwixAnalysisInfo[]> {
    console.log('🔍 Checking Kiwix files for updates...');
    
    const kiwixItems = this.config.collection.kiwix || [];
    const updateInfo: KiwixAnalysisInfo[] = [];

    for (const item of kiwixItems) {
      const info = await this.getKiwixItemInfo(item);
      updateInfo.push(info);
      
      const status = info.exists 
        ? (info.needs_update ? '🔄 UPDATE NEEDED' : '✅ UP TO DATE')
        : '📥 NOT DOWNLOADED';
      
      console.log(`${status} ${item.name} (${info.size_gb.toFixed(1)}GB / ${item.expected_size_gb}GB expected)`);
    }

    return updateInfo;
  }

  /**
   * Get summary statistics for Kiwix collection
   */
  async getKiwixStats(): Promise<{
    total_items: number;
    downloaded_items: number;
    missing_items: number;
    outdated_items: number;
    total_size_gb: number;
    expected_size_gb: number;
  }> {
    const kiwixItems = this.config.collection.kiwix || [];
    const updateInfo = await this.checkForUpdates();

    const downloadedItems = updateInfo.filter(info => info.exists && !info.needs_update);
    const missingItems = updateInfo.filter(info => !info.exists);
    const outdatedItems = updateInfo.filter(info => info.exists && info.needs_update);

    const totalSizeGB = updateInfo.reduce((sum, info) => sum + info.size_gb, 0);
    const expectedSizeGB = kiwixItems.reduce((sum, item) => sum + item.expected_size_gb, 0);

    return {
      total_items: kiwixItems.length,
      downloaded_items: downloadedItems.length,
      missing_items: missingItems.length,
      outdated_items: outdatedItems.length,
      total_size_gb: totalSizeGB,
      expected_size_gb: expectedSizeGB,
    };
  }

  /**
   * Get the Kiwix downloader instance for performing downloads
   */
  getDownloader(): KiwixDownloader {
    return this.downloader;
  }
}
