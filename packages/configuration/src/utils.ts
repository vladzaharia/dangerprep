/**
 * Configuration utilities for parsing, transformation, and standardization
 */

import { Result, safeAsync } from '@dangerprep/errors';
import { z } from 'zod';

/**
 * Size units and their byte multipliers
 */
const SIZE_UNITS = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
  PB: 1024 ** 5,
} as const;

export type SizeUnit = keyof typeof SIZE_UNITS;

/**
 * Time units and their millisecond multipliers
 */
const TIME_UNITS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
} as const;

export type TimeUnit = keyof typeof TIME_UNITS;

/**
 * Readable size constants for use in configuration defaults
 */
export const SIZE = {
  BYTE: SIZE_UNITS.B,
  KB: SIZE_UNITS.KB,
  MB: SIZE_UNITS.MB,
  GB: SIZE_UNITS.GB,
  TB: SIZE_UNITS.TB,
  PB: SIZE_UNITS.PB,
} as const;

/**
 * Readable time constants for use in configuration defaults
 */
export const TIME = {
  MILLISECOND: TIME_UNITS.ms,
  SECOND: TIME_UNITS.s,
  MINUTE: TIME_UNITS.m,
  HOUR: TIME_UNITS.h,
  DAY: TIME_UNITS.d,
  WEEK: TIME_UNITS.w,
} as const;

/**
 * Configuration parsing and transformation utilities
 */
export class ConfigUtils {
  /**
   * Parse size string to bytes
   * @param size Size string like "2TB", "500MB", "1.5GB"
   * @returns Size in bytes
   */
  static parseSize(size: string | number): number {
    if (typeof size === 'number') {
      return size;
    }

    const sizeStr = size.toString().trim().toUpperCase();
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)?$/);

    if (!match) {
      throw new Error(`Invalid size format: ${size}. Expected format like "2TB", "500MB", "1.5GB"`);
    }

    const [, valueStr, unit = 'B'] = match;
    if (!valueStr) {
      throw new Error('Invalid size format: missing value');
    }
    const value = parseFloat(valueStr);

    if (isNaN(value) || value < 0) {
      throw new Error(`Invalid size value: ${valueStr}`);
    }

    const multiplier = SIZE_UNITS[unit as keyof typeof SIZE_UNITS];
    if (multiplier === undefined) {
      const validUnits = Object.keys(SIZE_UNITS).join(', ');
      throw new Error(`Invalid size unit: ${unit}. Valid units: ${validUnits}`);
    }

    return Math.floor(value * multiplier);
  }

  /**
   * Parse bandwidth string to bytes per second
   * @param bandwidth Bandwidth string like "25MB/s", "100KB/s"
   * @returns Bandwidth in bytes per second
   */
  static parseBandwidth(bandwidth: string | number): number {
    if (typeof bandwidth === 'number') {
      return bandwidth;
    }

    const bandwidthStr = bandwidth.toString().trim().toUpperCase();
    const match = bandwidthStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)\/S$/);

    if (!match) {
      throw new Error(
        `Invalid bandwidth format: ${bandwidth}. Expected format like "25MB/s", "100KB/s"`
      );
    }

    const [, valueStr, unit] = match;
    if (!valueStr || !unit) {
      throw new Error('Invalid bandwidth format: missing value or unit');
    }
    return ConfigUtils.parseSize(`${valueStr}${unit}`);
  }

  /**
   * Parse duration string to milliseconds
   * @param duration Duration string like "5m", "1h30m", "30s"
   * @returns Duration in milliseconds
   */
  static parseDuration(duration: string | number): number {
    if (typeof duration === 'number') {
      return duration;
    }

    const durationStr = duration.toString().trim().toLowerCase();

    // Handle simple numeric values (assume milliseconds)
    if (/^\d+$/.test(durationStr)) {
      return parseInt(durationStr, 10);
    }

    // Parse complex duration strings like "1h30m15s"
    const matches = durationStr.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g);
    let totalMs = 0;

    for (const match of matches) {
      const [, valueStr, unit] = match;
      if (!valueStr) {
        throw new Error('Invalid duration format: missing value');
      }
      const value = parseFloat(valueStr);

      if (isNaN(value) || value < 0) {
        throw new Error(`Invalid duration value: ${valueStr}`);
      }

      const multiplier = TIME_UNITS[unit as keyof typeof TIME_UNITS];
      if (multiplier === undefined) {
        const validUnits = Object.keys(TIME_UNITS).join(', ');
        throw new Error(`Invalid duration unit: ${unit}. Valid units: ${validUnits}`);
      }

      totalMs += value * multiplier;
    }

    if (totalMs === 0) {
      throw new Error(
        `Invalid duration format: ${duration}. Expected format like "5m", "1h30m", "30s"`
      );
    }

    return Math.floor(totalMs);
  }

  /**
   * Format bytes to human-readable size
   * @param bytes Size in bytes
   * @param decimals Number of decimal places
   * @returns Formatted size string
   */
  static formatSize(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 B';

    const units = Object.keys(SIZE_UNITS).reverse();
    const unitValues = Object.values(SIZE_UNITS).reverse();

    for (let i = 0; i < units.length; i++) {
      const unitValue = unitValues[i];
      if (unitValue !== undefined && bytes >= unitValue) {
        const value = bytes / unitValue;
        const unit = units[i];
        if (unit !== undefined) {
          return `${value.toFixed(decimals)} ${unit}`;
        }
      }
    }

    return `${bytes} B`;
  }

  /**
   * Format milliseconds to human-readable duration
   * @param ms Duration in milliseconds
   * @returns Formatted duration string
   */
  static formatDuration(ms: number): string {
    if (ms === 0) return '0ms';

    const units = [
      { unit: 'w', value: TIME_UNITS.w },
      { unit: 'd', value: TIME_UNITS.d },
      { unit: 'h', value: TIME_UNITS.h },
      { unit: 'm', value: TIME_UNITS.m },
      { unit: 's', value: TIME_UNITS.s },
      { unit: 'ms', value: TIME_UNITS.ms },
    ];

    const parts: string[] = [];
    let remaining = ms;

    for (const { unit, value } of units) {
      if (remaining >= value) {
        const count = Math.floor(remaining / value);
        parts.push(`${count}${unit}`);
        remaining %= value;
      }
    }

    return parts.join(' ') || '0ms';
  }

  /**
   * Process environment variable substitution in configuration
   * @param obj Configuration object
   * @returns Configuration with environment variables substituted
   */
  static processEnvVars<T>(obj: T): T {
    if (typeof obj === 'string') {
      return ConfigUtils.substituteEnvVars(obj) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => ConfigUtils.processEnvVars(item)) as T;
    }

    if (obj && typeof obj === 'object') {
      const result = {} as Record<string, unknown>;
      for (const [key, value] of Object.entries(obj)) {
        result[key] = ConfigUtils.processEnvVars(value);
      }
      return result as T;
    }

    return obj;
  }

  /**
   * Substitute environment variables in a string
   * @param str String with environment variable placeholders
   * @returns String with variables substituted
   */
  static substituteEnvVars(str: string): string {
    return str.replace(/\$\{([^}]+)\}/g, (_match, varExpr) => {
      const [varName, defaultValue] = varExpr.split(':-');
      const envValue = process.env[varName.trim()];

      if (envValue !== undefined) {
        return envValue;
      }

      if (defaultValue !== undefined) {
        return defaultValue.trim();
      }

      throw new Error(`Required environment variable not set: ${varName}`);
    });
  }

  /**
   * Normalize file extensions array
   * @param extensions Array of file extensions
   * @returns Normalized extensions (lowercase, with dots)
   */
  static normalizeExtensions(extensions: string[]): string[] {
    return extensions.map(ext => {
      const normalized = ext.toLowerCase().trim();
      return normalized.startsWith('.') ? normalized : `.${normalized}`;
    });
  }

  /**
   * Validate cron expression
   * @param cronExpr Cron expression string
   * @returns True if valid cron expression
   */
  static validateCronExpression(cronExpr: string): boolean {
    // Basic cron validation (5 or 6 fields)
    const parts = cronExpr.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
  }

  /**
   * Merge configuration objects with deep merging
   * @param target Target configuration object
   * @param sources Source configuration objects to merge
   * @returns Merged configuration
   */
  static mergeConfigs<T extends Record<string, unknown>>(target: T, ...sources: Partial<T>[]): T {
    const result = { ...target };

    for (const source of sources) {
      for (const [key, value] of Object.entries(source)) {
        if (value === undefined) {
          continue;
        }

        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          result[key as keyof T] &&
          typeof result[key as keyof T] === 'object' &&
          !Array.isArray(result[key as keyof T])
        ) {
          // Deep merge objects
          (result as Record<string, unknown>)[key] = ConfigUtils.mergeConfigs(
            result[key as keyof T] as Record<string, unknown>,
            value as Record<string, unknown>
          );
        } else {
          // Direct assignment for primitives, arrays, and null values
          (result as Record<string, unknown>)[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Create a Zod transformer for size values
   * @returns Zod transformer that parses size strings to bytes
   */
  static sizeTransformer() {
    return z.union([z.string(), z.number()]).transform(ConfigUtils.parseSize);
  }

  /**
   * Create a Zod transformer for bandwidth values
   * @returns Zod transformer that parses bandwidth strings to bytes per second
   */
  static bandwidthTransformer() {
    return z.union([z.string(), z.number()]).transform(ConfigUtils.parseBandwidth);
  }

  /**
   * Create a Zod transformer for duration values
   * @returns Zod transformer that parses duration strings to milliseconds
   */
  static durationTransformer() {
    return z.union([z.string(), z.number()]).transform(ConfigUtils.parseDuration);
  }

  /**
   * Create a Zod transformer for file extensions
   * @returns Zod transformer that normalizes file extensions
   */
  static extensionsTransformer() {
    return z.array(z.string()).transform(ConfigUtils.normalizeExtensions);
  }

  /**
   * Create a Zod validator for cron expressions
   * @returns Zod schema that validates cron expressions
   */
  static cronValidator() {
    return z.string().refine(ConfigUtils.validateCronExpression, {
      message: 'Invalid cron expression format',
    });
  }
}

// Type guards for runtime validation
export const isSizeUnit = (value: string): value is SizeUnit =>
  Object.keys(SIZE_UNITS).includes(value);

export const isTimeUnit = (value: string): value is TimeUnit =>
  Object.keys(TIME_UNITS).includes(value);

// Utility types for configuration
export type ConfigValue = string | number | boolean | null | undefined;

// Fix circular reference with recursive interface
export interface ConfigObject {
  readonly [key: string]: ConfigValue | ConfigObject | readonly ConfigValue[];
}

// Result types for configuration operations
export type ConfigResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

// Template literal types for better string typing
export type SizeString = `${number}${SizeUnit}`;
export type DurationString = `${number}${TimeUnit}`;
export type BandwidthString = `${number}${SizeUnit}/s`;

/**
 * Configuration validation error details
 */
export interface ConfigValidationError {
  readonly field: string;
  readonly message: string;
  readonly value: unknown;
  readonly code: string;
}

/**
 * Configuration merge strategy
 */
export type ConfigMergeStrategy = 'replace' | 'merge' | 'append' | 'prepend';

/**
 * Configuration builder options
 */
export interface ConfigBuilderOptions<T> {
  /** Default configuration values */
  defaults?: Partial<T>;
  /** Environment variable prefix */
  envPrefix?: string;
  /** Whether to allow unknown properties */
  allowUnknown?: boolean;
  /** Custom validation functions */
  validators?: Array<(config: T) => ConfigValidationError[]>;
  /** Merge strategy for nested objects */
  mergeStrategy?: ConfigMergeStrategy;
}

/**
 * Advanced configuration builder with validation and type safety
 */
export class ConfigurationBuilder<T extends Record<string, unknown>> {
  private schema: z.ZodType<T>;
  private options: ConfigBuilderOptions<T>;
  private sources: Array<() => Promise<Partial<T>>> = [];

  constructor(schema: z.ZodType<T>, options: ConfigBuilderOptions<T> = {}) {
    this.schema = schema;
    this.options = {
      allowUnknown: false,
      mergeStrategy: 'merge',
      ...options,
    };
  }

  /**
   * Add a configuration source
   */
  addSource(source: () => Promise<Partial<T>>): this {
    this.sources.push(source);
    return this;
  }

  /**
   * Add a file source
   */
  addFileSource(filePath: string): this {
    return this.addSource(async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const ext = path.extname(filePath).toLowerCase();

        switch (ext) {
          case '.json':
            return JSON.parse(content);
          case '.yaml':
          case '.yml':
            // For now, only support JSON. YAML support can be added later if needed
            throw new Error(`YAML support not implemented. Please use JSON format.`);
          default:
            throw new Error(`Unsupported file format: ${ext}. Supported formats: .json`);
        }
      } catch (error) {
        throw new Error(`Failed to load config from ${filePath}: ${error}`);
      }
    });
  }

  /**
   * Add environment variables source
   */
  addEnvSource(): this {
    return this.addSource(async () => {
      const envConfig: Record<string, unknown> = {};
      const prefix = this.options.envPrefix ? `${this.options.envPrefix}_` : '';

      for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith(prefix)) {
          const configKey = key.slice(prefix.length).toLowerCase();

          // Try to parse as JSON, fallback to string
          if (value !== undefined) {
            try {
              envConfig[configKey] = JSON.parse(value);
            } catch {
              envConfig[configKey] = value;
            }
          }
        }
      }

      return envConfig as Partial<T>;
    });
  }

  /**
   * Add object source
   */
  addObjectSource(obj: Partial<T>): this {
    return this.addSource(async () => obj);
  }

  /**
   * Build and validate configuration
   */
  async build(): Promise<Result<T>> {
    return safeAsync(async () => {
      // Load all sources
      const sourceResults = await Promise.all(
        this.sources.map(async (source, index) => {
          try {
            return await source();
          } catch (error) {
            throw new Error(`Source ${index} failed: ${error}`);
          }
        })
      );

      // Start with defaults
      let config = this.options.defaults ? { ...this.options.defaults } : {};

      // Merge all sources
      for (const sourceConfig of sourceResults) {
        config = this.mergeConfigurations(config, sourceConfig);
      }

      // Process environment variables
      config = ConfigUtils.processEnvVars(config);

      // Validate with schema
      const validationResult = this.schema.safeParse(config);
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          value: undefined, // Zod doesn't provide input value in errors
          code: err.code,
        }));

        throw new Error(`Configuration validation failed: ${JSON.stringify(errors, null, 2)}`);
      }

      const validatedConfig = validationResult.data;

      // Run custom validators
      if (this.options.validators) {
        const customErrors: ConfigValidationError[] = [];

        for (const validator of this.options.validators) {
          const errors = validator(validatedConfig);
          customErrors.push(...errors);
        }

        if (customErrors.length > 0) {
          throw new Error(`Custom validation failed: ${JSON.stringify(customErrors, null, 2)}`);
        }
      }

      return validatedConfig;
    });
  }

  /**
   * Merge configurations based on strategy
   */
  private mergeConfigurations(target: Partial<T>, source: Partial<T>): Partial<T> {
    switch (this.options.mergeStrategy) {
      case 'replace':
        return { ...source };
      case 'merge':
        return ConfigUtils.mergeConfigs(
          target as Record<string, unknown>,
          source as Record<string, unknown>
        ) as Partial<T>;
      case 'append':
        // For arrays, append source to target
        return this.mergeWithArrayStrategy(target, source, 'append');
      case 'prepend':
        // For arrays, prepend source to target
        return this.mergeWithArrayStrategy(target, source, 'prepend');
      default:
        return ConfigUtils.mergeConfigs(
          target as Record<string, unknown>,
          source as Record<string, unknown>
        ) as Partial<T>;
    }
  }

  /**
   * Merge configurations with array-specific strategy
   */
  private mergeWithArrayStrategy(
    target: Partial<T>,
    source: Partial<T>,
    strategy: 'append' | 'prepend'
  ): Partial<T> {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (Array.isArray(value) && Array.isArray(result[key as keyof T])) {
        const targetArray = result[key as keyof T] as unknown[];
        const sourceArray = value;

        (result as Record<string, unknown>)[key] =
          strategy === 'append'
            ? [...targetArray, ...sourceArray]
            : [...sourceArray, ...targetArray];
      } else {
        (result as Record<string, unknown>)[key] = value;
      }
    }

    return result;
  }

  /**
   * Create a configuration builder with common patterns
   */
  static create<T extends Record<string, unknown>>(
    schema: z.ZodType<T>,
    options: ConfigBuilderOptions<T> = {}
  ): ConfigurationBuilder<T> {
    return new ConfigurationBuilder(schema, options);
  }

  /**
   * Create a service configuration builder with standard patterns
   */
  static createServiceConfig<T extends Record<string, unknown>>(
    schema: z.ZodType<T>,
    serviceName: string,
    configPath?: string
  ): ConfigurationBuilder<T> {
    const builder = new ConfigurationBuilder(schema, {
      envPrefix: serviceName.toUpperCase(),
      mergeStrategy: 'merge',
    });

    // Add default config file if provided
    if (configPath) {
      builder.addFileSource(configPath);
    }

    // Add environment variables
    builder.addEnvSource();

    return builder;
  }
}
