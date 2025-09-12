# DangerPrep Sync Services

Standardized sync services for the DangerPrep infrastructure management system. All services follow a unified architecture pattern for consistency, maintainability, and ease of deployment.

## Architecture

All sync services extend `StandardizedSyncService<ConfigType>` from `@dangerprep/sync` and implement:

- **Unified Configuration** - Zod schemas extending `StandardizedServiceConfig`
- **Shared Logging** - Consistent logging via `this.getLogger()`
- **Health Monitoring** - Built-in health checks and component monitoring
- **CLI Interface** - Standardized command-line interface with service-specific commands
- **Lifecycle Management** - Consistent initialization, startup, and shutdown patterns

## Available Services

### kiwix-sync
**Purpose**: Manages Kiwix ZIM file synchronization and library updates
**Custom Commands**: `update-library`, `list-packages`

### nfs-sync
**Purpose**: Synchronizes content from central NAS to local storage
**Custom Commands**: `sync-all`, `sync-content <type>`, `storage-stats`

### offline-sync
**Purpose**: Manages offline MicroSD card synchronization
**Custom Commands**: `list-devices`, `trigger-sync <device>`, `list-operations`

## Usage

### Standard Commands (All Services)
```bash
yarn dev start/stop/status    # Service lifecycle
yarn dev health               # View health information
yarn dev config               # Show current configuration
yarn dev validate             # Validate configuration
yarn dev logs                 # View recent logs
yarn dev stats                # Show service statistics
```

### Development
```bash
yarn install && yarn build    # Install and build
yarn lint && yarn test        # Code quality and testing
yarn dev                      # Development mode with hot reload
```

## Configuration

```yaml
# Standardized service configuration
service_name: "service-name"
version: "1.0.0"
log_level: "info"
data_directory: "/app/data"
max_concurrent_operations: 5
enable_notifications: true

# Service-specific configuration
service_config:
  # Each service has its own specific configuration schema
```

## Health Monitoring

- **Component Health** - Individual component status (filesystem, network, etc.)
- **Service Health** - Overall service operational status
- **Resource Health** - Memory, disk, and system resource monitoring

## Deployment

Each service includes:
- **Docker Configuration** - `Dockerfile` and `compose.yml`
- **Example Configurations** - `.example` files for quick setup
- **Health Checks** - Docker health check endpoints

## Testing

```bash
cd __tests__ && yarn test           # Run integration tests
cd __tests__ && yarn test:coverage  # Run with coverage
cd __tests__ && yarn test:watch     # Watch mode for development
```

## Development Guidelines

**Adding New Services:**
1. Extend `StandardizedSyncService<YourConfigType>`
2. Implement required abstract methods
3. Create service factory with CLI commands
4. Add configuration schema extending `StandardizedServiceConfig`

**Best Practices:**
- Leverage shared components for common functionality
- Make services highly configurable
- Implement proper error handling and recovery
- Include comprehensive logging and monitoring

## Related Packages

- `@dangerprep/sync` - Standardized sync service base classes
- `@dangerprep/service` - Core service infrastructure
- `@dangerprep/configuration` - Configuration management
- `@dangerprep/logging` - Structured logging
