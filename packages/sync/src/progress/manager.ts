/**
 * Progress manager for coordinating multiple sync progress trackers
 */

import { EventEmitter } from 'events';

import { Logger } from '@dangerprep/logging';
import {
  NotificationManager,
  NotificationType,
  NotificationLevel,
} from '@dangerprep/notifications';
import { ProgressUpdate, ProgressStatus, ProgressPhase } from '@dangerprep/types';

import { UnifiedProgressTracker, SyncProgressTracker } from './tracker.js';

// Local type definitions
export interface ProgressConfig {
  readonly operationId: string;
  readonly operationName: string;
  readonly totalItems: number;
  readonly totalBytes: number;
  readonly phases: ProgressPhase[];
  readonly updateInterval: number;
  readonly calculateRates: boolean;
  readonly estimateTimeRemaining: boolean;
  readonly persistProgress: boolean;
  readonly metadata?: Record<string, unknown>;
}

export type ProgressListener = (update: ProgressUpdate) => void | Promise<void>;

export interface ProgressManagerConfig {
  serviceName: string;
  enableNotifications: boolean;
  enableLogging: boolean;
  cleanupDelayMs: number;
  maxActiveTrackers: number;
  globalUpdateInterval: number;
}

export interface ProgressManagerStats {
  activeTrackers: number;
  completedTrackers: number;
  failedTrackers: number;
  totalOperations: number;
  averageCompletionTime: number;
}

export class SyncProgressManager extends EventEmitter {
  private readonly config: ProgressManagerConfig;
  private readonly logger: Logger | undefined;
  private readonly notificationManager: NotificationManager | undefined;

  private readonly trackers = new Map<string, SyncProgressTracker>();
  private readonly completedTrackers = new Map<string, ProgressUpdate>();
  private readonly globalListeners = new Set<ProgressListener>();

  private stats: ProgressManagerStats = {
    activeTrackers: 0,
    completedTrackers: 0,
    failedTrackers: 0,
    totalOperations: 0,
    averageCompletionTime: 0,
  };

  constructor(
    config: ProgressManagerConfig,
    logger?: Logger,
    notificationManager?: NotificationManager
  ) {
    super();

    this.config = config;
    this.logger = logger;
    this.notificationManager = notificationManager;
  }

  /**
   * Create a new progress tracker
   */
  createTracker(config: ProgressConfig): SyncProgressTracker {
    // Check if we've reached the maximum number of active trackers
    if (this.trackers.size >= this.config.maxActiveTrackers) {
      this.cleanupCompletedTrackers();

      if (this.trackers.size >= this.config.maxActiveTrackers) {
        throw new Error(
          `Maximum number of active trackers reached: ${this.config.maxActiveTrackers}`
        );
      }
    }

    // Remove existing tracker with same ID if it exists
    if (this.trackers.has(config.operationId)) {
      this.removeTracker(config.operationId);
    }

    const tracker = new UnifiedProgressTracker(config, this.logger);
    this.trackers.set(config.operationId, tracker);

    // Set up event listeners
    this.setupTrackerListeners(tracker);

    // Update stats
    this.stats.activeTrackers = this.trackers.size;
    this.stats.totalOperations++;

    this.logger?.debug(`Created progress tracker: ${config.operationId}`);
    this.emit('tracker_created', tracker);

    return tracker;
  }

  /**
   * Get an existing tracker by operation ID
   */
  getTracker(operationId: string): SyncProgressTracker | undefined {
    return this.trackers.get(operationId);
  }

  /**
   * Remove a tracker
   */
  removeTracker(operationId: string): boolean {
    const tracker = this.trackers.get(operationId);
    if (!tracker) {
      return false;
    }

    // Cancel the tracker if it's still running
    if (tracker.status === ProgressStatus.IN_PROGRESS) {
      tracker.cancel();
    }

    this.trackers.delete(operationId);
    this.stats.activeTrackers = this.trackers.size;

    this.logger?.debug(`Removed progress tracker: ${operationId}`);
    this.emit('tracker_removed', operationId);

    return true;
  }

  /**
   * Get all active trackers
   */
  getActiveTrackers(): SyncProgressTracker[] {
    return Array.from(this.trackers.values());
  }

  /**
   * Get completed tracker snapshots
   */
  getCompletedTrackers(): ProgressUpdate[] {
    return Array.from(this.completedTrackers.values());
  }

  /**
   * Add a global progress listener
   */
  addGlobalListener(listener: ProgressListener): void {
    this.globalListeners.add(listener);
  }

  /**
   * Remove a global progress listener
   */
  removeGlobalListener(listener: ProgressListener): void {
    this.globalListeners.delete(listener);
  }

  /**
   * Get progress manager statistics
   */
  getStats(): ProgressManagerStats {
    return { ...this.stats };
  }

  /**
   * Clean up completed trackers
   */
  cleanupCompletedTrackers(): void {
    const now = Date.now();
    const cutoffTime = now - this.config.cleanupDelayMs;

    for (const [operationId, update] of this.completedTrackers) {
      if (update.timestamp.getTime() < cutoffTime) {
        this.completedTrackers.delete(operationId);
      }
    }

    this.logger?.debug(`Cleaned up completed trackers older than ${this.config.cleanupDelayMs}ms`);
  }

  /**
   * Create a tracker with common sync phases
   */
  createSyncTracker(
    operationId: string,
    operationName: string,
    totalItems: number,
    totalBytes?: number,
    customPhases?: ProgressPhase[]
  ): SyncProgressTracker {
    const phases = customPhases || [
      {
        id: 'prepare',
        name: 'Prepare',
        description: 'Preparing sync operation',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'analyze',
        name: 'Analyze',
        description: 'Analyzing content',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'transfer',
        name: 'Transfer',
        description: 'Transferring files',
        weight: 8,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'verify',
        name: 'Verify',
        description: 'Verifying transfers',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'cleanup',
        name: 'Cleanup',
        description: 'Cleaning up',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
    ];

    const config: ProgressConfig = {
      operationId,
      operationName,
      totalItems,
      totalBytes: totalBytes || 0,
      phases,
      updateInterval: this.config.globalUpdateInterval,
      calculateRates: true,
      estimateTimeRemaining: true,
      persistProgress: false,
      metadata: { service: this.config.serviceName },
    };

    return this.createTracker(config);
  }

  /**
   * Create a tracker for download operations
   */
  createDownloadTracker(
    operationId: string,
    operationName: string,
    totalBytes: number,
    fileCount?: number
  ): SyncProgressTracker {
    const phases: ProgressPhase[] = [
      {
        id: 'connect',
        name: 'Connect',
        description: 'Connecting to source',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'download',
        name: 'Download',
        description: 'Downloading content',
        weight: 8,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'verify',
        name: 'Verify',
        description: 'Verifying download',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
    ];

    const config: ProgressConfig = {
      operationId,
      operationName,
      totalItems: fileCount || 1,
      totalBytes,
      phases,
      updateInterval: this.config.globalUpdateInterval,
      calculateRates: true,
      estimateTimeRemaining: true,
      persistProgress: false,
      metadata: { service: this.config.serviceName, type: 'download' },
    };

    return this.createTracker(config);
  }

  /**
   * Create a tracker for device sync operations
   */
  createDeviceSyncTracker(
    operationId: string,
    deviceId: string,
    totalItems: number,
    totalBytes: number
  ): SyncProgressTracker {
    const phases: ProgressPhase[] = [
      {
        id: 'detect',
        name: 'Detect',
        description: 'Detecting device',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'mount',
        name: 'Mount',
        description: 'Mounting device',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'analyze',
        name: 'Analyze',
        description: 'Analyzing device content',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'sync',
        name: 'Sync',
        description: 'Syncing files',
        weight: 8,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
      {
        id: 'unmount',
        name: 'Unmount',
        description: 'Unmounting device',
        weight: 1,
        status: ProgressStatus.NOT_STARTED,
        progress: 0,
      },
    ];

    const config: ProgressConfig = {
      operationId,
      operationName: `Device Sync: ${deviceId}`,
      totalItems,
      totalBytes,
      phases,
      updateInterval: this.config.globalUpdateInterval,
      calculateRates: true,
      estimateTimeRemaining: true,
      persistProgress: false,
      metadata: { service: this.config.serviceName, type: 'device_sync', deviceId },
    };

    return this.createTracker(config);
  }

  private setupTrackerListeners(tracker: SyncProgressTracker): void {
    tracker.addProgressListener(async (update: ProgressUpdate) => {
      // Emit to manager listeners
      this.emit('progress', update);

      // Call global listeners
      for (const listener of this.globalListeners) {
        try {
          const result = listener(update);
          if (result instanceof Promise) {
            result.catch(error => {
              this.logger?.error('Error in global progress listener:', error);
            });
          }
        } catch (error) {
          this.logger?.error('Error in global progress listener:', error);
        }
      }

      // Handle status changes
      await this.handleStatusChange(update);
    });
  }

  private async handleStatusChange(update: ProgressUpdate): Promise<void> {
    switch (update.status) {
      case ProgressStatus.COMPLETED:
        await this.handleTrackerCompleted(update);
        break;
      case ProgressStatus.FAILED:
        await this.handleTrackerFailed(update);
        break;
      case ProgressStatus.CANCELLED:
        await this.handleTrackerCancelled(update);
        break;
    }
  }

  private async handleTrackerCompleted(update: ProgressUpdate): Promise<void> {
    // Store completed tracker snapshot
    this.completedTrackers.set(update.operationId, update);

    // Update stats
    this.stats.completedTrackers++;
    this.updateAverageCompletionTime(update);

    // Remove from active trackers after delay
    setTimeout(() => {
      this.removeTracker(update.operationId);
    }, this.config.cleanupDelayMs);

    // Send notification if enabled
    if (this.config.enableNotifications && this.notificationManager) {
      await this.notificationManager.notify(
        NotificationType.SYNC_COMPLETED,
        `${update.operationName} completed successfully`,
        {
          level: NotificationLevel.INFO,
          source: this.config.serviceName,
          data: {
            operationId: update.operationId,
            progress: update.progress,
            elapsedTime: update.metrics.elapsedTime,
          },
        }
      );
    }

    this.logger?.info(
      `Progress tracker completed: ${update.operationId} (${update.operationName})`
    );
  }

  private async handleTrackerFailed(update: ProgressUpdate): Promise<void> {
    // Update stats
    this.stats.failedTrackers++;

    // Send notification if enabled
    if (this.config.enableNotifications && this.notificationManager) {
      await this.notificationManager.notify(
        NotificationType.SYNC_FAILED,
        `${update.operationName} failed: ${update.message || 'Unknown error'}`,
        {
          level: NotificationLevel.ERROR,
          source: this.config.serviceName,
          data: {
            operationId: update.operationId,
            progress: update.progress,
            message: update.message,
          },
        }
      );
    }

    this.logger?.error(`Progress tracker failed: ${update.operationId} (${update.operationName})`, {
      message: update.message,
      progress: update.progress,
    });
  }

  private async handleTrackerCancelled(update: ProgressUpdate): Promise<void> {
    this.logger?.info(
      `Progress tracker cancelled: ${update.operationId} (${update.operationName})`
    );
  }

  private updateAverageCompletionTime(update: ProgressUpdate): void {
    const completionTime = update.metrics.elapsedTime;
    const totalCompleted = this.stats.completedTrackers;

    if (totalCompleted === 1) {
      this.stats.averageCompletionTime = completionTime;
    } else {
      // Calculate running average
      this.stats.averageCompletionTime =
        (this.stats.averageCompletionTime * (totalCompleted - 1) + completionTime) / totalCompleted;
    }
  }
}
