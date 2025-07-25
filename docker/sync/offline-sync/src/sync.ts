import { exec } from 'child_process';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import * as path from 'path';
import { promisify } from 'util';

import { FileUtils } from '@dangerprep/files';
import { Logger, LoggerFactory } from '@dangerprep/logging';
import * as fs from 'fs-extra';

import {
  DetectedDevice,
  OfflineSyncConfig,
  SyncOperation,
  FileTransfer,
  CardAnalysis,
  ContentTypeConfig,
} from './types';

const _execAsync = promisify(exec);

export class SyncEngine extends EventEmitter {
  private config: OfflineSyncConfig['offline_sync'];
  private activeOperations: Map<string, SyncOperation> = new Map();
  private activeTransfers: Map<string, FileTransfer> = new Map();
  private logger: Logger;

  constructor(config: OfflineSyncConfig['offline_sync']) {
    super();
    this.config = config;
    this.logger = LoggerFactory.createConsoleLogger('SyncEngine');
  }

  /**
   * Start sync operation for a device
   */
  public async startSync(device: DetectedDevice, analysis: CardAnalysis): Promise<string> {
    const operationId = this.generateOperationId();

    const operation: SyncOperation = {
      id: operationId,
      device,
      contentType: 'all',
      direction: 'bidirectional',
      status: 'pending',
      startTime: new Date(),
      totalFiles: 0,
      processedFiles: 0,
      totalSize: 0,
      processedSize: 0,
    };

    this.activeOperations.set(operationId, operation);
    this.emit('sync_started', operation);

    try {
      operation.status = 'in_progress';

      // Process each detected content type
      for (const contentType of analysis.detectedContentTypes) {
        await this.syncContentType(operation, contentType);
      }

      operation.status = 'completed';
      operation.endTime = new Date();
      this.emit('sync_completed', operation);
    } catch (error) {
      operation.status = 'failed';
      operation.endTime = new Date();
      operation.error = error instanceof Error ? error.message : String(error);
      this.emit('sync_failed', operation, error);
    }

    return operationId;
  }

  /**
   * Cancel an active sync operation
   */
  public async cancelSync(operationId: string): Promise<boolean> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      return false;
    }

    operation.status = 'cancelled';
    operation.endTime = new Date();

    // Cancel all active transfers for this operation
    for (const [transferId, transfer] of this.activeTransfers.entries()) {
      if (transferId.startsWith(operationId)) {
        transfer.status = 'failed';
        transfer.error = 'Operation cancelled';
        this.activeTransfers.delete(transferId);
      }
    }

    this.emit('sync_cancelled', operation);
    return true;
  }

  /**
   * Get active operations
   */
  public getActiveOperations(): SyncOperation[] {
    return Array.from(this.activeOperations.values());
  }

  /**
   * Get operation by ID
   */
  public getOperation(operationId: string): SyncOperation | undefined {
    return this.activeOperations.get(operationId);
  }

  /**
   * Sync a specific content type
   */
  private async syncContentType(operation: SyncOperation, contentType: string): Promise<void> {
    const contentConfig = this.config.content_types[contentType];
    if (!contentConfig || !operation.device.mountPath) {
      return;
    }

    this.log(`Starting sync for content type: ${contentType}`);

    const localPath = contentConfig.local_path;
    // Sanitize paths to prevent path traversal
    const sanitizedCardPath = FileUtils.sanitizePath(contentConfig.card_path);
    const sanitizedMountPath = FileUtils.sanitizePath(operation.device.mountPath);
    const cardPath = path.join(sanitizedMountPath, sanitizedCardPath);

    // Ensure both directories exist
    await FileUtils.ensureDirectory(localPath);
    await FileUtils.ensureDirectory(cardPath);

    // Determine sync direction
    const syncDirection = contentConfig.sync_direction;

    if (syncDirection === 'bidirectional' || syncDirection === 'to_card') {
      await this.syncToCard(operation, contentConfig, localPath, cardPath);
    }

    if (syncDirection === 'bidirectional' || syncDirection === 'from_card') {
      await this.syncFromCard(operation, contentConfig, cardPath, localPath);
    }
  }

  /**
   * Sync files from local storage to card
   */
  private async syncToCard(
    operation: SyncOperation,
    contentConfig: ContentTypeConfig,
    localPath: string,
    cardPath: string
  ): Promise<void> {
    this.log(`Syncing to card: ${localPath} -> ${cardPath}`);

    const localFiles = await FileUtils.getFilesRecursively(localPath, [
      ...contentConfig.file_extensions,
    ]);
    const cardFiles = await FileUtils.getFilesRecursively(cardPath, [
      ...contentConfig.file_extensions,
    ]);

    // Create a map of card files for quick lookup
    const cardFileMap = new Map<string, string>();
    for (const cardFile of cardFiles) {
      const relativePath = path.relative(cardPath, cardFile);
      cardFileMap.set(relativePath, cardFile);
    }

    // Copy files that don't exist on card or are newer
    for (const localFile of localFiles) {
      const relativePath = path.relative(localPath, localFile);
      // Sanitize relative path to prevent path traversal
      const sanitizedRelativePath = FileUtils.sanitizePath(relativePath);
      const targetPath = path.join(cardPath, sanitizedRelativePath);
      const existingCardFile = cardFileMap.get(relativePath);

      let shouldCopy = false;

      if (!existingCardFile) {
        // File doesn't exist on card
        shouldCopy = true;
      } else {
        // Check if local file is newer
        const localStats = await fs.stat(localFile);
        const cardStats = await fs.stat(existingCardFile);

        if (localStats.mtime > cardStats.mtime) {
          shouldCopy = true;
        }
      }

      if (shouldCopy) {
        await this.transferFile(operation, localFile, targetPath);
      }
    }
  }

  /**
   * Sync files from card to local storage
   */
  private async syncFromCard(
    operation: SyncOperation,
    contentConfig: ContentTypeConfig,
    cardPath: string,
    localPath: string
  ): Promise<void> {
    this.log(`Syncing from card: ${cardPath} -> ${localPath}`);

    const cardFiles = await FileUtils.getFilesRecursively(cardPath, [
      ...contentConfig.file_extensions,
    ]);
    const localFiles = await FileUtils.getFilesRecursively(localPath, [
      ...contentConfig.file_extensions,
    ]);

    // Create a map of local files for quick lookup
    const localFileMap = new Map<string, string>();
    for (const localFile of localFiles) {
      const relativePath = path.relative(localPath, localFile);
      localFileMap.set(relativePath, localFile);
    }

    // Copy files that don't exist locally or are newer
    for (const cardFile of cardFiles) {
      const relativePath = path.relative(cardPath, cardFile);
      // Sanitize relative path to prevent path traversal
      const sanitizedRelativePath = FileUtils.sanitizePath(relativePath);
      const targetPath = path.join(localPath, sanitizedRelativePath);
      const existingLocalFile = localFileMap.get(relativePath);

      let shouldCopy = false;

      if (!existingLocalFile) {
        // File doesn't exist locally
        shouldCopy = true;
      } else {
        // Check if card file is newer
        const cardStats = await fs.stat(cardFile);
        const localStats = await fs.stat(existingLocalFile);

        if (cardStats.mtime > localStats.mtime) {
          shouldCopy = true;
        }
      }

      if (shouldCopy) {
        await this.transferFile(operation, cardFile, targetPath);
      }
    }
  }

  /**
   * Transfer a single file with progress tracking
   */
  private async transferFile(
    operation: SyncOperation,
    sourcePath: string,
    targetPath: string
  ): Promise<void> {
    const transferId = `${operation.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const sourceStats = await fs.stat(sourcePath);

      const transfer: FileTransfer = {
        id: transferId,
        sourcePath,
        destinationPath: targetPath,
        size: sourceStats.size,
        transferred: 0,
        status: 'pending',
        startTime: new Date(),
      };

      this.activeTransfers.set(transferId, transfer);
      transfer.status = 'in_progress';

      // Ensure target directory exists
      await FileUtils.ensureDirectory(path.dirname(targetPath));

      // Copy file with progress tracking
      await this.copyFileWithProgress(transfer);

      // Verify transfer if enabled
      if (this.config.sync.verify_transfers) {
        await this.verifyTransfer(transfer);
      }

      // Create completion marker if enabled
      if (this.config.sync.create_completion_markers) {
        await this.createCompletionMarker(targetPath);
      }

      transfer.status = 'completed';
      transfer.endTime = new Date();

      operation.processedFiles++;
      operation.processedSize += transfer.size;
      operation.currentFile = path.basename(sourcePath);

      this.emit('file_transferred', transfer);
      this.log(`Transferred: ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      const transfer = this.activeTransfers.get(transferId);
      if (transfer) {
        transfer.status = 'failed';
        transfer.error = error instanceof Error ? error.message : String(error);
        transfer.endTime = new Date();
      }

      this.logError(`Failed to transfer ${sourcePath}`, error);
      throw error;
    } finally {
      this.activeTransfers.delete(transferId);
    }
  }

  /**
   * Copy file with progress tracking
   */
  private async copyFileWithProgress(transfer: FileTransfer): Promise<void> {
    const chunkSize = this.parseSize(this.config.sync.transfer_chunk_size);

    const readStream = fs.createReadStream(transfer.sourcePath, { highWaterMark: chunkSize });
    const writeStream = fs.createWriteStream(transfer.destinationPath);

    return new Promise((resolve, reject) => {
      readStream.on('data', (chunk: string | Buffer) => {
        const length = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        transfer.transferred += length;
      });

      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);

      readStream.pipe(writeStream);
    });
  }

  /**
   * Verify file transfer integrity
   */
  private async verifyTransfer(transfer: FileTransfer): Promise<void> {
    const sourceHash = await this.calculateFileHash(transfer.sourcePath);
    const targetHash = await this.calculateFileHash(transfer.destinationPath);

    if (sourceHash !== targetHash) {
      throw new Error('File transfer verification failed: checksums do not match');
    }

    transfer.checksum = sourceHash;
  }

  /**
   * Calculate file hash for verification
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data: string | Buffer) => {
        if (typeof data === 'string') {
          hash.update(data, 'utf8');
        } else {
          hash.update(data);
        }
      });
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Create completion marker file
   */
  private async createCompletionMarker(filePath: string): Promise<void> {
    const markerPath = `${filePath}.sync_complete`;
    const timestamp = new Date().toISOString();
    await fs.writeFile(markerPath, timestamp);
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
    if (!match?.[1] || !match[2]) return 1024 * 1024; // Default 1MB

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    return Math.floor(value * (units[unit] ?? 1));
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    this.logger.debug(message);
  }

  /**
   * Log an error
   */
  private logError(message: string, error: unknown): void {
    this.logger.error(message, { error: error instanceof Error ? error.message : String(error) });
  }
}
