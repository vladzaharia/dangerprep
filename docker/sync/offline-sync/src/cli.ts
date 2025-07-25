#!/usr/bin/env node

import { LoggerFactory } from '@dangerprep/logging';
import { Command } from 'commander';
import * as fs from 'fs-extra';

import { ConfigManager } from './config';
import { OfflineSync } from './engine';

// Create a CLI logger for all output
const cliLogger = LoggerFactory.createConsoleLogger('CLI');

const program = new Command();

program.name('offline-sync-cli').description('DangerPrep Offline Sync CLI').version('1.0.0');

program
  .command('start')
  .description('Start the offline sync service')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-d, --daemon', 'Run as daemon')
  .action(async options => {
    try {
      const service = new OfflineSync(options.config);

      if (options.daemon) {
        // Detach from terminal for daemon mode
        cliLogger.info('Starting offline sync service in daemon mode...');
      }

      // Initialize and start the service using BaseService pattern
      const initResult = await service.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      await service.start();

      if (!options.daemon) {
        cliLogger.info('Offline sync service started. Press Ctrl+C to stop.');
      }
    } catch (error) {
      cliLogger.error('Failed to start service:', error);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the offline sync service')
  .action(async () => {
    cliLogger.info('Stop command not implemented - use SIGTERM to stop running service');
  });

program
  .command('status')
  .description('Show service status')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async options => {
    try {
      const service = new OfflineSync(options.config);

      // Initialize the service to get health check
      const initResult = await service.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const health = await service.healthCheck();

      cliLogger.info('=== Offline Sync Service Status ===');
      cliLogger.info(`Status: ${health.status}`);
      cliLogger.info(`Timestamp: ${health.timestamp.toISOString()}`);
      cliLogger.info(`Service: ${health.service}`);
      cliLogger.info(`Components: ${health.components.length}`);
      if (health.uptime) {
        cliLogger.info(`Uptime: ${Math.floor(health.uptime / 1000)}s`);
      }
      cliLogger.info(`Duration: ${health.duration}ms`);

      if (health.errors.length > 0) {
        cliLogger.info('\nErrors:');
        health.errors.forEach(error => cliLogger.info(`  - ${error}`));
      }

      if (health.warnings.length > 0) {
        cliLogger.info('\nWarnings:');
        health.warnings.forEach(warning => cliLogger.info(`  - ${warning}`));
      }

      cliLogger.info('\n=== Statistics ===');
      const syncStats = service.getSyncStats();
      cliLogger.info(`Total Operations: ${syncStats.totalOperations}`);
      cliLogger.info(`Successful: ${syncStats.successfulOperations}`);
      cliLogger.info(`Failed: ${syncStats.failedOperations}`);
      cliLogger.info(`Files Transferred: ${syncStats.totalFilesTransferred}`);
      cliLogger.info(`Bytes Transferred: ${formatBytes(syncStats.totalBytesTransferred)}`);
    } catch (error) {
      cliLogger.error('Failed to get status:', error);
      process.exit(1);
    }
  });

program
  .command('devices')
  .description('List detected devices')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async options => {
    try {
      const service = new OfflineSync(options.config);
      const devices = service.getDetectedDevices();

      cliLogger.info('=== Detected Devices ===');

      if (devices.length === 0) {
        cliLogger.info('No devices detected');
        return;
      }

      devices.forEach((device, index) => {
        cliLogger.info(`\nDevice ${index + 1}:`);
        cliLogger.info(`  Path: ${device.devicePath}`);
        cliLogger.info(`  Mounted: ${device.isMounted ? 'Yes' : 'No'}`);
        if (device.mountPath) {
          cliLogger.info(`  Mount Path: ${device.mountPath}`);
        }
        cliLogger.info(`  File System: ${device.fileSystem ?? 'Unknown'}`);
        cliLogger.info(`  Vendor ID: 0x${device.deviceInfo.vendorId.toString(16)}`);
        cliLogger.info(`  Product ID: 0x${device.deviceInfo.productId.toString(16)}`);
        if (device.deviceInfo.manufacturer) {
          cliLogger.info(`  Manufacturer: ${device.deviceInfo.manufacturer}`);
        }
        if (device.deviceInfo.product) {
          cliLogger.info(`  Product: ${device.deviceInfo.product}`);
        }
        if (device.deviceInfo.size) {
          cliLogger.info(`  Size: ${formatBytes(device.deviceInfo.size)}`);
        }
      });
    } catch (error) {
      cliLogger.error('Failed to list devices:', error);
      process.exit(1);
    }
  });

program
  .command('sync')
  .description('Manually trigger sync for a device')
  .argument('<device-path>', 'Device path to sync')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async (devicePath, options) => {
    try {
      const service = new OfflineSync(options.config);
      const operationId = await service.triggerSync(devicePath);

      if (operationId) {
        cliLogger.info(`Sync started with operation ID: ${operationId}`);
      } else {
        cliLogger.info('Failed to start sync operation');
      }
    } catch (error) {
      cliLogger.error('Failed to trigger sync:', error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Configuration management')
  .option('-c, --config <path>', 'Configuration file path')
  .option('--create-default', 'Create default configuration file')
  .option('--validate', 'Validate configuration file')
  .option('--show', 'Show current configuration')
  .action(async options => {
    try {
      const configManager = new ConfigManager(options.config);

      if (options.createDefault) {
        await configManager.createDefaultConfig();
        cliLogger.info('Default configuration created');
        return;
      }

      if (options.validate) {
        await configManager.loadConfig();
        cliLogger.info('Configuration is valid');
        return;
      }

      if (options.show) {
        const config = await configManager.loadConfig();
        cliLogger.info('=== Current Configuration ===');
        cliLogger.info(JSON.stringify(config, null, 2));
        return;
      }

      cliLogger.info('Please specify an action: --create-default, --validate, or --show');
    } catch (error) {
      cliLogger.error('Configuration error:', error);
      process.exit(1);
    }
  });

program
  .command('logs')
  .description('Show recent log entries')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-n, --lines <number>', 'Number of lines to show', '50')
  .action(async options => {
    try {
      const configManager = new ConfigManager(options.config);
      const config = await configManager.loadConfig();
      const logFile = config.offline_sync.logging.file;

      if (!(await fs.pathExists(logFile))) {
        cliLogger.info('Log file not found');
        return;
      }

      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      const recentLines = lines.slice(-parseInt(options.lines));

      cliLogger.info('=== Recent Log Entries ===');
      recentLines.forEach(line => cliLogger.info(line));
    } catch (error) {
      cliLogger.error('Failed to read logs:', error);
      process.exit(1);
    }
  });

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Parse command line arguments
program.parse();
