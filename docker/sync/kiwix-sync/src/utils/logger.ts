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
    fs.mkdir(logDir, { recursive: true }).catch(console.error);
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

    // Always log to console
    console.log(formattedMessage);

    // Log to file if configured
    if (this.logFile) {
      try {
        await fs.appendFile(this.logFile, `${formattedMessage}\n`);
      } catch (error) {
        console.error(`Failed to write to log file: ${error}`);
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
