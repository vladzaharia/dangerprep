/**
 * Shared error types and interfaces for DangerPrep sync services
 */

// Error severity levels for sync operations
export enum SyncErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Error categories specific to sync operations
export enum SyncErrorCategory {
  NETWORK = 'network',
  FILESYSTEM = 'filesystem',
  AUTHENTICATION = 'authentication',
  CONFIGURATION = 'configuration',
  VALIDATION = 'validation',
  TRANSFER = 'transfer',
  DEVICE = 'device',
  PERMISSION = 'permission',
  RESOURCE = 'resource',
  TIMEOUT = 'timeout',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

// Retry classification for sync errors
export enum SyncRetryClassification {
  RETRYABLE = 'retryable',
  CONDITIONALLY_RETRYABLE = 'conditionally_retryable',
  NON_RETRYABLE = 'non_retryable',
}

// Recovery action types
export enum RecoveryAction {
  RETRY_IMMEDIATELY = 'retry_immediately',
  RETRY_WITH_DELAY = 'retry_with_delay',
  RETRY_WITH_BACKOFF = 'retry_with_backoff',
  SKIP_ITEM = 'skip_item',
  ABORT_OPERATION = 'abort_operation',
  RESTART_SERVICE = 'restart_service',
  MANUAL_INTERVENTION = 'manual_intervention',
  IGNORE = 'ignore',
}

// Sync error context
export interface SyncErrorContext {
  operationId?: string;
  transferId?: string;
  serviceName: string;
  operationType?: string;
  sourcePath?: string;
  destinationPath?: string;
  deviceId?: string;
  timestamp: Date;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

// Sync error details
export interface SyncErrorDetails {
  code: string;
  message: string;
  severity: SyncErrorSeverity;
  category: SyncErrorCategory;
  retryClassification: SyncRetryClassification;
  context: SyncErrorContext;
  cause?: Error;
  recoveryActions: RecoveryAction[];
  shouldNotify: boolean;
  shouldLog: boolean;
  data?: Record<string, unknown>;
}

// Sync operation result
export interface SyncOperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: SyncErrorDetails;
  warnings?: SyncErrorDetails[];
  metadata?: Record<string, unknown>;
}

// Error recovery strategy
export interface ErrorRecoveryStrategy {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxRetryDelay: number;
  shouldRetry: (error: SyncErrorDetails, attempt: number) => boolean;
  onRetry?: (error: SyncErrorDetails, attempt: number) => void;
  onMaxRetriesExceeded?: (error: SyncErrorDetails) => void;
}

// Error handler interface
export interface SyncErrorHandler {
  handleError(error: SyncErrorDetails): Promise<void>;
  shouldRetry(error: SyncErrorDetails, attempt: number): boolean;
  getRecoveryStrategy(error: SyncErrorDetails): ErrorRecoveryStrategy;
  logError(error: SyncErrorDetails): void;
  notifyError(error: SyncErrorDetails): Promise<void>;
}

// Error statistics
export interface ErrorStatistics {
  totalErrors: number;
  errorsByCategory: Record<SyncErrorCategory, number>;
  errorsBySeverity: Record<SyncErrorSeverity, number>;
  retriedErrors: number;
  recoveredErrors: number;
  unrecoverableErrors: number;
  lastErrorTime?: Date;
}

// Utility functions for error handling
export const createSyncError = (
  code: string,
  message: string,
  context: SyncErrorContext,
  options: Partial<SyncErrorDetails> = {}
): SyncErrorDetails => ({
  code,
  message,
  severity: SyncErrorSeverity.MEDIUM,
  category: SyncErrorCategory.UNKNOWN,
  retryClassification: SyncRetryClassification.NON_RETRYABLE,
  context,
  recoveryActions: [RecoveryAction.MANUAL_INTERVENTION],
  shouldNotify: true,
  shouldLog: true,
  ...options,
});

export const createSuccessResult = <T>(
  data: T,
  metadata?: Record<string, unknown>
): SyncOperationResult<T> => ({
  success: true,
  data,
  ...(metadata && { metadata }),
});

export const createErrorResult = <T>(
  error: SyncErrorDetails,
  warnings?: SyncErrorDetails[]
): SyncOperationResult<T> => ({
  success: false,
  error,
  ...(warnings && { warnings }),
});

export const isRetryableError = (error: SyncErrorDetails): boolean => {
  return (
    error.retryClassification === SyncRetryClassification.RETRYABLE ||
    error.retryClassification === SyncRetryClassification.CONDITIONALLY_RETRYABLE
  );
};

export const shouldNotifyError = (error: SyncErrorDetails): boolean => {
  return (
    error.shouldNotify &&
    (error.severity === SyncErrorSeverity.HIGH || error.severity === SyncErrorSeverity.CRITICAL)
  );
};

export const getDefaultRecoveryStrategy = (category: SyncErrorCategory): ErrorRecoveryStrategy => {
  const baseStrategy: ErrorRecoveryStrategy = {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    maxRetryDelay: 30000,
    shouldRetry: (error, attempt) => isRetryableError(error) && attempt < 3,
  };

  switch (category) {
    case SyncErrorCategory.NETWORK:
      return { ...baseStrategy, maxRetries: 5, retryDelay: 2000 };
    case SyncErrorCategory.FILESYSTEM:
      return { ...baseStrategy, maxRetries: 3, retryDelay: 1000 };
    case SyncErrorCategory.DEVICE:
      return { ...baseStrategy, maxRetries: 2, retryDelay: 5000 };
    case SyncErrorCategory.TIMEOUT:
      return { ...baseStrategy, maxRetries: 2, retryDelay: 3000 };
    default:
      return baseStrategy;
  }
};
