import { spawn } from 'child_process';
import { promises as fs, createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

import { Result, safeAsync } from '@dangerprep/errors';

import type { FilePath, RsyncOptions, FileOperationOptions } from './types.js';

/**
 * Synchronization and advanced copying operations
 *
 * Provides specialized operations for sync services:
 * - Rsync directory synchronization
 * - Advanced file copying with progress tracking
 * - File chunk processing
 */

/**
 * Synchronize directories using rsync
 */
export async function rsyncDirectory(
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
 * Copy file with progress tracking and Result pattern
 */
export async function copyFileAdvanced(
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
export async function processFileInChunks<T>(
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
