import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

import axios from 'axios';

import type { KiwixConfig, ZimPackage } from '../types';
import { FileUtils } from '../utils/file-utils';
import type { Logger } from '../utils/logger';

export class ZimDownloader {
  private config: KiwixConfig['kiwix_manager'];
  private logger: Logger;

  constructor(config: KiwixConfig, logger: Logger) {
    this.config = config.kiwix_manager;
    this.logger = logger;
  }

  async listAvailablePackages(): Promise<ZimPackage[]> {
    try {
      this.logger.info('Fetching available ZIM packages from Kiwix library');

      const response = await axios.get(this.config.api.catalog_url, {
        timeout: this.config.api.timeout,
        headers: {
          'User-Agent': 'DangerPrep-Kiwix-Manager/1.0',
        },
      });

      const packages: ZimPackage[] = response.data.map((entry: Record<string, unknown>) => ({
        name: (entry.name as string) || (entry.id as string),
        title: entry.title as string,
        description: entry.description as string,
        size: FileUtils.formatSize(typeof entry.size === 'number' ? entry.size : 0),
        date: entry.date as string,
        url: entry.url as string,
      }));

      this.logger.info(`Found ${packages.length} available ZIM packages`);
      return packages;
    } catch (error) {
      this.logger.error(`Failed to fetch available packages: ${error}`);
      return [];
    }
  }

  async downloadPackage(packageName: string): Promise<boolean> {
    try {
      this.logger.info(`Starting download of package: ${packageName}`);

      // Find package in catalog
      const availablePackages = await this.listAvailablePackages();
      const packageInfo = availablePackages.find(pkg => pkg.name === packageName);

      if (!packageInfo?.url) {
        this.logger.error(`Package not found or no download URL: ${packageName}`);
        return false;
      }

      // Ensure directories exist
      await FileUtils.ensureDirectory(this.config.storage.zim_directory);
      await FileUtils.ensureDirectory(this.config.storage.temp_directory);

      // Check available space
      const currentSize = await FileUtils.getDirectorySize(this.config.storage.zim_directory);
      const maxSize = FileUtils.parseSize(this.config.storage.max_total_size);

      if (currentSize >= maxSize) {
        this.logger.error(
          `Storage full: ${FileUtils.formatSize(currentSize)} >= ${this.config.storage.max_total_size}`
        );
        return false;
      }

      // Download using aria2c for better performance and resume capability
      const tempFilePath = path.join(this.config.storage.temp_directory, `${packageName}.zim`);
      const finalFilePath = path.join(this.config.storage.zim_directory, `${packageName}.zim`);

      const success = await this.downloadWithAria2(packageInfo.url, tempFilePath);

      if (success) {
        // Move from temp to final location
        await FileUtils.moveFile(tempFilePath, finalFilePath);
        this.logger.info(`Successfully downloaded ${packageName}`);
        return true;
      } else {
        this.logger.error(`Failed to download ${packageName}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error downloading package ${packageName}: ${error}`);
      return false;
    }
  }

  private async downloadWithAria2(url: string, outputPath: string): Promise<boolean> {
    return new Promise(resolve => {
      const args = [
        url,
        '--out',
        path.basename(outputPath),
        '--dir',
        path.dirname(outputPath),
        '--max-connection-per-server=4',
        '--split=4',
        '--continue=true',
        '--max-tries=3',
        '--retry-wait=5',
        '--timeout=60',
        '--connect-timeout=30',
      ];

      // Add bandwidth limit if configured
      const bandwidthLimit = this.config.download.bandwidth_limit;
      if (bandwidthLimit && bandwidthLimit !== 'unlimited') {
        args.push(`--max-download-limit=${bandwidthLimit}`);
      }

      this.logger.debug(`Running aria2c with args: ${args.join(' ')}`);

      const aria2Process = spawn('aria2c', args);
      let lastProgress = '';

      aria2Process.stdout.on('data', data => {
        const output = data.toString();
        // Parse progress information
        const progressMatch = output.match(
          /\[#\w+\s+(\d+)%\((\d+[KMGT]?B)\/(\d+[KMGT]?B)\)\s+CN:(\d+)\s+DL:([^\s]+)\s+ETA:([^\]]+)\]/
        );
        if (progressMatch && progressMatch[0] !== lastProgress) {
          lastProgress = progressMatch[0];
          this.logger.info(
            `Download progress: ${progressMatch[1]}% (${progressMatch[2]}/${progressMatch[3]}) Speed: ${progressMatch[5]} ETA: ${progressMatch[6]}`
          );
        }
      });

      aria2Process.stderr.on('data', data => {
        this.logger.debug(`aria2c stderr: ${data.toString()}`);
      });

      aria2Process.on('close', code => {
        if (code === 0) {
          this.logger.info('Download completed successfully');
          resolve(true);
        } else {
          this.logger.error(`Download failed with exit code: ${code}`);
          resolve(false);
        }
      });

      aria2Process.on('error', error => {
        this.logger.error(`Failed to start aria2c: ${error}`);
        resolve(false);
      });
    });
  }

  async getPackageInfo(packageName: string): Promise<ZimPackage | null> {
    const availablePackages = await this.listAvailablePackages();
    return availablePackages.find(pkg => pkg.name === packageName) || null;
  }

  async checkForUpdates(packageName: string): Promise<boolean> {
    try {
      const localPath = path.join(this.config.storage.zim_directory, `${packageName}.zim`);
      const packageExists = await FileUtils.fileExists(localPath);

      if (!packageExists) {
        return true; // New package, needs download
      }

      const packageInfo = await this.getPackageInfo(packageName);
      if (!packageInfo) {
        return false; // Package not available anymore
      }

      // Check file modification time vs package date
      const stats = await fs.stat(localPath);
      const localDate = stats.mtime;
      const remoteDate = new Date(packageInfo.date);

      return remoteDate > localDate;
    } catch (error) {
      this.logger.error(`Error checking updates for ${packageName}: ${error}`);
      return false;
    }
  }
}
