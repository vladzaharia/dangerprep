/**
 * Error types and base classes for standardized error handling across DangerPrep services
 */

/**
 * Error severity levels for classification and handling
 */
export enum ErrorSeverity {
  /** Low severity - informational errors that don't affect operation */
  LOW = 'low',
  /** Medium severity - errors that may affect some functionality */
  MEDIUM = 'medium',
  /** High severity - errors that significantly impact functionality */
  HIGH = 'high',
  /** Critical severity - errors that prevent core functionality */
  CRITICAL = 'critical',
}

/**
 * Error retry classification for automated retry logic
 */
export enum RetryClassification {
  /** Error should not be retried */
  NON_RETRYABLE = 'non_retryable',
  /** Error can be safely retried */
  RETRYABLE = 'retryable',
  /** Error may be retryable under certain conditions */
  CONDITIONALLY_RETRYABLE = 'conditionally_retryable',
}

/**
 * Error categories for domain-specific error handling
 */
export enum ErrorCategory {
  /** Network-related errors (timeouts, connection failures, etc.) */
  NETWORK = 'network',
  /** File system errors (permissions, disk space, file not found, etc.) */
  FILESYSTEM = 'filesystem',
  /** Configuration errors (invalid config, missing required fields, etc.) */
  CONFIGURATION = 'configuration',
  /** Validation errors (invalid input, schema validation failures, etc.) */
  VALIDATION = 'validation',
  /** Authentication/authorization errors */
  AUTHENTICATION = 'authentication',
  /** External service errors (API failures, service unavailable, etc.) */
  EXTERNAL_SERVICE = 'external_service',
  /** Business logic errors (invalid state, business rule violations, etc.) */
  BUSINESS_LOGIC = 'business_logic',
  /** System errors (out of memory, system resource issues, etc.) */
  SYSTEM = 'system',
  /** Unknown or uncategorized errors */
  UNKNOWN = 'unknown',
}

/**
 * Error context for tracking operations and debugging
 */
export interface ErrorContext {
  /** Unique correlation ID for tracking errors across operations */
  correlationId: string;
  /** Operation name or identifier */
  operation?: string;
  /** Service name where the error occurred */
  service?: string;
  /** Component or module where the error occurred */
  component?: string;
  /** Additional metadata for debugging */
  metadata?: Record<string, unknown>;
  /** Timestamp when the error occurred */
  timestamp: Date;
  /** Stack trace of the operation context */
  operationStack?: string[];
}

/**
 * Enhanced error metadata for comprehensive error information
 */
export interface ErrorMetadata {
  /** Error severity level */
  severity: ErrorSeverity;
  /** Error category for domain-specific handling */
  category: ErrorCategory;
  /** Retry classification for automated retry logic */
  retryClassification: RetryClassification;
  /** Error context for tracking and debugging */
  context: ErrorContext;
  /** Original error that caused this error (error chaining) */
  cause?: Error;
  /** Additional error-specific data */
  data?: Record<string, unknown>;
  /** Suggested recovery actions */
  recoveryActions?: string[];
  /** Whether this error should trigger notifications */
  shouldNotify?: boolean;
}

/**
 * Base error class with enhanced metadata and context tracking
 */
export abstract class DangerPrepError extends Error {
  public readonly code: string;
  public readonly metadata: ErrorMetadata;

  constructor(
    message: string,
    code: string,
    metadata: Partial<ErrorMetadata> & {
      severity: ErrorSeverity;
      category: ErrorCategory;
      context: ErrorContext;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;

    // Set default metadata values
    this.metadata = {
      retryClassification: RetryClassification.NON_RETRYABLE,
      shouldNotify: true,
      ...metadata,
    };

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Get formatted error information for logging
   */
  toLogFormat(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.metadata.severity,
      category: this.metadata.category,
      retryClassification: this.metadata.retryClassification,
      correlationId: this.metadata.context.correlationId,
      operation: this.metadata.context.operation,
      service: this.metadata.context.service,
      component: this.metadata.context.component,
      timestamp: this.metadata.context.timestamp,
      ...(this.metadata.data && { data: this.metadata.data }),
      ...(this.metadata.cause && { cause: this.metadata.cause.message }),
    };
  }

  /**
   * Check if this error should be retried
   */
  isRetryable(): boolean {
    return this.metadata.retryClassification === RetryClassification.RETRYABLE;
  }

  /**
   * Check if this error may be conditionally retryable
   */
  isConditionallyRetryable(): boolean {
    return this.metadata.retryClassification === RetryClassification.CONDITIONALLY_RETRYABLE;
  }

  /**
   * Check if this error should trigger notifications
   */
  shouldTriggerNotification(): boolean {
    return this.metadata.shouldNotify === true;
  }
}
