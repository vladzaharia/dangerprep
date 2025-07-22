# DangerPrep Offline Sync Service

A TypeScript-based service for automatically synchronizing content between MicroSD cards and the local content library. This service monitors for MicroSD card insertion, automatically mounts them, analyzes their content structure, and performs bidirectional synchronization.

## Features

- **Automatic USB/MicroSD Detection**: Uses the `usb` library to monitor for device insertion/removal
- **Automatic Mounting**: Supports both udisks2 and direct mount approaches with proper permissions
- **Directory Structure Analysis**: Automatically detects existing content types and creates missing directories
- **Bidirectional Sync**: Supports syncing to card, from card, or bidirectional based on configuration
- **Resumable Transfers**: Large file transfers can be interrupted and resumed
- **File Verification**: Optional checksum verification for transfer integrity
- **Comprehensive Logging**: Structured logging with rotation and multiple levels
- **Health Monitoring**: Built-in health checks and statistics tracking
- **Modern TypeScript**: Strict typing with no `any` types, following 2025 best practices

## Architecture

The service consists of several key components:

- **DeviceDetector**: Monitors USB devices and identifies mass storage devices
- **MountManager**: Handles automatic mounting/unmounting of detected devices
- **CardAnalyzer**: Analyzes card contents and manages directory structure
- **SyncEngine**: Performs the actual file synchronization with progress tracking
- **ConfigManager**: Manages YAML-based configuration with validation
- **Logger**: Provides structured logging with rotation and multiple outputs

## Configuration

The service uses a YAML configuration file with the following structure:

```yaml
offline_sync:
  storage:
    content_directory: "/content"
    mount_base: "/mnt/microsd"
    temp_directory: "/tmp/offline-sync"
    max_card_size: "2TB"

  device_detection:
    monitor_device_types: ["mass_storage", "sd_card"]
    min_device_size: "1GB"
    mount_timeout: 30
    mount_retry_attempts: 3
    mount_retry_delay: 5

  content_types:
    movies:
      local_path: "/content/movies"
      card_path: "movies"
      sync_direction: "bidirectional"
      max_size: "800GB"
      file_extensions: [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm"]

  sync:
    check_interval: 30
    max_concurrent_transfers: 3
    transfer_chunk_size: "10MB"
    verify_transfers: true
    delete_after_sync: false
    create_completion_markers: true

  logging:
    level: "INFO"
    file: "/app/data/logs/offline-sync.log"
    max_size: "50MB"
    backup_count: 3
```

## Content Types

The service supports the following content types by default:

- **movies**: Video files (mp4, mkv, avi, etc.)
- **tv**: TV show files
- **webtv**: Web TV content
- **music**: Audio files (mp3, flac, wav, etc.)
- **audiobooks**: Audiobook files
- **books**: eBook files (epub, pdf, mobi, etc.)
- **comics**: Comic book files (cbz, cbr, etc.)
- **magazines**: Magazine files
- **games**: Game ROM files
- **kiwix**: Offline content (ZIM files)

Each content type can be configured with:
- Local and card paths
- Sync direction (bidirectional, to_card, from_card)
- Maximum size limits
- Supported file extensions

## Docker Deployment

The service is designed to run as a Docker container with the following requirements:

### Volumes
- `/app/data`: Service data and logs
- `/content`: Local content directory
- `/dev`: Device access for USB detection
- `/run/udev`: udev information
- `/sys`: System information
- `/proc`: Process information
- `/run/dbus`: D-Bus for udisks2

### Privileges
- `privileged: true`: Required for USB device access and mounting

### Environment Variables
- `INSTALL_ROOT`: Installation root directory
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARN, ERROR)
- `TZ`: Timezone

## CLI Usage

The service includes a comprehensive CLI for management:

```bash
# Start the service
offline-sync-cli start

# Check service status
offline-sync-cli status

# List detected devices
offline-sync-cli devices

# Manually trigger sync
offline-sync-cli sync /dev/sdb1

# Configuration management
offline-sync-cli config --create-default
offline-sync-cli config --validate
offline-sync-cli config --show

# View logs
offline-sync-cli logs -n 100
```

## API Events

The service emits the following events:

- `service_started`: Service has started successfully
- `service_stopped`: Service has stopped
- `device_detected`: New USB device detected
- `device_removed`: USB device removed
- `device_mounted`: Device successfully mounted
- `device_unmounted`: Device unmounted
- `sync_started`: Sync operation started
- `sync_completed`: Sync operation completed successfully
- `sync_failed`: Sync operation failed
- `file_transferred`: Individual file transfer completed

## Health Monitoring

The service provides comprehensive health monitoring:

- Service status (healthy, degraded, unhealthy)
- Component status (USB detection, mounting, sync engine, file system)
- Active operations count
- Connected devices count
- Error and warning tracking
- Uptime and statistics

## Security Considerations

- The service runs with elevated privileges for device access
- File permissions are properly managed during transfers
- Checksums are used for transfer verification when enabled
- Temporary files are cleaned up after operations
- Log rotation prevents disk space issues

## Troubleshooting

Common issues and solutions:

1. **Device not detected**: Check USB permissions and udev rules
2. **Mount failures**: Verify udisks2 installation and D-Bus access
3. **Sync failures**: Check file permissions and available disk space
4. **Performance issues**: Adjust concurrent transfer limits and chunk sizes

## Development

The service is built with modern TypeScript practices:

- Strict TypeScript configuration with no `any` types
- Comprehensive error handling with proper typing
- Event-driven architecture with typed events
- Modular design with clear separation of concerns
- Extensive logging and monitoring

## Dependencies

- Node.js 18+
- TypeScript 5+
- usb: USB device detection
- fs-extra: Enhanced file system operations
- js-yaml: YAML configuration parsing
- node-cron: Scheduled operations
- commander: CLI interface

## License

MIT License - see LICENSE file for details.
