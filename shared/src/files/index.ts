import { spawn } from 'child_process';
import { promises as fs, Stats, createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

import { Result, safeAsync } from '../errors/utils.js';
import type { Logger } from '../logging';

// Branded types for type safety
export type FilePath = string & { readonly __brand: 'FilePath' };
export type DirectoryPath = string & { readonly __brand: 'DirectoryPath' };
export type FileExtension = string & { readonly __brand: 'FileExtension' };
export type MimeType = string & { readonly __brand: 'MimeType' };
export type SizeString = string & { readonly __brand: 'SizeString' };

// Type guards for branded types
export function isFilePath(value: string): value is FilePath {
  return typeof value === 'string' && value.length > 0 && !value.endsWith('/');
}

export function isDirectoryPath(value: string): value is DirectoryPath {
  return typeof value === 'string' && value.length > 0;
}

export function isFileExtension(value: string): value is FileExtension {
  return typeof value === 'string' && value.startsWith('.') && value.length > 1;
}

export function isMimeType(value: string): value is MimeType {
  return typeof value === 'string' && /^[a-z]+\/[a-z0-9\-+.]+$/i.test(value);
}

export function isSizeString(value: string): value is SizeString {
  return typeof value === 'string' && /^\d+(?:\.\d+)?\s*[KMGT]?B$/i.test(value);
}

// Factory functions for branded types
export function createFilePath(path: string): FilePath {
  if (!isFilePath(path)) {
    throw new Error(`Invalid file path: ${path}`);
  }
  return path;
}

export function createDirectoryPath(path: string): DirectoryPath {
  if (!isDirectoryPath(path)) {
    throw new Error(`Invalid directory path: ${path}`);
  }
  return path;
}

export function createFileExtension(ext: string): FileExtension {
  if (!isFileExtension(ext)) {
    throw new Error(`Invalid file extension: ${ext}`);
  }
  return ext;
}

export function createMimeType(mime: string): MimeType {
  if (!isMimeType(mime)) {
    throw new Error(`Invalid MIME type: ${mime}`);
  }
  return mime;
}

export function createSizeString(size: string): SizeString {
  if (!isSizeString(size)) {
    throw new Error(`Invalid size string: ${size}`);
  }
  return size;
}

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
 * Advanced file operation options
 */
export interface FileOperationOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Progress callback for large operations */
  onProgress?: (progress: { completed: number; total: number }) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Logger instance */
  logger?: Logger;
}

/**
 * File metadata interface
 */
export interface FileMetadata {
  readonly path: FilePath;
  readonly size: number;
  readonly mtime: Date;
  readonly ctime: Date;
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly extension: FileExtension | null;
  readonly mimeType: MimeType | null;
  readonly permissions: string;
}

/**
 * File search options
 */
export interface FileSearchOptions {
  /** File extensions to include */
  extensions?: readonly FileExtension[];
  /** Maximum depth for recursive search */
  maxDepth?: number;
  /** Minimum file size in bytes */
  minSize?: number;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Modified after date */
  modifiedAfter?: Date;
  /** Modified before date */
  modifiedBefore?: Date;
  /** Include hidden files */
  includeHidden?: boolean;
  /** Custom filter function */
  filter?: (metadata: FileMetadata) => boolean;
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

/**
 * Advanced file utilities with Result patterns and modern TypeScript features
 */
export class AdvancedFileUtils {
  /**
   * Get comprehensive file metadata with Result pattern
   */
  static async getFileMetadata(filePath: FilePath): Promise<Result<FileMetadata>> {
    return safeAsync(async () => {
      const stats = await fs.stat(filePath);
      const extension = this.getFileExtensionSafe(filePath);
      const mimeType = await this.getMimeTypeSafe(filePath);

      return {
        path: filePath,
        size: stats.size,
        mtime: stats.mtime,
        ctime: stats.ctime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        extension,
        mimeType,
        permissions: stats.mode.toString(8),
      } as const satisfies FileMetadata;
    });
  }

  /**
   * Copy file with progress tracking and Result pattern
   */
  static async copyFileAdvanced(
    sourcePath: FilePath,
    destPath: FilePath,
    options: FileOperationOptions = {}
  ): Promise<Result<void>> {
    return safeAsync(async () => {
      const { timeout = 30000, onProgress, signal, logger } = options;

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`File copy timeout after ${timeout}ms`));
        }, timeout);

        signal?.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('File copy aborted'));
        });
      });

      // Get source file size for progress tracking
      const sourceStats = await fs.stat(sourcePath);
      let copiedBytes = 0;

      const copyPromise = pipeline(createReadStream(sourcePath), createWriteStream(destPath));

      if (onProgress) {
        // Simple progress tracking (could be enhanced with actual byte counting)
        const progressInterval = setInterval(() => {
          copiedBytes = Math.min(copiedBytes + sourceStats.size / 10, sourceStats.size);
          onProgress({ completed: copiedBytes, total: sourceStats.size });
        }, 100);

        copyPromise.finally(() => clearInterval(progressInterval));
      }

      await Promise.race([copyPromise, timeoutPromise]);

      logger?.info(`Successfully copied file from ${sourcePath} to ${destPath}`);
    });
  }

  /**
   * Process file in chunks with Result pattern
   */
  static async processFileInChunks<T>(
    filePath: FilePath,
    processor: (chunk: Buffer, offset: number) => Promise<T>,
    chunkSize: number = 64 * 1024, // 64KB default
    options: FileOperationOptions = {}
  ): Promise<Result<T[]>> {
    return safeAsync(async () => {
      const { signal, onProgress, logger } = options;
      const stats = await fs.stat(filePath);
      const results: T[] = [];
      let offset = 0;

      const fileHandle = await fs.open(filePath, 'r');

      try {
        while (offset < stats.size) {
          if (signal?.aborted) {
            throw new Error('File processing aborted');
          }

          const remainingBytes = stats.size - offset;
          const currentChunkSize = Math.min(chunkSize, remainingBytes);
          const buffer = Buffer.alloc(currentChunkSize);

          await fileHandle.read(buffer, 0, currentChunkSize, offset);
          const result = await processor(buffer, offset);
          results.push(result);

          offset += currentChunkSize;

          if (onProgress) {
            onProgress({ completed: offset, total: stats.size });
          }
        }

        logger?.info(`Successfully processed file ${filePath} in ${results.length} chunks`);
        return results;
      } finally {
        await fileHandle.close();
      }
    });
  }

  /**
   * Find files with advanced filtering and Result pattern
   */
  static async findFiles(
    searchPath: DirectoryPath,
    options: FileSearchOptions = {}
  ): Promise<Result<readonly FilePath[]>> {
    return safeAsync(async () => {
      const {
        extensions,
        maxDepth = Infinity,
        minSize,
        maxSize,
        modifiedAfter,
        modifiedBefore,
        includeHidden = false,
        filter,
      } = options;

      const results: FilePath[] = [];

      const searchRecursive = async (currentPath: string, depth: number): Promise<void> => {
        if (depth > maxDepth) return;

        const items = await fs.readdir(currentPath);

        for (const item of items) {
          if (!includeHidden && item.startsWith('.')) continue;

          const itemPath = path.join(currentPath, item);
          const stats = await fs.stat(itemPath);

          if (stats.isDirectory()) {
            await searchRecursive(itemPath, depth + 1);
          } else if (stats.isFile()) {
            // Apply size filters
            if (minSize !== undefined && stats.size < minSize) continue;
            if (maxSize !== undefined && stats.size > maxSize) continue;

            // Apply date filters
            if (modifiedAfter && stats.mtime < modifiedAfter) continue;
            if (modifiedBefore && stats.mtime > modifiedBefore) continue;

            // Apply extension filter
            if (extensions && extensions.length > 0) {
              const ext = this.getFileExtensionSafe(itemPath);
              if (!ext || !extensions.includes(ext)) continue;
            }

            // Apply custom filter
            if (filter) {
              const metadata = await this.createFileMetadata(itemPath, stats);
              if (!filter(metadata)) continue;
            }

            results.push(createFilePath(itemPath));
          }
        }
      };

      await searchRecursive(searchPath, 0);
      return results as readonly FilePath[];
    });
  }

  /**
   * Get file extension safely, returning null if invalid
   */
  private static getFileExtensionSafe(filePath: string): FileExtension | null {
    const ext = path.extname(filePath).toLowerCase();
    return isFileExtension(ext) ? ext : null;
  }

  /**
   * Get MIME type safely (basic implementation)
   */
  private static async getMimeTypeSafe(filePath: string): Promise<MimeType | null> {
    const ext = this.getFileExtensionSafe(filePath);
    if (!ext) return null;

    // Basic MIME type mapping
    const mimeMap: Record<string, string> = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
    };

    const mimeType = mimeMap[ext];
    return mimeType && isMimeType(mimeType) ? mimeType : null;
  }

  /**
   * Create file metadata from stats
   */
  private static async createFileMetadata(filePath: string, stats: Stats): Promise<FileMetadata> {
    const extension = this.getFileExtensionSafe(filePath);
    const mimeType = await this.getMimeTypeSafe(filePath);

    return {
      path: createFilePath(filePath),
      size: stats.size,
      mtime: stats.mtime,
      ctime: stats.ctime,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      extension,
      mimeType,
      permissions: stats.mode.toString(8),
    } as const satisfies FileMetadata;
  }

  /**
   * Ensure directory exists with Result pattern
   */
  static async ensureDirectoryAdvanced(dirPath: DirectoryPath): Promise<Result<void>> {
    return safeAsync(async () => {
      await fs.mkdir(dirPath, { recursive: true });
    });
  }

  /**
   * Check if file exists with Result pattern
   */
  static async fileExistsAdvanced(filePath: FilePath): Promise<Result<boolean>> {
    return safeAsync(async () => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Get directory size with Result pattern and progress tracking
   */
  static async getDirectorySizeAdvanced(
    dirPath: DirectoryPath,
    options: FileOperationOptions = {}
  ): Promise<Result<number>> {
    return safeAsync(async () => {
      const { signal, onProgress, logger } = options;
      let totalSize = 0;
      let processedItems = 0;
      let totalItems = 0;

      // First pass: count total items for progress tracking
      if (onProgress) {
        const countItems = async (dirPath: string): Promise<number> => {
          let count = 0;
          try {
            const items = await fs.readdir(dirPath);
            count += items.length;

            for (const item of items) {
              const itemPath = path.join(dirPath, item);
              const stats = await fs.stat(itemPath);
              if (stats.isDirectory()) {
                count += await countItems(itemPath);
              }
            }
          } catch {
            // Ignore errors during counting
          }
          return count;
        };

        totalItems = await countItems(dirPath);
      }

      const calculateSize = async (currentPath: string): Promise<number> => {
        if (signal?.aborted) {
          throw new Error('Directory size calculation aborted');
        }

        let size = 0;
        try {
          const items = await fs.readdir(currentPath);

          for (const item of items) {
            const itemPath = path.join(currentPath, item);
            const stats = await fs.stat(itemPath);

            if (stats.isDirectory()) {
              size += await calculateSize(itemPath);
            } else {
              size += stats.size;
            }

            processedItems++;
            if (onProgress && totalItems > 0) {
              onProgress({ completed: processedItems, total: totalItems });
            }
          }
        } catch {
          // Directory might not exist or be accessible
        }

        return size;
      };

      totalSize = await calculateSize(dirPath);
      logger?.info(`Calculated directory size: ${totalSize} bytes for ${dirPath}`);
      return totalSize;
    });
  }
}
