#!/usr/bin/env node

import { Command } from 'commander';

import { KiwixManager } from './kiwix-manager';

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
      await manager.initialize();

      const packages = await manager.listAvailablePackages();
      const filtered = options.filter
        ? packages.filter(pkg => pkg.name.toLowerCase().includes(options.filter.toLowerCase()))
        : packages;

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
      } else {
        console.table(
          filtered.map(pkg => ({
            Name: pkg.name,
            Title: pkg.title.substring(0, 50) + (pkg.title.length > 50 ? '...' : ''),
            Size: pkg.size,
            Date: pkg.date,
          }))
        );
        console.log(`\nTotal: ${filtered.length} packages`);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
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
      await manager.initialize();

      const packages = await manager.listInstalledPackages();

      if (options.json) {
        console.log(JSON.stringify(packages, null, 2));
      } else {
        console.table(
          packages.map(pkg => ({
            Name: pkg.name,
            Title: pkg.title.substring(0, 50) + (pkg.title.length > 50 ? '...' : ''),
            Size: pkg.size,
            Date: new Date(pkg.date).toLocaleDateString(),
          }))
        );
        console.log(`\nTotal: ${packages.length} packages installed`);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command('download <package>')
  .description('Download a ZIM package')
  .option('--force', 'Force download even if package exists')
  .action(async (packageName, options) => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');
      await manager.initialize();

      console.log(`Downloading ${packageName}...`);
      const success = await manager.downloadPackage(packageName);

      if (success) {
        console.log(`✅ Successfully downloaded ${packageName}`);
      } else {
        console.error(`❌ Failed to download ${packageName}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program
  .command('update-all')
  .description('Update all existing ZIM packages')
  .action(async () => {
    try {
      const manager = new KiwixManager(process.env.KIWIX_CONFIG_PATH || '/app/data/config.yaml');
      await manager.initialize();

      console.log('🔄 Scanning and updating existing ZIM packages...');
      const success = await manager.updateAllZimPackages();

      if (success) {
        console.log('✅ Update completed successfully');
      } else {
        console.error('❌ Update failed');
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
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
      await manager.initialize();

      const status = await manager.getUpdateStatus();

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        if (status.length === 0) {
          console.log('No ZIM packages found in the directory');
        } else {
          console.table(
            status.map(item => ({
              Package: item.package,
              'Needs Update': item.needsUpdate ? '🔄 Yes' : '✅ No',
              'Last Checked': item.lastChecked.toLocaleString(),
            }))
          );
        }
      }
    } catch (error) {
      console.error(`Error: ${error}`);
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
      await manager.initialize();

      const stats = await manager.getLibraryStats();

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log('📊 Library Statistics:');
        console.log(`   Total Packages: ${stats.totalPackages}`);
        console.log(`   Total Size: ${stats.totalSize}`);
        console.log(
          `   Last Updated: ${stats.lastUpdated ? stats.lastUpdated.toLocaleString() : 'Never'}`
        );
      }
    } catch (error) {
      console.error(`Error: ${error}`);
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
      await manager.initialize();

      const health = await manager.healthCheck();

      if (options.json) {
        console.log(JSON.stringify(health, null, 2));
      } else {
        const statusIcon = health.status === 'healthy' ? '✅' : '❌';
        console.log(`${statusIcon} Service Status: ${health.status.toUpperCase()}`);
        console.log('Details:');
        Object.entries(health.details).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }

      if (health.status !== 'healthy') {
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${error}`);
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
      await manager.initialize();

      const packages = await manager.listAvailablePackages();
      const filtered = packages.filter(
        pkg =>
          pkg.name.toLowerCase().includes(query.toLowerCase()) ||
          pkg.title.toLowerCase().includes(query.toLowerCase()) ||
          pkg.description.toLowerCase().includes(query.toLowerCase())
      );

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
      } else {
        if (filtered.length === 0) {
          console.log(`No packages found matching "${query}"`);
        } else {
          console.log(`Found ${filtered.length} packages matching "${query}":`);
          console.table(
            filtered.map(pkg => ({
              Name: pkg.name,
              Title: pkg.title.substring(0, 50) + (pkg.title.length > 50 ? '...' : ''),
              Size: pkg.size,
              Date: pkg.date,
            }))
          );
        }
      }
    } catch (error) {
      console.error(`Error: ${error}`);
      process.exit(1);
    }
  });

program.parse();
