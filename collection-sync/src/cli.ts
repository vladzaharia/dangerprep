#!/usr/bin/env node

import { Command } from 'commander';
import { CLICommands } from './cli/commands.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagePath = resolve(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));

const program = new Command();

program
  .name('media-collection')
  .description('Modern TypeScript-based media collection management system for portable VOD services')
  .version(packageJson.version);

// Analyze command (main functionality)
program
  .command('analyze')
  .description('Analyze media collection and generate reports')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-n, --nfs-path <path>', 'Override NFS base path')
  .option('-o, --output-dir <path>', 'Output directory for reports', './out')
  .option('--csv-name <name>', 'CSV output filename')
  .option('--script-name <name>', 'Rsync script filename')
  .option('--markdown-name <name>', 'Markdown summary filename')
  .option('-d, --destination <path>', 'Rsync destination path')
  .option('--cleanup', 'Clean up old files before analysis')
  .option('--cache-dir <path>', 'Cache directory path')
  .action(CLICommands.analyze);

// Find command (smart content discovery)
program
  .command('find <search-term>')
  .description('Find content using intelligent fuzzy matching')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-n, --nfs-path <path>', 'Override NFS base path')
  .option('-t, --threshold <number>', 'Matching threshold (0-1)', parseFloat, 0.6)
  .option('-m, --max-results <number>', 'Maximum number of results', parseInt, 10)
  .action(CLICommands.find);

// Cache management commands
const cacheCommand = program
  .command('cache')
  .description('Cache management operations');

cacheCommand
  .command('clear')
  .description('Clear metadata cache')
  .option('--cache-dir <path>', 'Cache directory path')
  .option('-c, --config <path>', 'Path to configuration file')
  .action((options) => CLICommands.cache('clear', options));

cacheCommand
  .command('stats')
  .description('Show cache statistics')
  .option('--cache-dir <path>', 'Cache directory path')
  .option('-c, --config <path>', 'Path to configuration file')
  .action((options) => CLICommands.cache('stats', options));

// Interactive mode (placeholder for future TUI implementation)
program
  .command('interactive')
  .alias('i')
  .description('Launch interactive collection builder (TUI)')
  .action(() => {
    console.log('🚧 Interactive mode coming soon!');
    console.log('This will launch a full-screen TUI for building collections interactively.');
  });

// Sample command to generate sample configuration
program
  .command('sample')
  .description('Generate sample configuration file')
  .option('-o, --output <path>', 'Output path for sample config', './config/sample-collection.jsonc')
  .action((options) => {
    console.log(`📝 Sample configuration will be generated at: ${options.output}`);
    console.log('🚧 Sample generation coming soon!');
  });

// Kiwix management commands
const kiwixCommand = program
  .command('kiwix')
  .description('Kiwix content management operations');

kiwixCommand
  .command('test-mirrors')
  .description('Test download speeds for all Kiwix mirrors')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(CLICommands.kiwixTestMirrors);

kiwixCommand
  .command('check')
  .description('Check for updates to ZIM files')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(CLICommands.kiwixCheck);

kiwixCommand
  .command('sync')
  .description('Download/update ZIM files')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--test-only', 'Only test mirrors, do not download')
  .action(CLICommands.kiwixSync);

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
