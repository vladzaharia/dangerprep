/**
 * Logging types and interfaces for structured logging
 */

// Use const assertion for better type inference
export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
export type LogLevelString = (typeof LOG_LEVELS)[number];

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Use const assertion for format types
export const LOG_FORMATS = ['json', 'text'] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

export interface LogEntry {
  readonly timestamp: Date;
  readonly level: LogLevel;
  readonly component: string;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly error?: Error;
}

export interface LogTransport {
  readonly name: string;
  log(entry: LogEntry): Promise<void>;
  close?(): Promise<void>;
}

export interface LoggerConfig {
  readonly level: LogLevel | LogLevelString;
  readonly component: string;
  readonly transports?: LogTransport[];
}

export interface FileTransportConfig {
  readonly filename: string;
  readonly maxSize?: string;
  readonly maxFiles?: number;
  readonly format?: LogFormat;
}

export interface ConsoleTransportConfig {
  readonly format?: LogFormat;
  readonly colors?: boolean;
}

// Type guard functions
export const isLogLevel = (value: string): value is LogLevelString =>
  LOG_LEVELS.includes(value as LogLevelString);

export const isLogFormat = (value: string): value is LogFormat =>
  LOG_FORMATS.includes(value as LogFormat);

// Utility type for log data
export type LogData = Readonly<Record<string, unknown>>;

// Event types for logger
export interface LoggerEvents {
  readonly log: [entry: LogEntry];
  readonly error: [error: Error];
  readonly transportAdded: [transport: LogTransport];
  readonly transportRemoved: [transportName: string];
}
