/**
 * Service module - Standardized service lifecycle management for DangerPrep services
 *
 * Features:
 * - Base service class with standardized lifecycle management
 * - Service state management and monitoring
 * - Automatic health check integration
 * - Signal handling for graceful shutdown
 * - Event-driven architecture with lifecycle hooks
 * - Comprehensive error handling and notifications
 */

// Core exports
export { BaseService } from './base.js';
export { ServicePatterns, AdvancedAsyncPatterns } from './patterns.js';
export { ServiceScheduler } from './scheduler.js';
export { ServiceSchedulePatterns } from './schedule-patterns.js';
export { ServiceProgressManager } from './progress-manager.js';
export { ServiceProgressPatterns } from './progress-patterns.js';
export { ServiceRegistry } from './registry.js';
export { ServiceDiscoveryPatterns } from './discovery-patterns.js';
export { ServiceRecoveryManager } from './recovery-manager.js';

// Types and enums
export { ServiceState } from './types.js';

export type {
  ServiceConfig,
  ServiceStats,
  ServiceLifecycleHooks,
  ServiceComponents,
  ServiceInitializationResult,
  ServiceShutdownResult,
  ServiceSchedulerConfig,
  ServiceScheduleOptions,
  ServiceScheduledTask,
  ServiceSchedulerStatus,
  ServiceProgressConfig,
  ServiceRegistryConfig,
  ServiceRegistration,
  ServiceDependency,
  ServiceCapability,
  ServiceDiscoveryQuery,
  ServiceRegistryStatus,
  ServiceRecoveryConfig,
  ServiceRecoveryState,
} from './types.js';

// Error classes
export {
  ServiceError,
  ServiceInitializationError,
  ServiceStartupError,
  ServiceShutdownError,
  ServiceConfigurationError,
} from './types.js';

// Utility functions
export { ServiceUtils } from './utils.js';
