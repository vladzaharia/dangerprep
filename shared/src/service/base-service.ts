import { EventEmitter } from 'events';

import type { ZodType, ZodTypeDef } from 'zod';

import { ConfigManager } from '../config/index.js';
import { HealthUtils } from '../health/index.js';
import { LoggerFactory } from '../logging/index.js';
import { NotificationManager as NotificationManagerImpl } from '../notifications/index.js';

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

    // Initialize core components
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
    // Update uptime
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

  // Abstract methods that must be implemented by subclasses
  protected abstract loadConfiguration(): Promise<void>;
  protected abstract initializeServiceComponents(): Promise<void>;
  protected abstract startService(): Promise<void>;
  protected abstract stopService(): Promise<void>;

  // Optional methods that can be overridden by subclasses
  protected async setupLogging(): Promise<void> {
    // Default implementation - can be overridden
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

  protected updateConfigManagerLogger<T>(
    configPath: string,
    schema: ZodType<T, ZodTypeDef, T>
  ): ConfigManager<T> {
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

    this.components = {
      logger,
      notificationManager,
      healthChecker,
      periodicHealthChecker,
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
