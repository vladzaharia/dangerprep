/**
 * Circuit breaker implementation for fault tolerance with modern TypeScript patterns
 */

import { Result, success, failure } from '@dangerprep/errors';

import {
  CircuitBreakerState,
  CircuitBreakerOpenError,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitBreakerResult,
} from './types.js';

// Branded types for better type safety
export type CircuitBreakerName = string & { readonly __brand: 'CircuitBreakerName' };
export type FailureCount = number & { readonly __brand: 'FailureCount' };
export type TimeoutMs = number & { readonly __brand: 'TimeoutMs' };

// Type guards
export function isCircuitBreakerName(value: string): value is CircuitBreakerName {
  return typeof value === 'string' && value.length > 0;
}

export function isFailureCount(value: number): value is FailureCount {
  return typeof value === 'number' && value >= 0 && Number.isInteger(value);
}

export function isTimeoutMs(value: number): value is TimeoutMs {
  return typeof value === 'number' && value > 0 && Number.isInteger(value);
}

// Factory functions
export function createCircuitBreakerName(name: string): CircuitBreakerName {
  if (!isCircuitBreakerName(name)) {
    throw new Error(`Invalid circuit breaker name: ${name}`);
  }
  return name;
}

export function createFailureCount(count: number): FailureCount {
  if (!isFailureCount(count)) {
    throw new Error(`Invalid failure count: ${count}`);
  }
  return count;
}

export function createTimeoutMs(timeout: number): TimeoutMs {
  if (!isTimeoutMs(timeout)) {
    throw new Error(`Invalid timeout: ${timeout}`);
  }
  return timeout;
}

// Advanced failure tracking with immutable patterns
interface FailureRecord {
  readonly timestamp: number;
  readonly error: unknown;
  readonly operationId?: string;
  readonly context?: Record<string, unknown>;
}

// Circuit breaker state with readonly properties
interface CircuitBreakerInternalState {
  readonly state: CircuitBreakerState;
  readonly failures: readonly FailureRecord[];
  readonly successCount: number;
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly rejectedRequests: number;
  readonly lastOpenedAt?: Date;
  readonly lastClosedAt?: Date;
  readonly nextRecoveryAttemptAt?: Date;
}

/**
 * Modern circuit breaker implementation with immutable state patterns
 */
export class CircuitBreaker {
  private internalState: CircuitBreakerInternalState;
  private readonly name: CircuitBreakerName;

  constructor(private readonly config: CircuitBreakerConfig) {
    this.validateConfig(config);
    this.name = createCircuitBreakerName(config.name);
    this.internalState = this.createInitialState();
  }

  /**
   * Create initial circuit breaker state
   */
  private createInitialState(): CircuitBreakerInternalState {
    return {
      state: CircuitBreakerState.CLOSED,
      failures: [],
      successCount: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
    } as const;
  }

  /**
   * Execute an operation with circuit breaker protection using Result pattern
   */
  async execute<T>(
    operation: () => Promise<T>,
    context?: { operationId?: string; metadata?: Record<string, unknown> }
  ): Promise<Result<CircuitBreakerResult<T>>> {
    const startTime = Date.now();
    const operationId =
      context?.operationId ?? `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Update state immutably
    this.internalState = {
      ...this.internalState,
      totalRequests: this.internalState.totalRequests + 1,
    };

    // Check if circuit is open and should reject requests
    const shouldReject = this.shouldRejectRequest();
    if (shouldReject) {
      this.internalState = {
        ...this.internalState,
        rejectedRequests: this.internalState.rejectedRequests + 1,
      };

      if (this.config.onReject) {
        this.config.onReject(this.config.name);
      }

      const result: CircuitBreakerResult<T> = {
        success: false,
        error: new CircuitBreakerOpenError(
          this.config.name,
          this.internalState.state,
          this.internalState.nextRecoveryAttemptAt
        ),
        rejected: true,
        state: this.internalState.state,
        executionTimeMs: Date.now() - startTime,
      };

      return success(result);
    }

    try {
      // Execute the operation with timeout if configured
      const operationResult = this.config.requestTimeoutMs
        ? await this.executeWithTimeout(operation, this.config.requestTimeoutMs)
        : await operation();

      // Operation succeeded - update state immutably
      this.onSuccess();
      this.internalState = {
        ...this.internalState,
        successfulRequests: this.internalState.successfulRequests + 1,
      };

      const result: CircuitBreakerResult<T> = {
        success: true,
        data: operationResult,
        rejected: false,
        state: this.internalState.state,
        executionTimeMs: Date.now() - startTime,
      };

      return success(result);
    } catch (error) {
      // Operation failed - update state immutably
      this.onFailure(error, { operationId, ...context?.metadata });
      this.internalState = {
        ...this.internalState,
        failedRequests: this.internalState.failedRequests + 1,
      };

      const result: CircuitBreakerResult<T> = {
        success: false,
        error,
        rejected: false,
        state: this.internalState.state,
        executionTimeMs: Date.now() - startTime,
      };

      return success(result);
    }
  }

  /**
   * Execute operation with Result pattern (alternative interface)
   */
  async executeWithResult<T>(
    operation: () => Promise<T>,
    context?: { operationId?: string; metadata?: Record<string, unknown> }
  ): Promise<Result<T>> {
    const circuitResult = await this.execute(operation, context);

    if (!circuitResult.success) {
      return failure(circuitResult.error || new Error('Circuit breaker execution failed'));
    }

    const { data } = circuitResult.data;
    if (circuitResult.data.success && data !== undefined) {
      return success(data);
    } else {
      const error = circuitResult.data.error;
      return failure(error instanceof Error ? error : new Error('Operation failed'));
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const metrics: CircuitBreakerMetrics = {
      state: this.internalState.state,
      totalRequests: this.internalState.totalRequests,
      successfulRequests: this.internalState.successfulRequests,
      failedRequests: this.internalState.failedRequests,
      rejectedRequests: this.internalState.rejectedRequests,
      currentFailures: this.getCurrentFailureCount(),
    };

    if (this.internalState.lastOpenedAt !== undefined) {
      metrics.lastOpenedAt = this.internalState.lastOpenedAt;
    }
    if (this.internalState.lastClosedAt !== undefined) {
      metrics.lastClosedAt = this.internalState.lastClosedAt;
    }
    if (this.internalState.nextRecoveryAttemptAt !== undefined) {
      metrics.nextRecoveryAttemptAt = this.internalState.nextRecoveryAttemptAt;
    }

    return metrics;
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.internalState = this.createInitialState();
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
    if (this.internalState.state === CircuitBreakerState.CLOSED) {
      return false;
    }

    if (this.internalState.state === CircuitBreakerState.OPEN) {
      // Check if recovery timeout has passed
      if (
        this.internalState.nextRecoveryAttemptAt &&
        Date.now() >= this.internalState.nextRecoveryAttemptAt.getTime()
      ) {
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
    if (this.internalState.state === CircuitBreakerState.HALF_OPEN) {
      const newSuccessCount = this.internalState.successCount + 1;
      this.internalState = {
        ...this.internalState,
        successCount: newSuccessCount,
      };

      if (newSuccessCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Handle failed operation with enhanced context
   */
  private onFailure(error: unknown, context?: Record<string, unknown>): void {
    // Check if this error should count as a failure
    if (this.config.isFailure && !this.config.isFailure(error)) {
      return;
    }

    const now = Date.now();
    const failureRecord: FailureRecord = {
      timestamp: now,
      error,
      ...(context?.operationId ? { operationId: context.operationId as string } : {}),
      ...(context ? { context } : {}),
    };

    // Update failures immutably
    const newFailures = [...this.internalState.failures, failureRecord];
    const cleanedFailures = this.cleanupOldFailures(newFailures, now);

    this.internalState = {
      ...this.internalState,
      failures: cleanedFailures,
    };

    // Check if we should open the circuit
    if (this.internalState.state === CircuitBreakerState.CLOSED) {
      if (cleanedFailures.length >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    } else if (this.internalState.state === CircuitBreakerState.HALF_OPEN) {
      // Any failure in half-open state should open the circuit
      this.transitionToOpen();
    }
  }

  /**
   * Get current failure count within the time window
   */
  private getCurrentFailureCount(): number {
    const now = Date.now();
    const cleanedFailures = this.cleanupOldFailures(this.internalState.failures, now);
    return cleanedFailures.length;
  }

  /**
   * Remove failures outside the time window (pure function)
   */
  private cleanupOldFailures(
    failures: readonly FailureRecord[],
    now: number
  ): readonly FailureRecord[] {
    const cutoff = now - this.config.failureTimeWindowMs;
    return failures.filter(failure => failure.timestamp > cutoff);
  }

  /**
   * Transition to open state
   */
  private transitionToOpen(): void {
    this.internalState = {
      ...this.internalState,
      state: CircuitBreakerState.OPEN,
      successCount: 0,
      lastOpenedAt: new Date(),
      nextRecoveryAttemptAt: new Date(Date.now() + this.config.recoveryTimeoutMs),
    };

    if (this.config.onOpen) {
      this.config.onOpen(this.config.name, this.getCurrentFailureCount());
    }
  }

  /**
   * Transition to half-open state
   */
  private transitionToHalfOpen(): void {
    const { nextRecoveryAttemptAt: _nextRecoveryAttemptAt, ...restState } = this.internalState;
    this.internalState = {
      ...restState,
      state: CircuitBreakerState.HALF_OPEN,
      successCount: 0,
    };

    if (this.config.onHalfOpen) {
      this.config.onHalfOpen(this.config.name);
    }
  }

  /**
   * Transition to closed state
   */
  private transitionToClosed(): void {
    const { nextRecoveryAttemptAt: _nextRecoveryAttemptAt, ...restState } = this.internalState;
    this.internalState = {
      ...restState,
      state: CircuitBreakerState.CLOSED,
      failures: [],
      successCount: 0,
      lastClosedAt: new Date(),
    };

    if (this.config.onClose) {
      this.config.onClose(this.config.name);
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
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
