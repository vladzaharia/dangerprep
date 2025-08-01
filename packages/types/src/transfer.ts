/**
 * Shared transfer types and interfaces for DangerPrep services
 */

// Transfer operation statuses
export const TRANSFER_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'paused',
  'cancelled',
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

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

// Transfer progress information
export interface TransferProgress {
  readonly transferId: string;
  readonly bytesTransferred: number;
  readonly totalBytes: number;
  readonly percentage: number;
  readonly speed: number; // bytes per second
  readonly eta: number; // seconds remaining
  readonly currentFile?: string;
}

// Transfer statistics
export interface TransferStats {
  totalTransfers: number;
  completedTransfers: number;
  failedTransfers: number;
  totalBytesTransferred: number;
  averageSpeed: number;
  activeTransfers: number;
}

// Transfer options
export interface TransferOptions {
  chunkSize?: string;
  verifyTransfer?: boolean;
  createCompletionMarkers?: boolean;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  resumeTransfer?: boolean;
  checksumAlgorithm?: 'md5' | 'sha1' | 'sha256';
  bandwidth?: number; // bytes per second limit
  onProgress?: (progress: TransferProgress) => void;
  signal?: AbortSignal;
}

// Transfer result
export interface TransferResult {
  readonly transferId: string;
  readonly success: boolean;
  readonly bytesTransferred: number;
  readonly duration: number;
  readonly averageSpeed: number;
  readonly error?: string;
  readonly checksum?: string;
}

// Type guards for runtime validation
export const isTransferStatus = (value: string): value is TransferStatus =>
  TRANSFER_STATUSES.includes(value as TransferStatus);

// Utility functions for transfer operations
export const createFileTransfer = (
  id: string,
  sourcePath: string,
  destinationPath: string,
  size: number,
  metadata?: Record<string, unknown>
): FileTransfer => ({
  id,
  sourcePath,
  destinationPath,
  size,
  transferred: 0,
  status: 'pending',
  startTime: new Date(),
  ...(metadata && { metadata }),
});

export const calculateTransferProgress = (
  bytesTransferred: number,
  totalBytes: number,
  startTime: Date,
  currentFile?: string
): TransferProgress => {
  const percentage = totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 0;
  const elapsedMs = Date.now() - startTime.getTime();
  const speed = elapsedMs > 0 ? Math.round((bytesTransferred / elapsedMs) * 1000) : 0;
  const remainingBytes = totalBytes - bytesTransferred;
  const eta = speed > 0 ? Math.round(remainingBytes / speed) : 0;

  return {
    transferId: '', // Will be set by caller
    bytesTransferred,
    totalBytes,
    percentage,
    speed,
    eta,
    ...(currentFile && { currentFile }),
  };
};
