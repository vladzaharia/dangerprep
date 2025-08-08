# @dangerprep/configuration

TypeScript-first configuration management with Zod validation for DangerPrep services.

## Overview

The `@dangerprep/configuration` package provides a robust, type-safe configuration management system built on top of Zod schemas. It supports YAML file loading/saving, environment variable substitution, default configuration merging, and comprehensive validation.

## Features

- **TypeScript-First** - Full type safety with Zod schema validation
- **YAML Support** - Load and save configurations in YAML format
- **Environment Variables** - Support for environment variable substitution and overrides
- **Default Merging** - Merge default configurations with loaded configs
- **Path Resolution** - Support for environment variable-based config path overrides
- **Validation** - Comprehensive validation with detailed error reporting
- **Dot Notation** - Get/set configuration values using dot notation paths
- **Hot Reloading** - Reload configuration without restarting the service

## Installation

```bash
yarn add @dangerprep/configuration
```

## Quick Start

### Basic Configuration Management

```typescript
import { ConfigManager, z } from '@dangerprep/configuration';

// Define your configuration schema
const MyConfigSchema = z.object({
  server: z.object({
    port: z.number().default(3000),
    host: z.string().default('localhost'),
  }),
  database: z.object({
    url: z.string(),
    maxConnections: z.number().default(10),
  }),
  features: z.object({
    enableLogging: z.boolean().default(true),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
});

type MyConfig = z.infer<typeof MyConfigSchema>;

// Create configuration manager
const configManager = new ConfigManager(
  './config/app.yaml',
  MyConfigSchema,
  {
    createDirs: true,
    enableEnvSubstitution: true,
    defaults: {
      server: { port: 8080 },
    },
  }
);

// Load configuration
const config = await configManager.loadConfig();
console.log(`Server will run on port ${config.server.port}`);
```

### Configuration with Environment Variables

```typescript
// config.yaml
server:
  port: ${PORT:3000}
  host: ${HOST:localhost}
database:
  url: ${DATABASE_URL}
  maxConnections: ${DB_MAX_CONNECTIONS:10}

// Usage
const configManager = new ConfigManager(
  './config.yaml',
  MyConfigSchema,
  {
    enableEnvSubstitution: true, // Enable ${VAR:default} substitution
    envPrefix: 'MYAPP_', // Automatically load MYAPP_* environment variables
  }
);

const config = await configManager.loadConfig();
```

### Configuration Factory Pattern

```typescript
import { ConfigFactory } from '@dangerprep/configuration';

// Create configurations for different environments
const configFactory = new ConfigFactory();

// Development configuration
const devConfig = configFactory
  .base(MyConfigSchema)
  .withDefaults({
    server: { port: 3000 },
    features: { logLevel: 'debug' },
  })
  .withEnvSubstitution()
  .build('./config/dev.yaml');

// Production configuration
const prodConfig = configFactory
  .base(MyConfigSchema)
  .withDefaults({
    server: { port: 8080 },
    features: { logLevel: 'warn' },
  })
  .withValidation({ strict: true })
  .build('./config/prod.yaml');
```

### Standard Configuration Schemas

The package provides common configuration schemas:

```typescript
import { 
  ServerConfigSchema,
  DatabaseConfigSchema,
  LoggingConfigSchema,
  SecurityConfigSchema,
} from '@dangerprep/configuration';

// Compose schemas
const AppConfigSchema = z.object({
  server: ServerConfigSchema,
  database: DatabaseConfigSchema,
  logging: LoggingConfigSchema,
  security: SecurityConfigSchema,
  // Your custom configuration
  features: z.object({
    enableFeatureX: z.boolean().default(false),
  }),
});
```

## API Reference

### ConfigManager

The main configuration management class:

```typescript
class ConfigManager<T> {
  constructor(configPath: string, schema: ZodSchema<T>, options?: ConfigOptions);
  
  // Core methods
  async loadConfig(): Promise<T>;
  async saveConfig(config: T): Promise<void>;
  async reloadConfig(): Promise<T>;
  getConfig(): T;
  
  // Validation
  validateConfig(config: unknown): T;
  validateAndTransform(config: unknown): T;
  
  // Utilities
  async configExists(): Promise<boolean>;
  getConfigPath(): string;
  isLoaded(): boolean;
  
  // Value access
  getConfigValue<K>(path: string): K | undefined;
  setConfigValue(path: string, value: unknown): void;
  
  // Updates
  async updateConfig(updates: Partial<T>): Promise<T>;
  async createDefaultConfig(defaultConfig: T): Promise<void>;
}
```

### Configuration Options

```typescript
interface ConfigOptions {
  logger?: Logger;                    // Logger for configuration operations
  createDirs?: boolean;              // Create parent directories (default: true)
  enableEnvSubstitution?: boolean;   // Enable ${VAR:default} substitution
  enableTransformations?: boolean;   // Enable automatic transformations
  defaults?: Record<string, unknown>; // Default configuration to merge
  envPrefix?: string;                // Environment variable prefix
  yamlOptions?: {                    // YAML formatting options
    indent?: number;
    lineWidth?: number;
    noRefs?: boolean;
  };
}
```

### Environment Variable Substitution

Supports flexible environment variable substitution:

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

// Size utilities
const maxSize = SIZE.MB(100); // 100 MB in bytes
const cacheSize = SIZE.GB(2);  // 2 GB in bytes

// Time utilities
const timeout = TIME.MINUTES(5); // 5 minutes in milliseconds
const interval = TIME.HOURS(1);  // 1 hour in milliseconds

// Configuration merging
const merged = ConfigUtils.mergeConfigs(defaults, userConfig);

// Environment variable processing
const processed = ConfigUtils.processEnvVars(config);
```

## Error Handling

The package provides detailed error information:

```typescript
import { ConfigValidationError } from '@dangerprep/configuration';

try {
  const config = await configManager.loadConfig();
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('Validation failed:');
    error.getFormattedErrors().forEach(err => {
      console.error(`  ${err}`);
    });
  }
}
```

## Best Practices

1. **Use Environment Variables for Secrets**:
   ```yaml
   database:
     password: ${DB_PASSWORD}  # Never commit secrets
   ```

2. **Provide Sensible Defaults**:
   ```typescript
   const schema = z.object({
     port: z.number().default(3000),
     timeout: z.number().default(30000),
   });
   ```

3. **Validate Early**:
   ```typescript
   // Validate configuration at startup
   const config = await configManager.loadConfig();
   ```

4. **Use Type-Safe Access**:
   ```typescript
   // TypeScript will catch typos and type errors
   const port: number = config.server.port;
   ```

## Dependencies

- `@dangerprep/files` - File system utilities
- `@dangerprep/logging` - Logging support
- `js-yaml` - YAML parsing and serialization
- `zod` - Schema validation

## License

MIT
