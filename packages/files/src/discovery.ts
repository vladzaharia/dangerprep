import { promises as fs, Stats } from 'fs';
import path from 'path';

import { Result, safeAsync } from '@dangerprep/errors';

import type {
  FilePath,
  DirectoryPath,
  FileExtension,
  MimeType,
  FileMetadata,
  FileSearchOptions,
  FileOperationOptions,
} from './types.js';
import { createFilePath, isFileExtension, isMimeType } from './types.js';
import { getFileExtension } from './utils.js';

/**
 * File discovery, search, and metadata operations
 *
 * Provides functionality for:
 * - Directory size calculations
 * - File search and traversal
 * - File metadata extraction
 * - MIME type detection
 */

/**
 * Calculate the total size of a directory recursively
 */
export async function getDirectorySize(
  dirPath: string,
  options: FileOperationOptions = {}
): Promise<number> {
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
}

/**
 * Get directory size with Result pattern and progress tracking
 */
export async function getDirectorySizeAdvanced(
  dirPath: DirectoryPath,
  options: FileOperationOptions = {}
): Promise<Result<number>> {
  return safeAsync(async () => {
    return getDirectorySize(dirPath, options);
  });
}

/**
 * Recursively get all files in a directory with optional extension filtering
 */
export async function getFilesRecursively(
  dirPath: string,
  extensions?: string[]
): Promise<string[]> {
  const files: string[] = [];

  try {
    const items = await fs.readdir(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);

      if (stats.isDirectory()) {
        const subFiles = await getFilesRecursively(itemPath, extensions);
        files.push(...subFiles);
      } else if (!extensions || extensions.includes(getFileExtension(itemPath))) {
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
 * Find files with advanced filtering and Result pattern
 */
export async function findFiles(
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
            const ext = getFileExtensionSafe(itemPath);
            if (!ext || !extensions.includes(ext)) continue;
          }

          // Apply custom filter
          if (filter) {
            const metadata = await createFileMetadata(itemPath, stats);
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
 * Get comprehensive file metadata with Result pattern
 */
export async function getFileMetadata(filePath: FilePath): Promise<Result<FileMetadata>> {
  return safeAsync(async () => {
    const stats = await fs.stat(filePath);
    const extension = getFileExtensionSafe(filePath);
    const mimeType = await getMimeTypeSafe(filePath);

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
 * Get file extension safely, returning null if invalid
 */
export function getFileExtensionSafe(filePath: string): FileExtension | null {
  const ext = path.extname(filePath).toLowerCase();
  return isFileExtension(ext) ? ext : null;
}

/**
 * Get MIME type safely (basic implementation)
 */
export async function getMimeTypeSafe(filePath: string): Promise<MimeType | null> {
  const ext = getFileExtensionSafe(filePath);
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
export async function createFileMetadata(filePath: string, stats: Stats): Promise<FileMetadata> {
  const extension = getFileExtensionSafe(filePath);
  const mimeType = await getMimeTypeSafe(filePath);

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
