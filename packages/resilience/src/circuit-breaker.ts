/**
 * Circuit breaker implementation for fault tolerance
 */

import { Result, success } from '@dangerprep/errors';

import {
  CircuitBreakerState,
  CircuitBreakerOpenError,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitBreakerResult,
  type ResilienceName,
  createResilienceName,
} from './types.js';

interface FailureRecord {
  readonly timestamp: number;
  readonly error: unknown;
  readonly operationId?: string | undefined;
  readonly context?: Record<string, unknown> | undefined;
}

interface CircuitBreakerInternalState {
  readonly state: CircuitBreakerState;
  readonly failures: readonly FailureRecord[];
  readonly successCount: number;
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly rejectedRequests: number;
  readonly lastOpenedAt?: Date | undefined;
  readonly nextRecoveryAttemptAt?: Date | undefined;
}

export class CircuitBreaker {
  private internalState: CircuitBreakerInternalState;
  private readonly name: ResilienceName;

  constructor(private readonly config: CircuitBreakerConfig) {
    this.validateConfig(config);
    this.name = createResilienceName(config.name);
    this.internalState = this.createInitialState();
  }

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

  async execute<T>(
    operation: () => Promise<T>,
    context?: { operationId?: string; metadata?: Record<string, unknown> }
  ): Promise<Result<CircuitBreakerResult<T>>> {
    const startTime = Date.now();
    const operationId =
      context?.operationId ?? `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.internalState = {
      ...this.internalState,
      totalRequests: this.internalState.totalRequests + 1,
    };

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
      const operationResult = this.config.requestTimeoutMs
        ? await this.executeWithTimeout(operation, this.config.requestTimeoutMs)
        : await operation();

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
      this.onFailure(error, operationId, context?.metadata);
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

  getMetrics(): CircuitBreakerMetrics {
    const currentFailureCount = this.getCurrentFailureCount();
    const failureRate =
      this.internalState.totalRequests > 0
        ? this.internalState.failedRequests / this.internalState.totalRequests
        : 0;
    const successRate = 1 - failureRate;

    return {
      state: this.internalState.state,
      totalRequests: this.internalState.totalRequests,
      successfulRequests: this.internalState.successfulRequests,
      failedRequests: this.internalState.failedRequests,
      rejectedRequests: this.internalState.rejectedRequests,
      failureRate,
      successRate,
      currentFailureCount,
      lastOpenedAt: this.internalState.lastOpenedAt,
      nextRecoveryAttemptAt: this.internalState.nextRecoveryAttemptAt,
    };
  }

  reset(): void {
    this.internalState = this.createInitialState();
  }

  private validateConfig(config: CircuitBreakerConfig): void {
    if (config.failureThreshold <= 0) {
      throw new Error('failureThreshold must be positive');
    }
    if (config.failureTimeWindowMs <= 0) {
      throw new Error('failureTimeWindowMs must be positive');
    }
    if (config.recoveryTimeoutMs <= 0) {
      throw new Error('recoveryTimeoutMs must be positive');
    }
    if (config.successThreshold <= 0) {
      throw new Error('successThreshold must be positive');
    }
  }

  private shouldRejectRequest(): boolean {
    const now = Date.now();

    switch (this.internalState.state) {
      case CircuitBreakerState.CLOSED:
        return false;

      case CircuitBreakerState.OPEN:
        if (
          this.internalState.nextRecoveryAttemptAt &&
          now >= this.internalState.nextRecoveryAttemptAt.getTime()
        ) {
          this.transitionToHalfOpen();
          return false;
        }
        return true;

      case CircuitBreakerState.HALF_OPEN:
        return false;

      default:
        return false;
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

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

  private onFailure(error: unknown, operationId?: string, context?: Record<string, unknown>): void {
    const now = Date.now();
    const isFailure = this.config.isFailure ? this.config.isFailure(error) : true;

    if (!isFailure) {
      return;
    }

    const failureRecord: FailureRecord = {
      timestamp: now,
      error,
      operationId,
      context,
    };

    const updatedFailures = [...this.internalState.failures, failureRecord];
    const cleanedFailures = this.cleanupOldFailures(updatedFailures, now);

    this.internalState = {
      ...this.internalState,
      failures: cleanedFailures,
      successCount: 0,
    };

    if (
      this.internalState.state === CircuitBreakerState.CLOSED &&
      cleanedFailures.length >= this.config.failureThreshold
    ) {
      this.transitionToOpen();
    } else if (this.internalState.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToOpen();
    }
  }

  private getCurrentFailureCount(): number {
    const now = Date.now();
    const cleanedFailures = this.cleanupOldFailures(this.internalState.failures, now);
    return cleanedFailures.length;
  }

  private cleanupOldFailures(
    failures: readonly FailureRecord[],
    now: number
  ): readonly FailureRecord[] {
    const cutoff = now - this.config.failureTimeWindowMs;
    return failures.filter(failure => failure.timestamp > cutoff);
  }

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

  private transitionToHalfOpen(): void {
    this.internalState = {
      ...this.internalState,
      state: CircuitBreakerState.HALF_OPEN,
      successCount: 0,
    };

    if (this.config.onHalfOpen) {
      this.config.onHalfOpen(this.config.name);
    }
  }

  private transitionToClosed(): void {
    this.internalState = {
      ...this.internalState,
      state: CircuitBreakerState.CLOSED,
      failures: [],
      successCount: 0,
      lastOpenedAt: undefined,
      nextRecoveryAttemptAt: undefined,
    };

    if (this.config.onClose) {
      this.config.onClose(this.config.name);
    }
  }
}
