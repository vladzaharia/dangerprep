/**
 * Retry mechanism types and interfaces
 */

/**
 * Retry strategy types
 */
export enum RetryStrategy {
  /** Fixed delay between retries */
  FIXED = 'fixed',
  /** Linear increase in delay */
  LINEAR = 'linear',
  /** Exponential backoff */
  EXPONENTIAL = 'exponential',
}

/**
 * Jitter types for retry delays
 */
export enum JitterType {
  /** No jitter */
  NONE = 'none',
  /** Full jitter - random delay between 0 and calculated delay */
  FULL = 'full',
  /** Equal jitter - half calculated delay plus random half */
  EQUAL = 'equal',
  /** Decorrelated jitter - random delay with correlation to previous delay */
  DECORRELATED = 'decorrelated',
}

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs?: number;
  /** Retry strategy to use */
  strategy: RetryStrategy;
  /** Jitter type for delay randomization */
  jitter: JitterType;
  /** Multiplier for exponential/linear strategies */
  multiplier?: number;
  /** Maximum total time to spend retrying in milliseconds */
  maxTotalTimeMs?: number;
  /** Function to determine if an error should be retried */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback called before each retry attempt */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Callback called when all retries are exhausted */
  onMaxRetriesExceeded?: (error: unknown, totalAttempts: number) => void;
}

/**
 * Retry attempt information
 */
export interface RetryAttempt {
  /** Current attempt number (1-based) */
  attempt: number;
  /** Total attempts made so far */
  totalAttempts: number;
  /** Delay before this attempt in milliseconds */
  delayMs: number;
  /** Total time elapsed since first attempt */
  elapsedMs: number;
  /** The error that triggered this retry */
  error: unknown;
}

/**
 * Retry result information
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** The final error if unsuccessful */
  error?: unknown;
  /** Total number of attempts made */
  totalAttempts: number;
  /** Total time spent retrying */
  totalTimeMs: number;
  /** All retry attempts made */
  attempts: RetryAttempt[];
}

/**
 * Default retry configurations for common scenarios
 */
export const DEFAULT_RETRY_CONFIGS = {
  /** Quick retries for transient network issues */
  NETWORK_QUICK: {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    strategy: RetryStrategy.EXPONENTIAL,
    jitter: JitterType.EQUAL,
    multiplier: 2,
  } as RetryConfig,

  /** Standard retries for API calls */
  API_STANDARD: {
    maxAttempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    strategy: RetryStrategy.EXPONENTIAL,
    jitter: JitterType.FULL,
    multiplier: 2,
    maxTotalTimeMs: 30000,
  } as RetryConfig,

  /** Long retries for file operations */
  FILE_OPERATIONS: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    strategy: RetryStrategy.LINEAR,
    jitter: JitterType.EQUAL,
    multiplier: 1.5,
  } as RetryConfig,

  /** Conservative retries for external services */
  EXTERNAL_SERVICE: {
    maxAttempts: 4,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    strategy: RetryStrategy.EXPONENTIAL,
    jitter: JitterType.DECORRELATED,
    multiplier: 2.5,
    maxTotalTimeMs: 60000,
  } as RetryConfig,

  /** Minimal retries for critical operations */
  CRITICAL: {
    maxAttempts: 2,
    baseDelayMs: 5000,
    maxDelayMs: 10000,
    strategy: RetryStrategy.FIXED,
    jitter: JitterType.NONE,
  } as RetryConfig,
} as const;
