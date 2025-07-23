import type { Logger } from '../logging';
import type { NotificationManager } from '../notifications';

import {
  HealthStatus,
  ComponentStatus,
  HealthCheckResult,
  HealthCheckComponent,
  HealthCheckConfig,
  ComponentCheck,
  HealthMetrics,
} from './types.js';

/**
 * Standardized health checker for services
 */
export class HealthChecker {
  private config: HealthCheckConfig & {
    componentTimeout: number;
    overallTimeout: number;
    includeDetails: boolean;
    includeStackTraces: boolean;
  };
  private components: Map<string, ComponentCheck> = new Map();
  private metrics: HealthMetrics;
  private startTime: Date;
  private logger: Logger | undefined;
  private notificationManager: NotificationManager | undefined;

  constructor(
    config: HealthCheckConfig,
    logger?: Logger,
    notificationManager?: NotificationManager
  ) {
    this.config = {
      componentTimeout: 5000,
      overallTimeout: 30000,
      includeDetails: true,
      includeStackTraces: false,
      ...config,
    };

    this.logger = logger;
    this.notificationManager = notificationManager;
    this.startTime = new Date();

    this.metrics = {
      totalChecks: 0,
      healthyChecks: 0,
      degradedChecks: 0,
      unhealthyChecks: 0,
      averageDuration: 0,
      consecutiveStatusCount: 0,
    };
  }

  /**
   * Register a component check
   */
  registerComponent(componentCheck: ComponentCheck): void {
    this.components.set(componentCheck.name, componentCheck);
    this.logger?.debug(`Registered health check component: ${componentCheck.name}`);
  }

  /**
   * Unregister a component check
   */
  unregisterComponent(name: string): void {
    this.components.delete(name);
    this.logger?.debug(`Unregistered health check component: ${name}`);
  }

  /**
   * Perform a complete health check
   */
  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timestamp = new Date();

    this.logger?.debug('Starting health check');

    try {
      // Run all component checks
      const componentResults = await this.checkAllComponents();

      // Calculate overall status
      const overallStatus = this.calculateOverallStatus(componentResults);

      // Calculate uptime
      const uptime = Date.now() - this.startTime.getTime();

      // Aggregate errors and warnings
      const errors: string[] = [];
      const warnings: string[] = [];

      componentResults.forEach(component => {
        if (component.status === ComponentStatus.DOWN && component.error) {
          errors.push(`${component.name}: ${component.error.message}`);
        } else if (component.status === ComponentStatus.DEGRADED && component.message) {
          warnings.push(`${component.name}: ${component.message}`);
        }
      });

      const duration = Date.now() - startTime;

      const result: HealthCheckResult = {
        status: overallStatus,
        timestamp,
        service: this.config.serviceName,
        ...(this.config.version && { version: this.config.version }),
        uptime,
        components: componentResults,
        duration,
        ...(this.config.includeDetails && { details: this.getServiceDetails() }),
        errors,
        warnings,
      };

      // Update metrics
      this.updateMetrics(result);

      this.logger?.debug(`Health check completed in ${duration}ms with status: ${overallStatus}`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      const result: HealthCheckResult = {
        status: HealthStatus.UNKNOWN,
        timestamp,
        service: this.config.serviceName,
        ...(this.config.version && { version: this.config.version }),
        components: [],
        duration,
        errors: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
      };

      this.updateMetrics(result);
      this.logger?.error('Health check failed', error);

      return result;
    }
  }

  /**
   * Get current health metrics
   */
  getMetrics(): HealthMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset health metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalChecks: 0,
      healthyChecks: 0,
      degradedChecks: 0,
      unhealthyChecks: 0,
      averageDuration: 0,
      consecutiveStatusCount: 0,
    };
  }

  private async checkAllComponents(): Promise<HealthCheckComponent[]> {
    const componentChecks = Array.from(this.components.values());

    if (componentChecks.length === 0) {
      return [];
    }

    // Run all component checks in parallel with timeouts
    const checkPromises = componentChecks.map(
      async (componentCheck): Promise<HealthCheckComponent> => {
        const startTime = Date.now();
        const timeout = componentCheck.timeout ?? this.config.componentTimeout;

        try {
          // Create timeout promise
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error(`Component check timeout after ${timeout}ms`)),
              timeout
            );
          });

          // Race the component check against timeout
          const result = await Promise.race([componentCheck.check(), timeoutPromise]);

          const duration = Date.now() - startTime;

          return {
            name: componentCheck.name,
            lastChecked: new Date(),
            duration,
            ...result,
          };
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorInfo = error instanceof Error ? error : new Error(String(error));

          return {
            name: componentCheck.name,
            status: ComponentStatus.DOWN,
            lastChecked: new Date(),
            duration,
            error: {
              message: errorInfo.message,
              code: 'CHECK_FAILED',
              ...(this.config.includeStackTraces && { stack: errorInfo.stack }),
            },
          };
        }
      }
    );

    return Promise.all(checkPromises);
  }

  private calculateOverallStatus(components: HealthCheckComponent[]): HealthStatus {
    if (components.length === 0) {
      return HealthStatus.HEALTHY;
    }

    const criticalComponents = Array.from(this.components.values())
      .filter(c => c.critical !== false)
      .map(c => c.name);

    let hasUnhealthy = false;
    let hasDegraded = false;

    for (const component of components) {
      const isCritical = criticalComponents.includes(component.name);

      if (component.status === ComponentStatus.DOWN) {
        if (isCritical) {
          return HealthStatus.UNHEALTHY;
        }
        hasUnhealthy = true;
      } else if (component.status === ComponentStatus.DEGRADED) {
        if (isCritical) {
          hasDegraded = true;
        } else {
          hasDegraded = true;
        }
      }
    }

    if (hasUnhealthy) {
      return HealthStatus.DEGRADED;
    }

    if (hasDegraded) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  private updateMetrics(result: HealthCheckResult): void {
    this.metrics.totalChecks++;

    // Update status counts
    switch (result.status) {
      case HealthStatus.HEALTHY:
        this.metrics.healthyChecks++;
        break;
      case HealthStatus.DEGRADED:
        this.metrics.degradedChecks++;
        break;
      case HealthStatus.UNHEALTHY:
        this.metrics.unhealthyChecks++;
        break;
    }

    // Update average duration
    const totalDuration =
      this.metrics.averageDuration * (this.metrics.totalChecks - 1) + result.duration;
    this.metrics.averageDuration = totalDuration / this.metrics.totalChecks;

    // Update consecutive status count
    if (this.metrics.lastResult?.status === result.status) {
      this.metrics.consecutiveStatusCount++;
    } else {
      this.metrics.consecutiveStatusCount = 1;
      this.metrics.lastStatusChange = result.timestamp;
    }

    this.metrics.lastResult = result;
  }

  private getServiceDetails(): Record<string, unknown> {
    return {
      startTime: this.startTime.toISOString(),
      registeredComponents: Array.from(this.components.keys()),
      metrics: this.getMetrics(),
    };
  }

  /**
   * Create a simple health check for basic service status
   */
  static createBasicServiceCheck(
    serviceName: string,
    isRunning: () => boolean,
    getDetails?: () => Record<string, unknown>
  ): ComponentCheck {
    return {
      name: 'service',
      critical: true,
      check: async () => {
        const running = isRunning();
        const details = getDetails?.();
        return {
          status: running ? ComponentStatus.UP : ComponentStatus.DOWN,
          message: running ? 'Service is running' : 'Service is not running',
          ...(details && { details }),
        };
      },
    };
  }

  /**
   * Create a file system access check
   */
  static createFileSystemCheck(
    name: string,
    paths: string[],
    critical: boolean = true
  ): ComponentCheck {
    return {
      name,
      critical,
      check: async () => {
        const { promises: fs } = await import('fs');

        try {
          for (const path of paths) {
            await fs.access(path);
          }

          return {
            status: ComponentStatus.UP,
            message: 'All paths accessible',
            details: { paths },
          };
        } catch (error) {
          return {
            status: ComponentStatus.DOWN,
            message: 'File system access failed',
            details: { paths },
            error: {
              message: error instanceof Error ? error.message : String(error),
              code: 'FS_ACCESS_FAILED',
            },
          };
        }
      },
    };
  }

  /**
   * Create a configuration check
   */
  static createConfigCheck(
    name: string,
    validateConfig: () => boolean | Promise<boolean>,
    critical: boolean = true
  ): ComponentCheck {
    return {
      name,
      critical,
      check: async () => {
        try {
          const isValid = await validateConfig();

          return {
            status: isValid ? ComponentStatus.UP : ComponentStatus.DOWN,
            message: isValid ? 'Configuration is valid' : 'Configuration is invalid',
          };
        } catch (error) {
          return {
            status: ComponentStatus.DOWN,
            message: 'Configuration validation failed',
            error: {
              message: error instanceof Error ? error.message : String(error),
              code: 'CONFIG_VALIDATION_FAILED',
            },
          };
        }
      },
    };
  }
}
