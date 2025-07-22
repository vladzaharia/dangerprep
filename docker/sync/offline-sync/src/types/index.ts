export interface OfflineSyncConfig {
  offline_sync: {
    storage: {
      content_directory: string;
      mount_base: string;
      temp_directory: string;
      max_card_size: string;
    };
    device_detection: {
      monitor_device_types: string[];
      min_device_size: string;
      mount_timeout: number;
      mount_retry_attempts: number;
      mount_retry_delay: number;
    };
    content_types: {
      [key: string]: ContentTypeConfig;
    };
    sync: {
      check_interval: number;
      max_concurrent_transfers: number;
      transfer_chunk_size: string;
      verify_transfers: boolean;
      delete_after_sync: boolean;
      create_completion_markers: boolean;
    };
    logging: {
      level: string;
      file: string;
      max_size: string;
      backup_count: number;
    };
    notifications?: {
      enabled: boolean;
      webhook_url?: string;
      events: string[];
    };
  };
}

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
