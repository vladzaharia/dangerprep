/**
 * Health module - Standardized health check system for DangerPrep services
 *
 * Features:
 * - Standardized health check interface across all services
 * - Component-based health monitoring
 * - Periodic health checks with notifications
 * - Comprehensive health metrics and reporting
 * - Integration with logging and notification systems
 */

// Core exports
export { HealthChecker } from './checker.js';
export { PeriodicHealthChecker } from './periodic.js';

// Types and enums
export { HealthStatus, ComponentStatus } from './types.js';

export type {
  HealthCheckComponent,
  HealthCheckResult,
  HealthCheckConfig,
  ComponentCheck,
  PeriodicHealthCheckConfig,
  HealthMetrics,
} from './types.js';

// Import for utility functions
import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';

import { HealthChecker } from './checker.js';
import { PeriodicHealthChecker } from './periodic.js';
import type { HealthCheckConfig, PeriodicHealthCheckConfig } from './types.js';

// Utility functions
export const HealthUtils = {
  /**
   * Create a basic health checker with common service checks
   */
  createServiceHealthChecker(
    serviceName: string,
    version: string,
    isRunning: () => boolean,
    logger?: Logger,
    notificationManager?: NotificationManager
  ): HealthChecker {
    const config: HealthCheckConfig = {
      serviceName,
      version,
      componentTimeout: 5000,
      overallTimeout: 30000,
      includeDetails: true,
    };

    const healthChecker = new HealthChecker(config, logger, notificationManager);

    // Register basic service check
    healthChecker.registerComponent(HealthChecker.createBasicServiceCheck(serviceName, isRunning));

    return healthChecker;
  },

  /**
   * Create a health checker with file system checks
   */
  createFileSystemHealthChecker(
    serviceName: string,
    version: string,
    paths: string[],
    isRunning: () => boolean,
    logger?: Logger,
    notificationManager?: NotificationManager
  ): HealthChecker {
    const healthChecker = this.createServiceHealthChecker(
      serviceName,
      version,
      isRunning,
      logger,
      notificationManager
    );

    // Register file system check
    healthChecker.registerComponent(HealthChecker.createFileSystemCheck('filesystem', paths, true));

    return healthChecker;
  },

  /**
   * Create a periodic health checker with default configuration
   */
  createPeriodicHealthChecker(
    healthChecker: HealthChecker,
    intervalMinutes: number = 5,
    logger?: Logger,
    notificationManager?: NotificationManager
  ): PeriodicHealthChecker {
    const config: PeriodicHealthCheckConfig = {
      interval: intervalMinutes * 60 * 1000, // Convert minutes to milliseconds
      logResults: true,
      logOnlyChanges: true,
      sendNotifications: true,
    };

    return new PeriodicHealthChecker(healthChecker, config, logger, notificationManager);
  },

  /**
   * Create a complete health monitoring setup
   */
  createHealthMonitoring(
    serviceName: string,
    version: string,
    isRunning: () => boolean,
    options: {
      paths?: string[];
      intervalMinutes?: number;
      logger?: Logger;
      notificationManager?: NotificationManager;
      autoStart?: boolean;
    } = {}
  ): {
    healthChecker: HealthChecker;
    periodicChecker: PeriodicHealthChecker;
  } {
    const {
      paths = [],
      intervalMinutes = 5,
      logger,
      notificationManager,
      autoStart = false,
    } = options;

    // Create health checker
    const healthChecker =
      paths.length > 0
        ? this.createFileSystemHealthChecker(
            serviceName,
            version,
            paths,
            isRunning,
            logger,
            notificationManager
          )
        : this.createServiceHealthChecker(
            serviceName,
            version,
            isRunning,
            logger,
            notificationManager
          );

    // Create periodic checker
    const periodicChecker = this.createPeriodicHealthChecker(
      healthChecker,
      intervalMinutes,
      logger,
      notificationManager
    );

    // Auto-start if requested
    if (autoStart) {
      periodicChecker.start();
    }

    return {
      healthChecker,
      periodicChecker,
    };
  },
};
