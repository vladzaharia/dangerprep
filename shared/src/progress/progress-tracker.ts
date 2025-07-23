/**
 * Progress tracker implementation for monitoring operation progress
 */

import { EventEmitter } from 'events';
import {
  type IProgressTracker,
  type ProgressConfig,
  type ProgressUpdate,
  type ProgressPhase,
  type ProgressMetrics,
  type ProgressListener,
  ProgressStatus,
} from './types.js';

export class ProgressTracker extends EventEmitter implements IProgressTracker {
  private config: ProgressConfig;
  private status: ProgressStatus = ProgressStatus.NOT_STARTED;
  private progress: number = 0;
  private phases: Map<string, ProgressPhase> = new Map();
  private currentPhaseId: string | null = null;
  private metrics: ProgressMetrics;
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private currentOperation: string = '';
  private currentItem: string = '';
  private updateTimer: NodeJS.Timeout | null = null;
  private lastUpdateTime: Date = new Date();
  private lastCompletedItems: number = 0;
  private lastProcessedBytes: number = 0;
  private rateHistory: Array<{ timestamp: Date; items: number; bytes: number }> = [];
  private readonly maxRateHistorySize = 10;

  constructor(config: ProgressConfig) {
    super();
    this.config = config;
    
    this.metrics = {
      totalItems: config.totalItems || 0,
      completedItems: 0,
      failedItems: 0,
      processingItems: 0,
      skippedItems: 0,
      totalBytes: config.totalBytes || 0,
      processedBytes: 0,
      itemsPerSecond: 0,
      bytesPerSecond: 0,
      estimatedTimeRemaining: 0,
      elapsedTime: 0,
    };

    // Initialize phases if provided
    if (config.phases && config.phases.length > 0) {
      for (const phaseConfig of config.phases) {
        const phase: ProgressPhase = {
          ...phaseConfig,
          status: ProgressStatus.NOT_STARTED,
          progress: 0,
        };
        this.phases.set(phase.id, phase);
      }
    }

    // Set up update timer if interval is specified
    if (config.updateInterval && config.updateInterval > 0) {
      this.updateTimer = setInterval(() => {
        this.emitUpdate();
      }, config.updateInterval);
    }
  }

  getCurrentProgress(): ProgressUpdate {
    this.updateMetrics();
    
    return {
      operationId: this.config.operationId,
      progress: this.progress,
      status: this.status,
      currentPhase: this.currentPhaseId ? this.phases.get(this.currentPhaseId) : undefined,
      phases: this.phases.size > 0 ? Array.from(this.phases.values()) : undefined,
      metrics: { ...this.metrics },
      currentOperation: this.currentOperation,
      currentItem: this.currentItem,
      timestamp: new Date(),
      metadata: this.config.metadata || {},
    };
  }

  start(): void {
    if (this.status !== ProgressStatus.NOT_STARTED && this.status !== ProgressStatus.PAUSED) {
      return;
    }

    this.status = ProgressStatus.IN_PROGRESS;
    this.startTime = new Date();
    this.lastUpdateTime = this.startTime;
    
    this.emitUpdate();
  }

  updateProgress(completedItems: number, processedBytes?: number): void {
    if (this.status !== ProgressStatus.IN_PROGRESS) {
      return;
    }

    this.metrics.completedItems = Math.max(0, completedItems);
    
    if (processedBytes !== undefined) {
      this.metrics.processedBytes = Math.max(0, processedBytes);
    }

    // Update overall progress
    if (this.metrics.totalItems > 0) {
      this.progress = Math.min(100, (this.metrics.completedItems / this.metrics.totalItems) * 100);
    } else if (this.phases.size > 0) {
      // Calculate progress based on phases
      this.progress = this.calculatePhaseProgress();
    }

    // Update current phase progress if applicable
    if (this.currentPhaseId) {
      const phase = this.phases.get(this.currentPhaseId);
      if (phase && phase.status === ProgressStatus.IN_PROGRESS) {
        // Calculate phase progress based on items or custom logic
        if (this.metrics.totalItems > 0) {
          const phaseWeight = phase.weight || 1;
          const totalWeight = Array.from(this.phases.values()).reduce((sum, p) => sum + (p.weight || 1), 0);
          const phaseItemsPercentage = (this.metrics.completedItems / this.metrics.totalItems) * 100;
          phase.progress = Math.min(100, phaseItemsPercentage * (phaseWeight / totalWeight));
        }
      }
    }

    this.updateRateHistory();
    this.emitUpdate();
  }

  updateCurrentOperation(operation: string, item?: string): void {
    this.currentOperation = operation;
    if (item !== undefined) {
      this.currentItem = item;
    }
    this.emitUpdate();
  }

  startPhase(phaseId: string): void {
    const phase = this.phases.get(phaseId);
    if (!phase) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    // Complete previous phase if it was in progress
    if (this.currentPhaseId && this.currentPhaseId !== phaseId) {
      const currentPhase = this.phases.get(this.currentPhaseId);
      if (currentPhase && currentPhase.status === ProgressStatus.IN_PROGRESS) {
        this.completePhase(this.currentPhaseId);
      }
    }

    phase.status = ProgressStatus.IN_PROGRESS;
    phase.startTime = new Date();
    phase.progress = 0;
    this.currentPhaseId = phaseId;

    this.emitUpdate();
  }

  updatePhaseProgress(phaseId: string, progress: number): void {
    const phase = this.phases.get(phaseId);
    if (!phase) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    phase.progress = Math.max(0, Math.min(100, progress));
    
    // Update overall progress based on phases
    this.progress = this.calculatePhaseProgress();
    
    this.emitUpdate();
  }

  completePhase(phaseId: string): void {
    const phase = this.phases.get(phaseId);
    if (!phase) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    phase.status = ProgressStatus.COMPLETED;
    phase.progress = 100;
    phase.endTime = new Date();

    if (this.currentPhaseId === phaseId) {
      this.currentPhaseId = null;
    }

    // Update overall progress
    this.progress = this.calculatePhaseProgress();

    this.emitUpdate();
  }

  failPhase(phaseId: string, error: string): void {
    const phase = this.phases.get(phaseId);
    if (!phase) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    phase.status = ProgressStatus.FAILED;
    phase.endTime = new Date();
    phase.error = error;

    if (this.currentPhaseId === phaseId) {
      this.currentPhaseId = null;
    }

    this.emitUpdate();
  }

  addFailedItems(count: number): void {
    this.metrics.failedItems += Math.max(0, count);
    this.emitUpdate();
  }

  addSkippedItems(count: number): void {
    this.metrics.skippedItems += Math.max(0, count);
    this.emitUpdate();
  }

  pause(): void {
    if (this.status === ProgressStatus.IN_PROGRESS) {
      this.status = ProgressStatus.PAUSED;
      this.emitUpdate();
    }
  }

  resume(): void {
    if (this.status === ProgressStatus.PAUSED) {
      this.status = ProgressStatus.IN_PROGRESS;
      this.lastUpdateTime = new Date();
      this.emitUpdate();
    }
  }

  complete(): void {
    this.status = ProgressStatus.COMPLETED;
    this.progress = 100;
    this.endTime = new Date();
    
    // Complete any remaining phases
    for (const phase of this.phases.values()) {
      if (phase.status === ProgressStatus.IN_PROGRESS || phase.status === ProgressStatus.NOT_STARTED) {
        phase.status = ProgressStatus.COMPLETED;
        phase.progress = 100;
        phase.endTime = this.endTime;
      }
    }

    this.emitUpdate();
    this.dispose();
  }

  fail(error: string): void {
    this.status = ProgressStatus.FAILED;
    this.endTime = new Date();
    
    // Fail current phase if any
    if (this.currentPhaseId) {
      this.failPhase(this.currentPhaseId, error);
    }

    this.emitUpdate();
    this.dispose();
  }

  cancel(): void {
    this.status = ProgressStatus.CANCELLED;
    this.endTime = new Date();
    
    // Cancel any in-progress phases
    for (const phase of this.phases.values()) {
      if (phase.status === ProgressStatus.IN_PROGRESS) {
        phase.status = ProgressStatus.CANCELLED;
        phase.endTime = this.endTime;
      }
    }

    this.emitUpdate();
    this.dispose();
  }

  addProgressListener(listener: ProgressListener): void {
    this.on('progress', listener);
  }

  removeProgressListener(listener: ProgressListener): void {
    this.off('progress', listener);
  }

  removeAllProgressListeners(): void {
    this.removeAllListeners('progress');
  }

  dispose(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    this.removeAllListeners();
  }

  private calculatePhaseProgress(): number {
    if (this.phases.size === 0) {
      return this.progress;
    }

    const totalWeight = Array.from(this.phases.values()).reduce((sum, phase) => sum + (phase.weight || 1), 0);
    const weightedProgress = Array.from(this.phases.values()).reduce((sum, phase) => {
      const weight = phase.weight || 1;
      return sum + (phase.progress * weight);
    }, 0);

    return totalWeight > 0 ? weightedProgress / totalWeight : 0;
  }

  private updateMetrics(): void {
    if (!this.startTime) {
      return;
    }

    const now = new Date();
    this.metrics.elapsedTime = now.getTime() - this.startTime.getTime();

    if (this.config.calculateRates !== false) {
      this.calculateRates();
    }

    if (this.config.estimateTimeRemaining !== false) {
      this.estimateTimeRemaining();
    }
  }

  private updateRateHistory(): void {
    const now = new Date();
    this.rateHistory.push({
      timestamp: now,
      items: this.metrics.completedItems,
      bytes: this.metrics.processedBytes || 0,
    });

    // Keep only recent history
    if (this.rateHistory.length > this.maxRateHistorySize) {
      this.rateHistory = this.rateHistory.slice(-this.maxRateHistorySize);
    }
  }

  private calculateRates(): void {
    if (this.rateHistory.length < 2) {
      return;
    }

    const recent = this.rateHistory[this.rateHistory.length - 1];
    const older = this.rateHistory[0];

    if (!recent || !older) {
      return;
    }

    const timeDiff = (recent.timestamp.getTime() - older.timestamp.getTime()) / 1000; // seconds

    if (timeDiff > 0) {
      const itemsDiff = recent.items - older.items;
      const bytesDiff = recent.bytes - older.bytes;

      this.metrics.itemsPerSecond = itemsDiff / timeDiff;
      this.metrics.bytesPerSecond = bytesDiff / timeDiff;
    }
  }

  private estimateTimeRemaining(): void {
    if (this.metrics.itemsPerSecond <= 0) {
      this.metrics.estimatedTimeRemaining = 0;
      return;
    }

    const remainingItems = this.metrics.totalItems - this.metrics.completedItems;
    if (remainingItems > 0) {
      this.metrics.estimatedTimeRemaining = (remainingItems / this.metrics.itemsPerSecond) * 1000; // milliseconds
    } else {
      this.metrics.estimatedTimeRemaining = 0;
    }
  }

  private emitUpdate(): void {
    const update = this.getCurrentProgress();
    this.emit('progress', update);
  }
}
