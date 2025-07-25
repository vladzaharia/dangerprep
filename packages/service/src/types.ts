/**
 * Service base types and interfaces for standardized service lifecycle management
 */

import type { HealthChecker, PeriodicHealthChecker } from '@dangerprep/health';
import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';

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
