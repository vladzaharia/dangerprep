#!/usr/bin/env node

import { StandardizedCli, CliOutput, StandardizedSyncService } from '@dangerprep/sync';

import { OfflineSync } from './engine';
import { OfflineSyncConfig } from './types';

// Create a service factory function for the CLI
const createOfflineSyncService = (configPath?: string): OfflineSync => {
  return new OfflineSync(configPath);
};

// Create CLI configuration
const cliConfig = {
  serviceName: 'offline-sync',
  version: '1.0.0',
  description: 'DangerPrep Offline Sync CLI',
  defaultConfigPath: '/app/data/config.yaml',
  supportsDaemon: true,
  supportsManualOperations: true,
  customCommands: [
    {
      name: 'devices',
      description: 'List detected devices',
      action: async (
        _args: unknown[],
        _options: unknown,
        service: StandardizedSyncService<OfflineSyncConfig>
      ) => {
        const offlineSync = service as OfflineSync;
        const devices = offlineSync.getDetectedDevices();

        CliOutput.info('=== Detected Devices ===');

        if (devices.length === 0) {
          CliOutput.info('No devices detected');
          return;
        }

        devices.forEach((device, index) => {
          CliOutput.info(`\nDevice ${index + 1}:`);
          CliOutput.info(`  Path: ${device.devicePath}`);
          CliOutput.info(`  Mounted: ${device.isMounted ? 'Yes' : 'No'}`);
          if (device.mountPath) {
            CliOutput.info(`  Mount Path: ${device.mountPath}`);
          }
          CliOutput.info(`  File System: ${device.fileSystem ?? 'Unknown'}`);
          CliOutput.info(`  Vendor ID: 0x${device.deviceInfo.vendorId.toString(16)}`);
          CliOutput.info(`  Product ID: 0x${device.deviceInfo.productId.toString(16)}`);
          if (device.deviceInfo.manufacturer) {
            CliOutput.info(`  Manufacturer: ${device.deviceInfo.manufacturer}`);
          }
          if (device.deviceInfo.product) {
            CliOutput.info(`  Product: ${device.deviceInfo.product}`);
          }
        });
      },
    },
    {
      name: 'sync',
      description: 'Manually trigger sync for a device',
      arguments: [{ name: 'device-path', description: 'Device path to sync', required: true }],
      action: async (
        args: unknown[],
        _options: unknown,
        service: StandardizedSyncService<OfflineSyncConfig>
      ) => {
        const devicePath = args[0] as string;
        const offlineSync = service as OfflineSync;
        const operationId = await offlineSync.triggerSync(devicePath);

        if (operationId) {
          CliOutput.success(`Sync started with operation ID: ${operationId}`);
        } else {
          CliOutput.error('Failed to start sync operation');
          process.exit(1);
        }
      },
    },
  ],
};

// Create and run the CLI
const cli = new StandardizedCli<OfflineSync>(cliConfig, createOfflineSyncService);

// Parse command line arguments and execute
cli.execute(process.argv).catch(error => {
  CliOutput.error(
    `CLI execution failed: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
