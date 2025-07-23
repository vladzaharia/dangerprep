/**
 * Circuit breaker implementation for fault tolerance
 */

import {
  CircuitBreakerState,
  CircuitBreakerOpenError,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitBreakerResult,
} from './types.js';

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures: Array<{ timestamp: number; error: unknown }> = [];
  private successCount = 0;
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private rejectedRequests = 0;
  private lastOpenedAt: Date | undefined;
  private lastClosedAt: Date | undefined;
  private nextRecoveryAttemptAt: Date | undefined;

  constructor(private config: CircuitBreakerConfig) {
    this.validateConfig(config);
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<CircuitBreakerResult<T>> {
    const startTime = Date.now();
    this.totalRequests++;

    // Check if circuit is open and should reject requests
    if (this.shouldRejectRequest()) {
      this.rejectedRequests++;
      if (this.config.onReject) {
        this.config.onReject(this.config.name);
      }

      return {
        success: false,
        error: new CircuitBreakerOpenError(
          this.config.name,
          this.state,
          this.nextRecoveryAttemptAt
        ),
        rejected: true,
        state: this.state,
        executionTimeMs: Date.now() - startTime,
      };
    }

    try {
      // Execute the operation with timeout if configured
      const result = this.config.requestTimeoutMs
        ? await this.executeWithTimeout(operation, this.config.requestTimeoutMs)
        : await operation();

      // Operation succeeded
      this.onSuccess();
      this.successfulRequests++;

      return {
        success: true,
        data: result,
        rejected: false,
        state: this.state,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      // Operation failed
      this.onFailure(error);
      this.failedRequests++;

      return {
        success: false,
        error,
        rejected: false,
        state: this.state,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const metrics: CircuitBreakerMetrics = {
      state: this.state,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      rejectedRequests: this.rejectedRequests,
      currentFailures: this.getCurrentFailureCount(),
    };

    if (this.lastOpenedAt !== undefined) {
      metrics.lastOpenedAt = this.lastOpenedAt;
    }
    if (this.lastClosedAt !== undefined) {
      metrics.lastClosedAt = this.lastClosedAt;
    }
    if (this.nextRecoveryAttemptAt !== undefined) {
      metrics.nextRecoveryAttemptAt = this.nextRecoveryAttemptAt;
    }

    return metrics;
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = [];
    this.successCount = 0;
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.rejectedRequests = 0;
    this.lastOpenedAt = undefined;
    this.lastClosedAt = undefined;
    this.nextRecoveryAttemptAt = undefined;
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen(): void {
    this.transitionToOpen();
  }

  /**
   * Force circuit breaker to closed state
   */
  forceClosed(): void {
    this.transitionToClosed();
  }

  /**
   * Check if request should be rejected
   */
  private shouldRejectRequest(): boolean {
    if (this.state === CircuitBreakerState.CLOSED) {
      return false;
    }

    if (this.state === CircuitBreakerState.OPEN) {
      // Check if recovery timeout has passed
      if (this.nextRecoveryAttemptAt && Date.now() >= this.nextRecoveryAttemptAt.getTime()) {
        this.transitionToHalfOpen();
        return false;
      }
      return true;
    }

    // Half-open state - allow request through
    return false;
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: unknown): void {
    // Check if this error should count as a failure
    if (this.config.isFailure && !this.config.isFailure(error)) {
      return;
    }

    const now = Date.now();
    this.failures.push({ timestamp: now, error });

    // Clean up old failures outside the time window
    this.cleanupOldFailures(now);

    // Check if we should open the circuit
    if (this.state === CircuitBreakerState.CLOSED) {
      if (this.getCurrentFailureCount() >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Any failure in half-open state should open the circuit
      this.transitionToOpen();
    }
  }

  /**
   * Get current failure count within the time window
   */
  private getCurrentFailureCount(): number {
    const now = Date.now();
    this.cleanupOldFailures(now);
    return this.failures.length;
  }

  /**
   * Remove failures outside the time window
   */
  private cleanupOldFailures(now: number): void {
    const cutoff = now - this.config.failureTimeWindowMs;
    this.failures = this.failures.filter(failure => failure.timestamp > cutoff);
  }

  /**
   * Transition to open state
   */
  private transitionToOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.successCount = 0;
    this.lastOpenedAt = new Date();
    this.nextRecoveryAttemptAt = new Date(Date.now() + this.config.recoveryTimeoutMs);

    if (this.config.onOpen) {
      this.config.onOpen(this.config.name, this.getCurrentFailureCount());
    }
  }

  /**
   * Transition to half-open state
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitBreakerState.HALF_OPEN;
    this.successCount = 0;
    this.nextRecoveryAttemptAt = undefined;

    if (this.config.onHalfOpen) {
      this.config.onHalfOpen(this.config.name);
    }
  }

  /**
   * Transition to closed state
   */
  private transitionToClosed(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = [];
    this.successCount = 0;
    this.lastClosedAt = new Date();
    this.nextRecoveryAttemptAt = undefined;

    if (this.config.onClose) {
      this.config.onClose(this.config.name);
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Validate circuit breaker configuration
   */
  private validateConfig(config: CircuitBreakerConfig): void {
    if (!config.name) {
      throw new Error('Circuit breaker name is required');
    }
    if (config.failureThreshold < 1) {
      throw new Error('Failure threshold must be at least 1');
    }
    if (config.failureTimeWindowMs < 1000) {
      throw new Error('Failure time window must be at least 1000ms');
    }
    if (config.recoveryTimeoutMs < 1000) {
      throw new Error('Recovery timeout must be at least 1000ms');
    }
    if (config.successThreshold < 1) {
      throw new Error('Success threshold must be at least 1');
    }
    if (config.requestTimeoutMs !== undefined && config.requestTimeoutMs < 100) {
      throw new Error('Request timeout must be at least 100ms');
    }
  }
}
