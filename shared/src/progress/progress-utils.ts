/**
 * Utility functions for progress tracking
 */

import {
  type ProgressUpdate,
  type ProgressPhase,
  type ProgressMetrics,
  ProgressStatus,
} from './types.js';

/**
 * Progress calculation utilities
 */
export class ProgressUtils {
  /**
   * Calculate overall progress from multiple phases with weights
   */
  static calculateWeightedProgress(phases: ProgressPhase[]): number {
    if (phases.length === 0) {
      return 0;
    }

    const totalWeight = phases.reduce((sum, phase) => sum + (phase.weight || 1), 0);
    const weightedProgress = phases.reduce((sum, phase) => {
      const weight = phase.weight || 1;
      return sum + (phase.progress * weight);
    }, 0);

    return totalWeight > 0 ? weightedProgress / totalWeight : 0;
  }

  /**
   * Calculate estimated time remaining based on current rate
   */
  static calculateETA(
    completedItems: number,
    totalItems: number,
    itemsPerSecond: number
  ): number | null {
    if (itemsPerSecond <= 0 || totalItems <= completedItems) {
      return null;
    }

    const remainingItems = totalItems - completedItems;
    return (remainingItems / itemsPerSecond) * 1000; // milliseconds
  }

  /**
   * Format time duration in human-readable format
   */
  static formatDuration(milliseconds: number): string {
    if (milliseconds < 0) {
      return 'Unknown';
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Format bytes in human-readable format
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Format rate (items or bytes per second)
   */
  static formatRate(rate: number, unit: 'items' | 'bytes' = 'items'): string {
    if (rate === 0) return `0 ${unit}/s`;

    if (unit === 'bytes') {
      return `${ProgressUtils.formatBytes(rate)}/s`;
    } else {
      if (rate >= 1000) {
        return `${(rate / 1000).toFixed(1)}k ${unit}/s`;
      } else {
        return `${rate.toFixed(1)} ${unit}/s`;
      }
    }
  }

  /**
   * Get progress percentage as formatted string
   */
  static formatProgress(progress: number): string {
    return `${Math.round(progress)}%`;
  }

  /**
   * Create a progress bar string
   */
  static createProgressBar(
    progress: number,
    width: number = 20,
    fillChar: string = '█',
    emptyChar: string = '░'
  ): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    
    return fillChar.repeat(filled) + emptyChar.repeat(empty);
  }

  /**
   * Get status emoji for progress status
   */
  static getStatusEmoji(status: ProgressStatus): string {
    switch (status) {
      case ProgressStatus.NOT_STARTED:
        return '⏸️';
      case ProgressStatus.IN_PROGRESS:
        return '🔄';
      case ProgressStatus.PAUSED:
        return '⏸️';
      case ProgressStatus.COMPLETED:
        return '✅';
      case ProgressStatus.FAILED:
        return '❌';
      case ProgressStatus.CANCELLED:
        return '🚫';
      default:
        return '❓';
    }
  }

  /**
   * Get human-readable status text
   */
  static getStatusText(status: ProgressStatus): string {
    switch (status) {
      case ProgressStatus.NOT_STARTED:
        return 'Not Started';
      case ProgressStatus.IN_PROGRESS:
        return 'In Progress';
      case ProgressStatus.PAUSED:
        return 'Paused';
      case ProgressStatus.COMPLETED:
        return 'Completed';
      case ProgressStatus.FAILED:
        return 'Failed';
      case ProgressStatus.CANCELLED:
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  }

  /**
   * Create a summary string for progress update
   */
  static createProgressSummary(update: ProgressUpdate): string {
    const statusEmoji = ProgressUtils.getStatusEmoji(update.status);
    const progressText = ProgressUtils.formatProgress(update.progress);
    const progressBar = ProgressUtils.createProgressBar(update.progress, 15);
    
    let summary = `${statusEmoji} ${progressText} ${progressBar}`;
    
    if (update.metrics.totalItems > 0) {
      summary += ` (${update.metrics.completedItems}/${update.metrics.totalItems})`;
    }
    
    if (update.metrics.itemsPerSecond && update.metrics.itemsPerSecond > 0) {
      const rate = ProgressUtils.formatRate(update.metrics.itemsPerSecond);
      summary += ` ${rate}`;
    }
    
    if (update.metrics.estimatedTimeRemaining) {
      const eta = ProgressUtils.formatDuration(update.metrics.estimatedTimeRemaining);
      summary += ` ETA: ${eta}`;
    }
    
    return summary;
  }

  /**
   * Create detailed progress report
   */
  static createDetailedReport(update: ProgressUpdate): string {
    const lines: string[] = [];
    
    // Header
    lines.push(`Operation: ${update.operationId}`);
    lines.push(`Status: ${ProgressUtils.getStatusText(update.status)}`);
    lines.push(`Progress: ${ProgressUtils.formatProgress(update.progress)}`);
    lines.push('');
    
    // Progress bar
    const progressBar = ProgressUtils.createProgressBar(update.progress, 40);
    lines.push(`[${progressBar}] ${ProgressUtils.formatProgress(update.progress)}`);
    lines.push('');
    
    // Metrics
    const metrics = update.metrics;
    if (metrics.totalItems > 0) {
      lines.push(`Items: ${metrics.completedItems}/${metrics.totalItems}`);
      if (metrics.failedItems > 0) {
        lines.push(`Failed: ${metrics.failedItems}`);
      }
      if (metrics.skippedItems > 0) {
        lines.push(`Skipped: ${metrics.skippedItems}`);
      }
    }
    
    if (metrics.totalBytes && metrics.processedBytes !== undefined) {
      const totalBytes = ProgressUtils.formatBytes(metrics.totalBytes);
      const processedBytes = ProgressUtils.formatBytes(metrics.processedBytes);
      lines.push(`Data: ${processedBytes}/${totalBytes}`);
    }
    
    // Rates
    if (metrics.itemsPerSecond && metrics.itemsPerSecond > 0) {
      lines.push(`Rate: ${ProgressUtils.formatRate(metrics.itemsPerSecond)}`);
    }
    
    if (metrics.bytesPerSecond && metrics.bytesPerSecond > 0) {
      lines.push(`Throughput: ${ProgressUtils.formatRate(metrics.bytesPerSecond, 'bytes')}`);
    }
    
    // Time information
    const elapsed = ProgressUtils.formatDuration(metrics.elapsedTime);
    lines.push(`Elapsed: ${elapsed}`);
    
    if (metrics.estimatedTimeRemaining) {
      const eta = ProgressUtils.formatDuration(metrics.estimatedTimeRemaining);
      lines.push(`ETA: ${eta}`);
    }
    
    // Current operation
    if (update.currentOperation) {
      lines.push('');
      lines.push(`Current: ${update.currentOperation}`);
      if (update.currentItem) {
        lines.push(`Item: ${update.currentItem}`);
      }
    }
    
    // Phases
    if (update.phases && update.phases.length > 0) {
      lines.push('');
      lines.push('Phases:');
      for (const phase of update.phases) {
        const phaseEmoji = ProgressUtils.getStatusEmoji(phase.status);
        const phaseProgress = ProgressUtils.formatProgress(phase.progress);
        const phaseName = phase.name;
        lines.push(`  ${phaseEmoji} ${phaseName}: ${phaseProgress}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Check if progress update indicates completion
   */
  static isCompleted(update: ProgressUpdate): boolean {
    return update.status === ProgressStatus.COMPLETED;
  }

  /**
   * Check if progress update indicates failure
   */
  static isFailed(update: ProgressUpdate): boolean {
    return update.status === ProgressStatus.FAILED;
  }

  /**
   * Check if progress update indicates active operation
   */
  static isActive(update: ProgressUpdate): boolean {
    return update.status === ProgressStatus.IN_PROGRESS || update.status === ProgressStatus.PAUSED;
  }

  /**
   * Calculate completion percentage for metrics
   */
  static calculateCompletionPercentage(metrics: ProgressMetrics): number {
    if (metrics.totalItems === 0) {
      return 0;
    }
    
    return (metrics.completedItems / metrics.totalItems) * 100;
  }

  /**
   * Calculate success rate for metrics
   */
  static calculateSuccessRate(metrics: ProgressMetrics): number {
    const totalProcessed = metrics.completedItems + metrics.failedItems;
    if (totalProcessed === 0) {
      return 100; // No items processed yet, assume 100% success rate
    }
    
    return (metrics.completedItems / totalProcessed) * 100;
  }

  /**
   * Merge multiple progress updates into a summary
   */
  static mergeProgressUpdates(updates: ProgressUpdate[]): {
    totalOperations: number;
    activeOperations: number;
    completedOperations: number;
    failedOperations: number;
    overallProgress: number;
    totalItems: number;
    completedItems: number;
    failedItems: number;
  } {
    const summary = {
      totalOperations: updates.length,
      activeOperations: 0,
      completedOperations: 0,
      failedOperations: 0,
      overallProgress: 0,
      totalItems: 0,
      completedItems: 0,
      failedItems: 0,
    };

    let totalProgress = 0;

    for (const update of updates) {
      // Count operations by status
      if (ProgressUtils.isActive(update)) {
        summary.activeOperations++;
      } else if (ProgressUtils.isCompleted(update)) {
        summary.completedOperations++;
      } else if (ProgressUtils.isFailed(update)) {
        summary.failedOperations++;
      }

      // Aggregate metrics
      summary.totalItems += update.metrics.totalItems;
      summary.completedItems += update.metrics.completedItems;
      summary.failedItems += update.metrics.failedItems;

      // Sum progress for average calculation
      totalProgress += update.progress;
    }

    // Calculate overall progress as average
    summary.overallProgress = updates.length > 0 ? totalProgress / updates.length : 0;

    return summary;
  }
}
