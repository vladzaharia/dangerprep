import { Result, success, failure, safeAsync } from '@dangerprep/errors';
import type { HealthChecker } from '@dangerprep/health';
import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';
import { Scheduler } from '@dangerprep/scheduling';

import type {
  ServiceSchedulerConfig,
  ServiceScheduleOptions,
  ServiceSchedulerStatus,
  ServiceScheduledTask,
} from './types.js';

/**
 * Service-aware scheduler that wraps the base Scheduler with service-specific capabilities
 *
 * Features:
 * - Service lifecycle integration (auto-start/stop with service)
 * - Health check integration (pause scheduling if service unhealthy)
 * - Service logging and notification integration
 * - Automatic cleanup during service shutdown
 * - Service-aware task execution with error handling
 */
export class ServiceScheduler {
  private readonly scheduler: Scheduler;
  private readonly serviceName: string;
  private readonly logger: Logger;
  private readonly notificationManager: NotificationManager;
  private readonly healthChecker: HealthChecker;
  private readonly config: ServiceSchedulerConfig;

  private isActive = false;
  private healthCheckInterval: NodeJS.Timeout | undefined;
  private lastHealthStatus = true;
  private serviceTasks = new Map<string, ServiceScheduledTask>();

  constructor(
    serviceName: string,
    logger: Logger,
    notificationManager: NotificationManager,
    healthChecker: HealthChecker,
    config: ServiceSchedulerConfig = {}
  ) {
    this.serviceName = serviceName;
    this.logger = logger;
    this.notificationManager = notificationManager;
    this.healthChecker = healthChecker;
    this.config = {
      enableHealthMonitoring: true,
      healthCheckIntervalMs: 30000, // 30 seconds
      pauseOnUnhealthy: true,
      autoStartTasks: true,
      ...config,
    };

    this.scheduler = new Scheduler({ logger });
  }

  /**
   * Start the service scheduler and all scheduled tasks
   */
  async start(): Promise<Result<void>> {
    return safeAsync(async () => {
      if (this.isActive) {
        this.logger.warn('ServiceScheduler is already active');
        return;
      }

      this.logger.info(`Starting ServiceScheduler for ${this.serviceName}`);

      // Start health monitoring if enabled
      if (this.config.enableHealthMonitoring) {
        this.startHealthMonitoring();
      }

      // Start all scheduled tasks if auto-start is enabled
      if (this.config.autoStartTasks) {
        this.scheduler.startAll();
      }

      this.isActive = true;

      await this.notificationManager.info('Service scheduler started successfully', {
        source: this.serviceName,
      });

      this.logger.info(`ServiceScheduler started for ${this.serviceName}`);
    });
  }

  /**
   * Stop the service scheduler and all scheduled tasks
   */
  async stop(): Promise<Result<void>> {
    return safeAsync(async () => {
      if (!this.isActive) {
        this.logger.warn('ServiceScheduler is not active');
        return;
      }

      this.logger.info(`Stopping ServiceScheduler for ${this.serviceName}`);

      // Stop health monitoring
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = undefined;
      }

      // Stop all scheduled tasks
      this.scheduler.stopAll();
      this.isActive = false;

      await this.notificationManager.info('Service scheduler stopped successfully', {
        source: this.serviceName,
      });

      this.logger.info(`ServiceScheduler stopped for ${this.serviceName}`);
    });
  }

  /**
   * Destroy the service scheduler and clean up all resources
   */
  async destroy(): Promise<Result<void>> {
    return safeAsync(async () => {
      this.logger.info(`Destroying ServiceScheduler for ${this.serviceName}`);

      // Stop if still active
      if (this.isActive) {
        await this.stop();
      }

      // Destroy all scheduled tasks
      this.scheduler.destroyAll();
      this.serviceTasks.clear();

      await this.notificationManager.info('Service scheduler destroyed and cleaned up', {
        source: this.serviceName,
      });

      this.logger.info(`ServiceScheduler destroyed for ${this.serviceName}`);
    });
  }

  /**
   * Schedule a service-aware task with health monitoring and error handling
   */
  scheduleTask(
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    options: ServiceScheduleOptions = {}
  ): Result<ServiceScheduledTask> {
    try {
      const taskName = options.name || taskId;
      const serviceOptions: ServiceScheduleOptions = {
        enableHealthCheck: true,
        retryOnFailure: true,
        maxRetries: 3,
        notifyOnFailure: true,
        ...options,
      };

      // Create service-aware task wrapper
      const wrappedTask = this.createServiceAwareTask(taskFunction, serviceOptions);

      // Schedule with base scheduler
      const scheduledTask = this.scheduler.schedule(taskId, schedule, wrappedTask, {
        name: taskName,
        logger: this.logger,
        ...options,
      });

      // Create service task metadata
      const serviceTask: ServiceScheduledTask = {
        ...scheduledTask,
        serviceName: this.serviceName,
        serviceOptions,
        lastExecution: undefined,
        lastError: undefined,
        executionCount: 0,
        failureCount: 0,
      };

      this.serviceTasks.set(taskId, serviceTask);

      this.logger.info(`Scheduled service task: ${taskName} (${schedule}) for ${this.serviceName}`);

      return success(serviceTask);
    } catch (error) {
      const message = `Failed to schedule task ${taskId}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      return failure(new Error(message));
    }
  }

  /**
   * Schedule a conditional task that only runs when service is healthy
   */
  scheduleConditionalTask(
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    condition: () => Promise<boolean> | boolean,
    options: ServiceScheduleOptions = {}
  ): Result<ServiceScheduledTask> {
    const conditionalTask = async () => {
      const shouldRun = await condition();
      if (shouldRun) {
        await taskFunction();
      } else {
        this.logger.debug(`Skipping conditional task ${taskId} - condition not met`);
      }
    };

    return this.scheduleTask(taskId, schedule, conditionalTask, {
      ...options,
      name: options.name || `Conditional ${taskId}`,
    });
  }

  /**
   * Schedule a maintenance task that runs during maintenance windows
   */
  scheduleMaintenanceTask(
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    options: ServiceScheduleOptions = {}
  ): Result<ServiceScheduledTask> {
    const maintenanceTask = async () => {
      this.logger.info(`Starting maintenance task: ${taskId}`);

      await this.notificationManager.info(`Maintenance task ${taskId} started`, {
        source: this.serviceName,
      });

      try {
        await taskFunction();

        await this.notificationManager.info(`Maintenance task ${taskId} completed successfully`, {
          source: this.serviceName,
        });
      } catch (error) {
        await this.notificationManager.error(
          `Maintenance task ${taskId} failed: ${error instanceof Error ? error.message : String(error)}`,
          { source: this.serviceName }
        );
        throw error;
      }
    };

    return this.scheduleTask(taskId, schedule, maintenanceTask, {
      ...options,
      name: options.name || `Maintenance ${taskId}`,
      enableHealthCheck: false, // Maintenance tasks can run even if service is unhealthy
    });
  }

  /**
   * Remove a scheduled task
   */
  removeTask(taskId: string): boolean {
    const removed = this.scheduler.removeTask(taskId);
    if (removed) {
      this.serviceTasks.delete(taskId);
      this.logger.info(`Removed service task: ${taskId} from ${this.serviceName}`);
    }
    return removed;
  }

  /**
   * Get a scheduled task by ID
   */
  getTask(taskId: string): ServiceScheduledTask | undefined {
    return this.serviceTasks.get(taskId);
  }

  /**
   * Get all scheduled tasks for this service
   */
  getAllTasks(): ServiceScheduledTask[] {
    return Array.from(this.serviceTasks.values());
  }

  /**
   * Get service scheduler status
   */
  getStatus(): ServiceSchedulerStatus {
    const baseStatus = this.scheduler.getStatus();
    const serviceTasks = Array.from(this.serviceTasks.values());

    return {
      serviceName: this.serviceName,
      isActive: this.isActive,
      healthMonitoringEnabled: this.config.enableHealthMonitoring ?? false,
      lastHealthStatus: this.lastHealthStatus,
      totalTasks: baseStatus.totalTasks,
      activeTasks: baseStatus.activeTasks,
      serviceTasks: serviceTasks.map(task => ({
        id: task.id,
        name: task.name,
        schedule: task.schedule,
        isActive: task.isActive,
        executionCount: task.executionCount,
        failureCount: task.failureCount,
        lastExecution: task.lastExecution,
        lastError: task.lastError,
      })),
    };
  }

  /**
   * Create a service-aware task wrapper with health monitoring and error handling
   */
  private createServiceAwareTask(
    taskFunction: () => Promise<void> | void,
    options: ServiceScheduleOptions
  ): () => Promise<void> {
    return async () => {
      const taskId = `${this.serviceName}-task-${Date.now()}`;

      try {
        // Check service health if enabled
        if (options.enableHealthCheck && this.config.pauseOnUnhealthy) {
          const healthResult = await this.healthChecker.check();
          if (healthResult.status !== 'healthy') {
            this.logger.warn(
              `Skipping task execution - service ${this.serviceName} is unhealthy (status: ${healthResult.status})`
            );
            return;
          }
        }

        // Execute the task
        const startTime = Date.now();
        await taskFunction();
        const duration = Date.now() - startTime;

        // Update task metadata
        this.updateTaskMetadata(taskId, true, duration);

        this.logger.debug(`Task completed successfully in ${duration}ms`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Update task metadata
        this.updateTaskMetadata(taskId, false, 0, errorMessage);

        // Handle retry logic
        if (options.retryOnFailure && options.maxRetries && options.maxRetries > 0) {
          this.logger.warn(`Task failed, will be retried. Error: ${errorMessage}`);
          // Note: Actual retry logic would be implemented by the scheduler
        } else {
          this.logger.error(`Task failed: ${errorMessage}`);
        }

        // Send failure notification if enabled
        if (options.notifyOnFailure) {
          await this.notificationManager.error(`Scheduled task failed: ${errorMessage}`, {
            source: this.serviceName,
          });
        }

        throw error;
      }
    };
  }

  /**
   * Update task execution metadata
   */
  private updateTaskMetadata(
    taskId: string,
    success: boolean,
    duration: number,
    error?: string
  ): void {
    // Find the task by looking for a matching pattern
    // This is a simplified approach - in a real implementation you'd want better task tracking
    for (const [id, task] of this.serviceTasks.entries()) {
      const taskPrefix = taskId.split('-')[0];
      if (taskId.includes(id) || (taskPrefix && id.includes(taskPrefix))) {
        task.executionCount++;
        task.lastExecution = new Date();

        if (!success) {
          task.failureCount++;
          task.lastError = error;
        } else {
          task.lastError = undefined;
        }
        break;
      }
    }
  }

  /**
   * Start health monitoring for the service scheduler
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthResult = await this.healthChecker.check();
        const isHealthy = healthResult.status === 'healthy';

        // Check if health status changed
        if (isHealthy !== this.lastHealthStatus) {
          this.lastHealthStatus = isHealthy;

          if (isHealthy) {
            this.logger.info(
              `Service ${this.serviceName} is now healthy - resuming scheduled tasks`
            );
            if (this.config.autoStartTasks) {
              this.scheduler.startAll();
            }
          } else {
            this.logger.warn(`Service ${this.serviceName} is unhealthy - pausing scheduled tasks`);
            if (this.config.pauseOnUnhealthy) {
              this.scheduler.stopAll();
            }
          }

          if (isHealthy) {
            await this.notificationManager.info(`Service health status changed: healthy`, {
              source: this.serviceName,
            });
          } else {
            await this.notificationManager.warn(`Service health status changed: unhealthy`, {
              source: this.serviceName,
            });
          }
        }
      } catch (error) {
        this.logger.error(`Health check failed for service scheduler: ${error}`);
      }
    }, this.config.healthCheckIntervalMs);
  }
}
