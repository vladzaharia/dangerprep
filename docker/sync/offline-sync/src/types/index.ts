import { z } from '@dangerprep/configuration';
import { StandardizedServiceConfig, StandardizedServiceConfigSchema } from '@dangerprep/sync';

// Service-specific configuration schema
const OfflineSyncServiceConfigSchema = z.object({
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
      z.string(),
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

// Create standardized configuration schema by extending with service-specific schema
export const OfflineSyncConfigSchema = StandardizedServiceConfigSchema.extend({
  offline_sync: OfflineSyncServiceConfigSchema.shape.offline_sync,
});

// TypeScript type - extends standardized config with service-specific config
export type OfflineSyncConfig = StandardizedServiceConfig & {
  offline_sync: z.infer<typeof OfflineSyncServiceConfigSchema>['offline_sync'];
};

// Sync direction types with const assertion
export const SYNC_DIRECTIONS = ['bidirectional', 'to_card', 'from_card'] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];

// Content type configuration derived from schema
export type ContentTypeConfig = OfflineSyncConfig['offline_sync']['content_types'][string];

export interface USBDeviceDescriptor {
  readonly bLength: number;
  readonly bDescriptorType: number;
  readonly bcdUSB: number;
  readonly bDeviceClass: number;
  readonly bDeviceSubClass: number;
  readonly bDeviceProtocol: number;
  readonly bMaxPacketSize0: number;
  readonly idVendor: number;
  readonly idProduct: number;
  readonly bcdDevice: number;
  readonly iManufacturer: number;
  readonly iProduct: number;
  readonly iSerialNumber: number;
  readonly bNumConfigurations: number;
}

export interface USBDevice {
  readonly deviceDescriptor: USBDeviceDescriptor;
  readonly busNumber: number;
  readonly deviceAddress: number;
  readonly portNumbers?: readonly number[];
}

export interface DeviceInfo {
  readonly vendorId: number;
  readonly productId: number;
  readonly manufacturer?: string;
  readonly product?: string;
  readonly serialNumber?: string;
  readonly size?: number;
}

export interface DetectedDevice {
  readonly devicePath: string;
  mountPath?: string;
  readonly deviceInfo: DeviceInfo;
  readonly fileSystem?: string;
  isMounted: boolean;
  isReady: boolean;
}

// Operation status types with const assertion
export const OPERATION_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export interface SyncOperation {
  readonly id: string;
  readonly device: DetectedDevice;
  readonly contentType: string;
  readonly direction: SyncDirection;
  status: OperationStatus;
  readonly startTime: Date;
  endTime?: Date;
  readonly totalFiles: number;
  processedFiles: number;
  readonly totalSize: number;
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
