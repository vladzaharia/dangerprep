/**
 * Retry mechanisms with configurable strategies and jitter
 */

import { isRetryableError } from '@dangerprep/errors';

import {
  RetryStrategy,
  JitterType,
  type RetryConfig,
  type RetryAttempt,
  type RetryResult,
} from './types.js';

/**
 * Calculate delay for retry attempts with various strategies and jitter
 */
export class DelayCalculator {
  private previousDelay = 0;

  constructor(private config: RetryConfig) {}

  calculateDelay(attempt: number): number {
    const baseDelay = this.calculateBaseDelay(attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs || Infinity);
    const jitteredDelay = this.applyJitter(cappedDelay, attempt);

    this.previousDelay = jitteredDelay;
    return Math.max(0, Math.round(jitteredDelay));
  }

  reset(): void {
    this.previousDelay = 0;
  }

  private calculateBaseDelay(attempt: number): number {
    const { strategy, baseDelayMs, multiplier = 2 } = this.config;

    switch (strategy) {
      case RetryStrategy.FIXED:
        return baseDelayMs;

      case RetryStrategy.LINEAR:
        return baseDelayMs * attempt * multiplier;

      case RetryStrategy.EXPONENTIAL:
        return baseDelayMs * Math.pow(multiplier, attempt - 1);

      default:
        return baseDelayMs;
    }
  }

  private applyJitter(delay: number, _attempt: number): number {
    const { jitter } = this.config;

    switch (jitter) {
      case JitterType.NONE:
        return delay;

      case JitterType.FULL:
        return Math.random() * delay;

      case JitterType.EQUAL:
        return delay * 0.5 + Math.random() * delay * 0.5;

      case JitterType.DECORRELATED:
        return Math.random() * (delay * 3 - this.previousDelay) + this.previousDelay;

      default:
        return delay;
    }
  }
}

/**
 * Execute operations with retry logic
 */
export class RetryExecutor<T> {
  private delayCalculator: DelayCalculator;
  private startTime = 0;
  private attempts: RetryAttempt[] = [];

  constructor(private config: RetryConfig) {
    this.validateConfig(config);
    this.delayCalculator = new DelayCalculator(config);
  }

  async execute(operation: () => Promise<T>): Promise<RetryResult<T>> {
    this.startTime = Date.now();
    this.attempts = [];
    this.delayCalculator.reset();

    let lastError: unknown;
    let attempt = 1;

    while (attempt <= this.config.maxAttempts) {
      try {
        const result = await operation();

        return {
          success: true,
          data: result,
          totalAttempts: attempt,
          totalTimeMs: Date.now() - this.startTime,
          attempts: [...this.attempts],
        };
      } catch (error) {
        lastError = error;
        const elapsedMs = Date.now() - this.startTime;

        if (!this.shouldRetryError(error, attempt)) {
          return this.createFailureResult(error, attempt);
        }

        if (this.config.maxTotalTimeMs && elapsedMs >= this.config.maxTotalTimeMs) {
          return this.createFailureResult(error, attempt);
        }

        const delayMs =
          attempt < this.config.maxAttempts ? this.delayCalculator.calculateDelay(attempt + 1) : 0;

        const attemptInfo: RetryAttempt = {
          attempt,
          totalAttempts: attempt,
          delayMs,
          elapsedMs,
          error,
        };
        this.attempts.push(attemptInfo);

        if (this.config.onRetry) {
          this.config.onRetry(error, attempt, delayMs);
        }

        if (attempt >= this.config.maxAttempts) {
          break;
        }

        if (delayMs > 0) {
          await this.sleep(delayMs);
        }

        attempt++;
      }
    }

    if (this.config.onMaxRetriesExceeded) {
      this.config.onMaxRetriesExceeded(lastError, attempt - 1);
    }

    return this.createFailureResult(lastError, attempt - 1);
  }

  private shouldRetryError(error: unknown, attempt: number): boolean {
    if (this.config.shouldRetry) {
      return this.config.shouldRetry(error, attempt);
    }

    return isRetryableError(error);
  }

  private createFailureResult(error: unknown, totalAttempts: number): RetryResult<T> {
    return {
      success: false,
      error,
      totalAttempts,
      totalTimeMs: Date.now() - this.startTime,
      attempts: [...this.attempts],
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private validateConfig(config: RetryConfig): void {
    if (config.maxAttempts <= 0) {
      throw new Error('maxAttempts must be positive');
    }
    if (config.baseDelayMs < 0) {
      throw new Error('baseDelayMs must be non-negative');
    }
    if (config.maxDelayMs !== undefined && config.maxDelayMs < config.baseDelayMs) {
      throw new Error('maxDelayMs must be greater than or equal to baseDelayMs');
    }
    if (config.multiplier !== undefined && config.multiplier <= 0) {
      throw new Error('multiplier must be positive');
    }
    if (config.maxTotalTimeMs !== undefined && config.maxTotalTimeMs <= 0) {
      throw new Error('maxTotalTimeMs must be positive');
    }
  }
}

/**
 * Utility functions for retry execution
 */
export const RetryUtils = {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig
  ): Promise<RetryResult<T>> {
    const executor = new RetryExecutor<T>(config);
    return executor.execute(operation);
  },

  async executeWithRetryOrThrow<T>(operation: () => Promise<T>, config: RetryConfig): Promise<T> {
    const result = await RetryUtils.executeWithRetry(operation, config);

    if (result.success && result.data !== undefined) {
      return result.data;
    }

    throw result.error;
  },

  withRetry<T extends unknown[], R>(config: RetryConfig) {
    return function (
      target: unknown,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
    ) {
      const originalMethod = descriptor.value;
      if (!originalMethod) return descriptor;

      descriptor.value = async function (...args: T): Promise<R> {
        const operation = () => originalMethod.apply(this, args);
        return RetryUtils.executeWithRetryOrThrow(operation, config);
      };

      return descriptor;
    };
  },

  createRetryWrapper<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    config: RetryConfig
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const operation = () => fn(...args);
      return RetryUtils.executeWithRetryOrThrow(operation, config);
    };
  },
};
