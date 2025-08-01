/**
 * Shared service types and interfaces for DangerPrep services
 */

// Service operation statuses
export const OPERATION_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

// Service health status
export enum ServiceHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

// Service state
export enum ServiceState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error',
}

// Base service statistics
export interface ServiceStats {
  /** Service start time */
  startTime?: Date;

  /** Service uptime in milliseconds */
  uptime: number;

  /** Current service state */
  state: ServiceState;

  /** Number of restarts */
  restartCount: number;

  /** Last error if any */
  lastError?: Error;

  /** Service-specific statistics */
  customStats?: Record<string, unknown>;
}

// Service capability
export interface ServiceCapability {
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
}

// Service dependency
export interface ServiceDependency {
  serviceName: string;
  version?: string;
  required: boolean;
  healthCheck?: string;
}

// Service registration information
export interface ServiceRegistration {
  /** Unique service identifier */
  serviceId: string;

  /** Human-readable service name */
  serviceName: string;

  /** Service type/category */
  serviceType: string;

  /** Service version */
  version: string;

  /** Service endpoint information */
  endpoint?: {
    host: string;
    port: number;
    protocol: 'http' | 'https' | 'tcp' | 'udp';
    path?: string;
  };

  /** Service capabilities */
  capabilities?: ServiceCapability[];

  /** Service dependencies */
  dependencies?: ServiceDependency[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Registration timestamp */
  registeredAt: Date;

  /** Last seen timestamp */
  lastSeen: Date;
}

// Service operation interface
export interface ServiceOperation {
  readonly id: string;
  readonly type: string;
  status: OperationStatus;
  readonly startTime: Date;
  endTime?: Date;
  readonly totalItems: number;
  processedItems: number;
  currentItem?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Service result type
export type ServiceResult<T = void> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: Error };

// Type guards for runtime validation
export const isOperationStatus = (value: string): value is OperationStatus =>
  OPERATION_STATUSES.includes(value as OperationStatus);

export const isServiceHealth = (value: string): value is ServiceHealth =>
  Object.values(ServiceHealth).includes(value as ServiceHealth);

export const isServiceState = (value: string): value is ServiceState =>
  Object.values(ServiceState).includes(value as ServiceState);

// Utility functions
export const createServiceOperation = (
  id: string,
  type: string,
  totalItems: number,
  metadata?: Record<string, unknown>
): ServiceOperation => ({
  id,
  type,
  status: 'pending',
  startTime: new Date(),
  totalItems,
  processedItems: 0,
  ...(metadata && { metadata }),
});

export const calculateServiceUptime = (startTime?: Date): number => {
  if (!startTime) return 0;
  return Date.now() - startTime.getTime();
};
