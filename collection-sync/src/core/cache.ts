import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { PerformanceManager, createOptimizedOperation } from '../utils/performance.js';
import type { DirectoryInfo } from './filesystem.js';

export interface CacheEntry {
  path: string;
  lastModified: number;
  directoryInfo: DirectoryInfo;
  timestamp: number;
}

export interface CacheData {
  version: string;
  entries: Record<string, CacheEntry>;
}

export class MetadataCache {
  private static readonly CACHE_VERSION = '2.0.0'; // Bumped for enhanced features
  private static readonly CACHE_FILENAME = '.media-collection-cache.json';
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly PRELOAD_BATCH_SIZE = 20; // Number of paths to preload at once

  private cachePath: string;
  private cache: CacheData;
  private perfManager: PerformanceManager;
  private preloadQueue: Set<string> = new Set();
  private isPreloading = false;

  constructor(cacheDir: string = process.cwd()) {
    this.cachePath = join(cacheDir, MetadataCache.CACHE_FILENAME);
    this.cache = {
      version: MetadataCache.CACHE_VERSION,
      entries: {},
    };
    this.perfManager = PerformanceManager.getInstance();
  }

  /**
   * Load cache from disk with performance optimization
   */
  async loadCache(): Promise<void> {
    if (!existsSync(this.cachePath)) {
      return;
    }

    const operation = createOptimizedOperation(
      'loadCache',
      async () => {
        const cacheContent = await readFile(this.cachePath, 'utf-8');
        const loadedCache = JSON.parse(cacheContent) as CacheData;

        // Check cache version compatibility
        if (loadedCache.version !== MetadataCache.CACHE_VERSION) {
          console.warn('⚠️  Cache version mismatch, starting with fresh cache');
          return null;
        }

        return loadedCache;
      },
      {
        retries: 2,
        timeout: 5000,
      }
    );

    try {
      const loadedCache = await operation();
      if (loadedCache) {
        this.cache = loadedCache;
        console.log(`📦 Loaded ${Object.keys(this.cache.entries).length} cached entries`);

        // Clean up expired entries on load
        this.clearExpired();
      }
    } catch (error) {
      console.warn('⚠️  Failed to load cache, starting fresh:', error);
    }
  }

  /**
   * Save cache to disk with performance optimization
   */
  async saveCache(): Promise<void> {
    const operation = createOptimizedOperation(
      'saveCache',
      async () => {
        // Ensure cache directory exists
        const cacheDir = dirname(this.cachePath);
        if (!existsSync(cacheDir)) {
          await mkdir(cacheDir, { recursive: true });
        }

        const cacheContent = JSON.stringify(this.cache, null, 2);
        await writeFile(this.cachePath, cacheContent, 'utf-8');
        return Object.keys(this.cache.entries).length;
      },
      {
        retries: 2,
        timeout: 10000,
      }
    );

    try {
      const entryCount = await operation();
      console.log(`💾 Saved cache with ${entryCount} entries`);
    } catch (error) {
      console.warn('⚠️  Failed to save cache:', error);
    }
  }

  /**
   * Get cached directory info if valid with intelligent invalidation
   */
  getCachedInfo(path: string): DirectoryInfo | null {
    const entry = this.cache.entries[path];

    if (!entry) {
      // Add to preload queue for future optimization
      this.queueForPreload(path);
      return null;
    }

    // Check if cache entry is expired
    const now = Date.now();
    if (now - entry.timestamp > MetadataCache.CACHE_TTL_MS) {
      delete this.cache.entries[path];
      this.queueForPreload(path);
      return null;
    }

    // Intelligent invalidation: check if directory has been modified
    if (existsSync(path)) {
      try {
        const stat = statSync(path);
        if (stat.mtimeMs > entry.lastModified) {
          delete this.cache.entries[path];
          this.queueForPreload(path);
          return null;
        }
      } catch {
        // If we can't stat the file, assume it's changed
        delete this.cache.entries[path];
        this.queueForPreload(path);
        return null;
      }
    } else {
      // Path no longer exists, remove from cache
      delete this.cache.entries[path];
      return null;
    }

    return entry.directoryInfo;
  }

  /**
   * Cache directory info
   */
  setCachedInfo(path: string, directoryInfo: DirectoryInfo): void {
    let lastModified = 0;
    
    if (existsSync(path)) {
      try {
        const stat = require('fs').statSync(path);
        lastModified = stat.mtimeMs;
      } catch {
        // If we can't stat the file, use current time
        lastModified = Date.now();
      }
    }

    this.cache.entries[path] = {
      path,
      lastModified,
      directoryInfo,
      timestamp: Date.now(),
    };
  }

  /**
   * Clear expired cache entries
   */
  clearExpired(): number {
    const now = Date.now();
    const initialCount = Object.keys(this.cache.entries).length;
    
    for (const [path, entry] of Object.entries(this.cache.entries)) {
      if (now - entry.timestamp > MetadataCache.CACHE_TTL_MS) {
        delete this.cache.entries[path];
      }
    }

    const finalCount = Object.keys(this.cache.entries).length;
    const removedCount = initialCount - finalCount;
    
    if (removedCount > 0) {
      console.log(`🧹 Removed ${removedCount} expired cache entries`);
    }

    return removedCount;
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    const count = Object.keys(this.cache.entries).length;
    this.cache.entries = {};
    console.log(`🗑️  Cleared ${count} cache entries`);
  }

  /**
   * Get cache statistics with enhanced metrics
   */
  getStats(): {
    totalEntries: number;
    cacheHitRate: number;
    oldestEntry: number;
    newestEntry: number;
    preloadQueueSize: number;
  } {
    const entries = Object.values(this.cache.entries);
    const totalEntries = entries.length;

    if (totalEntries === 0) {
      return {
        totalEntries: 0,
        cacheHitRate: 0,
        oldestEntry: 0,
        newestEntry: 0,
        preloadQueueSize: this.preloadQueue.size,
      };
    }

    const timestamps = entries.map(e => e.timestamp);
    const oldestEntry = Math.min(...timestamps);
    const newestEntry = Math.max(...timestamps);

    return {
      totalEntries,
      cacheHitRate: 0, // This would need to be tracked separately
      oldestEntry,
      newestEntry,
      preloadQueueSize: this.preloadQueue.size,
    };
  }

  /**
   * Queue a path for background preloading
   */
  private queueForPreload(path: string): void {
    if (!this.preloadQueue.has(path)) {
      this.preloadQueue.add(path);

      // Start preloading if not already running and queue is getting large
      if (!this.isPreloading && this.preloadQueue.size >= MetadataCache.PRELOAD_BATCH_SIZE) {
        this.startBackgroundPreload();
      }
    }
  }

  /**
   * Start background preloading of queued paths
   */
  private async startBackgroundPreload(): Promise<void> {
    if (this.isPreloading) {
      return;
    }

    this.isPreloading = true;
    console.log(`🔄 Starting background cache preload for ${this.preloadQueue.size} paths`);

    try {
      const pathsToPreload = Array.from(this.preloadQueue).slice(0, MetadataCache.PRELOAD_BATCH_SIZE);
      this.preloadQueue.clear();

      // Import FileSystemManager dynamically to avoid circular dependency
      const { FileSystemManager } = await import('./filesystem.js');
      const fs = new FileSystemManager();

      const results = await this.perfManager.executeParallel(
        pathsToPreload,
        async (path) => {
          if (existsSync(path)) {
            const directoryInfo = await fs.getDirectoryInfo(path);
            this.setCachedInfo(path, directoryInfo);
            return path;
          }
          return null;
        },
        {
          concurrency: 3, // Conservative for background operations
          operationName: 'backgroundPreload',
        }
      );

      const successCount = results.filter(r => r.success && r.data).length;
      console.log(`✅ Background preload complete: ${successCount}/${pathsToPreload.length} paths cached`);
    } catch (error) {
      console.warn('⚠️  Background preload failed:', error);
    } finally {
      this.isPreloading = false;
    }
  }

  /**
   * Manually trigger preloading for specific paths
   */
  async preloadPaths(paths: string[]): Promise<void> {
    for (const path of paths) {
      this.queueForPreload(path);
    }

    if (!this.isPreloading) {
      await this.startBackgroundPreload();
    }
  }

  /**
   * Refresh cache entries that are close to expiring
   */
  async refreshExpiringSoon(thresholdMs: number = 2 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const pathsToRefresh: string[] = [];

    for (const [path, entry] of Object.entries(this.cache.entries)) {
      const timeUntilExpiry = MetadataCache.CACHE_TTL_MS - (now - entry.timestamp);
      if (timeUntilExpiry <= thresholdMs && timeUntilExpiry > 0) {
        pathsToRefresh.push(path);
      }
    }

    if (pathsToRefresh.length > 0) {
      console.log(`🔄 Refreshing ${pathsToRefresh.length} cache entries expiring soon`);
      await this.preloadPaths(pathsToRefresh);
    }
  }
}
