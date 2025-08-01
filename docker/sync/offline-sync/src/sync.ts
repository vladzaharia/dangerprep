import { exec } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import { promisify } from 'util';

import { getFilesRecursively, sanitizePath, ensureDirectory } from '@dangerprep/files';
import { Logger, LoggerFactory } from '@dangerprep/logging';
import {
  TransferEngine,
  FileTransfer,
  SyncProgressManager,
  UnifiedProgressTracker,
  StandardSyncErrorHandler,
  SyncErrorFactory,
} from '@dangerprep/sync';
import * as fs from 'fs-extra';

import {
  DetectedDevice,
  OfflineSyncConfig,
  SyncOperation,
  CardAnalysis,
  ContentTypeConfig,
} from './types';

const _execAsync = promisify(exec);

export class SyncEngine extends EventEmitter {
  private config: OfflineSyncConfig['offline_sync'];
  private activeOperations: Map<string, SyncOperation> = new Map();
  private transferEngine: TransferEngine;
  private progressManager: SyncProgressManager;
  private errorHandler: StandardSyncErrorHandler;
  private logger: Logger;

  constructor(config: OfflineSyncConfig) {
    super();
    this.config = config.offline_sync;
    this.logger = LoggerFactory.createConsoleLogger('SyncEngine');

    // Initialize TransferEngine with configuration from sync config
    this.transferEngine = new TransferEngine(
      {
        maxConcurrentTransfers: this.config.sync.max_concurrent_transfers || 3,
        defaultChunkSize: this.config.sync.transfer_chunk_size || '1MB',
        defaultTimeout: 30 * 60 * 1000, // 30 minutes default
        defaultRetryAttempts: 3,
        defaultRetryDelay: 1000,
        verifyTransfers: this.config.sync.verify_transfers || false,
        createCompletionMarkers: this.config.sync.create_completion_markers || false,
        enableResume: true,
        defaultChecksumAlgorithm: 'sha256',
        resumeDataPath: path.join(this.config.storage.temp_directory, 'transfer-resume.json'),
      },
      this.logger
    );

    // Initialize SyncProgressManager
    this.progressManager = new SyncProgressManager(
      {
        serviceName: 'offline-sync',
        enableNotifications: true,
        enableLogging: true,
        cleanupDelayMs: 300000, // 5 minutes
        maxActiveTrackers: 10,
        globalUpdateInterval: 1000, // 1 second
      },
      this.logger
    );

    // Initialize StandardSyncErrorHandler
    this.errorHandler = new StandardSyncErrorHandler(
      {
        serviceName: 'offline-sync',
        enableRetry: true,
        enableNotifications: true,
        enableLogging: true,
      },
      this.logger
    );
  }

  /**
   * Start sync operation for a device
   */
  public async startSync(device: DetectedDevice, analysis: CardAnalysis): Promise<string> {
    const operationId = this.generateOperationId();

    // For now, use estimated values for progress tracking since we don't have detailed file counts
    // In a real implementation, you would analyze the content types to get actual counts
    const totalFiles = analysis.detectedContentTypes.length * 100; // Estimated files per content type
    const totalSize = analysis.totalSize;

    // Create progress tracker for device sync
    const progressTracker = this.progressManager.createDeviceSyncTracker(
      operationId,
      device.devicePath, // Use devicePath as device identifier
      totalFiles,
      totalSize
    );

    const operation: SyncOperation = {
      id: operationId,
      device,
      contentType: 'all',
      direction: 'bidirectional',
      status: 'pending',
      startTime: new Date(),
      totalFiles,
      processedFiles: 0,
      totalSize,
      processedSize: 0,
    };

    this.activeOperations.set(operationId, operation);
    this.emit('sync_started', operation);

    try {
      operation.status = 'in_progress';
      progressTracker.start();
      progressTracker.setPhase('detect');
      progressTracker.updatePhaseProgress('detect', 100);
      progressTracker.setPhase('mount');
      progressTracker.updatePhaseProgress('mount', 100);
      progressTracker.setPhase('analyze');
      progressTracker.updatePhaseProgress('analyze', 100);
      progressTracker.setPhase('sync');

      // Process each detected content type
      for (const contentType of analysis.detectedContentTypes) {
        await this.syncContentType(operation, contentType, progressTracker);
      }

      operation.status = 'completed';
      operation.endTime = new Date();
      progressTracker.complete();
      this.emit('sync_completed', operation);
    } catch (error) {
      operation.status = 'failed';
      operation.endTime = new Date();
      operation.error = error instanceof Error ? error.message : String(error);

      // Create standardized error and handle it
      const syncError = SyncErrorFactory.createDeviceError(
        `Sync operation failed: ${operation.error}`,
        {
          serviceName: 'offline-sync',
          operationId,
          operationType: 'device_sync',
          deviceId: device.devicePath,
          timestamp: new Date(),
        },
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          data: { device: device.devicePath, contentTypes: analysis.detectedContentTypes },
        }
      );

      await this.errorHandler.handleError(syncError);
      progressTracker.fail(operation.error);
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
    const activeTransfers = this.transferEngine.getActiveTransfers();
    for (const transfer of activeTransfers) {
      if (transfer.id.startsWith(operationId)) {
        await this.transferEngine.cancelTransfer(transfer.id);
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
  private async syncContentType(
    operation: SyncOperation,
    contentType: string,
    progressTracker?: UnifiedProgressTracker
  ): Promise<void> {
    const contentConfig = this.config.content_types[contentType];
    if (!contentConfig || !operation.device.mountPath) {
      return;
    }

    this.log(`Starting sync for content type: ${contentType}`);

    const localPath = contentConfig.local_path;
    // Sanitize paths to prevent path traversal
    const sanitizedCardPath = sanitizePath(contentConfig.card_path);
    const sanitizedMountPath = sanitizePath(operation.device.mountPath);
    const cardPath = path.join(sanitizedMountPath, sanitizedCardPath);

    // Ensure both directories exist
    await ensureDirectory(localPath);
    await ensureDirectory(cardPath);

    // Determine sync direction
    const syncDirection = contentConfig.sync_direction;

    if (syncDirection === 'bidirectional' || syncDirection === 'to_card') {
      await this.syncToCard(operation, contentConfig, localPath, cardPath, progressTracker);
    }

    if (syncDirection === 'bidirectional' || syncDirection === 'from_card') {
      await this.syncFromCard(operation, contentConfig, cardPath, localPath, progressTracker);
    }
  }

  /**
   * Sync files from local storage to card
   */
  private async syncToCard(
    operation: SyncOperation,
    contentConfig: ContentTypeConfig,
    localPath: string,
    cardPath: string,
    progressTracker?: UnifiedProgressTracker
  ): Promise<void> {
    this.log(`Syncing to card: ${localPath} -> ${cardPath}`);

    const localFiles = await getFilesRecursively(localPath, [...contentConfig.file_extensions]);
    const cardFiles = await getFilesRecursively(cardPath, [...contentConfig.file_extensions]);

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
      const sanitizedRelativePath = sanitizePath(relativePath);
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
        await this.transferFile(operation, localFile, targetPath, progressTracker);
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
    localPath: string,
    progressTracker?: UnifiedProgressTracker
  ): Promise<void> {
    this.log(`Syncing from card: ${cardPath} -> ${localPath}`);

    const cardFiles = await getFilesRecursively(cardPath, [...contentConfig.file_extensions]);
    const localFiles = await getFilesRecursively(localPath, [...contentConfig.file_extensions]);

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
      const sanitizedRelativePath = sanitizePath(relativePath);
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
        await this.transferFile(operation, cardFile, targetPath, progressTracker);
      }
    }
  }

  /**
   * Transfer a single file using the standardized TransferEngine
   */
  private async transferFile(
    operation: SyncOperation,
    sourcePath: string,
    targetPath: string,
    progressTracker?: UnifiedProgressTracker
  ): Promise<void> {
    try {
      // Use TransferEngine for standardized file transfer
      const transferId = await this.transferEngine.queueTransfer(sourcePath, targetPath, {
        verifyTransfer: this.config.sync.verify_transfers,
        createCompletionMarkers: this.config.sync.create_completion_markers,
        timeout: 30 * 60 * 1000, // 30 minutes
        retryAttempts: 3,
        retryDelay: 1000,
      });

      // Wait for transfer to complete using event listeners
      await new Promise<void>((resolve, reject) => {
        const onCompleted = (transfer: FileTransfer) => {
          if (transfer.id === transferId) {
            this.transferEngine.off('transfer_completed', onCompleted);
            this.transferEngine.off('transfer_failed', onFailed);
            resolve();
          }
        };

        const onFailed = (transfer: FileTransfer) => {
          if (transfer.id === transferId) {
            this.transferEngine.off('transfer_completed', onCompleted);
            this.transferEngine.off('transfer_failed', onFailed);
            reject(new Error(transfer.error || 'Transfer failed'));
          }
        };

        this.transferEngine.on('transfer_completed', onCompleted);
        this.transferEngine.on('transfer_failed', onFailed);
      });

      // Update operation progress
      const sourceStats = await fs.stat(sourcePath);
      operation.processedFiles++;
      operation.processedSize += sourceStats.size;
      operation.currentFile = path.basename(sourcePath);

      // Update progress tracker if provided
      if (progressTracker) {
        progressTracker.updateProgress(
          operation.processedFiles,
          operation.processedSize,
          operation.currentFile
        );
      }

      this.log(`Transferred: ${sourcePath} -> ${targetPath}`);
    } catch (error) {
      // Create standardized transfer error and handle it
      const syncError = SyncErrorFactory.createTransferError(
        `Failed to transfer file: ${sourcePath} -> ${targetPath}`,
        {
          serviceName: 'offline-sync',
          operationId: operation.id,
          operationType: 'file_transfer',
          sourcePath,
          destinationPath: targetPath,
          timestamp: new Date(),
        },
        {
          cause: error instanceof Error ? error : new Error(String(error)),
          data: { sourcePath, targetPath, operationId: operation.id },
        }
      );

      await this.errorHandler.handleError(syncError);
      throw error;
    }
  }

  // File transfer is now handled by TransferEngine

  // File verification and completion markers are now handled by TransferEngine

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
   * Handle an error using the standardized error handler
   */
  private async handleError(
    message: string,
    error: unknown,
    context: Partial<Parameters<typeof SyncErrorFactory.createDeviceError>[1]> = {}
  ): Promise<void> {
    const syncError = SyncErrorFactory.createDeviceError(
      message,
      {
        serviceName: 'offline-sync',
        timestamp: new Date(),
        ...context,
      },
      {
        cause: error instanceof Error ? error : new Error(String(error)),
      }
    );

    await this.errorHandler.handleError(syncError);
  }

  /**
   * Log an error (legacy method for backward compatibility)
   */
  private logError(message: string, error: unknown): void {
    this.logger.error(message, { error: error instanceof Error ? error.message : String(error) });
  }
}
