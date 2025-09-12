# @dangerprep/health

Health checking utilities and monitoring services for DangerPrep applications.

## Overview

Comprehensive health checking capabilities for services, including periodic monitoring, health status aggregation, and integration with the service lifecycle.

## Features

- **Health Checkers** - Flexible health check implementations
- **Periodic Monitoring** - Automated health monitoring with configurable intervals
- **Status Aggregation** - Combine multiple health checks into overall service status
- **Integration Ready** - Seamless integration with `@dangerprep/service` base classes
- **Monitoring Service** - Standalone health monitoring service

## Installation

```bash
yarn add @dangerprep/health
```

## Usage

### Basic Health Checker

```typescript
import { HealthChecker, HealthStatus } from '@dangerprep/health';

class DatabaseHealthChecker extends HealthChecker {
  constructor(private dbConnection: DatabaseConnection) {
    super('database');
  }

  async check(): Promise<HealthStatus> {
    try {
      await this.dbConnection.ping();
      return {
        status: 'healthy',
        message: 'Database connection is active',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Database connection failed',
        timestamp: new Date(),
        error: error.message,
      };
    }
  }
}
```

### Periodic Health Monitoring

```typescript
import { PeriodicHealthMonitor } from '@dangerprep/health';

const monitor = new PeriodicHealthMonitor({
  interval: 30000,
  checkers: [
    new DatabaseHealthChecker(dbConnection),
    new RedisHealthChecker(redisClient),
  ],
  onStatusChange: (status) => {
    console.log(`Health status: ${status.status}`);
  },
});

await monitor.start();
```

## Built-in Health Checkers

```typescript
import {
  DatabaseHealthChecker,
  FileSystemHealthChecker,
  MemoryHealthChecker,
  NetworkHealthChecker,
} from '@dangerprep/health';

const dbChecker = new DatabaseHealthChecker({ connection: dbConnection });
const fsChecker = new FileSystemHealthChecker({ paths: ['/data'] });
const memoryChecker = new MemoryHealthChecker({ maxUsagePercent: 80 });
const networkChecker = new NetworkHealthChecker({ endpoints: ['https://api.example.com'] });
```

## Health Monitoring Service

```typescript
import { HealthMonitoringService } from '@dangerprep/health';

const healthService = new HealthMonitoringService({
  name: 'system-health-monitor',
  port: 8080,
  checkers: [
    new DatabaseHealthChecker(dbConnection),
    new FileSystemHealthChecker({ paths: ['/data'] }),
  ],
  monitoring: { interval: 30000, enableMetrics: true },
});

await healthService.start();
// Health endpoint available at http://localhost:8080/health
```

## Health Utilities

```typescript
import { HealthUtils } from '@dangerprep/health';

const dbStatus = await HealthUtils.checkDatabaseConnection(connection);
const memoryStatus = await HealthUtils.checkMemoryUsage({ maxUsagePercent: 80 });
const diskStatus = await HealthUtils.checkDiskSpace({ path: '/data', minFreePercent: 10 });
```

## Health Status Types

```typescript
interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  timestamp: Date;
  error?: string;
  details?: Record<string, unknown>;
}
```

## Integration with Services

```typescript
import { BaseService } from '@dangerprep/service';
import { HealthUtils } from '@dangerprep/health';

class MyService extends BaseService {
  protected async doHealthCheck(): Promise<boolean> {
    const checks = await Promise.all([
      HealthUtils.checkDatabaseConnection(this.dbConnection),
      HealthUtils.checkMemoryUsage({ maxUsagePercent: 80 }),
    ]);
    return checks.every(check => check.status === 'healthy');
  }
}
```

## Dependencies

- `@dangerprep/logging` - Logging support
- `@dangerprep/configuration` - Configuration management

## License

MIT
