/**
 * Notification types and interfaces for standardized event notifications
 */

export enum NotificationLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export enum NotificationType {
  // Service lifecycle events
  SERVICE_STARTED = 'service_started',
  SERVICE_STOPPED = 'service_stopped',
  SERVICE_ERROR = 'service_error',

  // Sync operation events
  SYNC_STARTED = 'sync_started',
  SYNC_COMPLETED = 'sync_completed',
  SYNC_FAILED = 'sync_failed',
  SYNC_PROGRESS = 'sync_progress',

  // Device events (for offline-sync)
  DEVICE_DETECTED = 'device_detected',
  DEVICE_MOUNTED = 'device_mounted',
  DEVICE_UNMOUNTED = 'device_unmounted',
  DEVICE_ERROR = 'device_error',

  // Content events
  CONTENT_UPDATED = 'content_updated',
  CONTENT_ERROR = 'content_error',

  // Health and monitoring
  HEALTH_CHECK_FAILED = 'health_check_failed',
  STORAGE_WARNING = 'storage_warning',
  STORAGE_CRITICAL = 'storage_critical',

  // Custom events
  CUSTOM = 'custom',
}

export interface NotificationEvent {
  /** Unique identifier for this notification */
  id: string;

  /** Type of notification */
  type: NotificationType;

  /** Severity level */
  level: NotificationLevel;

  /** Timestamp when the event occurred */
  timestamp: Date;

  /** Service that generated the notification */
  source: string;

  /** Human-readable message */
  message: string;

  /** Optional detailed description */
  description?: string;

  /** Additional structured data */
  data?: Record<string, unknown>;

  /** Error object if applicable */
  error?: Error;

  /** Tags for categorization and filtering */
  tags?: string[];
}

export interface NotificationChannel {
  /** Unique name for this channel */
  name: string;

  /** Send a notification through this channel */
  send(event: NotificationEvent): Promise<void>;

  /** Check if this channel is available/configured */
  isAvailable(): Promise<boolean>;

  /** Close/cleanup the channel */
  close?(): Promise<void>;
}

export interface NotificationFilter {
  /** Filter by notification types */
  types?: NotificationType[];

  /** Filter by minimum level */
  minLevel?: NotificationLevel;

  /** Filter by source service */
  sources?: string[];

  /** Filter by tags */
  tags?: string[];

  /** Custom filter function */
  custom?: (event: NotificationEvent) => boolean;
}

export interface NotificationManagerConfig {
  /** Default notification level */
  defaultLevel?: NotificationLevel;

  /** Maximum number of events to keep in memory */
  maxEvents?: number;

  /** Whether to log notifications to the logger */
  logNotifications?: boolean;

  /** Default tags to add to all notifications */
  defaultTags?: string[];
}

export interface WebhookChannelConfig {
  /** Webhook URL */
  url: string;

  /** HTTP method (default: POST) */
  method?: 'POST' | 'PUT' | 'PATCH';

  /** Custom headers */
  headers?: Record<string, string>;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Number of retry attempts */
  retries?: number;

  /** Retry delay in milliseconds */
  retryDelay?: number;

  /** Filter for which events to send */
  filter?: NotificationFilter;
}

export interface EmailChannelConfig {
  /** SMTP server configuration */
  smtp: {
    host: string;
    port: number;
    secure?: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  };

  /** Email addresses */
  from: string;
  to: string | string[];

  /** Subject template (can use event properties) */
  subjectTemplate?: string;

  /** Filter for which events to send */
  filter?: NotificationFilter;
}
