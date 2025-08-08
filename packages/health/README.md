# @dangerprep/health

Health checking utilities and monitoring services for DangerPrep applications.

## Overview

The `@dangerprep/health` package provides comprehensive health checking capabilities for services, including periodic monitoring, health status aggregation, and integration with the service lifecycle. It's designed to work seamlessly with the DangerPrep service architecture.

## Features

- **Health Checkers** - Flexible health check implementations for various service types
- **Periodic Monitoring** - Automated health monitoring with configurable intervals
- **Status Aggregation** - Combine multiple health checks into overall service status
- **Integration Ready** - Seamless integration with `@dangerprep/service` base classes
- **Extensible** - Easy to add custom health checks for specific service requirements
- **Monitoring Service** - Standalone health monitoring service for system-wide health

## Installation

```bash
yarn add @dangerprep/health
```

## Quick Start

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
        details: {
          connectionPool: this.dbConnection.getPoolStatus(),
        },
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

// Usage
const dbChecker = new DatabaseHealthChecker(dbConnection);
const status = await dbChecker.check();
console.log(`Database health: ${status.status}`);
```

### Periodic Health Monitoring

```typescript
import { PeriodicHealthMonitor } from '@dangerprep/health';

const monitor = new PeriodicHealthMonitor({
  interval: 30000, // Check every 30 seconds
  checkers: [
    new DatabaseHealthChecker(dbConnection),
    new RedisHealthChecker(redisClient),
    new ExternalAPIHealthChecker(apiClient),
  ],
  onStatusChange: (status) => {
    console.log(`Overall health status changed to: ${status.status}`);
    if (status.status === 'unhealthy') {
      // Send alerts, notifications, etc.
    }
  },
});

await monitor.start();
```

### Service Integration

```typescript
import { BaseService } from '@dangerprep/service';
import { HealthUtils } from '@dangerprep/health';

class MyService extends BaseService {
  private dbConnection: DatabaseConnection;

  protected async doInitialize(): Promise<void> {
    this.dbConnection = await createDatabaseConnection();
  }

  protected async doHealthCheck(): Promise<boolean> {
    // Use health utilities for comprehensive checks
    const checks = await Promise.all([
      HealthUtils.checkDatabaseConnection(this.dbConnection),
      HealthUtils.checkMemoryUsage({ maxUsagePercent: 80 }),
      HealthUtils.checkDiskSpace({ path: '/data', minFreePercent: 10 }),
    ]);

    return checks.every(check => check.status === 'healthy');
  }
}
```

## Health Check Types

### Built-in Health Checkers

```typescript
import { 
  DatabaseHealthChecker,
  FileSystemHealthChecker,
  MemoryHealthChecker,
  NetworkHealthChecker,
  ProcessHealthChecker,
} from '@dangerprep/health';

// Database connectivity
const dbChecker = new DatabaseHealthChecker({
  connection: dbConnection,
  timeout: 5000,
});

// File system checks
const fsChecker = new FileSystemHealthChecker({
  paths: ['/data', '/logs'],
  minFreeSpacePercent: 10,
});

// Memory usage
const memoryChecker = new MemoryHealthChecker({
  maxUsagePercent: 80,
  includeSwap: true,
});

// Network connectivity
const networkChecker = new NetworkHealthChecker({
  endpoints: ['https://api.example.com/health'],
  timeout: 3000,
});

// Process health
const processChecker = new ProcessHealthChecker({
  maxCpuPercent: 90,
  maxMemoryMB: 1024,
});
```

### Custom Health Checker

```typescript
import { HealthChecker, HealthStatus } from '@dangerprep/health';

class CustomServiceHealthChecker extends HealthChecker {
  constructor(private service: MyCustomService) {
    super('custom-service');
  }

  async check(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      // Perform your custom health check logic
      const isHealthy = await this.service.isHealthy();
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        return {
          status: 'healthy',
          message: 'Service is operating normally',
          timestamp: new Date(),
          details: {
            responseTime,
            version: this.service.getVersion(),
            uptime: this.service.getUptime(),
          },
        };
      } else {
        return {
          status: 'unhealthy',
          message: 'Service health check failed',
          timestamp: new Date(),
          details: { responseTime },
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Health check threw an exception',
        timestamp: new Date(),
        error: error.message,
        details: {
          responseTime: Date.now() - startTime,
        },
      };
    }
  }
}
```

## Health Monitoring Service

For system-wide health monitoring:

```typescript
import { HealthMonitoringService } from '@dangerprep/health';

const healthService = new HealthMonitoringService({
  name: 'system-health-monitor',
  port: 8080,
  healthEndpoint: '/health',
  metricsEndpoint: '/metrics',
  checkers: [
    new DatabaseHealthChecker(dbConnection),
    new RedisHealthChecker(redisClient),
    new FileSystemHealthChecker({ paths: ['/data'] }),
  ],
  monitoring: {
    interval: 30000,
    enableMetrics: true,
    enableAlerts: true,
  },
});

await healthService.start();

// Health endpoint will be available at http://localhost:8080/health
// Returns JSON with overall status and individual check results
```

## Health Utilities

Utility functions for common health checks:

```typescript
import { HealthUtils } from '@dangerprep/health';

// Check database connection
const dbStatus = await HealthUtils.checkDatabaseConnection(connection, {
  timeout: 5000,
  query: 'SELECT 1',
});

// Check memory usage
const memoryStatus = await HealthUtils.checkMemoryUsage({
  maxUsagePercent: 80,
  includeSwap: true,
});

// Check disk space
const diskStatus = await HealthUtils.checkDiskSpace({
  path: '/data',
  minFreePercent: 10,
  minFreeBytes: 1024 * 1024 * 1024, // 1GB
});

// Check network connectivity
const networkStatus = await HealthUtils.checkNetworkConnectivity({
  host: 'google.com',
  port: 80,
  timeout: 3000,
});

// Check process health
const processStatus = await HealthUtils.checkProcessHealth({
  maxCpuPercent: 90,
  maxMemoryMB: 1024,
  checkInterval: 5000,
});
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

interface AggregatedHealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  timestamp: Date;
  checks: Record<string, HealthStatus>;
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}
```

## Configuration

```typescript
interface HealthMonitorConfig {
  interval: number;                    // Check interval in milliseconds
  timeout: number;                     // Individual check timeout
  retries: number;                     // Number of retries for failed checks
  enableMetrics: boolean;              // Enable metrics collection
  enableAlerts: boolean;               // Enable alerting
  alertThreshold: number;              // Number of consecutive failures before alert
  onStatusChange?: (status: AggregatedHealthStatus) => void;
}
```

## Best Practices

1. **Use Appropriate Timeouts**: Set reasonable timeouts for health checks to avoid blocking
2. **Implement Graceful Degradation**: Use 'degraded' status for partial functionality
3. **Include Relevant Details**: Provide useful information in the details field
4. **Monitor Continuously**: Use periodic monitoring for production services
5. **Handle Errors Gracefully**: Always catch and handle exceptions in health checks
6. **Use Aggregation**: Combine multiple checks for overall service health

## Integration Examples

### With Express.js

```typescript
import express from 'express';
import { HealthMonitoringService } from '@dangerprep/health';

const app = express();
const healthService = new HealthMonitoringService(config);

app.get('/health', async (req, res) => {
  const status = await healthService.getAggregatedStatus();
  const httpStatus = status.status === 'healthy' ? 200 : 503;
  res.status(httpStatus).json(status);
});
```

### With Docker Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1
```

## Dependencies

- `@dangerprep/logging` - Logging support
- `@dangerprep/configuration` - Configuration management
- Built-in Node.js modules for system checks

## License

MIT
