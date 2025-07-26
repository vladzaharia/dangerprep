/**
 * Shared branded types utilities and patterns
 *
 * Provides a consistent way to create branded types across all DangerPrep packages
 * with type guards, factory functions, and validation utilities.
 */

/**
 * Base branded type utility
 */
export type Branded<T, Brand extends string> = T & { readonly __brand: Brand };

/**
 * Branded type factory result
 */
export interface BrandedTypeFactory<T, Brand extends string> {
  /** Type guard function */
  guard: (value: T) => value is Branded<T, Brand>;
  /** Factory function that validates and creates branded type */
  create: (value: T) => Branded<T, Brand>;
  /** Unsafe factory that skips validation (use with caution) */
  unsafe: (value: T) => Branded<T, Brand>;
}

/**
 * Create a branded string type with validation
 */
export function createBrandedString<Brand extends string>(
  brand: Brand,
  validator: (value: string) => boolean,
  errorMessage?: string
): BrandedTypeFactory<string, Brand> {
  const guard = (value: string): value is Branded<string, Brand> => {
    return typeof value === 'string' && validator(value);
  };

  const create = (value: string): Branded<string, Brand> => {
    if (!guard(value)) {
      throw new Error(errorMessage || `Invalid ${brand}: ${value}`);
    }
    return value;
  };

  const unsafe = (value: string): Branded<string, Brand> => {
    return value as Branded<string, Brand>;
  };

  return { guard, create, unsafe };
}

/**
 * Create a branded number type with validation
 */
export function createBrandedNumber<Brand extends string>(
  brand: Brand,
  validator: (value: number) => boolean,
  errorMessage?: string
): BrandedTypeFactory<number, Brand> {
  const guard = (value: number): value is Branded<number, Brand> => {
    return typeof value === 'number' && validator(value);
  };

  const create = (value: number): Branded<number, Brand> => {
    if (!guard(value)) {
      throw new Error(errorMessage || `Invalid ${brand}: ${value}`);
    }
    return value;
  };

  const unsafe = (value: number): Branded<number, Brand> => {
    return value as Branded<number, Brand>;
  };

  return { guard, create, unsafe };
}

/**
 * Common validation functions for branded types
 */
export const BrandedValidators = {
  /** Non-empty string */
  nonEmptyString: (value: string): boolean => typeof value === 'string' && value.length > 0,

  /** Alphanumeric with hyphens and underscores */
  alphanumericId: (value: string): boolean =>
    typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value),

  /** Positive integer */
  positiveInteger: (value: number): boolean =>
    typeof value === 'number' && value > 0 && Number.isInteger(value),

  /** Non-negative integer */
  nonNegativeInteger: (value: number): boolean =>
    typeof value === 'number' && value >= 0 && Number.isInteger(value),

  /** Positive number */
  positiveNumber: (value: number): boolean =>
    typeof value === 'number' && value > 0 && Number.isFinite(value),

  /** Non-negative number */
  nonNegativeNumber: (value: number): boolean =>
    typeof value === 'number' && value >= 0 && Number.isFinite(value),

  /** Number within range */
  numberInRange:
    (min: number, max: number) =>
    (value: number): boolean =>
      typeof value === 'number' && value >= min && value <= max && Number.isFinite(value),

  /** String matching pattern */
  stringPattern:
    (pattern: RegExp) =>
    (value: string): boolean =>
      typeof value === 'string' && pattern.test(value),

  /** File path (doesn't end with /) */
  filePath: (value: string): boolean =>
    typeof value === 'string' && value.length > 0 && !value.endsWith('/'),

  /** Directory path */
  directoryPath: (value: string): boolean => typeof value === 'string' && value.length > 0,

  /** File extension (starts with .) */
  fileExtension: (value: string): boolean =>
    typeof value === 'string' && value.startsWith('.') && value.length > 1,

  /** MIME type format */
  mimeType: (value: string): boolean =>
    typeof value === 'string' && /^[a-z]+\/[a-z0-9\-+.]+$/i.test(value),

  /** Size string format (e.g., "1.5GB", "500MB") */
  sizeString: (value: string): boolean =>
    typeof value === 'string' && /^\d+(?:\.\d+)?\s*[KMGT]?B$/i.test(value),

  /** Timeout value (positive, max 5 minutes) */
  timeout: (value: number): boolean => typeof value === 'number' && value > 0 && value <= 300000,

  /** Percentage (0-100) */
  percentage: (value: number): boolean => typeof value === 'number' && value >= 0 && value <= 100,
};

/**
 * Pre-built common branded types used across packages
 */

// Component/Service names
export const ComponentName = createBrandedString(
  'ComponentName',
  BrandedValidators.alphanumericId,
  'Component name must be alphanumeric with hyphens/underscores only'
);
export type ComponentName = Branded<string, 'ComponentName'>;

// File system types
export const FilePath = createBrandedString(
  'FilePath',
  BrandedValidators.filePath,
  'File path must not end with /'
);
export type FilePath = Branded<string, 'FilePath'>;

export const DirectoryPath = createBrandedString(
  'DirectoryPath',
  BrandedValidators.directoryPath,
  'Directory path cannot be empty'
);
export type DirectoryPath = Branded<string, 'DirectoryPath'>;

export const FileExtension = createBrandedString(
  'FileExtension',
  BrandedValidators.fileExtension,
  'File extension must start with . and have content'
);
export type FileExtension = Branded<string, 'FileExtension'>;

export const MimeType = createBrandedString(
  'MimeType',
  BrandedValidators.mimeType,
  'Invalid MIME type format'
);
export type MimeType = Branded<string, 'MimeType'>;

export const SizeString = createBrandedString(
  'SizeString',
  BrandedValidators.sizeString,
  'Invalid size string format (e.g., "1.5GB", "500MB")'
);
export type SizeString = Branded<string, 'SizeString'>;

// Numeric types
export const PositiveInteger = createBrandedNumber(
  'PositiveInteger',
  BrandedValidators.positiveInteger,
  'Must be a positive integer'
);
export type PositiveInteger = Branded<number, 'PositiveInteger'>;

export const NonNegativeInteger = createBrandedNumber(
  'NonNegativeInteger',
  BrandedValidators.nonNegativeInteger,
  'Must be a non-negative integer'
);
export type NonNegativeInteger = Branded<number, 'NonNegativeInteger'>;

export const TimeoutMs = createBrandedNumber(
  'TimeoutMs',
  BrandedValidators.timeout,
  'Timeout must be between 1ms and 300000ms (5 minutes)'
);
export type TimeoutMs = Branded<number, 'TimeoutMs'>;

export const Percentage = createBrandedNumber(
  'Percentage',
  BrandedValidators.percentage,
  'Percentage must be between 0 and 100'
);
export type Percentage = Branded<number, 'Percentage'>;

/**
 * Utility functions for working with branded types
 */
export const BrandedUtils = {
  /** Extract the underlying value from a branded type */
  unwrap: <T>(branded: Branded<T, string>): T => branded as T,

  /** Check if a value is a specific branded type */
  isBranded: <T, Brand extends string>(
    value: unknown,
    factory: BrandedTypeFactory<T, Brand>
  ): value is Branded<T, Brand> => {
    return factory.guard(value as T);
  },

  /** Convert array of values to branded types */
  createArray: <T, Brand extends string>(
    values: T[],
    factory: BrandedTypeFactory<T, Brand>
  ): Branded<T, Brand>[] => {
    return values.map(factory.create);
  },

  /** Safely convert value to branded type, returning null on failure */
  safeCast: <T, Brand extends string>(
    value: T,
    factory: BrandedTypeFactory<T, Brand>
  ): Branded<T, Brand> | null => {
    try {
      return factory.create(value);
    } catch {
      return null;
    }
  },
};
