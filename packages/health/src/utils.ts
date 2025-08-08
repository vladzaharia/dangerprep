import type { Logger } from '@dangerprep/logging';
import type { NotificationManager } from '@dangerprep/notifications';

import { HealthChecker } from './checker.js';
import { PeriodicHealthChecker } from './periodic.js';
import type { HealthCheckConfig, PeriodicHealthCheckConfig } from './types.js';
import { ComponentStatus } from './types.js';

/**
 * Utility functions for creating and configuring health checkers
 */
export const HealthUtils = {
  /**
   * Create a basic health checker with common service checks
   */
  createServiceHealthChecker(
    serviceName: string,
    version: string,
    isRunning: () => boolean,
    logger?: Logger,
    notificationManager?: NotificationManager
  ): HealthChecker {
    const config: HealthCheckConfig = {
      serviceName,
      version,
      componentTimeout: 5000,
      overallTimeout: 30000,
      includeDetails: true,
    };

    const healthChecker = new HealthChecker(config, logger, notificationManager);

    // Register basic service check
    healthChecker.registerComponent(HealthChecker.createBasicServiceCheck(serviceName, isRunning));

    return healthChecker;
  },

  /**
   * Create a health checker with file system checks
   */
  createFileSystemHealthChecker(
    serviceName: string,
    version: string,
    paths: string[],
    isRunning: () => boolean,
    logger?: Logger,
    notificationManager?: NotificationManager
  ): HealthChecker {
    const healthChecker = this.createServiceHealthChecker(
      serviceName,
      version,
      isRunning,
      logger,
      notificationManager
    );

    // Register file system check
    healthChecker.registerComponent(HealthChecker.createFileSystemCheck('filesystem', paths, true));

    return healthChecker;
  },

  /**
   * Create a periodic health checker with default configuration
   */
  createPeriodicHealthChecker(
    healthChecker: HealthChecker,
    intervalMinutes: number = 5,
    logger?: Logger,
    notificationManager?: NotificationManager
  ): PeriodicHealthChecker {
    const config: PeriodicHealthCheckConfig = {
      interval: intervalMinutes * 60 * 1000, // Convert minutes to milliseconds
      logResults: true,
      logOnlyChanges: true,
      sendNotifications: true,
    };

    return new PeriodicHealthChecker(healthChecker, config, logger, notificationManager);
  },

  /**
   * Create a complete health monitoring setup
   */
  createHealthMonitoring(
    serviceName: string,
    version: string,
    isRunning: () => boolean,
    options: {
      paths?: string[];
      intervalMinutes?: number;
      logger?: Logger;
      notificationManager?: NotificationManager;
      autoStart?: boolean;
    } = {}
  ): {
    healthChecker: HealthChecker;
    periodicChecker: PeriodicHealthChecker;
  } {
    const {
      paths = [],
      intervalMinutes = 5,
      logger,
      notificationManager,
      autoStart = false,
    } = options;

    // Create health checker
    const healthChecker =
      paths.length > 0
        ? this.createFileSystemHealthChecker(
            serviceName,
            version,
            paths,
            isRunning,
            logger,
            notificationManager
          )
        : this.createServiceHealthChecker(
            serviceName,
            version,
            isRunning,
            logger,
            notificationManager
          );

    // Create periodic checker
    const periodicChecker = this.createPeriodicHealthChecker(
      healthChecker,
      intervalMinutes,
      logger,
      notificationManager
    );

    // Auto-start if requested
    if (autoStart) {
      periodicChecker.start();
    }

    return {
      healthChecker,
      periodicChecker,
    };
  },

  /**
   * Create DNS resolution monitoring component
   */
  createDnsMonitoringComponent(): {
    name: string;
    check: () => Promise<{ status: ComponentStatus; message?: string; error?: Error }>;
  } {
    return {
      name: 'dns-resolution',
      check: async () => {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          // Test DNS resolution for multiple domains
          const testDomains = ['8.8.8.8', 'cloudflare.com', 'google.com'];
          const results = await Promise.allSettled(
            testDomains.map(async domain => {
              const { stdout } = await execAsync(`nslookup ${domain}`, { timeout: 5000 });
              return stdout.includes('Address:') || stdout.includes('answer:');
            })
          );

          const successCount = results.filter(
            result => result.status === 'fulfilled' && result.value
          ).length;

          if (successCount === testDomains.length) {
            return {
              status: ComponentStatus.UP,
              message: `DNS resolution working (${successCount}/${testDomains.length} domains)`,
            };
          } else if (successCount > 0) {
            return {
              status: ComponentStatus.DEGRADED,
              message: `Partial DNS resolution (${successCount}/${testDomains.length} domains)`,
            };
          } else {
            return {
              status: ComponentStatus.DOWN,
              message: 'DNS resolution failed for all test domains',
            };
          }
        } catch (error) {
          return {
            status: ComponentStatus.DOWN,
            message: 'DNS monitoring check failed',
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      },
    };
  },

  /**
   * Create Tailscale connectivity monitoring component
   */
  createTailscaleMonitoringComponent(): {
    name: string;
    check: () => Promise<{ status: ComponentStatus; message?: string; error?: Error }>;
  } {
    return {
      name: 'tailscale-connectivity',
      check: async () => {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          // Check if Tailscale is installed
          try {
            await execAsync('which tailscale', { timeout: 2000 });
          } catch {
            return {
              status: ComponentStatus.DOWN,
              message: 'Tailscale not installed',
            };
          }

          // Check Tailscale status
          const { stdout } = await execAsync('tailscale status --json', { timeout: 5000 });
          const status = JSON.parse(stdout);

          if (status.BackendState === 'Running') {
            const peerCount = Object.keys(status.Peer || {}).length;
            return {
              status: ComponentStatus.UP,
              message: `Tailscale connected (${peerCount} peers)`,
            };
          } else if (status.BackendState === 'Starting') {
            return {
              status: ComponentStatus.DEGRADED,
              message: 'Tailscale starting up',
            };
          } else {
            return {
              status: ComponentStatus.DOWN,
              message: `Tailscale not connected (${status.BackendState})`,
            };
          }
        } catch (error) {
          return {
            status: ComponentStatus.DOWN,
            message: 'Tailscale monitoring check failed',
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      },
    };
  },

  /**
   * Create storage monitoring component
   */
  createStorageMonitoringComponent(): {
    name: string;
    check: () => Promise<{ status: ComponentStatus; message?: string; error?: Error }>;
  } {
    return {
      name: 'storage-health',
      check: async () => {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          // Check disk usage
          const { stdout: dfOutput } = await execAsync('df -h /', { timeout: 3000 });
          const usageMatch = dfOutput.match(/(\d+)%/);
          const usage = usageMatch ? parseInt(usageMatch[1] || '0') : 0;

          // Check SMART status if available
          let smartStatus = 'unknown';
          try {
            const { stdout: smartOutput } = await execAsync(
              'smartctl -H /dev/sda 2>/dev/null || smartctl -H /dev/nvme0n1 2>/dev/null',
              { timeout: 3000 }
            );
            smartStatus = smartOutput.includes('PASSED') ? 'healthy' : 'degraded';
          } catch {
            // SMART check failed, continue with disk usage only
          }

          if (usage > 90) {
            return {
              status: ComponentStatus.DOWN,
              message: `Critical disk usage: ${usage}%, SMART: ${smartStatus}`,
            };
          } else if (usage > 80 || smartStatus === 'degraded') {
            return {
              status: ComponentStatus.DEGRADED,
              message: `High disk usage: ${usage}%, SMART: ${smartStatus}`,
            };
          } else {
            return {
              status: ComponentStatus.UP,
              message: `Disk usage: ${usage}%, SMART: ${smartStatus}`,
            };
          }
        } catch (error) {
          return {
            status: ComponentStatus.DOWN,
            message: 'Storage monitoring check failed',
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      },
    };
  },

  /**
   * Create temperature monitoring component
   */
  createTemperatureMonitoringComponent(): {
    name: string;
    check: () => Promise<{ status: ComponentStatus; message?: string; error?: Error }>;
  } {
    return {
      name: 'temperature-monitoring',
      check: async () => {
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          let maxTemp = 0;
          const tempSources: string[] = [];

          // Check CPU temperature
          try {
            const { stdout } = await execAsync(
              'cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null',
              { timeout: 2000 }
            );
            const temps = stdout
              .split('\n')
              .filter(Boolean)
              .map(t => parseInt(t) / 1000);
            if (temps.length > 0) {
              const cpuTemp = Math.max(...temps);
              maxTemp = Math.max(maxTemp, cpuTemp);
              tempSources.push(`CPU: ${cpuTemp}°C`);
            }
          } catch {
            // CPU temp check failed
          }

          // Check disk temperature if available
          try {
            const { stdout } = await execAsync('hddtemp /dev/sda /dev/nvme0n1 2>/dev/null', {
              timeout: 2000,
            });
            const diskTempMatch = stdout.match(/(\d+)°C/);
            if (diskTempMatch) {
              const diskTemp = parseInt(diskTempMatch[1] || '0');
              maxTemp = Math.max(maxTemp, diskTemp);
              tempSources.push(`Disk: ${diskTemp}°C`);
            }
          } catch {
            // Disk temp check failed
          }

          if (maxTemp === 0) {
            return {
              status: ComponentStatus.DEGRADED,
              message: 'No temperature sensors available',
            };
          }

          if (maxTemp > 85) {
            return {
              status: ComponentStatus.DOWN,
              message: `Critical temperature: ${tempSources.join(', ')}`,
            };
          } else if (maxTemp > 75) {
            return {
              status: ComponentStatus.DEGRADED,
              message: `High temperature: ${tempSources.join(', ')}`,
            };
          } else {
            return {
              status: ComponentStatus.UP,
              message: `Temperature normal: ${tempSources.join(', ')}`,
            };
          }
        } catch (error) {
          return {
            status: ComponentStatus.DOWN,
            message: 'Temperature monitoring check failed',
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      },
    };
  },
};
