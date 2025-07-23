import { ComponentStatus } from '../health/index.js';
import type { Logger } from '../logging/index.js';
import type { Scheduler } from '../scheduling/index.js';

/**
 * Common service patterns and utilities
 */
export class ServicePatterns {
  /**
   * Create a standard configuration health check
   */
  static createConfigurationHealthCheck(
    isConfigLoaded: () => boolean,
    getConfigDetails?: () => Record<string, unknown>
  ) {
    return {
      name: 'configuration',
      critical: true,
      check: async () => {
        const isValid = isConfigLoaded();
        return {
          status: isValid ? ComponentStatus.UP : ComponentStatus.DOWN,
          message: isValid ? 'Configuration loaded' : 'Configuration not loaded',
          ...(isValid &&
            getConfigDetails && {
              details: getConfigDetails(),
            }),
        };
      },
    };
  }

  /**
   * Create a standard services health check
   */
  static createServicesHealthCheck(serviceName: string, services: Record<string, unknown>) {
    return {
      name: 'services',
      critical: false,
      check: async () => {
        const servicesInitialized = Object.values(services).every(service => !!service);
        return {
          status: servicesInitialized ? ComponentStatus.UP : ComponentStatus.DOWN,
          message: servicesInitialized
            ? `All ${serviceName} services initialized`
            : `${serviceName} services not fully initialized`,
          details: Object.fromEntries(
            Object.entries(services).map(([key, value]) => [key, !!value])
          ),
        };
      },
    };
  }

  /**
   * Schedule a task with error handling and logging
   */
  static scheduleTask(
    scheduler: Scheduler,
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    taskName: string,
    logger: Logger
  ): void {
    try {
      scheduler.schedule(
        taskId,
        schedule,
        async () => {
          logger.info(`Starting scheduled ${taskName}`);
          await taskFunction();
        },
        { name: taskName }
      );
      logger.info(`Scheduled ${taskName}: ${schedule}`);
    } catch (error) {
      logger.error(`Failed to schedule ${taskName}: ${error}`);
    }
  }

  /**
   * Shutdown scheduler with logging
   */
  static shutdownScheduler(scheduler: Scheduler, logger: Logger): void {
    logger.info('Shutting down scheduled tasks...');
    scheduler.destroyAll();
  }

  /**
   * Create a standard storage health check
   */
  static createStorageHealthCheck(getStorageStats: () => Promise<Record<string, unknown>>) {
    return {
      name: 'storage',
      critical: false,
      check: async () => {
        try {
          const stats = await getStorageStats();
          return {
            status: ComponentStatus.UP,
            message: 'Storage accessible',
            details: { storageStats: stats },
          };
        } catch (error) {
          return {
            status: ComponentStatus.DEGRADED,
            message: 'Storage check failed',
            error: {
              message: error instanceof Error ? error.message : String(error),
              code: 'STORAGE_CHECK_FAILED',
            },
          };
        }
      },
    };
  }
}
