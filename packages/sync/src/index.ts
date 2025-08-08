// Export types
export * from './types';

// Export base classes
export * from './base/sync-service';
export * from './base/standardized-service';

// Export transfer engine
export * from './transfer/engine';

// Export CLI framework
export * from './cli/base-cli';
export * from './cli/standardized-cli';

// Export configuration components
export * from './config/schemas';
export * from './config/factory';
export * from './config/utils';

// Export error handling components
export * from './error/handler';
export * from './error/factory';

// Export progress tracking components
export { UnifiedProgressTracker } from './progress/tracker';
export type { SyncProgressTracker } from './progress/tracker';
export { SyncProgressManager } from './progress/manager';
export type { ProgressManagerConfig, ProgressManagerStats } from './progress/manager';
export {
  formatBytes,
  formatSpeed,
  formatDuration,
  formatETA,
  createProgressInfo,
  createSyncPhases,
  createDownloadPhases,
  createDeviceSyncPhases,
  calculatePhaseProgress,
  isSignificantProgressChange,
  createProgressSummary,
  validateProgressConfig,
  mergeProgressUpdates,
} from './progress/utils';

// Export service factory components
export * from './factory/service-factory';

// Re-export commonly used types for convenience
export type {
  SyncOperation,
  SyncResult,
  SyncStats,
  SyncStatus,
  SyncDirection,
  SyncType,
  FileTransfer,
  TransferStatus,
  ProgressInfo,
  BaseSyncConfig,
} from './types';
