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
COPY_TO_SD=false
DRY_RUN=false
DETECTED_EMMC=""
DETECTED_OUTPUT=""
IMAGE_FILENAME=""

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
    --copy-to-sd        Copy image to EFlasher SD card after creation
    --dry-run          Show what would be done without executing
    --help             Show this help message

EXAMPLES:
    # Create image with automatic detection
    sudo ./scripts/image.sh

    # Create compressed image to specific directory
    sudo ./scripts/image.sh --output-dir /mnt/usb --compress

    # Create image and copy to EFlasher SD card
    sudo ./scripts/image.sh --copy-to-sd

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
            --copy-to-sd)
                COPY_TO_SD=true
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

    for dep in "${deps[@]}"; do
        if ! command -v "${dep}" >/dev/null 2>&1; then
            missing_deps+=("${dep}")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Install missing packages: sudo apt update && sudo apt install -y pv gzip"
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

# Generate image filename
generate_image_filename() {
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local base_filename="${IMAGE_PREFIX}-${timestamp}.raw"

    if [[ "$COMPRESS_IMAGE" == "true" ]]; then
        base_filename="${base_filename}.gz"
    fi

    IMAGE_FILENAME="${DETECTED_OUTPUT}/${base_filename}"
    log_info "Image will be saved as: $IMAGE_FILENAME"
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

# Create sparse disk image
create_disk_image() {
    enhanced_section "Image Creation" "Creating sparse disk image" "💾"

    local device_size_bytes
    device_size_bytes=$(lsblk -dn -b -o SIZE "$DETECTED_EMMC")
    local device_size_gb=$((device_size_bytes / 1024 / 1024 / 1024))

    log_info "Source device: $DETECTED_EMMC (${device_size_gb}GB)"
    log_info "Output file: $IMAGE_FILENAME"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create sparse image of $DETECTED_EMMC"
        log_info "[DRY RUN] Output: $IMAGE_FILENAME"
        return 0
    fi

    # Check available space
    local available_bytes
    available_bytes=$(df -B1 "$DETECTED_OUTPUT" | tail -1 | awk '{print $4}')
    local required_bytes=$((device_size_bytes / 2))  # Estimate for sparse image

    if [[ $available_bytes -lt $required_bytes ]]; then
        log_error "Insufficient disk space for image creation"
        log_info "Available: $((available_bytes / 1024 / 1024 / 1024))GB"
        log_info "Required (estimated): $((required_bytes / 1024 / 1024 / 1024))GB"
        exit 1
    fi

    # Create the sparse image
    enhanced_status_indicator "info" "Creating sparse disk image..."

    if [[ "$COMPRESS_IMAGE" == "true" ]]; then
        # Create compressed sparse image
        if ! pv "$DETECTED_EMMC" | gzip > "$IMAGE_FILENAME"; then
            log_error "Failed to create compressed image"
            rm -f "$IMAGE_FILENAME" 2>/dev/null || true
            exit 1
        fi
    else
        # Create uncompressed sparse image
        if ! pv "$DETECTED_EMMC" | dd of="$IMAGE_FILENAME" bs=1M conv=sparse; then
            log_error "Failed to create image"
            rm -f "$IMAGE_FILENAME" 2>/dev/null || true
            exit 1
        fi
    fi

    enhanced_status_indicator "success" "Image creation completed"
}

# Validate created image
validate_image() {
    enhanced_section "Image Validation" "Validating created image" "✅"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would validate created image"
        return 0
    fi

    if [[ ! -f "$IMAGE_FILENAME" ]]; then
        log_error "Image file not found: $IMAGE_FILENAME"
        exit 1
    fi

    # Check file size
    local image_size
    image_size=$(stat -c%s "$IMAGE_FILENAME")
    local image_size_gb=$((image_size / 1024 / 1024 / 1024))

    enhanced_status_indicator "info" "Image size: ${image_size_gb}GB"

    # Create checksum
    enhanced_status_indicator "info" "Generating checksum..."
    local checksum_file="${IMAGE_FILENAME}.sha256"
    if ! sha256sum "$IMAGE_FILENAME" > "$checksum_file"; then
        log_warn "Failed to create checksum file"
    else
        enhanced_status_indicator "success" "Checksum saved: $(basename "$checksum_file")"
    fi

    enhanced_status_indicator "success" "Image validation completed"
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

        # Look for FAT32 filesystems that might be EFlasher cards
        if [[ "$fstype" == "vfat" || "$fstype" == "fat32" ]]; then
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
    if [[ "$COPY_TO_SD" != "true" ]]; then
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

    # Check if image file exists
    if [[ ! -f "$IMAGE_FILENAME" ]]; then
        log_error "Image file not found: $IMAGE_FILENAME"
        return 1
    fi

    # Get image size and check space
    local image_size_bytes
    image_size_bytes=$(stat -c%s "$IMAGE_FILENAME")
    local image_size_gb=$((image_size_bytes / 1024 / 1024 / 1024 + 1))  # Round up

    local available_bytes
    available_bytes=$(df -B1 "$sd_mountpoint" | tail -1 | awk '{print $4}')
    local available_gb=$((available_bytes / 1024 / 1024 / 1024))

    if [[ $available_bytes -lt $image_size_bytes ]]; then
        log_error "Insufficient space on SD card"
        log_info "Required: ${image_size_gb}GB, Available: ${available_gb}GB"
        return 1
    fi

    # Copy the image file
    local dest_filename
    dest_filename="$sd_mountpoint/$(basename "$IMAGE_FILENAME")"

    enhanced_status_indicator "info" "Copying image to SD card..."
    if ! pv "$IMAGE_FILENAME" > "$dest_filename"; then
        log_error "Failed to copy image to SD card"
        rm -f "$dest_filename" 2>/dev/null || true
        return 1
    fi

    # Copy checksum file if it exists
    if [[ -f "${IMAGE_FILENAME}.sha256" ]]; then
        cp "${IMAGE_FILENAME}.sha256" "${dest_filename}.sha256" 2>/dev/null || true
    fi

    # Sync to ensure data is written
    sync

    enhanced_status_indicator "success" "Image copied to SD card: $(basename "$dest_filename")"
    log_info "SD card location: $sd_mountpoint"

    # Show EFlasher configuration suggestion
    log_info ""
    log_info "To enable automatic restore, create/edit eflasher.conf on the SD card:"
    log_info "  [General]"
    log_info "  autoStart=/mnt/sdcard/$(basename "$dest_filename")"
    log_info "  autoExit=true"
}

# Show completion information
show_completion_info() {
    enhanced_section "Completion" "Image creation successful" "🎉"

    log_success "Sparse disk image created successfully!"
    log_info ""
    log_info "Image Details:"
    log_info "  File: $IMAGE_FILENAME"
    if [[ -f "${IMAGE_FILENAME}.sha256" ]]; then
        log_info "  Checksum: ${IMAGE_FILENAME}.sha256"
    fi
    log_info ""
    if [[ "$COPY_TO_SD" == "true" ]]; then
        log_info "EFlasher Usage (SD card already prepared):"
        log_info "  1. Insert the EFlasher SD card into target device"
        log_info "  2. Boot the device (hold BOOT button if required)"
        log_info "  3. Select 'Restore eMMC Flash from backup file'"
        log_info "  4. Choose your DangerPrep image from the list"
    else
        log_info "EFlasher Usage:"
        log_info "  1. Copy the .raw file to an EFlasher SD card"
        log_info "  2. Use EFlasher's 'Restore eMMC Flash from backup file' option"
        log_info "  3. Select your .raw file to flash to new devices"
    fi
    log_info ""
    log_info "For automatic restoration, create eflasher.conf with:"
    log_info "  [General]"
    log_info "  autoStart=$(basename "$IMAGE_FILENAME")"
    log_info ""

    if [[ "$COMPRESS_IMAGE" == "true" ]]; then
        log_info "Note: Compressed images may need to be decompressed before use with EFlasher"
    fi
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

    # Generate image filename
    generate_image_filename

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
    log_info "  Image Filename: $(basename "${IMAGE_FILENAME}")"

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
    if [[ "${COPY_TO_SD}" == "true" ]]; then
        copy_sd_status="Yes"
    fi
    log_info "  Copy to SD Card: ${copy_sd_status}"
    log_info ""

    if ! gum confirm "Proceed with image creation?"; then
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

        # Clean up partial image file
        if [[ -n "$IMAGE_FILENAME" && -f "$IMAGE_FILENAME" ]]; then
            log_info "Cleaning up partial image file..."
            rm -f "$IMAGE_FILENAME" 2>/dev/null || true
            rm -f "${IMAGE_FILENAME}.sha256" 2>/dev/null || true
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
