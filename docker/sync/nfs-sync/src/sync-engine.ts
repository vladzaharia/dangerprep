import { promises as fs } from 'fs';
import path from 'path';

import { ConfigManager } from '@dangerprep/shared/config';
import { Logger, LoggerFactory } from '@dangerprep/shared/logging';
import { Scheduler } from '@dangerprep/shared/scheduling';
import axios from 'axios';

import { BooksHandler } from './handlers/books';
import { MoviesHandler } from './handlers/movies';
import { TVHandler } from './handlers/tv';
import { WebTVHandler } from './handlers/webtv';
import { SyncConfig, SyncStatus, SyncResult, SyncConfigSchema, ContentTypeConfig } from './types';

export class SyncEngine {
  private configManager: ConfigManager<SyncConfig>;
  private logger: Logger;
  private scheduler: Scheduler;
  private handlers: Map<string, BooksHandler | MoviesHandler | TVHandler | WebTVHandler> =
    new Map();
  private syncStatus: SyncStatus = {
    isRunning: false,
    progress: 0,
    results: [],
  };

  constructor(private configPath: string) {
    this.logger = LoggerFactory.createConsoleLogger('SyncEngine');
    this.configManager = new ConfigManager(configPath, SyncConfigSchema, {
      logger: this.logger,
    });
    this.scheduler = new Scheduler({ logger: this.logger });
  }

  async initialize(): Promise<void> {
    await this.loadConfig();
    this.setupLogging();
    await this.initializeHandlers();
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
    const logConfig = config.sync_config.logging;
    // Create a new logger with both console and file transports
    this.logger = LoggerFactory.createCombinedLogger('SyncEngine', logConfig.file, logConfig.level);
  }

  private async initializeHandlers(): Promise<void> {
    const config = this.configManager.getConfig();
    const contentTypes = config.sync_config.content_types;
    const plexConfig = config.sync_config.plex;

    for (const [contentType, contentConfig] of Object.entries(contentTypes)) {
      // Cast to the interface type for handler compatibility
      const typedConfig = contentConfig as ContentTypeConfig;
      switch (contentType) {
        case 'books':
          this.handlers.set(contentType, new BooksHandler(typedConfig, this.logger));
          break;
        case 'movies':
          this.handlers.set(contentType, new MoviesHandler(typedConfig, this.logger, plexConfig));
          break;
        case 'tv':
          this.handlers.set(contentType, new TVHandler(typedConfig, this.logger, plexConfig));
          break;
        case 'webtv':
          this.handlers.set(contentType, new WebTVHandler(typedConfig, this.logger));
          break;
        case 'kiwix':
          // Kiwix is handled by separate kiwix-manager service
          this.logger.info('Kiwix sync delegated to kiwix-manager service');
          await this.triggerKiwixUpdate();
          break;
      }
    }
  }

  private async ensureDirectories(): Promise<void> {
    const config = this.configManager.getConfig();
    const baseStorage = config.sync_config.local_storage.base_path;
    await fs.mkdir(baseStorage, { recursive: true });
    await fs.mkdir(path.dirname(config.sync_config.logging.file), { recursive: true });

    // Ensure content type directories exist
    for (const contentConfig of Object.values(config.sync_config.content_types)) {
      await fs.mkdir(contentConfig.local_path, { recursive: true });
    }
  }

  scheduleSync(): void {
    const config = this.configManager.getConfig();
    const contentTypes = config.sync_config.content_types;

    for (const [contentType, contentConfig] of Object.entries(contentTypes)) {
      if (contentConfig.schedule && this.handlers.has(contentType)) {
        try {
          this.scheduler.schedule(
            `sync-${contentType}`,
            contentConfig.schedule,
            () => {
              this.syncContentType(contentType);
            },
            { name: `${contentType} sync` }
          );
          this.logger.info(`Scheduled ${contentType} sync: ${contentConfig.schedule}`);
        } catch (error) {
          this.logger.error(`Failed to schedule ${contentType} sync: ${error}`);
        }
      }
    }
  }

  async syncContentType(contentType: string): Promise<boolean> {
    if (this.syncStatus.isRunning) {
      this.logger.warn(`Sync already running, skipping ${contentType} sync`);
      return false;
    }

    const handler = this.handlers.get(contentType);
    if (!handler) {
      this.logger.error(`No handler for content type: ${contentType}`);
      return false;
    }

    this.syncStatus.isRunning = true;
    this.syncStatus.currentContentType = contentType;
    this.syncStatus.progress = 0;
    this.syncStatus.startTime = new Date();

    this.logger.info(`Starting ${contentType} sync`);
    const startTime = Date.now();

    try {
      const success = await handler.sync();
      const duration = Date.now() - startTime;

      const result: SyncResult = {
        contentType,
        success,
        itemsProcessed: 0, // Would need to be tracked by handlers
        totalSize: 0, // Would need to be tracked by handlers
        duration,
        errors: [],
      };

      this.syncStatus.results.unshift(result);
      this.syncStatus.results = this.syncStatus.results.slice(0, 10); // Keep last 10 results

      if (success) {
        this.logger.info(`${contentType} sync completed successfully in ${duration}ms`);
      } else {
        this.logger.error(`${contentType} sync failed after ${duration}ms`);
      }

      // Send notification if configured
      await this.sendNotification(result);

      return success;
    } catch (error) {
      this.logger.error(`${contentType} sync error: ${error}`);
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
      this.logger.warn('Sync already running, cannot start full sync');
      return {};
    }

    const results: Record<string, boolean> = {};

    for (const contentType of this.handlers.keys()) {
      results[contentType] = await this.syncContentType(contentType);

      // Small delay between syncs
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return results;
  }

  private async triggerKiwixUpdate(): Promise<void> {
    try {
      // Try to trigger kiwix-manager update via HTTP API or container exec
      // This is a placeholder - would need actual implementation
      this.logger.info('Triggering kiwix-manager update');
    } catch (error) {
      this.logger.error(`Failed to trigger kiwix update: ${error}`);
    }
  }

  private async sendNotification(result: SyncResult): Promise<void> {
    const config = this.configManager.getConfig();
    const notifications = config.sync_config.notifications;
    if (!notifications?.enabled) {
      return;
    }

    try {
      if (notifications.webhook_url) {
        await axios.post(notifications.webhook_url, {
          contentType: result.contentType,
          success: result.success,
          duration: result.duration,
          timestamp: new Date().toISOString(),
        });
      }

      // Email notifications would be implemented here if configured
      if (notifications.email?.enabled) {
        this.logger.info('Email notifications not yet implemented');
      }
    } catch (error) {
      this.logger.error(`Failed to send notification: ${error}`);
    }
  }

  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  async getStorageStats(): Promise<{ [contentType: string]: { size: string; path: string } }> {
    const stats: { [contentType: string]: { size: string; path: string } } = {};
    const config = this.configManager.getConfig();

    for (const [contentType, contentConfig] of Object.entries(config.sync_config.content_types)) {
      try {
        const size = await this.getDirectorySize(contentConfig.local_path);
        stats[contentType] = {
          size: this.formatSize(size),
          path: contentConfig.local_path,
        };
      } catch (_error) {
        stats[contentType] = {
          size: 'Error',
          path: contentConfig.local_path,
        };
      }
    }

    return stats;
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const items = await fs.readdir(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (_error) {
      return 0;
    }

    return totalSize;
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

  async healthCheck(): Promise<{ status: string; details: Record<string, unknown> }> {
    try {
      const stats = await this.getStorageStats();
      const status = this.syncStatus;

      return {
        status: 'healthy',
        details: {
          isRunning: status.isRunning,
          lastSync: status.lastSync,
          storageStats: stats,
          configuredHandlers: this.handlers.size,
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
   * Shutdown the engine and clean up resources
   */
  shutdown(): void {
    this.logger.info('Shutting down scheduled tasks...');
    this.scheduler.destroyAll();
  }

  async run(): Promise<void> {
    try {
      await this.initialize();
      this.scheduleSync();

      this.logger.info('Sync Engine started successfully');

      // Keep the process running
      process.on('SIGINT', () => {
        this.logger.info('Sync Engine shutting down...');
        this.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        this.logger.info('Sync Engine received SIGTERM, shutting down...');
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
      this.logger.error(`Failed to start Sync Engine: ${error}`);
      process.exit(1);
    }
  }
}

// Main execution
if (require.main === module) {
  const configPath = process.env.SYNC_CONFIG_PATH || '/app/data/sync-config.yaml';
  const engine = new SyncEngine(configPath);

  engine.run().catch(error => {
    // Use stderr for critical startup errors
    process.stderr.write(`Failed to start Sync Engine: ${error}\n`);
    process.exit(1);
  });
}
