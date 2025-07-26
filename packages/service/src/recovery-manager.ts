import type { HealthChecker } from '@dangerprep/health';
import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';
import { CircuitBreaker } from '@dangerprep/resilience';

import type { ServiceRecoveryConfig, ServiceRecoveryState } from './types.js';

/**
 * Service recovery manager for automatic restart and graceful degradation
 *
 * Features:
 * - Automatic restart on failure with exponential backoff
 * - Service dependency restart cascading
 * - Graceful degradation modes when dependencies fail
 * - Circuit breaker integration for external dependencies
 * - Recovery state tracking and reporting
 */
export class ServiceRecoveryManager {
  private readonly serviceName: string;
  private readonly logger: Logger;
  private readonly notificationManager: NotificationManager;
  private readonly healthChecker: HealthChecker;
  private readonly config: ServiceRecoveryConfig;

  private recoveryState: ServiceRecoveryState;
  private restartTimeout: NodeJS.Timeout | undefined;
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(
    serviceName: string,
    logger: Logger,
    notificationManager: NotificationManager,
    healthChecker: HealthChecker,
    config: ServiceRecoveryConfig = {}
  ) {
    this.serviceName = serviceName;
    this.logger = logger;
    this.notificationManager = notificationManager;
    this.healthChecker = healthChecker;
    this.config = {
      maxRestartAttempts: 3,
      restartDelayMs: 5000, // 5 seconds
      useExponentialBackoff: true,
      maxRestartDelayMs: 300000, // 5 minutes
      restartOnDependencyFailure: true,
      enableGracefulDegradation: true,
      circuitBreakerConfig: {
        failureThreshold: 5,
        timeoutMs: 30000,
        resetTimeoutMs: 60000,
      },
      ...config,
    };

    this.recoveryState = {
      restartAttempts: 0,
      lastRestart: undefined,
      inGracefulDegradation: false,
      status: 'healthy',
      lastError: undefined,
    };
  }

  /**
   * Handle service failure and attempt recovery
   */
  async handleServiceFailure(error: Error, restartFunction: () => Promise<void>): Promise<boolean> {
    this.logger.error(`Service ${this.serviceName} failed: ${error.message}`);

    this.recoveryState.lastError = error.message;
    this.recoveryState.status = 'recovering';

    // Check if we should attempt restart
    if (this.recoveryState.restartAttempts >= (this.config.maxRestartAttempts || 3)) {
      this.logger.error(
        `Maximum restart attempts (${this.config.maxRestartAttempts}) reached for service ${this.serviceName}`
      );

      if (this.config.enableGracefulDegradation) {
        await this.enterGracefulDegradation();
      } else {
        this.recoveryState.status = 'failed';
      }

      return false;
    }

    // Calculate restart delay
    const delay = this.calculateRestartDelay();

    this.logger.info(
      `Attempting to restart service ${this.serviceName} in ${delay}ms (attempt ${this.recoveryState.restartAttempts + 1})`
    );

    // Send failure notification
    await this.notificationManager.error(
      `Service ${this.serviceName} failed and will restart in ${delay}ms`,
      {
        source: 'ServiceRecoveryManager',
        data: {
          serviceName: this.serviceName,
          error: error.message,
          restartAttempt: this.recoveryState.restartAttempts + 1,
          maxAttempts: this.config.maxRestartAttempts,
        },
      }
    );

    // Schedule restart
    this.restartTimeout = setTimeout(async () => {
      try {
        this.recoveryState.restartAttempts++;
        this.recoveryState.lastRestart = new Date();

        await restartFunction();

        // Reset recovery state on successful restart
        this.recoveryState.restartAttempts = 0;
        this.recoveryState.status = 'healthy';
        this.recoveryState.lastError = undefined;

        this.logger.info(`Service ${this.serviceName} restarted successfully`);

        await this.notificationManager.info(`Service ${this.serviceName} restarted successfully`, {
          source: 'ServiceRecoveryManager',
          data: { serviceName: this.serviceName },
        });
      } catch (restartError) {
        this.logger.error(
          `Failed to restart service ${this.serviceName}: ${restartError instanceof Error ? restartError.message : String(restartError)}`
        );

        // Recursively handle the restart failure
        await this.handleServiceFailure(
          restartError instanceof Error ? restartError : new Error(String(restartError)),
          restartFunction
        );
      }
    }, delay);

    return true;
  }

  /**
   * Enter graceful degradation mode
   */
  async enterGracefulDegradation(): Promise<void> {
    this.logger.warn(`Service ${this.serviceName} entering graceful degradation mode`);

    this.recoveryState.inGracefulDegradation = true;
    this.recoveryState.status = 'degraded';

    await this.notificationManager.warn(
      `Service ${this.serviceName} entered graceful degradation mode`,
      {
        source: 'ServiceRecoveryManager',
        data: { serviceName: this.serviceName },
      }
    );
  }

  /**
   * Exit graceful degradation mode
   */
  async exitGracefulDegradation(): Promise<void> {
    this.logger.info(`Service ${this.serviceName} exiting graceful degradation mode`);

    this.recoveryState.inGracefulDegradation = false;
    this.recoveryState.status = 'healthy';
    this.recoveryState.restartAttempts = 0;

    await this.notificationManager.info(
      `Service ${this.serviceName} exited graceful degradation mode`,
      {
        source: 'ServiceRecoveryManager',
        data: { serviceName: this.serviceName },
      }
    );
  }

  /**
   * Create a circuit breaker for external dependencies
   */
  createCircuitBreaker(dependencyName: string): CircuitBreaker {
    const config = this.config.circuitBreakerConfig || {};

    const circuitBreaker = new CircuitBreaker({
      name: `${this.serviceName}-${dependencyName}`,
      failureThreshold: config.failureThreshold || 5,
      failureTimeWindowMs: 60000, // 1 minute
      recoveryTimeoutMs: config.resetTimeoutMs || 60000,
      successThreshold: 2,
      requestTimeoutMs: config.timeoutMs || 30000,
    });

    this.circuitBreakers.set(dependencyName, circuitBreaker);
    return circuitBreaker;
  }

  /**
   * Get circuit breaker for a dependency
   */
  getCircuitBreaker(dependencyName: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(dependencyName);
  }

  /**
   * Check if service should operate in degraded mode
   */
  shouldOperateInDegradedMode(): boolean {
    return this.recoveryState.inGracefulDegradation;
  }

  /**
   * Get recovery state
   */
  getRecoveryState(): ServiceRecoveryState {
    return { ...this.recoveryState };
  }

  /**
   * Reset recovery state
   */
  resetRecoveryState(): void {
    this.recoveryState = {
      restartAttempts: 0,
      lastRestart: undefined,
      inGracefulDegradation: false,
      status: 'healthy',
      lastError: undefined,
    };
  }

  /**
   * Cleanup recovery manager
   */
  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up recovery manager for service ${this.serviceName}`);

    // Clear restart timeout
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = undefined;
    }

    // Clear circuit breakers (they don't need explicit cleanup)
    this.circuitBreakers.clear();

    this.logger.debug(`Recovery manager cleanup completed for service ${this.serviceName}`);
  }

  /**
   * Calculate restart delay with optional exponential backoff
   */
  private calculateRestartDelay(): number {
    const baseDelay = this.config.restartDelayMs || 5000;

    if (!this.config.useExponentialBackoff) {
      return baseDelay;
    }

    const exponentialDelay = baseDelay * Math.pow(2, this.recoveryState.restartAttempts);
    const maxDelay = this.config.maxRestartDelayMs || 300000;

    return Math.min(exponentialDelay, maxDelay);
  }
}
