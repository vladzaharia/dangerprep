# @dangerprep/shared

Shared utilities and libraries for DangerPrep sync services.

## Features

- **Structured Logging**: Modern TypeScript logging with multiple transports, log rotation, and proper error handling
- **File Utilities**: Common file operations including size parsing, directory management, and rsync functionality
- **Configuration Management**: Type-safe YAML configuration loading and validation
- **Scheduling Utilities**: Cron-based task scheduling with proper error handling

## Usage

```typescript
import { Logger, FileUtils, ConfigManager, Scheduler } from '@dangerprep/shared';

// Or import specific modules
import { Logger } from '@dangerprep/shared/logging';
import { FileUtils } from '@dangerprep/shared/files';
```

## Development

This package is part of the DangerPrep monorepo and uses Turborepo for build orchestration.

```bash
# Build the shared library
yarn workspace @dangerprep/shared build

# Run tests
yarn workspace @dangerprep/shared test

# Lint and format
yarn workspace @dangerprep/shared lint
yarn workspace @dangerprep/shared format
```
