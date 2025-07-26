import { EventEmitter } from 'events';

import { ConfigManager } from '@dangerprep/configuration';
import { HealthUtils } from '@dangerprep/health';
import { LoggerFactory } from '@dangerprep/logging';
import { NotificationManager as NotificationManagerImpl } from '@dangerprep/notifications';
import type { ZodType } from 'zod';

import { ServiceProgressManager } from './progress-manager.js';
import { ServiceRecoveryManager } from './recovery-manager.js';
import { ServiceScheduler } from './scheduler.js';
import {
  ServiceState,
  ServiceConfig,
  ServiceStats,
  ServiceLifecycleHooks,
  ServiceComponents,
  ServiceInitializationResult,
  ServiceShutdownResult,
  ServiceInitializationError,
  ServiceStartupError,
  ServiceShutdownError,
  ServiceLoggingConfig,
} from './types.js';

/**
 * Base service class providing standardized service lifecycle management
 */
export abstract class BaseService extends EventEmitter {
  protected config: ServiceConfig;
  protected components!: ServiceComponents;
  protected stats: ServiceStats;
  protected hooks: ServiceLifecycleHooks;

  private state: ServiceState = ServiceState.STOPPED;
  private shutdownTimeout: NodeJS.Timeout | undefined;
  private signalHandlersRegistered = false;

  constructor(config: ServiceConfig, hooks: ServiceLifecycleHooks = {}) {
    super();

    this.config = {
      enablePeriodicHealthChecks: true,
      healthCheckIntervalMinutes: 5,
      handleProcessSignals: true,
      shutdownTimeoutMs: 30000,
      ...config,
    };

    this.hooks = hooks;

    this.stats = {
      uptime: 0,
      state: ServiceState.STOPPED,
      restartCount: 0,
    };

    this.initializeCoreComponents();
  }

  /**
   * Get current service state
   */
  getState(): ServiceState {
    return this.state;
  }

  /**
   * Get service statistics
   */
  getStats(): ServiceStats {
    if (this.stats.startTime) {
      this.stats.uptime = Date.now() - this.stats.startTime.getTime();
    }

    return { ...this.stats };
  }

  /**
   * Get service components
   */
  getComponents(): ServiceComponents {
    return this.components;
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.state === ServiceState.RUNNING;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<ServiceInitializationResult> {
    const startTime = Date.now();

    try {
      await this.changeState(ServiceState.STARTING);

      // Call before initialize hook
      if (this.hooks.beforeInitialize) {
        await this.hooks.beforeInitialize();
      }

      // Load configuration
      await this.loadConfiguration();

      // Setup logging
      await this.setupLogging();

      // Initialize service-specific components
      await this.initializeServiceComponents();

      // Setup health checks
      await this.setupHealthChecks();

      // Call after initialize hook
      if (this.hooks.afterInitialize) {
        await this.hooks.afterInitialize();
      }

      const duration = Date.now() - startTime;

      this.components.logger.info(
        `Service ${this.config.name} initialized successfully in ${duration}ms`
      );

      return {
        success: true,
        duration,
        details: {
          serviceName: this.config.name,
          version: this.config.version,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const serviceError = new ServiceInitializationError(
        this.config.name,
        `Failed to initialize service: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );

      await this.handleError(serviceError);

      return {
        success: false,
        error: serviceError,
        duration,
      };
    }
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    try {
      if (this.state === ServiceState.RUNNING) {
        throw new ServiceStartupError(this.config.name, 'Service is already running');
      }

      await this.changeState(ServiceState.STARTING);

      // Call before start hook
      if (this.hooks.beforeStart) {
        await this.hooks.beforeStart();
      }

      // Register signal handlers if enabled
      if (this.config.handleProcessSignals) {
        this.registerSignalHandlers();
      }

      // Start service-specific functionality
      await this.startService();

      // Start periodic health checks if enabled
      if (this.config.enablePeriodicHealthChecks && this.components.periodicHealthChecker) {
        this.components.periodicHealthChecker.start();
      }

      // Start scheduler if enabled
      if (this.config.enableScheduler && this.components.scheduler) {
        const startResult = await this.components.scheduler.start();
        if (!startResult.success) {
          throw new ServiceStartupError(
            this.config.name,
            `Failed to start scheduler: ${startResult.error?.message || 'Unknown error'}`
          );
        }
      }

      // Update stats
      this.stats.startTime = new Date();

      await this.changeState(ServiceState.RUNNING);

      // Send startup notification
      await this.components.notificationManager.serviceStarted(this.config.name);

      // Call after start hook
      if (this.hooks.afterStart) {
        await this.hooks.afterStart();
      }

      this.components.logger.info(`Service ${this.config.name} started successfully`);
      this.emit('started');
    } catch (error) {
      const serviceError = new ServiceStartupError(
        this.config.name,
        `Failed to start service: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );

      await this.handleError(serviceError);
      throw serviceError;
    }
  }

  /**
   * Stop the service
   */
  async stop(): Promise<ServiceShutdownResult> {
    const startTime = Date.now();
    let graceful = true;

    try {
      if (this.state === ServiceState.STOPPED) {
        return {
          success: true,
          duration: 0,
          graceful: true,
        };
      }

      await this.changeState(ServiceState.STOPPING);

      // Call before stop hook
      if (this.hooks.beforeStop) {
        await this.hooks.beforeStop();
      }

      // Set shutdown timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        this.shutdownTimeout = setTimeout(() => {
          graceful = false;
          reject(new Error(`Service shutdown timeout after ${this.config.shutdownTimeoutMs}ms`));
        }, this.config.shutdownTimeoutMs);
      });

      // Stop service-specific functionality
      const stopPromise = this.stopService();

      // Race between stop and timeout
      await Promise.race([stopPromise, timeoutPromise]);

      // Clear timeout if we got here
      if (this.shutdownTimeout) {
        clearTimeout(this.shutdownTimeout);
        this.shutdownTimeout = undefined;
      }

      // Stop periodic health checks
      if (this.components.periodicHealthChecker) {
        this.components.periodicHealthChecker.stop();
      }

      // Stop scheduler if enabled
      if (this.components.scheduler) {
        const stopResult = await this.components.scheduler.stop();
        if (!stopResult.success) {
          this.components.logger.warn(
            `Failed to stop scheduler gracefully: ${stopResult.error?.message || 'Unknown error'}`
          );
        }
      }

      // Destroy scheduler if enabled (final cleanup)
      if (this.components.scheduler) {
        const destroyResult = await this.components.scheduler.destroy();
        if (!destroyResult.success) {
          this.components.logger.warn(
            `Failed to destroy scheduler: ${destroyResult.error?.message || 'Unknown error'}`
          );
        }
      }

      // Cleanup progress manager if enabled
      if (this.components.progressManager) {
        try {
          await this.components.progressManager.cleanup();
        } catch (error) {
          this.components.logger.warn(
            `Failed to cleanup progress manager: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      // Cleanup recovery manager if enabled
      if (this.components.recoveryManager) {
        try {
          await this.components.recoveryManager.cleanup();
        } catch (error) {
          this.components.logger.warn(
            `Failed to cleanup recovery manager: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      // Unregister signal handlers
      if (this.signalHandlersRegistered) {
        this.unregisterSignalHandlers();
      }

      await this.changeState(ServiceState.STOPPED);

      // Send shutdown notification
      await this.components.notificationManager.serviceStopped(this.config.name);

      // Call after stop hook
      if (this.hooks.afterStop) {
        await this.hooks.afterStop();
      }

      const duration = Date.now() - startTime;

      this.components.logger.info(
        `Service ${this.config.name} stopped ${graceful ? 'gracefully' : 'forcefully'} in ${duration}ms`
      );
      this.emit('stopped');

      return {
        success: true,
        duration,
        graceful,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const serviceError = new ServiceShutdownError(
        this.config.name,
        `Failed to stop service: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );

      await this.handleError(serviceError);

      return {
        success: false,
        error: serviceError,
        duration,
        graceful,
      };
    }
  }

  /**
   * Restart the service
   */
  async restart(): Promise<void> {
    this.components.logger.info(`Restarting service ${this.config.name}...`);

    await this.stop();
    await this.start();

    this.stats.restartCount++;
    this.emit('restarted');
  }

  /**
   * Get service health status
   */
  async healthCheck() {
    return await this.components.healthChecker.check();
  }

  /**
   * Schedule a task using the service scheduler
   */
  scheduleTask(
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    options: import('./types.js').ServiceScheduleOptions = {}
  ) {
    if (!this.components.scheduler) {
      throw new Error(
        `Cannot schedule task ${taskId}: scheduler is not enabled for service ${this.config.name}`
      );
    }

    return this.components.scheduler.scheduleTask(taskId, schedule, taskFunction, options);
  }

  /**
   * Schedule a conditional task using the service scheduler
   */
  scheduleConditionalTask(
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    condition: () => Promise<boolean> | boolean,
    options: import('./types.js').ServiceScheduleOptions = {}
  ) {
    if (!this.components.scheduler) {
      throw new Error(
        `Cannot schedule conditional task ${taskId}: scheduler is not enabled for service ${this.config.name}`
      );
    }

    return this.components.scheduler.scheduleConditionalTask(
      taskId,
      schedule,
      taskFunction,
      condition,
      options
    );
  }

  /**
   * Schedule a maintenance task using the service scheduler
   */
  scheduleMaintenanceTask(
    taskId: string,
    schedule: string,
    taskFunction: () => Promise<void> | void,
    options: import('./types.js').ServiceScheduleOptions = {}
  ) {
    if (!this.components.scheduler) {
      throw new Error(
        `Cannot schedule maintenance task ${taskId}: scheduler is not enabled for service ${this.config.name}`
      );
    }

    return this.components.scheduler.scheduleMaintenanceTask(
      taskId,
      schedule,
      taskFunction,
      options
    );
  }

  /**
   * Remove a scheduled task
   */
  removeScheduledTask(taskId: string): boolean {
    if (!this.components.scheduler) {
      return false;
    }

    return this.components.scheduler.removeTask(taskId);
  }

  /**
   * Get scheduler status
   */
  getSchedulerStatus() {
    if (!this.components.scheduler) {
      return null;
    }

    return this.components.scheduler.getStatus();
  }

  /**
   * Create a progress tracker for service operations
   */
  createProgressTracker(
    operationId: string,
    operationName: string,
    options: Partial<import('@dangerprep/progress').ProgressConfig> = {}
  ) {
    if (!this.components.progressManager) {
      throw new Error(
        `Cannot create progress tracker: progress tracking is not enabled for service ${this.config.name}`
      );
    }

    return this.components.progressManager.createServiceTracker(
      operationId,
      operationName,
      options
    );
  }

  /**
   * Create a startup progress tracker
   */
  createStartupProgressTracker(operationName: string) {
    if (!this.components.progressManager) {
      throw new Error(
        `Cannot create startup progress tracker: progress tracking is not enabled for service ${this.config.name}`
      );
    }

    return this.components.progressManager.createStartupTracker(operationName);
  }

  /**
   * Create a shutdown progress tracker
   */
  createShutdownProgressTracker(operationName: string) {
    if (!this.components.progressManager) {
      throw new Error(
        `Cannot create shutdown progress tracker: progress tracking is not enabled for service ${this.config.name}`
      );
    }

    return this.components.progressManager.createShutdownTracker(operationName);
  }

  /**
   * Create a maintenance progress tracker
   */
  createMaintenanceProgressTracker(operationId: string, operationName: string) {
    if (!this.components.progressManager) {
      throw new Error(
        `Cannot create maintenance progress tracker: progress tracking is not enabled for service ${this.config.name}`
      );
    }

    return this.components.progressManager.createMaintenanceTracker(operationId, operationName);
  }

  /**
   * Get progress tracker by ID
   */
  getProgressTracker(operationId: string) {
    if (!this.components.progressManager) {
      return null;
    }

    return this.components.progressManager.getTrackerById(operationId);
  }

  /**
   * Get all active progress trackers
   */
  getActiveProgressTrackers() {
    if (!this.components.progressManager) {
      return [];
    }

    return this.components.progressManager.getActiveTrackers();
  }

  /**
   * Get progress manager status
   */
  getProgressStatus() {
    if (!this.components.progressManager) {
      return null;
    }

    return this.components.progressManager.getStatus();
  }

  /**
   * Handle service failure with automatic recovery
   */
  async handleServiceFailure(error: Error): Promise<boolean> {
    if (!this.components.recoveryManager) {
      this.components.logger.error(
        `Service failure occurred but recovery is not enabled: ${error.message}`
      );
      return false;
    }

    return await this.components.recoveryManager.handleServiceFailure(error, async () => {
      // Restart the service by calling the restart method
      await this.restart();
    });
  }

  /**
   * Enter graceful degradation mode
   */
  async enterGracefulDegradation(): Promise<void> {
    if (!this.components.recoveryManager) {
      throw new Error('Cannot enter graceful degradation: recovery is not enabled');
    }

    await this.components.recoveryManager.enterGracefulDegradation();
  }

  /**
   * Exit graceful degradation mode
   */
  async exitGracefulDegradation(): Promise<void> {
    if (!this.components.recoveryManager) {
      throw new Error('Cannot exit graceful degradation: recovery is not enabled');
    }

    await this.components.recoveryManager.exitGracefulDegradation();
  }

  /**
   * Check if service should operate in degraded mode
   */
  shouldOperateInDegradedMode(): boolean {
    if (!this.components.recoveryManager) {
      return false;
    }

    return this.components.recoveryManager.shouldOperateInDegradedMode();
  }

  /**
   * Get recovery state
   */
  getRecoveryState() {
    if (!this.components.recoveryManager) {
      return null;
    }

    return this.components.recoveryManager.getRecoveryState();
  }

  /**
   * Reset recovery state
   */
  resetRecoveryState(): void {
    if (!this.components.recoveryManager) {
      return;
    }

    this.components.recoveryManager.resetRecoveryState();
  }

  /**
   * Create logging configuration from common patterns
   */
  protected createLoggingConfig(options: {
    level?: string;
    logFile?: string;
    maxSize?: string;
    backupCount?: number;
    format?: 'text' | 'json';
    colors?: boolean;
  }): ServiceLoggingConfig {
    // Build the config object with all properties at once
    const config: ServiceLoggingConfig = {
      level: options.level || 'INFO',
      format: options.format || 'text',
      colors: options.colors !== false, // Default to true
      ...(options.logFile && { file: options.logFile }),
      ...(options.logFile && {
        maxSize: options.maxSize || '50MB',
        backupCount: options.backupCount || 5,
      }),
    };

    return config;
  }

  // Abstract methods that must be implemented by subclasses
  protected abstract loadConfiguration(): Promise<void>;
  protected abstract initializeServiceComponents(): Promise<void>;
  protected abstract startService(): Promise<void>;
  protected abstract stopService(): Promise<void>;

  // Optional methods that can be overridden by subclasses
  protected async setupLogging(): Promise<void> {
    // Enhanced default logging setup
    const loggingConfig = this.config.loggingConfig;

    if (loggingConfig) {
      // Create logger based on configuration
      let logger;

      if (loggingConfig.file) {
        // Create combined logger with file and console
        if (loggingConfig.format === 'json') {
          logger = LoggerFactory.createStructuredLogger(
            this.config.name,
            loggingConfig.file,
            loggingConfig.level || 'INFO'
          );
        } else {
          logger = LoggerFactory.createCombinedLogger(
            this.config.name,
            loggingConfig.file,
            loggingConfig.level || 'INFO'
          );
        }
      } else {
        // Console-only logger
        logger = LoggerFactory.createConsoleLogger(this.config.name, loggingConfig.level || 'INFO');
      }

      // Update the logger in components
      this.components.logger = logger;

      logger.info('Logging configured', {
        level: loggingConfig.level || 'INFO',
        file: loggingConfig.file || 'console-only',
        format: loggingConfig.format || 'text',
      });
    }
    // If no logging config provided, keep the default console logger
  }

  protected async setupHealthChecks(): Promise<void> {
    // Default implementation - can be overridden
  }

  // Utility methods for common patterns
  protected async loadConfigurationWithManager<T>(configManager: ConfigManager<T>): Promise<T> {
    try {
      return await configManager.loadConfig();
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  protected updateConfigManagerLogger<T>(configPath: string, schema: ZodType<T>): ConfigManager<T> {
    return new ConfigManager(configPath, schema, {
      logger: this.components.logger,
    });
  }

  // Private methods
  private initializeCoreComponents(): void {
    // Initialize with basic logger first
    const logger = LoggerFactory.createConsoleLogger(this.config.name);

    const notificationManager = new NotificationManagerImpl({}, logger);

    const healthChecker = HealthUtils.createServiceHealthChecker(
      this.config.name,
      this.config.version,
      () => this.isRunning(),
      logger,
      notificationManager
    );

    let periodicHealthChecker;
    if (this.config.enablePeriodicHealthChecks) {
      periodicHealthChecker = HealthUtils.createPeriodicHealthChecker(
        healthChecker,
        this.config.healthCheckIntervalMinutes,
        logger,
        notificationManager
      );
    }

    let scheduler;
    if (this.config.enableScheduler) {
      scheduler = new ServiceScheduler(
        this.config.name,
        logger,
        notificationManager,
        healthChecker,
        this.config.schedulerConfig
      );
    }

    let progressManager;
    if (this.config.enableProgressTracking) {
      progressManager = new ServiceProgressManager(
        this.config.name,
        logger,
        notificationManager,
        healthChecker,
        this.config.progressConfig
      );
    }

    let recoveryManager;
    if (this.config.enableAutoRecovery) {
      recoveryManager = new ServiceRecoveryManager(
        this.config.name,
        logger,
        notificationManager,
        healthChecker,
        this.config.recoveryConfig
      );
    }

    this.components = {
      logger,
      notificationManager,
      healthChecker,
      periodicHealthChecker,
      scheduler,
      progressManager,
      recoveryManager,
    };
  }

  private async changeState(newState: ServiceState): Promise<void> {
    const oldState = this.state;
    this.state = newState;
    this.stats.state = newState;

    // Call state change hook
    if (this.hooks.onStateChange) {
      await this.hooks.onStateChange(newState, oldState);
    }

    this.emit('stateChange', newState, oldState);
  }

  private async handleError(error: Error): Promise<void> {
    this.stats.lastError = error;
    await this.changeState(ServiceState.ERROR);

    // Send error notification
    await this.components.notificationManager.serviceError(this.config.name, error);

    // Call error hook
    if (this.hooks.onError) {
      await this.hooks.onError(error);
    }

    this.components.logger.error(`Service ${this.config.name} error:`, error);
    this.emit('error', error);
  }

  private registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) {
      return;
    }

    const gracefulShutdown = async (signal: string) => {
      this.components.logger.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        this.components.logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    this.signalHandlersRegistered = true;
  }

  private unregisterSignalHandlers(): void {
    if (!this.signalHandlersRegistered) {
      return;
    }

    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');

    this.signalHandlersRegistered = false;
  }
}
