/**
 * Standardized error handling patterns and utilities
 */

import { Logger } from '../logging/logger.js';
import {
  NotificationManager,
  NotificationLevel,
  NotificationType,
} from '../notifications/index.js';

import { DangerPrepError, ErrorSeverity, ErrorCategory, extractErrorInfo } from './index.js';

/**
 * Error logging and notification patterns
 */
export class ErrorPatterns {
  /**
   * Log and optionally notify about an error based on its severity and type
   */
  static async logAndNotifyError(
    error: unknown,
    logger: Logger,
    notificationManager?: NotificationManager,
    options: {
      operation?: string;
      component?: string;
      suppressNotification?: boolean;
      forceNotification?: boolean;
    } = {}
  ): Promise<void> {
    const errorInfo = extractErrorInfo(error);
    const isDangerPrepError = error instanceof DangerPrepError;

    // Determine log level based on error severity
    const logLevel = isDangerPrepError
      ? ErrorPatterns.getLogLevelFromSeverity(error.metadata.severity)
      : 'error';

    // Create structured log entry
    const logEntry = {
      ...errorInfo,
      operation: options.operation,
      component: options.component,
      timestamp: new Date().toISOString(),
    };

    // Log the error
    logger[logLevel]('Error occurred', logEntry);

    // Handle notifications if notification manager is provided
    if (notificationManager && !options.suppressNotification) {
      const shouldNotify =
        options.forceNotification || (isDangerPrepError ? error.shouldTriggerNotification() : true);

      if (shouldNotify) {
        await ErrorPatterns.sendErrorNotification(
          error,
          notificationManager,
          options.operation,
          options.component
        );
      }
    }
  }

  /**
   * Send error notification based on error type and severity
   */
  static async sendErrorNotification(
    error: unknown,
    notificationManager: NotificationManager,
    operation?: string,
    component?: string
  ): Promise<void> {
    const isDangerPrepError = error instanceof DangerPrepError;

    // Determine notification level and type
    const notificationLevel = isDangerPrepError
      ? ErrorPatterns.getNotificationLevelFromSeverity(error.metadata.severity)
      : NotificationLevel.ERROR;

    const notificationType = isDangerPrepError
      ? ErrorPatterns.getNotificationTypeFromCategory(error.metadata.category)
      : NotificationType.SERVICE_ERROR;

    // Create notification message
    const message = ErrorPatterns.formatErrorMessage(error, operation, component);

    // Send notification
    const notificationOptions: {
      level: NotificationLevel;
      description: string;
      data: Record<string, unknown>;
      error?: Error;
    } = {
      level: notificationLevel,
      description: 'Error Occurred',
      data: {
        error: extractErrorInfo(error),
        operation,
        component,
        timestamp: new Date().toISOString(),
      },
    };

    if (error instanceof Error) {
      notificationOptions.error = error;
    }

    await notificationManager.notify(notificationType, message, notificationOptions);
  }

  /**
   * Format error message for notifications
   */
  static formatErrorMessage(error: unknown, operation?: string, component?: string): string {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const context = [operation, component].filter(Boolean).join(' > ');

    return context ? `${context}: ${errorMessage}` : errorMessage;
  }

  /**
   * Get log level from error severity
   */
  static getLogLevelFromSeverity(severity: ErrorSeverity): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'info';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        return 'error';
      default:
        return 'error';
    }
  }

  /**
   * Get notification level from error severity
   */
  static getNotificationLevelFromSeverity(severity: ErrorSeverity): NotificationLevel {
    switch (severity) {
      case ErrorSeverity.LOW:
        return NotificationLevel.INFO;
      case ErrorSeverity.MEDIUM:
        return NotificationLevel.WARN;
      case ErrorSeverity.HIGH:
        return NotificationLevel.ERROR;
      case ErrorSeverity.CRITICAL:
        return NotificationLevel.CRITICAL;
      default:
        return NotificationLevel.ERROR;
    }
  }

  /**
   * Get notification type from error category
   */
  static getNotificationTypeFromCategory(category: ErrorCategory): NotificationType {
    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.EXTERNAL_SERVICE:
        return NotificationType.SERVICE_ERROR;
      case ErrorCategory.FILESYSTEM:
      case ErrorCategory.CONFIGURATION:
      case ErrorCategory.VALIDATION:
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.BUSINESS_LOGIC:
      case ErrorCategory.SYSTEM:
      case ErrorCategory.UNKNOWN:
      default:
        return NotificationType.SERVICE_ERROR;
    }
  }

  /**
   * Create error aggregation key for grouping similar errors
   */
  static createAggregationKey(error: unknown, operation?: string): string {
    if (error instanceof DangerPrepError) {
      return `${error.code}:${error.metadata.category}:${operation || 'unknown'}`;
    }

    if (error instanceof Error) {
      return `${error.name}:${operation || 'unknown'}`;
    }

    return `unknown_error:${operation || 'unknown'}`;
  }

  /**
   * Determine if error should be retried based on patterns
   */
  static shouldRetryError(error: unknown, attempt: number, maxAttempts: number = 3): boolean {
    if (attempt >= maxAttempts) {
      return false;
    }

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
        message.includes('econnreset') ||
        message.includes('enotfound') ||
        name.includes('timeout') ||
        name.includes('network')
      ) {
        return true;
      }

      // File system temporary errors
      if (
        message.includes('ebusy') ||
        message.includes('eagain') ||
        message.includes('emfile') ||
        message.includes('enfile')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract recovery suggestions from error
   */
  static getRecoverySuggestions(error: unknown): string[] {
    if (error instanceof DangerPrepError) {
      return error.metadata.recoveryActions || [];
    }

    // Default recovery suggestions based on error patterns
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('network') || message.includes('connection')) {
        return [
          'Check network connectivity',
          'Verify service endpoints',
          'Check firewall settings',
          'Retry after delay',
        ];
      }

      if (message.includes('permission') || message.includes('access')) {
        return [
          'Check file permissions',
          'Verify user access rights',
          'Check directory permissions',
        ];
      }

      if (message.includes('space') || message.includes('disk')) {
        return ['Check available disk space', 'Clean up temporary files', 'Check storage quotas'];
      }
    }

    return ['Review error details and try again'];
  }
}

/**
 * Error aggregation for tracking and reporting
 */
export class ErrorAggregator {
  private errorCounts = new Map<
    string,
    {
      count: number;
      firstSeen: Date;
      lastSeen: Date;
      errors: unknown[];
    }
  >();

  /**
   * Add error to aggregation
   */
  addError(error: unknown, operation?: string): void {
    const key = ErrorPatterns.createAggregationKey(error, operation);
    const existing = this.errorCounts.get(key);

    if (existing) {
      existing.count++;
      existing.lastSeen = new Date();
      existing.errors.push(error);

      // Keep only last 10 errors to prevent memory issues
      if (existing.errors.length > 10) {
        existing.errors = existing.errors.slice(-10);
      }
    } else {
      this.errorCounts.set(key, {
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        errors: [error],
      });
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(): Array<{
    key: string;
    count: number;
    firstSeen: Date;
    lastSeen: Date;
    recentErrors: unknown[];
  }> {
    return Array.from(this.errorCounts.entries()).map(([key, data]) => ({
      key,
      count: data.count,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
      recentErrors: data.errors,
    }));
  }

  /**
   * Get most frequent errors
   */
  getMostFrequentErrors(limit: number = 10): Array<{
    key: string;
    count: number;
    firstSeen: Date;
    lastSeen: Date;
  }> {
    return Array.from(this.errorCounts.entries())
      .map(([key, data]) => ({
        key,
        count: data.count,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Clear error statistics
   */
  clear(): void {
    this.errorCounts.clear();
  }

  /**
   * Clear old error statistics
   */
  clearOldErrors(olderThanMs: number): void {
    const cutoff = new Date(Date.now() - olderThanMs);

    for (const [key, data] of this.errorCounts.entries()) {
      if (data.lastSeen < cutoff) {
        this.errorCounts.delete(key);
      }
    }
  }
}
