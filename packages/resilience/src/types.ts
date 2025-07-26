/**
 * Unified resilience types combining circuit breaker and retry patterns
 */

import {
  type ComponentName,
  ComponentName as ComponentNameFactory,
  type TimeoutMs as CommonTimeoutMs,
  TimeoutMs as TimeoutMsFactory,
  type NonNegativeInteger,
  NonNegativeInteger as NonNegativeIntegerFactory,
} from '@dangerprep/common';

// Re-export common branded types
export type ResilienceName = ComponentName;
export type FailureCount = NonNegativeInteger;
export type TimeoutMs = CommonTimeoutMs;

export const isResilienceName = ComponentNameFactory.guard;
export const isFailureCount = NonNegativeIntegerFactory.guard;
export const isTimeoutMs = TimeoutMsFactory.guard;

export const createResilienceName = ComponentNameFactory.create;
export const createFailureCount = NonNegativeIntegerFactory.create;
export const createTimeoutMs = TimeoutMsFactory.create;

// Circuit Breaker Types
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  failureTimeWindowMs: number;
  recoveryTimeoutMs: number;
  successThreshold: number;
  requestTimeoutMs?: number;
  isFailure?: (error: unknown) => boolean;
  onOpen?: (name: string, failureCount: number) => void;
  onClose?: (name: string) => void;
  onHalfOpen?: (name: string) => void;
  onReject?: (name: string) => void;
}

export interface CircuitBreakerMetrics {
  readonly state: CircuitBreakerState;
  readonly totalRequests: number;
  readonly successfulRequests: number;
  readonly failedRequests: number;
  readonly rejectedRequests: number;
  readonly failureRate: number;
  readonly successRate: number;
  readonly currentFailureCount: number;
  readonly lastOpenedAt?: Date | undefined;
  readonly nextRecoveryAttemptAt?: Date | undefined;
}

export interface CircuitBreakerResult<T> {
  readonly success: boolean;
  readonly data?: T | undefined;
  readonly error?: unknown;
  readonly rejected: boolean;
  readonly state: CircuitBreakerState;
  readonly executionTimeMs: number;
}

// Retry Types
export enum RetryStrategy {
  FIXED = 'fixed',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
}

export enum JitterType {
  NONE = 'none',
  FULL = 'full',
  EQUAL = 'equal',
  DECORRELATED = 'decorrelated',
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  strategy: RetryStrategy;
  jitter: JitterType;
  multiplier?: number;
  maxTotalTimeMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  onMaxRetriesExceeded?: (error: unknown, totalAttempts: number) => void;
}

export interface RetryAttempt {
  attempt: number;
  totalAttempts: number;
  delayMs: number;
  elapsedMs: number;
  error: unknown;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T | undefined;
  error?: unknown;
  totalAttempts: number;
  totalTimeMs: number;
  attempts: RetryAttempt[];
}

// Combined Resilience Types
export interface ResilienceConfig {
  name: string;
  circuitBreaker?: CircuitBreakerConfig;
  retry?: RetryConfig;
  timeout?: number;
  fallback?: <T>(error: unknown) => Promise<T> | T;
}

export interface ResilienceResult<T> {
  success: boolean;
  data?: T | undefined;
  error?: unknown;
  executionTimeMs: number;
  circuitBreakerResult?: CircuitBreakerResult<T> | undefined;
  retryResult?: RetryResult<T> | undefined;
  fallbackUsed: boolean;
  timedOut: boolean;
}

// Default Configurations
export const DEFAULT_CIRCUIT_BREAKER_CONFIGS = {
  FAST_FAIL: {
    failureThreshold: 5,
    failureTimeWindowMs: 10000,
    recoveryTimeoutMs: 5000,
    successThreshold: 2,
    requestTimeoutMs: 1000,
  } as Partial<CircuitBreakerConfig>,

  API_STANDARD: {
    failureThreshold: 10,
    failureTimeWindowMs: 60000,
    recoveryTimeoutMs: 30000,
    successThreshold: 3,
    requestTimeoutMs: 5000,
  } as Partial<CircuitBreakerConfig>,

  CONSERVATIVE: {
    failureThreshold: 3,
    failureTimeWindowMs: 30000,
    recoveryTimeoutMs: 60000,
    successThreshold: 5,
    requestTimeoutMs: 10000,
  } as Partial<CircuitBreakerConfig>,

  EXTERNAL_SERVICE: {
    failureThreshold: 15,
    failureTimeWindowMs: 120000,
    recoveryTimeoutMs: 60000,
    successThreshold: 3,
    requestTimeoutMs: 30000,
  } as Partial<CircuitBreakerConfig>,
} as const;

export const DEFAULT_RETRY_CONFIGS = {
  NETWORK_QUICK: {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    strategy: RetryStrategy.EXPONENTIAL,
    jitter: JitterType.EQUAL,
    multiplier: 2,
  } as RetryConfig,

  API_STANDARD: {
    maxAttempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    strategy: RetryStrategy.EXPONENTIAL,
    jitter: JitterType.FULL,
    multiplier: 2,
    maxTotalTimeMs: 30000,
  } as RetryConfig,

  FILE_OPERATIONS: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    strategy: RetryStrategy.LINEAR,
    jitter: JitterType.EQUAL,
    multiplier: 1.5,
  } as RetryConfig,

  EXTERNAL_SERVICE: {
    maxAttempts: 4,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    strategy: RetryStrategy.EXPONENTIAL,
    jitter: JitterType.DECORRELATED,
    multiplier: 2.5,
    maxTotalTimeMs: 60000,
  } as RetryConfig,

  CRITICAL: {
    maxAttempts: 2,
    baseDelayMs: 5000,
    maxDelayMs: 10000,
    strategy: RetryStrategy.FIXED,
    jitter: JitterType.NONE,
  } as RetryConfig,
} as const;

export const DEFAULT_RESILIENCE_CONFIGS = {
  API_RESILIENT: {
    circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIGS.API_STANDARD,
    retry: DEFAULT_RETRY_CONFIGS.API_STANDARD,
    timeout: 30000,
  } as Partial<ResilienceConfig>,

  EXTERNAL_SERVICE_RESILIENT: {
    circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIGS.EXTERNAL_SERVICE,
    retry: DEFAULT_RETRY_CONFIGS.EXTERNAL_SERVICE,
    timeout: 60000,
  } as Partial<ResilienceConfig>,

  FAST_FAIL_RESILIENT: {
    circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIGS.FAST_FAIL,
    retry: DEFAULT_RETRY_CONFIGS.NETWORK_QUICK,
    timeout: 5000,
  } as Partial<ResilienceConfig>,
} as const;

// Error Classes
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly circuitBreakerName: string,
    public readonly state: CircuitBreakerState,
    public readonly nextRecoveryAttemptAt?: Date
  ) {
    super(
      `Circuit breaker '${circuitBreakerName}' is ${state}${
        nextRecoveryAttemptAt
          ? `. Next recovery attempt at ${nextRecoveryAttemptAt.toISOString()}`
          : ''
      }`
    );
    this.name = 'CircuitBreakerOpenError';
  }
}
