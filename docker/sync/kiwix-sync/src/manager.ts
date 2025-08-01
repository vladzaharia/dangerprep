import path from 'path';

import { ensureDirectoryAdvanced, createDirectoryPath } from '@dangerprep/files';
import { NotificationType, NotificationLevel } from '@dangerprep/notifications';
import { AdvancedAsyncPatterns } from '@dangerprep/service';
import { StandardizedSyncService, ServicePatterns } from '@dangerprep/sync';

import { ZimDownloader } from './services/downloader';
import { LibraryManager } from './services/library';
import { ZimUpdater } from './services/updater';
import type { KiwixConfig, ZimPackage } from './types';
import { KiwixConfigSchema } from './types';

export class KiwixManager extends StandardizedSyncService<KiwixConfig> {
  private zimUpdater!: ZimUpdater;
  private zimDownloader!: ZimDownloader;
  private libraryManager!: LibraryManager;

  constructor(configPath: string = '/app/data/config.yaml') {
    const lifecycleHooks = ServicePatterns.createSyncLifecycleHooks({
      onServiceReady: async () => {
        this.getLogger().info('Kiwix Manager is ready and operational');
      },
      onServiceStopping: async () => {
        this.getLogger().info('Kiwix Manager is shutting down...');
      },
      onOperationStart: async (operationId, operationType) => {
        this.getLogger().info(`Starting ${operationType} operation: ${operationId}`);
      },
      onOperationComplete: async (operationId, success) => {
        this.getLogger().info(
          `Operation ${operationId} ${success ? 'completed successfully' : 'failed'}`
        );
      },
    });

    super('kiwix-sync', '1.0.0', configPath, KiwixConfigSchema, lifecycleHooks);
  }

  // Implement required abstract methods
  protected async validateServiceConfiguration(config: KiwixConfig): Promise<void> {
    // Validate Kiwix-specific configuration
    if (!config.kiwix_manager.storage.zim_directory) {
      throw new Error('ZIM directory must be specified');
    }

    if (!config.kiwix_manager.api.base_url) {
      throw new Error('API base URL must be specified');
    }
  }

  protected async initializeServiceSpecificComponents(_config: KiwixConfig): Promise<void> {
    await this.initializeServices();
    await this.ensureDirectories();
  }

  protected async startServiceComponents(): Promise<void> {
    this.scheduleUpdates();
    await this.libraryManager.updateLibrary();
    this.getLogger().info('Kiwix sync service started successfully');
  }

  protected async stopServiceComponents(): Promise<void> {
    this.getLogger().info('Kiwix sync service stopped');
  }

  // Override the base service methods that are still required
  protected override async loadConfiguration(): Promise<void> {
    // Configuration loading is handled by the standardized base class
    // This method is called by BaseService.initialize()
  }

  protected override async startService(): Promise<void> {
    await this.startServiceComponents();
  }

  protected override async stopService(): Promise<void> {
    await this.stopServiceComponents();
  }

  private async initializeServices(): Promise<void> {
    const config = this.getConfig();
    this.zimUpdater = new ZimUpdater(config, this.components.logger);
    this.zimDownloader = new ZimDownloader(config, this.components.logger);
    this.libraryManager = new LibraryManager(config, this.components.logger);
  }

  private async ensureDirectories(): Promise<void> {
    const config = this.getConfig();
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
    const config = this.getConfig();
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

  async updateLibrary(): Promise<void> {
    await this.libraryManager.updateLibrary();
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

  // Public methods for CLI commands are already defined above

  // Removed duplicate methods - using standardized versions above
}

// Create service factory for standardized CLI and service management
const factory = ServicePatterns.createStandardServiceFactory({
  serviceName: 'kiwix-sync',
  version: '1.0.0',
  description: 'Kiwix ZIM file synchronization service',
  defaultConfigPath: '/app/data/config.yaml',
  configSchema: KiwixConfigSchema,
  serviceClass: KiwixManager,
  lifecycleHooks: ServicePatterns.createSyncLifecycleHooks({
    onServiceReady: async () => {
      // eslint-disable-next-line no-console
      console.log('Kiwix sync service is ready and operational');
    },
    onOperationComplete: async (operationId, success) => {
      // eslint-disable-next-line no-console
      console.log(
        `Kiwix operation ${operationId} ${success ? 'completed successfully' : 'failed'}`
      );
    },
  }),
  additionalCommands: [
    {
      name: 'update-library',
      description: 'Manually trigger library update',
      action: async (_args, _options, service) => {
        // eslint-disable-next-line no-console
        console.log('Triggering manual library update...');
        const manager = service as KiwixManager;
        await manager.updateLibrary();
        // eslint-disable-next-line no-console
        console.log('Library update completed');
      },
    },
    {
      name: 'list-packages',
      description: 'List available ZIM packages',
      action: async (_args, _options, service) => {
        // eslint-disable-next-line no-console
        console.log('Listing available ZIM packages...');
        const manager = service as KiwixManager;
        const packages = await manager.listAvailablePackages();
        // eslint-disable-next-line no-console
        console.table(
          packages.map((pkg: ZimPackage) => ({
            name: pkg.name,
            title: pkg.title,
            size: pkg.size,
            date: pkg.date,
          }))
        );
      },
    },
  ],
});

// Main entry point
if (require.main === module) {
  const main = factory.createMainEntryPoint();
  main(process.argv).catch(error => {
    // eslint-disable-next-line no-console
    console.error('Kiwix sync service failed:', error);
    process.exit(1);
  });
}
