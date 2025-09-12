# @dangerprep/sync

Comprehensive synchronization utilities and base classes for DangerPrep sync services.

## Overview

Unified framework for building synchronization services with base classes, transfer engines, progress tracking, CLI frameworks, and standardized patterns for robust sync operations.

## Features

- **Base Sync Service** - Standardized base class with lifecycle management
- **Transfer Engine** - High-performance file transfer with resume capability
- **Progress Tracking** - Unified progress tracking with phases and ETA calculation
- **CLI Framework** - Standardized CLI interface with common commands
- **Configuration Management** - Type-safe configuration with validation
- **Error Handling** - Comprehensive error handling with retry mechanisms

## Installation

```bash
yarn add @dangerprep/sync
```

## Usage

### Basic Sync Service

```typescript
import { BaseSyncService, SyncOperation, SyncResult } from '@dangerprep/sync';
import { z } from 'zod';

const MyServiceConfigSchema = z.object({
  name: z.string(),
  sourceDir: z.string(),
  targetDir: z.string(),
  syncInterval: z.number().default(3600),
});

class MySync extends BaseSyncService<MyServiceConfig> {
  protected async performSync(): Promise<SyncResult> {
    const operation: SyncOperation = {
      id: `sync-${Date.now()}`,
      type: 'directory',
      source: this.config.sourceDir,
      target: this.config.targetDir,
      direction: 'bidirectional',
    };

    const result = await this.transferEngine.transfer(operation);
    return {
      success: result.success,
      filesTransferred: result.stats.filesTransferred,
      bytesTransferred: result.stats.bytesTransferred,
      duration: result.duration,
    };
  }
}
```

### Transfer Engine

```typescript
import { TransferEngine, SyncOperation } from '@dangerprep/sync';

const transferEngine = new TransferEngine({
  maxConcurrentTransfers: 5,
  enableResume: true,
  enableChecksums: true,
});

const operation: SyncOperation = {
  id: 'transfer-1',
  type: 'file',
  source: '/path/to/source/file.txt',
  target: '/path/to/target/file.txt',
  direction: 'source-to-target',
};

const result = await transferEngine.transfer(operation);
```

### Progress Tracking

```typescript
import { UnifiedProgressTracker } from '@dangerprep/sync';

const progressTracker = new UnifiedProgressTracker({
  enableRealTimeUpdates: true,
  updateIntervalMs: 1000,
});

const progressId = await progressTracker.start('my-sync', {
  total: 1000,
  description: 'Syncing data',
});

await progressTracker.update(progressId, { current: 500 });
await progressTracker.complete(progressId);
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
    });
  }

  protected defineCustomCommands(): void {
    this.program
      .command('custom-sync')
      .description('Run custom sync operation')
      .action(async (options) => {
        await this.runCustomSync(options);
      });
  }
}
```

## Configuration Schemas

```typescript
import { BaseSyncConfigSchema, FileTransferConfigSchema } from '@dangerprep/sync';

const MyServiceConfigSchema = BaseSyncConfigSchema.extend({
  sourceDir: z.string(),
  targetDir: z.string(),
  fileTransfer: FileTransferConfigSchema.optional(),
});
```

## Error Handling

```typescript
import { SyncErrorHandler, SyncErrorFactory } from '@dangerprep/sync';

const errorHandler = new SyncErrorHandler({
  enableRetry: true,
  maxRetries: 3,
  retryDelayMs: 1000,
});

try {
  await syncOperation();
} catch (error) {
  const syncError = SyncErrorFactory.createTransferError('Transfer failed', error);
  await errorHandler.handle(syncError);
}
```

## Service Factory

```typescript
import { SyncServiceFactory } from '@dangerprep/sync';

const factory = new SyncServiceFactory();

const fileSync = factory.createFileSync({
  name: 'file-sync',
  sourceDir: '/source',
  targetDir: '/target',
});

const deviceSync = factory.createDeviceSync({
  name: 'device-sync',
  autoDetect: true,
  syncDirectories: [{ source: '/content/movies', target: 'Movies' }],
});
```

## Progress Utilities

```typescript
import { formatBytes, formatSpeed, createProgressInfo } from '@dangerprep/sync';

const progressInfo = createProgressInfo({
  current: 500,
  total: 1000,
  startTime: Date.now() - 30000,
  bytesTransferred: 1024 * 1024 * 50,
});

console.log(`Progress: ${progressInfo.percentage}%`);
console.log(`Speed: ${formatSpeed(progressInfo.speed)}`);
```

## Dependencies

- `@dangerprep/service` - Base service functionality
- `@dangerprep/configuration` - Configuration management
- `@dangerprep/logging` - Logging support

## License

MIT
