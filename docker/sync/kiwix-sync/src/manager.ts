import path from 'path';

import { ConfigManager } from '@dangerprep/configuration';
import { ensureDirectoryAdvanced, createDirectoryPath } from '@dangerprep/files';
import { ComponentStatus } from '@dangerprep/health';
import { NotificationType, NotificationLevel } from '@dangerprep/notifications';
import {
  BaseService,
  ServiceConfig,
  ServiceUtils,
  AdvancedAsyncPatterns,
} from '@dangerprep/service';

import { ZimDownloader } from './services/downloader';
import { LibraryManager } from './services/library';
import { ZimUpdater } from './services/updater';
import type { KiwixConfig, ZimPackage } from './types';
import { KiwixConfigSchema } from './types';

export class KiwixManager extends BaseService {
  private configManager: ConfigManager<KiwixConfig>;
  private zimUpdater!: ZimUpdater;
  private zimDownloader!: ZimDownloader;
  private libraryManager!: LibraryManager;

  constructor(configPath: string) {
    const serviceConfig: ServiceConfig = ServiceUtils.createServiceConfig(
      'kiwix-sync',
      '1.0.0',
      configPath,
      {
        enablePeriodicHealthChecks: true,
        healthCheckIntervalMinutes: 5,
        handleProcessSignals: true,
        shutdownTimeoutMs: 30000,

        enableScheduler: true,
        enableProgressTracking: true,
        enableAutoRecovery: true,

        schedulerConfig: {
          enableHealthMonitoring: true,
          autoStartTasks: true,
        },

        progressConfig: {
          enableNotifications: true,
          cleanupDelayMs: 600000,
        },

        recoveryConfig: {
          maxRestartAttempts: 2,
          restartDelayMs: 30000,
          useExponentialBackoff: true,
          enableGracefulDegradation: true,
        },
        loggingConfig: {
          level: 'INFO',
          file: '/app/data/logs/kiwix-manager.log',
          maxSize: '50MB',
          backupCount: 3,
          format: 'text',
          colors: true,
        },
      }
    );

    const hooks = {
      beforeInitialize: async () => {
        this.components.logger.debug('Preparing Kiwix manager initialization...');
      },
      afterInitialize: async () => {
        this.components.logger.info('Kiwix services and directories ready');
      },
      beforeStart: async () => {
        this.components.logger.debug('Starting Kiwix update scheduling...');
      },
      afterStart: async () => {
        this.components.logger.info('Kiwix manager operational with scheduled updates');
      },
    };

    super(serviceConfig, hooks);

    this.configManager = new ConfigManager(configPath, KiwixConfigSchema, {
      logger: this.components.logger,
    });
  }

  protected override async loadConfiguration(): Promise<void> {
    await this.loadConfigurationWithManager(this.configManager);
  }

  protected override async setupHealthChecks(): Promise<void> {
    this.registerComponentHealthChecks();
  }

  protected override async initializeServiceComponents(): Promise<void> {
    await this.initializeServices();
    await this.ensureDirectories();
  }

  private async initializeServices(): Promise<void> {
    const config = this.configManager.getConfig();
    this.zimUpdater = new ZimUpdater(config, this.components.logger);
    this.zimDownloader = new ZimDownloader(config, this.components.logger);
    this.libraryManager = new LibraryManager(config, this.components.logger);
  }

  private async ensureDirectories(): Promise<void> {
    const config = this.configManager.getConfig();
    const storage = config.kiwix_manager.storage;

    const directoryOperations = [
      () => ensureDirectoryAdvanced(createDirectoryPath(storage.zim_directory)),
      () => ensureDirectoryAdvanced(createDirectoryPath(storage.temp_directory)),
      () => ensureDirectoryAdvanced(createDirectoryPath(path.dirname(storage.library_file))),
      () =>
        ensureDirectoryAdvanced(
          createDirectoryPath(path.dirname(config.kiwix_manager.logging.file))
        ),
    ];

    const results = await AdvancedAsyncPatterns.parallel(directoryOperations, {
      timeout: 10000,
      logger: this.components.logger,
    });

    if (!results.success) {
      throw new Error(`Failed to create Kiwix directories: ${results.error?.message}`);
    }

    this.components.logger.info('All Kiwix directories created successfully');
  }

  scheduleUpdates(): void {
    const config = this.configManager.getConfig();
    const schedulerConfig = config.kiwix_manager.scheduler;

    this.scheduleTask(
      'zim-updates',
      schedulerConfig.update_schedule,
      async () => {
        await this.updateAllZimPackages();
      },
      {
        name: 'ZIM Updates',
        enableHealthCheck: true,
        retryOnFailure: true,
        maxRetries: 2,
        notifyOnFailure: true,
      }
    );

    this.scheduleMaintenanceTask(
      'cleanup',
      schedulerConfig.cleanup_schedule,
      async () => {
        await this.cleanupOldFiles();
      },
      {
        name: 'Cleanup',
        enableHealthCheck: true,
        retryOnFailure: true,
        maxRetries: 3,
        notifyOnFailure: true,
      }
    );
  }

  async updateAllZimPackages(): Promise<boolean> {
    try {
      this.components.logger.info('Starting update of all existing ZIM packages');

      const result = await this.zimUpdater.updateAllExistingPackages();

      await this.libraryManager.updateLibrary();

      await this.components.notificationManager.notify(
        NotificationType.CONTENT_UPDATED,
        `Kiwix update completed: ${result.success} successful, ${result.failed} failed`,
        {
          source: 'kiwix-sync',
          level: result.failed > 0 ? NotificationLevel.WARN : NotificationLevel.INFO,
          data: { successful: result.success, failed: result.failed },
        }
      );
      this.components.logger.debug(
        `Update completed: ${result.success} successful, ${result.failed} failed`
      );
      return result.success > 0;
    } catch (error) {
      await this.components.notificationManager.notify(
        NotificationType.CONTENT_ERROR,
        'Kiwix update encountered an error',
        {
          source: 'kiwix-sync',
          level: NotificationLevel.ERROR,
          error: error instanceof Error ? error : new Error(String(error)),
        }
      );
      this.components.logger.error(`Error during update: ${error}`);
      return false;
    }
  }

  async downloadPackage(packageName: string): Promise<boolean> {
    try {
      await this.components.notificationManager.notify(
        NotificationType.SYNC_STARTED,
        `Downloading package: ${packageName}`,
        {
          source: 'kiwix-sync',
          level: NotificationLevel.INFO,
          data: { packageName, operation: 'download' },
        }
      );
      this.components.logger.debug(`Downloading package: ${packageName}`);

      const success = await this.zimDownloader.downloadPackage(packageName);
      if (success) {
        await this.libraryManager.updateLibrary();

        await this.components.notificationManager.notify(
          NotificationType.SYNC_COMPLETED,
          `Successfully downloaded and registered ${packageName}`,
          {
            source: 'kiwix-sync',
            level: NotificationLevel.INFO,
            data: { packageName, operation: 'download', success: true },
          }
        );
        this.components.logger.debug(`Successfully downloaded and registered ${packageName}`);
      } else {
        await this.components.notificationManager.notify(
          NotificationType.SYNC_FAILED,
          `Failed to download ${packageName}`,
          {
            source: 'kiwix-sync',
            level: NotificationLevel.ERROR,
            data: { packageName, operation: 'download', success: false },
          }
        );
        this.components.logger.error(`Failed to download ${packageName}`);
      }
      return success;
    } catch (error) {
      await this.components.notificationManager.notify(
        NotificationType.SYNC_FAILED,
        `Error downloading package ${packageName}`,
        {
          source: 'kiwix-sync',
          level: NotificationLevel.ERROR,
          error: error instanceof Error ? error : new Error(String(error)),
          data: { packageName, operation: 'download' },
        }
      );
      this.components.logger.error(`Error downloading package ${packageName}: ${error}`);
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
      this.components.logger.info('Cleanup completed successfully');
    } catch (error) {
      this.components.logger.error(`Error during cleanup: ${error}`);
    }
  }

  private registerComponentHealthChecks(): void {
    this.components.healthChecker.registerComponent({
      name: 'configuration',
      critical: true,
      check: async () => {
        try {
          const config = this.configManager.getConfig();
          return {
            status: ComponentStatus.UP,
            message: 'Configuration loaded successfully',
            details: {
              zimDirectory: config.kiwix_manager.storage.zim_directory,
              libraryFile: config.kiwix_manager.storage.library_file,
              scheduledUpdates: !!config.kiwix_manager.scheduler.update_schedule,
            },
          };
        } catch (error) {
          return {
            status: ComponentStatus.DOWN,
            message: 'Configuration failed to load',
            error: {
              message: error instanceof Error ? error.message : String(error),
              code: 'CONFIG_LOAD_FAILED',
            },
          };
        }
      },
    });

    this.components.healthChecker.registerComponent({
      name: 'library',
      critical: true,
      check: async () => {
        try {
          const libraryValid = await this.libraryManager.validateLibrary();
          const stats = await this.getLibraryStats();

          return {
            status: libraryValid ? ComponentStatus.UP : ComponentStatus.DEGRADED,
            message: libraryValid ? 'Library is valid' : 'Library validation failed',
            details: {
              totalPackages: stats.totalPackages,
              totalSize: stats.totalSize,
              lastUpdated: stats.lastUpdated,
              libraryValid,
            },
          };
        } catch (error) {
          return {
            status: ComponentStatus.DOWN,
            message: 'Library check failed',
            error: {
              message: error instanceof Error ? error.message : String(error),
              code: 'LIBRARY_CHECK_FAILED',
            },
          };
        }
      },
    });

    this.components.healthChecker.registerComponent({
      name: 'services',
      critical: false,
      check: async () => {
        const servicesInitialized = !!(
          this.zimUpdater &&
          this.zimDownloader &&
          this.libraryManager
        );

        return {
          status: servicesInitialized ? ComponentStatus.UP : ComponentStatus.DOWN,
          message: servicesInitialized
            ? 'All services initialized'
            : 'Services not fully initialized',
          details: {
            zimUpdater: !!this.zimUpdater,
            zimDownloader: !!this.zimDownloader,
            libraryManager: !!this.libraryManager,
          },
        };
      },
    });
  }

  protected override async startService(): Promise<void> {
    this.scheduleUpdates();

    await this.libraryManager.updateLibrary();

    this.components.logger.info('Kiwix sync service started successfully');
  }

  protected override async stopService(): Promise<void> {
    this.components.logger.info('Kiwix sync service stopped');
  }
}

if (require.main === module) {
  const configPath = process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml';
  const manager = new KiwixManager(configPath);

  manager
    .initialize()
    .then(async initResult => {
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      await manager.start();
    })
    .catch((error: unknown) => {
      console.error('Failed to start Kiwix Manager:', error);
      process.exit(1);
    });
}
