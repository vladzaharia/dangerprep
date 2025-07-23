/**
 * Logging types and interfaces for structured logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown> | undefined;
  error?: Error | undefined;
}

export interface LogTransport {
  name: string;
  log(entry: LogEntry): Promise<void>;
  close?(): Promise<void>;
}

export interface LoggerConfig {
  level: LogLevel | string;
  component: string;
  transports?: LogTransport[];
}

export interface FileTransportConfig {
  filename: string;
  maxSize?: string;
  maxFiles?: number;
  format?: 'json' | 'text';
}

export interface ConsoleTransportConfig {
  format?: 'json' | 'text';
  colors?: boolean;
}
