/**
 * Service factory utilities for creating standardized sync services
 */

import { z } from '@dangerprep/configuration';

import {
  StandardizedSyncService,
  StandardizedServiceConfig,
  ServiceLifecycleHooks,
} from '../base/standardized-service.js';
import { StandardizedCli, StandardizedCliConfig, CliCommand } from '../cli/standardized-cli.js';
import { StandardizedServiceConfigSchema } from '../config/schemas.js';

// Service factory configuration
export interface ServiceFactoryConfig<TConfig extends StandardizedServiceConfig> {
  serviceName: string;
  version: string;
  description: string;
  defaultConfigPath: string;
  configSchema: z.ZodSchema<TConfig>;
  serviceClass: new (
    serviceName: string,
    version: string,
    configPath: string,
    configSchema: z.ZodSchema<TConfig>,
    hooks?: ServiceLifecycleHooks
  ) => StandardizedSyncService<TConfig>;
  lifecycleHooks?: ServiceLifecycleHooks;
  cliConfig?: Partial<StandardizedCliConfig>;
  customCommands?: CliCommand[];
}

/**
 * Factory for creating standardized sync services with CLI
 */
export class ServiceFactory<TConfig extends StandardizedServiceConfig> {
  private readonly config: ServiceFactoryConfig<TConfig>;

  constructor(config: ServiceFactoryConfig<TConfig>) {
    this.config = config;
  }

  /**
   * Create a service instance
   */
  createService(configPath?: string): StandardizedSyncService<TConfig> {
    const actualConfigPath = configPath || this.config.defaultConfigPath;

    return new this.config.serviceClass(
      this.config.serviceName,
      this.config.version,
      actualConfigPath,
      this.config.configSchema,
      this.config.lifecycleHooks
    );
  }

  /**
   * Create a CLI instance
   */
  createCli(): StandardizedCli<StandardizedSyncService<TConfig>> {
    const cliConfig: StandardizedCliConfig = {
      serviceName: this.config.serviceName,
      version: this.config.version,
      description: this.config.description,
      defaultConfigPath: this.config.defaultConfigPath,
      supportsDaemon: true,
      supportsManualOperations: true,
      ...(this.config.customCommands && { customCommands: this.config.customCommands }),
      ...this.config.cliConfig,
    };

    return new StandardizedCli(cliConfig, configPath => this.createService(configPath));
  }

  /**
   * Create and run CLI
   */
  async runCli(argv?: string[]): Promise<void> {
    const cli = this.createCli();
    await cli.execute(argv);
  }

  /**
   * Create a main entry point for the service
   */
  createMainEntryPoint(): (argv?: string[]) => Promise<void> {
    return async (argv?: string[]) => {
      // If no arguments provided, run as service
      if (!argv || argv.length <= 2) {
        const service = this.createService();

        // Set up graceful shutdown
        const shutdown = async () => {
          // eslint-disable-next-line no-console
          console.log('Shutting down gracefully...');
          await service.stop();
          process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        try {
          const initResult = await service.initialize();
          if (!initResult.success) {
            throw initResult.error || new Error('Service initialization failed');
          }

          await service.start();
          // eslint-disable-next-line no-console
          console.log(`${this.config.serviceName} started successfully`);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`Failed to start ${this.config.serviceName}:`, error);
          process.exit(1);
        }
      } else {
        // Run as CLI
        await this.runCli(argv);
      }
    };
  }
}

/**
 * Utility functions for common service patterns
 */
export class ServicePatterns {
  /**
   * Create a standard sync service configuration schema
   */
  static createSyncServiceSchema<_T extends Record<string, unknown>>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    serviceSpecificSchema: z.ZodObject<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): z.ZodObject<any> {
    return StandardizedServiceConfigSchema.merge(serviceSpecificSchema);
  }

  /**
   * Create standard lifecycle hooks for sync services
   */
  static createSyncLifecycleHooks(options: {
    onServiceReady?: () => Promise<void>;
    onServiceStopping?: () => Promise<void>;
    onOperationStart?: (operationId: string, operationType: string) => Promise<void>;
    onOperationComplete?: (operationId: string, success: boolean) => Promise<void>;
  }): ServiceLifecycleHooks {
    const hooks: ServiceLifecycleHooks = {};

    if (options.onServiceReady) {
      hooks.afterStart = options.onServiceReady;
    }

    if (options.onServiceStopping) {
      hooks.beforeStop = options.onServiceStopping;
    }

    hooks.onProgress = async update => {
      if (update.status === 'in_progress' && options.onOperationStart) {
        await options.onOperationStart(update.operationId, update.operationName);
      } else if (
        (update.status === 'completed' || update.status === 'failed') &&
        options.onOperationComplete
      ) {
        await options.onOperationComplete(update.operationId, update.status === 'completed');
      }
    };

    return hooks;
  }

  /**
   * Create standard CLI commands for sync services
   */
  static createSyncCommands(): CliCommand[] {
    return [
      {
        name: 'test-config',
        description: 'Test configuration validity',
        action: async (args, options, service) => {
          try {
            const initResult = await service.initialize();
            if (initResult.success) {
              // eslint-disable-next-line no-console
              console.log('✅ Configuration is valid');
            } else {
              // eslint-disable-next-line no-console
              console.error('❌ Configuration is invalid:', initResult.error);
              process.exit(1);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('❌ Configuration test failed:', error);
            process.exit(1);
          }
        },
      },
      {
        name: 'validate',
        description: 'Validate service setup and dependencies',
        action: async (args, options, service) => {
          try {
            const initResult = await service.initialize();
            if (!initResult.success) {
              throw initResult.error || new Error('Service initialization failed');
            }

            const health = await service.getHealthStatus();
            // eslint-disable-next-line no-console
            console.log(`Health Status: ${health}`);

            if (health === 'up') {
              // eslint-disable-next-line no-console
              console.log('✅ Service validation passed');
            } else {
              // eslint-disable-next-line no-console
              console.log('⚠️  Service validation completed with warnings');
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('❌ Service validation failed:', error);
            process.exit(1);
          }
        },
      },
      {
        name: 'logs',
        description: 'Show recent service logs',
        options: [
          { flags: '--lines <number>', description: 'Number of lines to show', defaultValue: 50 },
          { flags: '--follow', description: 'Follow log output' },
        ],
        action: async (_args, _options, _service) => {
          // eslint-disable-next-line no-console
          console.log('Log viewing not implemented - check service logs directly');
        },
      },
    ];
  }

  /**
   * Create a complete service factory with standard patterns
   */
  static createStandardServiceFactory<TConfig extends StandardizedServiceConfig>(
    config: Omit<ServiceFactoryConfig<TConfig>, 'customCommands'> & {
      additionalCommands?: CliCommand[];
    }
  ): ServiceFactory<TConfig> {
    const standardCommands = ServicePatterns.createSyncCommands();
    const customCommands = [...standardCommands, ...(config.additionalCommands || [])];

    const factoryConfig: ServiceFactoryConfig<TConfig> = {
      serviceName: config.serviceName,
      version: config.version,
      description: config.description,
      defaultConfigPath: config.defaultConfigPath,
      configSchema: config.configSchema,
      serviceClass: config.serviceClass,
      customCommands,
      ...(config.lifecycleHooks && { lifecycleHooks: config.lifecycleHooks }),
      ...(config.cliConfig && { cliConfig: config.cliConfig }),
    };

    return new ServiceFactory(factoryConfig);
  }
}

/**
 * Helper for creating service main entry points
 */
export function createServiceMain<TConfig extends StandardizedServiceConfig>(
  factory: ServiceFactory<TConfig>
): void {
  const main = factory.createMainEntryPoint();

  if (require.main === module) {
    main(process.argv).catch(error => {
      // eslint-disable-next-line no-console
      console.error('Service failed:', error);
      process.exit(1);
    });
  }
}

/**
 * Decorator for creating standardized service classes
 */
export function StandardizedService<TConfig extends StandardizedServiceConfig>(config: {
  serviceName: string;
  version: string;
  description: string;
  defaultConfigPath: string;
  configSchema: z.ZodSchema<TConfig>;
}) {
  return function <T extends new (...args: unknown[]) => StandardizedSyncService<TConfig>>(
    constructor: T
  ): T {
    // Add static factory methods to the class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (constructor as any).createFactory = (
      hooks?: ServiceLifecycleHooks,
      additionalCommands?: CliCommand[]
    ) => {
      const factoryConfig: ServiceFactoryConfig<TConfig> = {
        serviceName: config.serviceName,
        version: config.version,
        description: config.description,
        defaultConfigPath: config.defaultConfigPath,
        configSchema: config.configSchema,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serviceClass: constructor as any,
        customCommands: [...ServicePatterns.createSyncCommands(), ...(additionalCommands || [])],
        ...(hooks && { lifecycleHooks: hooks }),
      };

      return new ServiceFactory(factoryConfig);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (constructor as any).createMain = (
      hooks?: ServiceLifecycleHooks,
      additionalCommands?: CliCommand[]
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const factory = (constructor as any).createFactory(hooks, additionalCommands);
      return factory.createMainEntryPoint();
    };

    return constructor;
  };
}
