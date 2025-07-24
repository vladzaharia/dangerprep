/**
 * Convenience functions for common progress tracking patterns
 */

import { globalProgressManager } from './manager.js';
import {
  type ProgressConfig,
  type ProgressPhase,
  type IProgressTracker,
  type ProgressListener,
} from './types.js';

/**
 * Create a progress tracker with sensible defaults
 */
export function createProgressTracker(
  operationId: string,
  operationName: string,
  options: Partial<ProgressConfig> = {}
): IProgressTracker {
  const config: ProgressConfig = {
    operationId,
    operationName,
    totalItems: 0,
    totalBytes: 0,
    phases: [],
    updateInterval: 1000, // 1 second default
    calculateRates: true,
    estimateTimeRemaining: true,
    ...options,
  };

  return globalProgressManager.createTracker(config);
}

/**
 * Create phase configuration for multi-phase operations
 */
export function createPhaseConfig(
  phases: Array<{
    id: string;
    name: string;
    description?: string;
    weight?: number;
  }>
): Omit<ProgressPhase, 'status' | 'progress' | 'startTime' | 'endTime' | 'error'>[] {
  return phases.map(phase => ({
    id: phase.id,
    name: phase.name,
    description: phase.description || '',
    weight: phase.weight || 1,
  }));
}

/**
 * Decorator for automatic progress tracking of async methods
 */
export function withProgressTracking(options: {
  operationName?: string;
  totalItems?: number;
  phases?: Array<{
    id: string;
    name: string;
    description?: string;
    weight?: number;
  }>;
  updateInterval?: number;
}) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;

    if (!originalMethod) {
      throw new Error('withProgressTracking can only be applied to methods');
    }

    descriptor.value = async function (
      this: { __progressTracker?: IProgressTracker },
      ...args: unknown[]
    ) {
      const operationId = `${target.constructor.name}.${String(propertyKey)}_${Date.now()}`;
      const operationName =
        options.operationName || `${target.constructor.name}.${String(propertyKey)}`;

      const config: ProgressConfig = {
        operationId,
        operationName,
        totalItems: options.totalItems || 0,
        totalBytes: 0,
        phases: options.phases ? createPhaseConfig(options.phases) : [],
        updateInterval: options.updateInterval || 1000,
        calculateRates: true,
        estimateTimeRemaining: true,
      };

      const tracker = globalProgressManager.createTracker(config);

      try {
        tracker.start();

        // Bind tracker to method context for access within the method
        this.__progressTracker = tracker;

        const result = await originalMethod.apply(this, args);

        tracker.complete();
        return result;
      } catch (error) {
        tracker.fail(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        delete this.__progressTracker;
      }
    } as T;

    return descriptor;
  };
}

/**
 * Helper function to get the current progress tracker from within a decorated method
 */
export function getCurrentProgressTracker(context: {
  __progressTracker?: IProgressTracker;
}): IProgressTracker | null {
  return context.__progressTracker || null;
}

/**
 * Create a simple progress tracker for file operations
 */
export function createFileProgressTracker(
  operationId: string,
  totalFiles: number,
  totalBytes?: number
): IProgressTracker {
  return createProgressTracker(operationId, 'File Operation', {
    totalItems: totalFiles,
    totalBytes: totalBytes || 0,
    phases: createPhaseConfig([
      { id: 'scan', name: 'Scanning Files', weight: 1 },
      { id: 'process', name: 'Processing Files', weight: 8 },
      { id: 'cleanup', name: 'Cleanup', weight: 1 },
    ]),
  });
}

/**
 * Create a progress tracker for sync operations
 */
export function createSyncProgressTracker(
  operationId: string,
  totalItems: number,
  phases: Array<{ id: string; name: string; weight?: number }> = []
): IProgressTracker {
  const defaultPhases = [
    { id: 'prepare', name: 'Preparing', weight: 1 },
    { id: 'sync', name: 'Synchronizing', weight: 8 },
    { id: 'verify', name: 'Verifying', weight: 1 },
  ];

  return createProgressTracker(operationId, 'Sync Operation', {
    totalItems,
    phases: createPhaseConfig(phases.length > 0 ? phases : defaultPhases),
  });
}

/**
 * Create a progress tracker for download operations
 */
export function createDownloadProgressTracker(
  operationId: string,
  totalBytes: number,
  totalFiles?: number
): IProgressTracker {
  return createProgressTracker(operationId, 'Download Operation', {
    totalItems: totalFiles || 1,
    totalBytes: totalBytes || 0,
    phases: createPhaseConfig([
      { id: 'connect', name: 'Connecting', weight: 1 },
      { id: 'download', name: 'Downloading', weight: 9 },
    ]),
  });
}

/**
 * Utility to track progress of an array processing operation
 */
export async function trackArrayProgress<T, R>(
  items: T[],
  processor: (item: T, index: number, tracker: IProgressTracker) => Promise<R>,
  options: {
    operationId: string;
    operationName?: string;
    batchSize?: number;
    onProgress?: ProgressListener;
  }
): Promise<R[]> {
  const tracker = createProgressTracker(
    options.operationId,
    options.operationName || 'Array Processing',
    { totalItems: items.length }
  );

  if (options.onProgress) {
    tracker.addProgressListener(options.onProgress);
  }

  const results: R[] = [];
  const batchSize = options.batchSize || 1;

  try {
    tracker.start();

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      for (let j = 0; j < batch.length; j++) {
        const itemIndex = i + j;
        const item = batch[j];

        tracker.updateCurrentOperation('Processing item', `${itemIndex + 1}/${items.length}`);

        try {
          if (item === undefined) {
            throw new Error(`Item at index ${itemIndex} is undefined`);
          }
          const result = await processor(item, itemIndex, tracker);
          results.push(result);
          tracker.updateProgress(results.length);
        } catch (error) {
          tracker.addFailedItems(1);
          throw error;
        }
      }
    }

    tracker.complete();
    return results;
  } catch (error) {
    tracker.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Utility to track progress of a stream processing operation
 */
export function createStreamProgressTracker(
  operationId: string,
  expectedSize?: number
): {
  tracker: IProgressTracker;
  updateProgress: (processedBytes: number) => void;
  complete: () => void;
  fail: (error: string) => void;
} {
  const tracker = createProgressTracker(operationId, 'Stream Processing', {
    totalBytes: expectedSize || 0,
    totalItems: 1,
  });

  return {
    tracker,
    updateProgress: (processedBytes: number) => {
      tracker.updateProgress(0, processedBytes);
    },
    complete: () => {
      tracker.updateProgress(1, expectedSize || 0);
      tracker.complete();
    },
    fail: (error: string) => {
      tracker.fail(error);
    },
  };
}

/**
 * Create a progress tracker that automatically updates based on a callback
 */
export function createCallbackProgressTracker(
  operationId: string,
  operationName: string,
  getProgress: () => { completed: number; total: number; current?: string },
  updateInterval: number = 1000
): IProgressTracker {
  const tracker = createProgressTracker(operationId, operationName, {
    updateInterval,
  });

  // Override the update timer to use the callback
  const originalStart = tracker.start.bind(tracker);
  tracker.start = () => {
    originalStart();

    const updateFromCallback = () => {
      try {
        const progress = getProgress();
        tracker.updateProgress(progress.completed);

        if (progress.current) {
          tracker.updateCurrentOperation('Processing', progress.current);
        }

        // Update total if it changed
        const currentProgress = tracker.getCurrentProgress();
        if (currentProgress.metrics.totalItems !== progress.total) {
          currentProgress.metrics.totalItems = progress.total;
        }
      } catch (_error) {
        // Silently ignore callback errors to avoid console pollution
        // In a production environment, this could be logged to a proper logger
      }
    };

    // Initial update
    updateFromCallback();

    // Set up interval
    const interval = setInterval(updateFromCallback, updateInterval);

    // Clean up interval when tracker is disposed
    const originalDispose = tracker.dispose.bind(tracker);
    tracker.dispose = () => {
      clearInterval(interval);
      originalDispose();
    };
  };

  return tracker;
}
