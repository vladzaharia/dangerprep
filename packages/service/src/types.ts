/**
 * Service base types and interfaces for standardized service lifecycle management
 */

import type { HealthChecker, PeriodicHealthChecker } from '@dangerprep/health';
import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';
import type { ScheduleOptions, ScheduledTask } from '@dangerprep/scheduling';

// Forward declarations to avoid circular imports
declare class ServiceScheduler {
  start(): Promise<import('@dangerprep/errors').Result<void>>;
  stop(): Promise<import('@dangerprep/errors').Result<void>>;
  destroy(): Promise<import('@dangerprep/errors').Result<void>>;
  scheduleTask(
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    options?: ServiceScheduleOptions
  ): import('@dangerprep/errors').Result<ServiceScheduledTask>;
  scheduleConditionalTask(
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    condition: () => Promise<boolean> | boolean,
    options?: ServiceScheduleOptions
  ): import('@dangerprep/errors').Result<ServiceScheduledTask>;
  scheduleMaintenanceTask(
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    options?: ServiceScheduleOptions
  ): import('@dangerprep/errors').Result<ServiceScheduledTask>;
  removeTask(taskId: string): boolean;
  getStatus(): ServiceSchedulerStatus;
}

declare class ServiceRecoveryManager {
  handleServiceFailure(error: Error, restartFunction: () => Promise<void>): Promise<boolean>;
  enterGracefulDegradation(): Promise<void>;
  exitGracefulDegradation(): Promise<void>;
  shouldOperateInDegradedMode(): boolean;
  getRecoveryState(): ServiceRecoveryState;
  resetRecoveryState(): void;
  cleanup(): Promise<void>;
}

// Service states with const assertion for better type inference
export const SERVICE_STATES = ['stopped', 'starting', 'running', 'stopping', 'error'] as const;
export type ServiceStateString = (typeof SERVICE_STATES)[number];

export enum ServiceState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error',
}

export interface ServiceConfig {
  /** Service name */
  readonly name: string;

  /** Service version */
  readonly version: string;

  /** Configuration file path */
  readonly configPath: string;

  /** Whether to enable periodic health checks */
  readonly enablePeriodicHealthChecks?: boolean;

  /** Health check interval in minutes */
  readonly healthCheckIntervalMinutes?: number;

  /** Whether to handle process signals automatically */
  readonly handleProcessSignals?: boolean;

  /** Graceful shutdown timeout in milliseconds */
  readonly shutdownTimeoutMs?: number;

  /** Whether to enable service scheduler */
  readonly enableScheduler?: boolean;

  /** Service scheduler configuration */
  readonly schedulerConfig?: ServiceSchedulerConfig;

  /** Whether to enable progress tracking */
  readonly enableProgressTracking?: boolean;

  /** Progress tracking configuration */
  readonly progressConfig?: ServiceProgressConfig;

  /** Whether to enable automatic service recovery */
  readonly enableAutoRecovery?: boolean;

  /** Service recovery configuration */
  readonly recoveryConfig?: ServiceRecoveryConfig;

  /** Logging configuration */
  readonly loggingConfig?: ServiceLoggingConfig;
}

export interface ServiceStats {
  /** Service start time (mutable for internal updates) */
  startTime?: Date;

  /** Service uptime in milliseconds (mutable for internal updates) */
  uptime: number;

  /** Current service state (mutable for internal updates) */
  state: ServiceState;

  /** Number of restarts (mutable for internal updates) */
  restartCount: number;

  /** Last error if any (mutable for internal updates) */
  lastError?: Error;

  /** Service-specific statistics */
  readonly customStats?: Readonly<Record<string, unknown>>;
}

export interface ServiceLifecycleHooks {
  /** Called before service initialization */
  beforeInitialize?: () => Promise<void> | void;

  /** Called after service initialization */
  afterInitialize?: () => Promise<void> | void;

  /** Called before service startup */
  beforeStart?: () => Promise<void> | void;

  /** Called after service startup */
  afterStart?: () => Promise<void> | void;

  /** Called before service shutdown */
  beforeStop?: () => Promise<void> | void;

  /** Called after service shutdown */
  afterStop?: () => Promise<void> | void;

  /** Called when an error occurs */
  onError?: (error: Error) => Promise<void> | void;

  /** Called when service state changes */
  onStateChange?: (newState: ServiceState, oldState: ServiceState) => Promise<void> | void;
}

export interface ServiceComponents {
  /** Logger instance */
  logger: Logger;

  /** Notification manager */
  notificationManager: NotificationManager;

  /** Health checker */
  healthChecker: HealthChecker;

  /** Periodic health checker */
  periodicHealthChecker: PeriodicHealthChecker | undefined;

  /** Service scheduler */
  scheduler: ServiceScheduler | undefined;

  /** Progress manager */
  progressManager: ServiceProgressManager | undefined;

  /** Recovery manager */
  recoveryManager: ServiceRecoveryManager | undefined;
}

export interface ServiceInitializationResult {
  /** Whether initialization was successful */
  success: boolean;

  /** Error if initialization failed */
  error?: Error;

  /** Initialization duration in milliseconds */
  duration: number;

  /** Additional initialization details */
  details?: Record<string, unknown>;
}

export interface ServiceShutdownResult {
  /** Whether shutdown was successful */
  success: boolean;

  /** Error if shutdown failed */
  error?: Error;

  /** Shutdown duration in milliseconds */
  duration: number;

  /** Whether shutdown was graceful */
  graceful: boolean;
}

export abstract class ServiceError extends Error {
  public readonly code: string;
  public readonly service: string;
  public readonly errorCause: Error | undefined;

  constructor(message: string, code: string, service: string, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.service = service;
    this.errorCause = cause;
  }
}

export class ServiceInitializationError extends ServiceError {
  constructor(service: string, message: string, cause?: Error) {
    super(message, 'SERVICE_INITIALIZATION_FAILED', service, cause);
  }
}

export class ServiceStartupError extends ServiceError {
  constructor(service: string, message: string, cause?: Error) {
    super(message, 'SERVICE_STARTUP_FAILED', service, cause);
  }
}

export class ServiceShutdownError extends ServiceError {
  constructor(service: string, message: string, cause?: Error) {
    super(message, 'SERVICE_SHUTDOWN_FAILED', service, cause);
  }
}

export class ServiceConfigurationError extends ServiceError {
  constructor(service: string, message: string, cause?: Error) {
    super(message, 'SERVICE_CONFIGURATION_ERROR', service, cause);
  }
}

// Type guards for runtime validation
export const isServiceState = (value: string): value is ServiceStateString =>
  SERVICE_STATES.includes(value as ServiceStateString);

// Utility types for better type safety
export type ServiceEventMap = {
  readonly stateChange: [newState: ServiceState, oldState: ServiceState];
  readonly error: [error: Error];
  readonly initialized: [];
  readonly started: [];
  readonly stopped: [];
  readonly configChanged: [config: ServiceConfig];
  readonly statsUpdated: [stats: ServiceStats];
};

// Result types for service operations
export type ServiceResult<T = void> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: Error };

export type AsyncServiceResult<T = void> = Promise<ServiceResult<T>>;

// ServiceScheduler types and interfaces

/**
 * Configuration options for ServiceScheduler
 */
export interface ServiceSchedulerConfig {
  /** Whether to enable health monitoring for scheduled tasks */
  enableHealthMonitoring?: boolean;

  /** Health check interval in milliseconds */
  healthCheckIntervalMs?: number;

  /** Whether to pause tasks when service is unhealthy */
  pauseOnUnhealthy?: boolean;

  /** Whether to automatically start tasks when scheduler starts */
  autoStartTasks?: boolean;
}

/**
 * Service-specific scheduling options extending base ScheduleOptions
 */
export interface ServiceScheduleOptions extends ScheduleOptions {
  /** Whether to check service health before executing task */
  enableHealthCheck?: boolean;

  /** Whether to retry task on failure */
  retryOnFailure?: boolean;

  /** Maximum number of retries */
  maxRetries?: number;

  /** Whether to send notifications on task failure */
  notifyOnFailure?: boolean;
}

/**
 * Service-aware scheduled task extending base ScheduledTask
 */
export interface ServiceScheduledTask extends ScheduledTask {
  /** Service name this task belongs to */
  serviceName: string;

  /** Service-specific options for this task */
  serviceOptions: ServiceScheduleOptions;

  /** Last execution time */
  lastExecution: Date | undefined;

  /** Last error if any */
  lastError: string | undefined;

  /** Total number of executions */
  executionCount: number;

  /** Number of failed executions */
  failureCount: number;
}

/**
 * Status information for ServiceScheduler
 */
export interface ServiceSchedulerStatus {
  /** Service name */
  serviceName: string;

  /** Whether the scheduler is active */
  isActive: boolean;

  /** Whether health monitoring is enabled */
  healthMonitoringEnabled: boolean;

  /** Last known health status */
  lastHealthStatus: boolean;

  /** Total number of scheduled tasks */
  totalTasks: number;

  /** Number of active tasks */
  activeTasks: number;

  /** Service-specific task information */
  serviceTasks: Array<{
    id: string;
    name: string;
    schedule: string;
    isActive: boolean;
    executionCount: number;
    failureCount: number;
    lastExecution: Date | undefined;
    lastError: string | undefined;
  }>;
}

// ServiceProgressManager types and interfaces

/**
 * Configuration options for ServiceProgressManager
 */
export interface ServiceProgressConfig {
  /** Whether to enable automatic cleanup of completed trackers */
  autoCleanup?: boolean;

  /** How long to keep completed trackers (in milliseconds) */
  cleanupDelayMs?: number;

  /** Whether to persist progress state */
  enablePersistence?: boolean;

  /** Storage directory for progress persistence */
  storageDir?: string;

  /** Whether to send notifications on progress events */
  enableNotifications?: boolean;
}

/**
 * Service-aware progress manager that wraps the base ProgressManager
 */
declare class ServiceProgressManager {
  createServiceTracker(
    operationId: string,
    operationName: string,
    options?: Partial<import('@dangerprep/progress').ProgressConfig>
  ): import('@dangerprep/progress').IProgressTracker;

  createStartupTracker(operationName: string): import('@dangerprep/progress').IProgressTracker;

  createShutdownTracker(operationName: string): import('@dangerprep/progress').IProgressTracker;

  createMaintenanceTracker(
    operationId: string,
    operationName: string
  ): import('@dangerprep/progress').IProgressTracker;

  getActiveTrackers(): import('@dangerprep/progress').IProgressTracker[];

  getTrackerById(operationId: string): import('@dangerprep/progress').IProgressTracker | undefined;

  cleanup(): Promise<void>;

  getStatus(): {
    serviceName: string;
    activeTrackers: number;
    completedTrackers: number;
    totalTrackers: number;
  };
}

// ServiceRegistry types and interfaces

/**
 * Configuration options for ServiceRegistry
 */
export interface ServiceRegistryConfig {
  /** Whether to enable health monitoring for registered services */
  enableHealthMonitoring?: boolean;

  /** Health check interval in milliseconds */
  healthCheckIntervalMs?: number;

  /** Whether to send notifications for service events */
  enableEventNotifications?: boolean;

  /** Whether to automatically cleanup offline services */
  autoCleanupOfflineServices?: boolean;

  /** Timeout in milliseconds before considering a service offline */
  offlineTimeoutMs?: number;
}

/**
 * Service registration information
 */
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

/**
 * Service dependency definition
 */
export interface ServiceDependency {
  /** ID of the required service */
  serviceId: string;

  /** Name of the required service */
  serviceName: string;

  /** Whether this dependency is required for startup */
  required: boolean;

  /** Minimum version requirement */
  minVersion?: string;

  /** Required capabilities from the dependency */
  requiredCapabilities?: string[];
}

/**
 * Service capability definition
 */
export interface ServiceCapability {
  /** Capability name */
  name: string;

  /** Capability version */
  version: string;

  /** Capability description */
  description?: string;

  /** Capability metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Service discovery query parameters
 */
export interface ServiceDiscoveryQuery {
  /** Filter by service name */
  serviceName?: string;

  /** Filter by service type */
  serviceType?: string;

  /** Only return healthy services */
  healthyOnly?: boolean;

  /** Required capabilities */
  requiredCapabilities?: string[];

  /** Metadata filters */
  metadata?: Record<string, unknown>;

  /** Maximum number of results */
  limit?: number;
}

/**
 * Service registry status information
 */
export interface ServiceRegistryStatus {
  /** Total number of registered services */
  totalServices: number;

  /** Number of healthy services */
  healthyServices: number;

  /** Number of unhealthy services */
  unhealthyServices: number;

  /** Number of services with unknown health */
  unknownHealthServices: number;

  /** Service summary information */
  services: Array<{
    serviceId: string;
    serviceName: string;
    serviceType: string;
    health: string;
    registeredAt: Date;
    lastSeen: Date;
  }>;
}

// ServiceRecovery types and interfaces

/**
 * Configuration options for service recovery
 */
export interface ServiceRecoveryConfig {
  /** Maximum number of restart attempts */
  maxRestartAttempts?: number;

  /** Base delay between restart attempts in milliseconds */
  restartDelayMs?: number;

  /** Whether to use exponential backoff for restart delays */
  useExponentialBackoff?: boolean;

  /** Maximum restart delay in milliseconds */
  maxRestartDelayMs?: number;

  /** Whether to restart on dependency failures */
  restartOnDependencyFailure?: boolean;

  /** Whether to enable graceful degradation mode */
  enableGracefulDegradation?: boolean;

  /** Circuit breaker configuration for external dependencies */
  circuitBreakerConfig?: {
    /** Failure threshold before opening circuit */
    failureThreshold?: number;
    /** Timeout in milliseconds */
    timeoutMs?: number;
    /** Reset timeout in milliseconds */
    resetTimeoutMs?: number;
  };
}

/**
 * Service recovery state information
 */
export interface ServiceRecoveryState {
  /** Number of restart attempts made */
  restartAttempts: number;

  /** Last restart timestamp */
  lastRestart: Date | undefined;

  /** Whether service is in graceful degradation mode */
  inGracefulDegradation: boolean;

  /** Recovery status */
  status: 'healthy' | 'recovering' | 'degraded' | 'failed';

  /** Last recovery error */
  lastError: string | undefined;
}

/**
 * Configuration options for service logging
 */
export interface ServiceLoggingConfig {
  /** Log level (DEBUG, INFO, WARN, ERROR) */
  readonly level?: string;

  /** Log file path (optional - if not provided, only console logging) */
  readonly file?: string;

  /** Maximum log file size */
  readonly maxSize?: string;

  /** Number of backup files to keep */
  readonly backupCount?: number;

  /** Log format (text or json) */
  readonly format?: 'text' | 'json';

  /** Whether to include colors in console output */
  readonly colors?: boolean;
}
