import { promises as fs } from 'fs';
import path from 'path';

import { FileUtils } from '@dangerprep/files';
import type { Logger } from '@dangerprep/logging';

import type { KiwixConfig, ZimPackage } from '../types';

import { ZimDownloader } from './downloader';

export class ZimUpdater {
  private readonly config: KiwixConfig['kiwix_manager'];
  private readonly logger: Logger;
  private readonly downloader: ZimDownloader;

  constructor(config: KiwixConfig, logger: Logger) {
    this.config = config.kiwix_manager;
    this.logger = logger;
    this.downloader = new ZimDownloader(config, logger);
  }

  async updatePackage(packageName: string): Promise<boolean> {
    try {
      this.logger.info(`Checking for updates: ${packageName}`);

      const needsUpdate = await this.downloader.checkForUpdates(packageName);

      if (!needsUpdate) {
        this.logger.info(`Package ${packageName} is up to date`);
        return true;
      }

      this.logger.info(`Updating package: ${packageName}`);

      // Backup existing file if it exists
      const existingPath = path.join(this.config.storage.zim_directory, `${packageName}.zim`);
      const backupPath = path.join(this.config.storage.zim_directory, `${packageName}.zim.backup`);

      if (await FileUtils.fileExists(existingPath)) {
        await FileUtils.moveFile(existingPath, backupPath);
        this.logger.debug(`Backed up existing file to ${backupPath}`);
      }

      // Download new version
      const success = await this.downloader.downloadPackage(packageName);

      if (success) {
        // Remove backup on successful update
        if (await FileUtils.fileExists(backupPath)) {
          await FileUtils.deleteFile(backupPath);
          this.logger.debug(`Removed backup file ${backupPath}`);
        }
        this.logger.info(`Successfully updated ${packageName}`);
        return true;
      } else {
        // Restore backup on failure
        if (await FileUtils.fileExists(backupPath)) {
          await FileUtils.moveFile(backupPath, existingPath);
          this.logger.info(`Restored backup for ${packageName}`);
        }
        this.logger.error(`Failed to update ${packageName}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error updating package ${packageName}: ${error}`);
      return false;
    }
  }

  async updateAllExistingPackages(): Promise<{ success: number; failed: number }> {
    const existingPackages = await this.scanExistingZimFiles();
    let successCount = 0;
    let failedCount = 0;

    this.logger.info(`Starting update of ${existingPackages.length} existing ZIM packages`);

    for (const zimPackage of existingPackages) {
      try {
        const success = await this.updatePackage(zimPackage.name);
        if (success) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        this.logger.error(`Failed to update ${zimPackage.name}: ${error}`);
        failedCount++;
      }

      // Small delay between updates to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.logger.info(`Update completed: ${successCount} successful, ${failedCount} failed`);
    return { success: successCount, failed: failedCount };
  }

  private async scanExistingZimFiles(): Promise<ZimPackage[]> {
    try {
      const zimDir = this.config.storage.zim_directory;
      const files = await fs.readdir(zimDir);
      const zimFiles = files.filter(file => file.endsWith('.zim') && !file.includes('.backup'));

      const packages: ZimPackage[] = [];

      for (const file of zimFiles) {
        const filePath = path.join(zimDir, file);
        const stats = await fs.stat(filePath);
        const packageName = this.extractPackageNameFromFile(file);

        packages.push({
          name: packageName,
          title: packageName.replace(/_/g, ' '),
          description: `Local ZIM file: ${file}`,
          size: FileUtils.formatSize(stats.size),
          date: stats.mtime.toISOString(),
          path: filePath,
        });
      }

      this.logger.debug(`Found ${packages.length} existing ZIM packages`);
      return packages;
    } catch (error) {
      this.logger.error(`Error scanning existing ZIM files: ${error}`);
      return [];
    }
  }

  private extractPackageNameFromFile(filename: string): string {
    // Remove .zim extension and any version/date suffixes
    // Example: wikipedia_en_all_2024-01.zim -> wikipedia_en_all
    return filename
      .replace(/\.zim$/, '')
      .replace(/_\d{4}-\d{2}$/, '')
      .replace(/_\d{4}-\d{2}-\d{2}$/, '');
  }

  async cleanupOldVersions(): Promise<void> {
    try {
      this.logger.info('Starting cleanup of old ZIM file versions');

      const zimDir = this.config.storage.zim_directory;
      const files = await fs.readdir(zimDir);

      // Find backup files and old versions
      const backupFiles = files.filter(file => file.endsWith('.backup') || file.includes('.old.'));

      for (const backupFile of backupFiles) {
        const filePath = path.join(zimDir, backupFile);
        try {
          await FileUtils.deleteFile(filePath);
          this.logger.debug(`Deleted old file: ${backupFile}`);
        } catch (error) {
          this.logger.warn(`Failed to delete ${backupFile}: ${error}`);
        }
      }

      // Clean up temp directory
      const tempDir = this.config.storage.temp_directory;
      if (await FileUtils.fileExists(tempDir)) {
        const tempFiles = await fs.readdir(tempDir);
        for (const tempFile of tempFiles) {
          const tempFilePath = path.join(tempDir, tempFile);
          try {
            await FileUtils.deleteFile(tempFilePath);
            this.logger.debug(`Deleted temp file: ${tempFile}`);
          } catch (error) {
            this.logger.warn(`Failed to delete temp file ${tempFile}: ${error}`);
          }
        }
      }

      this.logger.info('Cleanup completed');
    } catch (error) {
      this.logger.error(`Error during cleanup: ${error}`);
    }
  }

  async getUpdateStatus(): Promise<{ package: string; needsUpdate: boolean; lastChecked: Date }[]> {
    const existingPackages = await this.scanExistingZimFiles();
    const status = [];

    for (const zimPackage of existingPackages) {
      try {
        const needsUpdate = await this.downloader.checkForUpdates(zimPackage.name);
        status.push({
          package: zimPackage.name,
          needsUpdate,
          lastChecked: new Date(),
        });
      } catch (error) {
        this.logger.error(`Error checking status for ${zimPackage.name}: ${error}`);
        status.push({
          package: zimPackage.name,
          needsUpdate: false,
          lastChecked: new Date(),
        });
      }
    }

    return status;
  }
}
