/**
 * Progress manager for managing multiple progress trackers
 */

import { EventEmitter } from 'events';

// Result types available for future use
import type { Logger } from '../logging';

import { ProgressTracker } from './progress-tracker.js';
import {
  type IProgressManager,
  type IProgressTracker,
  type ProgressConfig,
  type ProgressUpdate,
  type ProgressListener,
  ProgressStatus,
} from './types.js';

export class ProgressManager extends EventEmitter implements IProgressManager {
  private trackers = new Map<string, IProgressTracker>();
  private globalListeners: ProgressListener[] = [];
  private logger: Logger | undefined;

  constructor(logger?: Logger) {
    super();
    this.logger = logger;
  }

  createTracker(config: ProgressConfig): IProgressTracker {
    // Remove existing tracker with same ID if it exists
    if (this.trackers.has(config.operationId)) {
      this.removeTracker(config.operationId);
    }

    const tracker = new ProgressTracker(config);
    this.trackers.set(config.operationId, tracker);

    // Forward progress events to global listeners
    tracker.addProgressListener((update: ProgressUpdate) => {
      this.emit('progress', update);

      // Notify global listeners
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
    });

    // Auto-remove tracker when operation completes
    tracker.addProgressListener((update: ProgressUpdate) => {
      if (
        update.status === ProgressStatus.COMPLETED ||
        update.status === ProgressStatus.FAILED ||
        update.status === ProgressStatus.CANCELLED
      ) {
        // Remove after a short delay to allow final event processing
        setTimeout(() => {
          this.removeTracker(update.operationId);
        }, 1000);
      }
    });

    return tracker;
  }

  getTracker(operationId: string): IProgressTracker | null {
    return this.trackers.get(operationId) || null;
  }

  getAllTrackers(): IProgressTracker[] {
    return Array.from(this.trackers.values());
  }

  removeTracker(operationId: string): void {
    const tracker = this.trackers.get(operationId);
    if (tracker) {
      tracker.dispose();
      this.trackers.delete(operationId);
    }
  }

  addGlobalListener(listener: ProgressListener): void {
    this.globalListeners.push(listener);
  }

  removeGlobalListener(listener: ProgressListener): void {
    const index = this.globalListeners.indexOf(listener);
    if (index >= 0) {
      this.globalListeners.splice(index, 1);
    }
  }

  getProgressSummary(): {
    totalOperations: number;
    activeOperations: number;
    completedOperations: number;
    failedOperations: number;
  } {
    const trackers = this.getAllTrackers();
    const summary = {
      totalOperations: trackers.length,
      activeOperations: 0,
      completedOperations: 0,
      failedOperations: 0,
    };

    for (const tracker of trackers) {
      const progress = tracker.getCurrentProgress();

      switch (progress.status) {
        case ProgressStatus.IN_PROGRESS:
        case ProgressStatus.PAUSED:
          summary.activeOperations++;
          break;
        case ProgressStatus.COMPLETED:
          summary.completedOperations++;
          break;
        case ProgressStatus.FAILED:
        case ProgressStatus.CANCELLED:
          summary.failedOperations++;
          break;
      }
    }

    return summary;
  }

  /**
   * Get progress updates for all active operations
   */
  getAllProgress(): ProgressUpdate[] {
    return this.getAllTrackers().map(tracker => tracker.getCurrentProgress());
  }

  /**
   * Get progress updates for operations with specific status
   */
  getProgressByStatus(status: ProgressStatus): ProgressUpdate[] {
    return this.getAllTrackers()
      .map(tracker => tracker.getCurrentProgress())
      .filter(progress => progress.status === status);
  }

  /**
   * Cancel all active operations
   */
  cancelAllOperations(): void {
    for (const tracker of this.trackers.values()) {
      const progress = tracker.getCurrentProgress();
      if (
        progress.status === ProgressStatus.IN_PROGRESS ||
        progress.status === ProgressStatus.PAUSED
      ) {
        tracker.cancel();
      }
    }
  }

  /**
   * Pause all active operations
   */
  pauseAllOperations(): void {
    for (const tracker of this.trackers.values()) {
      const progress = tracker.getCurrentProgress();
      if (progress.status === ProgressStatus.IN_PROGRESS) {
        tracker.pause();
      }
    }
  }

  /**
   * Resume all paused operations
   */
  resumeAllOperations(): void {
    for (const tracker of this.trackers.values()) {
      const progress = tracker.getCurrentProgress();
      if (progress.status === ProgressStatus.PAUSED) {
        tracker.resume();
      }
    }
  }

  /**
   * Clean up completed and failed operations
   */
  cleanup(): void {
    const toRemove: string[] = [];

    for (const [operationId, tracker] of this.trackers.entries()) {
      const progress = tracker.getCurrentProgress();
      if (
        progress.status === ProgressStatus.COMPLETED ||
        progress.status === ProgressStatus.FAILED ||
        progress.status === ProgressStatus.CANCELLED
      ) {
        toRemove.push(operationId);
      }
    }

    for (const operationId of toRemove) {
      this.removeTracker(operationId);
    }
  }

  /**
   * Dispose of the manager and all trackers
   */
  dispose(): void {
    for (const tracker of this.trackers.values()) {
      tracker.dispose();
    }
    this.trackers.clear();
    this.globalListeners.length = 0;
    this.removeAllListeners();
  }
}

/**
 * Global progress manager instance
 */
export const globalProgressManager = new ProgressManager();
