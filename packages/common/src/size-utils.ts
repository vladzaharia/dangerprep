/**
 * Shared size and time utilities
 *
 * Consolidated from files and configuration packages to provide
 * consistent size/time parsing, formatting, and conversion utilities.
 */

/**
 * Size units mapping to bytes
 */
export const SIZE_UNITS = {
  B: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
  PB: 1024 * 1024 * 1024 * 1024 * 1024,
} as const;

export type SizeUnit = keyof typeof SIZE_UNITS;

/**
 * Time units mapping to milliseconds
 */
export const TIME_UNITS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
} as const;

export type TimeUnit = keyof typeof TIME_UNITS;

/**
 * Parse size string (e.g., "1.5GB", "500MB") to bytes
 */
export function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGTPB]?B)$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid size format: ${sizeStr}. Expected format: "1.5GB", "500MB", etc.`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase() as SizeUnit;

  if (!(unit in SIZE_UNITS)) {
    throw new Error(`Unknown size unit: ${unit}`);
  }

  return value * SIZE_UNITS[unit];
}

/**
 * Format bytes to human-readable string (e.g., "1.50 GB")
 */
export function formatSize(bytes: number, precision: number = 2): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) throw new Error('Size cannot be negative');

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

/**
 * Parse time string (e.g., "30s", "5m", "2h") to milliseconds
 */
export function parseTime(timeStr: string): number {
  const match = timeStr.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid time format: ${timeStr}. Expected format: "30s", "5m", "2h", etc.`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase() as TimeUnit;

  if (!(unit in TIME_UNITS)) {
    throw new Error(`Unknown time unit: ${unit}`);
  }

  return value * TIME_UNITS[unit];
}

/**
 * Format milliseconds to human-readable string (e.g., "1.5 hours")
 */
export function formatTime(ms: number, precision: number = 1): string {
  if (ms === 0) return '0 ms';
  if (ms < 0) throw new Error('Time cannot be negative');

  const units = [
    { name: 'week', plural: 'weeks', value: TIME_UNITS.w },
    { name: 'day', plural: 'days', value: TIME_UNITS.d },
    { name: 'hour', plural: 'hours', value: TIME_UNITS.h },
    { name: 'minute', plural: 'minutes', value: TIME_UNITS.m },
    { name: 'second', plural: 'seconds', value: TIME_UNITS.s },
    { name: 'millisecond', plural: 'milliseconds', value: TIME_UNITS.ms },
  ];

  for (const unit of units) {
    if (ms >= unit.value) {
      const value = ms / unit.value;
      const unitName = value === 1 ? unit.name : unit.plural;
      return `${value.toFixed(precision)} ${unitName}`;
    }
  }

  return `${ms} ms`;
}

/**
 * Convert between size units
 */
export function convertSize(value: number, fromUnit: SizeUnit, toUnit: SizeUnit): number {
  const bytes = value * SIZE_UNITS[fromUnit];
  return bytes / SIZE_UNITS[toUnit];
}

/**
 * Convert between time units
 */
export function convertTime(value: number, fromUnit: TimeUnit, toUnit: TimeUnit): number {
  const ms = value * TIME_UNITS[fromUnit];
  return ms / TIME_UNITS[toUnit];
}

/**
 * Validate size string format
 */
export function isValidSizeString(sizeStr: string): boolean {
  return /^\d+(?:\.\d+)?\s*[KMGTPB]?B$/i.test(sizeStr);
}

/**
 * Validate time string format
 */
export function isValidTimeString(timeStr: string): boolean {
  return /^\d+(?:\.\d+)?\s*(ms|s|m|h|d|w)$/i.test(timeStr);
}

/**
 * Get the largest appropriate unit for a size
 */
export function getBestSizeUnit(bytes: number): SizeUnit {
  const units: SizeUnit[] = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return units[unitIndex] || 'B';
}

/**
 * Get the largest appropriate unit for a time duration
 */
export function getBestTimeUnit(ms: number): TimeUnit {
  const units = [
    { unit: 'w' as const, value: TIME_UNITS.w },
    { unit: 'd' as const, value: TIME_UNITS.d },
    { unit: 'h' as const, value: TIME_UNITS.h },
    { unit: 'm' as const, value: TIME_UNITS.m },
    { unit: 's' as const, value: TIME_UNITS.s },
    { unit: 'ms' as const, value: TIME_UNITS.ms },
  ];

  for (const { unit, value } of units) {
    if (ms >= value) {
      return unit;
    }
  }

  return 'ms';
}

/**
 * Size utilities object for easier importing
 */
export const SizeUtils = {
  parse: parseSize,
  format: formatSize,
  convert: convertSize,
  isValid: isValidSizeString,
  getBestUnit: getBestSizeUnit,
  units: SIZE_UNITS,
} as const;

/**
 * Time utilities object for easier importing
 */
export const TimeUtils = {
  parse: parseTime,
  format: formatTime,
  convert: convertTime,
  isValid: isValidTimeString,
  getBestUnit: getBestTimeUnit,
  units: TIME_UNITS,
} as const;

/**
 * Combined utilities for both size and time
 */
export const UnitUtils = {
  size: SizeUtils,
  time: TimeUtils,
} as const;
