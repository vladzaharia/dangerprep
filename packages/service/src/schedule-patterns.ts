import { Result } from '@dangerprep/errors';
import type { Logger } from '@dangerprep/logging';

import { ServiceScheduler } from './scheduler.js';
import type { ServiceScheduleOptions, ServiceScheduledTask } from './types.js';

/**
 * Service-aware scheduling patterns and utilities
 *
 * Provides common patterns for service scheduling including:
 * - Conditional scheduling based on service health
 * - Maintenance window patterns
 * - Service startup/shutdown triggered tasks
 * - Cross-service coordination patterns
 */
export class ServiceSchedulePatterns {
  /**
   * Schedule a task that only runs when the service is healthy
   */
  static scheduleHealthyOnlyTask(
    scheduler: ServiceScheduler,
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    options: ServiceScheduleOptions = {}
  ): Result<ServiceScheduledTask> {
    return scheduler.scheduleConditionalTask(
      taskId,
      schedule,
      taskFunction,
      async () => {
        // This will be checked by the ServiceScheduler's health monitoring
        return true;
      },
      {
        ...options,
        enableHealthCheck: true,
        name: options.name || `Healthy-only ${taskId}`,
      }
    );
  }

  /**
   * Schedule a task that runs during maintenance windows (typically low-traffic hours)
   */
  static scheduleMaintenanceWindowTask(
    scheduler: ServiceScheduler,
    taskId: string,
    taskFunction: () => Promise<void> | void,
    options: {
      /** Maintenance window start hour (0-23) */
      startHour?: number;
      /** Maintenance window end hour (0-23) */
      endHour?: number;
      /** Days of week (0=Sunday, 6=Saturday) */
      daysOfWeek?: number[];
      /** Additional schedule options */
      scheduleOptions?: ServiceScheduleOptions;
    } = {}
  ): Result<ServiceScheduledTask> {
    const {
      startHour = 2, // 2 AM default
      endHour = 4, // 4 AM default
      daysOfWeek = [0, 1, 2, 3, 4, 5, 6], // All days default
      scheduleOptions = {},
    } = options;

    // Create cron expression for maintenance window
    const daysList = daysOfWeek.join(',');
    const schedule = `0 ${startHour}-${endHour} * * ${daysList}`;

    return scheduler.scheduleMaintenanceTask(taskId, schedule, taskFunction, {
      ...scheduleOptions,
      name: scheduleOptions.name || `Maintenance ${taskId}`,
    });
  }

  /**
   * Schedule a task that runs at service startup (with delay)
   */
  static scheduleStartupTask(
    scheduler: ServiceScheduler,
    taskId: string,
    taskFunction: () => Promise<void> | void,
    delayMinutes: number = 5,
    options: ServiceScheduleOptions = {}
  ): Result<ServiceScheduledTask> {
    // Create a one-time schedule that runs after the specified delay
    const schedule = `*/${delayMinutes} * * * *`; // Every N minutes (will be removed after first run)

    let hasRun = false;
    const wrappedTask = async () => {
      if (!hasRun) {
        hasRun = true;
        await taskFunction();
        // Remove the task after it runs once
        scheduler.removeTask(taskId);
      }
    };

    return scheduler.scheduleTask(taskId, schedule, wrappedTask, {
      ...options,
      name: options.name || `Startup ${taskId}`,
      enableHealthCheck: false, // Allow startup tasks even if service isn't fully healthy yet
    });
  }

  /**
   * Schedule a periodic cleanup task
   */
  static scheduleCleanupTask(
    scheduler: ServiceScheduler,
    taskId: string,
    cleanupFunction: () => Promise<void> | void,
    options: {
      /** How often to run cleanup (daily, weekly, monthly) */
      frequency?: 'daily' | 'weekly' | 'monthly';
      /** Hour to run cleanup (0-23) */
      hour?: number;
      /** Additional schedule options */
      scheduleOptions?: ServiceScheduleOptions;
    } = {}
  ): Result<ServiceScheduledTask> {
    const { frequency = 'daily', hour = 3, scheduleOptions = {} } = options;

    let schedule: string;
    switch (frequency) {
      case 'daily':
        schedule = `0 ${hour} * * *`; // Daily at specified hour
        break;
      case 'weekly':
        schedule = `0 ${hour} * * 0`; // Weekly on Sunday at specified hour
        break;
      case 'monthly':
        schedule = `0 ${hour} 1 * *`; // Monthly on 1st at specified hour
        break;
      default:
        schedule = `0 ${hour} * * *`; // Default to daily
    }

    return scheduler.scheduleMaintenanceTask(taskId, schedule, cleanupFunction, {
      ...scheduleOptions,
      name: scheduleOptions.name || `Cleanup ${taskId} (${frequency})`,
    });
  }

  /**
   * Schedule a monitoring/health check task
   */
  static scheduleMonitoringTask(
    scheduler: ServiceScheduler,
    taskId: string,
    monitoringFunction: () => Promise<void> | void,
    intervalMinutes: number = 15,
    options: ServiceScheduleOptions = {}
  ): Result<ServiceScheduledTask> {
    const schedule = `*/${intervalMinutes} * * * *`;

    return scheduler.scheduleTask(taskId, schedule, monitoringFunction, {
      ...options,
      name: options.name || `Monitoring ${taskId}`,
      enableHealthCheck: false, // Monitoring should run even if service is degraded
      retryOnFailure: true,
      maxRetries: 2,
      notifyOnFailure: true,
    });
  }

  /**
   * Schedule a backup task
   */
  static scheduleBackupTask(
    scheduler: ServiceScheduler,
    taskId: string,
    backupFunction: () => Promise<void> | void,
    options: {
      /** Backup frequency (daily, weekly) */
      frequency?: 'daily' | 'weekly';
      /** Hour to run backup (0-23) */
      hour?: number;
      /** Additional schedule options */
      scheduleOptions?: ServiceScheduleOptions;
    } = {}
  ): Result<ServiceScheduledTask> {
    const { frequency = 'daily', hour = 1, scheduleOptions = {} } = options;

    let schedule: string;
    switch (frequency) {
      case 'daily':
        schedule = `0 ${hour} * * *`; // Daily at specified hour
        break;
      case 'weekly':
        schedule = `0 ${hour} * * 1`; // Weekly on Monday at specified hour
        break;
      default:
        schedule = `0 ${hour} * * *`; // Default to daily
    }

    return scheduler.scheduleMaintenanceTask(taskId, schedule, backupFunction, {
      ...scheduleOptions,
      name: scheduleOptions.name || `Backup ${taskId} (${frequency})`,
      retryOnFailure: true,
      maxRetries: 3,
      notifyOnFailure: true,
    });
  }

  /**
   * Schedule a task with exponential backoff retry pattern
   */
  static scheduleWithBackoff(
    scheduler: ServiceScheduler,
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    options: {
      /** Maximum number of retries */
      maxRetries?: number;
      /** Base delay in minutes for backoff */
      baseDelayMinutes?: number;
      /** Additional schedule options */
      scheduleOptions?: ServiceScheduleOptions;
    } = {}
  ): Result<ServiceScheduledTask> {
    const { maxRetries = 3, baseDelayMinutes = 5, scheduleOptions = {} } = options;

    let retryCount = 0;
    const wrappedTask = async () => {
      try {
        await taskFunction();
        retryCount = 0; // Reset on success
      } catch (error) {
        retryCount++;
        if (retryCount <= maxRetries) {
          const delayMs = baseDelayMinutes * Math.pow(2, retryCount - 1) * 60 * 1000;
          setTimeout(async () => {
            try {
              await taskFunction();
              retryCount = 0; // Reset on success
            } catch (_retryError) {
              // Retry failed - silently continue to avoid infinite retry loops
              // The original error will still be thrown below
            }
          }, delayMs);
        }
        throw error; // Re-throw to maintain original error handling
      }
    };

    return scheduler.scheduleTask(taskId, schedule, wrappedTask, {
      ...scheduleOptions,
      name: scheduleOptions.name || `Backoff ${taskId}`,
      retryOnFailure: false, // We handle retries manually
    });
  }

  /**
   * Create a task coordination pattern where tasks wait for each other
   */
  static createTaskCoordination(
    scheduler: ServiceScheduler,
    tasks: Array<{
      id: string;
      schedule: string;
      taskFunction: () => Promise<void> | void;
      dependsOn?: string[];
      options?: ServiceScheduleOptions;
    }>,
    logger?: Logger
  ): Result<ServiceScheduledTask[]> {
    const results: ServiceScheduledTask[] = [];
    const taskStatus = new Map<string, boolean>();

    // Initialize all tasks as not completed
    tasks.forEach(task => taskStatus.set(task.id, false));

    for (const task of tasks) {
      const wrappedTask = async () => {
        // Check dependencies
        if (task.dependsOn) {
          const dependenciesMet = task.dependsOn.every(depId => taskStatus.get(depId) === true);
          if (!dependenciesMet) {
            logger?.debug(`Task ${task.id} waiting for dependencies: ${task.dependsOn.join(', ')}`);
            return; // Skip this execution
          }
        }

        try {
          await task.taskFunction();
          taskStatus.set(task.id, true);
          logger?.debug(`Task ${task.id} completed successfully`);
        } catch (error) {
          taskStatus.set(task.id, false);
          logger?.error(`Task ${task.id} failed:`, error);
          throw error;
        }
      };

      const result = scheduler.scheduleTask(task.id, task.schedule, wrappedTask, {
        ...task.options,
        name: task.options?.name || `Coordinated ${task.id}`,
      });

      if (result.success) {
        results.push(result.data);
      } else {
        return result as Result<ServiceScheduledTask[]>;
      }
    }

    return { success: true, data: results };
  }
}
