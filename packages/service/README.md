# @dangerprep/service

Base service class for standardized lifecycle management in DangerPrep services.

## Overview

Comprehensive base class and utilities for building robust, production-ready services with standardized patterns for service lifecycle management, health monitoring, scheduling, progress tracking, and error handling.

## Features

- **Standardized Lifecycle Management** - Consistent initialization, startup, and shutdown patterns
- **Service State Management** - Comprehensive state tracking and monitoring
- **Health Check Integration** - Automatic health monitoring with configurable intervals
- **Signal Handling** - Graceful shutdown on SIGTERM/SIGINT signals
- **Progress Tracking** - Built-in progress management for long-running operations
- **Task Scheduling** - Integrated cron-based task scheduling

## Installation

```bash
yarn add @dangerprep/service
```

## Usage

### Basic Service Implementation

```typescript
import { BaseService } from '@dangerprep/service';
import { z } from 'zod';

const MyServiceConfigSchema = z.object({
  name: z.string(),
  port: z.number().default(3000),
});

class MyService extends BaseService {
  private server?: any;

  constructor(config: MyServiceConfig) {
    super({
      name: config.name,
      configSchema: MyServiceConfigSchema,
      enablePeriodicHealthChecks: true,
    });
  }

  protected async doInitialize(): Promise<void> {
    this.logger.info('Initializing service...');
    // Setup database connections, load configurations, etc.
  }

  protected async doStart(): Promise<void> {
    this.logger.info('Starting service...');
    this.server = createServer();
    await this.server.listen(this.config.port);
  }

  protected async doStop(): Promise<void> {
    this.logger.info('Stopping service...');
    if (this.server) {
      await this.server.close();
    }
  }

  protected async doHealthCheck(): Promise<boolean> {
    return this.server?.listening ?? false;
  }
}

await service.start();
```

### Service with Scheduling

```typescript
import { BaseService } from '@dangerprep/service';

class ScheduledService extends BaseService {
  protected async doInitialize(): Promise<void> {
    await this.scheduler.schedule('cleanup', '0 2 * * *', async () => {
      this.logger.info('Running daily cleanup...');
      await this.performCleanup();
    });

    await this.scheduler.schedule('backup', '0 3 * * *', async () => {
      await this.performBackup();
    });
  }

  private async performCleanup(): Promise<void> {
    // Cleanup logic
  }

  private async performBackup(): Promise<void> {
    // Backup logic
  }
}
```

### Service with Progress Tracking

```typescript
import { BaseService } from '@dangerprep/service';

class SyncService extends BaseService {
  async syncData(): Promise<void> {
    const progressId = await this.progressManager.start('data-sync', {
      total: 1000,
      description: 'Syncing data from remote source',
    });

    try {
      for (let i = 0; i < 1000; i++) {
        await this.syncItem(i);
        await this.progressManager.update(progressId, { current: i + 1 });
      }
      await this.progressManager.complete(progressId);
    } catch (error) {
      await this.progressManager.fail(progressId, error as Error);
      throw error;
    }
  }
}
```

## Core Components

### BaseService

Main service base class providing:
- **Lifecycle Management**: `initialize()`, `start()`, `stop()`, `restart()`
- **State Management**: Tracks service state through `ServiceState` enum
- **Health Monitoring**: Automatic health checks with configurable intervals
- **Signal Handling**: Graceful shutdown on process signals

### ServiceScheduler

```typescript
await service.scheduler.schedule('task-name', '0 */6 * * *', async () => {
  // Task implementation
});

const tasks = await service.scheduler.listTasks();
await service.scheduler.cancel('task-name');
```

### ServiceProgressManager

```typescript
const progressId = await service.progressManager.start('operation', {
  total: 100,
  description: 'Processing items',
});

await service.progressManager.update(progressId, { current: 50 });
await service.progressManager.complete(progressId);
```

## Configuration

```typescript
const ServiceConfigSchema = z.object({
  name: z.string(),
  enablePeriodicHealthChecks: z.boolean().default(true),
  healthCheckIntervalMinutes: z.number().default(5),
  handleProcessSignals: z.boolean().default(true),
});
```

## Error Handling

Structured error types:
- `ServiceError` - Base service error
- `ServiceInitializationError` - Initialization failures
- `ServiceStartupError` - Startup failures
- `ServiceShutdownError` - Shutdown failures

## Lifecycle Hooks

```typescript
const service = new MyService(config, {
  beforeInitialize: async () => console.log('About to initialize...'),
  afterStart: async () => console.log('Service started successfully'),
  beforeStop: async () => console.log('About to stop...'),
});
```

## Dependencies

- `@dangerprep/configuration` - Configuration management
- `@dangerprep/health` - Health checking utilities
- `@dangerprep/logging` - Structured logging

## License

MIT
