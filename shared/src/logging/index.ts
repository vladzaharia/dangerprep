/**
 * Logging module - Modern structured logging for DangerPrep services
 *
 * Features:
 * - Structured logging with JSON and text formats
 * - Multiple transports (console, file)
 * - Log rotation with configurable size and file limits
 * - TypeScript-first design with proper error handling
 * - Child loggers for component-specific logging
 * - Factory methods for common configurations
 */

// Core exports
export { Logger } from './logger.js';
export { LoggerFactory } from './factory.js';

// Types
export { LogLevel } from './types.js';

export type {
  LogEntry,
  LogTransport,
  LoggerConfig,
  FileTransportConfig,
  ConsoleTransportConfig,
} from './types.js';

// Transports
export { ConsoleTransport } from './transports/console-transport.js';
export { FileTransport } from './transports/file-transport.js';
