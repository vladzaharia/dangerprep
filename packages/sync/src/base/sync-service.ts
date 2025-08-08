import { EventEmitter } from 'events';

import { ConfigManager, z } from '@dangerprep/configuration';
import { ErrorFactory, runWithErrorContext } from '@dangerprep/errors';
import { ComponentStatus } from '@dangerprep/health';
import { NotificationType, NotificationLevel } from '@dangerprep/notifications';
import { ProgressTracker, ProgressConfig } from '@dangerprep/progress';
import {
  BaseService,
  ServiceConfig,
  ServiceUtils,
  ServiceInitializationResult,
} from '@dangerprep/service';

import { SyncOperation, SyncResult, SyncStats, BaseSyncConfig } from '../types';

export interface SyncServiceConfig extends BaseSyncConfig {
  service_name: string;
  version: string;
}

export abstract class BaseSyncService<TConfig extends SyncServiceConfig> extends BaseService {
  protected configManager: ConfigManager<TConfig>;
  protected progressTracker: ProgressTracker;
  protected readonly eventEmitter = new EventEmitter();

  protected readonly activeOperations = new Map<string, SyncOperation>();
  protected readonly syncStats: SyncStats = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    totalItemsTransferred: 0,
    totalBytesTransferred: 0,
    averageTransferSpeed: 0,
    uptime: 0,
  };

  constructor(
    serviceName: string,
    version: string,
    configPath: string,
    configSchema: z.ZodSchema<TConfig>,
    additionalServiceConfig: Partial<ServiceConfig> = {}
  ) {
    const serviceConfig: ServiceConfig = ServiceUtils.createServiceConfig(
      serviceName,
      version,
      configPath,
      {
        enablePeriodicHealthChecks: true,
        healthCheckIntervalMinutes: 5,
        handleProcessSignals: true,
        shutdownTimeoutMs: 30000,
        enableScheduler: true,
        enableProgressTracking: true,
        enableAutoRecovery: true,
        ...additionalServiceConfig,
      }
    );

    super(serviceConfig);

    this.configManager = new ConfigManager<TConfig>(configPath, configSchema);

    const progressConfig: ProgressConfig = {
      operationId: `${serviceName}-progress`,
      operationName: `${serviceName} Sync Service`,
      totalItems: 0,
      totalBytes: 0,
      phases: [],
      updateInterval: 1000,
      metadata: { service: serviceName, version },
    };
    this.progressTracker = new ProgressTracker(progressConfig);
  }

  public override async initialize(): Promise<ServiceInitializationResult> {
    const startTime = Date.now();
    const baseResult = await super.initialize();
    if (!baseResult.success) {
      return baseResult;
    }

    try {
      // Load configuration
      await this.configManager.loadConfig();

      // Set up event listeners
      this.setupEventListeners();

      this.components.logger.info(`${this.constructor.name} initialized successfully`);

      const duration = Date.now() - startTime;
      return { success: true, duration };
    } catch (error) {
      const configError = ErrorFactory.configuration(
        `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
        { context: { operation: 'initialize', service: 'sync-service' } }
      );
      const duration = Date.now() - startTime;
      return { success: false, error: configError, duration };
    }
  }

  protected async cleanup(): Promise<void> {
    // Cancel all active operations
    for (const [operationId, operation] of this.activeOperations) {
      if (operation.status === 'in_progress') {
        await this.cancelOperation(operationId);
      }
    }

    // BaseService doesn't have cleanup method, call stop instead
    if (this.getState() !== 'stopped') {
      await this.stop();
    }
  }

  // Abstract methods that must be implemented by concrete sync services
  protected abstract validateConfiguration(config: TConfig): Promise<boolean>;
  protected abstract performSync(operation: SyncOperation): Promise<SyncResult>;

  // Common sync operation management
  protected async startSyncOperation(
    type: string,
    direction: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const operationId = this.generateOperationId();

    const operation: SyncOperation = {
      id: operationId,
      type: type as SyncOperation['type'],
      direction: direction as SyncOperation['direction'],
      status: 'pending',
      startTime: new Date(),
      totalItems: 0,
      processedItems: 0,
      totalSize: 0,
      processedSize: 0,
      ...(metadata && { metadata }),
    };

    this.activeOperations.set(operationId, operation);
    this.syncStats.totalOperations++;

    this.eventEmitter.emit('operation_started', operation);
    this.components.logger.info(`Started sync operation: ${operationId}`);

    // Start the sync operation asynchronously
    this.executeSyncOperation(operation).catch(error => {
      this.components.logger.error(`Sync operation ${operationId} failed: ${error}`);
    });

    return operationId;
  }

  protected async executeSyncOperation(operation: SyncOperation): Promise<void> {
    try {
      operation.status = 'in_progress';
      this.eventEmitter.emit('operation_progress', operation);

      const result = await runWithErrorContext(() => this.performSync(operation), {
        operation: `sync-operation-${operation.id}`,
        service: 'sync-service',
      });

      if (result.success) {
        operation.status = 'completed';
        this.syncStats.successfulOperations++;
        this.syncStats.totalItemsTransferred += result.itemsProcessed;
        this.syncStats.totalBytesTransferred += result.totalSize;
      } else {
        operation.status = 'failed';
        operation.error = result.errors.join('; ');
        this.syncStats.failedOperations++;
      }

      operation.endTime = new Date();
      this.eventEmitter.emit('operation_completed', operation, result);

      // Update average transfer speed
      this.updateAverageTransferSpeed();
    } catch (error) {
      operation.status = 'failed';
      operation.endTime = new Date();
      operation.error = error instanceof Error ? error.message : String(error);
      this.syncStats.failedOperations++;

      this.eventEmitter.emit('operation_failed', operation, error);
    } finally {
      // Clean up completed operations after a delay
      setTimeout(() => {
        this.activeOperations.delete(operation.id);
      }, 300000); // 5 minutes
    }
  }

  public async cancelOperation(operationId: string): Promise<boolean> {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      return false;
    }

    if (operation.status === 'in_progress') {
      operation.status = 'cancelled';
      operation.endTime = new Date();
      this.eventEmitter.emit('operation_cancelled', operation);
      this.components.logger.info(`Cancelled sync operation: ${operationId}`);
      return true;
    }

    return false;
  }

  // Progress tracking helpers
  protected updateOperationProgress(
    operationId: string,
    processedItems: number,
    processedSize: number,
    currentItem?: string
  ): void {
    const operation = this.activeOperations.get(operationId);
    if (!operation) return;

    operation.processedItems = processedItems;
    operation.processedSize = processedSize;
    if (currentItem !== undefined) {
      operation.currentItem = currentItem;
    }

    this.eventEmitter.emit('operation_progress', operation);
  }

  // Utility methods
  protected generateOperationId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private updateAverageTransferSpeed(): void {
    if (this.syncStats.totalOperations === 0) return;

    const totalTimeMs = Date.now() - (this.stats.startTime?.getTime() ?? Date.now());
    this.syncStats.averageTransferSpeed = Math.round(
      (this.syncStats.totalBytesTransferred / totalTimeMs) * 1000
    );
  }

  private setupEventListeners(): void {
    this.eventEmitter.on('operation_started', (operation: SyncOperation) => {
      this.components.notificationManager?.notify(
        NotificationType.SYNC_STARTED,
        `Started ${operation.type} sync operation`,
        {
          level: NotificationLevel.INFO,
          source: 'sync-service',
          data: { operationId: operation.id },
        }
      );
    });

    this.eventEmitter.on('operation_completed', (operation: SyncOperation, result: SyncResult) => {
      this.components.notificationManager?.notify(
        NotificationType.SYNC_COMPLETED,
        `Completed ${operation.type} sync: ${result.itemsProcessed} items processed`,
        {
          level: NotificationLevel.INFO,
          source: 'sync-service',
          data: { operationId: operation.id, result },
        }
      );
    });

    this.eventEmitter.on('operation_failed', (operation: SyncOperation, error: Error) => {
      this.components.notificationManager?.notify(
        NotificationType.SYNC_FAILED,
        `Failed ${operation.type} sync: ${error.message}`,
        {
          level: NotificationLevel.ERROR,
          source: 'sync-service',
          error,
          data: { operationId: operation.id },
        }
      );
    });
  }

  // Public API methods
  public getActiveOperations(): SyncOperation[] {
    return Array.from(this.activeOperations.values());
  }

  public getOperation(operationId: string): SyncOperation | undefined {
    return this.activeOperations.get(operationId);
  }

  public getSyncStats(): SyncStats {
    const uptime = this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0;
    return { ...this.syncStats, uptime };
  }

  public async getHealthStatus(): Promise<ComponentStatus> {
    // Use healthCheck method from BaseService
    await this.healthCheck();

    const activeOpsCount = this.activeOperations.size;
    const failureRate =
      this.syncStats.totalOperations > 0
        ? this.syncStats.failedOperations / this.syncStats.totalOperations
        : 0;

    if (failureRate > 0.5) {
      return ComponentStatus.DOWN;
    } else if (failureRate > 0.2 || activeOpsCount > 10) {
      return ComponentStatus.DEGRADED;
    }

    return ComponentStatus.UP;
  }
}
