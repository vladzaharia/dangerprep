/**
 * Circuit breaker manager for managing multiple circuit breakers
 */

import { CircuitBreaker } from './breaker.js';
import {
  DEFAULT_CIRCUIT_BREAKER_CONFIGS,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
} from './types.js';

/**
 * Manager for multiple circuit breakers
 */
export class CircuitBreakerManager {
  private static instance: CircuitBreakerManager;
  private circuitBreakers = new Map<string, CircuitBreaker>();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): CircuitBreakerManager {
    if (!CircuitBreakerManager.instance) {
      CircuitBreakerManager.instance = new CircuitBreakerManager();
    }
    return CircuitBreakerManager.instance;
  }

  /**
   * Create or get a circuit breaker
   */
  getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    const existingBreaker = this.circuitBreakers.get(name);
    if (existingBreaker) {
      return existingBreaker;
    }

    // Create new circuit breaker with provided config or defaults
    const fullConfig: CircuitBreakerConfig = {
      name,
      failureThreshold: 5,
      failureTimeWindowMs: 60000,
      recoveryTimeoutMs: 30000,
      successThreshold: 2,
      ...config,
    };

    const circuitBreaker = new CircuitBreaker(fullConfig);
    this.circuitBreakers.set(name, circuitBreaker);
    return circuitBreaker;
  }

  /**
   * Create a circuit breaker with a preset configuration
   */
  createWithPreset(
    name: string,
    preset: keyof typeof DEFAULT_CIRCUIT_BREAKER_CONFIGS,
    overrides?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    const presetConfig = DEFAULT_CIRCUIT_BREAKER_CONFIGS[preset];
    const config = {
      ...presetConfig,
      ...overrides,
      name,
    } as CircuitBreakerConfig;

    return this.getCircuitBreaker(name, config);
  }

  /**
   * Execute an operation with a named circuit breaker
   */
  async execute<T>(
    circuitBreakerName: string,
    operation: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>
  ) {
    const circuitBreaker = this.getCircuitBreaker(circuitBreakerName, config);
    return circuitBreaker.execute(operation);
  }

  /**
   * Get metrics for a specific circuit breaker
   */
  getMetrics(name: string): CircuitBreakerMetrics | undefined {
    const circuitBreaker = this.circuitBreakers.get(name);
    return circuitBreaker?.getMetrics();
  }

  /**
   * Get metrics for all circuit breakers
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};

    for (const [name, circuitBreaker] of this.circuitBreakers) {
      metrics[name] = circuitBreaker.getMetrics();
    }

    return metrics;
  }

  /**
   * Reset a specific circuit breaker
   */
  reset(name: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(name);
    if (circuitBreaker) {
      circuitBreaker.reset();
      return true;
    }
    return false;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    return this.circuitBreakers.delete(name);
  }

  /**
   * Remove all circuit breakers
   */
  removeAll(): void {
    this.circuitBreakers.clear();
  }

  /**
   * Get list of all circuit breaker names
   */
  getCircuitBreakerNames(): string[] {
    return Array.from(this.circuitBreakers.keys());
  }

  /**
   * Check if a circuit breaker exists
   */
  has(name: string): boolean {
    return this.circuitBreakers.has(name);
  }

  /**
   * Force open a circuit breaker
   */
  forceOpen(name: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(name);
    if (circuitBreaker) {
      circuitBreaker.forceOpen();
      return true;
    }
    return false;
  }

  /**
   * Force close a circuit breaker
   */
  forceClosed(name: string): boolean {
    const circuitBreaker = this.circuitBreakers.get(name);
    if (circuitBreaker) {
      circuitBreaker.forceClosed();
      return true;
    }
    return false;
  }
}

/**
 * Utility functions for circuit breaker management
 */
export const CircuitBreakerUtils = {
  /**
   * Get the global circuit breaker manager instance
   */
  getManager(): CircuitBreakerManager {
    return CircuitBreakerManager.getInstance();
  },

  /**
   * Execute an operation with circuit breaker protection
   */
  async executeWithCircuitBreaker<T>(
    name: string,
    operation: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>
  ) {
    const manager = CircuitBreakerManager.getInstance();
    return manager.execute(name, operation, config);
  },

  /**
   * Create a circuit breaker decorator for methods
   */
  withCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>) {
    return function <T extends unknown[], R>(
      target: unknown,
      propertyKey: string | symbol,
      descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
    ) {
      const originalMethod = descriptor.value;
      if (!originalMethod) return descriptor;

      descriptor.value = async function (...args: T): Promise<R> {
        const operation = () => originalMethod.apply(this, args);
        const result = await CircuitBreakerUtils.executeWithCircuitBreaker(name, operation, config);

        if (result.success && result.data.success && result.data.data !== undefined) {
          return result.data.data;
        }

        throw result.data?.error || result.error || new Error('Circuit breaker operation failed');
      };

      return descriptor;
    };
  },

  /**
   * Create a circuit breaker wrapper function
   */
  createCircuitBreakerWrapper<T extends unknown[], R>(
    name: string,
    fn: (...args: T) => Promise<R>,
    config?: Partial<CircuitBreakerConfig>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const operation = () => fn(...args);
      const result = await CircuitBreakerUtils.executeWithCircuitBreaker(name, operation, config);

      if (result.success && result.data.success && result.data.data !== undefined) {
        return result.data.data;
      }

      throw result.data?.error || result.error || new Error('Circuit breaker operation failed');
    };
  },
};
