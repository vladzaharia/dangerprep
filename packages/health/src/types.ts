/**
 * Health check types and interfaces for standardized service health monitoring
 */

import {
  type ComponentName as CommonComponentName,
  ComponentName as ComponentNameFactory,
  type TimeoutMs as CommonTimeoutMs,
  TimeoutMs as TimeoutMsFactory,
  type Percentage as CommonPercentage,
  Percentage as PercentageFactory,
} from '@dangerprep/common';

// Re-export common branded types with health-specific aliases
export type ComponentName = CommonComponentName;
export type HealthCheckTimeout = CommonTimeoutMs;
export type HealthScore = CommonPercentage;

// Re-export type guards and factory functions
export const isComponentName = ComponentNameFactory.guard;
export const isHealthCheckTimeout = TimeoutMsFactory.guard;
export const isHealthScore = PercentageFactory.guard;

export const createComponentName = ComponentNameFactory.create;
export const createHealthCheckTimeout = TimeoutMsFactory.create;
export const createHealthScore = PercentageFactory.create;

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

export enum ComponentStatus {
  UP = 'up',
  DOWN = 'down',
  DEGRADED = 'degraded',
  UNKNOWN = 'unknown',
}

export interface HealthCheckComponent {
  /** Component name */
  name: string;

  /** Component status */
  status: ComponentStatus;

  /** Optional status message */
  message?: string;

  /** Component-specific details */
  details?: Record<string, unknown>;

  /** Last check timestamp */
  lastChecked: Date;

  /** Check duration in milliseconds */
  duration?: number;

  /** Error information if component is down */
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}

export interface HealthCheckResult {
  /** Overall service health status */
  status: HealthStatus;

  /** Timestamp when health check was performed */
  timestamp: Date;

  /** Service name */
  service: string;

  /** Service version */
  version?: string;

  /** Service uptime in milliseconds */
  uptime?: number;

  /** Individual component statuses */
  components: HealthCheckComponent[];

  /** Overall health check duration in milliseconds */
  duration: number;

  /** Additional service-specific details */
  details?: Record<string, unknown>;

  /** Aggregated errors from unhealthy components */
  errors: string[];

  /** Aggregated warnings from degraded components */
  warnings: string[];
}

export interface HealthCheckConfig {
  /** Service name */
  serviceName: string;

  /** Service version */
  version?: string;

  /** Timeout for individual component checks in milliseconds */
  componentTimeout?: number;

  /** Overall health check timeout in milliseconds */
  overallTimeout?: number;

  /** Whether to include detailed component information */
  includeDetails?: boolean;

  /** Whether to include error stack traces */
  includeStackTraces?: boolean;
}

export interface ComponentCheck {
  /** Component name */
  name: string;

  /** Check function that returns component status */
  check: () => Promise<Omit<HealthCheckComponent, 'name' | 'lastChecked'>>;

  /** Whether this component is critical for service health */
  critical?: boolean;

  /** Timeout for this specific component check */
  timeout?: number;
}

export interface PeriodicHealthCheckConfig {
  /** Interval between health checks in milliseconds */
  interval: number;

  /** Whether to log health check results */
  logResults?: boolean;

  /** Whether to only log when status changes */
  logOnlyChanges?: boolean;

  /** Whether to send notifications on status changes */
  sendNotifications?: boolean;

  /** Callback function for health check results */
  onHealthCheck?: (result: HealthCheckResult) => void | Promise<void>;

  /** Callback function for status changes */
  onStatusChange?: (
    newStatus: HealthStatus,
    oldStatus: HealthStatus,
    result: HealthCheckResult
  ) => void | Promise<void>;
}

export interface HealthMetrics {
  /** Total number of health checks performed */
  totalChecks: number;

  /** Number of healthy checks */
  healthyChecks: number;

  /** Number of degraded checks */
  degradedChecks: number;

  /** Number of unhealthy checks */
  unhealthyChecks: number;

  /** Average health check duration */
  averageDuration: number;

  /** Last health check result */
  lastResult?: HealthCheckResult;

  /** Current consecutive status count */
  consecutiveStatusCount: number;

  /** Timestamp of last status change */
  lastStatusChange?: Date;
}
