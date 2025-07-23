# Configuration System

The DangerPrep shared library provides a comprehensive configuration system that standardizes configuration patterns across all sync services. This system includes utilities for parsing, validation, transformation, and environment variable handling.

## Overview

The configuration system consists of several key components:

- **ConfigUtils**: Utilities for parsing sizes, durations, environment variables, and data transformation
- **Standard Schemas**: Reusable Zod schemas for common configuration sections
- **Enhanced ConfigManager**: Extended configuration manager with environment variable support and merging
- **ConfigFactory**: Factory functions for creating standardized service configurations

## Configuration Utilities

### Size and Duration Parsing

```typescript
import { ConfigUtils } from '@dangerprep/shared/config';

// Parse size strings to bytes
const bytes = ConfigUtils.parseSize('2TB'); // 2199023255552
const bandwidth = ConfigUtils.parseBandwidth('25MB/s'); // 26214400

// Parse duration strings to milliseconds
const duration = ConfigUtils.parseDuration('5m30s'); // 330000

// Format back to human-readable
const sizeStr = ConfigUtils.formatSize(2199023255552); // "2.00 TB"
const durationStr = ConfigUtils.formatDuration(330000); // "5m 30s"
```

### Environment Variable Processing

```typescript
// Process environment variables in configuration
const config = {
  database: {
    host: '${DB_HOST:-localhost}',
    port: '${DB_PORT:-5432}',
    password: '${DB_PASSWORD}', // Required, will throw if not set
  },
};

const processedConfig = ConfigUtils.processEnvVars(config);
// Result: { database: { host: 'localhost', port: '5432', password: 'secret' } }
```

### Configuration Merging

```typescript
// Deep merge configurations
const defaults = { logging: { level: 'INFO', file: 'app.log' } };
const userConfig = { logging: { level: 'DEBUG' } };

const merged = ConfigUtils.mergeConfigs(defaults, userConfig);
// Result: { logging: { level: 'DEBUG', file: 'app.log' } }
```

## Standard Schemas

### Common Configuration Sections

```typescript
import { 
  StorageConfigSchema,
  LoggingConfigSchema,
  NetworkConfigSchema,
  StandardSchemas,
} from '@dangerprep/shared/config';

// Use individual schemas
const storageConfig = StorageConfigSchema.parse({
  base_path: './content',
  temp_directory: './temp',
  max_total_size: '2TB',
});

// Create composite schemas
const syncServiceSchema = StandardSchemas.createSyncServiceSchema({
  // Custom fields specific to your service
  api_key: z.string(),
  sync_interval: ConfigUtils.durationTransformer().default('1h'),
});
```

### Available Standard Schemas

- **StorageConfigSchema**: Base paths, temp directories, size limits, permissions
- **LoggingConfigSchema**: Log levels, file rotation, formats
- **NetworkConfigSchema**: Timeouts, retry settings, headers
- **PerformanceConfigSchema**: Concurrency limits, chunk sizes, memory limits
- **HealthCheckConfigSchema**: Health check intervals and endpoints
- **NotificationConfigSchema**: Notification channels and rate limiting
- **ContentTypeConfigSchema**: Content type definitions for sync services
- **SchedulingConfigSchema**: Cron schedules and timing configuration

## Enhanced ConfigManager

### Basic Usage

```typescript
import { ConfigManager, ConfigFactory } from '@dangerprep/shared/config';

// Create a sync service configuration manager
const configManager = ConfigFactory.createSyncServiceConfig(
  './config/sync-service.yml',
  {
    // Custom schema fields
    api_endpoint: z.string().url(),
    sync_interval: ConfigUtils.durationTransformer().default('1h'),
  },
  {
    enableEnvSubstitution: true,
    enableTransformations: true,
  }
);

// Load configuration
const config = await configManager.loadConfig();
```

### Environment Variable Support

```typescript
// Configuration file: config.yml
const yamlConfig = `
metadata:
  name: my-service
  version: "1.0.0"

storage:
  base_path: "\${CONTENT_PATH:-./content}"
  max_total_size: "\${MAX_SIZE:-2TB}"

logging:
  level: "\${LOG_LEVEL:-INFO}"
  file: "\${LOG_FILE}"

api:
  endpoint: "\${API_ENDPOINT}"
  timeout: "\${API_TIMEOUT:-30s}"
`;

// Environment variables are automatically substituted
const config = await configManager.loadConfig();
```

### Configuration with Defaults

```typescript
// Load configuration with default values
const defaults = ConfigFactory.createSyncServiceDefaults('my-service', {
  storage: {
    base_path: './custom-content',
    max_total_size: '1TB',
  },
});

const config = await configManager.loadWithDefaults(defaults);
```

## Configuration Factory

### Service-Specific Configurations

```typescript
import { ConfigFactory } from '@dangerprep/shared/config';

// Create different types of service configurations
const syncConfig = ConfigFactory.createSyncServiceConfig('./config.yml', customSchema);
const networkConfig = ConfigFactory.createNetworkServiceConfig('./config.yml', customSchema);
const storageConfig = ConfigFactory.createStorageServiceConfig('./config.yml', customSchema);
```

### Environment-Specific Configurations

```typescript
// Create environment-specific defaults
const devConfig = ConfigFactory.createEnvironmentConfig('my-service', 'development');
const prodConfig = ConfigFactory.createEnvironmentConfig('my-service', 'production');

// Resolve environment-specific config files
const configPath = ConfigFactory.resolveConfigPath('./config.yml', 'production');
// Result: './config.production.yml'
```

## Zod Transformers

The system provides Zod transformers for automatic data conversion:

```typescript
import { ConfigUtils } from '@dangerprep/shared/config';

const schema = z.object({
  max_size: ConfigUtils.sizeTransformer(), // "2TB" -> 2199023255552
  timeout: ConfigUtils.durationTransformer(), // "30s" -> 30000
  bandwidth: ConfigUtils.bandwidthTransformer(), // "25MB/s" -> 26214400
  extensions: ConfigUtils.extensionsTransformer(), // ["mp4", "mkv"] -> [".mp4", ".mkv"]
  schedule: ConfigUtils.cronValidator(), // Validates cron expressions
});
```

## Migration Guide

### From Basic Configuration

```typescript
// Before: Basic YAML loading
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));

// After: Standardized configuration with validation
const configManager = ConfigFactory.createSyncServiceConfig('./config.yml', {
  custom_field: z.string(),
});
const config = await configManager.loadConfig();
```

### From Custom ConfigManager

```typescript
// Before: Custom configuration wrapper
class MyConfigManager {
  constructor(path: string) {
    this.configManager = new ConfigManager(path, mySchema);
  }
}

// After: Use ConfigFactory
const configManager = ConfigFactory.createSyncServiceConfig('./config.yml', {
  // Your custom schema fields
});
```

## Best Practices

### 1. Use Standard Schemas

```typescript
// Good: Use standard schemas for common sections
const schema = StandardSchemas.createSyncServiceSchema({
  api_key: z.string(),
  custom_setting: z.boolean().default(false),
});

// Avoid: Recreating common configuration sections
const schema = z.object({
  logging: z.object({
    level: z.string(),
    file: z.string(),
    // ... recreating standard logging schema
  }),
});
```

### 2. Enable Environment Variable Substitution

```typescript
// Good: Enable environment variable processing
const configManager = new ConfigManager(path, schema, {
  enableEnvSubstitution: true,
  enableTransformations: true,
});

// Configuration file can use environment variables
// max_size: "${MAX_SIZE:-2TB}"
```

### 3. Use Transformers for Data Types

```typescript
// Good: Use transformers for automatic conversion
const schema = z.object({
  max_size: ConfigUtils.sizeTransformer(),
  timeout: ConfigUtils.durationTransformer(),
});

// Avoid: Manual parsing in application code
const schema = z.object({
  max_size: z.string(),
  timeout: z.string(),
});
// Then manually parsing sizes and durations everywhere
```

### 4. Provide Sensible Defaults

```typescript
// Good: Use factory defaults and environment-specific overrides
const defaults = ConfigFactory.createSyncServiceDefaults('my-service');
const envOverrides = ConfigFactory.createEnvironmentOverrides('production');
const config = ConfigUtils.mergeConfigs(defaults, envOverrides, userConfig);
```

### 5. Validate Early

```typescript
// Good: Validate configuration at startup
try {
  const config = await configManager.loadConfig();
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error('Configuration validation failed:');
    console.error(error.getFormattedErrors().join('\n'));
    process.exit(1);
  }
  throw error;
}
```

## Example Service Configuration

```yaml
# config/sync-service.yml
metadata:
  name: "my-sync-service"
  version: "1.0.0"
  description: "Example sync service"

environment:
  environment: "${ENVIRONMENT:-production}"
  debug: false
  data_directory: "${DATA_DIR:-./data}"

logging:
  level: "${LOG_LEVEL:-INFO}"
  file: "${LOG_FILE:-./logs/service.log}"
  max_size: "50MB"
  backup_count: 3

storage:
  base_path: "${CONTENT_PATH:-./content}"
  temp_directory: "${TEMP_DIR:-./temp}"
  max_total_size: "${MAX_SIZE:-2TB}"

performance:
  max_concurrent: 3
  chunk_size: "10MB"
  buffer_size: "64KB"

content_types:
  movies:
    local_path: "${CONTENT_PATH}/movies"
    remote_path: "/media/movies"
    file_extensions: [".mp4", ".mkv", ".avi"]
    max_size: "500GB"

# Custom service-specific settings
api:
  endpoint: "${API_ENDPOINT}"
  timeout: "${API_TIMEOUT:-30s}"
  retry_attempts: 3
```

## Performance Considerations

- Configuration parsing and validation happens once at startup
- Environment variable substitution is cached
- Size and duration transformations are performed during validation
- Configuration merging uses deep cloning to avoid reference issues

## Troubleshooting

### Common Issues

1. **Environment Variable Not Found**: Use default values with `${VAR:-default}` syntax
2. **Invalid Size Format**: Use standard units (B, KB, MB, GB, TB, PB)
3. **Invalid Duration Format**: Use standard units (ms, s, m, h, d, w)
4. **Schema Validation Errors**: Check the error messages for specific field issues

### Debug Configuration

```typescript
// Enable debug logging for configuration issues
const configManager = new ConfigManager(path, schema, {
  logger: myLogger,
  enableEnvSubstitution: true,
});

// Validate configuration without loading from file
try {
  const validatedConfig = configManager.validateAndTransform(rawConfig);
} catch (error) {
  console.error('Validation failed:', error.message);
}
```
