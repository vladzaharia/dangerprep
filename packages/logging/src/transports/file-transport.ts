import { promises as fs } from 'fs';
import path from 'path';

import { LogEntry, LogLevel, LogTransport, FileTransportConfig } from '../types.js';

/**
 * File transport for logging to files with rotation support
 */
export class FileTransport implements LogTransport {
  public readonly name = 'file';
  private config: Required<FileTransportConfig>;
  private maxSizeBytes: number;

  constructor(config: FileTransportConfig) {
    this.config = {
      maxSize: '50MB',
      maxFiles: 5,
      format: 'text',
      ...config,
    };

    this.maxSizeBytes = this.parseSize(this.config.maxSize);
    this.ensureLogDirectory();
  }

  async log(entry: LogEntry): Promise<void> {
    try {
      // Check if rotation is needed
      if (await this.needsRotation()) {
        await this.rotateLogFile();
      }

      const logLine =
        this.config.format === 'json' ? this.formatJson(entry) : this.formatText(entry);

      await fs.appendFile(this.config.filename, `${logLine}\n`);
    } catch (error) {
      // Fallback to console if file logging fails
      // eslint-disable-next-line no-console
      console.error(`Failed to write to log file: ${error}`);
    }
  }

  async close(): Promise<void> {
    // File transport doesn't need explicit closing
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
    const level = LogLevel[entry.level];
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

  private async ensureLogDirectory(): Promise<void> {
    try {
      const logDir = path.dirname(this.config.filename);
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to create log directory: ${error}`);
    }
  }

  private async needsRotation(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.config.filename);
      return stats.size >= this.maxSizeBytes;
    } catch {
      // File doesn't exist yet
      return false;
    }
  }

  private async rotateLogFile(): Promise<void> {
    try {
      // Remove oldest backup if it exists
      const oldestBackup = `${this.config.filename}.${this.config.maxFiles}`;
      try {
        await fs.unlink(oldestBackup);
      } catch {
        // File doesn't exist, which is fine
      }

      // Rotate existing backups
      for (let i = this.config.maxFiles - 1; i >= 1; i--) {
        const currentBackup = `${this.config.filename}.${i}`;
        const nextBackup = `${this.config.filename}.${i + 1}`;

        try {
          await fs.rename(currentBackup, nextBackup);
        } catch {
          // File doesn't exist, which is fine
        }
      }

      // Move current log to first backup
      try {
        await fs.rename(this.config.filename, `${this.config.filename}.1`);
      } catch {
        // File doesn't exist, which is fine
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to rotate log file: ${error}`);
    }
  }

  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      B: 1,
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
      TB: 1024 * 1024 * 1024 * 1024,
    };

    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B)$/i);
    if (!match?.[1] || !match[2]) {
      throw new Error(`Invalid size format: ${sizeStr}`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    return value * (units[unit] || 1);
  }
}
