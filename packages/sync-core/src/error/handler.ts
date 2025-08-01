/**
 * Standardized error handler for sync services
 */

import { Logger } from '@dangerprep/logging';
import {
  NotificationManager,
  NotificationType,
  NotificationLevel,
} from '@dangerprep/notifications';
import {
  SyncErrorDetails,
  SyncErrorHandler,
  ErrorRecoveryStrategy,
  ErrorStatistics,
  SyncErrorCategory,
  SyncErrorSeverity,
  SyncRetryClassification,
  RecoveryAction,
  getDefaultRecoveryStrategy,
  shouldNotifyError,
} from '@dangerprep/types';

export interface SyncErrorHandlerConfig {
  serviceName: string;
  enableRetry: boolean;
  enableNotifications: boolean;
  enableLogging: boolean;
  customRecoveryStrategies?: Partial<Record<SyncErrorCategory, ErrorRecoveryStrategy>>;
  onError?: (error: SyncErrorDetails) => void;
  onRecovery?: (error: SyncErrorDetails, attempt: number) => void;
}

export class StandardSyncErrorHandler implements SyncErrorHandler {
  private readonly config: SyncErrorHandlerConfig;
  private readonly logger: Logger;
  private readonly notificationManager: NotificationManager | undefined;
  private readonly statistics: ErrorStatistics;

  constructor(
    config: SyncErrorHandlerConfig,
    logger: Logger,
    notificationManager?: NotificationManager
  ) {
    this.config = config;
    this.logger = logger;
    this.notificationManager = notificationManager;
    this.statistics = {
      totalErrors: 0,
      errorsByCategory: {} as Record<SyncErrorCategory, number>,
      errorsBySeverity: {} as Record<SyncErrorSeverity, number>,
      retriedErrors: 0,
      recoveredErrors: 0,
      unrecoverableErrors: 0,
    };
  }

  async handleError(error: SyncErrorDetails): Promise<void> {
    // Update statistics
    this.updateStatistics(error);

    // Log the error
    if (this.config.enableLogging && error.shouldLog) {
      this.logError(error);
    }

    // Send notifications
    if (this.config.enableNotifications && shouldNotifyError(error)) {
      await this.notifyError(error);
    }

    // Call custom error handler
    if (this.config.onError) {
      this.config.onError(error);
    }
  }

  shouldRetry(error: SyncErrorDetails, attempt: number): boolean {
    if (!this.config.enableRetry) {
      return false;
    }

    const strategy = this.getRecoveryStrategy(error);
    return strategy.shouldRetry(error, attempt);
  }

  getRecoveryStrategy(error: SyncErrorDetails): ErrorRecoveryStrategy {
    // Check for custom strategy first
    const customStrategy = this.config.customRecoveryStrategies?.[error.category];
    if (customStrategy) {
      return customStrategy;
    }

    // Use default strategy based on category
    return getDefaultRecoveryStrategy(error.category);
  }

  logError(error: SyncErrorDetails): void {
    const logContext = {
      code: error.code,
      category: error.category,
      severity: error.severity,
      operationId: error.context.operationId,
      transferId: error.context.transferId,
      correlationId: error.context.correlationId,
      ...error.data,
    };

    switch (error.severity) {
      case SyncErrorSeverity.CRITICAL:
        this.logger.error(`[${error.code}] ${error.message}`, logContext);
        break;
      case SyncErrorSeverity.HIGH:
        this.logger.error(`[${error.code}] ${error.message}`, logContext);
        break;
      case SyncErrorSeverity.MEDIUM:
        this.logger.warn(`[${error.code}] ${error.message}`, logContext);
        break;
      case SyncErrorSeverity.LOW:
        this.logger.info(`[${error.code}] ${error.message}`, logContext);
        break;
    }
  }

  async notifyError(error: SyncErrorDetails): Promise<void> {
    if (!this.notificationManager) {
      return;
    }

    const notificationType = this.getNotificationType(error.category);
    const notificationLevel = this.getNotificationLevel(error.severity);

    const notificationOptions: {
      level: NotificationLevel;
      source: string;
      data: Record<string, unknown>;
      error?: Error;
    } = {
      level: notificationLevel,
      source: this.config.serviceName,
      data: {
        code: error.code,
        category: error.category,
        operationId: error.context.operationId,
        transferId: error.context.transferId,
        recoveryActions: error.recoveryActions,
        ...error.data,
      },
    };

    if (error.cause) {
      notificationOptions.error = error.cause;
    }

    await this.notificationManager.notify(notificationType, error.message, notificationOptions);
  }

  getStatistics(): ErrorStatistics {
    return { ...this.statistics };
  }

  resetStatistics(): void {
    this.statistics.totalErrors = 0;
    this.statistics.errorsByCategory = {} as Record<SyncErrorCategory, number>;
    this.statistics.errorsBySeverity = {} as Record<SyncErrorSeverity, number>;
    this.statistics.retriedErrors = 0;
    this.statistics.recoveredErrors = 0;
    this.statistics.unrecoverableErrors = 0;
    delete this.statistics.lastErrorTime;
  }

  private updateStatistics(error: SyncErrorDetails): void {
    this.statistics.totalErrors++;
    this.statistics.lastErrorTime = new Date();

    // Update category statistics
    this.statistics.errorsByCategory[error.category] =
      (this.statistics.errorsByCategory[error.category] || 0) + 1;

    // Update severity statistics
    this.statistics.errorsBySeverity[error.severity] =
      (this.statistics.errorsBySeverity[error.severity] || 0) + 1;
  }

  private getNotificationType(category: SyncErrorCategory): NotificationType {
    switch (category) {
      case SyncErrorCategory.NETWORK:
        return NotificationType.SERVICE_ERROR;
      case SyncErrorCategory.FILESYSTEM:
        return NotificationType.CONTENT_ERROR;
      case SyncErrorCategory.DEVICE:
        return NotificationType.DEVICE_ERROR;
      case SyncErrorCategory.TRANSFER:
        return NotificationType.SYNC_FAILED;
      default:
        return NotificationType.SERVICE_ERROR;
    }
  }

  private getNotificationLevel(severity: SyncErrorSeverity): NotificationLevel {
    switch (severity) {
      case SyncErrorSeverity.CRITICAL:
        return NotificationLevel.CRITICAL;
      case SyncErrorSeverity.HIGH:
        return NotificationLevel.ERROR;
      case SyncErrorSeverity.MEDIUM:
        return NotificationLevel.WARN;
      case SyncErrorSeverity.LOW:
        return NotificationLevel.INFO;
      default:
        return NotificationLevel.ERROR;
    }
  }

  /**
   * Execute an operation with automatic error handling and retry logic
   */
  async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    context: Partial<SyncErrorDetails['context']>,
    options: {
      operationName?: string;
      customStrategy?: ErrorRecoveryStrategy;
      onRetry?: (error: SyncErrorDetails, attempt: number) => void;
    } = {}
  ): Promise<T> {
    const { operationName = 'unknown', customStrategy, onRetry } = options;
    let lastError: SyncErrorDetails | undefined;
    let attempt = 1;

    while (true) {
      try {
        const result = await operation();

        // If we had previous errors but succeeded, mark as recovered
        if (lastError) {
          this.statistics.recoveredErrors++;
          if (this.config.onRecovery) {
            this.config.onRecovery(lastError, attempt);
          }
        }

        return result;
      } catch (error) {
        const syncError: SyncErrorDetails = this.createErrorFromException(error, operationName, {
          ...context,
          serviceName: this.config.serviceName,
        });

        lastError = syncError;
        await this.handleError(syncError);

        const strategy = customStrategy || this.getRecoveryStrategy(syncError);

        if (!this.shouldRetry(syncError, attempt) || attempt >= strategy.maxRetries) {
          this.statistics.unrecoverableErrors++;
          throw error;
        }

        this.statistics.retriedErrors++;

        if (onRetry) {
          onRetry(syncError, attempt);
        } else if (this.config.onRecovery) {
          this.config.onRecovery(syncError, attempt);
        }

        // Calculate delay with backoff
        const delay = Math.min(
          strategy.retryDelay * Math.pow(strategy.backoffMultiplier, attempt - 1),
          strategy.maxRetryDelay
        );

        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      }
    }
  }

  private createErrorFromException(
    error: unknown,
    operationName: string,
    context: Partial<SyncErrorDetails['context']>
  ): SyncErrorDetails {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    const errorDetails: SyncErrorDetails = {
      code: 'OPERATION_FAILED',
      message,
      severity: SyncErrorSeverity.HIGH,
      category: SyncErrorCategory.UNKNOWN,
      retryClassification: this.classifyError(error),
      context: {
        serviceName: this.config.serviceName,
        timestamp: new Date(),
        ...context,
      },
      recoveryActions: [RecoveryAction.RETRY_WITH_DELAY],
      shouldNotify: true,
      shouldLog: true,
    };

    if (cause) {
      errorDetails.cause = cause;
    }

    return errorDetails;
  }

  private classifyError(error: unknown): SyncRetryClassification {
    // Simple error classification logic
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('connection')
      ) {
        return SyncRetryClassification.RETRYABLE;
      }

      if (
        message.includes('permission') ||
        message.includes('access') ||
        message.includes('auth')
      ) {
        return SyncRetryClassification.NON_RETRYABLE;
      }

      if (message.includes('not found') || message.includes('missing')) {
        return SyncRetryClassification.NON_RETRYABLE;
      }
    }

    return SyncRetryClassification.CONDITIONALLY_RETRYABLE;
  }
}
