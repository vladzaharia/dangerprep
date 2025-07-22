import { promises as fs } from 'fs';
import path from 'path';

export class Logger {
  private logLevel: string = 'INFO';
  private logFile?: string;

  constructor(private context: string) {}

  setLevel(level: string): void {
    this.logLevel = level.toUpperCase();
  }

  setLogFile(filePath: string): void {
    this.logFile = filePath;
    // Ensure log directory exists
    const logDir = path.dirname(filePath);
    fs.mkdir(logDir, { recursive: true }).catch(error => {
      // Write to stderr for critical logger initialization errors
      process.stderr.write(`Failed to create log directory: ${error}\n`);
    });
  }

  private shouldLog(level: string): boolean {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level.toUpperCase());
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} [${level}] [${this.context}] ${message}`;
  }

  private async writeLog(level: string, message: string): Promise<void> {
    const formattedMessage = this.formatMessage(level, message);

    // Always log to stdout for service output
    process.stdout.write(`${formattedMessage}\n`);

    // Log to file if configured
    if (this.logFile) {
      try {
        await fs.appendFile(this.logFile, `${formattedMessage}\n`);
      } catch (error) {
        // Write to stderr for log file errors
        process.stderr.write(`Failed to write to log file: ${error}\n`);
      }
    }
  }

  debug(message: string): void {
    if (this.shouldLog('DEBUG')) {
      this.writeLog('DEBUG', message);
    }
  }

  info(message: string): void {
    if (this.shouldLog('INFO')) {
      this.writeLog('INFO', message);
    }
  }

  warn(message: string): void {
    if (this.shouldLog('WARN')) {
      this.writeLog('WARN', message);
    }
  }

  error(message: string): void {
    if (this.shouldLog('ERROR')) {
      this.writeLog('ERROR', message);
    }
  }
}
