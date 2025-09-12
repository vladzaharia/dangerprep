# DangerPrep Offline Sync Service

TypeScript-based service for automatically synchronizing content between MicroSD cards and the local content library. Monitors for MicroSD card insertion, automatically mounts them, and performs bidirectional synchronization.

## Features

- **Automatic USB/MicroSD Detection** - Monitors for device insertion/removal
- **Automatic Mounting** - Supports udisks2 and direct mount approaches
- **Bidirectional Sync** - Supports syncing to card, from card, or bidirectional
- **Resumable Transfers** - Large file transfers can be interrupted and resumed
- **File Verification** - Optional checksum verification for transfer integrity
- **Health Monitoring** - Built-in health checks and statistics tracking

## Architecture

Key components:
- **DeviceDetector** - Monitors USB devices and identifies mass storage devices
- **MountManager** - Handles automatic mounting/unmounting of detected devices
- **SyncEngine** - Performs file synchronization with progress tracking
- **ConfigManager** - Manages YAML-based configuration with validation

## Configuration

```yaml
offline_sync:
  storage:
    content_directory: "/content"
    mount_base: "/mnt/microsd"
    max_card_size: "2TB"

  device_detection:
    monitor_device_types: ["mass_storage", "sd_card"]
    min_device_size: "1GB"
    mount_timeout: 30

  content_types:
    movies:
      local_path: "/content/movies"
      card_path: "movies"
      sync_direction: "bidirectional"
      file_extensions: [".mp4", ".mkv", ".avi"]

  sync:
    max_concurrent_transfers: 3
    verify_transfers: true
    create_completion_markers: true
```

## Content Types

Supported content types:
- **movies** - Video files (mp4, mkv, avi, etc.)
- **tv** - TV show files
- **music** - Audio files (mp3, flac, wav, etc.)
- **books** - eBook files (epub, pdf, mobi, etc.)
- **games** - Game ROM files
- **kiwix** - Offline content (ZIM files)

Each content type configurable with local/card paths, sync direction, size limits, and file extensions.

## Docker Deployment

### Volumes
- `/app/data` - Service data and logs
- `/content` - Local content directory
- `/dev` - Device access for USB detection
- `/run/dbus` - D-Bus for udisks2

### Privileges
- `privileged: true` - Required for USB device access and mounting

## CLI Usage

```bash
offline-sync-cli start              # Start service
offline-sync-cli status             # Check status
offline-sync-cli devices            # List detected devices
offline-sync-cli sync /dev/sdb1     # Manual sync
offline-sync-cli config --validate  # Validate config
```

## Health Monitoring

Provides comprehensive monitoring:
- Service status (healthy, degraded, unhealthy)
- Component status (USB detection, mounting, sync engine)
- Active operations and connected devices count
- Error tracking and uptime statistics

## Troubleshooting

1. **Device not detected** - Check USB permissions and udev rules
2. **Mount failures** - Verify udisks2 installation and D-Bus access
3. **Sync failures** - Check file permissions and disk space
4. **Performance issues** - Adjust concurrent transfer limits

## Dependencies

- Node.js 22+, TypeScript 5+
- usb, fs-extra, js-yaml, node-cron, commander

## License

MIT
