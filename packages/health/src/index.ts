/**
 * Health module - Standardized health check system for DangerPrep services
 *
 * Features:
 * - Standardized health check interface across all services
 * - Component-based health monitoring
 * - Periodic health checks with notifications
 * - Comprehensive health metrics and reporting
 * - Integration with logging and notification systems
 */

// Core exports
export { HealthChecker } from './checker.js';
export { PeriodicHealthChecker } from './periodic.js';

// Types and enums
export {
  HealthStatus,
  ComponentStatus,
  type ComponentName,
  type HealthCheckTimeout,
  type HealthScore,
  isComponentName,
  isHealthCheckTimeout,
  isHealthScore,
  createComponentName,
  createHealthCheckTimeout,
  createHealthScore,
} from './types.js';

export type {
  HealthCheckComponent,
  HealthCheckResult,
  HealthCheckConfig,
  ComponentCheck,
  PeriodicHealthCheckConfig,
  HealthMetrics,
} from './types.js';

// Utility functions
export { HealthUtils } from './utils.js';
