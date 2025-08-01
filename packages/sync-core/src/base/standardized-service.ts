/**
 * Standardized service architecture for DangerPrep sync services
 */

import { EventEmitter } from 'events';

import { ConfigManager } from '@dangerprep/configuration';
import { ComponentStatus } from '@dangerprep/health';
import { Logger } from '@dangerprep/logging';
import { NotificationManager } from '@dangerprep/notifications';
import {
  BaseService,
  ServiceConfig,
  ServiceUtils,
  ServiceInitializationResult,
  ServiceShutdownResult,
  ServiceRegistry,
  ServiceRegistration,
  ServiceCapability,
  ServiceDependency,
} from '@dangerprep/service';
import {
  SyncOperationResult,
  SyncErrorDetails,
  ProgressUpdate,
  ProgressStatus,
} from '@dangerprep/types';

import { SyncErrorFactory } from '../error/factory.js';
import { StandardSyncErrorHandler } from '../error/handler.js';
import { SyncProgressManager } from '../progress/manager.js';
import { SyncProgressTracker } from '../progress/tracker.js';

// Standardized service configuration interface
export interface StandardizedServiceConfig {
  service_name: string;
  version: string;
  enabled: boolean;
  log_level: string;
  data_directory: string;
  temp_directory?: string;
  max_concurrent_operations: number;
  operation_timeout_minutes: number;
  health_check_interval_minutes: number;
  enable_notifications: boolean;
  enable_progress_tracking: boolean;
  enable_auto_recovery: boolean;
  metadata?: Record<string, unknown>;
}

// Enhanced service lifecycle hooks for sync services
export interface ServiceLifecycleHooks {
  beforeInitialize?: () => Promise<void>;
  afterInitialize?: () => Promise<void>;
  beforeStart?: () => Promise<void>;
  afterStart?: () => Promise<void>;
  beforeStop?: () => Promise<void>;
  afterStop?: () => Promise<void>;
  onError?: (error: SyncErrorDetails) => Promise<void>;
  onProgress?: (update: ProgressUpdate) => Promise<void>;
  onHealthChange?: (status: ComponentStatus) => Promise<void>;
  onServiceRegistered?: (registration: ServiceRegistration) => Promise<void>;
  onServiceDeregistered?: (serviceId: string) => Promise<void>;
  onOperationStart?: (context: ServiceOperationContext) => Promise<void>;
  onOperationComplete?: (
    context: ServiceOperationContext,
    result: SyncOperationResult<unknown>
  ) => Promise<void>;
}

// Service operation context
export interface ServiceOperationContext {
  operationId: string;
  operationType: string;
  startTime: Date;
  metadata?: Record<string, unknown>;
}

// Service statistics
export interface ServiceStatistics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  activeOperations: number;
  averageOperationTime: number;
  uptime: number;
  lastOperationTime?: Date;
  errorRate: number;
}

/**
 * Standardized base class for all DangerPrep sync services
 */
export abstract class StandardizedSyncService<
  TConfig extends StandardizedServiceConfig,
> extends BaseService {
  protected readonly configManager: ConfigManager<TConfig>;
  protected readonly progressManager: SyncProgressManager;
  protected readonly errorHandler: StandardSyncErrorHandler;
  protected readonly serviceRegistry: ServiceRegistry;
  protected readonly eventEmitter = new EventEmitter();
  protected readonly serviceName: string;
  protected readonly serviceVersion: string;

  protected readonly activeOperations = new Map<string, ServiceOperationContext>();
  protected readonly operationTrackers = new Map<string, SyncProgressTracker>();

  private readonly statistics: ServiceStatistics = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    activeOperations: 0,
    averageOperationTime: 0,
    uptime: 0,
    errorRate: 0,
  };

  private readonly startTime = new Date();
  private readonly lifecycleHooks: ServiceLifecycleHooks;

  constructor(
    serviceName: string,
    version: string,
    configPath: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    configSchema: any,
    hooks: ServiceLifecycleHooks = {},
    additionalServiceConfig: Partial<ServiceConfig> = {}
  ) {
    // Create standardized service configuration
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

    this.serviceName = serviceName;
    this.serviceVersion = version;
    this.lifecycleHooks = hooks;
    this.configManager = new ConfigManager<TConfig>(configPath, configSchema);

    // Initialize service registry
    this.serviceRegistry = new ServiceRegistry(
      this.components.logger,
      this.components.notificationManager,
      {
        enableHealthMonitoring: true,
        enableEventNotifications: true,
        healthCheckIntervalMs: 30000, // 30 seconds
        autoCleanupOfflineServices: true,
        offlineTimeoutMs: 120000, // 2 minutes
      }
    );

    // Initialize progress manager
    this.progressManager = new SyncProgressManager(
      {
        serviceName,
        enableNotifications: true,
        enableLogging: true,
        cleanupDelayMs: 30000,
        maxActiveTrackers: 10,
        globalUpdateInterval: 1000,
      },
      this.components.logger,
      this.components.notificationManager
    );

    // Initialize error handler
    this.errorHandler = new StandardSyncErrorHandler(
      {
        serviceName,
        enableRetry: true,
        enableNotifications: true,
        enableLogging: true,
        onError: async (error: SyncErrorDetails) => {
          if (this.lifecycleHooks.onError) {
            await this.lifecycleHooks.onError(error);
          }
        },
      },
      this.components.logger,
      this.components.notificationManager
    );

    // Set up global progress listener
    this.progressManager.addGlobalListener(async (update: ProgressUpdate) => {
      this.eventEmitter.emit('progress', update);
      if (this.lifecycleHooks.onProgress) {
        await this.lifecycleHooks.onProgress(update);
      }
    });
  }

  /**
   * Initialize the service with standardized lifecycle
   */
  public override async initialize(): Promise<ServiceInitializationResult> {
    const startTime = Date.now();

    try {
      // Execute before initialize hook
      if (this.lifecycleHooks.beforeInitialize) {
        await this.lifecycleHooks.beforeInitialize();
      }

      // Initialize base service
      const baseResult = await super.initialize();
      if (!baseResult.success) {
        return baseResult;
      }

      // Load configuration
      await this.configManager.loadConfig();
      const config = this.configManager.getConfig();

      // Validate service-specific configuration
      await this.validateServiceConfiguration(config);

      // Initialize service-specific components
      await this.initializeServiceSpecificComponents(config);

      // Execute after initialize hook
      if (this.lifecycleHooks.afterInitialize) {
        await this.lifecycleHooks.afterInitialize();
      }

      this.components.logger.info(`${this.constructor.name} initialized successfully`);

      const duration = Date.now() - startTime;
      return { success: true, duration };
    } catch (error) {
      const syncError = SyncErrorFactory.createConfigurationError(
        `Service initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          serviceName: this.serviceName,
          timestamp: new Date(),
          operationType: 'initialize',
        },
        error instanceof Error ? { cause: error } : {}
      );

      await this.errorHandler.handleError(syncError);

      const duration = Date.now() - startTime;
      return {
        success: false,
        error: syncError.cause || new Error(syncError.message),
        duration,
      };
    }
  }

  /**
   * Start the service with standardized lifecycle
   */
  public override async start(): Promise<void> {
    try {
      // Execute before start hook
      if (this.lifecycleHooks.beforeStart) {
        await this.lifecycleHooks.beforeStart();
      }

      // Start base service
      await super.start();

      // Start service-specific functionality
      await this.startServiceComponents();

      // Register service with registry
      await this.registerWithServiceRegistry();

      // Execute after start hook
      if (this.lifecycleHooks.afterStart) {
        await this.lifecycleHooks.afterStart();
      }

      this.components.logger.info(`${this.constructor.name} started successfully`);
    } catch (error) {
      const syncError = SyncErrorFactory.createConfigurationError(
        `Service start failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          serviceName: this.serviceName,
          timestamp: new Date(),
          operationType: 'start',
        },
        error instanceof Error ? { cause: error } : {}
      );

      await this.errorHandler.handleError(syncError);
      throw error;
    }
  }

  /**
   * Stop the service with standardized lifecycle
   */
  public override async stop(): Promise<ServiceShutdownResult> {
    try {
      // Execute before stop hook
      if (this.lifecycleHooks.beforeStop) {
        await this.lifecycleHooks.beforeStop();
      }

      // Cancel all active operations
      await this.cancelAllOperations();

      // Deregister service from registry
      await this.deregisterFromServiceRegistry();

      // Stop service-specific functionality
      await this.stopServiceComponents();

      // Stop base service
      await super.stop();

      // Execute after stop hook
      if (this.lifecycleHooks.afterStop) {
        await this.lifecycleHooks.afterStop();
      }

      this.components.logger.info(`${this.constructor.name} stopped successfully`);
      return { success: true, duration: 0, graceful: true };
    } catch (error) {
      this.components.logger.error(`Error stopping ${this.constructor.name}:`, error);
      return {
        success: false,
        duration: 0,
        graceful: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Get service statistics
   */
  public getStatistics(): ServiceStatistics {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const errorRate =
      this.statistics.totalOperations > 0
        ? this.statistics.failedOperations / this.statistics.totalOperations
        : 0;

    return {
      ...this.statistics,
      uptime,
      errorRate,
    };
  }

  /**
   * Get service health status
   */
  public async getHealthStatus(): Promise<ComponentStatus> {
    const stats = this.getStatistics();

    // Check error rate
    if (stats.errorRate > 0.5) {
      return ComponentStatus.DOWN;
    } else if (stats.errorRate > 0.2 || stats.activeOperations > 10) {
      return ComponentStatus.DEGRADED;
    }

    return ComponentStatus.UP;
  }

  private async cancelAllOperations(): Promise<void> {
    const cancelPromises = Array.from(this.operationTrackers.values()).map(tracker => {
      if (tracker.status === ProgressStatus.IN_PROGRESS) {
        tracker.cancel();
      }
    });

    await Promise.all(cancelPromises);
  }

  private updateOperationStatistics(context: ServiceOperationContext): void {
    const duration = Date.now() - context.startTime.getTime();

    if (this.statistics.totalOperations === 1) {
      this.statistics.averageOperationTime = duration;
    } else {
      this.statistics.averageOperationTime =
        (this.statistics.averageOperationTime * (this.statistics.totalOperations - 1) + duration) /
        this.statistics.totalOperations;
    }

    this.statistics.lastOperationTime = new Date();
  }

  // Base service component initialization - can be overridden
  protected override async initializeServiceComponents(): Promise<void> {
    // Base implementation - can be overridden by subclasses
  }

  // Abstract methods that must be implemented by concrete services
  protected abstract validateServiceConfiguration(config: TConfig): Promise<void>;
  protected abstract initializeServiceSpecificComponents(config: TConfig): Promise<void>;
  protected abstract startServiceComponents(): Promise<void>;
  protected abstract stopServiceComponents(): Promise<void>;

  // Getters for protected components
  protected getConfig(): TConfig {
    return this.configManager.getConfig();
  }

  protected getLogger(): Logger {
    return this.components.logger;
  }

  protected getNotificationManager(): NotificationManager | undefined {
    return this.components.notificationManager;
  }

  protected getProgressManager(): SyncProgressManager {
    return this.progressManager;
  }

  protected getErrorHandler(): StandardSyncErrorHandler {
    return this.errorHandler;
  }

  protected getServiceRegistry(): ServiceRegistry {
    return this.serviceRegistry;
  }

  /**
   * Register this service with the service registry
   */
  private async registerWithServiceRegistry(): Promise<void> {
    const config = this.configManager.getConfig();
    const capabilities = await this.getServiceCapabilities();
    const dependencies = await this.getServiceDependencies();

    const registration: ServiceRegistration = {
      serviceId: `${this.serviceName}-${Date.now()}`,
      serviceName: this.serviceName,
      serviceType: 'sync-service',
      version: this.serviceVersion,
      endpoint: {
        host: 'localhost',
        port: parseInt(process.env.PORT || '3000', 10),
        protocol: 'http' as const,
      },
      metadata: {
        configPath: this.configManager.getConfigPath(),
        dataDirectory: config.data_directory,
        enabledFeatures: {
          notifications: config.enable_notifications,
          progressTracking: config.enable_progress_tracking,
          autoRecovery: config.enable_auto_recovery,
        },
      },
      capabilities,
      dependencies,
      registeredAt: new Date(),
      lastSeen: new Date(),
    };

    await this.serviceRegistry.registerService(registration);
    this.components.logger.info(`Service ${this.serviceName} registered with service registry`);

    // Trigger service registered hook
    if (this.lifecycleHooks.onServiceRegistered) {
      await this.lifecycleHooks.onServiceRegistered(registration);
    }
  }

  /**
   * Deregister this service from the service registry
   */
  private async deregisterFromServiceRegistry(): Promise<void> {
    const services = this.serviceRegistry.findServices({ serviceName: this.serviceName });

    for (const service of services) {
      await this.serviceRegistry.deregisterService(service.serviceId);

      // Trigger service deregistered hook
      if (this.lifecycleHooks.onServiceDeregistered) {
        await this.lifecycleHooks.onServiceDeregistered(service.serviceId);
      }
    }

    this.components.logger.info(`Service ${this.serviceName} deregistered from service registry`);
  }

  /**
   * Get service capabilities - can be overridden by subclasses
   */
  protected async getServiceCapabilities(): Promise<ServiceCapability[]> {
    return [
      {
        name: 'sync',
        version: '1.0.0',
        description: 'Basic sync functionality',
      },
      {
        name: 'health-check',
        version: '1.0.0',
        description: 'Health monitoring',
      },
      {
        name: 'progress-tracking',
        version: '1.0.0',
        description: 'Operation progress tracking',
      },
    ];
  }

  /**
   * Get service dependencies - can be overridden by subclasses
   */
  protected async getServiceDependencies(): Promise<ServiceDependency[]> {
    return [];
  }

  /**
   * Enhanced lifecycle management methods
   */

  /**
   * Perform a graceful restart of the service
   */
  public override async restart(reason?: string): Promise<void> {
    this.components.logger.info(
      `Restarting service ${this.serviceName}${reason ? `: ${reason}` : ''}`
    );

    try {
      // Stop the service gracefully
      await this.stop();

      // Wait a brief moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start the service again
      await this.start();

      this.components.logger.info(`Service ${this.serviceName} restarted successfully`);
    } catch (error) {
      const syncError = SyncErrorFactory.createDeviceError(
        `Service restart failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          serviceName: this.serviceName,
          timestamp: new Date(),
          operationType: 'restart',
        },
        error instanceof Error ? { cause: error } : {}
      );

      await this.errorHandler.handleError(syncError);
      throw error;
    }
  }

  /**
   * Perform a health check and trigger recovery if needed
   */
  public async performHealthCheckAndRecover(): Promise<ComponentStatus> {
    const healthStatus = await this.getHealthStatus();

    // Trigger health change hook
    if (this.lifecycleHooks.onHealthChange) {
      await this.lifecycleHooks.onHealthChange(healthStatus);
    }

    // Auto-recovery for degraded services
    if (healthStatus === ComponentStatus.DEGRADED) {
      this.components.logger.warn(`Service ${this.serviceName} is degraded, attempting recovery`);

      try {
        await this.performServiceRecovery();
      } catch (error) {
        this.components.logger.error(`Service recovery failed for ${this.serviceName}:`, error);
      }
    }

    // Auto-restart for down services (if enabled)
    if (healthStatus === ComponentStatus.DOWN && this.getConfig().enable_auto_recovery) {
      this.components.logger.error(`Service ${this.serviceName} is down, attempting restart`);

      try {
        await this.restart('Health check detected service is down');
      } catch (error) {
        this.components.logger.error(`Service restart failed for ${this.serviceName}:`, error);
      }
    }

    return healthStatus;
  }

  /**
   * Perform service-specific recovery actions - can be overridden by subclasses
   */
  protected async performServiceRecovery(): Promise<void> {
    // Default recovery actions
    this.components.logger.info(`Performing default recovery for ${this.serviceName}`);

    // Cancel all active operations
    await this.cancelAllOperations();

    // Clear any cached data or reset internal state
    this.activeOperations.clear();
    this.operationTrackers.clear();

    // Reset statistics
    this.statistics.activeOperations = 0;

    this.components.logger.info(`Default recovery completed for ${this.serviceName}`);
  }

  /**
   * Get detailed service status including all components
   */
  public async getDetailedServiceStatus(): Promise<{
    serviceName: string;
    version: string;
    state: string;
    health: ComponentStatus;
    statistics: ServiceStatistics;
    activeOperations: number;
    registeredServices: number;
    uptime: number;
    lastError?: string;
  }> {
    const stats = this.getStatistics();
    const health = await this.getHealthStatus();
    const serviceStats = this.getStats();
    const registryStatus = await this.serviceRegistry.getStatus();
    const registeredServices = registryStatus.totalServices;

    const result: {
      serviceName: string;
      version: string;
      state: string;
      health: ComponentStatus;
      statistics: ServiceStatistics;
      activeOperations: number;
      registeredServices: number;
      uptime: number;
      lastError?: string;
    } = {
      serviceName: this.serviceName,
      version: this.serviceVersion,
      state: serviceStats.state,
      health,
      statistics: stats,
      activeOperations: this.activeOperations.size,
      registeredServices,
      uptime: stats.uptime,
    };

    if (serviceStats.lastError?.message) {
      result.lastError = serviceStats.lastError.message;
    }

    return result;
  }

  /**
   * Enhanced operation execution with lifecycle hooks
   */
  protected async executeOperation<T>(
    operationId: string,
    operationType: string,
    operation: (tracker: SyncProgressTracker) => Promise<T>,
    options: {
      totalItems?: number;
      totalBytes?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<SyncOperationResult<T>> {
    const context: ServiceOperationContext = {
      operationId,
      operationType,
      startTime: new Date(),
      ...(options.metadata && { metadata: options.metadata }),
    };

    // Trigger operation start hook
    if (this.lifecycleHooks.onOperationStart) {
      await this.lifecycleHooks.onOperationStart(context);
    }

    // Execute the operation using the existing implementation
    this.activeOperations.set(operationId, context);
    this.statistics.totalOperations++;
    this.statistics.activeOperations = this.activeOperations.size;

    // Create progress tracker
    const tracker = this.progressManager.createSyncTracker(
      operationId,
      operationType,
      options.totalItems || 0,
      options.totalBytes || 0
    );

    this.operationTrackers.set(operationId, tracker);
    tracker.start();

    try {
      const result = await this.errorHandler.executeWithErrorHandling(() => operation(tracker), {
        operationId,
        operationType,
        serviceName: this.serviceName,
        timestamp: new Date(),
        ...options.metadata,
      });

      tracker.complete();
      this.statistics.successfulOperations++;
      this.updateOperationStatistics(context);

      const operationResult: SyncOperationResult<T> = {
        success: true,
        data: result,
        metadata: {
          operationId,
          operationType,
          duration: Date.now() - context.startTime.getTime(),
        },
      };

      // Trigger operation complete hook
      if (this.lifecycleHooks.onOperationComplete) {
        await this.lifecycleHooks.onOperationComplete(context, operationResult);
      }

      return operationResult;
    } catch (error) {
      tracker.fail(error instanceof Error ? error.message : String(error));
      this.statistics.failedOperations++;
      this.updateOperationStatistics(context);

      const syncError =
        error instanceof Error
          ? SyncErrorFactory.createTransferError(
              error.message,
              {
                serviceName: this.serviceName,
                operationId,
                operationType,
                timestamp: new Date(),
              },
              { cause: error }
            )
          : SyncErrorFactory.createTransferError(String(error), {
              serviceName: this.serviceName,
              operationId,
              operationType,
              timestamp: new Date(),
            });

      const operationResult: SyncOperationResult<T> = {
        success: false,
        error: syncError,
        metadata: {
          operationId,
          operationType,
          duration: Date.now() - context.startTime.getTime(),
        },
      };

      // Trigger operation complete hook
      if (this.lifecycleHooks.onOperationComplete) {
        await this.lifecycleHooks.onOperationComplete(context, operationResult);
      }

      return operationResult;
    } finally {
      this.activeOperations.delete(operationId);
      this.operationTrackers.delete(operationId);
      this.statistics.activeOperations = this.activeOperations.size;
    }
  }
}
