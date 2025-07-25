import { LogEntry, LogLevel, LogTransport, ConsoleTransportConfig } from '../types.js';

/**
 * Console transport for logging to stdout/stderr
 */
export class ConsoleTransport implements LogTransport {
  public readonly name = 'console';
  private config: ConsoleTransportConfig;

  constructor(config: ConsoleTransportConfig = {}) {
    this.config = {
      format: 'text',
      colors: true,
      ...config,
    };
  }

  async log(entry: LogEntry): Promise<void> {
    const output = this.config.format === 'json' ? this.formatJson(entry) : this.formatText(entry);

    // Use appropriate console method based on log level

    switch (entry.level) {
      case LogLevel.DEBUG:
        // eslint-disable-next-line no-console
        console.debug(output);
        break;
      case LogLevel.INFO:
        // eslint-disable-next-line no-console
        console.info(output);
        break;
      case LogLevel.WARN:
        // eslint-disable-next-line no-console
        console.warn(output);
        break;
      case LogLevel.ERROR:
        // eslint-disable-next-line no-console
        console.error(output);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(output);
    }
  }

  private formatJson(entry: LogEntry): string {
    const logObject = {
      timestamp: entry.timestamp.toISOString(),
      level: LogLevel[entry.level],
      component: entry.component,
      message: entry.message,
      ...(entry.data && Object.keys(entry.data).length > 0 && { data: entry.data }),
      ...(entry.error && {
        error: {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack,
        },
      }),
    };

    return JSON.stringify(logObject);
  }

  private formatText(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = this.config.colors ? this.colorizeLevel(entry.level) : LogLevel[entry.level];
    const component = `[${entry.component}]`;

    let message = `${timestamp} ${level} ${component} ${entry.message}`;

    if (entry.data && Object.keys(entry.data).length > 0) {
      message += ` ${JSON.stringify(entry.data)}`;
    }

    if (entry.error) {
      message += `\n${entry.error.stack || entry.error.message}`;
    }

    return message;
  }

  private colorizeLevel(level: LogLevel): string {
    if (!this.config.colors) {
      return LogLevel[level];
    }

    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m', // Green
      [LogLevel.WARN]: '\x1b[33m', // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
    };

    const reset = '\x1b[0m';
    const color = colors[level] || '';

    return `${color}${LogLevel[level]}${reset}`;
  }
}
