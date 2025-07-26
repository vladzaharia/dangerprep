/**
 * Combined resilience patterns integrating circuit breakers and retry mechanisms
 */

import { Result, success } from '@dangerprep/errors';

import { CircuitBreaker } from './circuit-breaker.js';
import { RetryExecutor } from './retry.js';
import {
  type ResilienceConfig,
  type ResilienceResult,
  type CircuitBreakerResult,
  type RetryResult,
  DEFAULT_RESILIENCE_CONFIGS,
} from './types.js';

/**
 * Combined resilience executor that integrates circuit breaker and retry patterns
 */
export class ResilienceExecutor<T> {
  private circuitBreaker?: CircuitBreaker;
  private retryExecutor?: RetryExecutor<T>;

  constructor(private config: ResilienceConfig) {
    this.validateConfig(config);

    if (config.circuitBreaker) {
      this.circuitBreaker = new CircuitBreaker({
        ...config.circuitBreaker,
        name: config.circuitBreaker.name || config.name,
      });
    }

    if (config.retry) {
      this.retryExecutor = new RetryExecutor<T>(config.retry);
    }
  }

  async execute(operation: () => Promise<T>): Promise<Result<ResilienceResult<T>>> {
    const startTime = Date.now();
    let fallbackUsed = false;
    let timedOut = false;

    try {
      // Wrap operation with timeout if configured
      const wrappedOperation = this.config.timeout
        ? () => this.executeWithTimeout(operation, this.config.timeout as number)
        : operation;

      // Execute with circuit breaker and/or retry
      const result = await this.executeWithResilience(wrappedOperation);

      const resilienceResult: ResilienceResult<T> = {
        success: result.success,
        data: result.data as T | undefined,
        error: result.error,
        executionTimeMs: Date.now() - startTime,
        circuitBreakerResult: result.circuitBreakerResult,
        retryResult: result.retryResult,
        fallbackUsed,
        timedOut,
      };

      return success(resilienceResult);
    } catch (error) {
      // Check if this is a timeout error
      if (error instanceof Error && error.message.includes('timed out')) {
        timedOut = true;
      }

      // Try fallback if configured
      if (this.config.fallback) {
        try {
          const fallbackResult = await this.config.fallback(error);
          fallbackUsed = true;

          const resilienceResult: ResilienceResult<T> = {
            success: true,
            data: fallbackResult as T,
            executionTimeMs: Date.now() - startTime,
            fallbackUsed,
            timedOut,
          };

          return success(resilienceResult);
        } catch (fallbackError) {
          // Fallback also failed
          const resilienceResult: ResilienceResult<T> = {
            success: false,
            error: fallbackError,
            executionTimeMs: Date.now() - startTime,
            fallbackUsed: true,
            timedOut,
          };

          return success(resilienceResult);
        }
      }

      const resilienceResult: ResilienceResult<T> = {
        success: false,
        error,
        executionTimeMs: Date.now() - startTime,
        fallbackUsed,
        timedOut,
      };

      return success(resilienceResult);
    }
  }

  private async executeWithResilience(operation: () => Promise<T>): Promise<{
    success: boolean;
    data?: T | undefined;
    error?: unknown;
    circuitBreakerResult?: CircuitBreakerResult<T>;
    retryResult?: RetryResult<T>;
  }> {
    // If both circuit breaker and retry are configured
    if (this.circuitBreaker && this.retryExecutor) {
      const circuitBreaker = this.circuitBreaker; // Capture for type safety
      const retryResult = await this.retryExecutor.execute(async () => {
        const cbResult = await circuitBreaker.execute(operation);
        if (cbResult.success && cbResult.data?.success && cbResult.data.data !== undefined) {
          return cbResult.data.data;
        }
        throw (
          cbResult.data?.error || cbResult.error || new Error('Circuit breaker execution failed')
        );
      });

      return {
        success: retryResult.success,
        data: retryResult.data,
        error: retryResult.error,
        retryResult,
      };
    }

    // If only circuit breaker is configured
    if (this.circuitBreaker) {
      const cbResult = await this.circuitBreaker.execute(operation);
      if (cbResult.success) {
        return {
          success: cbResult.data?.success || false,
          data: cbResult.data?.data as T | undefined,
          error: cbResult.data?.error,
          circuitBreakerResult: cbResult.data,
        };
      }
      throw cbResult.error;
    }

    // If only retry is configured
    if (this.retryExecutor) {
      const retryResult = await this.retryExecutor.execute(operation);
      return {
        success: retryResult.success,
        data: retryResult.data as T | undefined,
        error: retryResult.error,
        retryResult,
      };
    }

    // No resilience patterns configured, execute directly
    try {
      const result = await operation();
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private validateConfig(config: ResilienceConfig): void {
    if (!config.name || config.name.trim().length === 0) {
      throw new Error('ResilienceConfig name is required');
    }

    if (config.timeout !== undefined && config.timeout <= 0) {
      throw new Error('timeout must be positive');
    }

    if (!config.circuitBreaker && !config.retry && !config.fallback) {
      throw new Error(
        'At least one resilience pattern (circuitBreaker, retry, or fallback) must be configured'
      );
    }
  }
}

/**
 * Resilience utility functions and patterns
 */
export const ResiliencePatterns = {
  /**
   * Execute an operation with comprehensive resilience patterns
   */
  async executeWithResilience<T>(
    operation: () => Promise<T>,
    config: ResilienceConfig
  ): Promise<Result<ResilienceResult<T>>> {
    const executor = new ResilienceExecutor<T>(config);
    return executor.execute(operation);
  },

  /**
   * Execute an operation with resilience and throw on failure
   */
  async executeWithResilienceOrThrow<T>(
    operation: () => Promise<T>,
    config: ResilienceConfig
  ): Promise<T> {
    const result = await ResiliencePatterns.executeWithResilience(operation, config);

    if (result.success && result.data?.success && result.data.data !== undefined) {
      return result.data.data;
    }

    throw result.data?.error || result.error || new Error('Resilience execution failed');
  },

  /**
   * Create a resilient API client wrapper
   */
  createResilientApiClient<T extends Record<string, (...args: unknown[]) => Promise<unknown>>>(
    client: T,
    config: Partial<ResilienceConfig> = {}
  ): T {
    const resilienceConfig: ResilienceConfig = {
      name: 'api-client',
      ...DEFAULT_RESILIENCE_CONFIGS.API_RESILIENT,
      ...config,
    };

    const wrappedClient = {} as T;

    for (const [methodName, method] of Object.entries(client)) {
      if (typeof method === 'function') {
        (wrappedClient as Record<string, unknown>)[methodName] = async (...args: unknown[]) => {
          const operation = () => method.apply(client, args);
          return ResiliencePatterns.executeWithResilienceOrThrow(operation, resilienceConfig);
        };
      } else {
        (wrappedClient as Record<string, unknown>)[methodName] = method;
      }
    }

    return wrappedClient;
  },

  /**
   * Create a resilient external service wrapper
   */
  createResilientExternalService<
    T extends Record<string, (...args: unknown[]) => Promise<unknown>>,
  >(service: T, config: Partial<ResilienceConfig> = {}): T {
    const resilienceConfig: ResilienceConfig = {
      name: 'external-service',
      ...DEFAULT_RESILIENCE_CONFIGS.EXTERNAL_SERVICE_RESILIENT,
      ...config,
    };

    return ResiliencePatterns.createResilientApiClient(service, resilienceConfig);
  },

  /**
   * Create a fast-failing resilient wrapper
   */
  createFastFailingService<T extends Record<string, (...args: unknown[]) => Promise<unknown>>>(
    service: T,
    config: Partial<ResilienceConfig> = {}
  ): T {
    const resilienceConfig: ResilienceConfig = {
      name: 'fast-failing-service',
      ...DEFAULT_RESILIENCE_CONFIGS.FAST_FAIL_RESILIENT,
      ...config,
    };

    return ResiliencePatterns.createResilientApiClient(service, resilienceConfig);
  },

  /**
   * Create a resilience decorator for methods
   */
  withResilience<T extends unknown[], R>(config: ResilienceConfig) {
    return function (
      target: unknown,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
    ) {
      const originalMethod = descriptor.value;
      if (!originalMethod) return descriptor;

      descriptor.value = async function (...args: T): Promise<R> {
        const operation = () => originalMethod.apply(this, args);
        return ResiliencePatterns.executeWithResilienceOrThrow(operation, config);
      };

      return descriptor;
    };
  },
};
