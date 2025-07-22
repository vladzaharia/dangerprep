import * as fs from 'fs-extra';
import * as path from 'path';
import { OfflineSyncConfig } from './types';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
}

export class Logger {
  private config: OfflineSyncConfig['offline_sync']['logging'];
  private logLevel: LogLevel;
  private logFile: string;
  private maxSize: number;
  private backupCount: number;

  constructor(config: OfflineSyncConfig['offline_sync']['logging']) {
    this.config = config;
    this.logLevel = this.parseLogLevel(config.level);
    this.logFile = config.file;
    this.maxSize = this.parseSize(config.max_size);
    this.backupCount = config.backup_count;
    
    this.ensureLogDirectory();
  }

  /**
   * Log debug message
   */
  public debug(component: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, component, message, data);
  }

  /**
   * Log info message
   */
  public info(component: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, component, message, data);
  }

  /**
   * Log warning message
   */
  public warn(component: string, message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, component, message, data);
  }

  /**
   * Log error message
   */
  public error(component: string, message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorObj = error instanceof Error ? error : undefined;
    const entry: LogEntry = {
      timestamp: new Date(),
      level: LogLevel.ERROR,
      component,
      message,
      data,
      error: errorObj
    };

    this.writeLog(entry);
  }

  /**
   * Log message with specified level
   */
  private log(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      message,
      data
    };

    this.writeLog(entry);
  }

  /**
   * Write log entry to file and console
   */
  private async writeLog(entry: LogEntry): Promise<void> {
    const logLine = this.formatLogEntry(entry);
    
    // Write to console
    this.writeToConsole(entry, logLine);
    
    // Write to file
    try {
      await this.writeToFile(logLine);
    } catch (error) {
      console.error(`Failed to write to log file: ${error}`);
    }
  }

  /**
   * Format log entry as string
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = LogLevel[entry.level].padEnd(5);
    const component = entry.component.padEnd(15);
    
    let logLine = `${timestamp} [${level}] [${component}] ${entry.message}`;
    
    if (entry.data && Object.keys(entry.data).length > 0) {
      logLine += ` | Data: ${JSON.stringify(entry.data)}`;
    }
    
    if (entry.error) {
      logLine += ` | Error: ${entry.error.message}`;
      if (entry.error.stack) {
        logLine += `\nStack: ${entry.error.stack}`;
      }
    }
    
    return logLine;
  }

  /**
   * Write to console with appropriate method
   */
  private writeToConsole(entry: LogEntry, logLine: string): void {
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(logLine);
        break;
      case LogLevel.INFO:
        console.info(logLine);
        break;
      case LogLevel.WARN:
        console.warn(logLine);
        break;
      case LogLevel.ERROR:
        console.error(logLine);
        break;
    }
  }

  /**
   * Write to log file with rotation
   */
  private async writeToFile(logLine: string): Promise<void> {
    // Check if log rotation is needed
    if (await this.needsRotation()) {
      await this.rotateLogFile();
    }

    // Append to log file
    await fs.appendFile(this.logFile, logLine + '\n');
  }

  /**
   * Check if log file needs rotation
   */
  private async needsRotation(): Promise<boolean> {
    try {
      if (!await fs.pathExists(this.logFile)) {
        return false;
      }

      const stats = await fs.stat(this.logFile);
      return stats.size >= this.maxSize;
    } catch (error) {
      return false;
    }
  }

  /**
   * Rotate log file
   */
  private async rotateLogFile(): Promise<void> {
    try {
      // Remove oldest backup if it exists
      const oldestBackup = `${this.logFile}.${this.backupCount}`;
      if (await fs.pathExists(oldestBackup)) {
        await fs.unlink(oldestBackup);
      }

      // Rotate existing backups
      for (let i = this.backupCount - 1; i >= 1; i--) {
        const currentBackup = `${this.logFile}.${i}`;
        const nextBackup = `${this.logFile}.${i + 1}`;
        
        if (await fs.pathExists(currentBackup)) {
          await fs.move(currentBackup, nextBackup);
        }
      }

      // Move current log to first backup
      if (await fs.pathExists(this.logFile)) {
        await fs.move(this.logFile, `${this.logFile}.1`);
      }
    } catch (error) {
      console.error(`Failed to rotate log file: ${error}`);
    }
  }

  /**
   * Ensure log directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    try {
      const logDir = path.dirname(this.logFile);
      await fs.ensureDir(logDir);
    } catch (error) {
      console.error(`Failed to create log directory: ${error}`);
    }
  }

  /**
   * Parse log level string to enum
   */
  private parseLogLevel(level: string): LogLevel {
    switch (level.toUpperCase()) {
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
        return LogLevel.INFO;
    }
  }

  /**
   * Parse size string to bytes
   */
  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
    if (!match || !match[1] || !match[2]) {
      return 50 * 1024 * 1024; // Default 50MB
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    return Math.floor(value * (units[unit] ?? 1));
  }

  /**
   * Get recent log entries
   */
  public async getRecentLogs(lines: number = 100): Promise<string[]> {
    try {
      if (!await fs.pathExists(this.logFile)) {
        return [];
      }

      const content = await fs.readFile(this.logFile, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      
      return allLines.slice(-lines);
    } catch (error) {
      console.error(`Failed to read log file: ${error}`);
      return [];
    }
  }

  /**
   * Clear log file
   */
  public async clearLogs(): Promise<void> {
    try {
      if (await fs.pathExists(this.logFile)) {
        await fs.writeFile(this.logFile, '');
      }
    } catch (error) {
      console.error(`Failed to clear log file: ${error}`);
    }
  }

  /**
   * Get log file stats
   */
  public async getLogStats(): Promise<{ size: number; lines: number; lastModified: Date } | null> {
    try {
      if (!await fs.pathExists(this.logFile)) {
        return null;
      }

      const stats = await fs.stat(this.logFile);
      const content = await fs.readFile(this.logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim()).length;

      return {
        size: stats.size,
        lines,
        lastModified: stats.mtime
      };
    } catch (error) {
      console.error(`Failed to get log stats: ${error}`);
      return null;
    }
  }
}
