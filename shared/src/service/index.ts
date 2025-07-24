/**
 * Service module - Standardized service lifecycle management for DangerPrep services
 *
 * Features:
 * - Base service class with standardized lifecycle management
 * - Service state management and monitoring
 * - Automatic health check integration
 * - Signal handling for graceful shutdown
 * - Event-driven architecture with lifecycle hooks
 * - Comprehensive error handling and notifications
 */

// Core exports
export { BaseService } from './base.js';
export { ServicePatterns, AdvancedAsyncPatterns } from './patterns.js';

// Types and enums
export { ServiceState } from './types.js';

export type {
  ServiceConfig,
  ServiceStats,
  ServiceLifecycleHooks,
  ServiceComponents,
  ServiceInitializationResult,
  ServiceShutdownResult,
} from './types.js';

// Error classes
export {
  ServiceError,
  ServiceInitializationError,
  ServiceStartupError,
  ServiceShutdownError,
  ServiceConfigurationError,
} from './types.js';

// Import for utility functions
import { BaseService } from './base.js';
import type { ServiceConfig, ServiceLifecycleHooks } from './types.js';

// Utility functions
export const ServiceUtils = {
  /**
   * Create a basic service configuration
   */
  createServiceConfig(
    name: string,
    version: string,
    configPath: string,
    options: Partial<ServiceConfig> = {}
  ): ServiceConfig {
    return {
      name,
      version,
      configPath,
      enablePeriodicHealthChecks: true,
      healthCheckIntervalMinutes: 5,
      handleProcessSignals: true,
      shutdownTimeoutMs: 30000,
      ...options,
    };
  },

  /**
   * Create a service with common lifecycle hooks
   */
  createServiceWithHooks(
    config: ServiceConfig,
    hooks: Partial<ServiceLifecycleHooks> = {}
  ): ServiceLifecycleHooks {
    return {
      onStateChange: async (newState, oldState) => {
        // eslint-disable-next-line no-console
        console.log(`Service ${config.name} state changed: ${oldState} -> ${newState}`);
      },
      onError: async error => {
        // eslint-disable-next-line no-console
        console.error(`Service ${config.name} error:`, error);
      },
      ...hooks,
    };
  },

  /**
   * Run a service with automatic error handling
   */
  async runService(
    ServiceClass: new (config: ServiceConfig, hooks?: ServiceLifecycleHooks) => BaseService,
    config: ServiceConfig,
    hooks?: ServiceLifecycleHooks
  ): Promise<void> {
    const service = new ServiceClass(config, hooks);

    try {
      // Initialize the service
      const initResult = await service.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      // Start the service
      await service.start();

      // Keep the process running
      await new Promise<void>(resolve => {
        service.once('stopped', resolve);
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to run service ${config.name}:`, error);
      process.exit(1);
    }
  },

  /**
   * Create a simple service wrapper for existing service classes
   */
  wrapExistingService<T extends { initialize(): Promise<void>; run(): Promise<void> }>(
    ExistingServiceClass: new (...args: unknown[]) => T,
    config: ServiceConfig,
    constructorArgs: unknown[] = []
  ): BaseService {
    return new (class extends BaseService {
      private existingService: T;

      constructor() {
        super(config);
        this.existingService = new ExistingServiceClass(...constructorArgs);
      }

      protected async loadConfiguration(): Promise<void> {
        // Configuration loading handled by existing service
      }

      protected async initializeServiceComponents(): Promise<void> {
        await this.existingService.initialize();
      }

      protected async startService(): Promise<void> {
        await this.existingService.run();
      }

      protected async stopService(): Promise<void> {
        // Implement stop logic if available in existing service
      }
    })();
  },
};
