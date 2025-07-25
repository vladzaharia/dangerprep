import { promises as fs, Stats } from 'fs';
import path from 'path';

import { Result, safeAsync } from '@dangerprep/errors';

import type { FilePath, DirectoryPath } from './types.js';

/**
 * Basic file system operations
 *
 * Provides CRUD operations for files and directories:
 * - File existence checks
 * - Directory creation and removal
 * - File operations (copy, move, delete)
 * - File stats and type checking
 * - Temporary file creation
 */

/**
 * Check if file or directory exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if file exists with Result pattern
 */
export async function fileExistsAdvanced(filePath: FilePath): Promise<Result<boolean>> {
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
 * Ensure directory exists, creating it recursively if needed
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory ${dirPath}: ${error}`);
  }
}

/**
 * Ensure directory exists with Result pattern
 */
export async function ensureDirectoryAdvanced(dirPath: DirectoryPath): Promise<Result<void>> {
  return safeAsync(async () => {
    await fs.mkdir(dirPath, { recursive: true });
  });
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    throw new Error(`Failed to delete file ${filePath}: ${error}`);
  }
}

/**
 * Move/rename a file
 */
export async function moveFile(sourcePath: string, destPath: string): Promise<void> {
  try {
    await fs.rename(sourcePath, destPath);
  } catch (error) {
    throw new Error(`Failed to move file from ${sourcePath} to ${destPath}: ${error}`);
  }
}

/**
 * Copy a file
 */
export async function copyFile(sourcePath: string, destPath: string): Promise<void> {
  try {
    await fs.copyFile(sourcePath, destPath);
  } catch (error) {
    throw new Error(`Failed to copy file from ${sourcePath} to ${destPath}: ${error}`);
  }
}

/**
 * Remove directory recursively
 */
export async function removeDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    throw new Error(`Failed to remove directory ${dirPath}: ${error}`);
  }
}

/**
 * Get file stats (size, modification time, etc.)
 */
export async function getFileStats(filePath: string): Promise<Stats | null> {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

/**
 * Check if path is a directory
 */
export async function isDirectory(dirPath: string): Promise<boolean> {
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
export async function isFile(filePath: string): Promise<boolean> {
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
export async function createTempFile(content?: string, extension?: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'dangerprep-'));
  const tempFile = path.join(tempDir, `temp${extension || '.tmp'}`);

  if (content !== undefined) {
    await fs.writeFile(tempFile, content);
  }

  return tempFile;
}
