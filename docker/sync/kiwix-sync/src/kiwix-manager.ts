import path from 'path';

import { ConfigManager } from '@dangerprep/shared/config';
import { FileUtils } from '@dangerprep/shared/file-utils';
import { Logger, LoggerFactory } from '@dangerprep/shared/logging';
import { Scheduler } from '@dangerprep/shared/scheduling';

import { LibraryManager } from './services/library-manager';
import { ZimDownloader } from './services/zim-downloader';
import { ZimUpdater } from './services/zim-updater';
import type { KiwixConfig, ZimPackage } from './types';
import { KiwixConfigSchema } from './types';

export class KiwixManager {
  private configManager: ConfigManager<KiwixConfig>;
  private logger: Logger;
  private scheduler: Scheduler;
  private zimUpdater!: ZimUpdater;
  private zimDownloader!: ZimDownloader;
  private libraryManager!: LibraryManager;

  constructor(private configPath: string) {
    this.logger = LoggerFactory.createConsoleLogger('KiwixManager');
    this.configManager = new ConfigManager(configPath, KiwixConfigSchema, {
      logger: this.logger,
    });
    this.scheduler = new Scheduler({ logger: this.logger });
  }

  async initialize(): Promise<void> {
    await this.loadConfig();
    this.setupLogging();
    await this.initializeServices();
    await this.ensureDirectories();
  }

  private async loadConfig(): Promise<void> {
    try {
      await this.configManager.loadConfig();
    } catch (error) {
      throw new Error(`Failed to load config: ${error}`);
    }
  }

  private setupLogging(): void {
    const config = this.configManager.getConfig();
    const logConfig = config.kiwix_manager.logging;
    // Create a new logger with both console and file transports
    this.logger = LoggerFactory.createCombinedLogger(
      'KiwixManager',
      logConfig.file,
      logConfig.level
    );
  }

  private async initializeServices(): Promise<void> {
    const config = this.configManager.getConfig();
    this.zimUpdater = new ZimUpdater(config, this.logger);
    this.zimDownloader = new ZimDownloader(config, this.logger);
    this.libraryManager = new LibraryManager(config, this.logger);
  }

  private async ensureDirectories(): Promise<void> {
    const config = this.configManager.getConfig();
    const storage = config.kiwix_manager.storage;
    await FileUtils.ensureDirectory(storage.zim_directory);
    await FileUtils.ensureDirectory(storage.temp_directory);
    await FileUtils.ensureDirectory(path.dirname(storage.library_file));
    await FileUtils.ensureDirectory(path.dirname(config.kiwix_manager.logging.file));
  }

  scheduleUpdates(): void {
    const config = this.configManager.getConfig();
    const schedulerConfig = config.kiwix_manager.scheduler;

    try {
      // Schedule daily updates
      this.scheduler.schedule(
        'zim-updates',
        schedulerConfig.update_schedule,
        async () => {
          this.logger.info('Starting scheduled ZIM updates');
          await this.updateAllZimPackages();
        },
        { name: 'ZIM Updates' }
      );
      this.logger.info(`Scheduled updates: ${schedulerConfig.update_schedule}`);
    } catch (error) {
      this.logger.error(`Failed to schedule updates: ${error}`);
    }

    try {
      // Schedule weekly cleanup
      this.scheduler.schedule(
        'cleanup',
        schedulerConfig.cleanup_schedule,
        async () => {
          this.logger.info('Starting scheduled cleanup');
          await this.cleanupOldFiles();
        },
        { name: 'Cleanup' }
      );
      this.logger.info(`Scheduled cleanup: ${schedulerConfig.cleanup_schedule}`);
    } catch (error) {
      this.logger.error(`Failed to schedule cleanup: ${error}`);
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

  /**
   * Shutdown the manager and clean up resources
   */
  shutdown(): void {
    this.logger.info('Shutting down scheduled tasks...');
    this.scheduler.destroyAll();
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
        this.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        this.logger.info('Kiwix Manager received SIGTERM, shutting down...');
        this.shutdown();
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
    // Create a simple logger for startup errors
    const startupLogger = LoggerFactory.createConsoleLogger('Startup');
    startupLogger.error('Failed to start Kiwix Manager:', error);
    process.exit(1);
  });
}
