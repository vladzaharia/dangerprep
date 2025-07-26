/**
 * @dangerprep/resilience - Comprehensive resilience patterns for fault tolerance
 *
 * This package combines circuit breaker and retry patterns into a unified resilience
 * solution for building fault-tolerant applications.
 *
 * Features:
 * - Circuit breaker pattern with configurable thresholds and recovery
 * - Retry mechanisms with exponential backoff and jitter
 * - Combined resilience patterns with fallback support
 * - Timeout handling and comprehensive error management
 * - Pre-configured patterns for common scenarios
 * - Integration with DangerPrep error classification system
 */

// Core types and enums
export {
  // Circuit Breaker types
  CircuitBreakerState,
  CircuitBreakerOpenError,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitBreakerResult,

  // Retry types
  RetryStrategy,
  JitterType,
  type RetryConfig,
  type RetryAttempt,
  type RetryResult,

  // Combined resilience types
  type ResilienceConfig,
  type ResilienceResult,

  // Branded types
  type ResilienceName,
  type FailureCount,
  type TimeoutMs,
  isResilienceName,
  isFailureCount,
  isTimeoutMs,
  createResilienceName,
  createFailureCount,
  createTimeoutMs,

  // Default configurations
  DEFAULT_CIRCUIT_BREAKER_CONFIGS,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_RESILIENCE_CONFIGS,
} from './types.js';

// Circuit breaker implementation
export { CircuitBreaker } from './circuit-breaker.js';

// Retry implementation
export { DelayCalculator, RetryExecutor, RetryUtils } from './retry.js';

// Combined resilience patterns
export { ResilienceExecutor, ResiliencePatterns } from './patterns.js';

// Import types for internal use
import { CircuitBreaker } from './circuit-breaker.js';
import { ResilienceExecutor, ResiliencePatterns } from './patterns.js';
import { RetryExecutor } from './retry.js';
import type { CircuitBreakerConfig, RetryConfig, ResilienceConfig } from './types.js';
import {
  DEFAULT_CIRCUIT_BREAKER_CONFIGS,
  DEFAULT_RETRY_CONFIGS,
  DEFAULT_RESILIENCE_CONFIGS,
} from './types.js';

// Convenience aliases for backward compatibility
export { CircuitBreaker as Breaker } from './circuit-breaker.js';
export { RetryExecutor as Retry, RetryUtils as RetryHelpers } from './retry.js';

// Type aliases for backward compatibility
export type {
  CircuitBreakerConfig as BreakerConfig,
  CircuitBreakerResult as BreakerResult,
  CircuitBreakerMetrics as BreakerMetrics,
} from './types.js';

// Re-export common utilities that work well with resilience patterns
export {
  AsyncPatterns,
  type AsyncOperationOptions,
  type OperationContext,
} from '@dangerprep/common';

/**
 * Resilience utility functions for common use cases
 */
export const ResilienceUtils = {
  /**
   * Create a circuit breaker with sensible defaults
   */
  createCircuitBreaker(
    name: string,
    overrides: Partial<CircuitBreakerConfig> = {}
  ): CircuitBreaker {
    const config: CircuitBreakerConfig = {
      name,
      failureThreshold: 10,
      failureTimeWindowMs: 60000,
      recoveryTimeoutMs: 30000,
      successThreshold: 3,
      requestTimeoutMs: 5000,
      ...DEFAULT_CIRCUIT_BREAKER_CONFIGS.API_STANDARD,
      ...overrides,
    };
    return new CircuitBreaker(config);
  },

  /**
   * Create a retry executor with sensible defaults
   */
  createRetryExecutor<T>(overrides: Partial<RetryConfig> = {}): RetryExecutor<T> {
    const config: RetryConfig = {
      ...DEFAULT_RETRY_CONFIGS.API_STANDARD,
      ...overrides,
    };
    return new RetryExecutor<T>(config);
  },

  /**
   * Create a resilience executor with sensible defaults
   */
  createResilienceExecutor<T>(
    name: string,
    overrides: Partial<ResilienceConfig> = {}
  ): ResilienceExecutor<T> {
    const config: ResilienceConfig = {
      name,
      circuitBreaker: {
        name,
        failureThreshold: 10,
        failureTimeWindowMs: 60000,
        recoveryTimeoutMs: 30000,
        successThreshold: 3,
        requestTimeoutMs: 5000,
        ...DEFAULT_CIRCUIT_BREAKER_CONFIGS.API_STANDARD,
      },
      retry: DEFAULT_RETRY_CONFIGS.API_STANDARD,
      timeout: 30000,
      ...overrides,
    };
    return new ResilienceExecutor<T>(config);
  },

  /**
   * Quick resilient wrapper for any async function
   */
  makeResilient<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    name: string,
    config: Partial<ResilienceConfig> = {}
  ): (...args: T) => Promise<R> {
    const resilienceConfig: ResilienceConfig = {
      name,
      ...DEFAULT_RESILIENCE_CONFIGS.API_RESILIENT,
      ...config,
    };

    return async (...args: T): Promise<R> => {
      const operation = () => fn(...args);
      return ResiliencePatterns.executeWithResilienceOrThrow(operation, resilienceConfig);
    };
  },

  /**
   * Create a resilient HTTP client wrapper
   */
  makeHttpClientResilient<T extends Record<string, (...args: unknown[]) => Promise<unknown>>>(
    client: T,
    config: Partial<ResilienceConfig> = {}
  ): T {
    return ResiliencePatterns.createResilientApiClient(client, {
      circuitBreaker: {
        name: 'http-client',
        failureThreshold: 10,
        failureTimeWindowMs: 60000,
        recoveryTimeoutMs: 30000,
        successThreshold: 3,
        requestTimeoutMs: 5000,
        ...DEFAULT_CIRCUIT_BREAKER_CONFIGS.API_STANDARD,
      },
      retry: DEFAULT_RETRY_CONFIGS.API_STANDARD,
      timeout: 30000,
      ...config,
    });
  },

  /**
   * Create a resilient database client wrapper
   */
  makeDatabaseClientResilient<T extends Record<string, (...args: unknown[]) => Promise<unknown>>>(
    client: T,
    config: Partial<ResilienceConfig> = {}
  ): T {
    return ResiliencePatterns.createResilientApiClient(client, {
      circuitBreaker: {
        name: 'database-client',
        failureThreshold: 3,
        failureTimeWindowMs: 30000,
        recoveryTimeoutMs: 60000,
        successThreshold: 5,
        requestTimeoutMs: 10000,
        ...DEFAULT_CIRCUIT_BREAKER_CONFIGS.CONSERVATIVE,
      },
      retry: DEFAULT_RETRY_CONFIGS.CRITICAL,
      timeout: 10000,
      ...config,
    });
  },

  /**
   * Create a resilient external service wrapper
   */
  makeExternalServiceResilient<T extends Record<string, (...args: unknown[]) => Promise<unknown>>>(
    service: T,
    config: Partial<ResilienceConfig> = {}
  ): T {
    return ResiliencePatterns.createResilientExternalService(service, config);
  },
} as const;
