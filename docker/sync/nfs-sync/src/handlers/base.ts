import {
  getDirectorySize,
  parseSize,
  formatSize,
  ensureDirectory,
  rsyncDirectory,
  fileExists,
} from '@dangerprep/files';
import type { Logger } from '@dangerprep/logging';

import { ContentTypeConfig } from '../types';

export abstract class BaseHandler {
  protected contentType = '';

  constructor(
    protected readonly config: ContentTypeConfig,
    protected readonly logger: Logger
  ) {}

  abstract sync(): Promise<boolean>;

  protected async getDirectorySize(dirPath: string): Promise<number> {
    return await getDirectorySize(dirPath);
  }

  protected parseSize(sizeStr: string): number {
    return parseSize(sizeStr);
  }

  protected formatSize(bytes: number): string {
    return formatSize(bytes);
  }

  protected async ensureDirectory(dirPath: string): Promise<void> {
    return await ensureDirectory(dirPath);
  }

  protected async rsyncDirectory(
    sourcePath: string,
    destPath: string,
    options: {
      readonly exclude?: readonly string[];
      readonly bandwidthLimit?: string;
      readonly dryRun?: boolean;
    } = {}
  ): Promise<boolean> {
    const rsyncOptions: {
      logger: Logger;
      exclude?: string[];
      bandwidthLimit?: string;
      dryRun?: boolean;
    } = {
      logger: this.logger,
    };

    if (options.exclude) {
      rsyncOptions.exclude = [...options.exclude];
    }
    if (options.bandwidthLimit) {
      rsyncOptions.bandwidthLimit = options.bandwidthLimit;
    }
    if (options.dryRun !== undefined) {
      rsyncOptions.dryRun = options.dryRun;
    }

    return await rsyncDirectory(sourcePath, destPath, rsyncOptions);
  }

  protected async fileExists(filePath: string): Promise<boolean> {
    return await fileExists(filePath);
  }

  protected logSyncStart(): void {
    this.logger.info(`Starting ${this.contentType} sync`);
  }

  protected logSyncComplete(success: boolean, details?: string): void {
    if (success) {
      this.logger.info(
        `${this.contentType} sync completed successfully${details ? `: ${details}` : ''}`
      );
    } else {
      this.logger.error(`${this.contentType} sync failed${details ? `: ${details}` : ''}`);
    }
  }

  protected logProgress(message: string): void {
    this.logger.info(`[${this.contentType}] ${message}`);
  }

  protected logError(message: string, error?: unknown): void {
    this.logger.error(`[${this.contentType}] ${message}${error ? `: ${error}` : ''}`);
  }

  protected async checkStorageSpace(requiredSize: number = 0): Promise<boolean> {
    try {
      const currentSize = await this.getDirectorySize(this.config.local_path);
      const maxSize = this.parseSize(this.config.max_size);

      if (currentSize + requiredSize > maxSize) {
        this.logError(
          `Storage limit exceeded: ${this.formatSize(currentSize + requiredSize)} > ${this.config.max_size}`
        );
        return false;
      }

      return true;
    } catch (error) {
      this.logError('Failed to check storage space', error);
      return false;
    }
  }

  protected async validatePaths(): Promise<boolean> {
    try {
      // Ensure local path exists
      await this.ensureDirectory(this.config.local_path);

      // Check if NFS path exists (if configured)
      if (this.config.nfs_path) {
        const nfsExists = await this.fileExists(this.config.nfs_path);
        if (!nfsExists) {
          this.logError(`NFS path does not exist: ${this.config.nfs_path}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logError('Path validation failed', error);
      return false;
    }
  }

  protected getExcludePatterns(): string[] {
    return [
      '*.tmp',
      '*.part',
      '.DS_Store',
      'Thumbs.db',
      '*.nfo',
      '*.srt.bak',
      '@eaDir',
      '.@__thumb',
    ];
  }
}
