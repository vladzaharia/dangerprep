import path from 'path';

import { ConfigManager } from '@dangerprep/configuration';
import {
  ensureDirectoryAdvanced,
  createDirectoryPath,
  getDirectorySizeAdvanced,
} from '@dangerprep/files';
import { ComponentStatus } from '@dangerprep/health';
import { NotificationType, NotificationLevel, WebhookChannel } from '@dangerprep/notifications';
import {
  BaseService,
  ServiceConfig,
  ServiceUtils,
  AdvancedAsyncPatterns,
} from '@dangerprep/service';

import { BooksHandler } from './handlers/books';
import { MoviesHandler } from './handlers/movies';
import { TVHandler } from './handlers/tv';
import { WebTVHandler } from './handlers/webtv';
import { SyncConfig, SyncStatus, SyncResult, SyncConfigSchema, ContentTypeConfig } from './types';

export class SyncEngine extends BaseService {
  private configManager: ConfigManager<SyncConfig>;
  private readonly handlers = new Map<
    string,
    BooksHandler | MoviesHandler | TVHandler | WebTVHandler
  >();
  private readonly syncStatus: SyncStatus = {
    isRunning: false,
    progress: 0,
    results: [],
  };

  constructor(configPath: string) {
    const serviceConfig: ServiceConfig = ServiceUtils.createServiceConfig(
      'nfs-sync',
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
          cleanupDelayMs: 300000,
        },

        recoveryConfig: {
          maxRestartAttempts: 3,
          restartDelayMs: 5000,
          useExponentialBackoff: true,
          enableGracefulDegradation: true,
        },

        loggingConfig: {
          level: 'INFO',
          file: '/app/data/logs/sync.log',
          maxSize: '100MB',
          backupCount: 5,
          format: 'text',
          colors: true,
        },
      }
    );

    const hooks = {
      beforeInitialize: async () => {
        this.components.logger.debug('Preparing NFS sync initialization...');
      },
      afterInitialize: async () => {
        this.components.logger.info('NFS sync handlers and directories ready');
      },
      beforeStart: async () => {
        this.components.logger.debug('Starting NFS sync scheduling...');
      },
      afterStart: async () => {
        this.components.logger.info('NFS sync service operational with scheduled tasks');
      },
    };

    super(serviceConfig, hooks);

    this.configManager = new ConfigManager(configPath, SyncConfigSchema, {
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
    await this.initializeHandlers();
    await this.ensureDirectories();
  }

  private async initializeHandlers(): Promise<void> {
    const config = this.configManager.getConfig();
    const contentTypes = config.sync_config.content_types;
    const plexConfig = config.sync_config.plex;

    for (const [contentType, contentConfig] of Object.entries(contentTypes)) {
      const typedConfig = contentConfig as ContentTypeConfig;
      switch (contentType) {
        case 'books':
          this.handlers.set(contentType, new BooksHandler(typedConfig, this.components.logger));
          break;
        case 'movies':
          this.handlers.set(
            contentType,
            new MoviesHandler(typedConfig, this.components.logger, plexConfig)
          );
          break;
        case 'tv':
          this.handlers.set(
            contentType,
            new TVHandler(typedConfig, this.components.logger, plexConfig)
          );
          break;
        case 'webtv':
          this.handlers.set(contentType, new WebTVHandler(typedConfig, this.components.logger));
          break;
        case 'kiwix':
          this.components.logger.info('Kiwix sync delegated to kiwix-manager service');
          await this.triggerKiwixUpdate();
          break;
      }
    }
  }

  private async ensureDirectories(): Promise<void> {
    const config = this.configManager.getConfig();

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
      logger: this.components.logger,
    });

    if (!results.success) {
      throw new Error(`Failed to create directories: ${results.error?.message}`);
    }

    this.components.logger.info('All required directories created successfully');
  }

  scheduleSync(): void {
    const config = this.configManager.getConfig();
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

  async syncContentType(contentType: string): Promise<boolean> {
    if (this.syncStatus.isRunning) {
      this.components.logger.warn(`Sync already running, skipping ${contentType} sync`);
      return false;
    }

    const handler = this.handlers.get(contentType);
    if (!handler) {
      this.components.logger.error(`No handler for content type: ${contentType}`);
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
    this.components.logger.debug(`Starting ${contentType} sync`);
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
        logger: this.components.logger,
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
        this.components.logger.debug(`${contentType} sync completed successfully in ${duration}ms`);
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
        this.components.logger.error(`${contentType} sync failed after ${duration}ms`);
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
      this.components.logger.error(`${contentType} sync error: ${error}`);
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
      this.components.logger.warn('Sync already running, cannot start full sync');
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
      this.components.logger.info('Triggering kiwix-manager update');
    } catch (error) {
      this.components.logger.error(`Failed to trigger kiwix update: ${error}`);
    }
  }

  private async sendNotification(result: SyncResult): Promise<void> {
    const config = this.configManager.getConfig();
    const notifications = config.sync_config.notifications;

    if (notifications?.enabled && notifications.webhook_url) {
      try {
        const webhookChannel = new WebhookChannel(
          {
            url: notifications.webhook_url,
            timeout: 10000,
          },
          this.components.logger
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
        this.components.logger.error(`Failed to send notification: ${error}`);
      }
    }

    if (notifications?.email?.enabled) {
      this.components.logger.debug('Email notifications not yet implemented');
    }
  }

  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  async getStorageStats(): Promise<{ [contentType: string]: { size: string; path: string } }> {
    const stats: { [contentType: string]: { size: string; path: string } } = {};
    const config = this.configManager.getConfig();

    const storageOperations = Object.entries(config.sync_config.content_types).map(
      async ([contentType, contentConfig]) => {
        try {
          const dirPath = createDirectoryPath(contentConfig.local_path);
          const sizeResult = await getDirectorySizeAdvanced(dirPath, {
            timeout: 30000,
            logger: this.components.logger,
          });

          if (sizeResult.success) {
            return {
              contentType,
              size: this.formatSize(sizeResult.data),
              path: contentConfig.local_path,
            };
          } else {
            this.components.logger.warn(
              `Failed to get size for ${contentType}: ${sizeResult.error?.message}`
            );
            return {
              contentType,
              size: 'Error',
              path: contentConfig.local_path,
            };
          }
        } catch (error) {
          this.components.logger.error(`Error calculating size for ${contentType}: ${error}`);
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
        logger: this.components.logger,
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
      this.components.logger.error(`Failed to get storage stats: ${results.error?.message}`);
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

  protected override async startService(): Promise<void> {
    this.syncStatus.isRunning = true;
    this.scheduleSync();
    this.components.logger.info('NFS sync service started successfully');
  }

  protected override async stopService(): Promise<void> {
    this.syncStatus.isRunning = false;
    this.components.logger.info('NFS sync service stopped');
  }
}

if (require.main === module) {
  const configPath = process.env.SYNC_CONFIG_PATH || '/app/data/sync-config.yaml';
  const engine = new SyncEngine(configPath);

  engine
    .initialize()
    .then(async initResult => {
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      await engine.start();
    })
    .catch(error => {
      process.stderr.write(`Failed to start Sync Engine: ${error}\n`);
      process.exit(1);
    });
}
