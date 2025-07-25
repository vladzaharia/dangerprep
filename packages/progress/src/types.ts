/**
 * Types and interfaces for progress tracking system
 */

/**
 * Progress status enumeration
 */
export enum ProgressStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Progress phase for multi-phase operations
 */
export interface ProgressPhase {
  /** Unique identifier for the phase */
  id: string;

  /** Human-readable name of the phase */
  name: string;

  /** Description of what happens in this phase */
  description?: string;

  /** Expected weight of this phase (for weighted progress calculation) */
  weight?: number;

  /** Current status of this phase */
  status: ProgressStatus;

  /** Progress within this phase (0-100) */
  progress: number;

  /** Start time of this phase */
  startTime?: Date;

  /** End time of this phase */
  endTime?: Date;

  /** Error information if phase failed */
  error?: string;

  /** Additional metadata for this phase */
  metadata?: Record<string, unknown>;
}

/**
 * Progress metrics for tracking performance
 */
export interface ProgressMetrics {
  /** Total items to process */
  totalItems: number;

  /** Items completed successfully */
  completedItems: number;

  /** Items that failed processing */
  failedItems: number;

  /** Items currently being processed */
  processingItems: number;

  /** Items skipped */
  skippedItems: number;

  /** Total bytes to process */
  totalBytes: number;

  /** Bytes processed successfully */
  processedBytes: number;

  /** Current processing rate (items per second) */
  itemsPerSecond: number;

  /** Current processing rate (bytes per second) */
  bytesPerSecond: number;

  /** Estimated time remaining (milliseconds) */
  estimatedTimeRemaining: number;

  /** Elapsed time since start (milliseconds) */
  elapsedTime: number;
}

/**
 * Progress update event data
 */
export interface ProgressUpdate {
  /** Unique identifier for the operation */
  operationId: string;

  /** Current overall progress (0-100) */
  progress: number;

  /** Current status */
  status: ProgressStatus;

  /** Current phase information */
  currentPhase?: ProgressPhase | undefined;

  /** All phases for multi-phase operations */
  phases?: ProgressPhase[] | undefined;

  /** Progress metrics */
  metrics: ProgressMetrics;

  /** Current operation description */
  currentOperation?: string;

  /** Current item being processed */
  currentItem?: string;

  /** Timestamp of this update */
  timestamp: Date;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Progress tracker configuration
 */
export interface ProgressConfig {
  /** Unique identifier for the operation */
  operationId: string;

  /** Human-readable name for the operation */
  operationName: string;

  /** Description of the operation */
  description?: string;

  /** Total items expected to be processed */
  totalItems: number;

  /** Total bytes expected to be processed */
  totalBytes: number;

  /** Phases for multi-phase operations */
  phases: Omit<ProgressPhase, 'status' | 'progress' | 'startTime' | 'endTime' | 'error'>[];

  /** Update interval in milliseconds */
  updateInterval?: number;

  /** Whether to calculate processing rates */
  calculateRates?: boolean;

  /** Whether to estimate time remaining */
  estimateTimeRemaining?: boolean;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Progress event listener function
 */
export type ProgressListener = (update: ProgressUpdate) => void | Promise<void>;

/**
 * Progress tracker interface
 */
export interface IProgressTracker {
  /** Get current progress update */
  getCurrentProgress(): ProgressUpdate;

  /** Start the operation */
  start(): void;

  /** Update progress with completed items */
  updateProgress(completedItems: number, processedBytes?: number): void;

  /** Update current operation description */
  updateCurrentOperation(operation: string, item?: string): void;

  /** Start a specific phase */
  startPhase(phaseId: string): void;

  /** Update progress within current phase */
  updatePhaseProgress(phaseId: string, progress: number): void;

  /** Complete a specific phase */
  completePhase(phaseId: string): void;

  /** Fail a specific phase */
  failPhase(phaseId: string, error: string): void;

  /** Add failed items */
  addFailedItems(count: number): void;

  /** Add skipped items */
  addSkippedItems(count: number): void;

  /** Pause the operation */
  pause(): void;

  /** Resume the operation */
  resume(): void;

  /** Complete the operation successfully */
  complete(): void;

  /** Fail the operation */
  fail(error: string): void;

  /** Cancel the operation */
  cancel(): void;

  /** Add progress listener */
  addProgressListener(listener: ProgressListener): void;

  /** Remove progress listener */
  removeProgressListener(listener: ProgressListener): void;

  /** Remove all progress listeners */
  removeAllProgressListeners(): void;

  /** Dispose of the tracker */
  dispose(): void;
}

/**
 * Progress manager interface for managing multiple operations
 */
export interface IProgressManager {
  /** Create a new progress tracker */
  createTracker(config: ProgressConfig): IProgressTracker;

  /** Get existing tracker by operation ID */
  getTracker(operationId: string): IProgressTracker | null;

  /** Get all active trackers */
  getAllTrackers(): IProgressTracker[];

  /** Remove tracker */
  removeTracker(operationId: string): void;

  /** Add global progress listener */
  addGlobalListener(listener: ProgressListener): void;

  /** Remove global progress listener */
  removeGlobalListener(listener: ProgressListener): void;

  /** Get progress summary for all operations */
  getProgressSummary(): {
    totalOperations: number;
    activeOperations: number;
    completedOperations: number;
    failedOperations: number;
  };
}

/**
 * Progress persistence interface
 */
export interface IProgressPersistence {
  /** Save progress state */
  saveProgress(operationId: string, progress: ProgressUpdate): Promise<void>;

  /** Load progress state */
  loadProgress(operationId: string): Promise<ProgressUpdate | null>;

  /** Delete progress state */
  deleteProgress(operationId: string): Promise<void>;

  /** List all saved progress states */
  listProgress(): Promise<string[]>;

  /** Clean up old progress states */
  cleanup(olderThanMs: number): Promise<void>;
}
