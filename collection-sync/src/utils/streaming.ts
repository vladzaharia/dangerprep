/**
 * Streaming utilities for memory-efficient file system operations
 * Provides streaming patterns for large directory operations
 */

import { Readable, Transform } from 'stream';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { createOptimizedOperation } from './performance.js';

export interface FileEntry {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  mtime: Date;
}

export interface DirectoryStreamOptions {
  recursive?: boolean;
  includeFiles?: boolean;
  includeDirectories?: boolean;
  maxDepth?: number;
  filter?: (entry: FileEntry) => boolean;
  batchSize?: number;
}

/**
 * Streaming directory scanner that yields file entries without loading everything into memory
 */
export class DirectoryStream extends Readable {
  private queue: string[] = [];
  private processing = false;
  private currentDepth = 0;
  private processedCount = 0;
  private options: Required<DirectoryStreamOptions>;

  constructor(rootPath: string, options: DirectoryStreamOptions = {}) {
    super({ objectMode: true });
    
    this.options = {
      recursive: options.recursive ?? true,
      includeFiles: options.includeFiles ?? true,
      includeDirectories: options.includeDirectories ?? true,
      maxDepth: options.maxDepth ?? Infinity,
      filter: options.filter ?? (() => true),
      batchSize: options.batchSize ?? 100,
    };

    if (existsSync(rootPath)) {
      this.queue.push(rootPath);
    } else {
      this.push(null); // End stream if root doesn't exist
    }
  }

  async _read(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const currentPath = this.queue.shift()!;
        const entries = await this.processDirectory(currentPath);
        
        let pushedCount = 0;
        for (const entry of entries) {
          if (this.options.filter(entry)) {
            if (!this.push(entry)) {
              // Backpressure - stop processing
              this.processing = false;
              return;
            }
            pushedCount++;
            
            // Batch processing to prevent overwhelming the stream
            if (pushedCount >= this.options.batchSize) {
              break;
            }
          }
        }

        this.processedCount += entries.length;
      }

      // No more directories to process
      this.push(null);
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.processing = false;
    }
  }

  private async processDirectory(dirPath: string): Promise<FileEntry[]> {
    const operation = createOptimizedOperation(
      'streamDirectoryRead',
      async () => {
        const entries = await readdir(dirPath, { withFileTypes: true });
        const results: FileEntry[] = [];

        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          
          try {
            const stats = await stat(fullPath);
            const fileEntry: FileEntry = {
              path: fullPath,
              name: entry.name,
              isDirectory: entry.isDirectory(),
              size: stats.size,
              mtime: stats.mtime,
            };

            // Add to results if it matches our criteria
            if (
              (fileEntry.isDirectory && this.options.includeDirectories) ||
              (!fileEntry.isDirectory && this.options.includeFiles)
            ) {
              results.push(fileEntry);
            }

            // Queue subdirectories for processing if recursive
            if (
              this.options.recursive &&
              fileEntry.isDirectory &&
              this.currentDepth < this.options.maxDepth
            ) {
              this.queue.push(fullPath);
            }
          } catch (error) {
            // Skip entries we can't stat (permission issues, etc.)
            console.warn(`⚠️  Warning: Could not stat ${fullPath}:`, error);
          }
        }

        return results;
      },
      {
        retries: 2,
        timeout: 10000,
      }
    );

    return await operation();
  }

  getProcessedCount(): number {
    return this.processedCount;
  }
}

/**
 * Transform stream for filtering and processing file entries
 */
export class FileFilterTransform extends Transform {
  private mediaExtensions: Set<string>;
  private processedCount = 0;

  constructor(mediaExtensions: string[] = []) {
    super({ objectMode: true });
    this.mediaExtensions = new Set(mediaExtensions.map(ext => ext.toLowerCase()));
  }

  _transform(entry: FileEntry, encoding: string, callback: Function): void {
    this.processedCount++;

    try {
      // Add media file detection
      const isMediaFile = this.isMediaFile(entry.name);
      const enhancedEntry = {
        ...entry,
        isMediaFile,
      };

      callback(null, enhancedEntry);
    } catch (error) {
      callback(error);
    }
  }

  private isMediaFile(filename: string): boolean {
    const ext = filename.toLowerCase().split('.').pop();
    return ext ? this.mediaExtensions.has(`.${ext}`) : false;
  }

  getProcessedCount(): number {
    return this.processedCount;
  }
}

/**
 * Utility function to create a streaming directory scanner pipeline
 */
export function createDirectoryScanner(
  rootPath: string,
  options: DirectoryStreamOptions = {}
): DirectoryStream {
  return new DirectoryStream(rootPath, options);
}

/**
 * Utility function to count files in a directory using streaming
 */
export async function countFilesStreaming(
  dirPath: string,
  mediaExtensions: string[] = []
): Promise<{ totalFiles: number; mediaFiles: number; directories: number }> {
  return new Promise((resolve, reject) => {
    let totalFiles = 0;
    let mediaFiles = 0;
    let directories = 0;

    const scanner = createDirectoryScanner(dirPath, {
      recursive: true,
      includeFiles: true,
      includeDirectories: true,
    });

    const filter = new FileFilterTransform(mediaExtensions);

    scanner
      .pipe(filter)
      .on('data', (entry: FileEntry & { isMediaFile: boolean }) => {
        if (entry.isDirectory) {
          directories++;
        } else {
          totalFiles++;
          if (entry.isMediaFile) {
            mediaFiles++;
          }
        }
      })
      .on('end', () => {
        resolve({ totalFiles, mediaFiles, directories });
      })
      .on('error', reject);
  });
}

/**
 * Utility function to get directory size using streaming (more memory efficient)
 */
export async function getDirectorySizeStreaming(dirPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let totalSize = 0;

    const scanner = createDirectoryScanner(dirPath, {
      recursive: true,
      includeFiles: true,
      includeDirectories: false, // We only need files for size calculation
    });

    scanner
      .on('data', (entry: FileEntry) => {
        if (!entry.isDirectory) {
          totalSize += entry.size;
        }
      })
      .on('end', () => {
        resolve(totalSize);
      })
      .on('error', reject);
  });
}

/**
 * Batch processor for streaming operations
 */
export class BatchProcessor<T> extends Transform {
  private batch: T[] = [];
  private batchSize: number;

  constructor(batchSize: number = 100) {
    super({ objectMode: true });
    this.batchSize = batchSize;
  }

  _transform(chunk: T, encoding: string, callback: Function): void {
    this.batch.push(chunk);

    if (this.batch.length >= this.batchSize) {
      callback(null, [...this.batch]);
      this.batch = [];
    } else {
      callback();
    }
  }

  _flush(callback: Function): void {
    if (this.batch.length > 0) {
      callback(null, [...this.batch]);
    } else {
      callback();
    }
  }
}
