import path from 'path';

import {
  ensureDirectoryAdvanced,
  createDirectoryPath,
  getDirectorySizeAdvanced,
} from '@dangerprep/files';
import { ComponentStatus } from '@dangerprep/health';
import { NotificationType, NotificationLevel, WebhookChannel } from '@dangerprep/notifications';
import { AdvancedAsyncPatterns } from '@dangerprep/service';
import { StandardizedSyncService, ServicePatterns } from '@dangerprep/sync';

import { BooksHandler } from './handlers/books';
import { MoviesHandler } from './handlers/movies';
import { TVHandler } from './handlers/tv';
import { WebTVHandler } from './handlers/webtv';
import {
  NFSSyncConfig,
  NFSSyncConfigSchema,
  SyncStatus,
  SyncResult,
  ContentTypeConfig,
} from './types';

export class SyncEngine extends StandardizedSyncService<NFSSyncConfig> {
  private readonly handlers = new Map<
    string,
    BooksHandler | MoviesHandler | TVHandler | WebTVHandler
  >();
  private readonly syncStatus: SyncStatus = {
    isRunning: false,
    progress: 0,
    results: [],
  };

  constructor(configPath: string = '/app/data/config.yaml') {
    const lifecycleHooks = ServicePatterns.createSyncLifecycleHooks({
      onServiceReady: async () => {
        this.getLogger().info('NFS sync service is ready and operational');
      },
      onServiceStopping: async () => {
        this.getLogger().info('NFS sync service is shutting down...');
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

    super('nfs-sync', '1.0.0', configPath, NFSSyncConfigSchema, lifecycleHooks);
  }

  // Implement required abstract methods
  protected async validateServiceConfiguration(config: NFSSyncConfig): Promise<void> {
    // Validate NFS-sync specific configuration
    if (!config.sync_config.central_nas.host) {
      throw new Error('Central NAS host must be specified');
    }

    if (!config.sync_config.local_storage.base_path) {
      throw new Error('Local storage base path must be specified');
    }

    if (Object.keys(config.sync_config.content_types).length === 0) {
      throw new Error('At least one content type must be configured');
    }
  }

  protected async initializeServiceSpecificComponents(config: NFSSyncConfig): Promise<void> {
    await this.initializeHandlers(config);
    await this.ensureDirectories(config);
  }

  protected async startServiceComponents(): Promise<void> {
    await this.scheduleContentSyncs();
    this.getLogger().info('NFS sync service started successfully');
  }

  protected async stopServiceComponents(): Promise<void> {
    // Stop any running sync operations
    if (this.syncStatus.isRunning) {
      this.syncStatus.isRunning = false;
      this.getLogger().info('Stopping active sync operations...');
    }
    this.getLogger().info('NFS sync service stopped');
  }

  // Override the base service methods that are still required
  protected override async loadConfiguration(): Promise<void> {
    // Configuration loading is handled by the standardized base class
    // This method is called by BaseService.initialize()
  }

  protected override async setupHealthChecks(): Promise<void> {
    this.registerComponentHealthChecks();
  }

  protected override async startService(): Promise<void> {
    await this.startServiceComponents();
  }

  protected override async stopService(): Promise<void> {
    await this.stopServiceComponents();
  }

  private async initializeHandlers(config: NFSSyncConfig): Promise<void> {
    const contentTypes = config.sync_config.content_types;
    const plexConfig = config.sync_config.plex;

    for (const [contentType, contentConfig] of Object.entries(contentTypes)) {
      const typedConfig = contentConfig as ContentTypeConfig;
      switch (contentType) {
        case 'books':
          this.handlers.set(contentType, new BooksHandler(typedConfig, this.getLogger()));
          break;
        case 'movies':
          this.handlers.set(
            contentType,
            new MoviesHandler(typedConfig, this.getLogger(), plexConfig)
          );
          break;
        case 'tv':
          this.handlers.set(contentType, new TVHandler(typedConfig, this.getLogger(), plexConfig));
          break;
        case 'webtv':
          this.handlers.set(contentType, new WebTVHandler(typedConfig, this.getLogger()));
          break;
        case 'kiwix':
          this.getLogger().info('Kiwix sync delegated to kiwix-manager service');
          await this.triggerKiwixUpdate();
          break;
      }
    }
  }

  private async ensureDirectories(config: NFSSyncConfig): Promise<void> {
    const directoryOperations = [
      () =>
        ensureDirectoryAdvanced(createDirectoryPath(config.sync_config.local_storage.base_path)),
      () =>
        ensureDirectoryAdvanced(createDirectoryPath(path.dirname(config.sync_config.logging.file))),
      ...Object.values(config.sync_config.content_types).map(
        contentConfig => () =>
          ensureDirectoryAdvanced(createDirectoryPath(contentConfig.local_path))
      ),
    ];

    const results = await AdvancedAsyncPatterns.sequential(directoryOperations, {
      timeout: 10000,
      logger: this.getLogger(),
    });

    if (!results.success) {
      throw new Error(`Failed to create directories: ${results.error?.message}`);
    }

    this.getLogger().info('All required directories created successfully');
  }

  private async scheduleContentSyncs(): Promise<void> {
    const config = this.getConfig();
    const contentTypes = config.sync_config.content_types;

    for (const [contentType, contentConfig] of Object.entries(contentTypes)) {
      if (contentConfig.schedule && this.handlers.has(contentType)) {
        this.scheduleTask(
          `sync-${contentType}`,
          contentConfig.schedule,
          async () => {
            await this.syncContentType(contentType);
          },
          {
            name: `${contentType} sync`,
            enableHealthCheck: true,
            retryOnFailure: true,
            maxRetries: 3,
            notifyOnFailure: true,
          }
        );
      }
    }
  }

  // Legacy method for backward compatibility
  scheduleSync(): void {
    this.scheduleContentSyncs().catch(error => {
      this.getLogger().error('Failed to schedule content syncs:', error);
    });
  }

  async syncContentType(contentType: string): Promise<boolean> {
    if (this.syncStatus.isRunning) {
      this.getLogger().warn(`Sync already running, skipping ${contentType} sync`);
      return false;
    }

    const handler = this.handlers.get(contentType);
    if (!handler) {
      this.getLogger().error(`No handler for content type: ${contentType}`);
      return false;
    }

    this.syncStatus.isRunning = true;
    this.syncStatus.currentContentType = contentType;
    this.syncStatus.progress = 0;
    this.syncStatus.startTime = new Date();

    await this.components.notificationManager.notify(
      NotificationType.SYNC_STARTED,
      `Starting ${contentType} sync`,
      {
        source: 'nfs-sync',
        level: NotificationLevel.INFO,
        data: { contentType, startTime: this.syncStatus.startTime.toISOString() },
      }
    );
    this.getLogger().debug(`Starting ${contentType} sync`);
    const operationContext = AdvancedAsyncPatterns.createOperationContext(`sync-${contentType}`, {
      contentType,
      service: 'nfs-sync',
    });

    const syncResult = await AdvancedAsyncPatterns.executeWithMonitoring(
      () => handler.sync(),
      `${contentType}-sync`,
      {
        timeout: 300000,
        retries: 2,
        retryDelay: 5000,
        backoffMultiplier: 2,
        logger: this.getLogger(),
        context: { contentType, operationId: operationContext.operationId },
      }
    );

    const duration = Date.now() - operationContext.startTime.getTime();

    try {
      if (!syncResult.success) {
        throw syncResult.error || new Error(`${contentType} sync failed`);
      }

      const success = syncResult.data;

      const result: SyncResult = {
        contentType,
        success,
        itemsProcessed: 0,
        totalSize: 0,
        duration,
        errors: [],
      };

      this.syncStatus.results.unshift(result);
      this.syncStatus.results = this.syncStatus.results.slice(0, 10);

      if (success) {
        await this.components.notificationManager.notify(
          NotificationType.SYNC_COMPLETED,
          `${contentType} sync completed successfully`,
          {
            source: 'nfs-sync',
            level: NotificationLevel.INFO,
            data: { contentType, duration, success: true },
          }
        );
        this.getLogger().debug(`${contentType} sync completed successfully in ${duration}ms`);
      } else {
        await this.components.notificationManager.notify(
          NotificationType.SYNC_FAILED,
          `${contentType} sync failed`,
          {
            source: 'nfs-sync',
            level: NotificationLevel.ERROR,
            data: { contentType, duration, success: false },
          }
        );
        this.getLogger().error(`${contentType} sync failed after ${duration}ms`);
      }

      await this.sendNotification(result);

      return success;
    } catch (error) {
      await this.components.notificationManager.notify(
        NotificationType.SYNC_FAILED,
        `${contentType} sync encountered an error`,
        {
          source: 'nfs-sync',
          level: NotificationLevel.ERROR,
          error: error instanceof Error ? error : new Error(String(error)),
          data: { contentType },
        }
      );
      this.getLogger().error(`${contentType} sync error: ${error}`);
      return false;
    } finally {
      this.syncStatus.isRunning = false;
      this.syncStatus.currentContentType = undefined;
      this.syncStatus.progress = 0;
      this.syncStatus.lastSync = new Date();
    }
  }

  async syncAll(): Promise<Record<string, boolean>> {
    if (this.syncStatus.isRunning) {
      this.getLogger().warn('Sync already running, cannot start full sync');
      return {};
    }

    const results: Record<string, boolean> = {};

    for (const contentType of this.handlers.keys()) {
      results[contentType] = await this.syncContentType(contentType);

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return results;
  }

  private async triggerKiwixUpdate(): Promise<void> {
    try {
      this.getLogger().info('Triggering kiwix-manager update');
    } catch (error) {
      this.getLogger().error(`Failed to trigger kiwix update: ${error}`);
    }
  }

  private async sendNotification(result: SyncResult): Promise<void> {
    const config = this.getConfig();
    const notifications = config.sync_config.notifications;

    if (notifications?.enabled && notifications.webhook_url) {
      try {
        const webhookChannel = new WebhookChannel(
          {
            url: notifications.webhook_url,
            timeout: 10000,
          },
          this.getLogger()
        );

        this.components.notificationManager.addChannel(webhookChannel);

        const notificationType = result.success
          ? NotificationType.SYNC_COMPLETED
          : NotificationType.SYNC_FAILED;
        await this.components.notificationManager.notify(
          notificationType,
          `${result.contentType} sync ${result.success ? 'completed' : 'failed'}`,
          {
            source: 'nfs-sync',
            level: result.success ? NotificationLevel.INFO : NotificationLevel.ERROR,
            data: {
              contentType: result.contentType,
              success: result.success,
              duration: result.duration,
              timestamp: new Date().toISOString(),
            },
          }
        );

        await this.components.notificationManager.removeChannel('webhook');
      } catch (error) {
        this.getLogger().error(`Failed to send notification: ${error}`);
      }
    }

    if (notifications?.email?.enabled) {
      this.getLogger().debug('Email notifications not yet implemented');
    }
  }

  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  async getStorageStats(): Promise<{ [contentType: string]: { size: string; path: string } }> {
    const stats: { [contentType: string]: { size: string; path: string } } = {};
    const config = this.getConfig();

    const storageOperations = Object.entries(config.sync_config.content_types).map(
      async ([contentType, contentConfig]) => {
        try {
          const dirPath = createDirectoryPath(contentConfig.local_path);
          const sizeResult = await getDirectorySizeAdvanced(dirPath, {
            timeout: 30000,
            logger: this.getLogger(),
          });

          if (sizeResult.success) {
            return {
              contentType,
              size: this.formatSize(sizeResult.data),
              path: contentConfig.local_path,
            };
          } else {
            this.getLogger().warn(
              `Failed to get size for ${contentType}: ${sizeResult.error?.message}`
            );
            return {
              contentType,
              size: 'Error',
              path: contentConfig.local_path,
            };
          }
        } catch (error) {
          this.getLogger().error(`Error calculating size for ${contentType}: ${error}`);
          return {
            contentType,
            size: 'Error',
            path: contentConfig.local_path,
          };
        }
      }
    );

    const results = await AdvancedAsyncPatterns.parallel(
      storageOperations.map(op => () => op),
      {
        timeout: 60000,
        logger: this.getLogger(),
        context: { operation: 'get-storage-stats' },
      }
    );

    if (results.success) {
      for (const result of results.data) {
        stats[result.contentType] = {
          size: result.size,
          path: result.path,
        };
      }
    } else {
      this.getLogger().error(`Failed to get storage stats: ${results.error?.message}`);
      for (const [contentType, contentConfig] of Object.entries(config.sync_config.content_types)) {
        stats[contentType] = {
          size: 'Error',
          path: contentConfig.local_path,
        };
      }
    }

    return stats;
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
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
              contentTypes: Object.keys(config.sync_config.content_types),
              notificationsEnabled: config.sync_config.notifications?.enabled ?? false,
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
      name: 'storage',
      critical: false,
      check: async () => {
        try {
          const stats = await this.getStorageStats();
          return {
            status: ComponentStatus.UP,
            message: 'Storage accessible',
            details: {
              storageStats: stats,
            },
          };
        } catch (error) {
          return {
            status: ComponentStatus.DEGRADED,
            message: 'Storage check failed',
            error: {
              message: error instanceof Error ? error.message : String(error),
              code: 'STORAGE_CHECK_FAILED',
            },
          };
        }
      },
    });

    this.components.healthChecker.registerComponent({
      name: 'handlers',
      critical: true,
      check: async () => {
        const handlerCount = this.handlers.size;
        return {
          status: handlerCount > 0 ? ComponentStatus.UP : ComponentStatus.DOWN,
          message:
            handlerCount > 0 ? 'Content handlers initialized' : 'No content handlers available',
          details: {
            configuredHandlers: handlerCount,
            handlerTypes: Array.from(this.handlers.keys()),
          },
        };
      },
    });
  }
}

// Create service factory for standardized CLI and service management
const factory = ServicePatterns.createStandardServiceFactory({
  serviceName: 'nfs-sync',
  version: '1.0.0',
  description: 'NFS content synchronization service',
  defaultConfigPath: '/app/data/config.yaml',
  configSchema: NFSSyncConfigSchema,
  serviceClass: SyncEngine,
  lifecycleHooks: ServicePatterns.createSyncLifecycleHooks({
    onServiceReady: async () => {
      // eslint-disable-next-line no-console
      console.log('NFS sync service is ready and operational');
    },
    onOperationComplete: async (operationId, success) => {
      // eslint-disable-next-line no-console
      console.log(
        `NFS sync operation ${operationId} ${success ? 'completed successfully' : 'failed'}`
      );
    },
  }),
  additionalCommands: [
    {
      name: 'sync-all',
      description: 'Manually trigger sync for all content types',
      action: async (_args, _options, service) => {
        // eslint-disable-next-line no-console
        console.log('Triggering sync for all content types...');
        const syncEngine = service as SyncEngine;
        const results = await syncEngine.syncAll();
        // eslint-disable-next-line no-console
        console.table(
          Object.entries(results).map(([contentType, success]) => ({
            contentType,
            status: success ? 'Success' : 'Failed',
          }))
        );
      },
    },
    {
      name: 'sync-content',
      description: 'Manually trigger sync for a specific content type',
      action: async (args, _options, service) => {
        const contentType = args[0];
        if (!contentType) {
          // eslint-disable-next-line no-console
          console.error('Content type is required');
          return;
        }
        // eslint-disable-next-line no-console
        console.log(`Triggering sync for content type: ${contentType}`);
        const syncEngine = service as SyncEngine;
        try {
          const success = await syncEngine.syncContentType(contentType);
          // eslint-disable-next-line no-console
          console.log(`Sync ${success ? 'completed successfully' : 'failed'}`);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to trigger sync:', error);
        }
      },
    },
    {
      name: 'storage-stats',
      description: 'Show storage statistics for all content types',
      action: async (_args, _options, service) => {
        // eslint-disable-next-line no-console
        console.log('Getting storage statistics...');
        const syncEngine = service as SyncEngine;
        const stats = await syncEngine.getStorageStats();
        // eslint-disable-next-line no-console
        console.table(
          Object.entries(stats).map(([contentType, info]) => ({
            contentType,
            size: info.size,
            path: info.path,
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
    console.error('NFS sync service failed:', error);
    process.exit(1);
  });
}
