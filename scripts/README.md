# DangerPrep Scripts

Setup and cleanup scripts for the DangerPrep system.

## Main Scripts

**`setup.sh`** - Main system installation script
- Configures complete DangerPrep system on Ubuntu 24.04
- Modern security hardening and Docker configuration

**`cleanup.sh`** - Complete system removal and cleanup script
- Safely removes DangerPrep configuration
- Restores original system state

**`image.sh`** - System image creation script
- Creates sparse disk images from running Ubuntu system
- Compatible with FriendlyElec's EFlasher tool
- Generates "golden images" for rapid deployment

## Directory Structure

```
scripts/
├── setup.sh                 # Main system setup script
├── cleanup.sh               # Main system cleanup script
├── image.sh                 # System image creation script
├── setup/                   # Setup helper scripts and configurations
├── shared/                  # Shared utility functions
└── README.md               # This documentation
```

## Usage

**System Management:**

```bash
./scripts/setup.sh           # Install/deploy DangerPrep system
./scripts/cleanup.sh         # Remove DangerPrep system completely
./scripts/image.sh           # Create system image for deployment
./scripts/setup.sh --help    # Show help and options
```

**Image Creation:**

```bash
sudo ./scripts/image.sh                    # Create image with auto-detection
```

## Components

**Shared Utilities (`shared/`):**
- `banner.sh` - Colorful banner functions for scripts
- `gum-utils.sh` - Enhanced user interaction functions

**Setup Components (`setup/`):**
- `configs/` - Configuration templates
- `config-loader.sh` - Configuration template processor
- `env-*.sh` - Environment handling utilities
- `setup-gpio.sh` - GPIO setup for FriendlyElec hardware

## Logging

Scripts log activities to:
- Setup operations: `/var/log/dangerprep-setup.log`
- Cleanup operations: `/var/log/dangerprep-cleanup.log`
- Fallback: `~/.local/dangerprep/logs/` if system logs not writable

## Troubleshooting

If scripts fail:
1. Check file permissions: `chmod +x scripts/setup/*.sh`
2. Verify dependencies (gum, basic system tools)
3. Check log files for detailed error messages
4. Run with appropriate privileges (scripts prompt for sudo when needed)

Use `./scripts/setup.sh --help` for more information.
