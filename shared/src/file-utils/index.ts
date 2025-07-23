import { spawn } from 'child_process';
import { promises as fs, Stats } from 'fs';
import path from 'path';

import type { Logger } from '../logging';

/**
 * Options for rsync operations
 */
export interface RsyncOptions {
  /** Patterns to exclude from sync */
  exclude?: string[];
  /** Bandwidth limit (e.g., '1M', '500K', 'unlimited') */
  bandwidthLimit?: string;
  /** Perform dry run without actual file transfers */
  dryRun?: boolean;
  /** Logger instance for progress and error reporting */
  logger?: Logger;
}

/**
 * Comprehensive file utilities for sync services
 *
 * Provides common file operations including:
 * - Directory size calculations
 * - Size parsing and formatting
 * - File system operations (copy, move, delete)
 * - Directory management
 * - Rsync functionality
 */
export class FileUtils {
  /**
   * Calculate the total size of a directory recursively
   */
  static async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (_error) {
      // Directory might not exist or be accessible
      return 0;
    }

    return totalSize;
  }

  /**
   * Parse size string (e.g., "1.5GB", "500MB") to bytes
   */
  static parseSize(sizeStr: string): number {
    const units: { [key: string]: number } = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
    if (!match?.[1] || !match[2]) {
      throw new Error(`Invalid size format: ${sizeStr}`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    return value * (units[unit] || 1);
  }

  /**
   * Format bytes to human-readable string (e.g., "1.50 GB")
   */
  static formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Ensure directory exists, creating it recursively if needed
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory ${dirPath}: ${error}`);
    }
  }

  /**
   * Check if file or directory exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file
   */
  static async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      throw new Error(`Failed to delete file ${filePath}: ${error}`);
    }
  }

  /**
   * Move/rename a file
   */
  static async moveFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      await fs.rename(sourcePath, destPath);
    } catch (error) {
      throw new Error(`Failed to move file from ${sourcePath} to ${destPath}: ${error}`);
    }
  }

  /**
   * Copy a file
   */
  static async copyFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      await fs.copyFile(sourcePath, destPath);
    } catch (error) {
      throw new Error(`Failed to copy file from ${sourcePath} to ${destPath}: ${error}`);
    }
  }

  /**
   * Get file extension in lowercase
   */
  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }

  /**
   * Get filename without extension
   */
  static getFileName(filePath: string): string {
    return path.basename(filePath, path.extname(filePath));
  }

  /**
   * Recursively get all files in a directory with optional extension filtering
   */
  static async getFilesRecursively(dirPath: string, extensions?: string[]): Promise<string[]> {
    const files: string[] = [];

    try {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory()) {
          const subFiles = await this.getFilesRecursively(itemPath, extensions);
          files.push(...subFiles);
        } else if (!extensions || extensions.includes(this.getFileExtension(itemPath))) {
          files.push(itemPath);
        }
      }
    } catch (_error) {
      // Directory might not exist or be accessible
      return [];
    }

    return files;
  }

  /**
   * Synchronize directories using rsync
   */
  static async rsyncDirectory(
    sourcePath: string,
    destPath: string,
    options: RsyncOptions = {}
  ): Promise<boolean> {
    return new Promise(resolve => {
      const args = ['-avz', '--progress', '--stats'];

      // Add exclusions
      if (options.exclude) {
        options.exclude.forEach(pattern => {
          args.push('--exclude', pattern);
        });
      }

      // Add bandwidth limit
      if (options.bandwidthLimit && options.bandwidthLimit !== 'unlimited') {
        args.push(`--bwlimit=${options.bandwidthLimit}`);
      }

      // Add dry run
      if (options.dryRun) {
        args.push('--dry-run');
      }

      args.push(sourcePath.endsWith('/') ? sourcePath : `${sourcePath}/`, destPath);

      const rsyncProcess = spawn('rsync', args);

      rsyncProcess.stdout.on('data', data => {
        // Log progress information
        if (options.logger) {
          options.logger.info(`rsync: ${data.toString().trim()}`);
        }
      });

      rsyncProcess.stderr.on('data', data => {
        if (options.logger) {
          options.logger.error(`rsync stderr: ${data.toString().trim()}`);
        }
      });

      rsyncProcess.on('close', code => {
        resolve(code === 0);
      });

      rsyncProcess.on('error', error => {
        if (options.logger) {
          options.logger.error(`Failed to start rsync: ${error}`);
        }
        resolve(false);
      });
    });
  }

  /**
   * Sanitize path to prevent path traversal attacks
   */
  static sanitizePath(inputPath: string): string {
    // Remove any path traversal attempts
    const sanitized = path.normalize(inputPath).replace(/^(\.\.[/\\])+/, '');

    // Ensure the path doesn't start with / or \ to prevent absolute path access
    return sanitized.replace(/^[/\\]+/, '');
  }

  /**
   * Get file stats (size, modification time, etc.)
   */
  static async getFileStats(filePath: string): Promise<Stats | null> {
    try {
      return await fs.stat(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Check if path is a directory
   */
  static async isDirectory(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a file
   */
  static async isFile(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Create a temporary file with optional content
   */
  static async createTempFile(content?: string, extension?: string): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'dangerprep-'));
    const tempFile = path.join(tempDir, `temp${extension || '.tmp'}`);

    if (content !== undefined) {
      await fs.writeFile(tempFile, content);
    }

    return tempFile;
  }

  /**
   * Remove directory recursively
   */
  static async removeDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Failed to remove directory ${dirPath}: ${error}`);
    }
  }
}
