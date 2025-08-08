import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';

import { HealthChecker } from './checker.js';
import { PeriodicHealthChecker } from './periodic.js';
import type { HealthCheckResult, HealthStatus } from './types.js';
import { HealthUtils } from './utils.js';

/**
 * Comprehensive monitoring service that implements the documented health monitoring features:
 * - Service status checks every 10 minutes
 * - DNS resolution monitoring every 5 minutes
 * - Tailscale connectivity monitoring every 5 minutes
 * - Storage and temperature monitoring
 */
export class MonitoringService {
  private healthChecker: HealthChecker;
  private periodicChecker: PeriodicHealthChecker;
  private dnsMonitor?: PeriodicHealthChecker;
  private tailscaleMonitor?: PeriodicHealthChecker;
  private storageMonitor?: PeriodicHealthChecker;
  private temperatureMonitor?: PeriodicHealthChecker;
  private logger: Logger | undefined;
  private notificationManager: NotificationManager | undefined;

  constructor(
    serviceName: string,
    version: string,
    isRunning: () => boolean,
    options: {
      logger?: Logger;
      notificationManager?: NotificationManager;
      enableDnsMonitoring?: boolean;
      enableTailscaleMonitoring?: boolean;
      enableStorageMonitoring?: boolean;
      enableTemperatureMonitoring?: boolean;
    } = {}
  ) {
    this.logger = options.logger;
    this.notificationManager = options.notificationManager;

    // Create main health checker
    this.healthChecker = HealthUtils.createServiceHealthChecker(
      serviceName,
      version,
      isRunning,
      this.logger,
      this.notificationManager
    );

    // Create periodic checker for main service (every 10 minutes)
    this.periodicChecker = new PeriodicHealthChecker(
      this.healthChecker,
      {
        interval: 10 * 60 * 1000, // 10 minutes in milliseconds
        onHealthCheck: this.handleHealthCheckResult.bind(this),
        onStatusChange: this.handleStatusChange.bind(this),
      },
      this.logger,
      this.notificationManager
    );

    // Create specialized monitoring components
    if (options.enableDnsMonitoring !== false) {
      this.setupDnsMonitoring();
    }

    if (options.enableTailscaleMonitoring !== false) {
      this.setupTailscaleMonitoring();
    }

    if (options.enableStorageMonitoring !== false) {
      this.setupStorageMonitoring();
    }

    if (options.enableTemperatureMonitoring !== false) {
      this.setupTemperatureMonitoring();
    }
  }

  /**
   * Setup DNS resolution monitoring (every 5 minutes)
   */
  private setupDnsMonitoring(): void {
    const dnsComponent = HealthUtils.createDnsMonitoringComponent();

    const dnsHealthChecker = new HealthChecker({
      serviceName: 'dns-monitoring',
      version: '1.0.0',
    });

    dnsHealthChecker.registerComponent({
      name: dnsComponent.name,
      check: dnsComponent.check,
    });

    this.dnsMonitor = new PeriodicHealthChecker(
      dnsHealthChecker,
      {
        interval: 5 * 60 * 1000, // 5 minutes in milliseconds
        onHealthCheck: this.handleDnsCheckResult.bind(this),
        onStatusChange: this.handleDnsStatusChange.bind(this),
      },
      this.logger,
      this.notificationManager
    );
  }

  /**
   * Setup Tailscale connectivity monitoring (every 5 minutes)
   */
  private setupTailscaleMonitoring(): void {
    const tailscaleComponent = HealthUtils.createTailscaleMonitoringComponent();

    const tailscaleHealthChecker = new HealthChecker({
      serviceName: 'tailscale-monitoring',
      version: '1.0.0',
    });

    tailscaleHealthChecker.registerComponent({
      name: tailscaleComponent.name,
      check: tailscaleComponent.check,
    });

    this.tailscaleMonitor = new PeriodicHealthChecker(
      tailscaleHealthChecker,
      {
        interval: 5 * 60 * 1000, // 5 minutes in milliseconds
        onHealthCheck: this.handleTailscaleCheckResult.bind(this),
        onStatusChange: this.handleTailscaleStatusChange.bind(this),
      },
      this.logger,
      this.notificationManager
    );
  }

  /**
   * Setup storage monitoring (every 10 minutes)
   */
  private setupStorageMonitoring(): void {
    const storageComponent = HealthUtils.createStorageMonitoringComponent();

    const storageHealthChecker = new HealthChecker({
      serviceName: 'storage-monitoring',
      version: '1.0.0',
    });

    storageHealthChecker.registerComponent({
      name: storageComponent.name,
      check: storageComponent.check,
    });

    this.storageMonitor = new PeriodicHealthChecker(
      storageHealthChecker,
      {
        interval: 10 * 60 * 1000, // 10 minutes in milliseconds
        onHealthCheck: this.handleStorageCheckResult.bind(this),
        onStatusChange: this.handleStorageStatusChange.bind(this),
      },
      this.logger,
      this.notificationManager
    );
  }

  /**
   * Setup temperature monitoring (every 5 minutes)
   */
  private setupTemperatureMonitoring(): void {
    const temperatureComponent = HealthUtils.createTemperatureMonitoringComponent();

    const temperatureHealthChecker = new HealthChecker({
      serviceName: 'temperature-monitoring',
      version: '1.0.0',
    });

    temperatureHealthChecker.registerComponent({
      name: temperatureComponent.name,
      check: temperatureComponent.check,
    });

    this.temperatureMonitor = new PeriodicHealthChecker(
      temperatureHealthChecker,
      {
        interval: 5 * 60 * 1000, // 5 minutes in milliseconds
        onHealthCheck: this.handleTemperatureCheckResult.bind(this),
        onStatusChange: this.handleTemperatureStatusChange.bind(this),
      },
      this.logger,
      this.notificationManager
    );
  }

  /**
   * Start all monitoring services
   */
  start(): void {
    this.logger?.info('Starting comprehensive monitoring service...');

    // Start main service monitoring
    this.periodicChecker.start();

    // Start specialized monitoring
    if (this.dnsMonitor) {
      this.dnsMonitor.start();
      this.logger?.info('DNS monitoring started (5-minute intervals)');
    }

    if (this.tailscaleMonitor) {
      this.tailscaleMonitor.start();
      this.logger?.info('Tailscale monitoring started (5-minute intervals)');
    }

    if (this.storageMonitor) {
      this.storageMonitor.start();
      this.logger?.info('Storage monitoring started (10-minute intervals)');
    }

    if (this.temperatureMonitor) {
      this.temperatureMonitor.start();
      this.logger?.info('Temperature monitoring started (5-minute intervals)');
    }

    this.logger?.info('All monitoring services started successfully');
  }

  /**
   * Stop all monitoring services
   */
  stop(): void {
    this.logger?.info('Stopping monitoring services...');

    this.periodicChecker.stop();
    this.dnsMonitor?.stop();
    this.tailscaleMonitor?.stop();
    this.storageMonitor?.stop();
    this.temperatureMonitor?.stop();

    this.logger?.info('All monitoring services stopped');
  }

  /**
   * Get current health status from all monitors
   */
  async getOverallHealth(): Promise<{
    service: HealthCheckResult;
    dns?: HealthStatus;
    tailscale?: HealthStatus;
    storage?: HealthStatus;
    temperature?: HealthStatus;
  }> {
    const results: {
      service: HealthCheckResult;
      dns?: HealthStatus;
      tailscale?: HealthStatus;
      storage?: HealthStatus;
      temperature?: HealthStatus;
    } = {
      service: await this.healthChecker.check(),
    };

    if (this.dnsMonitor) {
      const status = this.dnsMonitor.getLastStatus();
      if (status !== undefined) {
        results.dns = status;
      }
    }

    if (this.tailscaleMonitor) {
      const status = this.tailscaleMonitor.getLastStatus();
      if (status !== undefined) {
        results.tailscale = status;
      }
    }

    if (this.storageMonitor) {
      const status = this.storageMonitor.getLastStatus();
      if (status !== undefined) {
        results.storage = status;
      }
    }

    if (this.temperatureMonitor) {
      const status = this.temperatureMonitor.getLastStatus();
      if (status !== undefined) {
        results.temperature = status;
      }
    }

    return results;
  }

  // Event handlers for different monitoring types
  private async handleHealthCheckResult(result: HealthCheckResult): Promise<void> {
    this.logger?.info('Service health check completed', { status: result.status });
  }

  private async handleStatusChange(
    oldStatus: HealthStatus,
    newStatus: HealthStatus
  ): Promise<void> {
    this.logger?.warn('Service status changed', { from: oldStatus, to: newStatus });
  }

  private async handleDnsCheckResult(result: HealthCheckResult): Promise<void> {
    this.logger?.debug('DNS monitoring check completed', { status: result.status });
  }

  private async handleDnsStatusChange(
    oldStatus: HealthStatus,
    newStatus: HealthStatus
  ): Promise<void> {
    this.logger?.warn('DNS status changed', { from: oldStatus, to: newStatus });
  }

  private async handleTailscaleCheckResult(result: HealthCheckResult): Promise<void> {
    this.logger?.debug('Tailscale monitoring check completed', { status: result.status });
  }

  private async handleTailscaleStatusChange(
    oldStatus: HealthStatus,
    newStatus: HealthStatus
  ): Promise<void> {
    this.logger?.warn('Tailscale status changed', { from: oldStatus, to: newStatus });
  }

  private async handleStorageCheckResult(result: HealthCheckResult): Promise<void> {
    this.logger?.debug('Storage monitoring check completed', { status: result.status });
  }

  private async handleStorageStatusChange(
    oldStatus: HealthStatus,
    newStatus: HealthStatus
  ): Promise<void> {
    this.logger?.warn('Storage status changed', { from: oldStatus, to: newStatus });
  }

  private async handleTemperatureCheckResult(result: HealthCheckResult): Promise<void> {
    this.logger?.debug('Temperature monitoring check completed', { status: result.status });
  }

  private async handleTemperatureStatusChange(
    oldStatus: HealthStatus,
    newStatus: HealthStatus
  ): Promise<void> {
    this.logger?.warn('Temperature status changed', { from: oldStatus, to: newStatus });
  }
}
