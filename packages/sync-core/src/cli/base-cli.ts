import { ComponentStatus } from '@dangerprep/health';
import { Logger, LoggerFactory } from '@dangerprep/logging';
import { Command } from 'commander';

import { BaseSyncService, SyncServiceConfig } from '../base/sync-service';
import { SyncStats } from '../types';

export interface CLIConfig {
  serviceName: string;
  version: string;
  description: string;
  configPath?: string;
  defaultConfigPath?: string;
}

export interface CLIOutputOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export interface ServiceCommandOptions extends CLIOutputOptions {
  config?: string;
}

export abstract class BaseSyncCLI<TService extends BaseSyncService<SyncServiceConfig>> {
  protected program: Command;
  protected service: TService | null = null;
  protected logger: Logger;

  constructor(private readonly config: CLIConfig) {
    this.program = new Command();
    // Create a simple console logger for CLI output
    this.logger = LoggerFactory.createConsoleLogger(config.serviceName, 'INFO');
    this.setupGlobalOptions();
    this.setupBaseCommands();
  }

  /**
   * Abstract method to create the service instance
   */
  protected abstract createService(configPath: string): Promise<TService>;

  /**
   * Abstract method to add service-specific commands
   */
  protected abstract addServiceCommands(): void;

  /**
   * Setup global options
   */
  private setupGlobalOptions(): void {
    this.program
      .name(this.config.serviceName)
      .version(this.config.version)
      .description(this.config.description)
      .option('-c, --config <path>', 'Configuration file path', this.config.defaultConfigPath)
      .option('--json', 'Output in JSON format')
      .option('-v, --verbose', 'Verbose output')
      .option('-q, --quiet', 'Quiet output (errors only)');
  }

  /**
   * Initialize and run the CLI
   */
  public async run(argv: string[]): Promise<void> {
    this.addServiceCommands();
    await this.program.parseAsync(argv);
  }

  /**
   * Output data with formatting options
   */
  protected outputData(data: unknown, options: CLIOutputOptions = {}): void {
    if (options.quiet) return;

    if (options.json) {
      this.logger.info(JSON.stringify(data, null, 2));
    } else if (typeof data === 'string') {
      this.logger.info(data);
    } else {
      this.logger.info(JSON.stringify(data, null, 2));
    }
  }

  /**
   * Output success message with emoji
   */
  protected outputSuccess(message: string, options: CLIOutputOptions = {}): void {
    if (options.quiet) return;
    this.logger.info(`✅ ${message}`);
  }

  /**
   * Output progress message with emoji
   */
  protected outputProgress(message: string, options: CLIOutputOptions = {}): void {
    if (options.quiet) return;
    this.logger.info(`🔄 ${message}`);
  }

  /**
   * Output error message with emoji
   */
  protected outputError(message: string, error?: unknown): void {
    this.logger.error(`❌ ${message}`, error instanceof Error ? error : undefined);
  }

  /**
   * Setup base commands common to all sync services
   */
  private setupBaseCommands(): void {
    // Status command
    this.program
      .command('status')
      .description('Show service status and statistics')
      .action(async (options: ServiceCommandOptions) => {
        await this.handleStatusCommand(options);
      });

    // List operations command
    this.program
      .command('operations')
      .description('List active sync operations')
      .option('--all', 'Show all operations including completed ones')
      .action(async (options: ServiceCommandOptions & { all?: boolean }) => {
        await this.handleOperationsCommand(options);
      });

    // Cancel operation command
    this.program
      .command('cancel')
      .description('Cancel a sync operation')
      .argument('<operationId>', 'Operation ID to cancel')
      .action(async (operationId: string, options: ServiceCommandOptions) => {
        await this.handleCancelCommand(operationId, options);
      });

    // Health check command
    this.program
      .command('health')
      .description('Check service health')
      .action(async (options: ServiceCommandOptions) => {
        await this.handleHealthCommand(options);
      });

    // Start service command
    this.program
      .command('start')
      .description('Start the sync service')
      .option('-d, --daemon', 'Run as daemon')
      .action(async (options: ServiceCommandOptions & { daemon?: boolean }) => {
        await this.handleStartCommand(options);
      });

    // Stop service command
    this.program
      .command('stop')
      .description('Stop the sync service')
      .action(async (options: ServiceCommandOptions) => {
        await this.handleStopCommand(options);
      });

    // Configuration management command
    this.program
      .command('config')
      .description('Configuration management')
      .option('--create-default', 'Create default configuration file')
      .option('--validate', 'Validate configuration file')
      .option('--show', 'Show current configuration')
      .action(
        async (
          options: ServiceCommandOptions & {
            createDefault?: boolean;
            validate?: boolean;
            show?: boolean;
          }
        ) => {
          await this.handleConfigCommand(options);
        }
      );
  }

  /**
   * Get or create service instance
   */
  protected async getService(configPath?: string): Promise<TService> {
    if (!this.service) {
      const path = configPath || this.program.opts().config || this.config.defaultConfigPath;
      if (!path) {
        throw new Error('Configuration path is required');
      }
      this.service = await this.createService(path);
    }
    return this.service;
  }

  /**
   * Abstract method to handle configuration management
   */
  protected abstract handleConfigCommand(
    options: ServiceCommandOptions & {
      createDefault?: boolean;
      validate?: boolean;
      show?: boolean;
    }
  ): Promise<void>;

  /**
   * Handle status command
   */
  private async handleStatusCommand(options: ServiceCommandOptions): Promise<void> {
    try {
      const service = await this.getService(options.config);
      const stats = service.getSyncStats();
      const health = await service.getHealthStatus();
      const activeOps = service.getActiveOperations();

      const statusData = {
        service: this.config.serviceName,
        version: this.config.version,
        health,
        uptime: this.formatDuration(stats.uptime),
        statistics: {
          totalOperations: stats.totalOperations,
          successful: stats.successfulOperations,
          failed: stats.failedOperations,
          successRate: `${this.calculateSuccessRate(stats)}%`,
          itemsTransferred: stats.totalItemsTransferred,
          bytesTransferred: this.formatBytes(stats.totalBytesTransferred),
          averageSpeed: `${this.formatBytes(stats.averageTransferSpeed)}/s`,
          lastSyncTime: stats.lastSyncTime?.toISOString(),
        },
        activeOperations: activeOps.length,
      };

      if (options.json) {
        this.outputData(statusData, options);
      } else {
        this.logger.info('\n=== Service Status ===');
        this.logger.info(`Service: ${statusData.service}`);
        this.logger.info(`Version: ${statusData.version}`);
        this.logger.info(`Health: ${statusData.health}`);
        this.logger.info(`Uptime: ${statusData.uptime}`);

        this.logger.info('\n=== Statistics ===');
        this.logger.info(`Total Operations: ${statusData.statistics.totalOperations}`);
        this.logger.info(`Successful: ${statusData.statistics.successful}`);
        this.logger.info(`Failed: ${statusData.statistics.failed}`);
        this.logger.info(`Success Rate: ${statusData.statistics.successRate}`);
        this.logger.info(`Items Transferred: ${statusData.statistics.itemsTransferred}`);
        this.logger.info(`Bytes Transferred: ${statusData.statistics.bytesTransferred}`);
        this.logger.info(`Average Speed: ${statusData.statistics.averageSpeed}`);

        if (statusData.statistics.lastSyncTime) {
          this.logger.info(`Last Sync: ${statusData.statistics.lastSyncTime}`);
        }

        this.logger.info(`\nActive Operations: ${statusData.activeOperations}`);
      }
    } catch (error) {
      this.outputError('Error getting status', error);
      process.exit(1);
    }
  }

  /**
   * Handle operations command
   */
  private async handleOperationsCommand(
    options: ServiceCommandOptions & { all?: boolean }
  ): Promise<void> {
    try {
      const service = await this.getService(options.config);
      const operations = service.getActiveOperations();

      if (operations.length === 0) {
        if (options.json) {
          this.outputData([], options);
        } else {
          this.logger.info('No active operations');
        }
        return;
      }

      const operationsData = operations.map(op => ({
        id: op.id,
        type: op.type,
        status: op.status,
        progress: op.totalItems > 0 ? Math.round((op.processedItems / op.totalItems) * 100) : 0,
        currentItem: op.currentItem || 'N/A',
        processedItems: op.processedItems,
        totalItems: op.totalItems,
      }));

      if (options.json) {
        this.outputData(operationsData, options);
      } else {
        this.logger.info('\n=== Active Operations ===');
        this.logger.info('ID\t\t\tType\t\tStatus\t\tProgress\tCurrent Item');
        this.logger.info('-'.repeat(80));

        for (const op of operationsData) {
          this.logger.info(
            `${op.id.substr(0, 12)}...\t${op.type}\t\t${op.status}\t\t${op.progress}%\t\t${op.currentItem}`
          );
        }
      }
    } catch (error) {
      this.outputError('Error listing operations', error);
      process.exit(1);
    }
  }

  /**
   * Handle cancel command
   */
  private async handleCancelCommand(
    operationId: string,
    options: ServiceCommandOptions
  ): Promise<void> {
    try {
      const service = await this.getService(options.config);
      const success = await service.cancelOperation(operationId);

      if (success) {
        this.outputSuccess(`Operation ${operationId} cancelled successfully`, options);
      } else {
        this.logger.info(`Operation ${operationId} not found or cannot be cancelled`);
      }
    } catch (error) {
      this.outputError('Error cancelling operation', error);
      process.exit(1);
    }
  }

  /**
   * Handle health command
   */
  private async handleHealthCommand(options: ServiceCommandOptions): Promise<void> {
    try {
      const service = await this.getService(options.config);
      const health = await service.getHealthStatus();

      const healthData = { health };

      if (options.json) {
        this.outputData(healthData, options);
      } else {
        this.logger.info(`Service Health: ${health}`);
      }

      if (health === ComponentStatus.UP) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } catch (error) {
      this.outputError('Error checking health', error);
      process.exit(1);
    }
  }

  /**
   * Handle start command
   */
  private async handleStartCommand(
    options: ServiceCommandOptions & { daemon?: boolean }
  ): Promise<void> {
    try {
      const service = await this.getService(options.config);

      if (options.daemon) {
        this.outputProgress('Starting service in daemon mode...', options);
        // In a real implementation, this would detach the process
      } else {
        this.outputProgress('Starting service...', options);
      }

      await service.start();
      this.outputSuccess('Service started successfully', options);

      // Keep the process running
      if (!options.daemon) {
        process.on('SIGINT', async () => {
          this.logger.info('\nShutting down...');
          await service.stop();
          process.exit(0);
        });

        // Keep alive
        const keepAlive = setInterval(() => {
          // Keep process running
        }, 1000);

        // Clean up on exit
        process.on('exit', () => {
          clearInterval(keepAlive);
        });
      }
    } catch (error) {
      this.outputError('Error starting service', error);
      process.exit(1);
    }
  }

  /**
   * Handle stop command
   */
  private async handleStopCommand(options: ServiceCommandOptions): Promise<void> {
    try {
      const service = await this.getService(options.config);
      await service.stop();
      this.outputSuccess('Service stopped successfully', options);
    } catch (error) {
      this.outputError('Error stopping service', error);
      process.exit(1);
    }
  }

  // Utility methods
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  private calculateSuccessRate(stats: SyncStats): number {
    if (stats.totalOperations === 0) return 0;
    return Math.round((stats.successfulOperations / stats.totalOperations) * 100);
  }
}
