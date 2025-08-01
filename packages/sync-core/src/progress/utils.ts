/**
 * Utility functions for progress tracking
 */

import { ProgressInfo, ProgressPhase, ProgressStatus, ProgressUpdate } from '@dangerprep/types';

/**
 * Calculate basic progress information (enhanced version)
 */
export const calculateProgressInfo = (completed: number, total: number): ProgressInfo => ({
  completed: Math.max(0, completed),
  total: Math.max(0, total),
  percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
});

/**
 * Calculate transfer speed in bytes per second (enhanced version)
 */
export const calculateTransferSpeed = (bytesTransferred: number, timeElapsedMs: number): number => {
  if (timeElapsedMs <= 0) return 0;
  return Math.round((bytesTransferred / timeElapsedMs) * 1000);
};

/**
 * Calculate estimated time remaining in seconds (enhanced version)
 */
export const calculateEstimatedTime = (remainingBytes: number, currentSpeedBps: number): number => {
  if (currentSpeedBps <= 0) return 0;
  return Math.round(remainingBytes / currentSpeedBps);
};

/**
 * Format bytes to human-readable string
 */
export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Format speed to human-readable string
 */
export const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatBytes(bytesPerSecond)}/s`;
};

/**
 * Format time duration to human-readable string
 */
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
};

/**
 * Format ETA to human-readable string
 */
export const formatETA = (seconds: number): string => {
  if (seconds <= 0) return 'Unknown';
  if (seconds < 60) return `${Math.round(seconds)}s remaining`;
  return `${formatDuration(seconds)} remaining`;
};

/**
 * Create a progress info object with calculated values
 */
export const createProgressInfo = (
  completed: number,
  total: number,
  speed?: number,
  currentItem?: string
): ProgressInfo => {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const remainingItems = total - completed;
  const eta = speed && speed > 0 ? Math.round(remainingItems / speed) : undefined;

  return {
    completed,
    total,
    percentage,
    ...(speed !== undefined && { speed }),
    ...(eta !== undefined && { eta }),
    ...(currentItem !== undefined && { currentItem }),
  };
};

/**
 * Create standard sync phases
 */
export const createSyncPhases = (): ProgressPhase[] => [
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

/**
 * Create download phases
 */
export const createDownloadPhases = (): ProgressPhase[] => [
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

/**
 * Create device sync phases
 */
export const createDeviceSyncPhases = (): ProgressPhase[] => [
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

/**
 * Calculate weighted progress across multiple phases
 */
export const calculatePhaseProgress = (phases: ProgressPhase[]): number => {
  if (phases.length === 0) return 0;

  let totalWeight = 0;
  let completedWeight = 0;

  for (const phase of phases) {
    totalWeight += phase.weight;
    completedWeight += (phase.progress / 100) * phase.weight;
  }

  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
};

/**
 * Check if a progress update represents a significant change
 */
export const isSignificantProgressChange = (
  previous: ProgressUpdate | undefined,
  current: ProgressUpdate,
  threshold: number = 1
): boolean => {
  if (!previous) return true;

  // Status change is always significant
  if (previous.status !== current.status) return true;

  // Phase change is always significant
  if (previous.phase?.id !== current.phase?.id) return true;

  // Progress change above threshold
  if (Math.abs(current.progress - previous.progress) >= threshold) return true;

  // Current item change
  if (previous.currentItem !== current.currentItem) return true;

  return false;
};

/**
 * Create a summary of progress metrics
 */
export const createProgressSummary = (update: ProgressUpdate): string => {
  const { progress, metrics, currentItem, phase } = update;

  let summary = `${progress}%`;

  if (phase) {
    summary += ` (${phase.name})`;
  }

  if (metrics.speed > 0) {
    summary += ` - ${formatSpeed(metrics.speed)}`;
  }

  if (metrics.eta && metrics.eta > 0) {
    summary += ` - ${formatETA(metrics.eta)}`;
  }

  if (currentItem) {
    summary += ` - ${currentItem}`;
  }

  return summary;
};

/**
 * Validate progress configuration
 */
export const validateProgressConfig = (config: unknown): string[] => {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('config must be an object');
    return errors;
  }

  const cfg = config as Record<string, unknown>;

  if (!cfg.operationId || typeof cfg.operationId !== 'string') {
    errors.push('operationId is required and must be a string');
  }

  if (!cfg.operationName || typeof cfg.operationName !== 'string') {
    errors.push('operationName is required and must be a string');
  }

  if (typeof cfg.totalItems !== 'number' || cfg.totalItems < 0) {
    errors.push('totalItems must be a non-negative number');
  }

  if (typeof cfg.totalBytes !== 'number' || cfg.totalBytes < 0) {
    errors.push('totalBytes must be a non-negative number');
  }

  if (cfg.updateInterval && (typeof cfg.updateInterval !== 'number' || cfg.updateInterval <= 0)) {
    errors.push('updateInterval must be a positive number');
  }

  if (cfg.phases && Array.isArray(cfg.phases)) {
    for (let i = 0; i < cfg.phases.length; i++) {
      const phase = cfg.phases[i] as Record<string, unknown>;
      if (!phase.id || typeof phase.id !== 'string') {
        errors.push(`Phase ${i}: id is required and must be a string`);
      }
      if (!phase.name || typeof phase.name !== 'string') {
        errors.push(`Phase ${i}: name is required and must be a string`);
      }
      if (typeof phase.weight !== 'number' || phase.weight <= 0) {
        errors.push(`Phase ${i}: weight must be a positive number`);
      }
    }
  }

  return errors;
};

/**
 * Merge progress updates for aggregated reporting
 */
export const mergeProgressUpdates = (updates: ProgressUpdate[]): ProgressUpdate | null => {
  if (updates.length === 0) return null;
  if (updates.length === 1) return updates[0] || null;

  // Use the most recent update as base
  const latest = updates.reduce((latest, current) =>
    current.timestamp > latest.timestamp ? current : latest
  );

  // Calculate aggregated metrics
  let totalItems = 0;
  let completedItems = 0;
  let totalBytes = 0;
  let processedBytes = 0;
  let totalElapsedTime = 0;

  for (const update of updates) {
    totalItems += update.metrics.totalItems;
    completedItems += update.metrics.completedItems;
    totalBytes += update.metrics.totalBytes;
    processedBytes += update.metrics.processedBytes;
    totalElapsedTime += update.metrics.elapsedTime;
  }

  const averageElapsedTime = totalElapsedTime / updates.length;
  const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const averageSpeed = averageElapsedTime > 0 ? processedBytes / averageElapsedTime : 0;
  const eta = averageSpeed > 0 ? (totalBytes - processedBytes) / averageSpeed : 0;

  return {
    ...latest,
    operationId: 'aggregated',
    operationName: `Aggregated Progress (${updates.length} operations)`,
    progress: overallProgress,
    metrics: {
      ...latest.metrics,
      totalItems,
      completedItems,
      totalBytes,
      processedBytes,
      speed: averageSpeed,
      averageSpeed,
      eta,
      elapsedTime: averageElapsedTime,
    },
  };
};
