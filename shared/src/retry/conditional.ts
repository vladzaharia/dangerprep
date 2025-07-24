/**
 * Conditional retry logic based on error types and conditions
 */

import { DangerPrepError, ErrorCategory, RetryClassification } from '../errors/types.js';
import { isRetryableError } from '../errors/utils.js';

import { RetryStrategy, JitterType, type RetryConfig } from './types.js';

/**
 * Conditional retry predicates
 */
export type RetryPredicate = (error: unknown, attempt: number) => boolean;

/**
 * Pre-built retry conditions
 */
export class RetryConditions {
  /**
   * Retry only network-related errors
   */
  static networkErrors(): RetryPredicate {
    return (error: unknown) => {
      if (error instanceof DangerPrepError) {
        return error.metadata.category === ErrorCategory.NETWORK;
      }

      // Fallback heuristics for non-DangerPrepError
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        const name = error.name.toLowerCase();
        return (
          message.includes('network') ||
          message.includes('timeout') ||
          message.includes('connection') ||
          name.includes('network') ||
          name.includes('timeout')
        );
      }

      return false;
    };
  }

  /**
   * Retry external service errors with specific status codes
   */
  static externalServiceErrors(
    retryableStatusCodes: number[] = [429, 502, 503, 504]
  ): RetryPredicate {
    return (error: unknown) => {
      if (error instanceof DangerPrepError) {
        if (error.metadata.category !== ErrorCategory.EXTERNAL_SERVICE) {
          return false;
        }

        const statusCode = error.metadata.data?.statusCode as number;
        return statusCode ? retryableStatusCodes.includes(statusCode) : true;
      }

      // Check for HTTP status codes in error messages
      if (error instanceof Error) {
        const message = error.message;
        for (const code of retryableStatusCodes) {
          if (message.includes(String(code))) {
            return true;
          }
        }
      }

      return false;
    };
  }

  /**
   * Retry file system errors that might be transient
   */
  static transientFileSystemErrors(): RetryPredicate {
    return (error: unknown) => {
      if (error instanceof DangerPrepError) {
        if (error.metadata.category !== ErrorCategory.FILESYSTEM) {
          return false;
        }

        // Only retry if marked as conditionally retryable
        return error.metadata.retryClassification === RetryClassification.CONDITIONALLY_RETRYABLE;
      }

      // Fallback heuristics
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
          message.includes('ebusy') ||
          message.includes('eagain') ||
          message.includes('emfile') ||
          message.includes('enfile') ||
          message.includes('temporarily unavailable')
        );
      }

      return false;
    };
  }

  /**
   * Retry based on error classification
   */
  static retryableClassification(): RetryPredicate {
    return (error: unknown) => {
      if (error instanceof DangerPrepError) {
        return (
          error.metadata.retryClassification === RetryClassification.RETRYABLE ||
          error.metadata.retryClassification === RetryClassification.CONDITIONALLY_RETRYABLE
        );
      }

      return isRetryableError(error);
    };
  }

  /**
   * Retry only for specific error codes
   */
  static errorCodes(retryableCodes: string[]): RetryPredicate {
    return (error: unknown) => {
      if (error instanceof DangerPrepError) {
        return retryableCodes.includes(error.code);
      }

      if (error instanceof Error && 'code' in error) {
        return retryableCodes.includes(String(error.code));
      }

      return false;
    };
  }

  /**
   * Retry based on attempt number limits
   */
  static maxAttempts(maxAttempts: number): RetryPredicate {
    return (_error: unknown, attempt: number) => attempt < maxAttempts;
  }

  /**
   * Retry based on error severity
   */
  static maxSeverity(maxSeverity: string): RetryPredicate {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const maxIndex = severityOrder.indexOf(maxSeverity.toLowerCase());

    return (error: unknown) => {
      if (error instanceof DangerPrepError) {
        const errorIndex = severityOrder.indexOf(error.metadata.severity);
        return errorIndex <= maxIndex;
      }

      return true; // Retry unknown errors by default
    };
  }

  /**
   * Combine multiple retry conditions with AND logic
   */
  static and(...conditions: RetryPredicate[]): RetryPredicate {
    return (error: unknown, attempt: number) => {
      return conditions.every(condition => condition(error, attempt));
    };
  }

  /**
   * Combine multiple retry conditions with OR logic
   */
  static or(...conditions: RetryPredicate[]): RetryPredicate {
    return (error: unknown, attempt: number) => {
      return conditions.some(condition => condition(error, attempt));
    };
  }

  /**
   * Negate a retry condition
   */
  static not(condition: RetryPredicate): RetryPredicate {
    return (error: unknown, attempt: number) => !condition(error, attempt);
  }
}

/**
 * Create retry configurations with conditional logic
 */
export class ConditionalRetryBuilder {
  private config: Partial<RetryConfig> = {};

  /**
   * Set the retry condition
   */
  when(condition: RetryPredicate): this {
    this.config.shouldRetry = condition;
    return this;
  }

  /**
   * Set maximum attempts
   */
  maxAttempts(attempts: number): this {
    this.config.maxAttempts = attempts;
    return this;
  }

  /**
   * Set base delay
   */
  baseDelay(delayMs: number): this {
    this.config.baseDelayMs = delayMs;
    return this;
  }

  /**
   * Set maximum delay
   */
  maxDelay(delayMs: number): this {
    this.config.maxDelayMs = delayMs;
    return this;
  }

  /**
   * Set retry strategy
   */
  strategy(strategy: RetryConfig['strategy']): this {
    this.config.strategy = strategy;
    return this;
  }

  /**
   * Set jitter type
   */
  jitter(jitter: RetryConfig['jitter']): this {
    this.config.jitter = jitter;
    return this;
  }

  /**
   * Set multiplier
   */
  multiplier(multiplier: number): this {
    this.config.multiplier = multiplier;
    return this;
  }

  /**
   * Set maximum total time
   */
  maxTotalTime(timeMs: number): this {
    this.config.maxTotalTimeMs = timeMs;
    return this;
  }

  /**
   * Set retry callback
   */
  onRetry(callback: RetryConfig['onRetry']): this {
    if (callback !== undefined) {
      this.config.onRetry = callback;
    }
    return this;
  }

  /**
   * Set max retries exceeded callback
   */
  onMaxRetriesExceeded(callback: RetryConfig['onMaxRetriesExceeded']): this {
    if (callback !== undefined) {
      this.config.onMaxRetriesExceeded = callback;
    }
    return this;
  }

  /**
   * Build the retry configuration
   */
  build(): RetryConfig {
    // Set defaults for required fields
    const finalConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      strategy: this.config.strategy || RetryStrategy.EXPONENTIAL,
      jitter: this.config.jitter || JitterType.EQUAL,
      ...this.config,
    };

    return finalConfig;
  }
}

/**
 * Utility functions for conditional retry
 */
export const ConditionalRetryUtils = {
  /**
   * Create a new conditional retry builder
   */
  builder(): ConditionalRetryBuilder {
    return new ConditionalRetryBuilder();
  },

  /**
   * Create a retry configuration for network operations
   */
  forNetworkOperations(): RetryConfig {
    return new ConditionalRetryBuilder()
      .when(RetryConditions.networkErrors())
      .maxAttempts(3)
      .baseDelay(500)
      .maxDelay(5000)
      .strategy(RetryStrategy.EXPONENTIAL)
      .jitter(JitterType.FULL)
      .multiplier(2)
      .build();
  },

  /**
   * Create a retry configuration for external API calls
   */
  forExternalAPIs(retryableStatusCodes?: number[]): RetryConfig {
    return new ConditionalRetryBuilder()
      .when(RetryConditions.externalServiceErrors(retryableStatusCodes))
      .maxAttempts(5)
      .baseDelay(1000)
      .maxDelay(30000)
      .strategy(RetryStrategy.EXPONENTIAL)
      .jitter(JitterType.DECORRELATED)
      .multiplier(2)
      .maxTotalTime(60000)
      .build();
  },

  /**
   * Create a retry configuration for file operations
   */
  forFileOperations(): RetryConfig {
    return new ConditionalRetryBuilder()
      .when(RetryConditions.transientFileSystemErrors())
      .maxAttempts(3)
      .baseDelay(1000)
      .maxDelay(5000)
      .strategy(RetryStrategy.LINEAR)
      .jitter(JitterType.EQUAL)
      .multiplier(1.5)
      .build();
  },
};
