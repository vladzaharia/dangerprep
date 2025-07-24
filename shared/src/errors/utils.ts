/**
 * Error handling utilities and helper functions
 */

import { getCurrentErrorContext } from './context.js';
import {
  NetworkError,
  FileSystemError,
  ConfigurationError,
  ValidationError,
  ExternalServiceError,
  AuthenticationError,
  BusinessLogicError,
  SystemError,
} from './domain-errors.js';
import {
  DangerPrepError,
  ErrorSeverity,
  ErrorCategory,
  RetryClassification,
  type ErrorContext,
} from './types.js';

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: E };

/**
 * Create a successful result
 */
export function success<T>(data: T): Result<T> {
  return { success: true, data };
}

/**
 * Create a failed result
 */
export function failure<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Wrap an async operation to return a Result instead of throwing
 */
export async function safeAsync<T>(operation: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    const data = await operation();
    return success(data);
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Wrap a sync operation to return a Result instead of throwing
 */
export function safe<T>(operation: () => T): Result<T, Error> {
  try {
    const data = operation();
    return success(data);
  } catch (error) {
    return failure(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Error factory functions for creating domain-specific errors
 */
export class ErrorFactory {
  /**
   * Create a network error with current context
   */
  static network(
    message: string,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      retryClassification?: RetryClassification;
      context?: Partial<ErrorContext>;
    } = {}
  ): NetworkError {
    const context = {
      ...getCurrentErrorContext({ operation: 'network_operation' }),
      ...options.context,
    };

    return new NetworkError(message, context, options);
  }

  /**
   * Create a file system error with current context
   */
  static filesystem(
    message: string,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      retryClassification?: RetryClassification;
      context?: Partial<ErrorContext>;
    } = {}
  ): FileSystemError {
    const context = {
      ...getCurrentErrorContext({ operation: 'filesystem_operation' }),
      ...options.context,
    };

    return new FileSystemError(message, context, options);
  }

  /**
   * Create a configuration error with current context
   */
  static configuration(
    message: string,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      context?: Partial<ErrorContext>;
    } = {}
  ): ConfigurationError {
    const context = {
      ...getCurrentErrorContext({ operation: 'configuration_operation' }),
      ...options.context,
    };

    return new ConfigurationError(message, context, options);
  }

  /**
   * Create a validation error with current context
   */
  static validation(
    message: string,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      context?: Partial<ErrorContext>;
    } = {}
  ): ValidationError {
    const context = {
      ...getCurrentErrorContext({ operation: 'validation_operation' }),
      ...options.context,
    };

    return new ValidationError(message, context, options);
  }

  /**
   * Create an external service error with current context
   */
  static externalService(
    message: string,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      retryClassification?: RetryClassification;
      serviceName?: string;
      statusCode?: number;
      context?: Partial<ErrorContext>;
    } = {}
  ): ExternalServiceError {
    const context = {
      ...getCurrentErrorContext({ operation: 'external_service_operation' }),
      ...options.context,
    };

    return new ExternalServiceError(message, context, options);
  }

  /**
   * Create an authentication error with current context
   */
  static authentication(
    message: string,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      context?: Partial<ErrorContext>;
    } = {}
  ): AuthenticationError {
    const context = {
      ...getCurrentErrorContext({ operation: 'authentication_operation' }),
      ...options.context,
    };

    return new AuthenticationError(message, context, options);
  }

  /**
   * Create a business logic error with current context
   */
  static businessLogic(
    message: string,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      context?: Partial<ErrorContext>;
    } = {}
  ): BusinessLogicError {
    const context = {
      ...getCurrentErrorContext({ operation: 'business_logic_operation' }),
      ...options.context,
    };

    return new BusinessLogicError(message, context, options);
  }

  /**
   * Create a system error with current context
   */
  static system(
    message: string,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      retryClassification?: RetryClassification;
      context?: Partial<ErrorContext>;
    } = {}
  ): SystemError {
    const context = {
      ...getCurrentErrorContext({ operation: 'system_operation' }),
      ...options.context,
    };

    return new SystemError(message, context, options);
  }
}

/**
 * Utility to wrap and enhance existing errors
 */
export function wrapError(
  error: unknown,
  message?: string,
  options: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    retryClassification?: RetryClassification;
    context?: Partial<ErrorContext>;
  } = {}
): DangerPrepError {
  const originalError = error instanceof Error ? error : new Error(String(error));
  const errorMessage = message || originalError.message;

  const context = {
    ...getCurrentErrorContext({ operation: 'error_wrapping' }),
    ...options.context,
  };

  const {
    category = ErrorCategory.UNKNOWN,
    severity = ErrorSeverity.MEDIUM,
    retryClassification = RetryClassification.NON_RETRYABLE,
  } = options;

  // Create appropriate domain error based on category
  switch (category) {
    case ErrorCategory.NETWORK:
      return new NetworkError(errorMessage, context, {
        cause: originalError,
        severity,
        retryClassification,
      });
    case ErrorCategory.FILESYSTEM:
      return new FileSystemError(errorMessage, context, {
        cause: originalError,
        severity,
        retryClassification,
      });
    case ErrorCategory.CONFIGURATION:
      return new ConfigurationError(errorMessage, context, {
        cause: originalError,
        severity,
      });
    case ErrorCategory.VALIDATION:
      return new ValidationError(errorMessage, context, {
        cause: originalError,
        severity,
      });
    case ErrorCategory.EXTERNAL_SERVICE:
      return new ExternalServiceError(errorMessage, context, {
        cause: originalError,
        severity,
        retryClassification,
      });
    case ErrorCategory.AUTHENTICATION:
      return new AuthenticationError(errorMessage, context, {
        cause: originalError,
        severity,
      });
    case ErrorCategory.BUSINESS_LOGIC:
      return new BusinessLogicError(errorMessage, context, {
        cause: originalError,
        severity,
      });
    case ErrorCategory.SYSTEM:
      return new SystemError(errorMessage, context, {
        cause: originalError,
        severity,
        retryClassification,
      });
    default:
      // Create a generic DangerPrepError for unknown categories
      return new (class extends DangerPrepError {})(errorMessage, 'UNKNOWN_ERROR', {
        severity,
        category,
        retryClassification,
        context,
        cause: originalError,
      });
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof DangerPrepError) {
    return error.isRetryable() || error.isConditionallyRetryable();
  }

  // Default heuristics for non-DangerPrepError instances
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Network-related errors are usually retryable
    if (
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('network') ||
      name.includes('timeout') ||
      name.includes('network')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extract error information for logging
 */
export function extractErrorInfo(error: unknown): Record<string, unknown> {
  if (error instanceof DangerPrepError) {
    return error.toLogFormat();
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    error: String(error),
  };
}
