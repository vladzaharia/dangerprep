/**
 * Unified progress tracker for sync operations
 */

import { EventEmitter } from 'events';

import { Logger } from '@dangerprep/logging';
import { ProgressStatus, ProgressPhase, ProgressMetrics, ProgressUpdate } from '@dangerprep/types';

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

export interface SyncProgressTracker {
  readonly operationId: string;
  readonly operationName: string;
  readonly status: ProgressStatus;
  readonly progress: number;
  readonly currentPhase: ProgressPhase | undefined;
  readonly metrics: ProgressMetrics;

  start(): void;
  pause(): void;
  resume(): void;
  complete(): void;
  fail(error?: string): void;
  cancel(): void;

  updateProgress(completedItems: number, processedBytes?: number, currentItem?: string): void;
  setPhase(phaseId: string): void;
  updatePhaseProgress(phaseId: string, progress: number): void;

  addProgressListener(listener: ProgressListener): void;
  removeProgressListener(listener: ProgressListener): void;

  getSnapshot(): ProgressUpdate;
}

export class UnifiedProgressTracker extends EventEmitter implements SyncProgressTracker {
  public readonly operationId: string;
  public readonly operationName: string;

  private _status: ProgressStatus = ProgressStatus.NOT_STARTED;
  private _progress: number = 0;
  private _currentPhase?: ProgressPhase;
  private _metrics: ProgressMetrics;
  private _phases: Map<string, ProgressPhase> = new Map();
  private _listeners: Set<ProgressListener> = new Set();

  private readonly config: ProgressConfig;
  private readonly logger: Logger | undefined;
  private updateTimer: NodeJS.Timeout | undefined;
  private lastUpdateTime: Date = new Date();

  constructor(config: ProgressConfig, logger?: Logger) {
    super();

    this.operationId = config.operationId;
    this.operationName = config.operationName;
    this.config = config;
    this.logger = logger;

    // Initialize phases
    for (const phase of config.phases) {
      this._phases.set(phase.id, { ...phase, status: ProgressStatus.NOT_STARTED, progress: 0 });
    }

    // Initialize metrics
    const now = new Date();
    this._metrics = {
      totalItems: config.totalItems,
      completedItems: 0,
      totalBytes: config.totalBytes,
      processedBytes: 0,
      speed: 0,
      averageSpeed: 0,
      eta: 0,
      elapsedTime: 0,
      startTime: now,
      lastUpdateTime: now,
    };
  }

  get status(): ProgressStatus {
    return this._status;
  }

  get progress(): number {
    return this._progress;
  }

  get currentPhase(): ProgressPhase | undefined {
    return this._currentPhase;
  }

  get metrics(): ProgressMetrics {
    return { ...this._metrics };
  }

  start(): void {
    if (this._status !== ProgressStatus.NOT_STARTED) {
      return;
    }

    this._status = ProgressStatus.IN_PROGRESS;
    this._metrics = {
      ...this._metrics,
      startTime: new Date(),
      lastUpdateTime: new Date(),
    };

    this.startUpdateTimer();
    this.emitUpdate('Progress tracking started');

    this.logger?.debug(`Progress tracker started: ${this.operationId}`);
  }

  pause(): void {
    if (this._status !== ProgressStatus.IN_PROGRESS) {
      return;
    }

    this._status = ProgressStatus.PAUSED;
    this.stopUpdateTimer();
    this.emitUpdate('Progress tracking paused');

    this.logger?.debug(`Progress tracker paused: ${this.operationId}`);
  }

  resume(): void {
    if (this._status !== ProgressStatus.PAUSED) {
      return;
    }

    this._status = ProgressStatus.IN_PROGRESS;
    this.startUpdateTimer();
    this.emitUpdate('Progress tracking resumed');

    this.logger?.debug(`Progress tracker resumed: ${this.operationId}`);
  }

  complete(): void {
    if (this._status === ProgressStatus.COMPLETED) {
      return;
    }

    this._status = ProgressStatus.COMPLETED;
    this._progress = 100;

    // Mark all phases as completed
    for (const [id, phase] of this._phases) {
      this._phases.set(id, {
        ...phase,
        status: ProgressStatus.COMPLETED,
        progress: 100,
        endTime: new Date(),
      });
    }

    this.stopUpdateTimer();
    this.emitUpdate('Progress tracking completed');

    this.logger?.info(`Progress tracker completed: ${this.operationId}`);
  }

  fail(error?: string): void {
    this._status = ProgressStatus.FAILED;
    this.stopUpdateTimer();
    this.emitUpdate(error || 'Progress tracking failed');

    this.logger?.error(`Progress tracker failed: ${this.operationId}`, { error });
  }

  cancel(): void {
    this._status = ProgressStatus.CANCELLED;
    this.stopUpdateTimer();
    this.emitUpdate('Progress tracking cancelled');

    this.logger?.info(`Progress tracker cancelled: ${this.operationId}`);
  }

  updateProgress(completedItems: number, processedBytes?: number, currentItem?: string): void {
    if (this._status !== ProgressStatus.IN_PROGRESS) {
      return;
    }

    const now = new Date();
    const elapsedMs = now.getTime() - this._metrics.startTime.getTime();
    const timeSinceLastUpdate = now.getTime() - this.lastUpdateTime.getTime();

    // Update metrics
    this._metrics = {
      ...this._metrics,
      completedItems: Math.max(0, Math.min(completedItems, this._metrics.totalItems)),
      processedBytes:
        processedBytes !== undefined ? Math.max(0, processedBytes) : this._metrics.processedBytes,
      elapsedTime: Math.round(elapsedMs / 1000),
      lastUpdateTime: now,
    };

    // Calculate speed and ETA if enabled
    if (this.config.calculateRates && timeSinceLastUpdate > 0) {
      this.calculateRates(timeSinceLastUpdate);
    }

    // Calculate overall progress
    this.calculateProgress();

    this.lastUpdateTime = now;
    this.emitUpdate(currentItem ? `Processing: ${currentItem}` : undefined, currentItem);
  }

  setPhase(phaseId: string): void {
    const phase = this._phases.get(phaseId);
    if (!phase) {
      this.logger?.warn(`Unknown phase: ${phaseId}`);
      return;
    }

    // Mark previous phase as completed
    if (this._currentPhase) {
      this._phases.set(this._currentPhase.id, {
        ...this._currentPhase,
        status: ProgressStatus.COMPLETED,
        progress: 100,
        endTime: new Date(),
      });
    }

    // Set new current phase
    const updatedPhase = {
      ...phase,
      status: ProgressStatus.IN_PROGRESS,
      startTime: new Date(),
    };

    this._phases.set(phaseId, updatedPhase);
    this._currentPhase = updatedPhase;

    this.emitUpdate(`Started phase: ${phase.name}`);
    this.logger?.debug(`Phase started: ${phaseId} (${phase.name})`);
  }

  updatePhaseProgress(phaseId: string, progress: number): void {
    const phase = this._phases.get(phaseId);
    if (!phase) {
      this.logger?.warn(`Unknown phase: ${phaseId}`);
      return;
    }

    const updatedPhase = {
      ...phase,
      progress: Math.max(0, Math.min(100, progress)),
    };

    this._phases.set(phaseId, updatedPhase);

    if (this._currentPhase?.id === phaseId) {
      this._currentPhase = updatedPhase;
    }

    // Recalculate overall progress
    this.calculateProgress();
  }

  addProgressListener(listener: ProgressListener): void {
    this._listeners.add(listener);
  }

  removeProgressListener(listener: ProgressListener): void {
    this._listeners.delete(listener);
  }

  getSnapshot(): ProgressUpdate {
    return {
      operationId: this.operationId,
      operationName: this.operationName,
      status: this._status,
      progress: this._progress,
      metrics: this.metrics,
      timestamp: new Date(),
      ...(this._currentPhase && { phase: this._currentPhase }),
      ...(this.config.metadata && { metadata: this.config.metadata }),
    };
  }

  private calculateRates(_timeSinceLastUpdateMs: number): void {
    // Calculate instantaneous speed (items per second)
    const itemsPerSecond = this.config.calculateRates
      ? this._metrics.completedItems / this._metrics.elapsedTime || 0
      : 0;

    // Calculate average speed
    const averageSpeed =
      this._metrics.elapsedTime > 0 ? this._metrics.completedItems / this._metrics.elapsedTime : 0;

    // Calculate ETA
    let eta = 0;
    if (this.config.estimateTimeRemaining && averageSpeed > 0) {
      const remainingItems = this._metrics.totalItems - this._metrics.completedItems;
      eta = Math.round(remainingItems / averageSpeed);
    }

    this._metrics = {
      ...this._metrics,
      speed: itemsPerSecond,
      averageSpeed,
      eta,
    };
  }

  private calculateProgress(): void {
    if (this._metrics.totalItems > 0) {
      // Calculate based on items
      this._progress = Math.round((this._metrics.completedItems / this._metrics.totalItems) * 100);
    } else if (this._phases.size > 0) {
      // Calculate based on phases
      let totalWeight = 0;
      let completedWeight = 0;

      for (const phase of this._phases.values()) {
        totalWeight += phase.weight;
        completedWeight += (phase.progress / 100) * phase.weight;
      }

      this._progress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
    }

    this._progress = Math.max(0, Math.min(100, this._progress));
  }

  private startUpdateTimer(): void {
    if (this.updateTimer || this.config.updateInterval <= 0) {
      return;
    }

    this.updateTimer = setInterval(() => {
      if (this._status === ProgressStatus.IN_PROGRESS) {
        this.emitUpdate();
      }
    }, this.config.updateInterval);
  }

  private stopUpdateTimer(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
  }

  private emitUpdate(message?: string, currentItem?: string): void {
    const snapshot = this.getSnapshot();
    const update: ProgressUpdate = {
      ...snapshot,
      ...(message && { message }),
      ...(currentItem && { currentItem }),
    };

    // Emit to EventEmitter listeners
    this.emit('progress', update);

    // Call registered listeners
    for (const listener of this._listeners) {
      try {
        const result = listener(update);
        if (result instanceof Promise) {
          result.catch(error => {
            this.logger?.error('Error in progress listener:', error);
          });
        }
      } catch (error) {
        this.logger?.error('Error in progress listener:', error);
      }
    }
  }
}
