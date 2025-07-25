#!/usr/bin/env node

import { LoggerFactory } from '@dangerprep/logging';
import { Command } from 'commander';

import { KiwixManager } from './manager';

// Create a CLI logger for all output
const cliLogger = LoggerFactory.createConsoleLogger('CLI');

// Helper function to output structured data
const outputData = (data: unknown, asJson = false): void => {
  if (asJson) {
    cliLogger.info(JSON.stringify(data, null, 2));
  } else {
    cliLogger.info(String(data));
  }
};

// Helper function to output success messages
const outputSuccess = (message: string): void => {
  cliLogger.info(`✅ ${message}`);
};

// Helper function to output progress messages
const outputProgress = (message: string): void => {
  cliLogger.info(`🔄 ${message}`);
};

const program = new Command();

program.name('kiwix-cli').description('Kiwix Manager CLI').version('1.0.0');

program
  .command('list-available')
  .description('List available ZIM packages')
  .option('-f, --filter <filter>', 'Filter packages by name')
  .option('--json', 'Output as JSON')
  .action(async options => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');

      // Initialize the service
      const initResult = await manager.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const packages = await manager.listAvailablePackages();
      const filtered = options.filter
        ? packages.filter(pkg => pkg.name.toLowerCase().includes(options.filter.toLowerCase()))
        : packages;

      if (options.json) {
        outputData(filtered, true);
      } else {
        // For table output, we'll format it as structured text since logger doesn't support console.table
        cliLogger.info('\n📦 Available Packages:');
        filtered.forEach(pkg => {
          const title = pkg.title.substring(0, 50) + (pkg.title.length > 50 ? '...' : '');
          cliLogger.info(`   ${pkg.name} - ${title} (${pkg.size}) [${pkg.date}]`);
        });
        cliLogger.info(`\nTotal: ${filtered.length} packages`);
      }
    } catch (error) {
      cliLogger.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command('list-installed')
  .description('List installed ZIM packages')
  .option('--json', 'Output as JSON')
  .action(async options => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');

      // Initialize the service
      const initResult = await manager.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const packages = await manager.listInstalledPackages();

      if (options.json) {
        outputData(packages, true);
      } else {
        cliLogger.info('\n📦 Installed Packages:');
        packages.forEach(pkg => {
          const title = pkg.title.substring(0, 50) + (pkg.title.length > 50 ? '...' : '');
          const date = new Date(pkg.date).toLocaleDateString();
          cliLogger.info(`   ${pkg.name} - ${title} (${pkg.size}) [${date}]`);
        });
        cliLogger.info(`\nTotal: ${packages.length} packages installed`);
      }
    } catch (error) {
      cliLogger.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command('download <package>')
  .description('Download a ZIM package')
  .option('--force', 'Force download even if package exists')
  .action(async (packageName, _options) => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');

      // Initialize the service
      const initResult = await manager.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      outputProgress(`Downloading ${packageName}...`);
      const success = await manager.downloadPackage(packageName);

      if (success) {
        outputSuccess(`Successfully downloaded ${packageName}`);
      } else {
        cliLogger.error(`❌ Failed to download ${packageName}`);
        process.exit(1);
      }
    } catch (error) {
      cliLogger.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command('update-all')
  .description('Update all existing ZIM packages')
  .action(async () => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');

      // Initialize the service
      const initResult = await manager.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      outputProgress('Scanning and updating existing ZIM packages...');
      const success = await manager.updateAllZimPackages();

      if (success) {
        outputSuccess('Update completed successfully');
      } else {
        cliLogger.error('❌ Update failed');
        process.exit(1);
      }
    } catch (error) {
      cliLogger.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show update status for existing packages')
  .option('--json', 'Output as JSON')
  .action(async options => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');

      // Initialize the service
      const initResult = await manager.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const status = await manager.getUpdateStatus();

      if (options.json) {
        outputData(status, true);
      } else {
        if (status.length === 0) {
          cliLogger.info('No ZIM packages found in the directory');
        } else {
          cliLogger.info('\n📊 Update Status:');
          status.forEach(item => {
            const updateStatus = item.needsUpdate ? '🔄 Yes' : '✅ No';
            const lastChecked = item.lastChecked.toLocaleString();
            cliLogger.info(
              `   ${item.package} - Needs Update: ${updateStatus} (Last Checked: ${lastChecked})`
            );
          });
        }
      }
    } catch (error) {
      cliLogger.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show library statistics')
  .option('--json', 'Output as JSON')
  .action(async options => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');

      // Initialize the service
      const initResult = await manager.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const stats = await manager.getLibraryStats();

      if (options.json) {
        outputData(stats, true);
      } else {
        cliLogger.info('📊 Library Statistics:');
        cliLogger.info(`   Total Packages: ${stats.totalPackages}`);
        cliLogger.info(`   Total Size: ${stats.totalSize}`);
        cliLogger.info(
          `   Last Updated: ${stats.lastUpdated ? stats.lastUpdated.toLocaleString() : 'Never'}`
        );
      }
    } catch (error) {
      cliLogger.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check service health')
  .option('--json', 'Output as JSON')
  .action(async options => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');

      // Initialize the service
      const initResult = await manager.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const health = await manager.healthCheck();

      if (options.json) {
        outputData(health, true);
      } else {
        const statusIcon = health.status === 'healthy' ? '✅' : '❌';
        cliLogger.info(`${statusIcon} Service Status: ${health.status.toUpperCase()}`);
        cliLogger.info(`Service: ${health.service}`);
        cliLogger.info(`Timestamp: ${health.timestamp.toISOString()}`);
        cliLogger.info(`Components: ${health.components.length}`);
        cliLogger.info(`Duration: ${health.duration}ms`);

        if (health.errors.length > 0) {
          cliLogger.info('Errors:');
          health.errors.forEach(error => cliLogger.info(`   - ${error}`));
        }

        if (health.warnings.length > 0) {
          cliLogger.info('Warnings:');
          health.warnings.forEach(warning => cliLogger.info(`   - ${warning}`));
        }
      }

      if (health.status !== 'healthy') {
        process.exit(1);
      }
    } catch (error) {
      cliLogger.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command('search <query>')
  .description('Search available packages')
  .option('--json', 'Output as JSON')
  .action(async (query, options) => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');

      // Initialize the service
      const initResult = await manager.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const packages = await manager.listAvailablePackages();
      const filtered = packages.filter(
        pkg =>
          pkg.name.toLowerCase().includes(query.toLowerCase()) ||
          pkg.title.toLowerCase().includes(query.toLowerCase()) ||
          pkg.description.toLowerCase().includes(query.toLowerCase())
      );

      if (options.json) {
        outputData(filtered, true);
      } else {
        if (filtered.length === 0) {
          cliLogger.info(`No packages found matching "${query}"`);
        } else {
          cliLogger.info(`Found ${filtered.length} packages matching "${query}":`);
          filtered.forEach(pkg => {
            const title = pkg.title.substring(0, 50) + (pkg.title.length > 50 ? '...' : '');
            cliLogger.info(`   ${pkg.name} - ${title} (${pkg.size}) [${pkg.date}]`);
          });
        }
      }
    } catch (error) {
      cliLogger.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program.parse();
