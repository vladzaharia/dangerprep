import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

import { ErrorFactory, runWithErrorContext } from '@dangerprep/errors';
import { ensureDirectory, parseSize } from '@dangerprep/files';
import type { Logger } from '@dangerprep/logging';

import {
  FileTransfer,
  ProgressInfo,
  calculateProgress,
  calculateSpeed,
  calculateETA,
} from '../types';

export interface TransferOptions {
  chunkSize?: string;
  verifyTransfer?: boolean;
  createCompletionMarkers?: boolean;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  resumeTransfer?: boolean;
  checksumAlgorithm?: 'md5' | 'sha1' | 'sha256';
  bandwidth?: number; // bytes per second limit
  onProgress?: (progress: ProgressInfo) => void;
  signal?: AbortSignal;
}

export interface TransferEngineConfig {
  maxConcurrentTransfers: number;
  defaultChunkSize: string;
  defaultTimeout: number;
  defaultRetryAttempts: number;
  defaultRetryDelay: number;
  verifyTransfers: boolean;
  createCompletionMarkers: boolean;
  enableResume: boolean;
  defaultChecksumAlgorithm: 'md5' | 'sha1' | 'sha256';
  bandwidthLimit?: number; // bytes per second
  resumeDataPath?: string; // path to store resume data
}

export interface ResumeData {
  transferId: string;
  sourcePath: string;
  destinationPath: string;
  totalSize: number;
  transferred: number;
  checksum?: string;
  lastModified: number;
  chunks?: Array<{ start: number; end: number; completed: boolean }>;
}

export class TransferEngine extends EventEmitter {
  private readonly activeTransfers = new Map<string, FileTransfer>();
  private readonly transferQueue: FileTransfer[] = [];
  private readonly resumeData = new Map<string, ResumeData>();
  private runningTransfers = 0;
  private bandwidthTokens = 0;
  private lastBandwidthUpdate = Date.now();

  constructor(
    private readonly config: TransferEngineConfig,
    private readonly logger: Logger
  ) {
    super();
    this.initializeBandwidthLimiter();
    this.loadResumeData();
  }

  /**
   * Initialize bandwidth limiter
   */
  private initializeBandwidthLimiter(): void {
    if (this.config.bandwidthLimit) {
      const bandwidthLimit = this.config.bandwidthLimit;
      this.bandwidthTokens = bandwidthLimit;
      setInterval(() => {
        const now = Date.now();
        const timeDiff = now - this.lastBandwidthUpdate;
        const tokensToAdd = (bandwidthLimit * timeDiff) / 1000;
        this.bandwidthTokens = Math.min(bandwidthLimit, this.bandwidthTokens + tokensToAdd);
        this.lastBandwidthUpdate = now;
      }, 100); // Update every 100ms
    }
  }

  /**
   * Load resume data from disk
   */
  private async loadResumeData(): Promise<void> {
    if (!this.config.enableResume || !this.config.resumeDataPath) {
      return;
    }

    try {
      await ensureDirectory(path.dirname(this.config.resumeDataPath));
      const data = await fs.readFile(this.config.resumeDataPath, 'utf-8');
      const resumeDataArray: ResumeData[] = JSON.parse(data);

      for (const resumeData of resumeDataArray) {
        this.resumeData.set(resumeData.transferId, resumeData);
      }

      this.logger.debug(`Loaded ${resumeDataArray.length} resume data entries`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Failed to load resume data', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Save resume data to disk
   */
  private async saveResumeData(): Promise<void> {
    if (!this.config.enableResume || !this.config.resumeDataPath) {
      return;
    }

    try {
      const resumeDataArray = Array.from(this.resumeData.values());
      await fs.writeFile(this.config.resumeDataPath, JSON.stringify(resumeDataArray, null, 2));
    } catch (error) {
      this.logger.warn('Failed to save resume data', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Wait for bandwidth tokens
   */
  private async waitForBandwidth(bytes: number): Promise<void> {
    if (!this.config.bandwidthLimit) {
      return;
    }

    while (this.bandwidthTokens < bytes) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.bandwidthTokens -= bytes;
  }

  /**
   * Queue a file transfer
   */
  public async queueTransfer(
    sourcePath: string,
    destinationPath: string,
    options: TransferOptions = {}
  ): Promise<string> {
    const transferId = this.generateTransferId();

    try {
      const sourceStats = await fs.stat(sourcePath);
      let transferred = 0;
      let resumeData: ResumeData | undefined;

      // Check for existing resume data
      if (options.resumeTransfer && this.config.enableResume) {
        const existingResumeKey = `${sourcePath}:${destinationPath}`;
        resumeData = Array.from(this.resumeData.values()).find(
          data => `${data.sourcePath}:${data.destinationPath}` === existingResumeKey
        );

        if (resumeData && resumeData.totalSize === sourceStats.size) {
          transferred = resumeData.transferred;
          this.logger.info(`Resuming transfer from ${transferred} bytes: ${sourcePath}`);
        }
      }

      const transfer: FileTransfer = {
        id: transferId,
        sourcePath,
        destinationPath,
        size: sourceStats.size,
        transferred,
        status: 'pending',
        startTime: new Date(),
        metadata: { options, resumeData },
      };

      this.activeTransfers.set(transferId, transfer);
      this.transferQueue.push(transfer);

      this.emit('transfer_queued', transfer);
      this.logger.debug(`Queued transfer: ${sourcePath} -> ${destinationPath}`);

      // Process queue
      this.processQueue();

      return transferId;
    } catch (error) {
      this.logger.error(`Failed to queue transfer: ${error}`);
      throw ErrorFactory.filesystem(`Failed to queue transfer: ${error}`);
    }
  }

  /**
   * Cancel a transfer
   */
  public async cancelTransfer(transferId: string): Promise<boolean> {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      return false;
    }

    if (transfer.status === 'in_progress') {
      transfer.status = 'failed';
      transfer.endTime = new Date();
      transfer.error = 'Transfer cancelled by user';

      this.emit('transfer_cancelled', transfer);
      this.logger.info(`Cancelled transfer: ${transferId}`);
      return true;
    }

    return false;
  }

  /**
   * Get transfer status
   */
  public getTransfer(transferId: string): FileTransfer | undefined {
    return this.activeTransfers.get(transferId);
  }

  /**
   * Get all active transfers
   */
  public getActiveTransfers(): FileTransfer[] {
    return Array.from(this.activeTransfers.values());
  }

  /**
   * Process the transfer queue
   */
  private async processQueue(): Promise<void> {
    while (
      this.transferQueue.length > 0 &&
      this.runningTransfers < this.config.maxConcurrentTransfers
    ) {
      const transfer = this.transferQueue.shift();
      if (!transfer) continue;

      this.runningTransfers++;
      this.executeTransfer(transfer).finally(() => {
        this.runningTransfers--;
        this.processQueue(); // Process next item in queue
      });
    }
  }

  /**
   * Execute a single transfer
   */
  private async executeTransfer(transfer: FileTransfer): Promise<void> {
    const options = (transfer.metadata?.options as TransferOptions) || {};

    try {
      transfer.status = 'in_progress';
      this.emit('transfer_started', transfer);

      const result = await runWithErrorContext(() => this.performTransfer(transfer, options), {
        operation: `transfer-${transfer.id}`,
        service: 'transfer-engine',
      });

      if (result.success) {
        transfer.status = 'completed';
        transfer.endTime = new Date();
        this.emit('transfer_completed', transfer);
        this.logger.info(
          `Transfer completed: ${transfer.sourcePath} -> ${transfer.destinationPath}`
        );
      } else {
        throw new Error(result.error || 'Transfer failed');
      }
    } catch (error) {
      transfer.status = 'failed';
      transfer.endTime = new Date();
      transfer.error = error instanceof Error ? error.message : String(error);

      this.emit('transfer_failed', transfer, error);
      this.logger.error(`Transfer failed: ${transfer.id} - ${transfer.error}`);

      // Retry logic
      const retryAttempts = options.retryAttempts ?? this.config.defaultRetryAttempts;
      const currentAttempt = (transfer.metadata?.retryAttempt as number) || 0;

      if (currentAttempt < retryAttempts) {
        const retryDelay = options.retryDelay ?? this.config.defaultRetryDelay;
        transfer.metadata = { ...transfer.metadata, retryAttempt: currentAttempt + 1 };

        this.logger.info(
          `Retrying transfer ${transfer.id} (attempt ${currentAttempt + 1}/${retryAttempts})`
        );

        setTimeout(() => {
          transfer.status = 'pending';
          transfer.transferred = 0;
          this.transferQueue.unshift(transfer); // Add to front of queue for retry
          this.processQueue();
        }, retryDelay);
      }
    } finally {
      // Clean up completed/failed transfers after delay
      setTimeout(() => {
        this.activeTransfers.delete(transfer.id);
      }, 300000); // 5 minutes
    }
  }

  /**
   * Perform the actual file transfer
   */
  private async performTransfer(
    transfer: FileTransfer,
    options: TransferOptions
  ): Promise<{ success: boolean; error?: string }> {
    const chunkSize = parseSize(options.chunkSize || this.config.defaultChunkSize);
    const timeout = options.timeout || this.config.defaultTimeout;
    const checksumAlgorithm = options.checksumAlgorithm || this.config.defaultChecksumAlgorithm;
    const resumeDataKey = transfer.id;

    try {
      // Ensure destination directory exists
      await ensureDirectory(path.dirname(transfer.destinationPath));

      // Create resume data entry
      const resumeData: ResumeData = {
        transferId: transfer.id,
        sourcePath: transfer.sourcePath,
        destinationPath: transfer.destinationPath,
        totalSize: transfer.size,
        transferred: transfer.transferred,
        lastModified: Date.now(),
      };

      this.resumeData.set(resumeDataKey, resumeData);
      await this.saveResumeData();

      // Set up progress tracking
      let lastProgressTime = Date.now();
      let lastTransferred = transfer.transferred;

      const progressCallback = (bytesTransferred: number) => {
        transfer.transferred = bytesTransferred;
        resumeData.transferred = bytesTransferred;

        const now = Date.now();
        const timeDiff = now - lastProgressTime;

        if (timeDiff >= 1000) {
          // Update progress every second
          const bytesDiff = bytesTransferred - lastTransferred;
          const speed = calculateSpeed(bytesDiff, timeDiff);
          const remainingBytes = transfer.size - bytesTransferred;
          const eta = calculateETA(remainingBytes, speed);

          const progress: ProgressInfo = {
            ...calculateProgress(bytesTransferred, transfer.size),
            speed,
            eta,
            currentItem: path.basename(transfer.sourcePath),
          };

          options.onProgress?.(progress);
          this.emit('transfer_progress', transfer, progress);

          lastProgressTime = now;
          lastTransferred = bytesTransferred;

          // Save resume data periodically
          this.saveResumeData().catch(err =>
            this.logger.warn('Failed to save resume data during transfer', err)
          );
        }
      };

      // Perform the transfer with timeout and resume support
      const transferPromise = this.copyFileWithProgressAndResume(
        transfer.sourcePath,
        transfer.destinationPath,
        chunkSize,
        transfer.transferred,
        progressCallback,
        options.signal,
        options.bandwidth
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Transfer timeout after ${timeout}ms`));
        }, timeout);

        options.signal?.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Transfer aborted'));
        });
      });

      await Promise.race([transferPromise, timeoutPromise]);

      // Verify transfer if enabled
      if (options.verifyTransfer ?? this.config.verifyTransfers) {
        await this.verifyTransferWithChecksum(transfer, checksumAlgorithm);
      }

      // Create completion marker if enabled
      if (options.createCompletionMarkers ?? this.config.createCompletionMarkers) {
        await this.createCompletionMarker(transfer.destinationPath);
      }

      // Clean up resume data on successful completion
      this.resumeData.delete(resumeDataKey);
      await this.saveResumeData();

      return { success: true };
    } catch (error) {
      // Save resume data on failure for potential resume
      const currentResumeData = this.resumeData.get(resumeDataKey);
      if (currentResumeData) {
        currentResumeData.lastModified = Date.now();
        await this.saveResumeData();
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Copy file with progress tracking, resume support, and bandwidth limiting
   */
  private async copyFileWithProgressAndResume(
    sourcePath: string,
    destinationPath: string,
    chunkSize: number,
    startOffset: number,
    onProgress: (bytes: number) => void,
    signal?: AbortSignal,
    bandwidthLimit?: number
  ): Promise<void> {
    const sourceStream = createReadStream(sourcePath, { start: startOffset });
    const destinationStream = createWriteStream(destinationPath, {
      flags: startOffset > 0 ? 'r+' : 'w',
      start: startOffset,
    });

    let totalTransferred = startOffset;
    const hash = createHash('sha256');

    return new Promise((resolve, reject) => {
      sourceStream.on('data', async (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

        if (signal?.aborted) {
          sourceStream.destroy();
          destinationStream.destroy();
          reject(new Error('Transfer aborted'));
          return;
        }

        // Apply bandwidth limiting
        if (bandwidthLimit || this.config.bandwidthLimit) {
          await this.waitForBandwidth(buffer.length);
        }

        hash.update(buffer);
        totalTransferred += buffer.length;
        onProgress(totalTransferred);
      });

      sourceStream.on('error', error => {
        destinationStream.destroy();
        reject(error);
      });

      destinationStream.on('error', error => {
        sourceStream.destroy();
        reject(error);
      });

      destinationStream.on('finish', () => {
        resolve();
      });

      pipeline(sourceStream, destinationStream).catch(reject);
    });
  }

  /**
   * Copy file with progress tracking (legacy method)
   */
  private async copyFileWithProgress(
    sourcePath: string,
    destinationPath: string,
    chunkSize: number,
    onProgress: (bytes: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const readStream = createReadStream(sourcePath, { highWaterMark: chunkSize });
    const writeStream = createWriteStream(destinationPath);

    let transferred = 0;

    readStream.on('data', (chunk: string | Buffer) => {
      const length = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      transferred += length;
      onProgress(transferred);
    });

    signal?.addEventListener('abort', () => {
      readStream.destroy();
      writeStream.destroy();
    });

    await pipeline(readStream, writeStream);
  }

  /**
   * Verify transfer integrity with checksum
   */
  private async verifyTransferWithChecksum(
    transfer: FileTransfer,
    algorithm: 'md5' | 'sha1' | 'sha256'
  ): Promise<void> {
    const [sourceStats, destStats] = await Promise.all([
      fs.stat(transfer.sourcePath),
      fs.stat(transfer.destinationPath),
    ]);

    if (sourceStats.size !== destStats.size) {
      throw new Error(
        `Size mismatch: source ${sourceStats.size} bytes, destination ${destStats.size} bytes`
      );
    }

    // Calculate checksums for both files
    const [sourceChecksum, destChecksum] = await Promise.all([
      this.calculateFileChecksum(transfer.sourcePath, algorithm),
      this.calculateFileChecksum(transfer.destinationPath, algorithm),
    ]);

    if (sourceChecksum !== destChecksum) {
      throw new Error(`Checksum mismatch: source ${sourceChecksum}, destination ${destChecksum}`);
    }

    this.logger.debug(`Transfer verified successfully: ${algorithm} checksum ${sourceChecksum}`);
  }

  /**
   * Calculate file checksum
   */
  private async calculateFileChecksum(
    filePath: string,
    algorithm: 'md5' | 'sha1' | 'sha256'
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash(algorithm);
      const stream = createReadStream(filePath);

      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Verify transfer integrity (legacy method)
   */
  private async verifyTransfer(transfer: FileTransfer): Promise<void> {
    const [sourceStats, destStats] = await Promise.all([
      fs.stat(transfer.sourcePath),
      fs.stat(transfer.destinationPath),
    ]);

    if (sourceStats.size !== destStats.size) {
      throw new Error(
        `Transfer verification failed: size mismatch (${sourceStats.size} vs ${destStats.size})`
      );
    }

    this.logger.debug(`Transfer verified: ${transfer.id}`);
  }

  /**
   * Create completion marker file
   */
  private async createCompletionMarker(filePath: string): Promise<void> {
    const markerPath = `${filePath}.complete`;
    await fs.writeFile(markerPath, new Date().toISOString());
    this.logger.debug(`Created completion marker: ${markerPath}`);
  }

  /**
   * Get resume data for a specific transfer
   */
  public getResumeData(transferId: string): ResumeData | undefined {
    return this.resumeData.get(transferId);
  }

  /**
   * Clear all resume data
   */
  public async clearResumeData(): Promise<void> {
    this.resumeData.clear();
    await this.saveResumeData();
  }

  /**
   * Get transfer statistics
   */
  public getTransferStats(): {
    active: number;
    queued: number;
    totalResumeEntries: number;
  } {
    return {
      active: this.runningTransfers,
      queued: this.transferQueue.length,
      totalResumeEntries: this.resumeData.size,
    };
  }

  /**
   * Generate unique transfer ID
   */
  private generateTransferId(): string {
    return `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Factory method to create a transfer engine with common configurations
   */
  static createDefault(
    logger: Logger,
    options: Partial<TransferEngineConfig> = {}
  ): TransferEngine {
    const defaultConfig: TransferEngineConfig = {
      maxConcurrentTransfers: 3,
      defaultChunkSize: '1MB',
      defaultTimeout: 300000, // 5 minutes
      defaultRetryAttempts: 3,
      defaultRetryDelay: 1000,
      verifyTransfers: true,
      createCompletionMarkers: false,
      enableResume: true,
      defaultChecksumAlgorithm: 'sha256',
      resumeDataPath: '/tmp/transfer-resume.json',
      ...options,
    };

    return new TransferEngine(defaultConfig, logger);
  }

  /**
   * Factory method for high-performance transfers
   */
  static createHighPerformance(
    logger: Logger,
    options: Partial<TransferEngineConfig> = {}
  ): TransferEngine {
    const config: TransferEngineConfig = {
      maxConcurrentTransfers: 8,
      defaultChunkSize: '4MB',
      defaultTimeout: 600000, // 10 minutes
      defaultRetryAttempts: 5,
      defaultRetryDelay: 500,
      verifyTransfers: true,
      createCompletionMarkers: false,
      enableResume: true,
      defaultChecksumAlgorithm: 'sha256',
      resumeDataPath: '/tmp/transfer-resume-hp.json',
      ...options,
    };

    return new TransferEngine(config, logger);
  }

  /**
   * Factory method for bandwidth-limited transfers
   */
  static createBandwidthLimited(
    logger: Logger,
    bandwidthLimit: number,
    options: Partial<TransferEngineConfig> = {}
  ): TransferEngine {
    const config: TransferEngineConfig = {
      maxConcurrentTransfers: 2,
      defaultChunkSize: '512KB',
      defaultTimeout: 1800000, // 30 minutes
      defaultRetryAttempts: 3,
      defaultRetryDelay: 2000,
      verifyTransfers: true,
      createCompletionMarkers: false,
      enableResume: true,
      defaultChecksumAlgorithm: 'sha256',
      bandwidthLimit,
      resumeDataPath: '/tmp/transfer-resume-limited.json',
      ...options,
    };

    return new TransferEngine(config, logger);
  }
}
