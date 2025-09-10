# DangerPrep Scripts Directory

This directory contains setup and cleanup scripts for the DangerPrep system. All scripts are integrated with the `just` command runner.

## Directory Structure

```
scripts/
├── setup.sh                 # Main system setup script
├── cleanup.sh               # Main system cleanup script
├── setup/                   # Setup helper scripts and configurations
│   ├── config-loader.sh     # Configuration template processor
│   ├── configs/             # Configuration templates
│   ├── docker-env-config.sh # Docker environment configuration
│   ├── env-error-handler.sh # Environment error handling
│   ├── env-parser.sh        # Environment variable parsing
│   ├── env-processor.sh     # Environment processing utilities
│   ├── finalize-user-migration.sh # User migration finalization
│   ├── generate-handler.sh  # Generation handler utilities
│   ├── prompt-handler.sh    # User prompt handling
│   └── setup-gpio.sh        # GPIO setup for FriendlyElec hardware
├── cleanup/                 # Cleanup helper scripts (currently empty)
├── shared/                  # Shared utility functions
│   ├── banner.sh           # Banner display utilities
│   └── gum-utils.sh        # Enhanced user interaction utilities
└── README.md               # This documentation
```

## Main Scripts

### Setup Script (`setup.sh`)
Main system installation script that configures the complete DangerPrep system on Ubuntu 24.04 with modern security hardening.

**Usage:**
```bash
./scripts/setup.sh
# or via just command
just deploy
```

### Cleanup Script (`cleanup.sh`)
Complete system removal and cleanup script that safely removes DangerPrep configuration and restores the original system state.

**Usage:**
```bash
./scripts/cleanup.sh
# or via just command
just cleanup
```

## Shared Utilities

### Shared Utilities (`shared/`)
- **`banner.sh`** - Provides colorful banner functions for all DangerPrep scripts
- **`gum-utils.sh`** - Enhanced user interaction functions with gum integration

### Setup Components (`setup/`)
- **`configs/`** - Configuration templates used by setup scripts
- **`config-loader.sh`** - Configuration template processor
- **`docker-env-config.sh`** - Docker environment configuration helper
- **`env-*.sh`** - Environment handling utilities
- **`finalize-user-migration.sh`** - User migration finalization
- **`generate-handler.sh`** - Generation handler utilities
- **`prompt-handler.sh`** - User prompt handling
- **`setup-gpio.sh`** - GPIO setup for FriendlyElec hardware

## Usage

### System Management
```bash
just deploy          # Install/deploy DangerPrep system (runs scripts/setup.sh)
just cleanup         # Remove DangerPrep system completely (runs scripts/cleanup.sh)
```

### Direct Script Execution
```bash
# Setup system
./scripts/setup.sh

# Cleanup system
./scripts/cleanup.sh

# Show help
./scripts/setup.sh --help
./scripts/cleanup.sh --help
```

## Integration with Just Commands

The scripts are integrated with the project's `justfile`:

```bash
just deploy          # Runs scripts/setup.sh
just cleanup         # Runs scripts/cleanup.sh
```

Use `just --list` to see all available commands or `just help` for detailed usage information.

## Logging

All scripts log their activities to appropriate log files:

- Setup operations: `/var/log/dangerprep-setup.log`
- Cleanup operations: `/var/log/dangerprep-cleanup.log`
- Fallback logging to `~/.local/dangerprep/logs/` if system logs are not writable

## Best Practices

1. **Use the main scripts** - Always use the setup and cleanup scripts as entry points
2. **Check logs** - Monitor log files for issues and progress
3. **Test in safe environments** - Test setup and cleanup in non-production environments first
4. **Backup before cleanup** - The cleanup script will offer to create backups before removal

## Troubleshooting

If scripts fail to execute:

1. Check file permissions: `chmod +x scripts/setup/*.sh`
2. Verify dependencies are installed (gum, basic system tools)
3. Check log files for detailed error messages
4. Ensure running with appropriate privileges (scripts will prompt for sudo when needed)

For more information, see script help:
```bash
./scripts/setup.sh --help
./scripts/cleanup.sh --help
```
