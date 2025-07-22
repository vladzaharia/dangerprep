import { EventEmitter } from 'events';

// import * as cron from 'node-cron'; // TODO: Implement cron scheduling

import { CardAnalyzer } from './card-analyzer';
import { ConfigManager } from './config-manager';
import { DeviceDetector } from './device-detector';
import { Logger } from './logger';
import { MountManager } from './mount-manager';
import { SyncEngine } from './sync-engine';
import {
  OfflineSyncConfig,
  DetectedDevice,
  // CardAnalysis, // TODO: Use for card analysis
  SyncOperation,
  HealthStatus,
  SyncStats,
  NotificationEvent,
} from './types';

export class OfflineSync extends EventEmitter {
  private configManager: ConfigManager;
  private logger: Logger | null = null;
  private deviceDetector: DeviceDetector | null = null;
  private mountManager: MountManager | null = null;
  private cardAnalyzer: CardAnalyzer | null = null;
  private syncEngine: SyncEngine | null = null;

  private config: OfflineSyncConfig | null = null;
  private isRunning = false;
  private startTime: Date | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  private stats: SyncStats = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    totalFilesTransferred: 0,
    totalBytesTransferred: 0,
    averageTransferSpeed: 0,
    uptime: 0,
  };

  constructor(configPath?: string) {
    super();
    this.configManager = new ConfigManager(configPath);
  }

  /**
   * Initialize and start the offline sync service
   */
  public async start(): Promise<void> {
    try {
      if (this.isRunning) {
        throw new Error('Service is already running');
      }

      // Load configuration
      this.config = await this.configManager.loadConfig();

      // Initialize logger
      this.logger = new Logger(this.config.offline_sync.logging);
      this.logger.info('OfflineSync', 'Starting offline sync service...');

      // Initialize components
      await this.initializeComponents();

      // Start device monitoring
      this.deviceDetector?.startMonitoring();

      // Start periodic checks
      this.startPeriodicChecks();

      this.isRunning = true;
      this.startTime = new Date();

      this.logger.info('OfflineSync', 'Offline sync service started successfully');
      this.emit('service_started');
    } catch (error) {
      this.logger?.error('OfflineSync', 'Failed to start service', error);
      throw error;
    }
  }

  /**
   * Stop the offline sync service
   */
  public async stop(): Promise<void> {
    try {
      if (!this.isRunning) {
        return;
      }

      this.logger?.info('OfflineSync', 'Stopping offline sync service...');

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

      this.isRunning = false;

      this.logger?.info('OfflineSync', 'Offline sync service stopped');
      this.emit('service_stopped');
    } catch (error) {
      this.logger?.error('OfflineSync', 'Error stopping service', error);
      throw error;
    }
  }

  /**
   * Get service health status
   */
  public async healthCheck(): Promise<HealthStatus> {
    const health: HealthStatus = {
      status: 'healthy',
      timestamp: new Date(),
      services: {
        usbDetection: !!this.deviceDetector,
        mountingSystem: !!this.mountManager,
        syncEngine: !!this.syncEngine,
        fileSystem: true,
      },
      activeOperations: this.syncEngine?.getActiveOperations().length ?? 0,
      connectedDevices: this.deviceDetector?.getDetectedDevices().length ?? 0,
      errors: [],
      warnings: [],
    };

    // Check if service is running
    if (!this.isRunning) {
      health.status = 'unhealthy';
      health.errors.push('Service is not running');
    }

    // Check configuration
    if (!this.config) {
      health.status = 'unhealthy';
      health.errors.push('Configuration not loaded');
    }

    // Check file system access
    try {
      if (this.config) {
        const _contentDir = this.config.offline_sync.storage.content_directory;
        const _mountBase = this.config.offline_sync.storage.mount_base;

        // These would be actual file system checks in a real implementation
        // For now, we'll assume they're accessible
      }
    } catch (_error) {
      health.status = 'degraded';
      health.warnings.push('File system access issues detected');
    }

    // Update uptime
    if (this.startTime) {
      this.stats.uptime = Date.now() - this.startTime.getTime();
    }

    return health;
  }

  /**
   * Get service statistics
   */
  public getStats(): SyncStats {
    if (this.startTime) {
      this.stats.uptime = Date.now() - this.startTime.getTime();
    }
    return { ...this.stats };
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
    if (!this.syncEngine || !this.cardAnalyzer) {
      throw new Error('Service not properly initialized');
    }

    const device = this.deviceDetector?.getDevice(devicePath);
    if (!device) {
      throw new Error(`Device not found: ${devicePath}`);
    }

    if (!device.isMounted || !device.mountPath) {
      throw new Error(`Device not mounted: ${devicePath}`);
    }

    try {
      const analysis = await this.cardAnalyzer.analyzeCard(device);
      const operationId = await this.syncEngine.startSync(device, analysis);

      this.stats.totalOperations++;
      return operationId;
    } catch (error) {
      this.stats.failedOperations++;
      throw error;
    }
  }

  /**
   * Initialize all components
   */
  private async initializeComponents(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const offlineConfig = this.config.offline_sync;

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

  /**
   * Setup device detector event handlers
   */
  private setupDeviceDetectorEvents(): void {
    if (!this.deviceDetector) return;

    this.deviceDetector.on('device_detected', async (device: DetectedDevice) => {
      this.logger?.info('OfflineSync', `Device detected: ${device.devicePath}`);

      try {
        // Attempt to mount the device
        const mountPath = await this.mountManager?.mountDevice(device);
        if (mountPath) {
          this.logger?.info('OfflineSync', `Device mounted: ${device.devicePath} at ${mountPath}`);
          await this.handleDeviceReady(device);
        }
      } catch (error) {
        this.logger?.error('OfflineSync', `Failed to mount device ${device.devicePath}`, error);
      }
    });

    this.deviceDetector.on('device_removed', async (device: DetectedDevice) => {
      this.logger?.info('OfflineSync', `Device removed: ${device.devicePath}`);

      // Cancel any active sync operations for this device
      const activeOperations = this.syncEngine?.getActiveOperations() ?? [];
      for (const operation of activeOperations) {
        if (operation.device.devicePath === device.devicePath) {
          await this.syncEngine?.cancelSync(operation.id);
        }
      }

      this.sendNotification({
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
      this.logger?.info('OfflineSync', `Device mounted: ${device.devicePath} at ${mountPath}`);
      await this.handleDeviceReady(device);
    });

    this.mountManager.on('device_unmounted', (device: DetectedDevice) => {
      this.logger?.info('OfflineSync', `Device unmounted: ${device.devicePath}`);
    });
  }

  /**
   * Setup sync engine event handlers
   */
  private setupSyncEngineEvents(): void {
    if (!this.syncEngine) return;

    this.syncEngine.on('sync_started', (operation: SyncOperation) => {
      this.logger?.info('OfflineSync', `Sync started: ${operation.id}`);
      this.sendNotification({
        type: 'sync_started',
        timestamp: new Date(),
        operation,
        message: `Sync started for device: ${operation.device.devicePath}`,
      });
    });

    this.syncEngine.on('sync_completed', (operation: SyncOperation) => {
      this.logger?.info('OfflineSync', `Sync completed: ${operation.id}`);
      this.stats.successfulOperations++;
      this.stats.totalFilesTransferred += operation.processedFiles;
      this.stats.totalBytesTransferred += operation.processedSize;

      this.sendNotification({
        type: 'sync_completed',
        timestamp: new Date(),
        operation,
        message: `Sync completed: ${operation.processedFiles} files transferred`,
      });
    });

    this.syncEngine.on('sync_failed', (operation: SyncOperation, error: unknown) => {
      this.logger?.error('OfflineSync', `Sync failed: ${operation.id}`, error);
      this.stats.failedOperations++;

      this.sendNotification({
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

    try {
      // Analyze the card
      const analysis = await this.cardAnalyzer.analyzeCard(device);

      // Create missing directories if needed
      if (analysis.missingContentTypes.length > 0) {
        await this.cardAnalyzer.createMissingDirectories(analysis);
      }

      // Start sync operation
      const _operationId = await this.syncEngine.startSync(device, analysis);
      this.stats.totalOperations++;

      this.sendNotification({
        type: 'card_inserted',
        timestamp: new Date(),
        device,
        message: `MicroSD card inserted and sync started: ${device.devicePath}`,
      });
    } catch (error) {
      this.logger?.error(
        'OfflineSync',
        `Failed to handle device ready: ${device.devicePath}`,
        error
      );
    }
  }

  /**
   * Start periodic checks
   */
  private startPeriodicChecks(): void {
    if (!this.config) return;

    const interval = this.config.offline_sync.sync.check_interval * 1000;

    this.checkInterval = setInterval(async () => {
      try {
        // Perform periodic health checks and maintenance
        await this.performPeriodicMaintenance();
      } catch (error) {
        this.logger?.error('OfflineSync', 'Error during periodic maintenance', error);
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
        this.logger?.warn('OfflineSync', `Stale operation detected: ${operation.id}`);
        await this.syncEngine?.cancelSync(operation.id);
      }
    }
  }

  /**
   * Send notification
   */
  private sendNotification(event: NotificationEvent): void {
    this.emit('notification', event);

    // Here you could implement webhook notifications, email, etc.
    if (this.config?.offline_sync.notifications?.enabled) {
      // Implementation would go here
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
