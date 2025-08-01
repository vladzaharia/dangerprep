/**
 * Shared progress tracking types and interfaces for DangerPrep services
 */

// Progress tracking interface
export interface ProgressInfo {
  readonly completed: number;
  readonly total: number;
  readonly percentage: number;
  readonly speed?: number;
  readonly eta?: number;
  readonly currentItem?: string;
}

// Progress status enumeration
export enum ProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// Progress phase for multi-step operations
export interface ProgressPhase {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly weight: number; // Relative weight for progress calculation
  readonly status: ProgressStatus;
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly progress: number; // 0-100
  readonly metadata?: Record<string, unknown>;
}

// Progress metrics for detailed tracking
export interface ProgressMetrics {
  readonly totalItems: number;
  readonly completedItems: number;
  readonly totalBytes: number;
  readonly processedBytes: number;
  readonly speed: number; // items or bytes per second
  readonly averageSpeed: number;
  readonly eta: number; // estimated time remaining in seconds
  readonly elapsedTime: number; // elapsed time in seconds
  readonly startTime: Date;
  readonly lastUpdateTime: Date;
}

// Progress update event
export interface ProgressUpdate {
  readonly operationId: string;
  readonly operationName: string;
  readonly status: ProgressStatus;
  readonly progress: number; // 0-100
  readonly phase?: ProgressPhase;
  readonly metrics: ProgressMetrics;
  readonly message?: string;
  readonly currentItem?: string;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;
}

// Progress listener function type
export type ProgressListener = (update: ProgressUpdate) => void | Promise<void>;

// Progress configuration
export interface ProgressConfig {
  readonly operationId: string;
  readonly operationName: string;
  readonly totalItems: number;
  readonly totalBytes: number;
  readonly phases: ProgressPhase[];
  readonly updateInterval: number; // milliseconds
  readonly calculateRates: boolean;
  readonly estimateTimeRemaining: boolean;
  readonly persistProgress: boolean;
  readonly metadata?: Record<string, unknown>;
}

// Progress phase for multi-step operations
export interface ProgressPhase {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly weight: number; // Relative weight for progress calculation
  readonly status: ProgressStatus;
  readonly startTime?: Date;
  readonly endTime?: Date;
  readonly progress: number; // 0-100
  readonly metadata?: Record<string, unknown>;
}

// Utility functions for progress calculation
export const calculateProgress = (completed: number, total: number): ProgressInfo => ({
  completed,
  total,
  percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
});

export const calculateSpeed = (bytesTransferred: number, timeElapsedMs: number): number => {
  if (timeElapsedMs <= 0) return 0;
  return Math.round((bytesTransferred / timeElapsedMs) * 1000); // bytes per second
};

export const calculateETA = (remainingBytes: number, currentSpeedBps: number): number => {
  if (currentSpeedBps <= 0) return 0;
  return Math.round(remainingBytes / currentSpeedBps); // seconds
};

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
    ...(currentItem && { currentItem }),
  };
};
