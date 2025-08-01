/**
 * Standardized CLI framework for DangerPrep sync services
 */

import { ComponentStatus } from '@dangerprep/health';
import { LoggerFactory } from '@dangerprep/logging';
import { Command } from 'commander';

import { StandardizedSyncService } from '../base/standardized-service.js';

// CLI configuration interface
export interface StandardizedCliConfig {
  serviceName: string;
  version: string;
  description: string;
  defaultConfigPath: string;
  supportsDaemon: boolean;
  supportsManualOperations: boolean;
  customCommands?: CliCommand[];
}

// Custom CLI command interface
export interface CliCommand {
  name: string;
  description: string;
  arguments?: CliArgument[];
  options?: CliOption[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (args: any[], options: any, service: StandardizedSyncService<any>) => Promise<void>;
}

export interface CliArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface CliOption {
  flags: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultValue?: any;
}

// CLI output utilities
export class CliOutput {
  private static logger = LoggerFactory.createConsoleLogger('cli');

  static info(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`ℹ️  ${message}`);
  }

  static success(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`✅ ${message}`);
  }

  static warning(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`⚠️  ${message}`);
  }

  static error(message: string): void {
    // eslint-disable-next-line no-console
    console.error(`❌ ${message}`);
  }

  static progress(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`🔄 ${message}`);
  }

  static json(data: unknown): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(data, null, 2));
  }

  static table(headers: string[], rows: string[][]): void {
    // Simple table formatting
    const columnWidths = headers.map((header, index) =>
      Math.max(header.length, ...rows.map(row => (row[index] || '').length))
    );

    // Print header
    const headerRow = headers
      .map((header, index) => header.padEnd(columnWidths[index] || 0))
      .join(' | ');
    // eslint-disable-next-line no-console
    console.log(headerRow);
    // eslint-disable-next-line no-console
    console.log('-'.repeat(headerRow.length));

    // Print rows
    rows.forEach(row => {
      const formattedRow = row
        .map((cell, index) => (cell || '').padEnd(columnWidths[index] || 0))
        .join(' | ');
      // eslint-disable-next-line no-console
      console.log(formattedRow);
    });
  }
}

/**
 * Standardized CLI framework for sync services
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class StandardizedCli<TService extends StandardizedSyncService<any>> {
  private readonly program: Command;
  private readonly config: StandardizedCliConfig;
  private readonly serviceFactory: (configPath?: string) => TService;

  constructor(config: StandardizedCliConfig, serviceFactory: (configPath?: string) => TService) {
    this.config = config;
    this.serviceFactory = serviceFactory;
    this.program = new Command();

    this.setupBaseCommands();
    this.setupCustomCommands();
  }

  /**
   * Parse and execute CLI commands
   */
  public async execute(argv?: string[]): Promise<void> {
    await this.program.parseAsync(argv);
  }

  private setupBaseCommands(): void {
    this.program
      .name(this.config.serviceName)
      .description(this.config.description)
      .version(this.config.version);

    // Start command
    const startCommand = this.program
      .command('start')
      .description('Start the sync service')
      .option('-c, --config <path>', 'Configuration file path', this.config.defaultConfigPath);

    if (this.config.supportsDaemon) {
      startCommand.option('-d, --daemon', 'Run as daemon');
    }

    startCommand.action(async options => {
      await this.handleStart(options);
    });

    // Stop command
    this.program
      .command('stop')
      .description('Stop the sync service')
      .action(async () => {
        await this.handleStop();
      });

    // Status command
    this.program
      .command('status')
      .description('Show service status')
      .option('-c, --config <path>', 'Configuration file path', this.config.defaultConfigPath)
      .option('--json', 'Output as JSON')
      .action(async options => {
        await this.handleStatus(options);
      });

    // Health command
    this.program
      .command('health')
      .description('Check service health')
      .option('-c, --config <path>', 'Configuration file path', this.config.defaultConfigPath)
      .option('--json', 'Output as JSON')
      .action(async options => {
        await this.handleHealth(options);
      });

    // Stats command
    this.program
      .command('stats')
      .description('Show service statistics')
      .option('-c, --config <path>', 'Configuration file path', this.config.defaultConfigPath)
      .option('--json', 'Output as JSON')
      .action(async options => {
        await this.handleStats(options);
      });

    // Config command
    this.program
      .command('config')
      .description('Show current configuration')
      .option('-c, --config <path>', 'Configuration file path', this.config.defaultConfigPath)
      .option('--json', 'Output as JSON')
      .action(async options => {
        await this.handleConfig(options);
      });
  }

  private setupCustomCommands(): void {
    if (!this.config.customCommands) return;

    for (const customCommand of this.config.customCommands) {
      const command = this.program
        .command(customCommand.name)
        .description(customCommand.description);

      // Add arguments
      if (customCommand.arguments) {
        for (const arg of customCommand.arguments) {
          if (arg.required) {
            command.argument(`<${arg.name}>`, arg.description);
          } else {
            command.argument(`[${arg.name}]`, arg.description);
          }
        }
      }

      // Add options
      if (customCommand.options) {
        for (const option of customCommand.options) {
          command.option(option.flags, option.description, option.defaultValue);
        }
      }

      // Add default config option
      command.option(
        '-c, --config <path>',
        'Configuration file path',
        this.config.defaultConfigPath
      );

      command.action(async (...args) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const options = args[args.length - 1] as any;
        const commandArgs = args.slice(0, -1);

        try {
          const service = this.serviceFactory(options.config);
          await customCommand.action(commandArgs, options, service);
        } catch (error) {
          CliOutput.error(
            `Command failed: ${error instanceof Error ? error.message : String(error)}`
          );
          process.exit(1);
        }
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleStart(options: any): Promise<void> {
    try {
      const service = this.serviceFactory(options.config);

      if (options.daemon) {
        CliOutput.info(`Starting ${this.config.serviceName} in daemon mode...`);
      } else {
        CliOutput.info(`Starting ${this.config.serviceName}...`);
      }

      // Initialize and start the service
      const initResult = await service.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      await service.start();

      if (!options.daemon) {
        CliOutput.success(`${this.config.serviceName} started successfully. Press Ctrl+C to stop.`);

        // Set up graceful shutdown
        process.on('SIGINT', async () => {
          CliOutput.info('Received SIGINT, shutting down gracefully...');
          await service.stop();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          CliOutput.info('Received SIGTERM, shutting down gracefully...');
          await service.stop();
          process.exit(0);
        });
      }
    } catch (error) {
      CliOutput.error(
        `Failed to start service: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  }

  private async handleStop(): Promise<void> {
    CliOutput.info('Stop command - use SIGTERM to stop running service');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleStatus(options: any): Promise<void> {
    try {
      const service = this.serviceFactory(options.config);

      const initResult = await service.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const stats = service.getStatistics();
      const health = await service.getHealthStatus();

      if (options.json) {
        CliOutput.json({
          service: this.config.serviceName,
          version: this.config.version,
          health,
          statistics: stats,
        });
      } else {
        CliOutput.info(`${this.config.serviceName} v${this.config.version}`);
        CliOutput.info(`Health: ${this.formatHealthStatus(health)}`);
        CliOutput.info(`Uptime: ${this.formatDuration(stats.uptime)}`);
        CliOutput.info(`Total Operations: ${stats.totalOperations}`);
        CliOutput.info(`Success Rate: ${((1 - stats.errorRate) * 100).toFixed(1)}%`);
        CliOutput.info(`Active Operations: ${stats.activeOperations}`);
      }
    } catch (error) {
      CliOutput.error(
        `Failed to get status: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleHealth(options: any): Promise<void> {
    try {
      const service = this.serviceFactory(options.config);

      const initResult = await service.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const health = await service.getHealthStatus();

      if (options.json) {
        CliOutput.json({ health });
      } else {
        CliOutput.info(`Health Status: ${this.formatHealthStatus(health)}`);
      }

      // Exit with appropriate code
      process.exit(health === ComponentStatus.UP ? 0 : 1);
    } catch (error) {
      CliOutput.error(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleStats(options: any): Promise<void> {
    try {
      const service = this.serviceFactory(options.config);

      const initResult = await service.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      const stats = service.getStatistics();

      if (options.json) {
        CliOutput.json(stats);
      } else {
        CliOutput.table(
          ['Metric', 'Value'],
          [
            ['Total Operations', stats.totalOperations.toString()],
            ['Successful Operations', stats.successfulOperations.toString()],
            ['Failed Operations', stats.failedOperations.toString()],
            ['Active Operations', stats.activeOperations.toString()],
            ['Success Rate', `${((1 - stats.errorRate) * 100).toFixed(1)}%`],
            ['Average Operation Time', `${stats.averageOperationTime.toFixed(0)}ms`],
            ['Uptime', this.formatDuration(stats.uptime)],
            ['Last Operation', stats.lastOperationTime?.toISOString() || 'Never'],
          ]
        );
      }
    } catch (error) {
      CliOutput.error(
        `Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleConfig(options: any): Promise<void> {
    try {
      const service = this.serviceFactory(options.config);

      const initResult = await service.initialize();
      if (!initResult.success) {
        throw initResult.error || new Error('Service initialization failed');
      }

      // Get config through a public method or property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = (service as any).getConfig();

      if (options.json) {
        CliOutput.json(config);
      } else {
        CliOutput.info('Current Configuration:');
        CliOutput.json(config);
      }
    } catch (error) {
      CliOutput.error(
        `Failed to get configuration: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(1);
    }
  }

  private formatHealthStatus(status: ComponentStatus): string {
    switch (status) {
      case ComponentStatus.UP:
        return '🟢 Healthy';
      case ComponentStatus.DEGRADED:
        return '🟡 Degraded';
      case ComponentStatus.DOWN:
        return '🔴 Down';
      default:
        return '❓ Unknown';
    }
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }
}
