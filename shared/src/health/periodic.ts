import type { Logger } from '../logging';
import type { NotificationManager } from '../notifications';
import { NotificationType, NotificationLevel } from '../notifications';

import { HealthChecker } from './checker.js';
import { HealthStatus, HealthCheckResult, PeriodicHealthCheckConfig } from './types.js';

/**
 * Manages periodic health checks for services
 */
export class PeriodicHealthChecker {
  private healthChecker: HealthChecker;
  private config: PeriodicHealthCheckConfig & {
    logResults: boolean;
    logOnlyChanges: boolean;
    sendNotifications: boolean;
  };
  private logger: Logger | undefined;
  private notificationManager: NotificationManager | undefined;
  private intervalId: NodeJS.Timeout | undefined;
  private isRunning = false;
  private lastStatus: HealthStatus | undefined;

  constructor(
    healthChecker: HealthChecker,
    config: PeriodicHealthCheckConfig,
    logger?: Logger,
    notificationManager?: NotificationManager
  ) {
    this.healthChecker = healthChecker;
    this.logger = logger;
    this.notificationManager = notificationManager;

    this.config = {
      logResults: true,
      logOnlyChanges: false,
      sendNotifications: true,
      ...config,
    };
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.isRunning) {
      this.logger?.warn('Periodic health checker is already running');
      return;
    }

    this.logger?.info(`Starting periodic health checks every ${this.config.interval}ms`);

    this.isRunning = true;

    // Perform initial health check
    this.performHealthCheck().catch(error => {
      this.logger?.error('Initial health check failed', error);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.performHealthCheck().catch(error => {
        this.logger?.error('Periodic health check failed', error);
      });
    }, this.config.interval);
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger?.info('Stopping periodic health checks');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isRunning = false;
  }

  /**
   * Check if periodic health checks are running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Perform a single health check and handle the result
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    try {
      const result = await this.healthChecker.check();

      // Handle logging
      await this.handleLogging(result);

      // Handle status changes
      await this.handleStatusChange(result);

      // Call custom callback
      if (this.config.onHealthCheck) {
        await this.config.onHealthCheck(result);
      }

      this.lastStatus = result.status;

      return result;
    } catch (error) {
      this.logger?.error('Health check execution failed', error);
      throw error;
    }
  }

  /**
   * Get the last known health status
   */
  getLastStatus(): HealthStatus | undefined {
    return this.lastStatus;
  }

  private async handleLogging(result: HealthCheckResult): Promise<void> {
    if (!this.config.logResults) {
      return;
    }

    const statusChanged = this.lastStatus !== result.status;

    if (this.config.logOnlyChanges && !statusChanged) {
      return;
    }

    const logLevel = this.getLogLevel(result.status);
    const message = this.formatLogMessage(result);

    switch (logLevel) {
      case 'debug':
        this.logger?.debug(message, { healthCheck: result });
        break;
      case 'info':
        this.logger?.info(message, { healthCheck: result });
        break;
      case 'warn':
        this.logger?.warn(message, { healthCheck: result });
        break;
      case 'error':
        this.logger?.error(message, { healthCheck: result });
        break;
    }
  }

  private async handleStatusChange(result: HealthCheckResult): Promise<void> {
    const statusChanged = this.lastStatus !== undefined && this.lastStatus !== result.status;

    if (!statusChanged) {
      return;
    }

    // Call status change callback
    if (this.config.onStatusChange && this.lastStatus) {
      await this.config.onStatusChange(result.status, this.lastStatus, result);
    }

    // Send notifications if enabled
    if (
      this.config.sendNotifications &&
      this.notificationManager &&
      this.lastStatus !== undefined
    ) {
      await this.sendStatusChangeNotification(result, this.lastStatus);
    }
  }

  private async sendStatusChangeNotification(
    result: HealthCheckResult,
    oldStatus: HealthStatus
  ): Promise<void> {
    if (!this.notificationManager) {
      return;
    }

    const notificationType = this.getNotificationType(result.status);
    const notificationLevel = this.getNotificationLevel(result.status);

    const message = `Health status changed from ${oldStatus} to ${result.status}`;

    try {
      await this.notificationManager.notify(notificationType, message, {
        source: result.service,
        level: notificationLevel,
        data: {
          oldStatus,
          newStatus: result.status,
          duration: result.duration,
          componentCount: result.components.length,
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
        },
      });
    } catch (error) {
      this.logger?.error('Failed to send health status notification', error);
    }
  }

  private getLogLevel(status: HealthStatus): 'debug' | 'info' | 'warn' | 'error' {
    switch (status) {
      case HealthStatus.HEALTHY:
        return 'debug';
      case HealthStatus.DEGRADED:
        return 'warn';
      case HealthStatus.UNHEALTHY:
        return 'error';
      case HealthStatus.UNKNOWN:
        return 'error';
      default:
        return 'info';
    }
  }

  private getNotificationType(status: HealthStatus): NotificationType {
    switch (status) {
      case HealthStatus.UNHEALTHY:
      case HealthStatus.UNKNOWN:
        return NotificationType.HEALTH_CHECK_FAILED;
      default:
        return NotificationType.CUSTOM;
    }
  }

  private getNotificationLevel(status: HealthStatus): NotificationLevel {
    switch (status) {
      case HealthStatus.HEALTHY:
        return NotificationLevel.INFO;
      case HealthStatus.DEGRADED:
        return NotificationLevel.WARN;
      case HealthStatus.UNHEALTHY:
      case HealthStatus.UNKNOWN:
        return NotificationLevel.ERROR;
      default:
        return NotificationLevel.INFO;
    }
  }

  private formatLogMessage(result: HealthCheckResult): string {
    const statusIcon = this.getStatusIcon(result.status);
    let message = `${statusIcon} Health check: ${result.status.toUpperCase()}`;

    if (result.duration) {
      message += ` (${result.duration}ms)`;
    }

    if (result.errors.length > 0) {
      message += ` - ${result.errors.length} error(s)`;
    }

    if (result.warnings.length > 0) {
      message += ` - ${result.warnings.length} warning(s)`;
    }

    return message;
  }

  private getStatusIcon(status: HealthStatus): string {
    switch (status) {
      case HealthStatus.HEALTHY:
        return '✅';
      case HealthStatus.DEGRADED:
        return '⚠️';
      case HealthStatus.UNHEALTHY:
        return '❌';
      case HealthStatus.UNKNOWN:
        return '❓';
      default:
        return 'ℹ️';
    }
  }
}
