# DangerPrep Scripts Directory

This directory contains all production scripts organized by category. All scripts are integrated with the `just` command runner and serve specific purposes in the DangerPrep system.

## Directory Structure

```
scripts/
├── docker/                    # Docker service management
├── maintenance/              # System maintenance and monitoring
│   ├── backup/              # Backup and restore operations
│   ├── monitoring/          # System and hardware monitoring
│   ├── security/            # Security auditing and monitoring
│   ├── system/             # System management and utilities
│   └── validation/         # System validation and testing
├── network/                 # Network routing and management
├── setup/                   # System installation and cleanup
└── README.md               # This documentation
```

## Script Categories

### Setup Scripts (`setup/`)
- **`setup-dangerprep.sh`** - Main system installation script
- **`cleanup-dangerprep.sh`** - Complete system removal and cleanup
- **`config-loader.sh`** - Configuration template processor (used by setup script)

### Docker Management (`docker/`)
- **`start-services.sh`** - Start all Docker services
- **`stop-services.sh`** - Stop all Docker services
- **`service-status.sh`** - Show status of all services
- **`container-health.sh`** - Monitor container health

### Network Management (`network/`)
- **`interface-manager.sh`** - Manage WAN/LAN interface assignments
- **`route-manager.sh`** - Dynamic routing management
- **`wifi-manager.sh`** - WiFi connection and access point management
- **`firewall-manager.sh`** - Firewall and port forwarding management
- **`wan-to-wifi.sh`** - WAN-to-WiFi routing scenario
- **`wifi-repeater.sh`** - WiFi repeater mode scenario
- **`emergency-local.sh`** - Local-only network scenario (no internet)
- **`qos.sh`** - Quality of Service traffic shaping

### Maintenance Scripts (`maintenance/`)

#### Security (`maintenance/security/`)
- **`security-audit-all.sh`** - Unified security audit runner (calls all individual tools)
- **`aide-check.sh`** - AIDE file integrity monitoring
- **`antivirus-scan.sh`** - ClamAV antivirus scanning
- **`lynis-audit.sh`** - Lynis security audit
- **`rootkit-scan.sh`** - Rootkit detection (RKHunter/chkrootkit)
- **`security-audit.sh`** - General security configuration audit
- **`suricata-monitor.sh`** - Suricata IDS monitoring

#### Monitoring (`maintenance/monitoring/`)
- **`monitor-all.sh`** - Unified monitoring runner (calls all monitoring tools)
- **`system-monitor.sh`** - System health monitoring (CPU, memory, disk, network)
- **`hardware-monitor.sh`** - Hardware monitoring (temperature, SMART)

#### Backup (`maintenance/backup/`)
- **`backup-manager.sh`** - Unified backup management (basic, encrypted, full backups)

#### Validation (`maintenance/validation/`)
- **`validate-system.sh`** - Unified validation runner (calls all validation tools)
- **`validate-compose.sh`** - Docker Compose file validation
- **`validate-references.sh`** - File reference validation
- **`validate-docker-dependencies.sh`** - Docker dependency validation
- **`test-nfs-mounts.sh`** - NFS connectivity testing

#### System (`maintenance/system/`)
- **`system-update.sh`** - Update DangerPrep system from repository
- **`system-uninstall.sh`** - System uninstallation
- **`fix-permissions.sh`** - File permission repair
- **`certs.sh`** - Certificate management (Traefik ACME, Step-CA)
- **`audit-shell-scripts.sh`** - Shell script auditing

## Usage Examples

All scripts are integrated with the `just` command runner for easy execution:

### System Management
```bash
just deploy          # Install/deploy DangerPrep system
just cleanup          # Remove DangerPrep system completely
just update           # Update system from repository
just start            # Start all services
just stop             # Stop all services
just status           # Show service status
```

### Network Management
```bash
just wan-list         # List available network interfaces
just wan-set eth0     # Set eth0 as WAN interface
just wan-to-wifi      # Setup WAN-to-WiFi routing
just wifi-repeater    # Setup WiFi repeater mode
just local-only       # Setup local-only network (no internet)
just qos-setup        # Setup QoS traffic shaping
```

### Security & Monitoring
```bash
just security-audit-all    # Run all security checks
just monitor-all          # Run all monitoring checks
just validate-all         # Run all validation checks
just aide-check           # Run AIDE integrity check
just antivirus-scan       # Run antivirus scan
```

### Backup Management
```bash
just backup-create-basic      # Create basic backup
just backup-create-encrypted  # Create encrypted backup
just backup-list             # List available backups
just backup-restore backup.tar.gz  # Restore from backup
```

## Script Architecture

### Unified Scripts
The maintenance scripts follow a unified architecture where individual tools are called by unified runners:

- **Security**: `security-audit-all.sh` calls individual security tools
- **Monitoring**: `monitor-all.sh` calls individual monitoring tools
- **Validation**: `validate-system.sh` calls individual validation tools
- **Backup**: `backup-manager.sh` provides unified backup management

This design reduces code duplication while maintaining modularity and allowing both unified and individual tool execution.

## Integration with Just Commands

All scripts are integrated with the project's `justfile` for easy execution. Use `just --list` to see all available commands or `just help` for detailed usage information.

## Automated Execution

Many scripts are configured to run automatically via cron jobs:

- **Security audits**: Weekly comprehensive security audit
- **Monitoring**: Continuous system monitoring every 5 minutes
- **Backups**: Daily automated backups
- **Validation**: Pre-deployment validation checks

## Logging

All scripts log their activities to `/var/log/dangerprep-*.log` files:

- `/var/log/dangerprep-security-audit.log`
- `/var/log/dangerprep-monitoring.log`
- `/var/log/dangerprep-backup.log`
- Individual tool logs in `/var/log/`

## Best Practices

1. **Run unified scripts first** - Use `*-all.sh` scripts for comprehensive checks
2. **Check logs regularly** - Monitor log files for issues and trends
3. **Test backups** - Regularly verify backup integrity
4. **Review security reports** - Act on security audit findings
5. **Monitor system health** - Address monitoring alerts promptly

## Troubleshooting

If scripts fail to execute:

1. Check file permissions: `chmod +x script-name.sh`
2. Verify dependencies are installed
3. Check log files for detailed error messages
4. Ensure running with appropriate privileges (some scripts require sudo)

For more information, see individual script help:
```bash
./script-name.sh --help
```
