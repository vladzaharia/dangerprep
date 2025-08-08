# @dangerprep/logging

Modern structured logging for DangerPrep services with TypeScript-first design.

## Overview

The `@dangerprep/logging` package provides a comprehensive logging solution with structured logging, multiple transports, log rotation, and TypeScript-first design. It's optimized for production use with proper error handling and performance considerations.

## Features

- **Structured Logging** - JSON and text format support with structured data
- **Multiple Transports** - Console and file transports with configurable formatting
- **Log Rotation** - Automatic log rotation with size and file count limits
- **TypeScript-First** - Full type safety and proper error handling
- **Child Loggers** - Component-specific loggers with inherited configuration
- **Factory Methods** - Pre-configured loggers for common use cases
- **Performance Optimized** - Efficient logging with minimal overhead
- **Contextual Logging** - Rich context support for debugging and monitoring

## Installation

```bash
yarn add @dangerprep/logging
```

## Quick Start

### Basic Logger Usage

```typescript
import { LoggerFactory, LogLevel } from '@dangerprep/logging';

// Create a logger with default configuration
const logger = LoggerFactory.createLogger({
  name: 'my-service',
  level: LogLevel.INFO,
});

// Basic logging
logger.info('Service started');
logger.warn('This is a warning');
logger.error('An error occurred', { error: new Error('Something went wrong') });

// Structured logging with context
logger.info('User action', {
  userId: '12345',
  action: 'login',
  timestamp: new Date(),
  metadata: {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
  },
});
```

### File Logging with Rotation

```typescript
import { LoggerFactory, LogLevel } from '@dangerprep/logging';

const logger = LoggerFactory.createFileLogger({
  name: 'my-service',
  level: LogLevel.DEBUG,
  filePath: '/var/log/my-service.log',
  rotation: {
    maxSize: '10MB',
    maxFiles: 5,
  },
});

logger.info('This will be written to file with rotation');
```

### Multiple Transports

```typescript
import { Logger, ConsoleTransport, FileTransport, LogLevel } from '@dangerprep/logging';

const logger = new Logger({
  name: 'my-service',
  level: LogLevel.INFO,
  transports: [
    new ConsoleTransport({
      format: 'text',
      colorize: true,
    }),
    new FileTransport({
      filePath: '/var/log/app.log',
      format: 'json',
      rotation: {
        maxSize: '50MB',
        maxFiles: 10,
      },
    }),
  ],
});
```

### Child Loggers

```typescript
// Create a parent logger
const parentLogger = LoggerFactory.createLogger({
  name: 'my-service',
  level: LogLevel.INFO,
});

// Create child loggers for different components
const dbLogger = parentLogger.child({ component: 'database' });
const apiLogger = parentLogger.child({ component: 'api' });

// Child loggers inherit parent configuration and add context
dbLogger.info('Database connection established');
apiLogger.warn('API rate limit approaching', { currentRate: 95 });
```

## Configuration

### Logger Configuration

```typescript
interface LoggerConfig {
  name: string;                    // Logger name
  level: LogLevel;                 // Minimum log level
  transports?: LogTransport[];     // Custom transports
  defaultContext?: Record<string, unknown>; // Default context for all logs
}
```

### Log Levels

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}
```

### Console Transport

```typescript
const consoleTransport = new ConsoleTransport({
  format: 'text',        // 'text' | 'json'
  colorize: true,        // Enable colors in console output
  timestamp: true,       // Include timestamps
  level: LogLevel.DEBUG, // Transport-specific log level
});
```

### File Transport

```typescript
const fileTransport = new FileTransport({
  filePath: '/var/log/app.log',
  format: 'json',
  rotation: {
    maxSize: '100MB',    // Maximum file size before rotation
    maxFiles: 10,        // Maximum number of rotated files to keep
  },
  level: LogLevel.INFO,
});
```

## Factory Methods

The `LoggerFactory` provides convenient methods for common configurations:

### Development Logger

```typescript
const logger = LoggerFactory.createDevelopmentLogger('my-service');
// - Console transport with text format and colors
// - DEBUG level
// - Optimized for development
```

### Production Logger

```typescript
const logger = LoggerFactory.createProductionLogger({
  name: 'my-service',
  logDir: '/var/log',
});
// - File transport with JSON format
// - Log rotation enabled
// - INFO level
// - Optimized for production
```

### Service Logger

```typescript
const logger = LoggerFactory.createServiceLogger({
  name: 'my-service',
  logDir: '/var/log',
  enableConsole: true,
});
// - Both console and file transports
// - Appropriate for service deployment
```

## Advanced Usage

### Structured Logging

```typescript
// Log with rich context
logger.info('Processing request', {
  requestId: 'req-123',
  userId: 'user-456',
  operation: 'getData',
  duration: 150,
  metadata: {
    source: 'api',
    version: '1.2.3',
  },
});

// Log errors with stack traces
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', {
    error,
    operation: 'riskyOperation',
    context: { userId: '123' },
  });
}
```

### Performance Logging

```typescript
// Time operations
const timer = logger.startTimer();
await longRunningOperation();
timer.done('Operation completed');

// Or manually
const start = Date.now();
await operation();
logger.info('Operation completed', {
  duration: Date.now() - start,
  operation: 'longRunningOperation',
});
```

### Conditional Logging

```typescript
// Only log if debug level is enabled
if (logger.isDebugEnabled()) {
  const expensiveData = computeExpensiveDebugData();
  logger.debug('Debug information', { data: expensiveData });
}
```

## Log Formats

### Text Format (Development)

```
2024-01-15 10:30:45 [INFO] my-service: Service started
2024-01-15 10:30:46 [WARN] my-service: Rate limit approaching (component=api, rate=95)
```

### JSON Format (Production)

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "logger": "my-service",
  "message": "Service started",
  "context": {}
}
{
  "timestamp": "2024-01-15T10:30:46.456Z",
  "level": "warn",
  "logger": "my-service",
  "message": "Rate limit approaching",
  "context": {
    "component": "api",
    "rate": 95
  }
}
```

## Best Practices

1. **Use Appropriate Log Levels**:
   ```typescript
   logger.debug('Detailed debugging information');
   logger.info('General information');
   logger.warn('Warning conditions');
   logger.error('Error conditions');
   ```

2. **Include Context**:
   ```typescript
   logger.info('User action', {
     userId,
     action,
     timestamp: new Date(),
   });
   ```

3. **Use Child Loggers for Components**:
   ```typescript
   const dbLogger = logger.child({ component: 'database' });
   const cacheLogger = logger.child({ component: 'cache' });
   ```

4. **Handle Errors Properly**:
   ```typescript
   logger.error('Database error', {
     error: error.message,
     stack: error.stack,
     query: sqlQuery,
   });
   ```

5. **Use Structured Data**:
   ```typescript
   // Good
   logger.info('Request processed', { requestId, duration, statusCode });
   
   // Avoid
   logger.info(`Request ${requestId} processed in ${duration}ms with status ${statusCode}`);
   ```

## Integration with Services

The logging package integrates seamlessly with the service package:

```typescript
import { BaseService } from '@dangerprep/service';
import { LoggerFactory } from '@dangerprep/logging';

class MyService extends BaseService {
  constructor(config: MyServiceConfig) {
    super({
      ...config,
      logger: LoggerFactory.createServiceLogger({
        name: config.name,
        logDir: config.logDir,
      }),
    });
  }
}
```

## Dependencies

- `@dangerprep/files` - File system utilities for log rotation
- Built-in Node.js modules for core functionality

## License

MIT
