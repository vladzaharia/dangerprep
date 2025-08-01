# DangerPrep Sync Services

This directory contains the standardized sync services for the DangerPrep infrastructure management system. All services follow a unified architecture pattern for consistency, maintainability, and ease of deployment.

## 🏗️ Standardized Architecture

All sync services extend `StandardizedSyncService<ConfigType>` from `@dangerprep/sync` and implement:

- **Unified Configuration**: All services use Zod schemas extending `StandardizedServiceConfig`
- **Shared Logging**: Consistent logging via `this.getLogger()` 
- **Health Monitoring**: Built-in health checks and component monitoring
- **CLI Interface**: Standardized command-line interface with service-specific commands
- **Lifecycle Management**: Consistent initialization, startup, and shutdown patterns
- **Error Handling**: Standardized error patterns and recovery mechanisms

## 📦 Available Services

### 🗂️ kiwix-sync
**Purpose**: Manages Kiwix ZIM file synchronization and library updates

**Custom Commands**:
- `update-library` - Manually trigger library update
- `list-packages` - List available ZIM packages

**Configuration**: `config.yaml.example`

### 🌐 nfs-sync  
**Purpose**: Synchronizes content from central NAS to local storage

**Custom Commands**:
- `sync-all` - Trigger sync for all content types
- `sync-content <type>` - Sync specific content type
- `storage-stats` - Show storage statistics

**Configuration**: `sync-config.yaml.example`

### 💾 offline-sync
**Purpose**: Manages offline MicroSD card synchronization

**Custom Commands**:
- `list-devices` - List detected devices
- `trigger-sync <device>` - Manually trigger sync for device
- `list-operations` - List active sync operations

**Configuration**: `config.yaml.example`

## 🚀 Common Usage

### Standard Commands (All Services)
```bash
# Start service
yarn dev start

# Check service status  
yarn dev status

# View health information
yarn dev health

# Show current configuration
yarn dev config

# Validate configuration
yarn dev validate

# View recent logs
yarn dev logs

# Show service statistics
yarn dev stats

# Stop service
yarn dev stop
```

### Development
```bash
# Install dependencies
yarn install

# Build all services
yarn build

# Run linting
yarn lint

# Run tests
yarn test

# Development mode (with hot reload)
yarn dev
```

## 🔧 Configuration

All services use YAML configuration files with the following structure:

```yaml
# Standardized service configuration (required for all services)
service_name: "service-name"
version: "1.0.0"
enabled: true
log_level: "info"
data_directory: "/app/data"
temp_directory: "/tmp"
max_concurrent_operations: 5
operation_timeout_minutes: 30
health_check_interval_minutes: 5
enable_notifications: true
enable_progress_tracking: true
enable_auto_recovery: true
metadata: {}

# Service-specific configuration
service_config:
  # Each service has its own specific configuration schema
  # See individual service examples for details
```

## 🏥 Health Monitoring

All services provide comprehensive health monitoring:

- **Component Health**: Individual component status (filesystem, network, etc.)
- **Service Health**: Overall service operational status  
- **Configuration Health**: Configuration validity and completeness
- **Resource Health**: Memory, disk, and system resource monitoring

## 📊 Monitoring & Observability

Services include built-in monitoring features:

- **Structured Logging**: JSON-formatted logs with consistent fields
- **Metrics Collection**: Performance and operational metrics
- **Progress Tracking**: Real-time operation progress reporting
- **Notification System**: Configurable alerts and notifications

## 🔄 Deployment

Each service includes:

- **Docker Configuration**: `Dockerfile` and `compose.yml`
- **Example Configurations**: `.example` files for quick setup
- **Health Checks**: Docker health check endpoints
- **Graceful Shutdown**: Proper signal handling and cleanup

## 🧪 Testing

Integration tests validate the standardized architecture:

```bash
# Run integration tests
cd __tests__ && yarn test

# Run with coverage
cd __tests__ && yarn test:coverage

# Watch mode for development
cd __tests__ && yarn test:watch
```

## 📚 Development Guidelines

### Adding New Services

1. Extend `StandardizedSyncService<YourConfigType>`
2. Implement required abstract methods:
   - `validateServiceConfiguration(config)`
   - `initializeServiceSpecificComponents(config)`
   - `startServiceComponents()`
   - `stopServiceComponents()`
3. Create service factory with CLI commands
4. Add configuration schema extending `StandardizedServiceConfig`
5. Include example configuration and documentation

### Best Practices

- **Minimal Setup**: Leverage shared components for common functionality
- **Configuration-Driven**: Make services highly configurable
- **Error Resilience**: Implement proper error handling and recovery
- **Observability**: Include comprehensive logging and monitoring
- **Testing**: Write integration tests for new functionality

## 🔗 Related Packages

- `@dangerprep/sync` - Standardized sync service base classes and patterns
- `@dangerprep/service` - Core service infrastructure
- `@dangerprep/configuration` - Configuration management
- `@dangerprep/logging` - Structured logging
- `@dangerprep/health` - Health monitoring
- `@dangerprep/notifications` - Notification system
