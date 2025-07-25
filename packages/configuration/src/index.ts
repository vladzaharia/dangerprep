import { promises as fs } from 'fs';
import path from 'path';

import { fileExists, ensureDirectory } from '@dangerprep/files';
import type { Logger } from '@dangerprep/logging';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { z } from 'zod';

import { ConfigUtils } from './utils.js';

/**
 * Options for configuration management
 */
export interface ConfigOptions {
  /** Logger instance for configuration operations */
  logger?: Logger;
  /** Whether to create parent directories if they don't exist */
  createDirs?: boolean;
  /** Whether to enable environment variable substitution */
  enableEnvSubstitution?: boolean;
  /** Whether to enable automatic transformations */
  enableTransformations?: boolean;
  /** Default configuration to merge with loaded config */
  defaults?: Record<string, unknown>;
  /** Environment variable prefix for automatic env loading */
  envPrefix?: string;
  /** YAML dump options */
  yamlOptions?: {
    indent?: number;
    lineWidth?: number;
    noRefs?: boolean;
  };
}

/**
 * Configuration validation error with detailed information
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: z.ZodError
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }

  /**
   * Get formatted error details
   */
  getFormattedErrors(): string[] {
    return this.errors.issues.map(error => {
      const path = error.path.join('.');
      return `${path}: ${error.message}`;
    });
  }
}

/**
 * Generic configuration manager with TypeScript-first validation
 *
 * Provides:
 * - YAML file loading and saving
 * - Zod-based schema validation
 * - Type-safe configuration access
 * - Default configuration creation
 * - Configuration path utilities
 */
export class ConfigManager<T> {
  private config: T | null = null;
  private readonly logger: Logger | undefined;
  private readonly options: {
    logger?: Logger;
    createDirs: boolean;
    enableEnvSubstitution: boolean;
    enableTransformations: boolean;
    defaults?: Record<string, unknown>;
    envPrefix: string | undefined;
    yamlOptions: {
      indent: number;
      lineWidth: number;
      noRefs: boolean;
    };
  };

  constructor(
    private readonly configPath: string,
    private readonly schema: z.ZodSchema<T>,
    options: ConfigOptions = {}
  ) {
    this.logger = options.logger;
    this.options = {
      ...(options.logger && { logger: options.logger }),
      createDirs: options.createDirs ?? true,
      enableEnvSubstitution: options.enableEnvSubstitution ?? false,
      enableTransformations: options.enableTransformations ?? false,
      ...(options.defaults && { defaults: options.defaults }),
      envPrefix: options.envPrefix,
      yamlOptions: {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        ...options.yamlOptions,
      },
    };
  }

  /**
   * Load configuration from file
   */
  async loadConfig(): Promise<T> {
    try {
      if (!(await fileExists(this.configPath))) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const configContent = await fs.readFile(this.configPath, 'utf8');
      let parsedConfig = yamlLoad(configContent);

      // Apply environment variable substitution if enabled
      if (this.options.enableEnvSubstitution) {
        parsedConfig = ConfigUtils.processEnvVars(parsedConfig);
      }

      // Merge with defaults if provided
      if (this.options.defaults) {
        parsedConfig = ConfigUtils.mergeConfigs(
          this.options.defaults,
          parsedConfig as Record<string, unknown>
        );
      }

      // Validate configuration using Zod schema
      const result = this.schema.safeParse(parsedConfig);

      if (!result.success) {
        throw new ConfigValidationError(
          `Configuration validation failed for ${this.configPath}`,
          result.error
        );
      }

      this.config = result.data;
      this.logger?.info(`Configuration loaded from: ${this.configPath}`);

      return result.data;
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        this.logger?.error(`Configuration validation failed: ${error.message}`);
        this.logger?.error(`Validation errors: ${error.getFormattedErrors().join(', ')}`);
      } else {
        this.logger?.error(`Failed to load configuration: ${error}`);
      }
      throw error;
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: T): Promise<void> {
    try {
      // Validate configuration before saving
      const result = this.schema.safeParse(config);

      if (!result.success) {
        throw new ConfigValidationError(
          `Configuration validation failed before saving`,
          result.error
        );
      }

      const yamlContent = yamlDump(result.data, this.options.yamlOptions);

      if (this.options.createDirs) {
        await ensureDirectory(path.dirname(this.configPath));
      }

      await fs.writeFile(this.configPath, yamlContent, 'utf8');

      this.config = result.data;
      this.logger?.info(`Configuration saved to: ${this.configPath}`);
    } catch (error) {
      if (error instanceof ConfigValidationError) {
        this.logger?.error(`Configuration validation failed: ${error.message}`);
        this.logger?.error(`Validation errors: ${error.getFormattedErrors().join(', ')}`);
      } else {
        this.logger?.error(`Failed to save configuration: ${error}`);
      }
      throw error;
    }
  }

  /**
   * Get current configuration (must be loaded first)
   */
  getConfig(): T {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Check if configuration is loaded
   */
  isLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * Validate configuration without loading from file
   */
  validateConfig(config: unknown): T {
    const result = this.schema.safeParse(config);

    if (!result.success) {
      throw new ConfigValidationError('Configuration validation failed', result.error);
    }

    return result.data;
  }

  /**
   * Load configuration with defaults
   * @param defaults Default configuration to merge
   * @returns Parsed and validated configuration
   */
  async loadWithDefaults(defaults: Partial<T>): Promise<T> {
    // Create a temporary config manager with the merged defaults
    const tempOptions: ConfigOptions = {
      createDirs: this.options.createDirs,
      enableEnvSubstitution: this.options.enableEnvSubstitution,
      enableTransformations: this.options.enableTransformations,
      defaults: { ...this.options.defaults, ...defaults } as Record<string, unknown>,
      ...(this.options.envPrefix && { envPrefix: this.options.envPrefix }),
      ...(this.options.logger && { logger: this.options.logger }),
      yamlOptions: this.options.yamlOptions,
    };

    const tempConfigManager = new ConfigManager(this.configPath, this.schema, tempOptions);
    return await tempConfigManager.loadConfig();
  }

  /**
   * Validate and transform configuration object
   * @param config Configuration object to validate
   * @returns Validated and transformed configuration
   */
  validateAndTransform(config: unknown): T {
    let processedConfig = config;

    // Apply environment variable substitution if enabled
    if (this.options.enableEnvSubstitution) {
      processedConfig = ConfigUtils.processEnvVars(processedConfig);
    }

    // Merge with defaults if provided
    if (this.options.defaults) {
      processedConfig = ConfigUtils.mergeConfigs(
        this.options.defaults,
        processedConfig as Record<string, unknown>
      );
    }

    const result = this.schema.safeParse(processedConfig);
    if (!result.success) {
      throw new ConfigValidationError('Configuration validation failed', result.error);
    }

    return result.data;
  }

  /**
   * Create default configuration file from provided default values
   */
  async createDefaultConfig(defaultConfig: T): Promise<void> {
    // Validate default configuration
    const validatedConfig = this.validateConfig(defaultConfig);

    // Save the validated configuration
    await this.saveConfig(validatedConfig);

    this.logger?.info(`Default configuration created at: ${this.configPath}`);
  }

  /**
   * Check if configuration file exists
   */
  async configExists(): Promise<boolean> {
    return fileExists(this.configPath);
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Reload configuration from file
   */
  async reloadConfig(): Promise<T> {
    return this.loadConfig();
  }

  /**
   * Update configuration with partial values
   */
  async updateConfig(updates: Partial<T>): Promise<T> {
    const currentConfig = this.getConfig();
    const updatedConfig = { ...currentConfig, ...updates };

    await this.saveConfig(updatedConfig);
    return updatedConfig;
  }

  /**
   * Get configuration value by dot-notation path
   */
  getConfigValue<K>(path: string): K | undefined {
    const config = this.getConfig();
    const parts = path.split('.');

    let current: unknown = config;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current as K;
  }

  /**
   * Set configuration value by dot-notation path
   */
  setConfigValue(path: string, value: unknown): void {
    const config = this.getConfig() as Record<string, unknown>;
    const parts = path.split('.');
    const lastPart = parts.pop();

    if (!lastPart) {
      throw new Error('Invalid configuration path');
    }

    let current = config;
    for (const part of parts) {
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[lastPart] = value;
    this.config = config as T;
  }
}

/**
 * Utility function to create a configuration manager
 */
export function createConfigManager<T>(
  configPath: string,
  schema: z.ZodSchema<T>,
  options?: ConfigOptions
): ConfigManager<T> {
  return new ConfigManager(configPath, schema, options);
}

// Re-export Zod for schema creation
export { z } from 'zod';

// Export configuration utilities and standard schemas
export { ConfigUtils, ConfigurationBuilder, SIZE, TIME } from './utils.js';
export * from './schemas.js';
export { ConfigFactory } from './factory.js';
