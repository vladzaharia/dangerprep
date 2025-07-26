/**
 * @dangerprep/common - Shared utilities and patterns for DangerPrep packages
 *
 * This package provides common utilities, patterns, and types that are used
 * across multiple DangerPrep packages to reduce duplication and ensure consistency.
 *
 * Features:
 * - Branded types factory and common branded types
 * - Size and time parsing/formatting utilities
 * - Standardized factory patterns and Utils objects
 * - Common validation utilities and type guards
 * - Async operation patterns and retry strategies
 * - Configuration patterns and builders
 */

// Branded types utilities and common branded types
export {
  // Core branded type utilities
  type Branded,
  type BrandedTypeFactory,
  createBrandedString,
  createBrandedNumber,
  BrandedValidators,
  BrandedUtils,

  // Pre-built common branded types
  ComponentName,
  type ComponentName as ComponentNameType,
  FilePath,
  type FilePath as FilePathType,
  DirectoryPath,
  type DirectoryPath as DirectoryPathType,
  FileExtension,
  type FileExtension as FileExtensionType,
  MimeType,
  type MimeType as MimeTypeType,
  SizeString,
  type SizeString as SizeStringType,
  PositiveInteger,
  type PositiveInteger as PositiveIntegerType,
  NonNegativeInteger,
  type NonNegativeInteger as NonNegativeIntegerType,
  TimeoutMs,
  type TimeoutMs as TimeoutMsType,
  Percentage,
  type Percentage as PercentageType,
} from './branded-types.js';

// Size and time utilities
export {
  // Constants
  SIZE_UNITS,
  TIME_UNITS,
  type SizeUnit,
  type TimeUnit,

  // Functions
  parseSize,
  formatSize,
  parseTime,
  formatTime,
  convertSize,
  convertTime,
  isValidSizeString,
  isValidTimeString,
  getBestSizeUnit,
  getBestTimeUnit,

  // Utility objects
  SizeUtils,
  TimeUtils,
  UnitUtils,
} from './size-utils.js';

// Standardized patterns and utilities
export {
  // Interfaces
  type BaseConfig,
  type FactoryFunction,
  type ConfigBuilder,
  type StandardUtils,
  type AsyncOperationOptions,
  type RetryStrategy,
  type OperationContext,

  // Factory functions
  createStandardUtils,

  // Pattern classes
  AsyncPatterns,
  ConfigPatterns,
  FluentConfigBuilder,
  CommonPatterns,
} from './patterns.js';

// Validation utilities
export {
  // Core validation types
  type ValidationResult,
  type Validator,
  type TypeGuard,

  // Validation functions
  createValidationResult,
  combineValidationResults,

  // Validator collections
  StringValidators,
  NumberValidators,
  ArrayValidators,
  ObjectValidators,
  TypeGuards,
  ValidationUtils,
  Validators,
} from './validation.js';
