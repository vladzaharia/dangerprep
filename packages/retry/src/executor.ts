/**
 * Retry execution engine with configurable strategies
 */

import { isRetryableError } from '@dangerprep/errors';

import { DelayCalculator, DelayUtils } from './calculator.js';
import type { RetryConfig, RetryAttempt, RetryResult } from './types.js';

/**
 * Execute operations with retry logic
 */
export class RetryExecutor<T> {
  private delayCalculator: DelayCalculator;
  private startTime = 0;
  private attempts: RetryAttempt[] = [];

  constructor(private config: RetryConfig) {
    // Validate configuration
    const errors = DelayUtils.validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid retry configuration: ${errors.join(', ')}`);
    }

    this.delayCalculator = new DelayCalculator(config);
  }

  /**
   * Execute an operation with retry logic
   */
  async execute(operation: () => Promise<T>): Promise<RetryResult<T>> {
    this.startTime = Date.now();
    this.attempts = [];
    this.delayCalculator.reset();

    let lastError: unknown;
    let attempt = 1;

    while (attempt <= this.config.maxAttempts) {
      try {
        // Execute the operation
        const result = await operation();

        // Success - return result with attempt information
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

        // Check if we should retry
        if (!this.shouldRetryError(error, attempt)) {
          return this.createFailureResult(error, attempt);
        }

        // Check if we've exceeded max total time
        if (this.config.maxTotalTimeMs && elapsedMs >= this.config.maxTotalTimeMs) {
          return this.createFailureResult(error, attempt);
        }

        // Calculate delay for next attempt
        const delayMs =
          attempt < this.config.maxAttempts ? this.delayCalculator.calculateDelay(attempt + 1) : 0;

        // Record this attempt
        const attemptInfo: RetryAttempt = {
          attempt,
          totalAttempts: attempt,
          delayMs,
          elapsedMs,
          error,
        };
        this.attempts.push(attemptInfo);

        // Call retry callback if provided
        if (this.config.onRetry) {
          this.config.onRetry(error, attempt, delayMs);
        }

        // If this was the last attempt, don't delay
        if (attempt >= this.config.maxAttempts) {
          break;
        }

        // Wait before next attempt
        if (delayMs > 0) {
          await this.sleep(delayMs);
        }

        attempt++;
      }
    }

    // All retries exhausted
    if (this.config.onMaxRetriesExceeded) {
      this.config.onMaxRetriesExceeded(lastError, attempt - 1);
    }

    return this.createFailureResult(lastError, attempt - 1);
  }

  /**
   * Determine if an error should trigger a retry
   */
  private shouldRetryError(error: unknown, attempt: number): boolean {
    // Use custom shouldRetry function if provided
    if (this.config.shouldRetry) {
      return this.config.shouldRetry(error, attempt);
    }

    // Use default retry logic from error utilities
    return isRetryableError(error);
  }

  /**
   * Create a failure result
   */
  private createFailureResult(error: unknown, totalAttempts: number): RetryResult<T> {
    return {
      success: false,
      error,
      totalAttempts,
      totalTimeMs: Date.now() - this.startTime,
      attempts: [...this.attempts],
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Utility functions for retry execution
 */
export const RetryUtils = {
  /**
   * Execute an operation with retry logic using a configuration
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig
  ): Promise<RetryResult<T>> {
    const executor = new RetryExecutor<T>(config);
    return executor.execute(operation);
  },

  /**
   * Execute an operation with retry and throw on failure
   */
  async executeWithRetryOrThrow<T>(operation: () => Promise<T>, config: RetryConfig): Promise<T> {
    const result = await RetryUtils.executeWithRetry(operation, config);

    if (result.success && result.data !== undefined) {
      return result.data;
    }

    throw result.error;
  },

  /**
   * Create a retry decorator for methods
   */
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

  /**
   * Create a simple retry wrapper function
   */
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
