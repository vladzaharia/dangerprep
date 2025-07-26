import {
  AsyncPatterns as CommonAsyncPatterns,
  type AsyncOperationOptions as CommonAsyncOperationOptions,
} from '@dangerprep/common';
import { Result, success, failure } from '@dangerprep/errors';
import { ComponentStatus } from '@dangerprep/health';
import type { Logger } from '@dangerprep/logging';
import type { Scheduler } from '@dangerprep/scheduling';

/**
 * Common service patterns and utilities
 */
export class ServicePatterns {
  /**
   * Create a standard configuration health check
   */
  static createConfigurationHealthCheck(
    isConfigLoaded: () => boolean,
    getConfigDetails?: () => Record<string, unknown>
  ) {
    return {
      name: 'configuration',
      critical: true,
      check: async () => {
        const isValid = isConfigLoaded();
        return {
          status: isValid ? ComponentStatus.UP : ComponentStatus.DOWN,
          message: isValid ? 'Configuration loaded' : 'Configuration not loaded',
          ...(isValid &&
            getConfigDetails && {
              details: getConfigDetails(),
            }),
        };
      },
    };
  }

  /**
   * Create a standard services health check
   */
  static createServicesHealthCheck(serviceName: string, services: Record<string, unknown>) {
    return {
      name: 'services',
      critical: false,
      check: async () => {
        const servicesInitialized = Object.values(services).every(service => !!service);
        return {
          status: servicesInitialized ? ComponentStatus.UP : ComponentStatus.DOWN,
          message: servicesInitialized
            ? `All ${serviceName} services initialized`
            : `${serviceName} services not fully initialized`,
          details: Object.fromEntries(
            Object.entries(services).map(([key, value]) => [key, !!value])
          ),
        };
      },
    };
  }

  /**
   * Schedule a task with error handling and logging
   */
  static scheduleTask(
    scheduler: Scheduler,
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    taskName: string,
    logger: Logger
  ): void {
    try {
      scheduler.schedule(
        taskId,
        schedule,
        async () => {
          logger.info(`Starting scheduled ${taskName}`);
          await taskFunction();
        },
        { name: taskName }
      );
      logger.info(`Scheduled ${taskName}: ${schedule}`);
    } catch (error) {
      logger.error(`Failed to schedule ${taskName}: ${error}`);
    }
  }

  /**
   * Shutdown scheduler with logging
   */
  static shutdownScheduler(scheduler: Scheduler, logger: Logger): void {
    logger.info('Shutting down scheduled tasks...');
    scheduler.destroyAll();
  }

  /**
   * Create a standard storage health check
   */
  static createStorageHealthCheck(getStorageStats: () => Promise<Record<string, unknown>>) {
    return {
      name: 'storage',
      critical: false,
      check: async () => {
        try {
          const stats = await getStorageStats();
          return {
            status: ComponentStatus.UP,
            message: 'Storage accessible',
            details: { storageStats: stats },
          };
        } catch (error) {
          return {
            status: ComponentStatus.DEGRADED,
            message: 'Storage check failed',
            error: {
              message: error instanceof Error ? error.message : String(error),
              code: 'STORAGE_CHECK_FAILED',
            },
          };
        }
      },
    };
  }
}

/**
 * Advanced async operation options
 */
export interface AsyncOperationOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Exponential backoff multiplier */
  backoffMultiplier?: number;
  /** Maximum delay between retries */
  maxRetryDelay?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Logger for operation tracking */
  logger?: Logger;
  /** Operation context for debugging */
  context?: Record<string, unknown>;
}

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
  /** Maximum number of attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelay: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  /** Maximum delay between attempts */
  maxDelay: number;
  /** Function to determine if error should trigger retry */
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Operation context for tracking and debugging
 */
export interface OperationContext {
  readonly operationId: string;
  readonly operationName: string;
  readonly startTime: Date;
  readonly metadata: Record<string, unknown>;
}

/**
 * Advanced async patterns and utilities for services
 * Now uses common AsyncPatterns with service-specific enhancements
 */
export class AdvancedAsyncPatterns {
  /**
   * Execute operation with timeout and Result pattern
   */
  static async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    options: { signal?: AbortSignal; logger?: Logger; context?: Record<string, unknown> } = {}
  ): Promise<Result<T>> {
    const { signal, logger, context } = options;

    const result = await CommonAsyncPatterns.withTimeout(operation, timeoutMs, signal);

    if (result.success && logger) {
      logger.debug('Operation completed within timeout', {
        timeoutMs,
        context,
      });
    }

    return result;
  }

  /**
   * Execute operation with retry logic and exponential backoff
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    strategy: RetryStrategy,
    options: { signal?: AbortSignal; logger?: Logger; context?: OperationContext } = {}
  ): Promise<Result<T>> {
    const { signal, logger, context } = options;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
      if (signal?.aborted) {
        return failure(new Error('Operation aborted'));
      }

      try {
        const result = await operation();

        if (attempt > 1) {
          logger?.info('Operation succeeded after retry', {
            attempt,
            totalAttempts: strategy.maxAttempts,
            context: context?.metadata,
          });
        }

        return success(result);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry this error
        if (strategy.shouldRetry && !strategy.shouldRetry(lastError, attempt)) {
          logger?.warn('Operation failed with non-retryable error', {
            error: lastError.message,
            attempt,
            context: context?.metadata,
          });
          break;
        }

        // Don't retry on last attempt
        if (attempt === strategy.maxAttempts) {
          logger?.error('Operation failed after all retry attempts', {
            error: lastError.message,
            totalAttempts: strategy.maxAttempts,
            context: context?.metadata,
          });
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1),
          strategy.maxDelay
        );

        logger?.warn('Operation failed, retrying', {
          error: lastError.message,
          attempt,
          totalAttempts: strategy.maxAttempts,
          retryDelayMs: delay,
          context: context?.metadata,
        });

        await this.delay(delay, signal);
      }
    }

    return failure(lastError || new Error('Operation failed after all retry attempts'));
  }

  /**
   * Execute multiple operations in parallel with Result pattern
   */
  static async parallel<T>(
    operations: Array<() => Promise<T>>,
    options: AsyncOperationOptions = {}
  ): Promise<Result<T[]>> {
    const { logger, context } = options;

    const commonOptions: CommonAsyncOperationOptions = {};
    if (options.timeout !== undefined) commonOptions.timeout = options.timeout;
    if (options.signal !== undefined) commonOptions.signal = options.signal;

    const result = await CommonAsyncPatterns.parallel(operations, commonOptions);

    if (result.success && logger) {
      logger.debug('Parallel operations completed', {
        operationCount: operations.length,
        context,
      });
    }

    return result;
  }

  /**
   * Execute operations sequentially with Result pattern
   */
  static async sequential<T>(
    operations: Array<() => Promise<T>>,
    options: AsyncOperationOptions = {}
  ): Promise<Result<T[]>> {
    const { logger, context } = options;

    const commonOptions: CommonAsyncOperationOptions = {};
    if (options.timeout !== undefined) commonOptions.timeout = options.timeout;
    if (options.signal !== undefined) commonOptions.signal = options.signal;

    const result = await CommonAsyncPatterns.sequential(operations, commonOptions);

    if (result.success && logger) {
      logger.debug('Sequential operations completed', {
        operationCount: operations.length,
        context,
      });
    }

    return result;
  }

  /**
   * Execute operation with circuit breaker pattern
   * @deprecated Use ResiliencePatterns.executeWithResilience from @dangerprep/resilience instead
   */
  static async withCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreaker: {
      failureThreshold: number;
      resetTimeoutMs: number;
      monitoringPeriodMs: number;
    },
    options: { logger?: Logger; context?: Record<string, unknown> } = {}
  ): Promise<Result<T>> {
    const { logger, context } = options;

    // Use the proper resilience package implementation
    const { ResiliencePatterns } = await import('@dangerprep/resilience');

    const result = await ResiliencePatterns.executeWithResilience(operation, {
      name: 'service-circuit-breaker',
      circuitBreaker: {
        name: 'service-circuit-breaker',
        failureThreshold: circuitBreaker.failureThreshold,
        failureTimeWindowMs: circuitBreaker.monitoringPeriodMs,
        recoveryTimeoutMs: circuitBreaker.resetTimeoutMs,
        successThreshold: 2,
      },
    });

    if (result.success && result.data?.success) {
      logger?.debug('Circuit breaker operation completed', { context });
      return success(result.data.data as T);
    } else {
      const error = result.data?.error || result.error;
      return failure(
        error instanceof Error ? error : new Error('Circuit breaker operation failed')
      );
    }
  }

  /**
   * Create operation context for tracking
   */
  static createOperationContext(
    operationName: string,
    metadata: Record<string, unknown> = {}
  ): OperationContext {
    return {
      operationId: `${operationName}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      operationName,
      startTime: new Date(),
      metadata: { ...metadata },
    } as const;
  }

  /**
   * Create default retry strategy
   */
  static createDefaultRetryStrategy(overrides: Partial<RetryStrategy> = {}): RetryStrategy {
    return {
      maxAttempts: 3,
      baseDelay: 1000,
      backoffMultiplier: 2,
      maxDelay: 10000,
      shouldRetry: (error: Error) => {
        // Default: retry on network errors, timeouts, and temporary failures
        const message = error.message.toLowerCase();
        return (
          message.includes('timeout') ||
          message.includes('network') ||
          message.includes('connection') ||
          message.includes('temporary') ||
          message.includes('unavailable')
        );
      },
      ...overrides,
    };
  }

  /**
   * Delay utility with abort signal support
   */
  private static async delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Delay aborted'));
        return;
      }

      const timeoutId = setTimeout(resolve, ms);

      signal?.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Delay aborted'));
      });
    });
  }

  /**
   * Execute operation with comprehensive error handling and monitoring
   */
  static async executeWithMonitoring<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: AsyncOperationOptions = {}
  ): Promise<Result<T>> {
    const { logger, context = {} } = options;

    logger?.info('Starting monitored operation', {
      operationName,
      timeout: options.timeout,
      retries: options.retries,
      context,
    });

    const operationContext = CommonAsyncPatterns.createOperationContext(operationName, context);

    const commonOptions: CommonAsyncOperationOptions = {};
    if (options.timeout !== undefined) commonOptions.timeout = options.timeout;
    if (options.retries !== undefined) commonOptions.retries = options.retries;
    if (options.retryDelay !== undefined) commonOptions.retryDelay = options.retryDelay;
    if (options.backoffMultiplier !== undefined)
      commonOptions.backoffMultiplier = options.backoffMultiplier;
    if (options.maxRetryDelay !== undefined) commonOptions.maxRetryDelay = options.maxRetryDelay;
    if (options.signal !== undefined) commonOptions.signal = options.signal;
    commonOptions.context = context;

    const result = await CommonAsyncPatterns.executeWithMonitoring(
      operation,
      operationName,
      commonOptions
    );

    const duration = Date.now() - operationContext.startTime.getTime();

    if (result.success) {
      logger?.info('Monitored operation completed successfully', {
        operationId: operationContext.operationId,
        operationName,
        durationMs: duration,
      });
    } else {
      logger?.error('Monitored operation failed', {
        operationId: operationContext.operationId,
        operationName,
        durationMs: duration,
        error: result.error?.message,
      });
    }

    return result;
  }
}
