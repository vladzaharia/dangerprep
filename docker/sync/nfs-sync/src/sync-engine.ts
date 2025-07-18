import yaml from 'js-yaml';
import cron from 'node-cron';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from './utils/logger';
import { SyncConfig, SyncStatus, SyncResult } from './types';
import { BooksHandler } from './handlers/books';
import { MoviesHandler } from './handlers/movies';
import { TVHandler } from './handlers/tv';
import { WebTVHandler } from './handlers/webtv';
import axios from 'axios';

export class SyncEngine {
  private config: SyncConfig;
  private logger: Logger;
  private handlers: Map<string, any> = new Map();
  private syncStatus: SyncStatus = {
    isRunning: false,
    progress: 0,
    results: []
  };

  constructor(private configPath: string) {
    this.logger = new Logger('SyncEngine');
  }

  async initialize(): Promise<void> {
    await this.loadConfig();
    this.setupLogging();
    await this.initializeHandlers();
    await this.ensureDirectories();
  }

  private async loadConfig(): Promise<void> {
    try {
      const configFile = await fs.readFile(this.configPath, 'utf8');
      this.config = yaml.load(configFile) as SyncConfig;
    } catch (error) {
      throw new Error(`Failed to load config: ${error}`);
    }
  }

  private setupLogging(): void {
    const logConfig = this.config.sync_config.logging;
    this.logger.setLevel(logConfig.level);
    this.logger.setLogFile(logConfig.file);
  }

  private async initializeHandlers(): Promise<void> {
    const contentTypes = this.config.sync_config.content_types;
    const plexConfig = this.config.sync_config.plex;

    for (const [contentType, config] of Object.entries(contentTypes)) {
      switch (contentType) {
        case 'books':
          this.handlers.set(contentType, new BooksHandler(config, this.logger));
          break;
        case 'movies':
          this.handlers.set(contentType, new MoviesHandler(config, this.logger, plexConfig));
          break;
        case 'tv':
          this.handlers.set(contentType, new TVHandler(config, this.logger, plexConfig));
          break;
        case 'webtv':
          this.handlers.set(contentType, new WebTVHandler(config, this.logger));
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
    const baseStorage = this.config.sync_config.local_storage.base_path;
    await fs.mkdir(baseStorage, { recursive: true });
    await fs.mkdir(path.dirname(this.config.sync_config.logging.file), { recursive: true });

    // Ensure content type directories exist
    for (const config of Object.values(this.config.sync_config.content_types)) {
      await fs.mkdir(config.local_path, { recursive: true });
    }
  }

  scheduleSync(): void {
    const contentTypes = this.config.sync_config.content_types;

    for (const [contentType, config] of Object.entries(contentTypes)) {
      if (config.schedule && this.handlers.has(contentType)) {
        if (cron.validate(config.schedule)) {
          cron.schedule(config.schedule, () => {
            this.syncContentType(contentType);
          });
          this.logger.info(`Scheduled ${contentType} sync: ${config.schedule}`);
        } else {
          this.logger.error(`Invalid schedule for ${contentType}: ${config.schedule}`);
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
        errors: []
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
    const notifications = this.config.sync_config.notifications;
    if (!notifications?.enabled) {
      return;
    }

    try {
      if (notifications.webhook_url) {
        await axios.post(notifications.webhook_url, {
          contentType: result.contentType,
          success: result.success,
          duration: result.duration,
          timestamp: new Date().toISOString()
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

    for (const [contentType, config] of Object.entries(this.config.sync_config.content_types)) {
      try {
        const size = await this.getDirectorySize(config.local_path);
        stats[contentType] = {
          size: this.formatSize(size),
          path: config.local_path
        };
      } catch (error) {
        stats[contentType] = {
          size: 'Error',
          path: config.local_path
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
    } catch (error) {
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

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const stats = await this.getStorageStats();
      const status = this.syncStatus;
      
      return {
        status: 'healthy',
        details: {
          isRunning: status.isRunning,
          lastSync: status.lastSync,
          storageStats: stats,
          configuredHandlers: this.handlers.size
        }
      };
    } catch (error) {
      return {
        status: 'error',
        details: { error: error.toString() }
      };
    }
  }

  async run(): Promise<void> {
    try {
      await this.initialize();
      this.scheduleSync();
      
      this.logger.info('Sync Engine started successfully');

      // Keep the process running
      process.on('SIGINT', () => {
        this.logger.info('Sync Engine shutting down...');
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        this.logger.info('Sync Engine received SIGTERM, shutting down...');
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
    console.error('Failed to start Sync Engine:', error);
    process.exit(1);
  });
}
