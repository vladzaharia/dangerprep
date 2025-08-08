import { z } from '@dangerprep/configuration';

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

// Transfer operation statuses
export const TRANSFER_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'paused',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

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

// File transfer interface
export interface FileTransfer {
  readonly id: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly size: number;
  transferred: number;
  status: TransferStatus;
  readonly startTime: Date;
  endTime?: Date;
  error?: string;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

// Progress tracking interface
export interface ProgressInfo {
  readonly completed: number;
  readonly total: number;
  readonly percentage: number;
  readonly speed?: number;
  readonly eta?: number;
  readonly currentItem?: string;
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

// Common configuration schema patterns
export const BaseSyncConfigSchema = z.object({
  performance: z.object({
    max_concurrent_transfers: z.number().positive().default(3),
    retry_attempts: z.number().nonnegative().default(3),
    retry_delay: z.number().positive().default(5000),
    timeout: z.number().positive().default(300000),
  }),
  logging: z.object({
    level: z.string().default('info'),
    file: z.string().optional(),
    max_size: z.string().default('10MB'),
    backup_count: z.number().positive().default(5),
  }),
  notifications: z
    .object({
      enabled: z.boolean().default(false),
      webhook_url: z.string().url().optional(),
      events: z.array(z.string()).default([]),
    })
    .optional(),
});

export type BaseSyncConfig = z.infer<typeof BaseSyncConfigSchema>;

// Type guards for runtime validation
export const isSyncStatus = (value: string): value is SyncStatus =>
  SYNC_STATUSES.includes(value as SyncStatus);

export const isSyncDirection = (value: string): value is SyncDirection =>
  SYNC_DIRECTIONS.includes(value as SyncDirection);

export const isSyncType = (value: string): value is SyncType =>
  SYNC_TYPES.includes(value as SyncType);

export const isTransferStatus = (value: string): value is TransferStatus =>
  TRANSFER_STATUSES.includes(value as TransferStatus);

// Utility functions for progress calculation
export const calculateProgress = (completed: number, total: number): ProgressInfo => ({
  completed,
  total,
  percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
});

export const calculateSpeed = (bytesTransferred: number, timeElapsedMs: number): number => {
  if (timeElapsedMs <= 0) return 0;
  return Math.round((bytesTransferred / timeElapsedMs) * 1000); // bytes per second
};

export const calculateETA = (remainingBytes: number, currentSpeedBps: number): number => {
  if (currentSpeedBps <= 0) return 0;
  return Math.round(remainingBytes / currentSpeedBps); // seconds
};
