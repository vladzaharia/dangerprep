import { Logger } from './logger.js';
import { ConsoleTransport } from './transports/console-transport.js';
import { FileTransport } from './transports/file-transport.js';
import { LogLevel, LogTransport, type LogLevelString, isLogLevel } from './types.js';

/**
 * Convert string level to LogLevel enum
 */
const normalizeLogLevel = (level: LogLevel | string): LogLevel | LogLevelString => {
  if (typeof level === 'string' && isLogLevel(level)) {
    return level;
  }
  return level as LogLevel;
};

/**
 * Factory for creating loggers with common configurations
 */
export class LoggerFactory {
  /**
   * Create a logger with console transport only
   */
  static createConsoleLogger(component: string, level: LogLevel | string = LogLevel.INFO): Logger {
    return new Logger({
      component,
      level: normalizeLogLevel(level),
      transports: [new ConsoleTransport({ format: 'text', colors: true })],
    });
  }

  /**
   * Create a logger with file transport only
   */
  static createFileLogger(
    component: string,
    filename: string,
    level: LogLevel | string = LogLevel.INFO
  ): Logger {
    return new Logger({
      component,
      level: normalizeLogLevel(level),
      transports: [new FileTransport({ filename, format: 'text' })],
    });
  }

  /**
   * Create a logger with both console and file transports
   */
  static createCombinedLogger(
    component: string,
    filename: string,
    level: LogLevel | string = LogLevel.INFO
  ): Logger {
    return new Logger({
      component,
      level: normalizeLogLevel(level),
      transports: [
        new ConsoleTransport({ format: 'text', colors: true }),
        new FileTransport({ filename, format: 'text' }),
      ],
    });
  }

  /**
   * Create a logger from legacy config format (for migration compatibility)
   */
  static fromLegacyConfig(
    component: string,
    config: {
      level: string;
      file?: string;
      max_size?: string;
      backup_count?: number;
    }
  ): Logger {
    const transports: LogTransport[] = [new ConsoleTransport({ format: 'text', colors: true })];

    if (config.file) {
      transports.push(
        new FileTransport({
          filename: config.file,
          maxSize: config.max_size || '50MB',
          maxFiles: config.backup_count || 5,
          format: 'text',
        })
      );
    }

    return new Logger({
      component,
      level: normalizeLogLevel(config.level),
      transports,
    });
  }

  /**
   * Create a structured JSON logger for production environments
   */
  static createStructuredLogger(
    component: string,
    filename: string,
    level: LogLevel | string = LogLevel.INFO
  ): Logger {
    return new Logger({
      component,
      level: normalizeLogLevel(level),
      transports: [
        new ConsoleTransport({ format: 'json', colors: false }),
        new FileTransport({ filename, format: 'json' }),
      ],
    });
  }
}
