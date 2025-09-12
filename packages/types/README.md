# @dangerprep/types

Shared TypeScript types and interfaces for DangerPrep services.

## Overview

Centralizes type definitions for sync operations, transfers, progress tracking, service management, and error handling across DangerPrep services.

## Features

- **Sync Types** - Synchronization operations, statuses, and configurations
- **Transfer Types** - File transfer with progress and status tracking
- **Progress Types** - Progress tracking with phases and ETA calculations
- **Service Types** - Service lifecycle, health, and operation types
- **Error Types** - Error handling with retry strategies
- **Utility Functions** - Type guards and helper functions

## Installation

```bash
yarn add @dangerprep/types
```

## Usage

### Sync Types

```typescript
import { SyncOperation, createSyncOperation } from '@dangerprep/types';

const operation: SyncOperation = {
  id: 'sync-001',
  type: 'directory',
  source: '/source/path',
  target: '/target/path',
  direction: 'bidirectional',
  status: 'pending',
  createdAt: new Date(),
};
```

### Transfer Types

```typescript
import { FileTransfer, calculateTransferProgress } from '@dangerprep/types';

const transfer: FileTransfer = {
  id: 'transfer-001',
  source: '/large-file.zip',
  target: '/backup/large-file.zip',
  status: 'in-progress',
  progress: {
    bytesTransferred: 1024 * 1024 * 50,
    totalBytes: 1024 * 1024 * 100,
    percentage: 50,
  },
  startedAt: new Date(),
};
```

### Progress Types

```typescript
import { ProgressInfo } from '@dangerprep/types';

const progressInfo: ProgressInfo = {
  id: 'progress-001',
  status: 'in-progress',
  current: 500,
  total: 1000,
  percentage: 50,
  phases: [
    { name: 'scan', weight: 0.1, status: 'completed' },
    { name: 'transfer', weight: 0.8, status: 'in-progress' },
  ],
  startTime: new Date(),
};
```

### Service Types

```typescript
import { ServiceOperation, ServiceHealth } from '@dangerprep/types';

const operation: ServiceOperation = {
  id: 'op-001',
  type: 'sync',
  status: 'running',
  startTime: new Date(),
  progress: { current: 75, total: 100, percentage: 75 },
};

const health: ServiceHealth = {
  status: 'healthy',
  message: 'All systems operational',
  timestamp: new Date(),
};
```

### Error Types

```typescript
import { SyncError, isRetryableError } from '@dangerprep/types';

const error: SyncError = {
  code: 'TRANSFER_FAILED',
  message: 'File transfer failed',
  severity: 'high',
  category: 'network',
  retryable: true,
  timestamp: new Date(),
};
```

## Utility Functions

### Type Guards and Factory Functions

```typescript
import {
  isSyncStatus,
  isTransferStatus,
  createSyncOperation,
  createFileTransfer,
  calculateProgress,
  calculateSpeed,
} from '@dangerprep/types';

// Type-safe checking
if (isSyncStatus(status)) {
  // TypeScript knows status is SyncStatus
}

// Create objects with defaults
const operation = createSyncOperation({
  type: 'directory',
  source: '/source',
  target: '/target',
});

// Calculations
const percentage = calculateProgress(current, total);
const speed = calculateSpeed(bytesTransferred, startTime);
```

## Constants

```typescript
import { SYNC_STATUSES, SYNC_DIRECTIONS, TRANSFER_STATUSES } from '@dangerprep/types';

// Available constants
SYNC_STATUSES      // ['pending', 'running', 'completed', 'failed', 'cancelled']
SYNC_DIRECTIONS    // ['source-to-target', 'target-to-source', 'bidirectional']
TRANSFER_STATUSES  // ['pending', 'in-progress', 'completed', 'failed', 'paused']
```

## License

MIT
