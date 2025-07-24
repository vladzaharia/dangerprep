/**
 * Domain-specific error classes for different categories of errors
 */

import {
  DangerPrepError,
  ErrorSeverity,
  ErrorCategory,
  RetryClassification,
  type ErrorContext,
  type ErrorMetadata,
} from './types.js';

/**
 * Network-related errors (timeouts, connection failures, DNS issues, etc.)
 */
export class NetworkError extends DangerPrepError {
  constructor(
    message: string,
    context: ErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      retryClassification?: RetryClassification;
    } = {}
  ) {
    const {
      code = 'NETWORK_ERROR',
      cause,
      data,
      severity = ErrorSeverity.HIGH,
      retryClassification = RetryClassification.RETRYABLE,
    } = options;

    const metadata: Partial<ErrorMetadata> & {
      severity: ErrorSeverity;
      category: ErrorCategory;
      context: ErrorContext;
    } = {
      severity,
      category: ErrorCategory.NETWORK,
      retryClassification,
      context,
      recoveryActions: [
        'Check network connectivity',
        'Verify service endpoints',
        'Check firewall settings',
        'Retry after delay',
      ],
    };

    if (cause !== undefined) {
      metadata.cause = cause;
    }
    if (data !== undefined) {
      metadata.data = data;
    }

    super(message, code, metadata);
  }
}

/**
 * File system errors (permissions, disk space, file operations, etc.)
 */
export class FileSystemError extends DangerPrepError {
  constructor(
    message: string,
    context: ErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      retryClassification?: RetryClassification;
    } = {}
  ) {
    const {
      code = 'FILESYSTEM_ERROR',
      cause,
      data,
      severity = ErrorSeverity.HIGH,
      retryClassification = RetryClassification.CONDITIONALLY_RETRYABLE,
    } = options;

    const metadata: Partial<ErrorMetadata> & {
      severity: ErrorSeverity;
      category: ErrorCategory;
      context: ErrorContext;
    } = {
      severity,
      category: ErrorCategory.FILESYSTEM,
      retryClassification,
      context,
      recoveryActions: [
        'Check file permissions',
        'Verify disk space availability',
        'Check file path validity',
        'Ensure directory exists',
      ],
    };

    if (cause !== undefined) {
      metadata.cause = cause;
    }
    if (data !== undefined) {
      metadata.data = data;
    }

    super(message, code, metadata);
  }
}

/**
 * Configuration errors (invalid config, missing fields, validation failures, etc.)
 */
export class ConfigurationError extends DangerPrepError {
  constructor(
    message: string,
    context: ErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
    } = {}
  ) {
    const {
      code = 'CONFIGURATION_ERROR',
      cause,
      data,
      severity = ErrorSeverity.CRITICAL,
    } = options;

    const metadata: Partial<ErrorMetadata> & {
      severity: ErrorSeverity;
      category: ErrorCategory;
      context: ErrorContext;
    } = {
      severity,
      category: ErrorCategory.CONFIGURATION,
      retryClassification: RetryClassification.NON_RETRYABLE,
      context,
      recoveryActions: [
        'Check configuration file syntax',
        'Verify required fields are present',
        'Validate configuration values',
        'Review configuration documentation',
      ],
    };

    if (cause !== undefined) {
      metadata.cause = cause;
    }
    if (data !== undefined) {
      metadata.data = data;
    }

    super(message, code, metadata);
  }
}

/**
 * Validation errors (invalid input, schema validation, data format issues, etc.)
 */
export class ValidationError extends DangerPrepError {
  constructor(
    message: string,
    context: ErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
    } = {}
  ) {
    const { code = 'VALIDATION_ERROR', cause, data, severity = ErrorSeverity.MEDIUM } = options;

    const metadata: Partial<ErrorMetadata> & {
      severity: ErrorSeverity;
      category: ErrorCategory;
      context: ErrorContext;
    } = {
      severity,
      category: ErrorCategory.VALIDATION,
      retryClassification: RetryClassification.NON_RETRYABLE,
      context,
      recoveryActions: [
        'Check input data format',
        'Verify data against schema',
        'Review validation requirements',
        'Correct invalid data',
      ],
    };

    if (cause !== undefined) {
      metadata.cause = cause;
    }
    if (data !== undefined) {
      metadata.data = data;
    }

    super(message, code, metadata);
  }
}

/**
 * External service errors (API failures, service unavailable, rate limiting, etc.)
 */
export class ExternalServiceError extends DangerPrepError {
  constructor(
    message: string,
    context: ErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      retryClassification?: RetryClassification;
      serviceName?: string;
      statusCode?: number;
    } = {}
  ) {
    const {
      code = 'EXTERNAL_SERVICE_ERROR',
      cause,
      data,
      severity = ErrorSeverity.HIGH,
      retryClassification = RetryClassification.CONDITIONALLY_RETRYABLE,
      serviceName,
      statusCode,
    } = options;

    const enhancedData = {
      ...data,
      ...(serviceName && { serviceName }),
      ...(statusCode && { statusCode }),
    };

    const metadata: Partial<ErrorMetadata> & {
      severity: ErrorSeverity;
      category: ErrorCategory;
      context: ErrorContext;
    } = {
      severity,
      category: ErrorCategory.EXTERNAL_SERVICE,
      retryClassification,
      context,
      recoveryActions: [
        'Check service availability',
        'Verify API credentials',
        'Check rate limiting',
        'Retry with exponential backoff',
      ],
    };

    if (cause !== undefined) {
      metadata.cause = cause;
    }
    if (Object.keys(enhancedData).length > 0) {
      metadata.data = enhancedData;
    }

    super(message, code, metadata);
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends DangerPrepError {
  constructor(
    message: string,
    context: ErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
    } = {}
  ) {
    const { code = 'AUTHENTICATION_ERROR', cause, data, severity = ErrorSeverity.HIGH } = options;

    const metadata: Partial<ErrorMetadata> & {
      severity: ErrorSeverity;
      category: ErrorCategory;
      context: ErrorContext;
    } = {
      severity,
      category: ErrorCategory.AUTHENTICATION,
      retryClassification: RetryClassification.NON_RETRYABLE,
      context,
      shouldNotify: true,
      recoveryActions: [
        'Check authentication credentials',
        'Verify token validity',
        'Review access permissions',
        'Refresh authentication tokens',
      ],
    };

    if (cause !== undefined) {
      metadata.cause = cause;
    }
    if (data !== undefined) {
      metadata.data = data;
    }

    super(message, code, metadata);
  }
}

/**
 * Business logic errors (invalid state, rule violations, etc.)
 */
export class BusinessLogicError extends DangerPrepError {
  constructor(
    message: string,
    context: ErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
    } = {}
  ) {
    const { code = 'BUSINESS_LOGIC_ERROR', cause, data, severity = ErrorSeverity.MEDIUM } = options;

    const metadata: Partial<ErrorMetadata> & {
      severity: ErrorSeverity;
      category: ErrorCategory;
      context: ErrorContext;
    } = {
      severity,
      category: ErrorCategory.BUSINESS_LOGIC,
      retryClassification: RetryClassification.NON_RETRYABLE,
      context,
      recoveryActions: [
        'Review business rules',
        'Check operation prerequisites',
        'Verify system state',
        'Review operation sequence',
      ],
    };

    if (cause !== undefined) {
      metadata.cause = cause;
    }
    if (data !== undefined) {
      metadata.data = data;
    }

    super(message, code, metadata);
  }
}

/**
 * System errors (resource exhaustion, system limits, etc.)
 */
export class SystemError extends DangerPrepError {
  constructor(
    message: string,
    context: ErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      severity?: ErrorSeverity;
      retryClassification?: RetryClassification;
    } = {}
  ) {
    const {
      code = 'SYSTEM_ERROR',
      cause,
      data,
      severity = ErrorSeverity.CRITICAL,
      retryClassification = RetryClassification.CONDITIONALLY_RETRYABLE,
    } = options;

    const metadata: Partial<ErrorMetadata> & {
      severity: ErrorSeverity;
      category: ErrorCategory;
      context: ErrorContext;
    } = {
      severity,
      category: ErrorCategory.SYSTEM,
      retryClassification,
      context,
      recoveryActions: [
        'Check system resources',
        'Monitor memory usage',
        'Check disk space',
        'Review system limits',
      ],
    };

    if (cause !== undefined) {
      metadata.cause = cause;
    }
    if (data !== undefined) {
      metadata.data = data;
    }

    super(message, code, metadata);
  }
}
