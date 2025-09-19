import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
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
  private static readonly CACHE_VERSION = '1.0.0';
  private static readonly CACHE_FILENAME = '.media-collection-cache.json';
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  private cachePath: string;
  private cache: CacheData;

  constructor(cacheDir: string = process.cwd()) {
    this.cachePath = join(cacheDir, MetadataCache.CACHE_FILENAME);
    this.cache = {
      version: MetadataCache.CACHE_VERSION,
      entries: {},
    };
  }

  /**
   * Load cache from disk
   */
  async loadCache(): Promise<void> {
    if (!existsSync(this.cachePath)) {
      return;
    }

    try {
      const cacheContent = await readFile(this.cachePath, 'utf-8');
      const loadedCache = JSON.parse(cacheContent) as CacheData;

      // Check cache version compatibility
      if (loadedCache.version !== MetadataCache.CACHE_VERSION) {
        console.warn('⚠️  Cache version mismatch, starting with fresh cache');
        return;
      }

      this.cache = loadedCache;
      console.log(`📦 Loaded ${Object.keys(this.cache.entries).length} cached entries`);
    } catch (error) {
      console.warn('⚠️  Failed to load cache, starting fresh:', error);
    }
  }

  /**
   * Save cache to disk
   */
  async saveCache(): Promise<void> {
    try {
      // Ensure cache directory exists
      const cacheDir = dirname(this.cachePath);
      if (!existsSync(cacheDir)) {
        await mkdir(cacheDir, { recursive: true });
      }

      const cacheContent = JSON.stringify(this.cache, null, 2);
      await writeFile(this.cachePath, cacheContent, 'utf-8');
      console.log(`💾 Saved cache with ${Object.keys(this.cache.entries).length} entries`);
    } catch (error) {
      console.warn('⚠️  Failed to save cache:', error);
    }
  }

  /**
   * Get cached directory info if valid
   */
  getCachedInfo(path: string): DirectoryInfo | null {
    const entry = this.cache.entries[path];
    
    if (!entry) {
      return null;
    }

    // Check if cache entry is expired
    const now = Date.now();
    if (now - entry.timestamp > MetadataCache.CACHE_TTL_MS) {
      delete this.cache.entries[path];
      return null;
    }

    // Check if directory has been modified since cache
    if (existsSync(path)) {
      try {
        const stat = require('fs').statSync(path);
        if (stat.mtimeMs > entry.lastModified) {
          delete this.cache.entries[path];
          return null;
        }
      } catch {
        // If we can't stat the file, assume it's changed
        delete this.cache.entries[path];
        return null;
      }
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
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    cacheHitRate: number;
    oldestEntry: number;
    newestEntry: number;
  } {
    const entries = Object.values(this.cache.entries);
    const totalEntries = entries.length;
    
    if (totalEntries === 0) {
      return {
        totalEntries: 0,
        cacheHitRate: 0,
        oldestEntry: 0,
        newestEntry: 0,
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
    };
  }
}
