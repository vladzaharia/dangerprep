import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, resolve } from 'path';
import fg from 'fast-glob';
import { getConfig } from '../config/loader.js';

const execAsync = promisify(exec);

export interface DirectoryInfo {
  path: string;
  exists: boolean;
  sizeGB: number;
  fileCount: number;
  mediaFileCount: number;
  isEmpty: boolean;
}

export class FileSystemManager {
  private config = getConfig();

  /**
   * Get directory size in GB using the system 'du' command for accuracy
   */
  async getDirectorySize(path: string): Promise<number> {
    if (!existsSync(path)) {
      return 0;
    }

    try {
      const { stdout } = await execAsync(`du -sb "${path}"`);
      const sizeBytes = parseInt(stdout.split('\t')[0] || '0', 10);
      return sizeBytes / (1024 ** 3); // Convert to GB
    } catch (error) {
      console.warn(`⚠️  Warning: Could not calculate size for ${path}:`, error);
      return 0;
    }
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
   */
  async countMediaFiles(path: string): Promise<number> {
    if (!existsSync(path)) {
      return 0;
    }

    try {
      const extensions = this.config.media_extensions.map(ext =>
        ext.startsWith('.') ? ext.slice(1) : ext
      );

      const escapedPath = this.escapeGlobPath(path);
      const pattern = `${escapedPath}/**/*.{${extensions.join(',')}}`;
      const files = await fg(pattern, {
        caseSensitiveMatch: false,
        onlyFiles: true,
        followSymbolicLinks: false,
      });

      return files.length;
    } catch (error) {
      console.warn(`⚠️  Warning: Could not count media files in ${path}:`, error);
      return 0;
    }
  }

  /**
   * Count all files in a directory
   */
  async countAllFiles(path: string): Promise<number> {
    if (!existsSync(path)) {
      return 0;
    }

    try {
      const escapedPath = this.escapeGlobPath(path);
      const files = await fg(`${escapedPath}/**/*`, {
        onlyFiles: true,
        followSymbolicLinks: false,
      });

      return files.length;
    } catch (error) {
      console.warn(`⚠️  Warning: Could not count files in ${path}:`, error);
      return 0;
    }
  }

  /**
   * Get comprehensive directory information
   */
  async getDirectoryInfo(path: string): Promise<DirectoryInfo> {
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

    const [sizeGB, fileCount, mediaFileCount] = await Promise.all([
      this.getDirectorySize(path),
      this.countAllFiles(path),
      this.countMediaFiles(path),
    ]);

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
   */
  async listDirectories(basePath: string): Promise<string[]> {
    if (!existsSync(basePath)) {
      return [];
    }

    try {
      const entries = await readdir(basePath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort();
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

    // Calculate size for each requested season that exists
    for (const seasonNumber of selectedSeasons) {
      const seasonDir = seasonDirs.find(s => s.seasonNumber === seasonNumber);
      if (seasonDir) {
        const seasonSize = await this.getDirectorySize(seasonDir.path);
        seasonSizes.push({
          season: seasonNumber,
          size: seasonSize,
          path: seasonDir.path
        });
        totalSize += seasonSize;
      } else {
        console.warn(`⚠️  Warning: Season ${seasonNumber} not found in ${showPath}`);
      }
    }

    return {
      totalSize,
      seasonSizes,
      hasAllSeasons
    };
  }

  /**
   * Get available directories for each content type
   */
  async getAvailableContent(): Promise<{
    movies: string[];
    tv: string[];
    games: string[];
    webtv: string[];
  }> {
    const [movies, tv, games, webtv] = await Promise.all([
      this.listDirectories(this.config.nfs_paths.movies),
      this.listDirectories(this.config.nfs_paths.tv),
      this.listDirectories(this.config.nfs_paths.games),
      this.listDirectories(this.config.nfs_paths.webtv),
    ]);

    return { movies, tv, games, webtv };
  }
}
