import { ConsoleTransport } from './transports/console-transport.js';
import { LogEntry, LogLevel, LogTransport, LoggerConfig } from './types.js';

/**
 * Modern structured logger with multiple transport support
 */
export class Logger {
  private level: LogLevel;
  private component: string;
  private transports: LogTransport[];

  constructor(config: LoggerConfig) {
    this.component = config.component;
    this.level = typeof config.level === 'string' ? this.parseLogLevel(config.level) : config.level;

    this.transports = config.transports || [new ConsoleTransport()];
  }

  /**
   * Create a child logger with additional context
   */
  child(component: string): Logger {
    return new Logger({
      level: this.level,
      component: `${this.component}:${component}`,
      transports: this.transports,
    });
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorObj = error instanceof Error ? error : undefined;
    this.log(LogLevel.ERROR, message, data, errorObj);
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel | string): void {
    this.level = typeof level === 'string' ? this.parseLogLevel(level) : level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Add a transport to the logger
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  /**
   * Remove a transport from the logger
   */
  removeTransport(transportName: string): void {
    this.transports = this.transports.filter(t => t.name !== transportName);
  }

  /**
   * Close all transports
   */
  async close(): Promise<void> {
    await Promise.all(
      this.transports
        .filter((t): t is LogTransport & { close: () => Promise<void> } => !!t.close)
        .map(t => t.close())
    );
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    if (level < this.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component: this.component,
      message,
      ...(data && { data }),
      ...(error && { error }),
    };

    this.transports.forEach(transport => {
      transport.log(entry).catch(err => {
        console.error(`Transport ${transport.name} failed:`, err);
      });
    });
  }

  private parseLogLevel(level: string): LogLevel {
    const normalizedLevel = level.toUpperCase();

    switch (normalizedLevel) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
      case 'WARNING':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        throw new Error(`Invalid log level: ${level}`);
    }
  }
}
