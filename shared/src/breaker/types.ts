/**
 * Circuit breaker types and interfaces
 */

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  /** Circuit is closed - requests are allowed through */
  CLOSED = 'closed',
  /** Circuit is open - requests are rejected immediately */
  OPEN = 'open',
  /** Circuit is half-open - limited requests are allowed to test recovery */
  HALF_OPEN = 'half_open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Name identifier for the circuit breaker */
  name: string;
  /** Number of failures required to open the circuit */
  failureThreshold: number;
  /** Time window in milliseconds for counting failures */
  failureTimeWindowMs: number;
  /** Time to wait before attempting recovery (half-open state) */
  recoveryTimeoutMs: number;
  /** Number of successful requests required to close the circuit from half-open */
  successThreshold: number;
  /** Timeout for individual requests in milliseconds */
  requestTimeoutMs?: number;
  /** Function to determine if an error should count as a failure */
  isFailure?: (error: unknown) => boolean;
  /** Callback when circuit breaker opens */
  onOpen?: (name: string, failures: number) => void;
  /** Callback when circuit breaker closes */
  onClose?: (name: string) => void;
  /** Callback when circuit breaker transitions to half-open */
  onHalfOpen?: (name: string) => void;
  /** Callback when a request is rejected due to open circuit */
  onReject?: (name: string) => void;
}

/**
 * Circuit breaker metrics
 */
export interface CircuitBreakerMetrics {
  /** Current state of the circuit breaker */
  state: CircuitBreakerState;
  /** Total number of requests made */
  totalRequests: number;
  /** Number of successful requests */
  successfulRequests: number;
  /** Number of failed requests */
  failedRequests: number;
  /** Number of rejected requests (due to open circuit) */
  rejectedRequests: number;
  /** Current failure count in the time window */
  currentFailures: number;
  /** Timestamp when circuit was last opened */
  lastOpenedAt?: Date;
  /** Timestamp when circuit was last closed */
  lastClosedAt?: Date;
  /** Time until next recovery attempt (for open state) */
  nextRecoveryAttemptAt?: Date;
}

/**
 * Circuit breaker execution result
 */
export interface CircuitBreakerResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** The error if unsuccessful */
  error?: unknown;
  /** Whether the request was rejected by the circuit breaker */
  rejected: boolean;
  /** Current circuit breaker state */
  state: CircuitBreakerState;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * Circuit breaker error thrown when circuit is open
 */
export class CircuitBreakerOpenError extends Error {
  public readonly circuitBreakerName: string;
  public readonly state: CircuitBreakerState;
  public readonly nextRecoveryAttemptAt?: Date;

  constructor(
    circuitBreakerName: string,
    state: CircuitBreakerState,
    nextRecoveryAttemptAt?: Date
  ) {
    super(`Circuit breaker '${circuitBreakerName}' is ${state}`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitBreakerName = circuitBreakerName;
    this.state = state;
    if (nextRecoveryAttemptAt !== undefined) {
      this.nextRecoveryAttemptAt = nextRecoveryAttemptAt;
    }

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}

/**
 * Default circuit breaker configurations for common scenarios
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIGS = {
  /** Fast-failing circuit breaker for quick operations */
  FAST_FAIL: {
    failureThreshold: 5,
    failureTimeWindowMs: 10000, // 10 seconds
    recoveryTimeoutMs: 5000, // 5 seconds
    successThreshold: 2,
    requestTimeoutMs: 1000, // 1 second
  } as Partial<CircuitBreakerConfig>,

  /** Standard circuit breaker for API calls */
  API_STANDARD: {
    failureThreshold: 10,
    failureTimeWindowMs: 60000, // 1 minute
    recoveryTimeoutMs: 30000, // 30 seconds
    successThreshold: 3,
    requestTimeoutMs: 5000, // 5 seconds
  } as Partial<CircuitBreakerConfig>,

  /** Conservative circuit breaker for critical operations */
  CONSERVATIVE: {
    failureThreshold: 3,
    failureTimeWindowMs: 30000, // 30 seconds
    recoveryTimeoutMs: 60000, // 1 minute
    successThreshold: 5,
    requestTimeoutMs: 10000, // 10 seconds
  } as Partial<CircuitBreakerConfig>,

  /** Resilient circuit breaker for external services */
  EXTERNAL_SERVICE: {
    failureThreshold: 15,
    failureTimeWindowMs: 120000, // 2 minutes
    recoveryTimeoutMs: 60000, // 1 minute
    successThreshold: 3,
    requestTimeoutMs: 30000, // 30 seconds
  } as Partial<CircuitBreakerConfig>,
} as const;
