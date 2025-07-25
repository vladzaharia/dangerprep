import { promises as fs } from 'fs';
import path from 'path';

import type { Logger } from '@dangerprep/logging';

import { ContentTypeConfig } from '../types';

import { BaseHandler } from './base';

export class WebTVHandler extends BaseHandler {
  constructor(config: ContentTypeConfig, logger: Logger) {
    super(config, logger);
    this.contentType = 'webtv';
  }

  async sync(): Promise<boolean> {
    this.logSyncStart();

    try {
      // Validate paths
      if (!(await this.validatePaths())) {
        return false;
      }

      if (!this.config.nfs_path) {
        this.logError('NFS path not configured for WebTV sync');
        return false;
      }

      // Check storage space
      if (!(await this.checkStorageSpace())) {
        return false;
      }

      // Get available folders from NFS
      const availableFolders = await this.getAvailableFolders();
      this.logProgress(`Found ${availableFolders.length} folders in NFS path`);

      // Filter folders based on include list
      const foldersToSync = this.filterFolders(availableFolders);
      this.logProgress(`${foldersToSync.length} folders selected for sync`);

      if (foldersToSync.length === 0) {
        this.logProgress('No folders to sync');
        return true;
      }

      // Sync selected folders
      const success = await this.syncSelectedFolders(foldersToSync);

      this.logSyncComplete(success);
      return success;
    } catch (error) {
      this.logError('Sync operation failed', error);
      this.logSyncComplete(false, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private async getAvailableFolders(): Promise<string[]> {
    try {
      if (!this.config.nfs_path) {
        throw new Error('NFS path not configured');
      }
      const items = await fs.readdir(this.config.nfs_path, { withFileTypes: true });
      return items
        .filter(item => item.isDirectory())
        .map(item => item.name)
        .filter(name => !name.startsWith('.'));
    } catch (error) {
      this.logError('Failed to read NFS directory', error);
      return [];
    }
  }

  private filterFolders(availableFolders: string[]): string[] {
    if (!this.config.include_folders || this.config.include_folders.length === 0) {
      return availableFolders;
    }

    const filtered = availableFolders.filter(
      folder =>
        this.config.include_folders?.some(
          includePattern =>
            folder.toLowerCase().includes(includePattern.toLowerCase()) ||
            includePattern.toLowerCase().includes(folder.toLowerCase())
        ) ?? true
    );

    this.logProgress(`Filtered folders: ${filtered.join(', ')}`);
    return filtered;
  }

  private async syncSelectedFolders(folders: string[]): Promise<boolean> {
    let currentSize = await this.getDirectorySize(this.config.local_path);
    const maxSize = this.parseSize(this.config.max_size);

    let syncedCount = 0;
    let skippedCount = 0;

    for (const folder of folders) {
      try {
        if (!this.config.nfs_path) {
          throw new Error('NFS path not configured');
        }
        const sourcePath = path.join(this.config.nfs_path, folder);
        const destPath = path.join(this.config.local_path, folder);

        // Check if folder already exists and get its size
        const existingSize = await this.getDirectorySize(destPath);
        const sourceSize = await this.getDirectorySize(sourcePath);
        const additionalSize = Math.max(0, sourceSize - existingSize);

        if (currentSize + additionalSize > maxSize) {
          this.logProgress(`Size limit would be exceeded by ${folder}, skipping remaining folders`);
          skippedCount += folders.length - syncedCount;
          break;
        }

        this.logProgress(`Syncing folder: ${folder}`);
        const success = await this.rsyncDirectory(sourcePath, destPath, {
          exclude: this.getWebTVExcludePatterns(),
        });

        if (success) {
          const finalSize = await this.getDirectorySize(destPath);
          currentSize = currentSize - existingSize + finalSize;
          syncedCount++;
          this.logProgress(`Synced: ${folder} (${this.formatSize(finalSize)})`);
        } else {
          skippedCount++;
          this.logProgress(`Failed to sync: ${folder}`);
        }
      } catch (error) {
        skippedCount++;
        this.logError(`Error syncing folder ${folder}`, error);
      }
    }

    this.logProgress(`Sync completed: ${syncedCount} folders synced, ${skippedCount} skipped`);
    return syncedCount > 0;
  }

  private getWebTVExcludePatterns(): string[] {
    return [
      ...super.getExcludePatterns(),
      '*.mkv.bak',
      '*.mp4.bak',
      '*.avi.bak',
      '*.webm.bak',
      '*.flv.bak',
      'thumbnails/',
      'previews/',
      '*.part',
      '*.ytdl',
      '*.temp',
    ];
  }
}
