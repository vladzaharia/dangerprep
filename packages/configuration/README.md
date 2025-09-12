# @dangerprep/configuration

TypeScript-first configuration management with Zod validation for DangerPrep services.

## Overview

Robust, type-safe configuration management system built on Zod schemas with YAML file loading/saving, environment variable substitution, default configuration merging, and comprehensive validation.

## Features

- **TypeScript-First** - Full type safety with Zod schema validation
- **YAML Support** - Load and save configurations in YAML format
- **Environment Variables** - Support for environment variable substitution and overrides
- **Default Merging** - Merge default configurations with loaded configs
- **Validation** - Comprehensive validation with detailed error reporting
- **Hot Reloading** - Reload configuration without restarting the service

## Installation

```bash
yarn add @dangerprep/configuration
```

## Usage

### Basic Configuration Management

```typescript
import { ConfigManager, z } from '@dangerprep/configuration';

const MyConfigSchema = z.object({
  server: z.object({
    port: z.number().default(3000),
    host: z.string().default('localhost'),
  }),
  database: z.object({
    url: z.string(),
    maxConnections: z.number().default(10),
  }),
});

const configManager = new ConfigManager('./config/app.yaml', MyConfigSchema, {
  createDirs: true,
  enableEnvSubstitution: true,
});

const config = await configManager.loadConfig();
```

### Environment Variables

```yaml
# config.yaml
server:
  port: ${PORT:3000}
  host: ${HOST:localhost}
database:
  url: ${DATABASE_URL}
  maxConnections: ${DB_MAX_CONNECTIONS:10}
```

```typescript
const configManager = new ConfigManager('./config.yaml', MyConfigSchema, {
  enableEnvSubstitution: true, // Enable ${VAR:default} substitution
  envPrefix: 'MYAPP_', // Load MYAPP_* environment variables
});
```

### Configuration Factory

```typescript
import { ConfigFactory } from '@dangerprep/configuration';

const configFactory = new ConfigFactory();

const devConfig = configFactory
  .base(MyConfigSchema)
  .withDefaults({ server: { port: 3000 } })
  .withEnvSubstitution()
  .build('./config/dev.yaml');
```

### Standard Schemas

```typescript
import {
  ServerConfigSchema,
  DatabaseConfigSchema,
  LoggingConfigSchema,
} from '@dangerprep/configuration';

const AppConfigSchema = z.object({
  server: ServerConfigSchema,
  database: DatabaseConfigSchema,
  logging: LoggingConfigSchema,
});
```

## API Reference

### ConfigManager

```typescript
class ConfigManager<T> {
  constructor(configPath: string, schema: ZodSchema<T>, options?: ConfigOptions);

  async loadConfig(): Promise<T>;
  async saveConfig(config: T): Promise<void>;
  async reloadConfig(): Promise<T>;
  validateConfig(config: unknown): T;
  async updateConfig(updates: Partial<T>): Promise<T>;
}
```

### Configuration Options

```typescript
interface ConfigOptions {
  createDirs?: boolean;              // Create parent directories
  enableEnvSubstitution?: boolean;   // Enable ${VAR:default} substitution
  defaults?: Record<string, unknown>; // Default configuration to merge
  envPrefix?: string;                // Environment variable prefix
}
```

### Environment Variable Substitution

```yaml
# Basic substitution
database_url: ${DATABASE_URL}

# With default values
port: ${PORT:3000}
host: ${HOST:localhost}

# Nested substitution
redis_url: redis://${REDIS_HOST:localhost}:${REDIS_PORT:6379}
```

### Configuration Utilities

```typescript
import { ConfigUtils, SIZE, TIME } from '@dangerprep/configuration';

const maxSize = SIZE.MB(100);      // 100 MB in bytes
const timeout = TIME.MINUTES(5);   // 5 minutes in milliseconds
const merged = ConfigUtils.mergeConfigs(defaults, userConfig);
```

## Error Handling

```typescript
import { ConfigValidationError } from '@dangerprep/configuration';

try {
  const config = await configManager.loadConfig();
} catch (error) {
  if (error instanceof ConfigValidationError) {
    error.getFormattedErrors().forEach(err => console.error(err));
  }
}
```

## Dependencies

- `@dangerprep/files` - File system utilities
- `@dangerprep/logging` - Logging support
- `js-yaml` - YAML parsing and serialization
- `zod` - Schema validation

## License

MIT
