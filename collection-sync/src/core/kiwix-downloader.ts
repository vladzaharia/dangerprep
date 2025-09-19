import { createWriteStream, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { getConfig } from '../config/loader.js';
import type { KiwixItem, KiwixMirror, KiwixConfig } from '../config/schema.js';

export interface KiwixFileInfo {
  name: string;
  filename: string;
  size_gb: number;
  url: string;
  mirror: string;
  local_path: string;
  exists: boolean;
  needs_update: boolean;
  checksum?: string;
}

export interface MirrorSpeedTest {
  mirror: KiwixMirror;
  speed_mbps: number;
  latency_ms: number;
  success: boolean;
  error?: string;
}

export interface KiwixSyncResult {
  downloaded: KiwixFileInfo[];
  skipped: KiwixFileInfo[];
  failed: KiwixFileInfo[];
  total_size_gb: number;
  download_time_seconds: number;
}

export class KiwixDownloader {
  private config = getConfig();
  private kiwixConfig: KiwixConfig;

  constructor() {
    this.kiwixConfig = this.config.kiwix_config || this.getDefaultKiwixConfig();
  }

  private getDefaultKiwixConfig(): KiwixConfig {
    return {
      mirrors: [
        { name: 'Official Kiwix', url: 'https://download.kiwix.org', priority: 1, enabled: true },
        { name: 'FAU Mirror', url: 'https://ftp.fau.de/kiwix', priority: 2, enabled: true },
        { name: 'DotsRC Mirror', url: 'https://mirrors.dotsrc.org/kiwix', priority: 3, enabled: true },
        { name: 'UMU Mirror', url: 'https://laotzu.ftp.acc.umu.se/mirror/kiwix.org', priority: 4, enabled: true },
        { name: 'Mirror Service', url: 'https://www.mirrorservice.org/sites/download.kiwix.org', priority: 5, enabled: true },
      ],
      download_path: '/content/kiwix',
      speed_test_timeout_seconds: 30,
      speed_test_size_mb: 10,
      parallel_downloads: 3,
      retry_attempts: 3,
      verify_checksums: true,
    };
  }

  private ensureDownloadDirectory(): void {
    if (!existsSync(this.kiwixConfig.download_path)) {
      mkdirSync(this.kiwixConfig.download_path, { recursive: true });
      console.log(`📁 Created Kiwix download directory: ${this.kiwixConfig.download_path}`);
    }
  }

  /**
   * Test download speeds for all enabled mirrors
   */
  async testMirrorSpeeds(): Promise<MirrorSpeedTest[]> {
    console.log('🚀 Testing mirror speeds...');
    
    const enabledMirrors = this.kiwixConfig.mirrors.filter(m => m.enabled);
    const results: MirrorSpeedTest[] = [];

    for (const mirror of enabledMirrors) {
      console.log(`⏱️  Testing ${mirror.name}...`);
      
      try {
        const startTime = Date.now();
        
        // Test with a small file or directory listing
        const testUrl = `${mirror.url}/zim/`;
        const response = await fetch(testUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(this.kiwixConfig.speed_test_timeout_seconds * 1000),
        });

        const endTime = Date.now();
        const latency = endTime - startTime;

        if (response.ok) {
          // Estimate speed based on latency (lower is better)
          const estimatedSpeed = Math.max(1, 100 - (latency / 10));
          
          results.push({
            mirror,
            speed_mbps: estimatedSpeed,
            latency_ms: latency,
            success: true,
          });

          console.log(`✅ ${mirror.name}: ${latency}ms latency, estimated ${estimatedSpeed.toFixed(1)} Mbps`);
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          mirror,
          speed_mbps: 0,
          latency_ms: 0,
          success: false,
          error: errorMessage,
        });

        console.log(`❌ ${mirror.name}: ${errorMessage}`);
      }
    }

    // Sort by speed (fastest first)
    results.sort((a, b) => b.speed_mbps - a.speed_mbps);
    
    console.log('📊 Mirror speed test complete');
    return results;
  }

  /**
   * Get the best available mirror based on speed tests
   */
  async getBestMirror(): Promise<KiwixMirror | null> {
    const speedTests = await this.testMirrorSpeeds();
    const bestMirror = speedTests.find(test => test.success);
    
    if (bestMirror) {
      console.log(`🏆 Best mirror: ${bestMirror.mirror.name} (${bestMirror.speed_mbps.toFixed(1)} Mbps)`);
      return bestMirror.mirror;
    }

    console.warn('⚠️  No working mirrors found');
    return null;
  }

  /**
   * Check which ZIM files need to be downloaded or updated
   */
  async checkForUpdates(): Promise<KiwixFileInfo[]> {
    console.log('🔍 Checking for ZIM file updates...');
    
    const kiwixItems = this.config.collection.kiwix || [];
    const fileInfos: KiwixFileInfo[] = [];

    const bestMirror = await this.getBestMirror();
    if (!bestMirror) {
      throw new Error('No working mirrors available');
    }

    for (const item of kiwixItems) {
      const fileInfo = await this.getFileInfo(item, bestMirror);
      fileInfos.push(fileInfo);
      
      const status = fileInfo.exists 
        ? (fileInfo.needs_update ? '🔄 UPDATE' : '✅ OK')
        : '📥 NEW';
      
      console.log(`${status} ${item.name} (${item.expected_size_gb}GB)`);
    }

    return fileInfos;
  }

  private async getFileInfo(item: KiwixItem, mirror: KiwixMirror): Promise<KiwixFileInfo> {
    // Map item names to actual ZIM filenames
    const filenameMap: Record<string, string> = {
      'wikivoyage_en_all_maxi': 'wikivoyage_en_all_maxi_2025-09.zim',
      'wikipedia_en_top_maxi': 'wikipedia_en_top_maxi_2025-09.zim',
      'bulbagarden_en_all_maxi': 'bulbagarden_en_all_maxi_2025-09.zim',
      'wikinews_en_all_maxi': 'wikinews_en_all_maxi_2025-09.zim',
    };

    const filename = filenameMap[item.name] || `${item.name}.zim`;
    const localPath = join(this.kiwixConfig.download_path, filename);
    
    // Determine the correct URL path based on the content type
    let urlPath = 'zim/';
    if (item.name.includes('wikipedia')) {
      urlPath = 'zim/wikipedia/';
    } else if (item.name.includes('wikivoyage')) {
      urlPath = 'zim/wikivoyage/';
    } else if (item.name.includes('wikinews')) {
      urlPath = 'zim/wikinews/';
    } else if (item.name.includes('bulbagarden')) {
      urlPath = 'zim/other/';
    }

    const url = `${mirror.url}/${urlPath}${filename}`;
    const exists = existsSync(localPath);
    
    let needsUpdate = false;
    if (exists) {
      // Check if file size matches expected size (simple update check)
      const stats = statSync(localPath);
      const actualSizeGB = stats.size / (1024 * 1024 * 1024);
      const sizeDifference = Math.abs(actualSizeGB - item.expected_size_gb);
      needsUpdate = sizeDifference > 0.1; // Allow 100MB difference
    }

    return {
      name: item.name,
      filename,
      size_gb: item.expected_size_gb,
      url,
      mirror: mirror.name,
      local_path: localPath,
      exists,
      needs_update: needsUpdate,
    };
  }

  /**
   * Download all new or updated ZIM files
   */
  async syncFiles(): Promise<KiwixSyncResult> {
    console.log('📦 Starting Kiwix file sync...');

    // Ensure download directory exists before downloading
    this.ensureDownloadDirectory();

    const startTime = Date.now();
    const fileInfos = await this.checkForUpdates();
    const filesToDownload = fileInfos.filter(f => !f.exists || f.needs_update);
    
    if (filesToDownload.length === 0) {
      console.log('✅ All ZIM files are up to date');
      return {
        downloaded: [],
        skipped: fileInfos,
        failed: [],
        total_size_gb: 0,
        download_time_seconds: 0,
      };
    }

    console.log(`📥 Downloading ${filesToDownload.length} files...`);
    
    const downloaded: KiwixFileInfo[] = [];
    const failed: KiwixFileInfo[] = [];
    let totalSizeGB = 0;

    // Download files sequentially to avoid overwhelming the server
    for (const fileInfo of filesToDownload) {
      try {
        console.log(`⬇️  Downloading ${fileInfo.name} (${fileInfo.size_gb}GB)...`);
        await this.downloadFile(fileInfo);
        downloaded.push(fileInfo);
        totalSizeGB += fileInfo.size_gb;
        console.log(`✅ Downloaded ${fileInfo.name}`);
      } catch (error) {
        console.error(`❌ Failed to download ${fileInfo.name}:`, error);
        failed.push(fileInfo);
      }
    }

    const endTime = Date.now();
    const downloadTimeSeconds = (endTime - startTime) / 1000;

    console.log(`🎉 Sync complete: ${downloaded.length} downloaded, ${failed.length} failed`);
    console.log(`📊 Total size: ${totalSizeGB.toFixed(1)}GB in ${downloadTimeSeconds.toFixed(1)}s`);

    return {
      downloaded,
      skipped: fileInfos.filter(f => f.exists && !f.needs_update),
      failed,
      total_size_gb: totalSizeGB,
      download_time_seconds: downloadTimeSeconds,
    };
  }

  private async downloadFile(fileInfo: KiwixFileInfo): Promise<void> {
    const response = await fetch(fileInfo.url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const writeStream = createWriteStream(fileInfo.local_path);
    await pipeline(response.body, writeStream);
  }
}
