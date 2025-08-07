# DangerPrep Maintenance Scripts

This directory contains all maintenance scripts organized by category for better management and discoverability.

## Directory Structure

```
scripts/maintenance/
├── security/           # Security auditing and monitoring
├── monitoring/         # System and hardware monitoring
├── backup/            # Backup and restore operations
├── validation/        # System validation and testing
├── system/           # System management and utilities
└── README.md         # This documentation
```

## Security Scripts (`security/`)

### Individual Security Tools
- **`aide-check.sh`** - AIDE file integrity monitoring
- **`antivirus-scan.sh`** - ClamAV antivirus scanning
- **`lynis-audit.sh`** - Lynis security audit
- **`rootkit-scan.sh`** - Rootkit detection (RKHunter/chkrootkit)
- **`security-audit.sh`** - General security configuration audit
- **`suricata-monitor.sh`** - Suricata IDS monitoring

### Unified Security Tools
- **`security-audit-all.sh`** - Runs all security checks with unified reporting

**Usage Examples:**
```bash
# Run all security checks
./scripts/maintenance/security/security-audit-all.sh

# Run specific security check
./scripts/maintenance/security/aide-check.sh
./scripts/maintenance/security/antivirus-scan.sh
```

## Monitoring Scripts (`monitoring/`)

### Individual Monitoring Tools
- **`system-monitor.sh`** - Comprehensive system health monitoring (CPU, memory, disk, network)
- **`hardware-monitor.sh`** - Hardware-specific monitoring (temperature, SMART)

### Unified Monitoring Tools
- **`monitor-all.sh`** - Runs all monitoring checks with unified reporting

**Usage Examples:**
```bash
# Run all monitoring checks
./scripts/maintenance/monitoring/monitor-all.sh

# Run continuous monitoring
./scripts/maintenance/monitoring/monitor-all.sh continuous

# Run specific monitoring
./scripts/maintenance/monitoring/system-monitor.sh report
./scripts/maintenance/monitoring/hardware-monitor.sh check
```

## Backup Scripts (`backup/`)

### Individual Backup Tools
- **`system-backup.sh`** - Basic tar.gz system backup
- **`backup-encrypted.sh`** - GPG encrypted backup functionality
- **`restore-backup.sh`** - Backup restoration utilities

### Unified Backup Tools
- **`backup-manager.sh`** - Unified backup management with multiple backup types

**Usage Examples:**
```bash
# Create different types of backups
./scripts/maintenance/backup/backup-manager.sh create basic
./scripts/maintenance/backup/backup-manager.sh create encrypted
./scripts/maintenance/backup/backup-manager.sh create full

# List and manage backups
./scripts/maintenance/backup/backup-manager.sh list
./scripts/maintenance/backup/backup-manager.sh cleanup 30
./scripts/maintenance/backup/backup-manager.sh verify backup-file.tar.gz

# Restore from backup
./scripts/maintenance/backup/backup-manager.sh restore backup-file.tar.gz
```

## Validation Scripts (`validation/`)

### Individual Validation Tools
- **`validate-compose.sh`** - Docker Compose file validation
- **`validate-references.sh`** - File reference validation
- **`validate-docker-dependencies.sh`** - Docker dependency validation
- **`test-nfs-mounts.sh`** - NFS connectivity testing

### Unified Validation Tools
- **`validate-system.sh`** - Comprehensive system validation

**Usage Examples:**
```bash
# Run all validations
./scripts/maintenance/validation/validate-system.sh all

# Run specific validations
./scripts/maintenance/validation/validate-system.sh compose
./scripts/maintenance/validation/validate-system.sh docker
./scripts/maintenance/validation/validate-system.sh nfs
```

## System Scripts (`system/`)

### System Management Tools
- **`system-update.sh`** - Update DangerPrep system from repository
- **`system-uninstall.sh`** - System uninstallation
- **`fix-permissions.sh`** - File permission repair
- **`certs.sh`** - Certificate management (Traefik ACME, Step-CA)
- **`audit-shell-scripts.sh`** - Shell script auditing

**Usage Examples:**
```bash
# System management
./scripts/maintenance/system/system-update.sh
./scripts/maintenance/system/fix-permissions.sh

# Certificate management
./scripts/maintenance/system/certs.sh status
./scripts/maintenance/system/certs.sh traefik
./scripts/maintenance/system/certs.sh step-ca
```

## Integration with Just Commands

All maintenance scripts are integrated with the project's `justfile` for easy execution:

```bash
# Security
just security-audit-all
just aide-check
just antivirus-scan

# Monitoring
just monitor-all
just system-monitor
just hardware-monitor

# Backup
just backup-create basic
just backup-create encrypted
just backup-list

# Validation
just validate-all
just validate-compose
just validate-docker

# System
just system-update
just fix-permissions
just certs-status
```

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
