/**
 * Delay calculation utilities for retry mechanisms
 */

import { RetryStrategy, JitterType, type RetryConfig } from './types.js';

/**
 * Calculate delay for retry attempts with various strategies and jitter
 */
export class DelayCalculator {
  private previousDelay = 0;

  constructor(private config: RetryConfig) {}

  /**
   * Calculate delay for a specific attempt
   */
  calculateDelay(attempt: number): number {
    const baseDelay = this.calculateBaseDelay(attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs || Infinity);
    const jitteredDelay = this.applyJitter(cappedDelay, attempt);

    this.previousDelay = jitteredDelay;
    return Math.max(0, Math.round(jitteredDelay));
  }

  /**
   * Calculate base delay without jitter or capping
   */
  private calculateBaseDelay(attempt: number): number {
    const { strategy, baseDelayMs, multiplier = 2 } = this.config;

    switch (strategy) {
      case RetryStrategy.FIXED:
        return baseDelayMs;

      case RetryStrategy.LINEAR:
        return baseDelayMs * (1 + (attempt - 1) * (multiplier - 1));

      case RetryStrategy.EXPONENTIAL:
        return baseDelayMs * Math.pow(multiplier, attempt - 1);

      default:
        return baseDelayMs;
    }
  }

  /**
   * Apply jitter to the calculated delay
   */
  private applyJitter(delay: number, _attempt: number): number {
    const { jitter } = this.config;

    switch (jitter) {
      case JitterType.NONE:
        return delay;

      case JitterType.FULL:
        return Math.random() * delay;

      case JitterType.EQUAL:
        return delay * 0.5 + Math.random() * delay * 0.5;

      case JitterType.DECORRELATED: {
        // Decorrelated jitter: random between base delay and 3 * previous delay
        const min = this.config.baseDelayMs;
        const max = Math.max(min, this.previousDelay * 3);
        return min + Math.random() * (max - min);
      }

      default:
        return delay;
    }
  }

  /**
   * Reset internal state for new retry sequence
   */
  reset(): void {
    this.previousDelay = 0;
  }
}

/**
 * Utility functions for delay calculations
 */
export const DelayUtils = {
  /**
   * Calculate total maximum time for all retries
   */
  calculateMaxTotalTime(config: RetryConfig): number {
    if (config.maxTotalTimeMs) {
      return config.maxTotalTimeMs;
    }

    // Estimate based on strategy
    const calculator = new DelayCalculator(config);
    let totalTime = 0;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      totalTime += calculator.calculateDelay(attempt);
    }

    return totalTime;
  },

  /**
   * Create a delay calculator with preset configuration
   */
  createCalculator(config: RetryConfig): DelayCalculator {
    return new DelayCalculator(config);
  },

  /**
   * Calculate delay for a single attempt without state
   */
  calculateSingleDelay(config: RetryConfig, attempt: number): number {
    const calculator = new DelayCalculator(config);
    return calculator.calculateDelay(attempt);
  },

  /**
   * Validate retry configuration
   */
  validateConfig(config: RetryConfig): string[] {
    const errors: string[] = [];

    if (config.maxAttempts < 1) {
      errors.push('maxAttempts must be at least 1');
    }

    if (config.baseDelayMs < 0) {
      errors.push('baseDelayMs must be non-negative');
    }

    if (config.maxDelayMs !== undefined && config.maxDelayMs < config.baseDelayMs) {
      errors.push('maxDelayMs must be greater than or equal to baseDelayMs');
    }

    if (config.multiplier !== undefined && config.multiplier <= 0) {
      errors.push('multiplier must be positive');
    }

    if (config.maxTotalTimeMs !== undefined && config.maxTotalTimeMs < 0) {
      errors.push('maxTotalTimeMs must be non-negative');
    }

    return errors;
  },
};
