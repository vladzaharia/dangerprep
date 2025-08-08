# @dangerprep/service

Base service class for standardized lifecycle management in DangerPrep services.

## Overview

The `@dangerprep/service` package provides a comprehensive base class and utilities for building robust, production-ready services in the DangerPrep ecosystem. It implements standardized patterns for service lifecycle management, health monitoring, scheduling, progress tracking, and error handling.

## Features

- **Standardized Lifecycle Management** - Consistent initialization, startup, and shutdown patterns
- **Service State Management** - Comprehensive state tracking and monitoring
- **Health Check Integration** - Automatic health monitoring with configurable intervals
- **Signal Handling** - Graceful shutdown on SIGTERM/SIGINT signals
- **Event-Driven Architecture** - Lifecycle hooks and event emission
- **Progress Tracking** - Built-in progress management for long-running operations
- **Task Scheduling** - Integrated cron-based task scheduling
- **Service Discovery** - Service registry and discovery patterns
- **Error Recovery** - Automatic recovery mechanisms and circuit breakers
- **Comprehensive Error Handling** - Structured error types and notification integration

## Installation

```bash
yarn add @dangerprep/service
```

## Quick Start

### Basic Service Implementation

```typescript
import { BaseService, ServiceState } from '@dangerprep/service';
import { z } from 'zod';

// Define your service configuration schema
const MyServiceConfigSchema = z.object({
  name: z.string(),
  port: z.number().default(3000),
  // ... other config options
});

type MyServiceConfig = z.infer<typeof MyServiceConfigSchema>;

class MyService extends BaseService {
  private server?: any;

  constructor(config: MyServiceConfig) {
    super({
      name: config.name,
      configSchema: MyServiceConfigSchema,
      enablePeriodicHealthChecks: true,
      healthCheckIntervalMinutes: 5,
    });
  }

  protected async doInitialize(): Promise<void> {
    // Initialize your service resources
    this.logger.info('Initializing service...');
    // Setup database connections, load configurations, etc.
  }

  protected async doStart(): Promise<void> {
    // Start your service
    this.logger.info('Starting service...');
    this.server = createServer();
    await this.server.listen(this.config.port);
  }

  protected async doStop(): Promise<void> {
    // Stop your service
    this.logger.info('Stopping service...');
    if (this.server) {
      await this.server.close();
    }
  }

  protected async doHealthCheck(): Promise<boolean> {
    // Implement your health check logic
    return this.server?.listening ?? false;
  }
}

// Usage
const service = new MyService({
  name: 'my-service',
  port: 3000,
});

await service.start();
```

### Service with Scheduling

```typescript
import { BaseService, ServiceSchedulePatterns } from '@dangerprep/service';

class ScheduledService extends BaseService {
  protected async doInitialize(): Promise<void> {
    // Schedule periodic tasks
    await this.scheduler.schedule('cleanup', '0 2 * * *', async () => {
      this.logger.info('Running daily cleanup...');
      await this.performCleanup();
    });

    // Schedule with patterns
    await ServiceSchedulePatterns.scheduleWithRetry(
      this.scheduler,
      'backup',
      '0 3 * * *',
      async () => {
        await this.performBackup();
      },
      { maxRetries: 3, retryDelayMs: 60000 }
    );
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
import { BaseService, ServiceProgressPatterns } from '@dangerprep/service';

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

  private async syncItem(index: number): Promise<void> {
    // Sync individual item
  }
}
```

## Core Components

### BaseService

The main service base class that provides:

- **Lifecycle Management**: `initialize()`, `start()`, `stop()`, `restart()`
- **State Management**: Tracks service state through `ServiceState` enum
- **Health Monitoring**: Automatic health checks with configurable intervals
- **Signal Handling**: Graceful shutdown on process signals
- **Event Emission**: Lifecycle events for external monitoring

### ServiceScheduler

Integrated cron-based task scheduling:

```typescript
// Schedule a task
await service.scheduler.schedule('task-name', '0 */6 * * *', async () => {
  // Task implementation
});

// List scheduled tasks
const tasks = await service.scheduler.listTasks();

// Cancel a task
await service.scheduler.cancel('task-name');
```

### ServiceProgressManager

Progress tracking for long-running operations:

```typescript
// Start progress tracking
const progressId = await service.progressManager.start('operation', {
  total: 100,
  description: 'Processing items',
});

// Update progress
await service.progressManager.update(progressId, { current: 50 });

// Complete or fail
await service.progressManager.complete(progressId);
```

### ServiceRegistry

Service discovery and registration:

```typescript
// Register service
await service.registry.register({
  name: 'my-service',
  version: '1.0.0',
  capabilities: ['sync', 'backup'],
  endpoints: { http: 'http://localhost:3000' },
});

// Discover services
const services = await service.registry.discover({
  capabilities: ['sync'],
});
```

## Configuration

Services are configured using Zod schemas for type safety and validation:

```typescript
const ServiceConfigSchema = z.object({
  name: z.string(),
  enablePeriodicHealthChecks: z.boolean().default(true),
  healthCheckIntervalMinutes: z.number().default(5),
  handleProcessSignals: z.boolean().default(true),
  shutdownTimeoutMs: z.number().default(30000),
  // Add your service-specific configuration
});
```

## Error Handling

The package provides structured error types:

- `ServiceError` - Base service error
- `ServiceInitializationError` - Initialization failures
- `ServiceStartupError` - Startup failures
- `ServiceShutdownError` - Shutdown failures
- `ServiceConfigurationError` - Configuration validation errors

## Lifecycle Hooks

Implement lifecycle hooks for custom behavior:

```typescript
const service = new MyService(config, {
  beforeInitialize: async () => {
    console.log('About to initialize...');
  },
  afterStart: async () => {
    console.log('Service started successfully');
  },
  beforeStop: async () => {
    console.log('About to stop...');
  },
});
```

## Dependencies

- `@dangerprep/configuration` - Configuration management
- `@dangerprep/health` - Health checking utilities
- `@dangerprep/logging` - Structured logging
- `@dangerprep/notifications` - Notification system
- `@dangerprep/scheduling` - Task scheduling
- `@dangerprep/progress` - Progress tracking

## License

MIT
