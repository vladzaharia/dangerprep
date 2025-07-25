import { Result, success, failure, safeAsync } from '@dangerprep/errors';
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

    return safeAsync(async () => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Operation timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        signal?.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Operation aborted'));
        });
      });

      const result = await Promise.race([operation(), timeoutPromise]);

      logger?.debug('Operation completed within timeout', {
        timeoutMs,
        context,
      });

      return result;
    });
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
    const { timeout = 30000, signal, logger, context } = options;

    return safeAsync(async () => {
      const promises = operations.map((op, index) => {
        const timeoutOptions: {
          signal?: AbortSignal;
          logger?: Logger;
          context?: Record<string, unknown>;
        } = {};
        if (signal) timeoutOptions.signal = signal;
        if (logger) timeoutOptions.logger = logger;
        if (context) timeoutOptions.context = { ...context, operationIndex: index };

        return this.withTimeout(op, timeout, timeoutOptions);
      });

      const results = await Promise.all(promises);

      // Check if any operations failed
      const failures = results.filter(result => !result.success);
      if (failures.length > 0) {
        const errors = failures
          .map((f: Result<T>) => f.error?.message || 'Unknown error')
          .join(', ');
        throw new Error(`${failures.length} operations failed: ${errors}`);
      }

      return results.map((result: Result<T>) => {
        if (!result.success || result.data === undefined) {
          throw new Error('Operation result is undefined');
        }
        return result.data;
      });
    });
  }

  /**
   * Execute operations sequentially with Result pattern
   */
  static async sequential<T>(
    operations: Array<() => Promise<T>>,
    options: AsyncOperationOptions = {}
  ): Promise<Result<T[]>> {
    const { timeout = 30000, signal, logger, context } = options;

    return safeAsync(async () => {
      const results: T[] = [];

      for (let i = 0; i < operations.length; i++) {
        if (signal?.aborted) {
          throw new Error('Sequential operations aborted');
        }

        const timeoutOptions: {
          signal?: AbortSignal;
          logger?: Logger;
          context?: Record<string, unknown>;
        } = {};
        if (signal) timeoutOptions.signal = signal;
        if (logger) timeoutOptions.logger = logger;
        if (context) timeoutOptions.context = { ...context, operationIndex: i };

        const operation = operations[i];
        if (!operation) {
          throw new Error(`Operation at index ${i} is undefined`);
        }
        const result = await this.withTimeout(operation, timeout, timeoutOptions);

        if (!result.success) {
          throw result.error || new Error(`Operation ${i} failed`);
        }

        results.push(result.data);
      }

      return results;
    });
  }

  /**
   * Execute operation with circuit breaker pattern
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
    // This is a simplified circuit breaker implementation
    // In a real implementation, you'd want to maintain state across calls
    const { logger, context } = options;

    return safeAsync(async () => {
      // For now, just execute the operation
      // A full circuit breaker would track failures and open/close the circuit
      const result = await operation();

      logger?.debug('Circuit breaker operation completed', { context });

      return result;
    });
  }

  /**
   * Create operation context for tracking
   */
  static createOperationContext(
    operationName: string,
    metadata: Record<string, unknown> = {}
  ): OperationContext {
    return {
      operationId: `${operationName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
    const {
      timeout = 30000,
      retries = 3,
      retryDelay = 1000,
      backoffMultiplier = 2,
      maxRetryDelay = 10000,
      signal,
      logger,
      context = {},
    } = options;

    const operationContext = this.createOperationContext(operationName, context);

    logger?.info('Starting monitored operation', {
      operationId: operationContext.operationId,
      operationName,
      timeout,
      retries,
      context,
    });

    const retryStrategy: RetryStrategy = {
      maxAttempts: retries + 1, // +1 for initial attempt
      baseDelay: retryDelay,
      backoffMultiplier,
      maxDelay: maxRetryDelay,
    };

    const wrappedOperation = async () => {
      const timeoutOptions: {
        signal?: AbortSignal;
        logger?: Logger;
        context?: Record<string, unknown>;
      } = {};
      if (signal) timeoutOptions.signal = signal;
      if (logger) timeoutOptions.logger = logger;
      if (context) timeoutOptions.context = context;

      return this.withTimeout(operation, timeout, timeoutOptions);
    };

    const retryOptions: { signal?: AbortSignal; logger?: Logger; context?: OperationContext } = {};
    if (signal) retryOptions.signal = signal;
    if (logger) retryOptions.logger = logger;
    retryOptions.context = operationContext;

    const result = await this.withRetry(
      async () => {
        const timeoutResult = await wrappedOperation();
        if (!timeoutResult.success) {
          throw timeoutResult.error || new Error('Operation failed');
        }
        return timeoutResult.data;
      },
      retryStrategy,
      retryOptions
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
