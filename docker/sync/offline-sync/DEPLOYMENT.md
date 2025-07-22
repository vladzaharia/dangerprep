# DangerPrep Offline Sync Service - Deployment Guide

This guide covers the deployment and configuration of the DangerPrep Offline Sync Service.

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for development/testing)
- Ubuntu 24.04 (recommended for production)
- NanoPi M6 or R6C (target hardware)

## Quick Start

1. **Copy and customize configuration:**
   ```bash
   cp config.yaml.example config.yaml
   # Edit config.yaml to match your environment
   ```

2. **Set environment variables:**
   ```bash
   cp compose.env.example compose.env
   # Edit compose.env as needed
   ```

3. **Deploy the service:**
   ```bash
   docker-compose up -d
   ```

4. **Verify deployment:**
   ```bash
   docker-compose logs -f offline-sync
   docker-compose exec offline-sync offline-sync-cli status
   ```

## Configuration

### Main Configuration File (config.yaml)

The service uses a YAML configuration file with the following sections:

#### Storage Configuration
```yaml
offline_sync:
  storage:
    content_directory: "/content"      # Local content directory
    mount_base: "/mnt/microsd"        # Base directory for mounting cards
    temp_directory: "/tmp/offline-sync" # Temporary files
    max_card_size: "2TB"              # Maximum supported card size
```

#### Device Detection
```yaml
  device_detection:
    monitor_device_types: ["mass_storage", "sd_card"]
    min_device_size: "1GB"           # Minimum card size to consider
    mount_timeout: 30                # Seconds to wait for mount
    mount_retry_attempts: 3          # Number of mount retries
    mount_retry_delay: 5             # Seconds between retries
```

#### Content Types
Each content type defines:
- `local_path`: Local directory path
- `card_path`: Directory name on the MicroSD card
- `sync_direction`: `bidirectional`, `to_card`, or `from_card`
- `max_size`: Maximum size for this content type
- `file_extensions`: Supported file extensions

Example:
```yaml
  content_types:
    movies:
      local_path: "/content/movies"
      card_path: "movies"
      sync_direction: "bidirectional"
      max_size: "800GB"
      file_extensions: [".mp4", ".mkv", ".avi", ".mov"]
```

#### Sync Behavior
```yaml
  sync:
    check_interval: 30               # Seconds between checks
    max_concurrent_transfers: 3      # Parallel file transfers
    transfer_chunk_size: "10MB"      # Chunk size for large files
    verify_transfers: true           # Verify file integrity
    delete_after_sync: false        # Delete source files after sync
    create_completion_markers: true  # Create .sync_complete files
```

### Environment Variables (compose.env)

- `INSTALL_ROOT`: Installation root directory
- `TZ`: Timezone (e.g., America/Los_Angeles)
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARN, ERROR)
- `WEBHOOK_URL`: Optional webhook for notifications

## Docker Deployment

### Docker Compose Configuration

The service requires several Docker volumes and privileges:

```yaml
services:
  offline-sync:
    build: .
    restart: unless-stopped
    privileged: true  # Required for USB device access
    volumes:
      - ${INSTALL_ROOT}/data/offline-sync:/app/data
      - ${INSTALL_ROOT}/content:/content
      - /dev:/dev                    # Device access
      - /run/udev:/run/udev:ro      # udev information
      - /sys:/sys:ro                # System information
      - /proc:/proc:ro              # Process information
      - /run/dbus:/run/dbus         # D-Bus for udisks2
```

### Security Considerations

The service runs with elevated privileges for device access. Security measures include:

- Path sanitization to prevent traversal attacks
- Input validation for all user-provided data
- Secure file transfer with integrity verification
- Proper error handling and logging
- Non-root user execution within container

## CLI Usage

The service includes a comprehensive CLI for management:

### Basic Commands

```bash
# Start the service (daemon mode)
offline-sync-cli start -d

# Check service status
offline-sync-cli status

# List detected devices
offline-sync-cli devices

# Manually trigger sync for a device
offline-sync-cli sync /dev/sdb1
```

### Configuration Management

```bash
# Create default configuration
offline-sync-cli config --create-default

# Validate configuration
offline-sync-cli config --validate

# Show current configuration
offline-sync-cli config --show
```

### Log Management

```bash
# View recent logs
offline-sync-cli logs -n 100

# View logs in real-time
docker-compose logs -f offline-sync
```

## Testing

Run the comprehensive test suite:

```bash
./test.sh
```

This will test:
- TypeScript compilation
- Configuration validation
- CLI commands
- Security (path sanitization)
- Docker build and compose

## Monitoring and Maintenance

### Health Checks

The service provides built-in health monitoring:

```bash
# Check service health
offline-sync-cli status

# View health in Docker
docker-compose ps
```

### Log Rotation

Logs are automatically rotated based on configuration:
- Maximum log file size
- Number of backup files to keep
- Automatic cleanup of old logs

### Performance Monitoring

Monitor key metrics:
- Active sync operations
- Connected devices
- Transfer speeds
- Error rates
- Uptime statistics

## Troubleshooting

### Common Issues

1. **Device not detected:**
   - Check USB permissions and udev rules
   - Verify device is properly connected
   - Check system logs for USB events

2. **Mount failures:**
   - Ensure udisks2 is installed
   - Check D-Bus connectivity
   - Verify filesystem support

3. **Sync failures:**
   - Check available disk space
   - Verify file permissions
   - Review error logs

4. **Performance issues:**
   - Adjust concurrent transfer limits
   - Modify chunk sizes
   - Check system resources

### Debug Mode

Enable debug logging for troubleshooting:

```yaml
logging:
  level: "DEBUG"
```

Or set environment variable:
```bash
LOG_LEVEL=DEBUG
```

### Log Analysis

Key log patterns to monitor:
- `[DeviceDetector]` - USB device events
- `[MountManager]` - Mount/unmount operations
- `[SyncEngine]` - File transfer operations
- `[CardAnalyzer]` - Card content analysis

## Hardware-Specific Notes

### NanoPi M6/R6C

- Ensure proper USB power management
- Configure udev rules for device permissions
- Consider USB hub for multiple devices
- Monitor temperature during intensive operations

### Ubuntu 24.04 Compatibility

- Install required packages: `udisks2`, `udev`
- Configure user permissions for device access
- Set up proper systemd services if needed

## Security Best Practices

1. **File System Permissions:**
   - Use dedicated user for service
   - Restrict access to content directories
   - Regular permission audits

2. **Network Security:**
   - Disable unnecessary network access
   - Use secure webhook URLs (HTTPS)
   - Monitor network traffic

3. **Data Protection:**
   - Enable transfer verification
   - Regular backups of configuration
   - Secure storage of sensitive data

4. **System Hardening:**
   - Keep system updated
   - Monitor system logs
   - Use fail2ban for intrusion detection

## Support and Maintenance

### Regular Maintenance Tasks

- Review and rotate logs
- Update Docker images
- Check disk space usage
- Verify backup integrity
- Update configuration as needed

### Monitoring Checklist

- [ ] Service is running and healthy
- [ ] No critical errors in logs
- [ ] Adequate disk space available
- [ ] USB devices detected properly
- [ ] Sync operations completing successfully
- [ ] Performance metrics within acceptable ranges

For additional support, check the service logs and refer to the comprehensive README.md file.
