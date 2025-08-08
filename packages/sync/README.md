# @dangerprep/sync

Comprehensive synchronization utilities and base classes for DangerPrep sync services.

## Overview

The `@dangerprep/sync` package provides a unified framework for building synchronization services in the DangerPrep ecosystem. It includes base classes, transfer engines, progress tracking, CLI frameworks, and standardized patterns for implementing robust sync operations.

## Features

- **Base Sync Service** - Standardized base class for sync services with lifecycle management
- **Transfer Engine** - High-performance file transfer with resume capability and progress tracking
- **Progress Tracking** - Unified progress tracking with phases, ETA calculation, and real-time updates
- **CLI Framework** - Standardized CLI interface for sync services with common commands
- **Configuration Management** - Type-safe configuration with validation and defaults
- **Error Handling** - Comprehensive error handling with retry mechanisms and recovery
- **Service Factory** - Factory patterns for creating configured sync services
- **Multiple Sync Types** - Support for various sync operations (files, directories, devices)

## Installation

```bash
yarn add @dangerprep/sync
```

## Quick Start

### Basic Sync Service

```typescript
import { BaseSyncService, SyncOperation, SyncResult } from '@dangerprep/sync';
import { z } from 'zod';

// Define your sync service configuration
const MyServiceConfigSchema = z.object({
  name: z.string(),
  sourceDir: z.string(),
  targetDir: z.string(),
  syncInterval: z.number().default(3600), // 1 hour
});

type MyServiceConfig = z.infer<typeof MyServiceConfigSchema>;

class MySync extends BaseSyncService<MyServiceConfig> {
  constructor(config: MyServiceConfig) {
    super({
      name: config.name,
      configSchema: MyServiceConfigSchema,
      config,
    });
  }

  protected async performSync(): Promise<SyncResult> {
    const operation: SyncOperation = {
      id: `sync-${Date.now()}`,
      type: 'directory',
      source: this.config.sourceDir,
      target: this.config.targetDir,
      direction: 'bidirectional',
    };

    // Use the built-in transfer engine
    const result = await this.transferEngine.transfer(operation);
    
    return {
      success: result.success,
      filesTransferred: result.stats.filesTransferred,
      bytesTransferred: result.stats.bytesTransferred,
      duration: result.duration,
      errors: result.errors,
    };
  }
}

// Usage
const syncService = new MySync({
  name: 'my-sync',
  sourceDir: '/source',
  targetDir: '/target',
});

await syncService.start();
```

### Standardized Sync Service

```typescript
import { StandardizedSyncService } from '@dangerprep/sync';

// Use the standardized service for common sync patterns
class FileSync extends StandardizedSyncService {
  constructor(config: FileSyncConfig) {
    super({
      name: 'file-sync',
      config,
      syncType: 'files',
      enableScheduling: true,
      enableProgressTracking: true,
      enableCLI: true,
    });
  }

  protected async doSync(): Promise<SyncResult> {
    // Implement your specific sync logic
    return await this.syncFiles();
  }

  private async syncFiles(): Promise<SyncResult> {
    // File synchronization implementation
    const progressId = await this.progressManager.start('file-sync', {
      total: 1000,
      description: 'Syncing files',
    });

    try {
      // Perform sync with progress updates
      for (let i = 0; i < 1000; i++) {
        await this.syncFile(i);
        await this.progressManager.update(progressId, { current: i + 1 });
      }

      await this.progressManager.complete(progressId);
      return { success: true, filesTransferred: 1000 };
    } catch (error) {
      await this.progressManager.fail(progressId, error as Error);
      throw error;
    }
  }
}
```

### Transfer Engine Usage

```typescript
import { TransferEngine, SyncOperation } from '@dangerprep/sync';

const transferEngine = new TransferEngine({
  maxConcurrentTransfers: 5,
  enableResume: true,
  enableCompression: true,
  enableChecksums: true,
});

const operation: SyncOperation = {
  id: 'transfer-1',
  type: 'file',
  source: '/path/to/source/file.txt',
  target: '/path/to/target/file.txt',
  direction: 'source-to-target',
  options: {
    preserveTimestamps: true,
    preservePermissions: true,
    enableResume: true,
  },
};

const result = await transferEngine.transfer(operation);
console.log(`Transferred ${result.stats.bytesTransferred} bytes`);
```

### Progress Tracking

```typescript
import { UnifiedProgressTracker, createSyncPhases } from '@dangerprep/sync';

const progressTracker = new UnifiedProgressTracker({
  enableRealTimeUpdates: true,
  updateIntervalMs: 1000,
});

// Define sync phases
const phases = createSyncPhases([
  { name: 'scan', weight: 0.1 },
  { name: 'transfer', weight: 0.8 },
  { name: 'verify', weight: 0.1 },
]);

const progressId = await progressTracker.start('my-sync', {
  phases,
  total: 1000,
  description: 'Syncing data',
});

// Update progress through phases
await progressTracker.updatePhase(progressId, 'scan', { current: 100, total: 100 });
await progressTracker.updatePhase(progressId, 'transfer', { current: 500, total: 800 });
```

### CLI Integration

```typescript
import { StandardizedCLI } from '@dangerprep/sync';

class MySyncCLI extends StandardizedCLI {
  constructor(syncService: MySync) {
    super({
      serviceName: 'my-sync',
      service: syncService,
      enableStatusCommand: true,
      enableProgressCommand: true,
      enableConfigCommand: true,
    });
  }

  protected defineCustomCommands(): void {
    this.program
      .command('custom-sync')
      .description('Run custom sync operation')
      .option('--dry-run', 'Perform dry run')
      .action(async (options) => {
        await this.runCustomSync(options);
      });
  }

  private async runCustomSync(options: any): Promise<void> {
    // Custom sync command implementation
  }
}

// Usage
const cli = new MySyncCLI(syncService);
await cli.run(process.argv);
```

## Configuration Schemas

The package provides standard configuration schemas:

```typescript
import { 
  BaseSyncConfigSchema,
  FileTransferConfigSchema,
  ProgressConfigSchema,
  RetryConfigSchema,
} from '@dangerprep/sync';

// Compose your service configuration
const MyServiceConfigSchema = BaseSyncConfigSchema.extend({
  sourceDir: z.string(),
  targetDir: z.string(),
  fileTransfer: FileTransferConfigSchema.optional(),
  progress: ProgressConfigSchema.optional(),
  retry: RetryConfigSchema.optional(),
});
```

## Error Handling

Comprehensive error handling with recovery mechanisms:

```typescript
import { SyncErrorHandler, SyncErrorFactory } from '@dangerprep/sync';

const errorHandler = new SyncErrorHandler({
  enableRetry: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  enableNotifications: true,
});

try {
  await syncOperation();
} catch (error) {
  const syncError = SyncErrorFactory.createTransferError(
    'Transfer failed',
    error,
    { operation: 'file-sync', source: '/path/to/file' }
  );
  
  await errorHandler.handle(syncError);
}
```

## Service Factory

Create pre-configured sync services:

```typescript
import { SyncServiceFactory } from '@dangerprep/sync';

const factory = new SyncServiceFactory();

// Create a file sync service
const fileSync = factory.createFileSync({
  name: 'file-sync',
  sourceDir: '/source',
  targetDir: '/target',
  enableScheduling: true,
});

// Create a device sync service
const deviceSync = factory.createDeviceSync({
  name: 'device-sync',
  autoDetect: true,
  syncDirectories: [
    { source: '/content/movies', target: 'Movies' },
    { source: '/content/books', target: 'Books' },
  ],
});
```

## Progress Utilities

Utility functions for progress tracking:

```typescript
import { 
  formatBytes,
  formatSpeed,
  formatDuration,
  formatETA,
  createProgressInfo,
} from '@dangerprep/sync';

// Format progress information
const progressInfo = createProgressInfo({
  current: 500,
  total: 1000,
  startTime: Date.now() - 30000, // 30 seconds ago
  bytesTransferred: 1024 * 1024 * 50, // 50 MB
});

console.log(`Progress: ${progressInfo.percentage}%`);
console.log(`Speed: ${formatSpeed(progressInfo.speed)}`);
console.log(`ETA: ${formatETA(progressInfo.eta)}`);
```

## Best Practices

1. **Use Standardized Services**: Prefer `StandardizedSyncService` for common patterns
2. **Implement Progress Tracking**: Always provide progress feedback for long operations
3. **Handle Errors Gracefully**: Use the error handling framework for robust operations
4. **Enable Resume**: Use resume capability for large file transfers
5. **Validate Configuration**: Use Zod schemas for type-safe configuration
6. **Use Phases**: Break complex operations into phases for better progress tracking

## Dependencies

- `@dangerprep/service` - Base service functionality
- `@dangerprep/configuration` - Configuration management
- `@dangerprep/logging` - Logging support
- `@dangerprep/progress` - Progress tracking
- `@dangerprep/files` - File system utilities
- `@dangerprep/resilience` - Retry and error handling

## License

MIT
