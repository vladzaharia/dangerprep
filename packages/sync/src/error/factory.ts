/**
 * Error factory functions for common sync error scenarios
 */

import {
  SyncErrorDetails,
  SyncErrorContext,
  SyncErrorCategory,
  SyncErrorSeverity,
  SyncRetryClassification,
  RecoveryAction,
  createSyncError,
} from '@dangerprep/types';

/**
 * Factory functions for creating standardized sync errors
 */
export class SyncErrorFactory {
  /**
   * Create a network-related error
   */
  static createNetworkError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
    } = {}
  ): SyncErrorDetails {
    const { code = 'NETWORK_ERROR', cause, data } = options;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.HIGH,
      category: SyncErrorCategory.NETWORK,
      retryClassification: SyncRetryClassification.RETRYABLE,
      recoveryActions: [RecoveryAction.RETRY_WITH_BACKOFF, RecoveryAction.MANUAL_INTERVENTION],
    };

    if (cause) errorOptions.cause = cause;
    if (data) errorOptions.data = data;

    return createSyncError(code, message, context, errorOptions);
  }

  /**
   * Create a filesystem-related error
   */
  static createFilesystemError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      isRetryable?: boolean;
    } = {}
  ): SyncErrorDetails {
    const { code = 'FILESYSTEM_ERROR', cause, data, isRetryable = true } = options;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.HIGH,
      category: SyncErrorCategory.FILESYSTEM,
      retryClassification: isRetryable
        ? SyncRetryClassification.RETRYABLE
        : SyncRetryClassification.NON_RETRYABLE,
      recoveryActions: isRetryable
        ? [RecoveryAction.RETRY_WITH_DELAY, RecoveryAction.MANUAL_INTERVENTION]
        : [RecoveryAction.MANUAL_INTERVENTION],
    };

    if (cause) errorOptions.cause = cause;
    if (data) errorOptions.data = data;

    return createSyncError(code, message, context, errorOptions);
  }

  /**
   * Create a device-related error
   */
  static createDeviceError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
    } = {}
  ): SyncErrorDetails {
    const { code = 'DEVICE_ERROR', cause, data } = options;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.HIGH,
      category: SyncErrorCategory.DEVICE,
      retryClassification: SyncRetryClassification.CONDITIONALLY_RETRYABLE,
      recoveryActions: [
        RecoveryAction.RETRY_WITH_DELAY,
        RecoveryAction.RESTART_SERVICE,
        RecoveryAction.MANUAL_INTERVENTION,
      ],
    };

    if (cause) errorOptions.cause = cause;
    if (data) errorOptions.data = data;

    return createSyncError(code, message, context, errorOptions);
  }

  /**
   * Create a transfer-related error
   */
  static createTransferError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      transferId?: string;
    } = {}
  ): SyncErrorDetails {
    const { code = 'TRANSFER_ERROR', cause, data, transferId } = options;

    const enhancedContext = transferId ? { ...context, transferId } : context;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.MEDIUM,
      category: SyncErrorCategory.TRANSFER,
      retryClassification: SyncRetryClassification.RETRYABLE,
      recoveryActions: [RecoveryAction.RETRY_WITH_DELAY, RecoveryAction.SKIP_ITEM],
    };

    if (cause) errorOptions.cause = cause;
    if (data) errorOptions.data = data;

    return createSyncError(code, message, enhancedContext, errorOptions);
  }

  /**
   * Create a permission-related error
   */
  static createPermissionError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
    } = {}
  ): SyncErrorDetails {
    const { code = 'PERMISSION_ERROR', cause, data } = options;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.HIGH,
      category: SyncErrorCategory.PERMISSION,
      retryClassification: SyncRetryClassification.NON_RETRYABLE,
      recoveryActions: [RecoveryAction.MANUAL_INTERVENTION],
    };

    if (cause) errorOptions.cause = cause;
    if (data) errorOptions.data = data;

    return createSyncError(code, message, context, errorOptions);
  }

  /**
   * Create a timeout error
   */
  static createTimeoutError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      timeoutMs?: number;
    } = {}
  ): SyncErrorDetails {
    const { code = 'TIMEOUT_ERROR', cause, data, timeoutMs } = options;

    const enhancedData = timeoutMs ? { ...data, timeoutMs } : data;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.MEDIUM,
      category: SyncErrorCategory.TIMEOUT,
      retryClassification: SyncRetryClassification.RETRYABLE,
      recoveryActions: [RecoveryAction.RETRY_WITH_DELAY, RecoveryAction.MANUAL_INTERVENTION],
    };

    if (cause) errorOptions.cause = cause;
    if (enhancedData) errorOptions.data = enhancedData;

    return createSyncError(code, message, context, errorOptions);
  }

  /**
   * Create a configuration error
   */
  static createConfigurationError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
    } = {}
  ): SyncErrorDetails {
    const { code = 'CONFIGURATION_ERROR', cause, data } = options;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.CRITICAL,
      category: SyncErrorCategory.CONFIGURATION,
      retryClassification: SyncRetryClassification.NON_RETRYABLE,
      recoveryActions: [RecoveryAction.MANUAL_INTERVENTION],
      shouldNotify: true,
    };

    if (cause) errorOptions.cause = cause;
    if (data) errorOptions.data = data;

    return createSyncError(code, message, context, errorOptions);
  }

  /**
   * Create a validation error
   */
  static createValidationError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      validationErrors?: string[];
    } = {}
  ): SyncErrorDetails {
    const { code = 'VALIDATION_ERROR', cause, data, validationErrors } = options;

    const enhancedData = validationErrors ? { ...data, validationErrors } : data;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.MEDIUM,
      category: SyncErrorCategory.VALIDATION,
      retryClassification: SyncRetryClassification.NON_RETRYABLE,
      recoveryActions: [RecoveryAction.MANUAL_INTERVENTION],
    };

    if (cause) errorOptions.cause = cause;
    if (enhancedData) errorOptions.data = enhancedData;

    return createSyncError(code, message, context, errorOptions);
  }

  /**
   * Create a resource exhaustion error
   */
  static createResourceError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
      resourceType?: string;
    } = {}
  ): SyncErrorDetails {
    const { code = 'RESOURCE_ERROR', cause, data, resourceType } = options;

    const enhancedData = resourceType ? { ...data, resourceType } : data;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.HIGH,
      category: SyncErrorCategory.RESOURCE,
      retryClassification: SyncRetryClassification.CONDITIONALLY_RETRYABLE,
      recoveryActions: [
        RecoveryAction.RETRY_WITH_DELAY,
        RecoveryAction.RESTART_SERVICE,
        RecoveryAction.MANUAL_INTERVENTION,
      ],
    };

    if (cause) errorOptions.cause = cause;
    if (enhancedData) errorOptions.data = enhancedData;

    return createSyncError(code, message, context, errorOptions);
  }

  /**
   * Create an authentication error
   */
  static createAuthenticationError(
    message: string,
    context: SyncErrorContext,
    options: {
      code?: string;
      cause?: Error;
      data?: Record<string, unknown>;
    } = {}
  ): SyncErrorDetails {
    const { code = 'AUTHENTICATION_ERROR', cause, data } = options;

    const errorOptions: Partial<SyncErrorDetails> = {
      severity: SyncErrorSeverity.HIGH,
      category: SyncErrorCategory.AUTHENTICATION,
      retryClassification: SyncRetryClassification.NON_RETRYABLE,
      recoveryActions: [RecoveryAction.MANUAL_INTERVENTION],
      shouldNotify: true,
    };

    if (cause) errorOptions.cause = cause;
    if (data) errorOptions.data = data;

    return createSyncError(code, message, context, errorOptions);
  }
}
