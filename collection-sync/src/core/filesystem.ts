import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, resolve } from 'path';
import fg from 'fast-glob';
import { getConfig } from '../config/loader.js';
import { PerformanceManager, createOptimizedOperation, processBatch, ProgressInfo } from '../utils/performance.js';
import { countFilesStreaming, getDirectorySizeStreaming } from '../utils/streaming.js';

const execAsync = promisify(exec);

export interface DirectoryInfo {
  path: string;
  exists: boolean;
  sizeGB: number;
  fileCount: number;
  mediaFileCount: number;
  isEmpty: boolean;
}

export interface FileSystemOptions {
  onProgress?: (progress: ProgressInfo) => void;
  abortSignal?: AbortSignal;
  useStreaming?: boolean; // Enable streaming for large operations
}

export class FileSystemManager {
  private config = getConfig();
  private perfManager = PerformanceManager.getInstance();

  /**
   * Get directory size in GB using the system 'du' command for accuracy
   * Now with retry logic, performance tracking, and streaming support
   */
  async getDirectorySize(path: string, options?: FileSystemOptions): Promise<number> {
    if (!existsSync(path)) {
      return 0;
    }

    // Use streaming for large directories if enabled (fallback to du if streaming fails)
    if (options?.useStreaming) {
      try {
        return await this.getDirectorySizeStreaming(path, options);
      } catch (error) {
        console.warn(`⚠️  Streaming size calculation failed for ${path}, falling back to du:`, error);
      }
    }

    const operation = createOptimizedOperation(
      'getDirectorySize',
      async () => {
        const { stdout } = await execAsync(`du -sb "${path}"`);
        const sizeBytes = parseInt(stdout.split('\t')[0] || '0', 10);
        return sizeBytes / (1024 ** 3); // Convert to GB
      },
      {
        retries: 3,
        timeout: 30000, // 30 second timeout for large directories
      }
    );

    try {
      return await operation();
    } catch (error) {
      console.warn(`⚠️  Warning: Could not calculate size for ${path}:`, error);
      return 0;
    }
  }

  /**
   * Get directory size using streaming (memory efficient for large directories)
   */
  private async getDirectorySizeStreaming(path: string, options?: FileSystemOptions): Promise<number> {
    const operation = createOptimizedOperation(
      'getDirectorySizeStreaming',
      async () => {
        const sizeBytes = await getDirectorySizeStreaming(path);
        return sizeBytes / (1024 ** 3); // Convert to GB
      },
      {
        retries: 2,
        timeout: 60000, // Longer timeout for streaming large directories
      }
    );

    return await operation();
  }

  /**
   * Get filesystem capacity in GB for the filesystem containing the given path
   */
  async getFilesystemCapacity(path: string): Promise<number> {
    if (!existsSync(path)) {
      return 0;
    }

    try {
      // Use df with -BG to get size in GB, and target the specific path
      const { stdout } = await execAsync(`df -BG "${path}"`);
      const lines = stdout.trim().split('\n');

      // Skip header line, get the data line
      if (lines.length < 2) {
        console.warn(`⚠️  Warning: Unexpected df output format for ${path}`);
        return 0;
      }

      const dataLine = lines[lines.length - 1];
      if (!dataLine) {
        console.warn(`⚠️  Warning: Could not get data line from df output for ${path}`);
        return 0;
      }

      const columns = dataLine.split(/\s+/);

      // The second column should be the total size in GB (with 'G' suffix)
      if (columns.length < 2) {
        console.warn(`⚠️  Warning: Unexpected df column format for ${path}`);
        return 0;
      }

      const totalSizeStr = columns[1];
      if (!totalSizeStr) {
        console.warn(`⚠️  Warning: Could not parse size from df output for ${path}`);
        return 0;
      }

      const totalSizeGB = parseInt(totalSizeStr.replace('G', ''), 10);

      return isNaN(totalSizeGB) ? 0 : totalSizeGB;
    } catch (error) {
      console.warn(`⚠️  Warning: Could not get filesystem capacity for ${path}:`, error);
      return 0;
    }
  }

  /**
   * Get effective drive size in GB - uses actual filesystem capacity if destination exists,
   * otherwise falls back to configured size
   */
  async getEffectiveDriveSize(destinationPath: string, configuredSizeGB: number): Promise<number> {
    if (existsSync(destinationPath)) {
      const actualCapacity = await this.getFilesystemCapacity(destinationPath);
      if (actualCapacity > 0) {
        console.log(`📊 Using actual filesystem capacity: ${actualCapacity}GB (destination: ${destinationPath})`);
        return actualCapacity;
      }
    }

    console.log(`📊 Using configured drive size: ${configuredSizeGB}GB`);
    return configuredSizeGB;
  }

  /**
   * Escape special characters in paths for fast-glob
   */
  private escapeGlobPath(path: string): string {
    // Escape parentheses and other special glob characters
    return path.replace(/[()[\]{}*?]/g, '\\$&');
  }

  /**
   * Count media files in a directory using configured extensions
   * Now with performance optimization, retry logic, and streaming support
   */
  async countMediaFiles(path: string, options?: FileSystemOptions): Promise<number> {
    if (!existsSync(path)) {
      return 0;
    }

    // Use streaming for large directories if enabled
    if (options?.useStreaming) {
      return this.countMediaFilesStreaming(path, options);
    }

    const operation = createOptimizedOperation(
      'countMediaFiles',
      async () => {
        const extensions = this.config.media_extensions.map(ext =>
          ext.startsWith('.') ? ext.slice(1) : ext
        );

        const escapedPath = this.escapeGlobPath(path);
        const pattern = `${escapedPath}/**/*.{${extensions.join(',')}}`;
        const files = await fg(pattern, {
          caseSensitiveMatch: false,
          onlyFiles: true,
          followSymbolicLinks: false,
          signal: options?.abortSignal,
        });

        return files.length;
      },
      {
        retries: 2,
        timeout: 20000, // 20 second timeout
      }
    );

    try {
      return await operation();
    } catch (error) {
      console.warn(`⚠️  Warning: Could not count media files in ${path}:`, error);
      return 0;
    }
  }

  /**
   * Count media files using streaming (memory efficient for large directories)
   */
  private async countMediaFilesStreaming(path: string, options?: FileSystemOptions): Promise<number> {
    const operation = createOptimizedOperation(
      'countMediaFilesStreaming',
      async () => {
        const result = await countFilesStreaming(path, this.config.media_extensions);
        return result.mediaFiles;
      },
      {
        retries: 2,
        timeout: 30000, // Longer timeout for streaming
      }
    );

    try {
      return await operation();
    } catch (error) {
      console.warn(`⚠️  Warning: Could not count media files (streaming) in ${path}:`, error);
      return 0;
    }
  }

  /**
   * Count all files in a directory
   * Now with performance optimization, retry logic, and streaming support
   */
  async countAllFiles(path: string, options?: FileSystemOptions): Promise<number> {
    if (!existsSync(path)) {
      return 0;
    }

    // Use streaming for large directories if enabled
    if (options?.useStreaming) {
      return this.countAllFilesStreaming(path, options);
    }

    const operation = createOptimizedOperation(
      'countAllFiles',
      async () => {
        const escapedPath = this.escapeGlobPath(path);
        const files = await fg(`${escapedPath}/**/*`, {
          onlyFiles: true,
          followSymbolicLinks: false,
          signal: options?.abortSignal,
        });

        return files.length;
      },
      {
        retries: 2,
        timeout: 20000, // 20 second timeout
      }
    );

    try {
      return await operation();
    } catch (error) {
      console.warn(`⚠️  Warning: Could not count files in ${path}:`, error);
      return 0;
    }
  }

  /**
   * Count all files using streaming (memory efficient for large directories)
   */
  private async countAllFilesStreaming(path: string, options?: FileSystemOptions): Promise<number> {
    const operation = createOptimizedOperation(
      'countAllFilesStreaming',
      async () => {
        const result = await countFilesStreaming(path, this.config.media_extensions);
        return result.totalFiles;
      },
      {
        retries: 2,
        timeout: 30000, // Longer timeout for streaming
      }
    );

    try {
      return await operation();
    } catch (error) {
      console.warn(`⚠️  Warning: Could not count files (streaming) in ${path}:`, error);
      return 0;
    }
  }

  /**
   * Get comprehensive directory information
   * Now with parallel processing, performance optimization, and intelligent streaming
   */
  async getDirectoryInfo(path: string, options?: FileSystemOptions): Promise<DirectoryInfo> {
    const exists = existsSync(path);

    if (!exists) {
      return {
        path,
        exists: false,
        sizeGB: 0,
        fileCount: 0,
        mediaFileCount: 0,
        isEmpty: true,
      };
    }

    // Automatically enable streaming for potentially large directories
    const enhancedOptions = { ...options };
    if (!enhancedOptions.useStreaming) {
      // Enable streaming if directory appears large (heuristic: check if it has many immediate subdirectories)
      try {
        const entries = await readdir(path);
        if (entries.length > 100) { // Threshold for enabling streaming
          enhancedOptions.useStreaming = true;
          console.log(`🔄 Enabling streaming for large directory: ${path} (${entries.length} entries)`);
        }
      } catch (error) {
        // If we can't read the directory, proceed without streaming
      }
    }

    // Use performance manager for parallel execution with proper error handling
    const operations = [
      { name: 'size', op: () => this.getDirectorySize(path, enhancedOptions) },
      { name: 'fileCount', op: () => this.countAllFiles(path, enhancedOptions) },
      { name: 'mediaCount', op: () => this.countMediaFiles(path, enhancedOptions) },
    ];

    const results = await this.perfManager.executeParallel(
      operations,
      async (operation) => operation.op(),
      {
        concurrency: 3, // All three operations can run in parallel
        operationName: 'getDirectoryInfo',
        onProgress: options?.onProgress,
      }
    );

    // Extract results, defaulting to 0 on failure
    const sizeGB = results[0]?.success ? results[0].data! : 0;
    const fileCount = results[1]?.success ? results[1].data! : 0;
    const mediaFileCount = results[2]?.success ? results[2].data! : 0;

    return {
      path,
      exists: true,
      sizeGB,
      fileCount,
      mediaFileCount,
      isEmpty: fileCount === 0,
    };
  }

  /**
   * List all directories in a given path
   * Now with performance optimization and retry logic
   */
  async listDirectories(basePath: string, options?: FileSystemOptions): Promise<string[]> {
    if (!existsSync(basePath)) {
      return [];
    }

    const operation = createOptimizedOperation(
      'listDirectories',
      async () => {
        const entries = await readdir(basePath, { withFileTypes: true });
        return entries
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name)
          .sort();
      },
      {
        retries: 2,
        timeout: 10000, // 10 second timeout
      }
    );

    try {
      return await operation();
    } catch (error) {
      console.warn(`⚠️  Warning: Could not list directories in ${basePath}:`, error);
      return [];
    }
  }

  /**
   * List all files in a given path (non-recursive)
   */
  async listFiles(basePath: string): Promise<string[]> {
    if (!existsSync(basePath)) {
      return [];
    }

    try {
      const entries = await readdir(basePath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
        .sort();
    } catch (error) {
      console.warn(`⚠️  Warning: Could not list files in ${basePath}:`, error);
      return [];
    }
  }

  /**
   * Get file size in bytes
   */
  async getFileSize(filePath: string): Promise<number> {
    if (!existsSync(filePath)) {
      return 0;
    }

    try {
      const stats = statSync(filePath);
      return stats.size;
    } catch (error) {
      console.warn(`⚠️  Warning: Could not get file size for ${filePath}:`, error);
      return 0;
    }
  }

  /**
   * Recursively find all media files in a directory
   */
  async findMediaFiles(basePath: string): Promise<string[]> {
    if (!existsSync(basePath)) {
      return [];
    }

    try {
      const extensions = this.config.media_extensions.map(ext =>
        ext.startsWith('.') ? ext.slice(1) : ext
      );

      const escapedPath = this.escapeGlobPath(basePath);
      const pattern = `${escapedPath}/**/*.{${extensions.join(',')}}`;
      const files = await fg(pattern, {
        caseSensitiveMatch: false,
        onlyFiles: true,
        followSymbolicLinks: false,
      });

      return files.sort();
    } catch (error) {
      console.warn(`⚠️  Warning: Could not find media files in ${basePath}:`, error);
      return [];
    }
  }

  /**
   * Check if a path exists and is a directory
   */
  isDirectory(path: string): boolean {
    try {
      return existsSync(path) && statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Resolve a relative path to absolute
   */
  resolvePath(path: string): string {
    return resolve(path);
  }

  /**
   * Join path segments safely
   */
  joinPath(...segments: string[]): string {
    return join(...segments);
  }

  /**
   * Get season directories for a TV show
   * Looks for common season directory patterns like "Season 01", "Season 1", "S01", "S1", etc.
   */
  async getSeasonDirectories(showPath: string): Promise<{ seasonNumber: number; path: string; name: string }[]> {
    if (!existsSync(showPath)) {
      return [];
    }

    try {
      const entries = await readdir(showPath, { withFileTypes: true });
      const seasonDirs: { seasonNumber: number; path: string; name: string }[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const dirName = entry.name;
        const seasonNumber = this.extractSeasonNumber(dirName);

        if (seasonNumber !== null) {
          seasonDirs.push({
            seasonNumber,
            path: join(showPath, dirName),
            name: dirName
          });
        }
      }

      return seasonDirs.sort((a, b) => a.seasonNumber - b.seasonNumber);
    } catch (error) {
      console.warn(`⚠️  Warning: Could not list season directories in ${showPath}:`, error);
      return [];
    }
  }

  /**
   * Extract season number from directory name
   * Supports patterns like: "Season 01", "Season 1", "S01", "S1", "01", "1"
   */
  private extractSeasonNumber(dirName: string): number | null {
    const patterns = [
      /^Season\s+(\d+)$/i,           // "Season 01", "Season 1"
      /^S(\d+)$/i,                  // "S01", "S1"
      /^(\d+)$/,                    // "01", "1"
      /^Season\s*(\d+)$/i,          // "Season01", "Season1" (no space)
    ];

    for (const pattern of patterns) {
      const match = dirName.match(pattern);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }

    return null;
  }

  /**
   * Calculate size for specific seasons of a TV show
   * If no seasons are specified, returns the total show size
   * If seasons are specified, only calculates size for those seasons
   */
  async getSeasonSpecificSize(showPath: string, selectedSeasons?: number[]): Promise<{
    totalSize: number;
    seasonSizes: { season: number; size: number; path: string }[];
    hasAllSeasons: boolean;
  }> {
    if (!selectedSeasons || selectedSeasons.length === 0) {
      // No specific seasons requested, return total show size
      const totalSize = await this.getDirectorySize(showPath);
      return {
        totalSize,
        seasonSizes: [],
        hasAllSeasons: true
      };
    }

    const seasonDirs = await this.getSeasonDirectories(showPath);
    const availableSeasons = seasonDirs.map(s => s.seasonNumber);
    const seasonSizes: { season: number; size: number; path: string }[] = [];
    let totalSize = 0;

    // Check if we have all requested seasons
    const missingSeasons = selectedSeasons.filter(s => !availableSeasons.includes(s));
    const hasAllSeasons = missingSeasons.length === 0;

    // Calculate size for each requested season that exists - now in parallel
    const validSeasonDirs = selectedSeasons
      .map(seasonNumber => ({
        seasonNumber,
        seasonDir: seasonDirs.find(s => s.seasonNumber === seasonNumber)
      }))
      .filter(item => item.seasonDir !== undefined);

    if (validSeasonDirs.length > 0) {
      const results = await this.perfManager.executeParallel(
        validSeasonDirs,
        async (item) => {
          const size = await this.getDirectorySize(item.seasonDir!.path);
          return {
            season: item.seasonNumber,
            size,
            path: item.seasonDir!.path
          };
        },
        {
          concurrency: 3, // Process up to 3 seasons in parallel
          operationName: 'getSeasonSizes',
        }
      );

      // Collect successful results
      for (const result of results) {
        if (result.success && result.data) {
          seasonSizes.push(result.data);
          totalSize += result.data.size;
        }
      }
    }

    // Warn about missing seasons
    const missingSeasons = selectedSeasons.filter(s => !availableSeasons.includes(s));
    for (const seasonNumber of missingSeasons) {
      console.warn(`⚠️  Warning: Season ${seasonNumber} not found in ${showPath}`);
    }

    return {
      totalSize,
      seasonSizes,
      hasAllSeasons
    };
  }

  /**
   * Get available directories for each content type
   * Now with performance optimization and progress tracking
   */
  async getAvailableContent(options?: FileSystemOptions): Promise<{
    movies: string[];
    tv: string[];
    games: string[];
    webtv: string[];
  }> {
    const contentTypes = [
      { name: 'movies', path: this.config.nfs_paths.movies },
      { name: 'tv', path: this.config.nfs_paths.tv },
      { name: 'games', path: this.config.nfs_paths.games },
      { name: 'webtv', path: this.config.nfs_paths.webtv },
    ];

    const results = await this.perfManager.executeParallel(
      contentTypes,
      async (contentType) => ({
        type: contentType.name,
        directories: await this.listDirectories(contentType.path, options),
      }),
      {
        concurrency: 4, // All content types can be scanned in parallel
        operationName: 'getAvailableContent',
        onProgress: options?.onProgress,
      }
    );

    // Build result object from successful operations
    const content = { movies: [], tv: [], games: [], webtv: [] } as {
      movies: string[];
      tv: string[];
      games: string[];
      webtv: string[];
    };

    for (const result of results) {
      if (result.success && result.data) {
        const { type, directories } = result.data;
        (content as any)[type] = directories;
      }
    }

    return content;
  }
}
