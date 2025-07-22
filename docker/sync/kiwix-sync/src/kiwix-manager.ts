import { promises as fs } from 'fs';
import path from 'path';

import yaml from 'js-yaml';
import cron from 'node-cron';

import { LibraryManager } from './services/library-manager';
import { ZimDownloader } from './services/zim-downloader';
import { ZimUpdater } from './services/zim-updater';
import type { KiwixConfig, ZimPackage } from './types';
import { FileUtils } from './utils/file-utils';
import { Logger } from './utils/logger';

export class KiwixManager {
  private config!: KiwixConfig;
  private logger: Logger;
  private zimUpdater!: ZimUpdater;
  private zimDownloader!: ZimDownloader;
  private libraryManager!: LibraryManager;

  constructor(private configPath: string) {
    this.logger = new Logger('KiwixManager');
  }

  async initialize(): Promise<void> {
    await this.loadConfig();
    this.setupLogging();
    await this.initializeServices();
    await this.ensureDirectories();
  }

  private async loadConfig(): Promise<void> {
    try {
      const configFile = await fs.readFile(this.configPath, 'utf8');
      this.config = yaml.load(configFile) as KiwixConfig;
    } catch (error) {
      throw new Error(`Failed to load config: ${error}`);
    }
  }

  private setupLogging(): void {
    const logConfig = this.config.kiwix_manager.logging;
    this.logger.setLevel(logConfig.level);
    this.logger.setLogFile(logConfig.file);
  }

  private async initializeServices(): Promise<void> {
    this.zimUpdater = new ZimUpdater(this.config, this.logger);
    this.zimDownloader = new ZimDownloader(this.config, this.logger);
    this.libraryManager = new LibraryManager(this.config, this.logger);
  }

  private async ensureDirectories(): Promise<void> {
    const storage = this.config.kiwix_manager.storage;
    await FileUtils.ensureDirectory(storage.zim_directory);
    await FileUtils.ensureDirectory(storage.temp_directory);
    await FileUtils.ensureDirectory(path.dirname(storage.library_file));
    await FileUtils.ensureDirectory(path.dirname(this.config.kiwix_manager.logging.file));
  }

  scheduleUpdates(): void {
    const scheduler = this.config.kiwix_manager.scheduler;

    // Schedule daily updates
    if (cron.validate(scheduler.update_schedule)) {
      cron.schedule(scheduler.update_schedule, async () => {
        this.logger.info('Starting scheduled ZIM updates');
        await this.updateAllZimPackages();
      });
      this.logger.info(`Scheduled updates: ${scheduler.update_schedule}`);
    } else {
      this.logger.error(`Invalid update schedule: ${scheduler.update_schedule}`);
    }

    // Schedule weekly cleanup
    if (cron.validate(scheduler.cleanup_schedule)) {
      cron.schedule(scheduler.cleanup_schedule, async () => {
        this.logger.info('Starting scheduled cleanup');
        await this.cleanupOldFiles();
      });
      this.logger.info(`Scheduled cleanup: ${scheduler.cleanup_schedule}`);
    } else {
      this.logger.error(`Invalid cleanup schedule: ${scheduler.cleanup_schedule}`);
    }
  }

  async updateAllZimPackages(): Promise<boolean> {
    try {
      this.logger.info('Starting update of all existing ZIM packages');

      const result = await this.zimUpdater.updateAllExistingPackages();

      // Update library.xml after all updates
      await this.libraryManager.updateLibrary();

      this.logger.info(`Update completed: ${result.success} successful, ${result.failed} failed`);
      return result.success > 0;
    } catch (error) {
      this.logger.error(`Error during update: ${error}`);
      return false;
    }
  }

  async downloadPackage(packageName: string): Promise<boolean> {
    try {
      this.logger.info(`Downloading package: ${packageName}`);

      const success = await this.zimDownloader.downloadPackage(packageName);
      if (success) {
        await this.libraryManager.updateLibrary();
        this.logger.info(`Successfully downloaded and registered ${packageName}`);
      } else {
        this.logger.error(`Failed to download ${packageName}`);
      }
      return success;
    } catch (error) {
      this.logger.error(`Error downloading package ${packageName}: ${error}`);
      return false;
    }
  }

  async listAvailablePackages(): Promise<ZimPackage[]> {
    return await this.zimDownloader.listAvailablePackages();
  }

  async listInstalledPackages(): Promise<ZimPackage[]> {
    return await this.libraryManager.listInstalledPackages();
  }

  async getUpdateStatus(): Promise<{ package: string; needsUpdate: boolean; lastChecked: Date }[]> {
    return await this.zimUpdater.getUpdateStatus();
  }

  async getLibraryStats(): Promise<{
    totalPackages: number;
    totalSize: string;
    lastUpdated: Date | null;
  }> {
    return await this.libraryManager.getLibraryStats();
  }

  private async cleanupOldFiles(): Promise<void> {
    try {
      await this.zimUpdater.cleanupOldVersions();
      await this.libraryManager.updateLibrary();
      this.logger.info('Cleanup completed successfully');
    } catch (error) {
      this.logger.error(`Error during cleanup: ${error}`);
    }
  }

  async healthCheck(): Promise<{ status: string; details: Record<string, unknown> }> {
    try {
      const stats = await this.getLibraryStats();
      const libraryValid = await this.libraryManager.validateLibrary();

      const status = libraryValid ? 'healthy' : 'unhealthy';

      return {
        status,
        details: {
          totalPackages: stats.totalPackages,
          totalSize: stats.totalSize,
          lastUpdated: stats.lastUpdated,
          libraryValid,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  async run(): Promise<void> {
    try {
      await this.initialize();
      this.scheduleUpdates();

      // Initial library update
      await this.libraryManager.updateLibrary();

      this.logger.info('Kiwix Manager started successfully');

      // Keep the process running
      process.on('SIGINT', () => {
        this.logger.info('Kiwix Manager shutting down...');
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        this.logger.info('Kiwix Manager received SIGTERM, shutting down...');
        process.exit(0);
      });

      // Keep alive with periodic health checks
      setInterval(async () => {
        const health = await this.healthCheck();
        if (health.status !== 'healthy') {
          this.logger.warn(`Health check failed: ${JSON.stringify(health.details)}`);
        }
      }, 300000); // Every 5 minutes
    } catch (error) {
      this.logger.error(`Failed to start Kiwix Manager: ${error}`);
      process.exit(1);
    }
  }
}

// Main execution
if (require.main === module) {
  const configPath = process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml';
  const manager = new KiwixManager(configPath);

  manager.run().catch(error => {
    console.error('Failed to start Kiwix Manager:', error);
    process.exit(1);
  });
}
