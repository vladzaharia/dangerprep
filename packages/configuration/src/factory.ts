/**
 * Configuration factory for creating standardized service configurations
 */

import { z } from 'zod';

import { StandardSchemas } from './schemas.js';
import { ConfigUtils } from './utils.js';

import { ConfigManager, type ConfigOptions } from './index.js';

/**
 * Factory for creating standardized service configurations
 */
export class ConfigFactory {
  /**
   * Create a sync service configuration manager
   * @param configPath Path to configuration file
   * @param customSchema Custom schema fields specific to the service
   * @param options Configuration options
   * @returns ConfigManager instance for sync service
   */
  static createSyncServiceConfig<T extends z.ZodRawShape>(
    configPath: string,
    customSchema: T,
    options: ConfigOptions = {}
  ) {
    const schema = StandardSchemas.createSyncServiceSchema(customSchema);

    return new ConfigManager(configPath, schema, {
      enableEnvSubstitution: true,
      enableTransformations: true,
      ...options,
    });
  }

  /**
   * Create a network service configuration manager
   * @param configPath Path to configuration file
   * @param customSchema Custom schema fields specific to the service
   * @param options Configuration options
   * @returns ConfigManager instance for network service
   */
  static createNetworkServiceConfig<T extends z.ZodRawShape>(
    configPath: string,
    customSchema: T,
    options: ConfigOptions = {}
  ) {
    const schema = StandardSchemas.createNetworkServiceSchema(customSchema);

    return new ConfigManager(configPath, schema, {
      enableEnvSubstitution: true,
      enableTransformations: true,
      ...options,
    });
  }

  /**
   * Create a storage service configuration manager
   * @param configPath Path to configuration file
   * @param customSchema Custom schema fields specific to the service
   * @param options Configuration options
   * @returns ConfigManager instance for storage service
   */
  static createStorageServiceConfig<T extends z.ZodRawShape>(
    configPath: string,
    customSchema: T,
    options: ConfigOptions = {}
  ) {
    const schema = StandardSchemas.createStorageServiceSchema(customSchema);

    return new ConfigManager(configPath, schema, {
      enableEnvSubstitution: true,
      enableTransformations: true,
      ...options,
    });
  }

  /**
   * Create a scheduled service configuration manager
   * @param configPath Path to configuration file
   * @param customSchema Custom schema fields specific to the service
   * @param options Configuration options
   * @returns ConfigManager instance for scheduled service
   */
  static createScheduledServiceConfig<T extends z.ZodRawShape>(
    configPath: string,
    customSchema: T,
    options: ConfigOptions = {}
  ) {
    const schema = StandardSchemas.createScheduledServiceSchema(customSchema);

    return new ConfigManager(configPath, schema, {
      enableEnvSubstitution: true,
      enableTransformations: true,
      ...options,
    });
  }

  /**
   * Create default configuration for sync services
   * @param serviceName Name of the service
   * @param customDefaults Custom default values
   * @returns Default configuration object
   */
  static createSyncServiceDefaults(
    serviceName: string,
    customDefaults: Readonly<Record<string, unknown>> = {}
  ) {
    return ConfigUtils.mergeConfigs(
      {
        metadata: {
          name: serviceName,
          version: '1.0.0',
          description: `${serviceName} sync service`,
        },
        environment: {
          environment: 'production' as const,
          debug: false,
          verbose: false,
          dry_run: false,
          data_directory: './data',
        },
        logging: {
          level: 'INFO' as const,
          format: 'text' as const,
          include_timestamp: true,
          include_level: true,
          include_component: true,
          max_size: '50MB',
          backup_count: 3,
        },
        storage: {
          base_path: './content',
          temp_directory: './temp',
          create_directories: true,
          directory_permissions: '755',
          file_permissions: '644',
        },
        performance: {
          max_concurrent: 3,
          chunk_size: '10MB',
          buffer_size: '64KB',
        },
        health_check: {
          enabled: true,
          interval: '5m',
          timeout: '10s',
        },
        notifications: {
          enabled: true,
          levels: ['ERROR', 'CRITICAL'],
          channels: ['console'],
          rate_limit: {
            max_per_minute: 10,
            max_per_hour: 100,
          },
        },
        content_types: {},
      },
      customDefaults
    );
  }

  /**
   * Create default configuration for network services
   * @param serviceName Name of the service
   * @param customDefaults Custom default values
   * @returns Default configuration object
   */
  static createNetworkServiceDefaults(
    serviceName: string,
    customDefaults: Readonly<Record<string, unknown>> = {}
  ) {
    return ConfigUtils.mergeConfigs(
      {
        metadata: {
          name: serviceName,
          version: '1.0.0',
          description: `${serviceName} network service`,
        },
        environment: {
          environment: 'production' as const,
          debug: false,
          verbose: false,
          data_directory: './data',
        },
        logging: {
          level: 'INFO' as const,
          format: 'text' as const,
          include_timestamp: true,
          include_level: true,
          include_component: true,
          max_size: '50MB',
          backup_count: 3,
        },
        network: {
          timeout: '30s',
          retry_attempts: 3,
          retry_delay: '1s',
          max_retry_delay: '30s',
          headers: {},
        },
        performance: {
          max_concurrent: 5,
          chunk_size: '1MB',
          buffer_size: '64KB',
        },
        health_check: {
          enabled: true,
          interval: '5m',
          timeout: '10s',
        },
        notifications: {
          enabled: true,
          levels: ['ERROR', 'CRITICAL'],
          channels: ['console'],
          rate_limit: {
            max_per_minute: 10,
            max_per_hour: 100,
          },
        },
      },
      customDefaults
    );
  }

  /**
   * Create environment-specific configuration overrides
   * @param environment Target environment
   * @returns Environment-specific configuration overrides
   */
  static createEnvironmentOverrides(
    environment: 'development' | 'staging' | 'production'
  ): Record<string, unknown> {
    const baseOverrides: Record<string, unknown> = {
      environment: {
        environment,
        debug: false,
        verbose: false,
        dry_run: false,
        data_directory: './data',
      },
    };

    switch (environment) {
      case 'development':
        return ConfigUtils.mergeConfigs(baseOverrides, {
          environment: {
            environment,
            debug: true,
            verbose: true,
            dry_run: false,
            data_directory: './data',
          },
          logging: {
            level: 'DEBUG' as const,
            format: 'text' as const,
          },
          performance: {
            max_concurrent: 1, // Easier debugging
          },
        });

      case 'staging':
        return ConfigUtils.mergeConfigs(baseOverrides, {
          environment: {
            environment,
            debug: false,
            verbose: false,
            dry_run: false,
            data_directory: './data',
          },
          logging: {
            level: 'INFO' as const,
            format: 'json' as const,
          },
          notifications: {
            levels: ['WARN', 'ERROR', 'CRITICAL'],
          },
        });

      case 'production':
        return ConfigUtils.mergeConfigs(baseOverrides, {
          environment: {
            environment,
            debug: false,
            verbose: false,
            dry_run: false,
            data_directory: './data',
          },
          logging: {
            level: 'INFO' as const,
            format: 'json' as const,
          },
          notifications: {
            levels: ['ERROR', 'CRITICAL'],
          },
          health_check: {
            enabled: true,
          },
        });

      default:
        return baseOverrides;
    }
  }

  /**
   * Create configuration with environment-specific defaults
   * @param serviceName Name of the service
   * @param environment Target environment
   * @param customDefaults Custom default values
   * @returns Configuration with environment-specific defaults
   */
  static createEnvironmentConfig(
    serviceName: string,
    environment: 'development' | 'staging' | 'production',
    customDefaults: Readonly<Record<string, unknown>> = {}
  ) {
    const baseDefaults = ConfigFactory.createSyncServiceDefaults(serviceName);
    const envOverrides = ConfigFactory.createEnvironmentOverrides(environment);

    return ConfigUtils.mergeConfigs(baseDefaults, envOverrides, customDefaults);
  }

  /**
   * Resolve configuration file path with environment-specific naming
   * @param basePath Base configuration file path
   * @param environment Target environment
   * @returns Environment-specific configuration file path
   */
  static resolveConfigPath(basePath: string, environment?: string): string {
    if (!environment) {
      return basePath;
    }

    const pathParts = basePath.split('.');
    const extension = pathParts.pop();
    const nameWithoutExt = pathParts.join('.');

    return `${nameWithoutExt}.${environment}.${extension}`;
  }
}
