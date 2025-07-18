import { BaseHandler } from './base';
import { ContentTypeConfig } from '../types';
import { Logger } from '../utils/logger';

export class BooksHandler extends BaseHandler {
  constructor(config: ContentTypeConfig, logger: Logger) {
    super(config, logger);
    this.contentType = 'books';
  }

  async sync(): Promise<boolean> {
    this.logSyncStart();

    try {
      // Validate paths
      if (!await this.validatePaths()) {
        return false;
      }

      if (!this.config.nfs_path) {
        this.logError('NFS path not configured for books sync');
        return false;
      }

      // Check storage space
      if (!await this.checkStorageSpace()) {
        return false;
      }

      // Perform full sync of all books
      const success = await this.rsyncDirectory(
        this.config.nfs_path,
        this.config.local_path,
        {
          exclude: this.getExcludePatterns()
        }
      );

      if (success) {
        const finalSize = await this.getDirectorySize(this.config.local_path);
        this.logSyncComplete(true, `synced ${this.formatSize(finalSize)}`);
      } else {
        this.logSyncComplete(false, 'rsync operation failed');
      }

      return success;
    } catch (error) {
      this.logError('Sync operation failed', error);
      this.logSyncComplete(false, error.toString());
      return false;
    }
  }

  protected getExcludePatterns(): string[] {
    return [
      ...super.getExcludePatterns(),
      '*.opf.bak',
      '*.epub.bak',
      '*.mobi.bak',
      '*.pdf.bak'
    ];
  }
}
