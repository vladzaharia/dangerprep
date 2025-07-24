/**
 * Circuit breaker module - Fault tolerance patterns for external service calls
 *
 * Features:
 * - Circuit breaker pattern implementation
 * - Configurable failure thresholds and recovery timeouts
 * - Multiple circuit breaker states (closed, open, half-open)
 * - Circuit breaker manager for multiple instances
 * - Integration with retry mechanisms
 * - Comprehensive metrics and monitoring
 */

// Core circuit breaker types and enums
export {
  CircuitBreakerState,
  CircuitBreakerOpenError,
  DEFAULT_CIRCUIT_BREAKER_CONFIGS,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitBreakerResult,
} from './types.js';

// Circuit breaker implementation
export { CircuitBreaker } from './circuit-breaker.js';

// Circuit breaker manager
export { CircuitBreakerManager, CircuitBreakerUtils } from './circuit-breaker-manager.js';
