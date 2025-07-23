import { z } from '@dangerprep/shared/config';

// Zod schema for OfflineSyncConfig
export const OfflineSyncConfigSchema = z.object({
  offline_sync: z.object({
    storage: z.object({
      content_directory: z.string(),
      mount_base: z.string(),
      temp_directory: z.string(),
      max_card_size: z.string(),
    }),
    device_detection: z.object({
      monitor_device_types: z.array(z.string()),
      min_device_size: z.string(),
      mount_timeout: z.number().positive(),
      mount_retry_attempts: z.number().nonnegative(),
      mount_retry_delay: z.number().positive(),
    }),
    content_types: z.record(
      z.object({
        local_path: z.string(),
        card_path: z.string(),
        sync_direction: z.enum(['bidirectional', 'to_card', 'from_card']),
        max_size: z.string(),
        file_extensions: z.array(z.string()),
      })
    ),
    sync: z.object({
      check_interval: z.number().positive(),
      max_concurrent_transfers: z.number().positive(),
      transfer_chunk_size: z.string(),
      verify_transfers: z.boolean(),
      delete_after_sync: z.boolean(),
      create_completion_markers: z.boolean(),
    }),
    logging: z.object({
      level: z.string(),
      file: z.string(),
      max_size: z.string(),
      backup_count: z.number().positive(),
    }),
    notifications: z
      .object({
        enabled: z.boolean(),
        webhook_url: z.string().url().optional(),
        events: z.array(z.string()),
      })
      .optional(),
  }),
});

// TypeScript type inferred from Zod schema
export type OfflineSyncConfig = z.infer<typeof OfflineSyncConfigSchema>;

// Keep the original interface for backward compatibility
export interface ContentTypeConfig {
  local_path: string;
  card_path: string;
  sync_direction: 'bidirectional' | 'to_card' | 'from_card';
  max_size: string;
  file_extensions: string[];
}

export interface USBDeviceDescriptor {
  bLength: number;
  bDescriptorType: number;
  bcdUSB: number;
  bDeviceClass: number;
  bDeviceSubClass: number;
  bDeviceProtocol: number;
  bMaxPacketSize0: number;
  idVendor: number;
  idProduct: number;
  bcdDevice: number;
  iManufacturer: number;
  iProduct: number;
  iSerialNumber: number;
  bNumConfigurations: number;
}

export interface USBDevice {
  deviceDescriptor: USBDeviceDescriptor;
  busNumber: number;
  deviceAddress: number;
  portNumbers?: number[];
}

export interface DeviceInfo {
  vendorId: number;
  productId: number;
  manufacturer?: string | undefined;
  product?: string | undefined;
  serialNumber?: string | undefined;
  size?: number | undefined;
}

export interface DetectedDevice {
  devicePath: string;
  mountPath?: string | undefined;
  deviceInfo: DeviceInfo;
  fileSystem?: string | undefined;
  isMounted: boolean;
  isReady: boolean;
}

export interface SyncOperation {
  id: string;
  device: DetectedDevice;
  contentType: string;
  direction: 'to_card' | 'from_card' | 'bidirectional';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  totalFiles: number;
  processedFiles: number;
  totalSize: number;
  processedSize: number;
  currentFile?: string;
  error?: string;
}

export interface FileTransfer {
  id: string;
  sourcePath: string;
  destinationPath: string;
  size: number;
  transferred: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  error?: string;
  checksum?: string;
}

export interface CardAnalysis {
  device: DetectedDevice;
  totalSize: number;
  freeSize: number;
  usedSize: number;
  detectedContentTypes: string[];
  missingContentTypes: string[];
  fileSystemSupported: boolean;
  readOnly: boolean;
  errors: string[];
}

export interface SyncStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalFilesTransferred: number;
  totalBytesTransferred: number;
  averageTransferSpeed: number;
  lastSyncTime?: Date;
  uptime: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: {
    usbDetection: boolean;
    mountingSystem: boolean;
    syncEngine: boolean;
    fileSystem: boolean;
  };
  activeOperations: number;
  connectedDevices: number;
  errors: string[];
  warnings: string[];
}

export interface NotificationEvent {
  type:
    | 'card_inserted'
    | 'card_removed'
    | 'sync_started'
    | 'sync_completed'
    | 'sync_failed'
    | 'error';
  timestamp: Date;
  device?: DetectedDevice;
  operation?: SyncOperation;
  message: string;
  details?: Record<string, unknown>;
}

export interface LsblkDevice {
  name: string;
  type: string;
  size: string;
  mountpoint?: string;
  fstype?: string;
  children?: LsblkDevice[];
}

export interface LsblkOutput {
  blockdevices: LsblkDevice[];
}

export interface DiskSpaceInfo {
  size: number;
  fstype: string;
  mounted: boolean;
  mountpoint?: string | undefined;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}
