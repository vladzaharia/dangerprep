import type { HealthChecker } from '@dangerprep/health';
import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';
import { ProgressManager, type IProgressTracker, type ProgressConfig } from '@dangerprep/progress';

import type { ServiceProgressConfig } from './types.js';

/**
 * Service-aware progress manager that wraps the base ProgressManager with service-specific capabilities
 *
 * Features:
 * - Service-scoped progress tracking with automatic cleanup
 * - Integration with service health checks
 * - Service logging and notification integration
 * - Automatic cleanup during service shutdown
 * - Service-aware progress tracking patterns
 */
export class ServiceProgressManager {
  private readonly progressManager: ProgressManager;
  private readonly serviceName: string;
  private readonly logger: Logger;
  private readonly notificationManager: NotificationManager;
  private readonly healthChecker: HealthChecker;
  private readonly config: ServiceProgressConfig;

  private activeTrackers = new Map<string, IProgressTracker>();
  private completedTrackers = new Map<string, { tracker: IProgressTracker; completedAt: Date }>();
  private cleanupInterval: NodeJS.Timeout | undefined;

  constructor(
    serviceName: string,
    logger: Logger,
    notificationManager: NotificationManager,
    healthChecker: HealthChecker,
    config: ServiceProgressConfig = {}
  ) {
    this.serviceName = serviceName;
    this.logger = logger;
    this.notificationManager = notificationManager;
    this.healthChecker = healthChecker;
    this.config = {
      autoCleanup: true,
      cleanupDelayMs: 300000, // 5 minutes
      enablePersistence: false,
      enableNotifications: true,
      ...config,
    };

    this.progressManager = new ProgressManager(logger);

    // Start cleanup interval if auto-cleanup is enabled
    if (this.config.autoCleanup) {
      this.startCleanupInterval();
    }
  }

  /**
   * Create a service-scoped progress tracker
   */
  createServiceTracker(
    operationId: string,
    operationName: string,
    options: Partial<ProgressConfig> = {}
  ): IProgressTracker {
    const serviceOperationId = `${this.serviceName}-${operationId}`;

    const config: ProgressConfig = {
      operationId: serviceOperationId,
      operationName: `[${this.serviceName}] ${operationName}`,
      totalItems: 0,
      totalBytes: 0,
      phases: [],
      updateInterval: 1000,
      calculateRates: true,
      estimateTimeRemaining: true,
      ...options,
    };

    const tracker = this.progressManager.createTracker(config);
    this.activeTrackers.set(serviceOperationId, tracker);

    // Add progress listener for service-specific handling
    tracker.addProgressListener(async update => {
      await this.handleProgressUpdate(update);
    });

    this.logger.debug(`Created progress tracker: ${serviceOperationId}`);

    return tracker;
  }

  /**
   * Create a progress tracker for service startup operations
   */
  createStartupTracker(operationName: string): IProgressTracker {
    return this.createServiceTracker('startup', `Startup: ${operationName}`, {
      phases: [
        { id: 'initialize', name: 'Initializing', description: 'Setting up components', weight: 3 },
        { id: 'configure', name: 'Configuring', description: 'Loading configuration', weight: 2 },
        { id: 'start', name: 'Starting', description: 'Starting service', weight: 5 },
      ],
    });
  }

  /**
   * Create a progress tracker for service shutdown operations
   */
  createShutdownTracker(operationName: string): IProgressTracker {
    return this.createServiceTracker('shutdown', `Shutdown: ${operationName}`, {
      phases: [
        { id: 'prepare', name: 'Preparing', description: 'Preparing for shutdown', weight: 1 },
        { id: 'stop', name: 'Stopping', description: 'Stopping service operations', weight: 7 },
        { id: 'cleanup', name: 'Cleanup', description: 'Cleaning up resources', weight: 2 },
      ],
    });
  }

  /**
   * Create a progress tracker for maintenance operations
   */
  createMaintenanceTracker(operationId: string, operationName: string): IProgressTracker {
    return this.createServiceTracker(
      `maintenance-${operationId}`,
      `Maintenance: ${operationName}`,
      {
        phases: [
          {
            id: 'prepare',
            name: 'Preparing',
            description: 'Preparing maintenance operation',
            weight: 1,
          },
          { id: 'execute', name: 'Executing', description: 'Performing maintenance', weight: 8 },
          { id: 'verify', name: 'Verifying', description: 'Verifying results', weight: 1 },
        ],
      }
    );
  }

  /**
   * Get all active progress trackers
   */
  getActiveTrackers(): IProgressTracker[] {
    return Array.from(this.activeTrackers.values());
  }

  /**
   * Get a specific tracker by ID
   */
  getTrackerById(operationId: string): IProgressTracker | undefined {
    const serviceOperationId = operationId.startsWith(this.serviceName)
      ? operationId
      : `${this.serviceName}-${operationId}`;

    return (
      this.activeTrackers.get(serviceOperationId) ||
      this.completedTrackers.get(serviceOperationId)?.tracker
    );
  }

  /**
   * Clean up completed trackers and resources
   */
  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up progress manager for service ${this.serviceName}`);

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // Clean up all trackers
    for (const [id, tracker] of this.activeTrackers.entries()) {
      try {
        tracker.dispose();
        this.activeTrackers.delete(id);
      } catch (error) {
        this.logger.warn(
          `Failed to dispose tracker ${id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.completedTrackers.clear();

    this.logger.debug(`Progress manager cleanup completed for service ${this.serviceName}`);
  }

  /**
   * Get progress manager status
   */
  getStatus() {
    return {
      serviceName: this.serviceName,
      activeTrackers: this.activeTrackers.size,
      completedTrackers: this.completedTrackers.size,
      totalTrackers: this.activeTrackers.size + this.completedTrackers.size,
    };
  }

  /**
   * Handle progress updates from trackers
   */
  private async handleProgressUpdate(
    update: import('@dangerprep/progress').ProgressUpdate
  ): Promise<void> {
    try {
      // Move completed trackers to completed map
      if (
        update.status === 'completed' ||
        update.status === 'failed' ||
        update.status === 'cancelled'
      ) {
        const tracker = this.activeTrackers.get(update.operationId);
        if (tracker) {
          this.activeTrackers.delete(update.operationId);
          this.completedTrackers.set(update.operationId, {
            tracker,
            completedAt: new Date(),
          });
        }
      }

      // Send notifications if enabled
      if (this.config.enableNotifications) {
        await this.sendProgressNotification(update);
      }

      this.logger.debug(`Progress update for ${update.operationId}: ${update.progress}%`);
    } catch (error) {
      this.logger.error(
        `Error handling progress update for ${update.operationId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Send progress notifications
   */
  private async sendProgressNotification(
    update: import('@dangerprep/progress').ProgressUpdate
  ): Promise<void> {
    try {
      // Only send notifications for significant events
      if (update.status === 'completed') {
        await this.notificationManager.info(`Operation completed: ${update.operationId}`, {
          source: this.serviceName,
          data: { progress: update.progress, duration: update.metrics.elapsedTime },
        });
      } else if (update.status === 'failed') {
        await this.notificationManager.error(`Operation failed: ${update.operationId}`, {
          source: this.serviceName,
          data: { progress: update.progress },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to send progress notification: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Start the cleanup interval for completed trackers
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const toRemove: string[] = [];

      for (const [id, { completedAt }] of this.completedTrackers.entries()) {
        if (now.getTime() - completedAt.getTime() > (this.config.cleanupDelayMs || 300000)) {
          toRemove.push(id);
        }
      }

      for (const id of toRemove) {
        const entry = this.completedTrackers.get(id);
        if (entry) {
          try {
            entry.tracker.dispose();
            this.completedTrackers.delete(id);
            this.logger.debug(`Cleaned up completed tracker: ${id}`);
          } catch (error) {
            this.logger.warn(
              `Failed to cleanup tracker ${id}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    }, this.config.cleanupDelayMs || 300000);
  }
}
