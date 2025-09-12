# @dangerprep/logging

Modern structured logging for DangerPrep services with TypeScript-first design.

## Overview

Comprehensive logging solution with structured logging, multiple transports, log rotation, and TypeScript-first design optimized for production use.

## Features

- **Structured Logging** - JSON and text format support
- **Multiple Transports** - Console and file transports with rotation
- **Child Loggers** - Component-specific loggers with inherited configuration
- **Factory Methods** - Pre-configured loggers for common use cases
- **Performance Optimized** - Efficient logging with minimal overhead

## Installation

```bash
yarn add @dangerprep/logging
```

## Usage

### Basic Logger

```typescript
import { LoggerFactory, LogLevel } from '@dangerprep/logging';

const logger = LoggerFactory.createLogger({
  name: 'my-service',
  level: LogLevel.INFO,
});

logger.info('Service started');
logger.error('An error occurred', { error: new Error('Something went wrong') });
```

### File Logging with Rotation

```typescript
const logger = LoggerFactory.createFileLogger({
  name: 'my-service',
  level: LogLevel.DEBUG,
  filePath: '/var/log/my-service.log',
  rotation: { maxSize: '10MB', maxFiles: 5 },
});
```

### Child Loggers

```typescript
const parentLogger = LoggerFactory.createLogger({ name: 'my-service' });
const dbLogger = parentLogger.child({ component: 'database' });
const apiLogger = parentLogger.child({ component: 'api' });

dbLogger.info('Database connection established');
apiLogger.warn('API rate limit approaching', { currentRate: 95 });
```

## Configuration

### Log Levels and Transports

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Console transport
const consoleTransport = new ConsoleTransport({
  format: 'text',
  colorize: true,
  level: LogLevel.DEBUG,
});

// File transport with rotation
const fileTransport = new FileTransport({
  filePath: '/var/log/app.log',
  format: 'json',
  rotation: { maxSize: '100MB', maxFiles: 10 },
});
```

## Factory Methods

```typescript
// Development logger (console, text format, DEBUG level)
const devLogger = LoggerFactory.createDevelopmentLogger('my-service');

// Production logger (file, JSON format, INFO level)
const prodLogger = LoggerFactory.createProductionLogger({
  name: 'my-service',
  logDir: '/var/log',
});

// Service logger (both console and file)
const serviceLogger = LoggerFactory.createServiceLogger({
  name: 'my-service',
  logDir: '/var/log',
  enableConsole: true,
});
```

## Advanced Usage

### Structured Logging

```typescript
logger.info('Processing request', {
  requestId: 'req-123',
  userId: 'user-456',
  duration: 150,
});

// Error logging
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error, operation: 'riskyOperation' });
}
```

### Performance Logging

```typescript
const timer = logger.startTimer();
await longRunningOperation();
timer.done('Operation completed');
```

## Log Formats

**Text (Development):**
```
2024-01-15 10:30:45 [INFO] my-service: Service started
```

**JSON (Production):**
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "logger": "my-service",
  "message": "Service started"
}
```

## Dependencies

- `@dangerprep/files` - File system utilities for log rotation

## License

MIT
