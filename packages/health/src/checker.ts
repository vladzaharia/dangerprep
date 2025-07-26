import { Result, safeAsync } from '@dangerprep/errors';
import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';

import {
  HealthStatus,
  ComponentStatus,
  HealthCheckResult,
  HealthCheckComponent,
  HealthCheckConfig,
  ComponentCheck,
  HealthMetrics,
  type ComponentName,
  type HealthScore,
  createComponentName,
  createHealthScore,
} from './types.js';

// Enhanced health check result with immutable patterns
interface EnhancedHealthCheckResult extends HealthCheckResult {
  readonly executionTimeMs: number;
  readonly timestamp: Date;
  readonly componentName: ComponentName;
  readonly healthScore: HealthScore;
  readonly metadata?: Record<string, unknown>;
}

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

  /**
   * Perform health check with Result pattern
   */
  async checkHealthAdvanced(): Promise<Result<EnhancedHealthCheckResult>> {
    return safeAsync(async () => {
      const basicResult = await this.check();

      // Calculate health score based on component statuses
      const healthScore = this.calculateHealthScore(basicResult.components);

      const enhancedResult: EnhancedHealthCheckResult = {
        status: basicResult.status,
        timestamp: basicResult.timestamp,
        service: basicResult.service,
        ...(basicResult.version && { version: basicResult.version }),
        ...(basicResult.uptime !== undefined && { uptime: basicResult.uptime }),
        components: basicResult.components,
        duration: basicResult.duration,
        ...(basicResult.details && { details: basicResult.details }),
        errors: basicResult.errors || [],
        warnings: basicResult.warnings || [],
        executionTimeMs: basicResult.duration,
        componentName: createComponentName(basicResult.service),
        healthScore,
        metadata: {
          totalComponents: basicResult.components.length,
          healthyComponents: basicResult.components.filter(
            (c: HealthCheckComponent) => c.status === ComponentStatus.UP
          ).length,
          degradedComponents: basicResult.components.filter(
            (c: HealthCheckComponent) => c.status === ComponentStatus.DEGRADED
          ).length,
          downComponents: basicResult.components.filter(
            (c: HealthCheckComponent) => c.status === ComponentStatus.DOWN
          ).length,
        },
      };

      return enhancedResult;
    });
  }

  /**
   * Check specific component with Result pattern
   */
  async checkComponentAdvanced(
    componentName: ComponentName
  ): Promise<Result<EnhancedHealthCheckResult>> {
    return safeAsync(async () => {
      const component = this.components.get(componentName);
      if (!component) {
        throw new Error(`Component '${componentName}' not found`);
      }

      const startTime = Date.now();
      const timestamp = new Date();

      try {
        const result = await Promise.race([
          component.check(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Component check timeout')),
              this.config.componentTimeout
            )
          ),
        ]);

        const executionTimeMs = Date.now() - startTime;
        const healthScore = createHealthScore(this.calculateComponentHealthScore(result.status));

        const enhancedResult: EnhancedHealthCheckResult = {
          status: this.mapComponentStatusToHealthStatus(result.status),
          timestamp,
          service: this.config.serviceName,
          components: [
            {
              name: componentName,
              status: result.status,
              lastChecked: timestamp,
              duration: executionTimeMs,
              ...(result.message && { message: result.message }),
              ...(result.details && { details: result.details }),
              ...(result.error && { error: result.error }),
            },
          ],
          duration: executionTimeMs,
          executionTimeMs,
          componentName,
          healthScore,
          errors: result.error ? [result.error.message] : [],
          warnings: [],
          metadata: {
            componentType: component.critical ? 'critical' : 'non-critical',
            timeout: this.config.componentTimeout,
          },
        };

        return enhancedResult;
      } catch (error) {
        const executionTimeMs = Date.now() - startTime;
        const healthScore = createHealthScore(0);

        const enhancedResult: EnhancedHealthCheckResult = {
          status: HealthStatus.UNHEALTHY,
          timestamp,
          service: this.config.serviceName,
          components: [
            {
              name: componentName,
              status: ComponentStatus.DOWN,
              lastChecked: timestamp,
              duration: executionTimeMs,
              message: 'Component check failed',
              error: {
                message: error instanceof Error ? error.message : String(error),
                code: 'COMPONENT_CHECK_FAILED',
              },
            },
          ],
          duration: executionTimeMs,
          executionTimeMs,
          componentName,
          healthScore,
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: [],
        };

        return enhancedResult;
      }
    });
  }

  /**
   * Calculate overall health score based on component statuses
   */
  private calculateHealthScore(components: HealthCheckComponent[]): HealthScore {
    if (components.length === 0) {
      return createHealthScore(100);
    }

    let totalScore = 0;
    let totalWeight = 0;

    for (const component of components) {
      const componentScore = this.calculateComponentHealthScore(component.status);
      const weight = this.getComponentWeight(component.name);

      totalScore += componentScore * weight;
      totalWeight += weight;
    }

    const averageScore = totalWeight > 0 ? totalScore / totalWeight : 100;
    return createHealthScore(Math.round(Math.max(0, Math.min(100, averageScore))));
  }

  /**
   * Calculate health score for individual component
   */
  private calculateComponentHealthScore(status: ComponentStatus): number {
    switch (status) {
      case ComponentStatus.UP:
        return 100;
      case ComponentStatus.DEGRADED:
        return 50;
      case ComponentStatus.DOWN:
        return 0;
      default:
        return 25; // Unknown status
    }
  }

  /**
   * Get component weight for health score calculation
   */
  private getComponentWeight(componentName: string): number {
    const component = this.components.get(componentName);
    return component?.critical ? 2 : 1; // Critical components have double weight
  }

  /**
   * Map component status to overall health status
   */
  private mapComponentStatusToHealthStatus(status: ComponentStatus): HealthStatus {
    switch (status) {
      case ComponentStatus.UP:
        return HealthStatus.HEALTHY;
      case ComponentStatus.DEGRADED:
        return HealthStatus.DEGRADED;
      case ComponentStatus.DOWN:
        return HealthStatus.UNHEALTHY;
      default:
        return HealthStatus.UNKNOWN;
    }
  }

  /**
   * Get health trend analysis
   */
  async getHealthTrend(_periodMinutes: number = 60): Promise<
    Result<{
      trend: 'improving' | 'stable' | 'degrading';
      averageScore: HealthScore;
      scoreHistory: Array<{ timestamp: Date; score: HealthScore }>;
    }>
  > {
    return safeAsync(async () => {
      // This is a simplified implementation
      // In a real system, you'd store historical health data
      const currentResult = await this.checkHealthAdvanced();

      if (!currentResult.success) {
        throw currentResult.error || new Error('Failed to get current health status');
      }

      const currentScore = currentResult.data.healthScore;

      // For now, return current state as stable trend
      // This could be enhanced with actual historical data storage
      return {
        trend: 'stable' as const,
        averageScore: currentScore,
        scoreHistory: [
          {
            timestamp: new Date(),
            score: currentScore,
          },
        ],
      };
    });
  }
}
