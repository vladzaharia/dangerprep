/**
 * Configuration utilities for parsing, transformation, and standardization
 */

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
    const value = parseFloat(valueStr!);
    
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
      throw new Error(`Invalid bandwidth format: ${bandwidth}. Expected format like "25MB/s", "100KB/s"`);
    }

    const [, valueStr, unit] = match;
    return ConfigUtils.parseSize(`${valueStr!}${unit!}`);
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
      const value = parseFloat(valueStr!);
      
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
      throw new Error(`Invalid duration format: ${duration}. Expected format like "5m", "1h30m", "30s"`);
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
      const unitValue = unitValues[i]!;
      if (bytes >= unitValue) {
        const value = bytes / unitValue;
        return `${value.toFixed(decimals)} ${units[i]}`;
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
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = ConfigUtils.processEnvVars(value);
      }
      return result;
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
  static mergeConfigs<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
    const result = { ...target } as T;

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
          (result as any)[key] = ConfigUtils.mergeConfigs(result[key as keyof T] as any, value);
        } else {
          // Direct assignment for primitives, arrays, and null values
          (result as any)[key] = value;
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
