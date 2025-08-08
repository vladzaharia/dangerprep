# @dangerprep/types

Shared TypeScript types and interfaces for DangerPrep services.

## Overview

The `@dangerprep/types` package provides common types, interfaces, and utility functions used across multiple DangerPrep services. It ensures consistency and reduces duplication by centralizing type definitions for sync operations, transfers, progress tracking, service management, and error handling.

## Features

- **Sync Types** - Types for synchronization operations, statuses, and configurations
- **Transfer Types** - File transfer types with progress and status tracking
- **Progress Types** - Progress tracking types with phases and ETA calculations
- **Service Types** - Service lifecycle, health, and operation types
- **Error Types** - Comprehensive error handling types with retry strategies
- **Utility Functions** - Type guards and helper functions for type safety
- **Constants** - Shared constants and enums for consistent values

## Installation

```bash
yarn add @dangerprep/types
```

## Type Categories

### Sync Types

Types for synchronization operations:

```typescript
import { 
  SyncOperation,
  SyncResult,
  SyncStatus,
  SyncDirection,
  SyncType,
  SyncStats,
  SYNC_STATUSES,
  SYNC_DIRECTIONS,
  SYNC_TYPES,
} from '@dangerprep/types';

// Sync operation definition
const operation: SyncOperation = {
  id: 'sync-001',
  type: 'directory',
  source: '/source/path',
  target: '/target/path',
  direction: 'bidirectional',
  status: 'pending',
  createdAt: new Date(),
};

// Check sync status
if (isSyncStatus(operation.status)) {
  console.log(`Valid sync status: ${operation.status}`);
}

// Create sync operation
const newOperation = createSyncOperation({
  type: 'file',
  source: '/file.txt',
  target: '/backup/file.txt',
  direction: 'source-to-target',
});
```

### Transfer Types

Types for file transfer operations:

```typescript
import {
  FileTransfer,
  TransferStatus,
  TransferProgress,
  TransferStats,
  TRANSFER_STATUSES,
} from '@dangerprep/types';

// File transfer definition
const transfer: FileTransfer = {
  id: 'transfer-001',
  source: '/large-file.zip',
  target: '/backup/large-file.zip',
  status: 'in-progress',
  progress: {
    bytesTransferred: 1024 * 1024 * 50, // 50 MB
    totalBytes: 1024 * 1024 * 100,      // 100 MB
    percentage: 50,
    speed: 1024 * 1024 * 2,             // 2 MB/s
    eta: 25000,                         // 25 seconds
  },
  startedAt: new Date(),
};

// Calculate transfer progress
const progress = calculateTransferProgress(
  transfer.progress.bytesTransferred,
  transfer.progress.totalBytes,
  transfer.startedAt
);
```

### Progress Types

Types for progress tracking:

```typescript
import {
  ProgressInfo,
  ProgressPhase,
  ProgressStatus,
  ProgressUpdate,
} from '@dangerprep/types';

// Progress tracking with phases
const progressInfo: ProgressInfo = {
  id: 'progress-001',
  status: 'in-progress',
  current: 500,
  total: 1000,
  percentage: 50,
  phases: [
    { name: 'scan', weight: 0.1, status: 'completed' },
    { name: 'transfer', weight: 0.8, status: 'in-progress' },
    { name: 'verify', weight: 0.1, status: 'pending' },
  ],
  startTime: new Date(),
  estimatedEndTime: new Date(Date.now() + 30000),
};

// Calculate progress metrics
const speed = calculateSpeed(progressInfo.current, progressInfo.startTime);
const eta = calculateETA(progressInfo.current, progressInfo.total, speed);
```

### Service Types

Types for service management:

```typescript
import {
  ServiceOperation,
  ServiceHealth,
  ServiceState,
  ServiceStats,
  OperationStatus,
} from '@dangerprep/types';

// Service operation
const operation: ServiceOperation = {
  id: 'op-001',
  type: 'sync',
  status: 'running',
  startTime: new Date(),
  progress: {
    current: 75,
    total: 100,
    percentage: 75,
  },
  metadata: {
    source: '/data',
    target: '/backup',
  },
};

// Service health check
const health: ServiceHealth = {
  status: 'healthy',
  message: 'All systems operational',
  timestamp: new Date(),
  checks: {
    database: { status: 'healthy', responseTime: 50 },
    storage: { status: 'healthy', freeSpace: '85%' },
    network: { status: 'healthy', latency: 25 },
  },
};

// Calculate service uptime
const uptime = calculateServiceUptime(service.startTime);
```

### Error Types

Types for error handling and recovery:

```typescript
import {
  SyncError,
  SyncResult,
  SyncErrorSeverity,
  SyncErrorCategory,
  RecoveryAction,
  RetryStrategy,
} from '@dangerprep/types';

// Error definition
const error: SyncError = {
  code: 'TRANSFER_FAILED',
  message: 'File transfer failed due to network timeout',
  severity: 'high',
  category: 'network',
  retryable: true,
  context: {
    operation: 'file-transfer',
    source: '/file.txt',
    target: '/backup/file.txt',
    attempt: 2,
  },
  timestamp: new Date(),
};

// Check if error is retryable
if (isRetryableError(error)) {
  const strategy = getDefaultRecoveryStrategy(error);
  console.log(`Retry strategy: ${strategy.type}`);
}

// Create result with error
const result = createErrorResult(error, {
  operation: 'sync',
  duration: 5000,
});
```

## Utility Functions

### Type Guards

```typescript
import {
  isSyncStatus,
  isSyncDirection,
  isTransferStatus,
  isOperationStatus,
  isServiceHealth,
} from '@dangerprep/types';

// Type-safe checking
if (isSyncStatus(status)) {
  // TypeScript knows status is SyncStatus
}

if (isTransferStatus(transferStatus)) {
  // TypeScript knows transferStatus is TransferStatus
}
```

### Factory Functions

```typescript
import {
  createSyncOperation,
  createFileTransfer,
  createProgressInfo,
  createServiceOperation,
  createSyncError,
} from '@dangerprep/types';

// Create typed objects with defaults
const operation = createSyncOperation({
  type: 'directory',
  source: '/source',
  target: '/target',
});

const transfer = createFileTransfer({
  source: '/file.txt',
  target: '/backup/file.txt',
});

const progress = createProgressInfo({
  total: 1000,
  description: 'Processing items',
});
```

### Calculation Functions

```typescript
import {
  calculateProgress,
  calculateSpeed,
  calculateETA,
  calculateSyncSuccessRate,
  calculateServiceUptime,
} from '@dangerprep/types';

// Progress calculations
const percentage = calculateProgress(current, total);
const speed = calculateSpeed(bytesTransferred, startTime);
const eta = calculateETA(current, total, speed);

// Service metrics
const successRate = calculateSyncSuccessRate(operations);
const uptime = calculateServiceUptime(serviceStartTime);
```

## Constants and Enums

### Sync Constants

```typescript
import { SYNC_STATUSES, SYNC_DIRECTIONS, SYNC_TYPES } from '@dangerprep/types';

// Available sync statuses
console.log(SYNC_STATUSES); // ['pending', 'running', 'completed', 'failed', 'cancelled']

// Available sync directions
console.log(SYNC_DIRECTIONS); // ['source-to-target', 'target-to-source', 'bidirectional']

// Available sync types
console.log(SYNC_TYPES); // ['file', 'directory', 'database', 'api']
```

### Transfer Constants

```typescript
import { TRANSFER_STATUSES } from '@dangerprep/types';

console.log(TRANSFER_STATUSES); // ['pending', 'in-progress', 'completed', 'failed', 'paused']
```

### Service Constants

```typescript
import { ServiceHealth, ServiceState, OPERATION_STATUSES } from '@dangerprep/types';

// Service health states
type HealthStatus = ServiceHealth; // 'healthy' | 'unhealthy' | 'degraded'

// Service states
type State = ServiceState; // 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

// Operation statuses
console.log(OPERATION_STATUSES); // ['pending', 'running', 'completed', 'failed', 'cancelled']
```

## Best Practices

1. **Use Type Guards**: Always use provided type guards for runtime type checking
2. **Leverage Factory Functions**: Use factory functions to create objects with proper defaults
3. **Import Specific Types**: Import only the types you need to reduce bundle size
4. **Use Constants**: Use provided constants instead of string literals
5. **Handle Errors Properly**: Use the error types and utility functions for consistent error handling

## Integration Example

```typescript
import {
  SyncOperation,
  SyncResult,
  createSyncOperation,
  createSuccessResult,
  isSyncStatus,
} from '@dangerprep/types';

class SyncService {
  async performSync(config: SyncConfig): Promise<SyncResult> {
    const operation = createSyncOperation({
      type: 'directory',
      source: config.source,
      target: config.target,
      direction: 'bidirectional',
    });

    try {
      // Perform sync operation
      const stats = await this.doSync(operation);
      
      return createSuccessResult({
        operation: operation.id,
        stats,
        duration: Date.now() - operation.createdAt.getTime(),
      });
    } catch (error) {
      return createErrorResult(error, {
        operation: operation.id,
        duration: Date.now() - operation.createdAt.getTime(),
      });
    }
  }
}
```

## Dependencies

This package has no runtime dependencies and only provides TypeScript type definitions and utility functions.

## License

MIT
