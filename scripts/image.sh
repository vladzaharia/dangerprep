#!/bin/bash
# DangerPrep System Image Creator
# Creates a sparse disk image from the currently-running Ubuntu system on NanoPi M6
# Compatible with FriendlyElec's EFlasher tool for flashing to eMMC storage
#
# Usage:
#   sudo ./scripts/image.sh [OPTIONS]
#
# Options:
#   --output-dir DIR    Specify output directory (default: auto-detect)
#   --skip-cleanup      Skip system cleanup before imaging
#   --compress          Compress the output image with gzip
#   --dry-run          Show what would be done without executing
#   --help             Show this help message

set -euo pipefail

# =============================================================================
# SCRIPT INITIALIZATION
# =============================================================================

# Get script directory and set up paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

# Source gum utilities for enhanced user interaction (required)
declare GUM_UTILS_PATH
GUM_UTILS_PATH="${SCRIPT_DIR}/shared/gum-utils.sh"
if [[ -f "${GUM_UTILS_PATH}" ]]; then
    # shellcheck source=shared/gum-utils.sh
    source "${GUM_UTILS_PATH}"
else
    echo "ERROR: Required gum utilities not found at ${GUM_UTILS_PATH}" >&2
    echo "ERROR: This indicates a corrupted or incomplete DangerPrep installation" >&2
    exit 1
fi

# =============================================================================
# CONFIGURATION AND CONSTANTS
# =============================================================================

readonly SCRIPT_NAME="DangerPrep Image Creator"
readonly VERSION="1.0.0"
readonly MIN_FREE_SPACE_GB=8  # Minimum free space required for imaging
readonly IMAGE_PREFIX="nanopi-m6-dangerprep"

# Configuration variables
OUTPUT_DIR=""
SKIP_CLEANUP=false
COMPRESS_IMAGE=false
DRY_RUN=false
DETECTED_EMMC=""
DETECTED_OUTPUT=""
IMAGE_DIRNAME=""
EFLASHER_SD_PATH=""
TEMPLATE_IMAGE_DIR=""
SD_FUSE_DIR=""

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Show help message
show_help() {
    cat << EOF
${SCRIPT_NAME} v${VERSION}

DESCRIPTION:
    Creates a sparse disk image from the currently-running Ubuntu system on
    NanoPi M6. The generated image is compatible with FriendlyElec's EFlasher
    tool for flashing to eMMC storage.

    This script captures the complete system state after DangerPrep installation,
    including all installed packages, configurations, and user data. It only
    images the eMMC storage, not the NVMe drive.

USAGE:
    sudo ./scripts/image.sh [OPTIONS]

OPTIONS:
    --output-dir DIR    Specify output directory (default: auto-detect)
    --skip-cleanup      Skip system cleanup before imaging
    --compress          Compress the output image with gzip
    --dry-run          Show what would be done without executing
    --help             Show this help message

EXAMPLES:
    # Create image with automatic detection
    sudo ./scripts/image.sh

    # Create compressed image to specific directory
    sudo ./scripts/image.sh --output-dir /mnt/usb --compress

    # Dry run to see what would be done
    sudo ./scripts/image.sh --dry-run

REQUIREMENTS:
    - Root privileges (sudo)
    - At least ${MIN_FREE_SPACE_GB}GB free space on output device
    - External storage device (USB drive or NVMe) for image output

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --output-dir)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --skip-cleanup)
                SKIP_CLEANUP=true
                shift
                ;;
            --compress)
                COMPRESS_IMAGE=true
                shift
                ;;

            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Check if running as root
check_root_privileges() {
    if [[ ${EUID} -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        log_info "Example: sudo ./scripts/image.sh"
        exit 1
    fi
}

# Check required dependencies
check_dependencies() {
    local missing_deps=()
    local deps=("dd" "pv" "lsblk" "df" "sync" "gzip")

    # Check for exfat utilities (exfatprogs provides mkfs.exfat, fsck.exfat, etc.)
    if ! command -v "mkfs.exfat" >/dev/null 2>&1; then
        missing_deps+=("exfatprogs")
    fi

    for dep in "${deps[@]}"; do
        if ! command -v "${dep}" >/dev/null 2>&1; then
            missing_deps+=("${dep}")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info ""
        log_info "These packages are required for image creation:"
        for dep in "${missing_deps[@]}"; do
            case "$dep" in
                "pv")
                    log_info "  • pv: Provides progress indication during image creation"
                    ;;
                "gzip")
                    log_info "  • gzip: Required for image compression (--compress option)"
                    ;;
                "exfatprogs")
                    log_info "  • exfatprogs: Required for exFAT filesystem support on SD cards"
                    ;;
                *)
                    log_info "  • $dep: Required system utility"
                    ;;
            esac
        done
        log_info ""
        log_info "Install missing packages:"
        log_info "  sudo apt update && sudo apt install -y ${missing_deps[*]}"
        log_info ""
        log_info "Note: These packages are automatically installed if you run DangerPrep setup"
        log_info "with 'Convenience packages' selected."
        exit 1
    fi
}

# Detect eMMC device automatically
detect_emmc_device() {
    log_info "Detecting eMMC device..."
    
    # Look for eMMC devices
    local emmc_devices=()
    while IFS= read -r device; do
        if [[ -n "${device}" ]]; then
            emmc_devices+=("${device}")
        fi
    done < <(lsblk -dn -o NAME,TYPE | awk '$2=="disk" && $1~/mmcblk/ {print "/dev/"$1}')
    
    if [[ ${#emmc_devices[@]} -eq 0 ]]; then
        log_error "No eMMC devices found"
        log_info "This script is designed for NanoPi M6 with eMMC storage"
        exit 1
    fi
    
    # Find the boot device (where root filesystem is mounted)
    local boot_device=""
    for device in "${emmc_devices[@]}"; do
        if lsblk -n "$device" | grep -q " /$"; then
            boot_device="$device"
            break
        fi
    done
    
    if [[ -z "$boot_device" ]]; then
        # Fallback: use the first eMMC device
        boot_device="${emmc_devices[0]}"
        log_warn "Could not detect boot device, using first eMMC: $boot_device"
    fi
    
    DETECTED_EMMC="$boot_device"
    log_success "Detected eMMC device: $DETECTED_EMMC"
    
    # Show device information
    local device_size
    device_size=$(lsblk -dn -o SIZE "$DETECTED_EMMC" | tr -d ' ')
    log_info "Device size: $device_size"
}

# Detect suitable output location
detect_output_location() {
    if [[ -n "$OUTPUT_DIR" ]]; then
        if [[ ! -d "$OUTPUT_DIR" ]]; then
            log_error "Specified output directory does not exist: $OUTPUT_DIR"
            exit 1
        fi
        DETECTED_OUTPUT="$OUTPUT_DIR"
        log_info "Using specified output directory: $DETECTED_OUTPUT"
        return 0
    fi
    
    log_info "Auto-detecting output location..."
    
    # Look for mounted external storage devices
    local candidates=()
    
    # Check for NVMe drives
    while IFS= read -r mountpoint; do
        if [[ -n "$mountpoint" && "$mountpoint" != "/" && "$mountpoint" != "/boot" ]]; then
            candidates+=("$mountpoint")
        fi
    done < <(lsblk -n -o MOUNTPOINT | grep "^/mnt\|^/media\|^/data" | head -5)
    
    # Check /data directory (common in DangerPrep)
    if [[ -d "/data" && -w "/data" ]]; then
        candidates+=("/data")
    fi
    
    # Check for USB mounts
    while IFS= read -r mountpoint; do
        if [[ -n "$mountpoint" ]]; then
            candidates+=("$mountpoint")
        fi
    done < <(mount | grep -E "(usb|USB)" | awk '{print $3}' | head -3)
    
    if [[ ${#candidates[@]} -eq 0 ]]; then
        log_error "No suitable output location found"
        log_info "Please specify an output directory with --output-dir"
        log_info "Example: --output-dir /mnt/usb"
        exit 1
    fi
    
    # Use the first candidate with sufficient space
    for candidate in "${candidates[@]}"; do
        local available_gb
        available_gb=$(df -BG "$candidate" | tail -1 | awk '{print $4}' | sed 's/G//')
        if [[ $available_gb -ge $MIN_FREE_SPACE_GB ]]; then
            DETECTED_OUTPUT="$candidate"
            log_success "Selected output location: $DETECTED_OUTPUT (${available_gb}GB available)"
            return 0
        fi
    done
    
    log_error "No output location with sufficient space (need ${MIN_FREE_SPACE_GB}GB)"
    log_info "Available locations:"
    for candidate in "${candidates[@]}"; do
        local available_gb
        available_gb=$(df -BG "$candidate" | tail -1 | awk '{print $4}' | sed 's/G//')
        log_info "  $candidate: ${available_gb}GB available"
    done
    exit 1
}

# Generate EFlasher directory name
generate_eflasher_dirname() {
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)

    # Create EFlasher-compatible directory name
    EFLASHER_DIRNAME="${DETECTED_OUTPUT}/ubuntu-noble-desktop-arm64-dangerprep-${timestamp}"

    log_info "EFlasher image directory will be: $EFLASHER_DIRNAME"
}

# Perform comprehensive system cleanup
perform_system_cleanup() {
    if [[ "$SKIP_CLEANUP" == "true" ]]; then
        log_info "Skipping system cleanup (--skip-cleanup specified)"
        return 0
    fi

    enhanced_section "System Cleanup" "Preparing system for imaging" "🧹"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would perform system cleanup operations"
        return 0
    fi

    # Stop non-essential services temporarily
    log_info "Stopping non-essential services..."
    systemctl stop docker.service 2>/dev/null || true
    systemctl stop containerd.service 2>/dev/null || true

    # Clear system logs
    enhanced_status_indicator "info" "Clearing system logs..."
    journalctl --vacuum-time=1d >/dev/null 2>&1 || true
    find /var/log -type f -name "*.log" -exec truncate -s 0 {} \; 2>/dev/null || true
    find /var/log -type f -name "*.log.*" -delete 2>/dev/null || true

    # Clear temporary files
    enhanced_status_indicator "info" "Clearing temporary files..."
    rm -rf /tmp/* 2>/dev/null || true
    rm -rf /var/tmp/* 2>/dev/null || true

    # Clear package caches
    enhanced_status_indicator "info" "Clearing package caches..."
    apt-get clean 2>/dev/null || true
    rm -rf /var/cache/apt/archives/* 2>/dev/null || true
    rm -rf /var/lib/apt/lists/* 2>/dev/null || true

    # Clear user caches and history
    enhanced_status_indicator "info" "Clearing user data..."
    find /home -name ".cache" -type d -exec rm -rf {} \; 2>/dev/null || true
    find /home -name ".bash_history" -type f -delete 2>/dev/null || true
    find /root -name ".cache" -type d -exec rm -rf {} \; 2>/dev/null || true
    rm -f /root/.bash_history 2>/dev/null || true

    # Clear network-specific data
    enhanced_status_indicator "info" "Clearing network data..."
    rm -rf /var/lib/dhcp/* 2>/dev/null || true
    rm -rf /var/lib/NetworkManager/* 2>/dev/null || true

    # Clear Docker data (logs only, preserve images/containers)
    if command -v docker >/dev/null 2>&1; then
        enhanced_status_indicator "info" "Clearing Docker logs..."
        docker system prune -f --volumes 2>/dev/null || true
    fi

    # Sync and drop caches
    enhanced_status_indicator "info" "Syncing filesystems..."
    sync
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true

    enhanced_status_indicator "success" "System cleanup completed"
}

# Find EFlasher SD card and template image
find_eflasher_template() {
    enhanced_section "Template Detection" "Finding EFlasher template image" "🔍"

    # First, try to detect EFlasher SD card
    local sd_mountpoint
    sd_mountpoint=$(detect_eflasher_sd)

    if [[ -z "$sd_mountpoint" ]]; then
        log_error "EFlasher SD card not found"
        log_info "Please insert the EFlasher SD card and try again"
        exit 1
    fi

    EFLASHER_SD_PATH="$sd_mountpoint"
    log_info "Found EFlasher SD card at: $EFLASHER_SD_PATH"

    # Look for Ubuntu template images
    local template_candidates=()

    # Check for various Ubuntu image directories
    for pattern in "ubuntu-noble-desktop-arm64" "ubuntu-jammy-desktop-arm64" "ubuntu-*-desktop-arm64"; do
        if [[ -d "$EFLASHER_SD_PATH/$pattern" ]]; then
            template_candidates+=("$EFLASHER_SD_PATH/$pattern")
        fi
    done

    if [[ ${#template_candidates[@]} -eq 0 ]]; then
        log_error "No Ubuntu template images found on EFlasher SD card"
        log_info "Expected to find directories like 'ubuntu-noble-desktop-arm64'"
        exit 1
    fi

    # Use the first (most recent) template found
    TEMPLATE_IMAGE_DIR="${template_candidates[0]}"
    log_info "Using template: $(basename "$TEMPLATE_IMAGE_DIR")"

    # Verify template has required files
    local required_files=("boot.img" "kernel.img" "parameter.txt" "info.conf")
    for file in "${required_files[@]}"; do
        if [[ ! -f "$TEMPLATE_IMAGE_DIR/$file" ]]; then
            log_error "Template missing required file: $file"
            exit 1
        fi
    done

    enhanced_status_indicator "success" "Template image found and validated"
}

# Setup sd-fuse tools
setup_sd_fuse() {
    enhanced_section "SD-Fuse Setup" "Preparing image creation tools" "🛠️"

    SD_FUSE_DIR="/tmp/sd-fuse_rk3588"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would setup sd-fuse tools in $SD_FUSE_DIR"
        return 0
    fi

    # Clean up any existing directory
    if [[ -d "$SD_FUSE_DIR" ]]; then
        rm -rf "$SD_FUSE_DIR"
    fi

    # Clone sd-fuse repository
    log_info "Downloading sd-fuse tools..."
    if ! git clone https://github.com/friendlyarm/sd-fuse_rk3588 -b kernel-6.1.y --depth 1 "$SD_FUSE_DIR"; then
        log_error "Failed to download sd-fuse tools"
        exit 1
    fi

    # Make scripts executable
    chmod +x "$SD_FUSE_DIR"/*.sh
    chmod +x "$SD_FUSE_DIR/tools"/*.sh

    enhanced_status_indicator "success" "SD-fuse tools ready"
}

# Create system backup using tar
create_system_backup() {
    local backup_file="$1"

    log_info "Creating system backup (this may take 5-15 minutes)..."

    # Create backup excluding unnecessary files
    if tar --warning=no-file-changed -czpf "$backup_file" \
        --exclude="$backup_file" \
        --exclude=/var/lib/docker/runtimes \
        --exclude=/etc/firstuse \
        --exclude=/etc/friendlyelec-release \
        --exclude=/usr/local/first_boot_flag \
        --exclude=/tmp/* \
        --exclude=/var/tmp/* \
        --exclude=/var/log/* \
        --exclude=/var/cache/* \
        --exclude=/proc \
        --exclude=/sys \
        --exclude=/dev \
        --exclude=/run \
        --exclude=/mnt \
        --exclude=/media \
        --one-file-system /; then

        log_info "System backup created: $(basename "$backup_file")"
        return 0
    else
        log_error "Failed to create system backup"
        return 1
    fi
}

# Create DangerPrep info.conf
create_dangerprep_info_conf() {
    local info_file="$IMAGE_DIRNAME/info.conf"
    local timestamp
    timestamp=$(date +%Y%m%d)

    cat > "$info_file" << EOF
title=Ubuntu 24.04 DangerPrep
require-board=rk3588
version=$timestamp
icon=ubuntu.png
EOF

    log_info "Created DangerPrep info.conf"
}

# Create EFlasher-compatible image using sd-fuse tools
create_disk_image() {
    enhanced_section "Image Creation" "Creating DangerPrep EFlasher image" "💾"

    # Generate image directory name
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    IMAGE_DIRNAME="${DETECTED_OUTPUT}/ubuntu-noble-desktop-arm64-dangerprep-${timestamp}"

    log_info "Creating DangerPrep EFlasher image: $(basename "$IMAGE_DIRNAME")"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create EFlasher image directory: $IMAGE_DIRNAME"
        log_info "[DRY RUN] Would backup current system and create rootfs.img"
        return 0
    fi

    # Step 1: Create system backup
    log_info "Step 1: Creating system backup..."
    local backup_file="/tmp/dangerprep-rootfs.tar.gz"

    if ! create_system_backup "$backup_file"; then
        log_error "Failed to create system backup"
        exit 1
    fi

    # Step 2: Create working directory based on template
    log_info "Step 2: Creating image directory from template..."
    if ! cp -r "$TEMPLATE_IMAGE_DIR" "$IMAGE_DIRNAME"; then
        log_error "Failed to copy template directory"
        rm -f "$backup_file" 2>/dev/null || true
        exit 1
    fi

    # Step 3: Extract backup and create new rootfs.img
    log_info "Step 3: Creating custom rootfs.img..."
    local rootfs_dir="${IMAGE_DIRNAME}/rootfs"

    # Create rootfs directory and extract backup
    mkdir -p "$rootfs_dir"
    if ! (cd "$SD_FUSE_DIR" && ./tools/extract-rootfs-tar.sh "$backup_file" "$rootfs_dir"); then
        log_error "Failed to extract rootfs backup"
        rm -rf "$IMAGE_DIRNAME" 2>/dev/null || true
        rm -f "$backup_file" 2>/dev/null || true
        exit 1
    fi

    # Build new rootfs.img
    if ! (cd "$SD_FUSE_DIR" && sudo ./build-rootfs-img.sh "$rootfs_dir" "$(basename "$IMAGE_DIRNAME")"); then
        log_error "Failed to build rootfs.img"
        rm -rf "$IMAGE_DIRNAME" 2>/dev/null || true
        rm -f "$backup_file" 2>/dev/null || true
        exit 1
    fi

    # Step 4: Update info.conf
    log_info "Step 4: Updating image configuration..."
    create_dangerprep_info_conf

    # Step 5: Clean up
    rm -rf "$rootfs_dir" 2>/dev/null || true
    rm -f "$backup_file" 2>/dev/null || true

    enhanced_status_indicator "success" "DangerPrep EFlasher image created successfully"
    log_info "Image directory: $IMAGE_DIRNAME"
}

# Validate created image directory
validate_image() {
    enhanced_section "Image Validation" "Validating created EFlasher image" "✅"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would validate created image directory"
        return 0
    fi

    if [[ ! -d "$IMAGE_DIRNAME" ]]; then
        log_error "Image directory not found: $IMAGE_DIRNAME"
        exit 1
    fi

    # Check for required files
    local required_files=("rootfs.img" "boot.img" "kernel.img" "info.conf" "parameter.txt")
    for file in "${required_files[@]}"; do
        if [[ ! -f "$IMAGE_DIRNAME/$file" ]]; then
            log_error "Missing required file: $file"
            exit 1
        fi
    done

    # Check rootfs.img size
    local rootfs_size
    rootfs_size=$(stat -c%s "$IMAGE_DIRNAME/rootfs.img" 2>/dev/null || echo "0")
    local rootfs_size_gb=$((rootfs_size / 1024 / 1024 / 1024))

    enhanced_status_indicator "info" "Rootfs size: ${rootfs_size_gb}GB"
    enhanced_status_indicator "success" "EFlasher image validation completed"
}

# Detect EFlasher SD card
detect_eflasher_sd() {
    log_info "Detecting EFlasher SD card..."

    # Look for mounted filesystems that might be EFlasher SD cards
    local sd_candidates=()

    # First, check the known common mount point for NanoPi M6
    if [[ -d "/media/pi/FriendlyARM" ]]; then
        log_info "Found EFlasher SD card at known location: /media/pi/FriendlyARM"
        sd_candidates+=("/media/pi/FriendlyARM")
    fi

    # Also check for the mount point the user is using
    if [[ -d "/mnt/eflasher-64gb" ]]; then
        log_info "Found EFlasher SD card at: /mnt/eflasher-64gb"
        sd_candidates+=("/mnt/eflasher-64gb")
    fi

    # Also check other potential mount points
    while IFS= read -r line; do
        local device mountpoint fstype label
        device=$(echo "$line" | awk '{print $1}')
        mountpoint=$(echo "$line" | awk '{print $2}')
        fstype=$(echo "$line" | awk '{print $3}')
        label=$(echo "$line" | awk '{print $4}')

        # Skip if mountpoint is empty or already found
        if [[ -z "$mountpoint" || "$mountpoint" == "/media/pi/FriendlyARM" ]]; then
            continue
        fi

        # Look for FAT32/exFAT filesystems that might be EFlasher cards
        if [[ "$fstype" == "vfat" || "$fstype" == "fat32" || "$fstype" == "exfat" ]]; then
            # Check for EFlasher-specific indicators
            if [[ "$label" =~ (FRIENDLYARM|EFLASHER) ]] ||
               [[ "$mountpoint" =~ /media/.*/FriendlyARM ]] ||
               [[ -f "${mountpoint}/eflasher" ]] ||
               [[ -f "${mountpoint}/info.conf" ]] ||
               [[ -d "${mountpoint}/ubuntu-jammy-desktop-arm64" ]] ||
               [[ -d "${mountpoint}/debian-bookworm-core-arm64" ]] ||
               [[ -d "${mountpoint}/friendlycore-xenial_4.14_armhf" ]] ||
               [[ -d "${mountpoint}/android" ]]; then
                sd_candidates+=("$mountpoint")
            fi
        fi
    done < <(lsblk -o NAME,MOUNTPOINT,FSTYPE,LABEL | grep -v "^NAME" | grep -v "^$")

    if [[ ${#sd_candidates[@]} -eq 0 ]]; then
        log_error "No EFlasher SD card detected"
        log_info "Please ensure your EFlasher SD card is inserted and mounted"
        log_info "The SD card should contain EFlasher files like info.conf or OS directories"
        return 1
    fi

    # Use the first candidate
    local selected_sd="${sd_candidates[0]}"
    log_success "Detected EFlasher SD card: $selected_sd"

    # Check available space
    local available_gb
    available_gb=$(df -BG "$selected_sd" | tail -1 | awk '{print $4}' | sed 's/G//')
    log_info "Available space on SD card: ${available_gb}GB"

    if [[ $available_gb -lt 2 ]]; then
        log_warn "Limited space on SD card (${available_gb}GB available)"
        log_info "Consider using --compress option or freeing up space"
    fi

    echo "$selected_sd"
}

# Copy image to EFlasher SD card
copy_to_eflasher_sd() {
    # Check if EFlasher SD card is available
    if [[ -z "$EFLASHER_SD_PATH" || ! -d "$EFLASHER_SD_PATH" ]]; then
        log_info "No EFlasher SD card available - skipping copy"
        return 0
    fi

    enhanced_section "SD Card Copy" "Copying image to EFlasher SD card" "💾"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would copy image to EFlasher SD card"
        return 0
    fi

    # Detect EFlasher SD card
    local sd_mountpoint
    if ! sd_mountpoint=$(detect_eflasher_sd); then
        log_error "Cannot copy to SD card - no EFlasher SD card detected"
        return 1
    fi

    # Check if image directory exists
    if [[ ! -d "$IMAGE_DIRNAME" ]]; then
        log_error "Image directory not found: $IMAGE_DIRNAME"
        return 1
    fi

    # Get directory size and check space
    local dir_size_bytes
    dir_size_bytes=$(du -sb "$IMAGE_DIRNAME" | cut -f1)
    local dir_size_gb=$((dir_size_bytes / 1024 / 1024 / 1024 + 1))  # Round up

    local available_bytes
    available_bytes=$(df -B1 "$EFLASHER_SD_PATH" | tail -1 | awk '{print $4}')
    local available_gb=$((available_bytes / 1024 / 1024 / 1024))

    if [[ $available_bytes -lt $dir_size_bytes ]]; then
        log_error "Insufficient space on EFlasher SD card"
        log_error "Required: ${dir_size_gb}GB, Available: ${available_gb}GB"
        return 1
    fi

    # Copy the image directory
    local dest_dirname
    dest_dirname="$EFLASHER_SD_PATH/$(basename "$IMAGE_DIRNAME")"

    enhanced_status_indicator "info" "Copying image directory to SD card..."
    if ! cp -r "$IMAGE_DIRNAME" "$EFLASHER_SD_PATH/"; then
        log_error "Failed to copy image directory to SD card"
        rm -rf "$dest_dirname" 2>/dev/null || true
        return 1
    fi

    # Sync to ensure data is written
    sync

    enhanced_status_indicator "success" "Image directory copied to EFlasher SD card"
    log_info "Destination: $dest_dirname"
    log_info "The image will appear as '$(basename "$IMAGE_DIRNAME")' in EFlasher"

    # Show EFlasher usage information
    log_info ""
    log_info "Your DangerPrep image is now ready for use with EFlasher!"
    log_info "It will appear in the EFlasher interface as a selectable OS option."
}

# Show completion information
show_completion_info() {
    enhanced_section "Completion" "Image creation successful" "🎉"

    log_success "DangerPrep EFlasher image created successfully!"
    log_info ""
    log_info "Image Details:"
    log_info "  Directory: $IMAGE_DIRNAME"
    log_info "  Name: $(basename "$IMAGE_DIRNAME")"
    if [[ -f "$IMAGE_DIRNAME/rootfs.img" ]]; then
        local rootfs_size
        rootfs_size=$(stat -c%s "$IMAGE_DIRNAME/rootfs.img" 2>/dev/null || echo "0")
        local rootfs_size_gb=$((rootfs_size / 1024 / 1024 / 1024))
        log_info "  Rootfs Size: ${rootfs_size_gb}GB"
    fi
    log_info ""
    if [[ -n "$EFLASHER_SD_PATH" && -d "$EFLASHER_SD_PATH" ]]; then
        log_info "EFlasher Usage (SD card already prepared):"
        log_info "  1. Insert the EFlasher SD card into target device"
        log_info "  2. Boot the device (hold BOOT button if required)"
        log_info "  3. Select 'Ubuntu 24.04 DangerPrep' from the EFlasher interface"
        log_info "  4. Follow the installation prompts"
    else
        log_info "EFlasher Usage:"
        log_info "  1. Copy the image directory to your EFlasher SD card"
        log_info "  2. Insert the SD card into target device"
        log_info "  3. Boot the device (hold BOOT button if required)"
        log_info "  4. Select 'Ubuntu 24.04 DangerPrep' from the EFlasher interface"
    fi
    log_info ""

    log_info "The DangerPrep image will appear as a selectable OS in EFlasher"
    log_info "and contains all your current system customizations."
}

# =============================================================================
# MAIN WORKFLOW
# =============================================================================

# Pre-flight checks
perform_preflight_checks() {
    enhanced_section "Pre-flight Checks" "Validating system requirements" "🔍"

    # Check root privileges
    check_root_privileges
    enhanced_status_indicator "success" "Root privileges confirmed"

    # Check dependencies
    check_dependencies
    enhanced_status_indicator "success" "All dependencies available"

    # Detect eMMC device
    detect_emmc_device

    # Detect output location
    detect_output_location

    # Find EFlasher template
    find_eflasher_template

    # Setup sd-fuse tools
    setup_sd_fuse

    enhanced_status_indicator "success" "Pre-flight checks completed"
}

# Get user confirmation
get_user_confirmation() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Skipping user confirmation"
        return 0
    fi

    enhanced_section "Confirmation" "Review operation details" "❓"

    log_info "Operation Summary:"
    log_info "  Source Device: ${DETECTED_EMMC}"
    log_info "  Output Location: ${DETECTED_OUTPUT}"
    log_info "  Template Image: $(basename "${TEMPLATE_IMAGE_DIR}")"
    log_info "  EFlasher SD Card: ${EFLASHER_SD_PATH}"

    local cleanup_status="Yes"
    if [[ "${SKIP_CLEANUP}" == "true" ]]; then
        cleanup_status="No"
    fi
    log_info "  Cleanup System: ${cleanup_status}"

    local compress_status="No"
    if [[ "${COMPRESS_IMAGE}" == "true" ]]; then
        compress_status="Yes"
    fi
    log_info "  Compress Image: ${compress_status}"

    local copy_sd_status="No"
    if [[ -n "$EFLASHER_SD_PATH" && -d "$EFLASHER_SD_PATH" ]]; then
        copy_sd_status="Yes (SD card detected)"
    fi
    log_info "  Copy to SD Card: ${copy_sd_status}"
    log_info ""

    if ! enhanced_confirm "Proceed with image creation?" "true"; then
        log_info "Operation cancelled by user"
        exit 0
    fi

    enhanced_status_indicator "success" "User confirmation received"
}

# Cleanup function for error handling
cleanup_on_error() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Image creation failed with exit code $exit_code"

        # Clean up partial image directory
        if [[ -n "$IMAGE_DIRNAME" && -d "$IMAGE_DIRNAME" ]]; then
            log_info "Cleaning up partial image directory..."
            rm -rf "$IMAGE_DIRNAME" 2>/dev/null || true
        fi

        # Clean up sd-fuse directory
        if [[ -n "$SD_FUSE_DIR" && -d "$SD_FUSE_DIR" ]]; then
            log_info "Cleaning up sd-fuse tools..."
            rm -rf "$SD_FUSE_DIR" 2>/dev/null || true
        fi

        # Restart services if they were stopped
        if [[ "$SKIP_CLEANUP" != "true" && "$DRY_RUN" != "true" ]]; then
            log_info "Restarting services..."
            systemctl start docker.service 2>/dev/null || true
            systemctl start containerd.service 2>/dev/null || true
        fi
    fi
    exit $exit_code
}

# Main function
main() {
    # Set up error handling
    trap cleanup_on_error EXIT

    # Show banner
    enhanced_section "$SCRIPT_NAME" "Creating EFlasher-compatible system image" "🖼️"

    # Parse command line arguments
    parse_args "$@"

    # Perform pre-flight checks
    perform_preflight_checks

    # Get user confirmation
    get_user_confirmation

    # Perform system cleanup
    perform_system_cleanup

    # Create disk image
    create_disk_image

    # Validate image
    validate_image

    # Copy to SD card if requested
    copy_to_eflasher_sd

    # Show completion information
    show_completion_info

    # Restart services if they were stopped
    if [[ "$SKIP_CLEANUP" != "true" && "$DRY_RUN" != "true" ]]; then
        log_info "Restarting services..."
        systemctl start docker.service 2>/dev/null || true
        systemctl start containerd.service 2>/dev/null || true
    fi

    log_success "Image creation process completed successfully!"
}

# =============================================================================
# SCRIPT EXECUTION
# =============================================================================

# Only run main if script is executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
