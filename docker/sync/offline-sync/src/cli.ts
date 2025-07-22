#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs-extra';

import { ConfigManager } from './config-manager';
import { OfflineSync } from './offline-sync';

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
        process.stdout.write('Starting offline sync service in daemon mode...\n');
      }

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

      await service.start();

      if (!options.daemon) {
        console.log('Offline sync service started. Press Ctrl+C to stop.');
      }
    } catch (error) {
      console.error('Failed to start service:', error);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the offline sync service')
  .action(async () => {
    console.log('Stop command not implemented - use SIGTERM to stop running service');
  });

program
  .command('status')
  .description('Show service status')
  .option('-c, --config <path>', 'Configuration file path')
  .action(async options => {
    try {
      const service = new OfflineSync(options.config);
      const health = await service.healthCheck();
      const stats = service.getStats();

      console.log('=== Offline Sync Service Status ===');
      console.log(`Status: ${health.status}`);
      console.log(`Timestamp: ${health.timestamp.toISOString()}`);
      console.log(`Active Operations: ${health.activeOperations}`);
      console.log(`Connected Devices: ${health.connectedDevices}`);
      console.log(`Uptime: ${Math.floor(stats.uptime / 1000)}s`);

      if (health.errors.length > 0) {
        console.log('\nErrors:');
        health.errors.forEach(error => console.log(`  - ${error}`));
      }

      if (health.warnings.length > 0) {
        console.log('\nWarnings:');
        health.warnings.forEach(warning => console.log(`  - ${warning}`));
      }

      console.log('\n=== Statistics ===');
      console.log(`Total Operations: ${stats.totalOperations}`);
      console.log(`Successful: ${stats.successfulOperations}`);
      console.log(`Failed: ${stats.failedOperations}`);
      console.log(`Files Transferred: ${stats.totalFilesTransferred}`);
      console.log(`Bytes Transferred: ${formatBytes(stats.totalBytesTransferred)}`);
    } catch (error) {
      console.error('Failed to get status:', error);
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

      console.log('=== Detected Devices ===');

      if (devices.length === 0) {
        console.log('No devices detected');
        return;
      }

      devices.forEach((device, index) => {
        console.log(`\nDevice ${index + 1}:`);
        console.log(`  Path: ${device.devicePath}`);
        console.log(`  Mounted: ${device.isMounted ? 'Yes' : 'No'}`);
        if (device.mountPath) {
          console.log(`  Mount Path: ${device.mountPath}`);
        }
        console.log(`  File System: ${device.fileSystem ?? 'Unknown'}`);
        console.log(`  Vendor ID: 0x${device.deviceInfo.vendorId.toString(16)}`);
        console.log(`  Product ID: 0x${device.deviceInfo.productId.toString(16)}`);
        if (device.deviceInfo.manufacturer) {
          console.log(`  Manufacturer: ${device.deviceInfo.manufacturer}`);
        }
        if (device.deviceInfo.product) {
          console.log(`  Product: ${device.deviceInfo.product}`);
        }
        if (device.deviceInfo.size) {
          console.log(`  Size: ${formatBytes(device.deviceInfo.size)}`);
        }
      });
    } catch (error) {
      console.error('Failed to list devices:', error);
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
        console.log(`Sync started with operation ID: ${operationId}`);
      } else {
        console.log('Failed to start sync operation');
      }
    } catch (error) {
      console.error('Failed to trigger sync:', error);
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
        console.log('Default configuration created');
        return;
      }

      if (options.validate) {
        await configManager.loadConfig();
        console.log('Configuration is valid');
        return;
      }

      if (options.show) {
        const config = await configManager.loadConfig();
        console.log('=== Current Configuration ===');
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      console.log('Please specify an action: --create-default, --validate, or --show');
    } catch (error) {
      console.error('Configuration error:', error);
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
        console.log('Log file not found');
        return;
      }

      const content = await fs.readFile(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      const recentLines = lines.slice(-parseInt(options.lines));

      console.log('=== Recent Log Entries ===');
      recentLines.forEach(line => console.log(line));
    } catch (error) {
      console.error('Failed to read logs:', error);
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
