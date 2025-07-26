import type { Logger } from '@dangerprep/logging';
import type { IProgressTracker } from '@dangerprep/progress';

import { ServiceProgressManager } from './progress-manager.js';

/**
 * Service-aware progress tracking patterns and utilities
 *
 * Provides common patterns for service progress tracking including:
 * - Service operation patterns (startup, periodic tasks, shutdown)
 * - Service-aware progress tracking with metadata
 * - Integration with service notifications and logging
 * - Cross-service progress coordination
 */
export class ServiceProgressPatterns {
  /**
   * Create a startup progress tracker with standard phases
   */
  static createStartupProgress(
    progressManager: ServiceProgressManager,
    operationName: string,
    customPhases?: Array<{ id: string; name: string; description: string; weight: number }>
  ): IProgressTracker {
    const phases = customPhases || [
      { id: 'init', name: 'Initialize', description: 'Initializing service components', weight: 2 },
      {
        id: 'config',
        name: 'Configure',
        description: 'Loading and validating configuration',
        weight: 1,
      },
      {
        id: 'dependencies',
        name: 'Dependencies',
        description: 'Setting up dependencies',
        weight: 2,
      },
      {
        id: 'health',
        name: 'Health Checks',
        description: 'Initializing health monitoring',
        weight: 1,
      },
      { id: 'start', name: 'Start', description: 'Starting service operations', weight: 4 },
    ];

    return progressManager.createServiceTracker('startup', operationName, {
      phases,
      totalItems: phases.length,
      calculateRates: false,
      estimateTimeRemaining: true,
    });
  }

  /**
   * Create a shutdown progress tracker with standard phases
   */
  static createShutdownProgress(
    progressManager: ServiceProgressManager,
    operationName: string,
    customPhases?: Array<{ id: string; name: string; description: string; weight: number }>
  ): IProgressTracker {
    const phases = customPhases || [
      { id: 'prepare', name: 'Prepare', description: 'Preparing for shutdown', weight: 1 },
      {
        id: 'stop-operations',
        name: 'Stop Operations',
        description: 'Stopping active operations',
        weight: 3,
      },
      { id: 'cleanup-resources', name: 'Cleanup', description: 'Cleaning up resources', weight: 2 },
      { id: 'persist-state', name: 'Persist', description: 'Persisting final state', weight: 1 },
      { id: 'finalize', name: 'Finalize', description: 'Finalizing shutdown', weight: 1 },
    ];

    return progressManager.createServiceTracker('shutdown', operationName, {
      phases,
      totalItems: phases.length,
      calculateRates: false,
      estimateTimeRemaining: true,
    });
  }

  /**
   * Create a file processing progress tracker
   */
  static createFileProcessingProgress(
    progressManager: ServiceProgressManager,
    operationId: string,
    operationName: string,
    totalFiles: number,
    totalBytes?: number
  ): IProgressTracker {
    return progressManager.createServiceTracker(operationId, operationName, {
      phases: [
        { id: 'scan', name: 'Scan', description: 'Scanning files', weight: 1 },
        { id: 'process', name: 'Process', description: 'Processing files', weight: 8 },
        { id: 'verify', name: 'Verify', description: 'Verifying results', weight: 1 },
      ],
      totalItems: totalFiles,
      totalBytes: totalBytes || 0,
      calculateRates: true,
      estimateTimeRemaining: true,
    });
  }

  /**
   * Create a sync operation progress tracker
   */
  static createSyncProgress(
    progressManager: ServiceProgressManager,
    operationId: string,
    operationName: string,
    totalItems: number,
    totalBytes?: number
  ): IProgressTracker {
    return progressManager.createServiceTracker(operationId, operationName, {
      phases: [
        { id: 'prepare', name: 'Prepare', description: 'Preparing sync operation', weight: 1 },
        { id: 'download', name: 'Download', description: 'Downloading content', weight: 6 },
        { id: 'validate', name: 'Validate', description: 'Validating content', weight: 2 },
        { id: 'install', name: 'Install', description: 'Installing content', weight: 1 },
      ],
      totalItems,
      totalBytes: totalBytes || 0,
      calculateRates: true,
      estimateTimeRemaining: true,
    });
  }

  /**
   * Create a backup operation progress tracker
   */
  static createBackupProgress(
    progressManager: ServiceProgressManager,
    operationId: string,
    operationName: string,
    totalItems: number,
    totalBytes?: number
  ): IProgressTracker {
    return progressManager.createServiceTracker(operationId, operationName, {
      phases: [
        { id: 'prepare', name: 'Prepare', description: 'Preparing backup', weight: 1 },
        { id: 'backup', name: 'Backup', description: 'Creating backup', weight: 7 },
        { id: 'compress', name: 'Compress', description: 'Compressing backup', weight: 1 },
        { id: 'verify', name: 'Verify', description: 'Verifying backup integrity', weight: 1 },
      ],
      totalItems,
      totalBytes: totalBytes || 0,
      calculateRates: true,
      estimateTimeRemaining: true,
    });
  }

  /**
   * Create a maintenance operation progress tracker
   */
  static createMaintenanceProgress(
    progressManager: ServiceProgressManager,
    operationId: string,
    operationName: string,
    customPhases?: Array<{ id: string; name: string; description: string; weight: number }>
  ): IProgressTracker {
    const phases = customPhases || [
      { id: 'analyze', name: 'Analyze', description: 'Analyzing system state', weight: 2 },
      { id: 'cleanup', name: 'Cleanup', description: 'Performing cleanup operations', weight: 5 },
      { id: 'optimize', name: 'Optimize', description: 'Optimizing performance', weight: 2 },
      { id: 'verify', name: 'Verify', description: 'Verifying maintenance results', weight: 1 },
    ];

    return progressManager.createServiceTracker(`maintenance-${operationId}`, operationName, {
      phases,
      totalItems: phases.length,
      calculateRates: false,
      estimateTimeRemaining: true,
    });
  }

  /**
   * Create a batch operation progress tracker
   */
  static createBatchProgress(
    progressManager: ServiceProgressManager,
    operationId: string,
    operationName: string,
    batchSize: number,
    totalBatches: number
  ): IProgressTracker {
    return progressManager.createServiceTracker(operationId, operationName, {
      phases: [
        { id: 'prepare', name: 'Prepare', description: 'Preparing batch operation', weight: 1 },
        { id: 'process', name: 'Process', description: 'Processing batches', weight: 8 },
        { id: 'finalize', name: 'Finalize', description: 'Finalizing results', weight: 1 },
      ],
      totalItems: totalBatches,
      calculateRates: true,
      estimateTimeRemaining: true,
    });
  }

  /**
   * Create coordinated progress tracking for multiple operations
   */
  static createCoordinatedProgress(
    progressManager: ServiceProgressManager,
    operations: Array<{
      id: string;
      name: string;
      weight: number;
      dependsOn?: string[];
    }>,
    logger?: Logger
  ): Map<string, IProgressTracker> {
    const trackers = new Map<string, IProgressTracker>();
    const operationStatus = new Map<string, boolean>();

    // Initialize all operations as not completed
    operations.forEach(op => operationStatus.set(op.id, false));

    for (const operation of operations) {
      const tracker = progressManager.createServiceTracker(operation.id, operation.name, {
        phases: [
          { id: 'wait', name: 'Wait', description: 'Waiting for dependencies', weight: 1 },
          {
            id: 'execute',
            name: 'Execute',
            description: 'Executing operation',
            weight: operation.weight,
          },
          { id: 'complete', name: 'Complete', description: 'Completing operation', weight: 1 },
        ],
        calculateRates: false,
        estimateTimeRemaining: true,
      });

      // Add progress listener to track completion
      tracker.addProgressListener(async update => {
        if (update.status === 'completed') {
          operationStatus.set(operation.id, true);
          logger?.debug(`Coordinated operation ${operation.id} completed`);
        } else if (update.status === 'failed') {
          operationStatus.set(operation.id, false);
          logger?.error(`Coordinated operation ${operation.id} failed`);
        }
      });

      trackers.set(operation.id, tracker);
    }

    return trackers;
  }

  /**
   * Create a health check progress tracker
   */
  static createHealthCheckProgress(
    progressManager: ServiceProgressManager,
    operationId: string,
    checks: string[]
  ): IProgressTracker {
    return progressManager.createServiceTracker(operationId, 'Health Check', {
      phases: [
        { id: 'prepare', name: 'Prepare', description: 'Preparing health checks', weight: 1 },
        { id: 'check', name: 'Check', description: 'Running health checks', weight: 8 },
        { id: 'report', name: 'Report', description: 'Generating health report', weight: 1 },
      ],
      totalItems: checks.length,
      calculateRates: false,
      estimateTimeRemaining: false,
    });
  }

  /**
   * Create a configuration reload progress tracker
   */
  static createConfigReloadProgress(
    progressManager: ServiceProgressManager,
    operationId: string
  ): IProgressTracker {
    return progressManager.createServiceTracker(operationId, 'Configuration Reload', {
      phases: [
        { id: 'backup', name: 'Backup', description: 'Backing up current config', weight: 1 },
        { id: 'load', name: 'Load', description: 'Loading new configuration', weight: 2 },
        { id: 'validate', name: 'Validate', description: 'Validating configuration', weight: 2 },
        { id: 'apply', name: 'Apply', description: 'Applying configuration', weight: 4 },
        { id: 'verify', name: 'Verify', description: 'Verifying configuration', weight: 1 },
      ],
      calculateRates: false,
      estimateTimeRemaining: true,
    });
  }
}
