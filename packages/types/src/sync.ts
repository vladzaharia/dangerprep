/**
 * Shared sync types and interfaces for DangerPrep sync services
 */

// Common sync operation statuses
export const SYNC_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

// Common sync directions
export const SYNC_DIRECTIONS = ['bidirectional', 'to_destination', 'from_source'] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

// Common sync types
export const SYNC_TYPES = [
  'full_sync',
  'metadata_filtered',
  'folder_filtered',
  'incremental',
  'custom',
] as const;
export type SyncType = (typeof SYNC_TYPES)[number];

// Base sync operation interface
export interface SyncOperation {
  readonly id: string;
  readonly type: SyncType;
  readonly direction: SyncDirection;
  status: SyncStatus;
  readonly startTime: Date;
  endTime?: Date;
  readonly totalItems: number;
  processedItems: number;
  readonly totalSize: number;
  processedSize: number;
  currentItem?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Sync result interface
export interface SyncResult {
  readonly operationId: string;
  readonly success: boolean;
  readonly itemsProcessed: number;
  readonly totalSize: number;
  readonly duration: number;
  readonly errors: string[];
  readonly warnings: string[];
  readonly metadata?: Record<string, unknown>;
}

// Sync statistics interface
export interface SyncStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalItemsTransferred: number;
  totalBytesTransferred: number;
  averageTransferSpeed: number;
  lastSyncTime?: Date;
  uptime: number;
}

// Base sync configuration interface
export interface BaseSyncConfig {
  enabled: boolean;
  sync_interval_minutes: number;
  max_concurrent_operations: number;
  retry_attempts: number;
  retry_delay_seconds: number;
  timeout_minutes: number;
  verify_transfers: boolean;
  create_completion_markers: boolean;
  cleanup_on_completion: boolean;
}

// Type guards for runtime validation
export const isSyncStatus = (value: string): value is SyncStatus =>
  SYNC_STATUSES.includes(value as SyncStatus);

export const isSyncDirection = (value: string): value is SyncDirection =>
  SYNC_DIRECTIONS.includes(value as SyncDirection);

export const isSyncType = (value: string): value is SyncType =>
  SYNC_TYPES.includes(value as SyncType);

// Utility functions for sync operations
export const createSyncOperation = (
  id: string,
  type: SyncType,
  direction: SyncDirection,
  totalItems: number,
  totalSize: number,
  metadata?: Record<string, unknown>
): SyncOperation => ({
  id,
  type,
  direction,
  status: 'pending',
  startTime: new Date(),
  totalItems,
  processedItems: 0,
  totalSize,
  processedSize: 0,
  ...(metadata && { metadata }),
});

export const calculateSyncSuccessRate = (stats: SyncStats): number => {
  if (stats.totalOperations === 0) return 0;
  return Math.round((stats.successfulOperations / stats.totalOperations) * 100);
};
