// import * as cron from 'node-cron'; // TODO: Implement cron scheduling

import { ConfigManager } from '@dangerprep/shared/config';
import {
  ErrorFactory,
  ErrorPatterns,
  runWithErrorContext,
  safeAsync,
} from '@dangerprep/shared/errors';
import { HealthChecker, ComponentStatus } from '@dangerprep/shared/health';
import { LoggerFactory } from '@dangerprep/shared/logging';
import { NotificationType, NotificationLevel } from '@dangerprep/shared/notifications';
import {
  BaseService,
  ServiceConfig,
  ServiceUtils,
  ServicePatterns,
} from '@dangerprep/shared/service';

import { CardAnalyzer } from './card-analyzer';
import { DeviceDetector } from './device-detector';
import { MountManager } from './mount-manager';
import { SyncEngine } from './sync-engine';
import {
  OfflineSyncConfig,
  OfflineSyncConfigSchema,
  DetectedDevice,
  // CardAnalysis, // TODO: Use for card analysis
  SyncOperation,
  SyncStats,
  NotificationEvent,
} from './types';

export class OfflineSync extends BaseService {
  private configManager: ConfigManager<OfflineSyncConfig>;
  private deviceDetector: DeviceDetector | null = null;
  private mountManager: MountManager | null = null;
  private cardAnalyzer: CardAnalyzer | null = null;
  private syncEngine: SyncEngine | null = null;

  private offlineConfig: OfflineSyncConfig | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  private readonly syncStats: SyncStats = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    totalFilesTransferred: 0,
    totalBytesTransferred: 0,
    averageTransferSpeed: 0,
    uptime: 0,
  };

  constructor(configPath?: string) {
    const serviceConfig: ServiceConfig = ServiceUtils.createServiceConfig(
      'offline-sync',
      '1.0.0',
      configPath || process.env.OFFLINE_SYNC_CONFIG_PATH || '/app/data/config.yaml',
      {
        enablePeriodicHealthChecks: true,
        healthCheckIntervalMinutes: 5,
        handleProcessSignals: true,
        shutdownTimeoutMs: 30000,
      }
    );

    // Add lifecycle hooks for advanced features
    const hooks = {
      beforeInitialize: async () => {
        this.components.logger.debug('Preparing offline sync initialization...');
      },
      afterInitialize: async () => {
        this.components.logger.info('Offline sync initialization completed');
      },
      beforeStart: async () => {
        this.components.logger.debug('Preparing to start offline sync service...');
      },
      afterStart: async () => {
        this.components.logger.info('Offline sync service fully operational');
      },
      beforeStop: async () => {
        this.components.logger.info('Initiating graceful shutdown...');
      },
      afterStop: async () => {
        this.components.logger.info('Offline sync service stopped cleanly');
      },
    };

    super(serviceConfig, hooks);

    this.configManager = new ConfigManager(serviceConfig.configPath, OfflineSyncConfigSchema, {
      logger: this.components.logger,
    });
  }

  // BaseService abstract method implementations
  protected override async loadConfiguration(): Promise<void> {
    this.offlineConfig = await this.loadConfigurationWithManager(this.configManager);
  }

  protected override async setupLogging(): Promise<void> {
    if (!this.offlineConfig) {
      throw new Error('Configuration not loaded');
    }

    const logConfig = this.offlineConfig.offline_sync.logging;
    const logger = LoggerFactory.createCombinedLogger(
      'OfflineSync',
      logConfig.file,
      logConfig.level
    );

    // Update the logger in components
    this.components.logger = logger;

    // Update the config manager logger
    this.configManager = this.updateConfigManagerLogger(
      this.config.configPath,
      OfflineSyncConfigSchema
    );
  }

  protected override async setupHealthChecks(): Promise<void> {
    if (!this.offlineConfig) {
      throw new Error('Configuration not loaded');
    }

    // Register file system health check
    this.components.healthChecker.registerComponent(
      HealthChecker.createFileSystemCheck(
        'filesystem',
        [
          this.offlineConfig.offline_sync.storage.content_directory,
          this.offlineConfig.offline_sync.storage.mount_base,
        ],
        true
      )
    );

    // Register additional health checks for service components
    this.registerComponentHealthChecks();
  }

  protected override async initializeServiceComponents(): Promise<void> {
    if (!this.offlineConfig) {
      throw new Error('Configuration not loaded');
    }

    const offlineConfig = this.offlineConfig.offline_sync;

    // Initialize device detector
    this.deviceDetector = new DeviceDetector(offlineConfig);
    this.setupDeviceDetectorEvents();

    // Initialize mount manager
    this.mountManager = new MountManager(offlineConfig);
    await this.mountManager.initialize();
    this.setupMountManagerEvents();

    // Initialize card analyzer
    this.cardAnalyzer = new CardAnalyzer(offlineConfig);

    // Initialize sync engine
    this.syncEngine = new SyncEngine(offlineConfig);
    this.setupSyncEngineEvents();
  }

  protected override async startService(): Promise<void> {
    // Start device monitoring
    this.deviceDetector?.startMonitoring();

    // Start periodic checks
    this.startPeriodicChecks();

    this.components.logger.info('Offline sync service started successfully');
  }

  protected override async stopService(): Promise<void> {
    this.components.logger.info('Stopping offline sync service...');

    // Stop periodic checks
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Stop device monitoring
    this.deviceDetector?.stopMonitoring();

    // Cancel any active sync operations
    const activeOperations = this.syncEngine?.getActiveOperations() ?? [];
    for (const operation of activeOperations) {
      await this.syncEngine?.cancelSync(operation.id);
    }

    this.components.logger.info('Offline sync service stopped');
  }

  /**
   * Register component-specific health checks
   */
  private registerComponentHealthChecks(): void {
    // Configuration check using shared pattern
    this.components.healthChecker.registerComponent(
      ServicePatterns.createConfigurationHealthCheck(
        () => !!this.offlineConfig,
        () =>
          this.offlineConfig
            ? {
                contentDirectory: this.offlineConfig.offline_sync.storage.content_directory,
                mountBase: this.offlineConfig.offline_sync.storage.mount_base,
              }
            : {}
      )
    );

    // USB Detection component check
    this.components.healthChecker.registerComponent({
      name: 'usbDetection',
      critical: true,
      check: async () => {
        const isUp = !!this.deviceDetector;
        const result = {
          status: isUp ? ComponentStatus.UP : ComponentStatus.DOWN,
          message: isUp ? 'USB detection active' : 'USB detection not initialized',
          ...(isUp && {
            details: {
              detectedDevices: this.deviceDetector?.getDetectedDevices().length ?? 0,
            },
          }),
        };

        return result;
      },
    });

    // Mount Manager component check
    this.components.healthChecker.registerComponent({
      name: 'mountingSystem',
      critical: true,
      check: async () => {
        const isUp = !!this.mountManager;
        return {
          status: isUp ? ComponentStatus.UP : ComponentStatus.DOWN,
          message: isUp ? 'Mounting system active' : 'Mounting system not initialized',
        };
      },
    });

    // Services check using shared pattern
    this.components.healthChecker.registerComponent(
      ServicePatterns.createServicesHealthCheck('offline-sync', {
        deviceDetector: this.deviceDetector,
        mountManager: this.mountManager,
        cardAnalyzer: this.cardAnalyzer,
        syncEngine: this.syncEngine,
      })
    );
  }

  /**
   * Get service statistics
   */
  public override getStats() {
    const baseStats = super.getStats();
    return {
      ...baseStats,
      customStats: this.syncStats as unknown as Record<string, unknown>,
    };
  }

  /**
   * Get sync-specific statistics
   */
  public getSyncStats(): SyncStats {
    return { ...this.syncStats };
  }

  /**
   * Get detected devices
   */
  public getDetectedDevices(): DetectedDevice[] {
    return this.deviceDetector?.getDetectedDevices() ?? [];
  }

  /**
   * Get active sync operations
   */
  public getActiveOperations(): SyncOperation[] {
    return this.syncEngine?.getActiveOperations() ?? [];
  }

  /**
   * Manually trigger sync for a specific device
   */
  public async triggerSync(devicePath: string): Promise<string | null> {
    return runWithErrorContext(async () => {
      if (!this.syncEngine || !this.cardAnalyzer) {
        throw ErrorFactory.businessLogic(
          'Service not properly initialized',
          {
            context: { operation: 'triggerSync', service: 'offline-sync', component: 'sync-trigger' }
          }
        );
      }

      const device = this.deviceDetector?.getDevice(devicePath);
      if (!device) {
        throw ErrorFactory.businessLogic(
          `Device not found: ${devicePath}`,
          {
            data: { devicePath },
            context: { operation: 'triggerSync', service: 'offline-sync', component: 'device-lookup' }
          }
        );
      }

      if (!device.isMounted || !device.mountPath) {
        throw ErrorFactory.filesystem(
          `Device not mounted: ${devicePath}`,
          {
            data: { devicePath, isMounted: device.isMounted, mountPath: device.mountPath },
            context: { operation: 'triggerSync', service: 'offline-sync', component: 'mount-check' }
          }
        );
      }

      const result = await safeAsync(async () => {
        const analysis = await this.cardAnalyzer!.analyzeCard(device);
        const operationId = await this.syncEngine!.startSync(device, analysis);
        this.syncStats.totalOperations++;
        return operationId;
      });

      if (result.success) {
        return result.data;
      } else {
        this.syncStats.failedOperations++;
        await ErrorPatterns.logAndNotifyError(
          result.error,
          this.components.logger,
          this.components.notificationManager,
          { operation: 'triggerSync', component: 'sync-execution' }
        );
        throw result.error;
      }
    }, {
      operation: 'triggerSync',
      service: 'offline-sync',
      component: 'sync-trigger',
    });
  }

  /**
   * Setup device detector event handlers
   */
  private setupDeviceDetectorEvents(): void {
    if (!this.deviceDetector) return;

    this.deviceDetector.on('device_detected', async (device: DetectedDevice) => {
      this.components.logger.debug(`Device detected: ${device.devicePath}`); // Technical detail

      const mountResult = await safeAsync(async () => {
        const mountPath = await this.mountManager?.mountDevice(device);
        if (mountPath) {
          this.components.logger.debug(`Device mounted: ${device.devicePath} at ${mountPath}`);
          await this.handleDeviceReady(device);
        }
        return mountPath;
      });

      if (!mountResult.success) {
        await ErrorPatterns.logAndNotifyError(
          mountResult.error,
          this.components.logger,
          this.components.notificationManager,
          { operation: 'device_mount', component: 'mount-manager' }
        );
      }
    });

    this.deviceDetector.on('device_removed', async (device: DetectedDevice) => {
      this.components.logger.debug(`Device removed: ${device.devicePath}`); // Technical detail

      // Cancel any active sync operations for this device
      const activeOperations = this.syncEngine?.getActiveOperations() ?? [];
      for (const operation of activeOperations) {
        if (operation.device.devicePath === device.devicePath) {
          await this.syncEngine?.cancelSync(operation.id);
        }
      }

      await this.sendNotification({
        type: 'card_removed',
        timestamp: new Date(),
        device,
        message: `MicroSD card removed: ${device.devicePath}`,
      });
    });
  }

  /**
   * Setup mount manager event handlers
   */
  private setupMountManagerEvents(): void {
    if (!this.mountManager) return;

    this.mountManager.on('device_mounted', async (device: DetectedDevice, mountPath: string) => {
      this.components.logger.info(`Device mounted: ${device.devicePath} at ${mountPath}`);
      await this.handleDeviceReady(device);
    });

    this.mountManager.on('device_unmounted', (device: DetectedDevice) => {
      this.components.logger.info(`Device unmounted: ${device.devicePath}`);
    });
  }

  /**
   * Setup sync engine event handlers
   */
  private setupSyncEngineEvents(): void {
    if (!this.syncEngine) return;

    this.syncEngine.on('sync_started', async (operation: SyncOperation) => {
      this.components.logger.debug(`Sync started: ${operation.id}`); // Technical detail
      await this.sendNotification({
        type: 'sync_started',
        timestamp: new Date(),
        operation,
        message: `Sync started for device: ${operation.device.devicePath}`,
      });
    });

    this.syncEngine.on('sync_completed', async (operation: SyncOperation) => {
      this.components.logger.debug(`Sync completed: ${operation.id}`); // Technical detail
      this.syncStats.successfulOperations++;
      this.syncStats.totalFilesTransferred += operation.processedFiles;
      this.syncStats.totalBytesTransferred += operation.processedSize;

      await this.sendNotification({
        type: 'sync_completed',
        timestamp: new Date(),
        operation,
        message: `Sync completed: ${operation.processedFiles} files transferred`,
      });
    });

    this.syncEngine.on('sync_failed', async (operation: SyncOperation, error: unknown) => {
      this.components.logger.error(`Sync failed: ${operation.id}`, error); // Technical detail with error
      this.syncStats.failedOperations++;

      await this.sendNotification({
        type: 'sync_failed',
        timestamp: new Date(),
        operation,
        message: `Sync failed: ${operation.error ?? 'Unknown error'}`,
      });
    });
  }

  /**
   * Handle device ready for sync
   */
  private async handleDeviceReady(device: DetectedDevice): Promise<void> {
    if (!this.cardAnalyzer || !this.syncEngine) {
      return;
    }

    const deviceReadyResult = await safeAsync(async () => {
      // Analyze the card
      const analysis = await this.cardAnalyzer!.analyzeCard(device);

      // Create missing directories if needed
      if (analysis.missingContentTypes.length > 0) {
        await this.cardAnalyzer!.createMissingDirectories(analysis);
      }

      // Start sync operation
      await this.syncEngine!.startSync(device, analysis);
      this.syncStats.totalOperations++;

      await this.sendNotification({
        type: 'card_inserted',
        timestamp: new Date(),
        device,
        message: `MicroSD card inserted and sync started: ${device.devicePath}`,
      });
    });

    if (!deviceReadyResult.success) {
      await ErrorPatterns.logAndNotifyError(
        deviceReadyResult.error,
        this.components.logger,
        this.components.notificationManager,
        { operation: 'handleDeviceReady', component: 'device-ready-handler' }
      );
    }
  }

  /**
   * Start periodic checks
   */
  private startPeriodicChecks(): void {
    if (!this.offlineConfig) return;

    const interval = this.offlineConfig.offline_sync.sync.check_interval * 1000;

    this.checkInterval = setInterval(async () => {
      try {
        // Perform periodic health checks and maintenance
        await this.performPeriodicMaintenance();
      } catch (error) {
        this.components.logger.error('Error during periodic maintenance', error);
      }
    }, interval);
  }

  /**
   * Perform periodic maintenance tasks
   */
  private async performPeriodicMaintenance(): Promise<void> {
    // Check for stale operations
    const activeOperations = this.syncEngine?.getActiveOperations() ?? [];
    const now = Date.now();

    for (const operation of activeOperations) {
      const elapsed = now - operation.startTime.getTime();
      const timeout = 30 * 60 * 1000; // 30 minutes

      if (elapsed > timeout && operation.status === 'in_progress') {
        this.components.logger.warn(`Stale operation detected: ${operation.id}`);
        await this.syncEngine?.cancelSync(operation.id);
      }
    }
  }

  /**
   * Send notification using the new notification system
   */
  private async sendNotification(event: NotificationEvent): Promise<void> {
    // Emit for backward compatibility
    this.emit('notification', event);

    // Use the new notification system
    // Map old event types to new notification types
    const notificationType = this.mapEventTypeToNotificationType(event.type);

    await this.components.notificationManager.notify(notificationType, event.message, {
      source: 'offline-sync',
      level: NotificationLevel.INFO,
      data: {
        device: event.device
          ? {
              devicePath: event.device.devicePath,
              fileSystem: event.device.fileSystem,
              isMounted: event.device.isMounted,
            }
          : undefined,
        operation: event.operation
          ? {
              id: event.operation.id,
              status: event.operation.status,
              processedFiles: event.operation.processedFiles,
            }
          : undefined,
        ...event.details,
      },
    });
  }

  /**
   * Map old event types to new notification types
   */
  private mapEventTypeToNotificationType(eventType: string): NotificationType {
    switch (eventType) {
      case 'card_inserted':
        return NotificationType.DEVICE_DETECTED;
      case 'card_removed':
        return NotificationType.DEVICE_UNMOUNTED;
      case 'sync_started':
        return NotificationType.SYNC_STARTED;
      case 'sync_completed':
        return NotificationType.SYNC_COMPLETED;
      case 'sync_failed':
        return NotificationType.SYNC_FAILED;
      default:
        return NotificationType.CUSTOM;
    }
  }
}

// Main entry point when run directly
if (require.main === module) {
  const service = new OfflineSync();
  const startupLogger = LoggerFactory.createConsoleLogger('Startup');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    startupLogger.info('Received SIGINT, shutting down gracefully...');
    await service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    startupLogger.info('Received SIGTERM, shutting down gracefully...');
    await service.stop();
    process.exit(0);
  });

  // Start the service
  service.start().catch(error => {
    startupLogger.error('Failed to start offline sync service:', error);
    process.exit(1);
  });
}
