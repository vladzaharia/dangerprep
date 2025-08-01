/**
 * Shared TypeScript types and interfaces for DangerPrep services
 *
 * This package provides common types used across multiple DangerPrep services
 * to ensure consistency and reduce duplication.
 */

// Export all sync-related types
export * from './sync.js';

// Export all transfer-related types
export * from './transfer.js';

// Export all progress-related types
export * from './progress.js';

// Export all service-related types
export * from './service.js';

// Export all error-related types
export * from './errors.js';

// Re-export commonly used types for convenience
// (Types are already exported via the wildcard exports above)

// Export commonly used constants
export { SYNC_STATUSES, SYNC_DIRECTIONS, SYNC_TYPES } from './sync.js';

export { TRANSFER_STATUSES } from './transfer.js';

export { ProgressStatus } from './progress.js';

export { ServiceHealth, ServiceState, OPERATION_STATUSES } from './service.js';

export {
  SyncErrorSeverity,
  SyncErrorCategory,
  SyncRetryClassification,
  RecoveryAction,
} from './errors.js';

// Export utility functions
export {
  isSyncStatus,
  isSyncDirection,
  isSyncType,
  createSyncOperation,
  calculateSyncSuccessRate,
} from './sync.js';

export { isTransferStatus, createFileTransfer, calculateTransferProgress } from './transfer.js';

export { calculateProgress, calculateSpeed, calculateETA, createProgressInfo } from './progress.js';

export {
  isOperationStatus,
  isServiceHealth,
  isServiceState,
  createServiceOperation,
  calculateServiceUptime,
} from './service.js';

export {
  createSyncError,
  createSuccessResult,
  createErrorResult,
  isRetryableError,
  shouldNotifyError,
  getDefaultRecoveryStrategy,
} from './errors.js';
