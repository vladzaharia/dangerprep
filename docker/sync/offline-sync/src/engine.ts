import { ConfigManager } from '@dangerprep/configuration';
import { ErrorFactory, runWithErrorContext, safeAsync } from '@dangerprep/errors';
import { HealthChecker, ComponentStatus } from '@dangerprep/health';
import { NotificationType, NotificationLevel } from '@dangerprep/notifications';
import { BaseService, ServiceConfig, ServiceUtils, ServicePatterns } from '@dangerprep/service';

import { CardAnalyzer } from './analyzer';
import { DeviceDetector } from './detector';
import { MountManager } from './mount';
import { SyncEngine } from './sync';
import {
  OfflineSyncConfig,
  OfflineSyncConfigSchema,
  DetectedDevice,
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
        healthCheckIntervalMinutes: 2,
        handleProcessSignals: true,
        shutdownTimeoutMs: 60000,

        enableScheduler: true,
        enableProgressTracking: true,
        enableAutoRecovery: true,

        schedulerConfig: {
          enableHealthMonitoring: true,
          autoStartTasks: true,
        },

        progressConfig: {
          enableNotifications: true,
          cleanupDelayMs: 180000,
        },

        recoveryConfig: {
          maxRestartAttempts: 2,
          restartDelayMs: 10000,
          useExponentialBackoff: false,
          enableGracefulDegradation: true,
        },
        loggingConfig: {
          level: 'INFO',
          file: '/app/data/logs/offline-sync.log',
          maxSize: '50MB',
          backupCount: 3,
          format: 'text',
          colors: true,
        },
      }
    );

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

  protected override async loadConfiguration(): Promise<void> {
    this.offlineConfig = await this.loadConfigurationWithManager(this.configManager);
  }

  protected override async setupHealthChecks(): Promise<void> {
    if (!this.offlineConfig) {
      throw new Error('Configuration not loaded');
    }

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

    this.registerComponentHealthChecks();
  }

  protected override async initializeServiceComponents(): Promise<void> {
    if (!this.offlineConfig) {
      throw new Error('Configuration not loaded');
    }

    const offlineConfig = this.offlineConfig.offline_sync;

    this.deviceDetector = new DeviceDetector(offlineConfig);
    this.setupDeviceDetectorEvents();

    this.mountManager = new MountManager(offlineConfig);
    await this.mountManager.initialize();
    this.setupMountManagerEvents();

    this.cardAnalyzer = new CardAnalyzer(offlineConfig);

    this.syncEngine = new SyncEngine(offlineConfig);
    this.setupSyncEngineEvents();
  }

  protected override async startService(): Promise<void> {
    // Start device monitoring
    this.deviceDetector?.startMonitoring();

    // Schedule periodic device checks
    this.scheduleTask(
      'device-health-check',
      '*/30 * * * * *', // Every 30 seconds
      async () => {
        await this.performDeviceHealthCheck();
      },
      {
        name: 'Device Health Check',
        enableHealthCheck: false, // Don't health-check the health checker
        retryOnFailure: false,
      }
    );

    // Schedule cleanup task
    this.scheduleMaintenanceTask(
      'cleanup-old-transfers',
      '0 */6 * * *', // Every 6 hours
      async () => {
        await this.cleanupOldTransfers();
      },
      {
        name: 'Transfer Cleanup',
      }
    );

    // Start periodic checks (existing)
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

  // NEW: Add device health check method
  private async performDeviceHealthCheck(): Promise<void> {
    if (!this.mountManager || !this.deviceDetector) return;

    const mountedDevices = this.mountManager.getMountedDevices();

    for (const [devicePath, mountPath] of mountedDevices) {
      try {
        const device = this.deviceDetector.getDevice(devicePath);
        if (device) {
          const isHealthy = await this.checkDeviceHealth(device, mountPath);
          if (!isHealthy) {
            this.components.logger.warn(`Device ${device.devicePath} appears unhealthy`);
            await this.handleUnhealthyDevice(device);
          }
        }
      } catch (error) {
        this.components.logger.error(`Health check failed for ${devicePath}:`, error);
      }
    }
  }

  // NEW: Check device health
  private async checkDeviceHealth(device: DetectedDevice, mountPath: string): Promise<boolean> {
    try {
      // Check if mount path is still accessible
      const fs = await import('fs-extra');
      await fs.access(mountPath);

      // Try to read directory to ensure it's responsive
      await fs.readdir(mountPath);

      return true;
    } catch (error) {
      this.components.logger.debug(`Device health check failed for ${device.devicePath}:`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // NEW: Add cleanup method
  private async cleanupOldTransfers(): Promise<void> {
    const progressTracker = this.createMaintenanceProgressTracker(
      'cleanup-transfers',
      'Transfer Cleanup'
    );

    try {
      progressTracker.startPhase('analyze');

      // Clean up old transfer records, logs, etc.
      const oldTransfers = await this.findOldTransfers();

      progressTracker.completePhase('analyze');
      progressTracker.startPhase('cleanup');

      for (const transfer of oldTransfers) {
        await this.cleanupTransfer(transfer);
      }

      progressTracker.completePhase('cleanup');
      progressTracker.complete();

      this.components.logger.info(`Cleaned up ${oldTransfers.length} old transfers`);
    } catch (error) {
      progressTracker.fail(error instanceof Error ? error.message : 'Cleanup failed');
      throw error;
    }
  }

  // NEW: Add device-specific error handling
  private async handleUnhealthyDevice(device: DetectedDevice): Promise<void> {
    try {
      // Attempt to safely unmount and remount
      await this.mountManager?.unmountDevice(device);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      await this.mountManager?.mountDevice(device);

      this.components.logger.info(`Successfully recovered device ${device.devicePath}`);
    } catch (error) {
      this.components.logger.error(`Failed to recover device ${device.devicePath}:`, error);

      // Use service recovery for device failures
      await this.handleServiceFailure(new Error(`Device ${device.devicePath} is unrecoverable`));
    }
  }

  // NEW: Helper methods for cleanup
  private async findOldTransfers(): Promise<unknown[]> {
    // Implementation would find old transfer records
    // For now, return empty array
    return [];
  }

  private async cleanupTransfer(transfer: unknown): Promise<void> {
    // Implementation would clean up individual transfer
    // For now, just log
    this.components.logger.debug(`Cleaning up transfer: ${String(transfer)}`);
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
    return runWithErrorContext(
      async () => {
        if (!this.syncEngine || !this.cardAnalyzer) {
          throw ErrorFactory.businessLogic('Service not properly initialized', {
            context: {
              operation: 'triggerSync',
              service: 'offline-sync',
              component: 'sync-trigger',
            },
          });
        }

        const device = this.deviceDetector?.getDevice(devicePath);
        if (!device) {
          throw ErrorFactory.businessLogic(`Device not found: ${devicePath}`, {
            data: { devicePath },
            context: {
              operation: 'triggerSync',
              service: 'offline-sync',
              component: 'device-lookup',
            },
          });
        }

        if (!device.isMounted || !device.mountPath) {
          throw ErrorFactory.filesystem(`Device not mounted: ${devicePath}`, {
            data: { devicePath, isMounted: device.isMounted, mountPath: device.mountPath },
            context: {
              operation: 'triggerSync',
              service: 'offline-sync',
              component: 'mount-check',
            },
          });
        }

        const result = await safeAsync(async () => {
          if (!this.cardAnalyzer) {
            throw new Error('Card analyzer not initialized');
          }
          if (!this.syncEngine) {
            throw new Error('Sync engine not initialized');
          }

          const analysis = await this.cardAnalyzer.analyzeCard(device);
          const operationId = await this.syncEngine.startSync(device, analysis);
          this.syncStats.totalOperations++;
          return operationId;
        });

        if (result.success) {
          return result.data;
        } else {
          this.syncStats.failedOperations++;
          this.components.logger.error('Sync operation failed', {
            error: result.error,
            operation: 'triggerSync',
            component: 'sync-execution',
          });

          await this.components.notificationManager.notify(
            NotificationType.SYNC_FAILED,
            'Sync operation failed',
            {
              level: NotificationLevel.ERROR,
              error: result.error instanceof Error ? result.error : new Error(String(result.error)),
              data: { operation: 'triggerSync', component: 'sync-execution' },
            }
          );
          throw result.error;
        }
      },
      {
        operation: 'triggerSync',
        service: 'offline-sync',
        component: 'sync-trigger',
      }
    );
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
        this.components.logger.error('Device mount failed', {
          error: mountResult.error,
          operation: 'device_mount',
          component: 'mount-manager',
        });

        await this.components.notificationManager.notify(
          NotificationType.SYNC_FAILED,
          'Device mount failed',
          {
            level: NotificationLevel.ERROR,
            error:
              mountResult.error instanceof Error
                ? mountResult.error
                : new Error(String(mountResult.error)),
            data: { operation: 'device_mount', component: 'mount-manager' },
          }
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
      if (!this.cardAnalyzer) {
        throw new Error('Card analyzer not initialized');
      }

      // Analyze the card
      const analysis = await this.cardAnalyzer.analyzeCard(device);

      // Create missing directories if needed
      if (analysis.missingContentTypes.length > 0) {
        await this.cardAnalyzer.createMissingDirectories(analysis);
      }

      // Start sync operation
      if (!this.syncEngine) {
        throw new Error('Sync engine not initialized');
      }
      await this.syncEngine.startSync(device, analysis);
      this.syncStats.totalOperations++;

      await this.sendNotification({
        type: 'card_inserted',
        timestamp: new Date(),
        device,
        message: `MicroSD card inserted and sync started: ${device.devicePath}`,
      });
    });

    if (!deviceReadyResult.success) {
      this.components.logger.error('Device ready handling failed', {
        error: deviceReadyResult.error,
        operation: 'handleDeviceReady',
        component: 'device-ready-handler',
      });

      await this.components.notificationManager.notify(
        NotificationType.SYNC_FAILED,
        'Device ready handling failed',
        {
          level: NotificationLevel.ERROR,
          error:
            deviceReadyResult.error instanceof Error
              ? deviceReadyResult.error
              : new Error(String(deviceReadyResult.error)),
          data: { operation: 'handleDeviceReady', component: 'device-ready-handler' },
        }
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

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await service.stop();
    process.exit(0);
  });

  // Start the service
  service.start().catch(error => {
    console.error('Failed to start offline sync service:', error);
    process.exit(1);
  });
}
