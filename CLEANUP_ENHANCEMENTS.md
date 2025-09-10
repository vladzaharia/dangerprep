# DangerPrep Cleanup Script Enhancements

## Overview

The cleanup script has been enhanced to comprehensively undo everything that the setup script does, ensuring a complete restoration to the pre-DangerPrep state.

## New Cleanup Phases Added

### 1. User Account Cleanup (`cleanup_user_accounts`)
- **Purpose**: Removes user accounts created during setup
- **What it does**:
  - Reads the setup configuration to identify created users
  - Removes the user account and home directory
  - Cleans up subuid/subgid entries for the removed user
  - In interactive mode, asks for confirmation before removing users
  - Falls back to detecting likely DangerPrep users if config is missing

### 2. System User Cleanup (`cleanup_system_users`)
- **Purpose**: Removes system users created by DangerPrep
- **What it does**:
  - Removes the `dockerapp` system user (UID 1337)
  - Removes the `dockerapp` group
  - Handles any other system users that might be created

### 3. Mount Point Cleanup (`cleanup_mount_points`)
- **Purpose**: Unmounts DangerPrep partitions and cleans fstab
- **What it does**:
  - Unmounts `/data` and `/content` partitions
  - Removes fstab entries for DangerPrep partitions
  - Removes empty mount point directories
  - Backs up fstab before making changes

### 4. Finalization Services Cleanup (`cleanup_finalization_services`)
- **Purpose**: Removes services and scripts created for post-reboot finalization
- **What it does**:
  - Removes `dangerprep-finalize.service`
  - Removes `dangerprep-finalize-graphical.service`
  - Removes `dangerprep-recovery.service`
  - Removes finalization scripts (`/usr/local/bin/dangerprep-finalize.sh`)
  - Removes completion markers (`/var/lib/dangerprep-finalization-complete`)
  - Reloads systemd after service removal

### 5. Hardware Groups Cleanup (`cleanup_hardware_groups`)
- **Purpose**: Removes hardware access groups created by GPIO setup
- **What it does**:
  - Removes hardware groups like `gpio`, `pwm`, `i2c`, `spi`, `uart`, `hardware`
  - Only removes user groups (GID >= 1000) or specific DangerPrep groups
  - Preserves system groups to avoid breaking the system

## Enhanced Existing Functions

### Enhanced `remove_configurations`
- **Added**: Specific removal of configuration state files
  - `/etc/dangerprep/setup-config.conf`
  - `/etc/dangerprep/install-state.conf`

### Enhanced Package Categories
- **Security packages**: Added `clamav-freshclam`, `fail2ban`, `ufw`
- **Other packages**: Added Docker packages (`docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, `docker-compose-plugin`) and `fastfetch`

### Enhanced `final_cleanup`
- **Added**: Comprehensive cleanup of remaining files
  - Removes `/usr/local/bin/dangerprep`
  - Removes `/opt/dangerprep` directory
  - Cleans up remaining Docker-related files in user directories
  - Removes hardware-specific udev rules
  - Performs final udev reload

## Safety Features

### Dry Run Support
- All new cleanup functions support `--dry-run` mode
- Shows what would be removed without making changes

### Interactive Confirmation
- User account removal requires confirmation in interactive mode
- Mount point removal shows warnings for data partitions

### Comprehensive Backup
- Backs up fstab before modification
- Uses existing backup system for all file operations

### Error Handling
- Continues cleanup even if individual operations fail
- Tracks successful removals and failures
- Provides detailed reporting

## Updated Completion Messages

The completion message now includes all new cleanup operations:
- ✓ Created user accounts removed (if found)
- ✓ System users removed (dockerapp, etc.)
- ✓ Mount points unmounted and fstab entries removed
- ✓ Finalization services and scripts removed
- ✓ Hardware groups cleaned up
- ✓ Configuration state files removed

## Usage

The enhanced cleanup script maintains the same interface:

```bash
# Standard cleanup (preserves data)
sudo ./scripts/setup/cleanup-dangerprep.sh --preserve-data

# Complete removal (removes all data)
sudo ./scripts/setup/cleanup-dangerprep.sh

# Dry run to see what would be removed
sudo ./scripts/setup/cleanup-dangerprep.sh --dry-run

# Force cleanup without prompts
sudo ./scripts/setup/cleanup-dangerprep.sh --force
```

## What Gets Cleaned Up Now

The enhanced cleanup script now comprehensively undoes:

1. **All services** - Docker, RaspAP, system services, finalization services
2. **All configurations** - Network, security, monitoring, state files
3. **All users** - Created users, system users, groups
4. **All storage** - Mount points, fstab entries, data directories
5. **All packages** - Interactive removal by category
6. **All scripts** - Management scripts, finalization scripts, cron jobs
7. **All hardware configs** - GPIO groups, device permissions, udev rules
8. **All Docker components** - Containers, images, networks, rootless configs

This ensures that after running the cleanup script, the system is restored to its exact pre-DangerPrep state, allowing for a clean reinstallation if desired.
