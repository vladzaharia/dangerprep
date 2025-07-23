/**
 * Error handling module - Standardized error handling for DangerPrep services
 *
 * Features:
 * - Domain-specific error types with rich metadata
 * - Error context tracking with correlation IDs
 * - Retry classification and error recovery guidance
 * - Result types for safe error handling
 * - Error factory functions for consistent error creation
 * - Error wrapping and enhancement utilities
 */

// Core error types and enums
export {
  ErrorSeverity,
  RetryClassification,
  ErrorCategory,
  DangerPrepError,
  type ErrorContext,
  type ErrorMetadata,
} from './types.js';

// Domain-specific error classes
export {
  NetworkError,
  FileSystemError,
  ConfigurationError,
  ValidationError,
  ExternalServiceError,
  AuthenticationError,
  BusinessLogicError,
  SystemError,
} from './domain-errors.js';

// Error context management
export {
  ErrorContextManager,
  withErrorContext,
  runWithErrorContext,
  getCurrentErrorContext,
  enhanceErrorWithContext,
} from './context.js';

// Error utilities and helpers
export {
  type Result,
  success,
  failure,
  safeAsync,
  safe,
  ErrorFactory,
  wrapError,
  isRetryableError,
  extractErrorInfo,
} from './utils.js';

// Error patterns and standardized handling
export {
  ErrorPatterns,
  ErrorAggregator,
} from './error-patterns.js';
