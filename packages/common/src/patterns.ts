/**
 * Standardized patterns and utilities for DangerPrep packages
 *
 * Provides common factory patterns, configuration builders,
 * and utility object structures used across all packages.
 */

import { Result, safeAsync } from '@dangerprep/errors';

/**
 * Standard configuration interface that all service configs should extend
 */
export interface BaseConfig {
  /** Service/component name */
  name: string;
  /** Version identifier */
  version?: string;
  /** Whether the component is enabled */
  enabled?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Standard factory function signature
 */
export type FactoryFunction<TConfig, TInstance> = (config: TConfig) => TInstance;

/**
 * Standard configuration builder signature
 */
export type ConfigBuilder<TConfig> = (overrides?: Partial<TConfig>) => TConfig;

/**
 * Standard Utils object interface that all packages should follow
 */
export interface StandardUtils<TConfig extends BaseConfig, TInstance> {
  /** Create an instance with the given configuration */
  create: FactoryFunction<TConfig, TInstance>;
  /** Create a default configuration with optional overrides */
  createConfig: ConfigBuilder<TConfig>;
  /** Create an instance with default configuration */
  createDefault: (overrides?: Partial<TConfig>) => TInstance;
}

/**
 * Factory for creating standardized Utils objects
 */
export function createStandardUtils<TConfig extends BaseConfig, TInstance>(
  defaultConfig: TConfig,
  instanceFactory: FactoryFunction<TConfig, TInstance>
): StandardUtils<TConfig, TInstance> {
  const createConfig: ConfigBuilder<TConfig> = (overrides = {}) => ({
    ...defaultConfig,
    ...overrides,
  });

  const create: FactoryFunction<TConfig, TInstance> = config => {
    return instanceFactory(config);
  };

  const createDefault = (overrides: Partial<TConfig> = {}) => {
    const config = createConfig(overrides);
    return create(config);
  };

  return {
    create,
    createConfig,
    createDefault,
  };
}

/**
 * Async operation options used across packages
 */
export interface AsyncOperationOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Base delay between retries in milliseconds */
  retryDelay?: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier?: number;
  /** Maximum delay between retries */
  maxRetryDelay?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Progress callback */
  onProgress?: (progress: { completed: number; total: number }) => void;
  /** Context metadata */
  context?: Record<string, unknown>;
}

/**
 * Standard retry strategy configuration
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
 * Common async patterns used across packages
 */
export class AsyncPatterns {
  /**
   * Create an operation context with unique ID
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
    };
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
   * Execute operation with timeout
   */
  static async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<Result<T>> {
    return safeAsync(async () => {
      return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        signal?.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('Operation aborted'));
        });

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
    });
  }

  /**
   * Execute operation with retry logic
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    strategy: RetryStrategy = AsyncPatterns.createDefaultRetryStrategy()
  ): Promise<Result<T>> {
    return safeAsync(async () => {
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (
            attempt === strategy.maxAttempts ||
            (strategy.shouldRetry && !strategy.shouldRetry(lastError, attempt))
          ) {
            break;
          }

          const delay = Math.min(
            strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1),
            strategy.maxDelay
          );

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      throw lastError || new Error('Operation failed after retries');
    });
  }

  /**
   * Execute operation with comprehensive monitoring
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
      context = {},
    } = options;

    const _operationContext = AsyncPatterns.createOperationContext(operationName, context);

    const retryStrategy: RetryStrategy = {
      maxAttempts: retries + 1,
      baseDelay: retryDelay,
      backoffMultiplier,
      maxDelay: maxRetryDelay,
    };

    const wrappedOperation = async (): Promise<T> => {
      const result = await AsyncPatterns.withTimeout(operation, timeout, signal);
      if (!result.success || result.data === undefined) {
        throw result.error || new Error('Operation failed');
      }
      return result.data;
    };

    return await AsyncPatterns.withRetry(wrappedOperation, retryStrategy);
  }

  /**
   * Execute multiple operations in parallel with Result pattern
   */
  static async parallel<T>(
    operations: Array<() => Promise<T>>,
    options: AsyncOperationOptions = {}
  ): Promise<Result<T[]>> {
    const { timeout = 30000, signal } = options;

    return safeAsync(async () => {
      const promises = operations.map(async operation => {
        const result: Result<T> = await AsyncPatterns.withTimeout(operation, timeout, signal);
        if (!result.success || result.data === undefined) {
          throw result.error || new Error('Operation failed');
        }
        return result.data;
      });

      return await Promise.all(promises);
    });
  }

  /**
   * Execute operations sequentially with Result pattern
   */
  static async sequential<T>(
    operations: Array<() => Promise<T>>,
    options: AsyncOperationOptions = {}
  ): Promise<Result<T[]>> {
    const { timeout = 30000, signal } = options;

    return safeAsync(async () => {
      const results: T[] = [];

      for (let i = 0; i < operations.length; i++) {
        if (signal?.aborted) {
          throw new Error('Sequential operations aborted');
        }

        const operation = operations[i];
        if (!operation) {
          throw new Error(`Operation at index ${i} is undefined`);
        }

        const result: Result<T> = await AsyncPatterns.withTimeout(operation, timeout, signal);

        if (!result.success || result.data === undefined) {
          throw result.error || new Error(`Operation ${i} failed`);
        }

        results.push(result.data);
      }

      return results;
    });
  }
}

/**
 * Configuration patterns used across packages
 */
export class ConfigPatterns {
  /**
   * Merge configurations with deep merge support
   */
  static mergeConfigs<T extends Record<string, unknown>>(base: T, ...overrides: Partial<T>[]): T {
    return overrides.reduce<T>((result, override) => {
      return { ...result, ...override } as T;
    }, base);
  }

  /**
   * Validate required configuration fields
   */
  static validateRequired<T extends Record<string, unknown>>(
    config: T,
    requiredFields: (keyof T)[]
  ): void {
    const missing = requiredFields.filter(
      field => config[field] === undefined || config[field] === null
    );

    if (missing.length > 0) {
      throw new Error(`Missing required configuration fields: ${missing.join(', ')}`);
    }
  }

  /**
   * Create configuration with environment variable overrides
   */
  static withEnvOverrides<T extends Record<string, unknown>>(baseConfig: T, envPrefix: string): T {
    const envOverrides: Partial<T> = {};

    Object.keys(baseConfig).forEach(key => {
      const envKey = `${envPrefix}_${key.toUpperCase()}`;
      const envValue = process.env[envKey];

      if (envValue !== undefined) {
        let parsedValue: unknown = envValue;

        if (envValue === 'true') parsedValue = true;
        else if (envValue === 'false') parsedValue = false;
        else if (/^\d+$/.test(envValue)) parsedValue = parseInt(envValue, 10);
        else if (/^\d+\.\d+$/.test(envValue)) parsedValue = parseFloat(envValue);

        (envOverrides as Record<string, unknown>)[key] = parsedValue;
      }
    });

    return { ...baseConfig, ...envOverrides };
  }

  /**
   * Deep merge configurations with nested object support
   */
  static deepMergeConfigs<T extends Record<string, unknown>>(
    base: T,
    ...overrides: Partial<T>[]
  ): T {
    return overrides.reduce<T>((result, override) => {
      const merged = { ...result };

      Object.keys(override).forEach(key => {
        const overrideValue = override[key];
        const baseValue = result[key];

        if (
          overrideValue &&
          typeof overrideValue === 'object' &&
          !Array.isArray(overrideValue) &&
          baseValue &&
          typeof baseValue === 'object' &&
          !Array.isArray(baseValue)
        ) {
          (merged as Record<string, unknown>)[key] = ConfigPatterns.deepMergeConfigs(
            baseValue as Record<string, unknown>,
            overrideValue as Record<string, unknown>
          );
        } else {
          (merged as Record<string, unknown>)[key] = overrideValue;
        }
      });

      return merged as T;
    }, base);
  }

  /**
   * Validate configuration with custom validators
   */
  static validateConfig<T extends Record<string, unknown>>(
    config: T,
    validators: Partial<Record<keyof T, (value: unknown) => boolean | string>>
  ): void {
    const errors: string[] = [];

    Object.entries(validators).forEach(([key, validator]) => {
      if (validator && key in config) {
        const result = validator(config[key as keyof T]);
        if (result === false) {
          errors.push(`Invalid value for field '${key}'`);
        } else if (typeof result === 'string') {
          errors.push(`Field '${key}': ${result}`);
        }
      }
    });

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Create a configuration builder with fluent API
   */
  static createBuilder<T extends Record<string, unknown>>(defaultConfig: T) {
    return new FluentConfigBuilder(defaultConfig);
  }

  /**
   * Freeze configuration to prevent modifications
   */
  static freeze<T extends Record<string, unknown>>(config: T): Readonly<T> {
    return Object.freeze(config);
  }

  /**
   * Clone configuration deeply
   */
  static clone<T extends Record<string, unknown>>(config: T): T {
    return JSON.parse(JSON.stringify(config));
  }
}

/**
 * Fluent configuration builder
 */
export class FluentConfigBuilder<T extends Record<string, unknown>> {
  private config: T;

  constructor(defaultConfig: T) {
    this.config = { ...defaultConfig };
  }

  /**
   * Merge with another configuration
   */
  merge(override: Partial<T>): FluentConfigBuilder<T> {
    this.config = ConfigPatterns.mergeConfigs(this.config, override);
    return this;
  }

  /**
   * Deep merge with another configuration
   */
  deepMerge(override: Partial<T>): FluentConfigBuilder<T> {
    this.config = ConfigPatterns.deepMergeConfigs(this.config, override);
    return this;
  }

  /**
   * Add environment variable overrides
   */
  withEnv(
    envPrefix: string,
    _options?: {
      transform?: Record<string, (value: string) => unknown>;
      allowedKeys?: (keyof T)[];
    }
  ): FluentConfigBuilder<T> {
    this.config = ConfigPatterns.withEnvOverrides(this.config, envPrefix);
    return this;
  }

  /**
   * Validate the configuration
   */
  validate(
    requiredFields?: (keyof T)[],
    validators?: Partial<Record<keyof T, (value: unknown) => boolean | string>>
  ): FluentConfigBuilder<T> {
    if (requiredFields) {
      ConfigPatterns.validateRequired(this.config, requiredFields);
    }
    if (validators) {
      ConfigPatterns.validateConfig(this.config, validators);
    }
    return this;
  }

  /**
   * Transform specific fields
   */
  transform(
    transformers: Partial<Record<keyof T, (value: unknown) => unknown>>
  ): FluentConfigBuilder<T> {
    Object.entries(transformers).forEach(([key, transformer]) => {
      if (transformer && key in this.config) {
        (this.config as Record<string, unknown>)[key] = transformer(this.config[key as keyof T]);
      }
    });
    return this;
  }

  /**
   * Build the final configuration
   */
  build(): T {
    return { ...this.config };
  }

  /**
   * Build and freeze the configuration
   */
  buildFrozen(): Readonly<T> {
    return ConfigPatterns.freeze(this.build());
  }
}

/**
 * Common utility patterns
 */
export const CommonPatterns = {
  AsyncPatterns,
  ConfigPatterns,
  createStandardUtils,
} as const;
