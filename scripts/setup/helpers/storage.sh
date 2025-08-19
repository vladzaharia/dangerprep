#!/bin/bash
#
# DangerPrep Storage Management Helper
# Handles NVMe SSD partitioning and mounting for Olares and Content storage
#

# Prevent multiple sourcing
if [[ "${STORAGE_HELPER_SOURCED:-}" == "true" ]]; then
    return 0
fi

# Get the directory where this script is located
STORAGE_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${STORAGE_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${STORAGE_HELPER_DIR}/../../shared/errors.sh"
fi

if [[ -z "${VALIDATION_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/validation.sh
    source "${STORAGE_HELPER_DIR}/../../shared/validation.sh"
fi

# Mark this file as sourced
export STORAGE_HELPER_SOURCED=true

# Storage configuration constants
readonly OLARES_PARTITION_SIZE="256GB"
readonly OLARES_MOUNT_POINT="/olares"
readonly CONTENT_MOUNT_POINT="/content"
readonly MIN_DEVICE_SIZE_GB=300  # 256GB for Olares + 44GB minimum for content



#
# NVMe Device Detection Functions
#

# Detect available NVMe devices
# Usage: detect_nvme_devices
# Returns: 0 if devices found, 1 if none found
# Sets: NVME_DEVICE variable with selected device path
detect_nvme_devices() {
    set_error_context "NVMe device detection"
    
    log "Scanning for NVMe SSD devices..."
    
    # Find NVMe devices using lsblk
    local nvme_devices
    nvme_devices=$(lsblk -d -n -o NAME,SIZE,TYPE | grep nvme | awk '{print "/dev/" $1}' || true)
    
    if [[ -z "${nvme_devices}" ]]; then
        warning "No NVMe devices found"
        warning "Continuing with existing storage configuration"
        clear_error_context
        return 1
    fi

    # Convert to array
    local device_array=()
    while IFS= read -r device; do
        if [[ -n "${device}" ]]; then
            device_array+=("${device}")
        fi
    done <<< "${nvme_devices}"
    
    if [[ ${#device_array[@]} -eq 0 ]]; then
        warning "No valid NVMe devices found"
        clear_error_context
        return 1
    elif [[ ${#device_array[@]} -eq 1 ]]; then
        NVME_DEVICE="${device_array[0]}"
        log "Found NVMe device: ${NVME_DEVICE}"
    else
        log "Multiple NVMe devices found:"
        for i in "${!device_array[@]}"; do
            local device="${device_array[${i}]}"
            local size
            size=$(lsblk -d -n -o SIZE "${device}" 2>/dev/null || echo "Unknown")
            log "  $((i+1)). ${device} (${size})"
        done

        # Use first device by default
        NVME_DEVICE="${device_array[0]}"
        log "Using first device: ${NVME_DEVICE}"
    fi

    # Validate device size
    local device_size_str
    local device_size_gb
    device_size_str=$(lsblk -d -n -o SIZE "${NVME_DEVICE}")
    device_size_gb=$(parse_storage_size "${device_size_str}")

    if [[ ${device_size_gb} -lt ${MIN_DEVICE_SIZE_GB} ]]; then
        error "Device ${NVME_DEVICE} is too small (${device_size_gb}GB < ${MIN_DEVICE_SIZE_GB}GB required)"
        clear_error_context
        return 1
    fi

    success "NVMe device selected: ${NVME_DEVICE} (${device_size_gb}GB)"
    clear_error_context
    return 0
}

# Check if device has existing partitions
# Usage: check_existing_partitions "$device"
# Returns: 0 if partitions exist, 1 if device is clean
check_existing_partitions() {
    local device="$1"
    set_error_context "Partition check"
    
    if [[ -z "${device}" ]]; then
        error "Device path is required"
        clear_error_context
        return 1
    fi

    local partitions
    partitions=$(lsblk -n -o NAME "${device}" | grep -v "^$(basename "${device}")$" || true)

    if [[ -n "${partitions}" ]]; then
        log "Existing partitions found on ${device}:"
        lsblk "${device}"
        clear_error_context
        return 0
    else
        debug "No existing partitions on ${device}"
        clear_error_context
        return 1
    fi
}

# Check if partition has existing data
# Usage: check_partition_data "$partition" "$partition_name"
# Returns: 0 if data exists, 1 if empty/no filesystem
check_partition_data() {
    local partition="$1"
    local partition_name="${2:-partition}"
    set_error_context "${partition_name} data check"

    if [[ -z "${partition}" ]]; then
        clear_error_context
        return 1
    fi

    # Check if partition has a filesystem
    if ! blkid "${partition}" >/dev/null 2>&1; then
        debug "No filesystem on ${partition}"
        clear_error_context
        return 1
    fi

    # Try to mount temporarily to check for data
    local temp_mount
    temp_mount=$(mktemp -d)

    if mount "${partition}" "${temp_mount}" 2>/dev/null; then
        local file_count
        local dir_count
        file_count=$(find "${temp_mount}" -type f 2>/dev/null | wc -l)
        dir_count=$(find "${temp_mount}" -mindepth 1 -type d 2>/dev/null | wc -l)
        umount "${temp_mount}" 2>/dev/null || true
        rmdir "${temp_mount}" 2>/dev/null || true

        if [[ ${file_count} -gt 0 || ${dir_count} -gt 0 ]]; then
            log "Found ${file_count} files and ${dir_count} directories on ${partition_name}"
            clear_error_context
            return 0
        fi
    else
        rmdir "${temp_mount}" 2>/dev/null || true
    fi

    debug "No data found on ${partition_name}"
    clear_error_context
    return 1
}

# Check if content partition has existing data (backward compatibility)
# Usage: check_content_data "$content_partition"
# Returns: 0 if data exists, 1 if empty/no filesystem
check_content_data() {
    check_partition_data "$1" "content partition"
}

#
# Partitioning Functions
#

# Create partitions on NVMe device
# Usage: partition_nvme_device "$device"
# Returns: 0 if successful, 1 if failed
partition_nvme_device() {
    local device="$1"
    set_error_context "NVMe partitioning"
    
    if [[ -z "$device" ]]; then
        error "Device path is required"
        clear_error_context
        return 1
    fi
    
    log "Creating partitions on $device..."
    log "  Partition 1: ${OLARES_PARTITION_SIZE} for Olares (${OLARES_MOUNT_POINT})"
    log "  Partition 2: Remaining space for Content (${CONTENT_MOUNT_POINT})"
    
    if is_dry_run; then
        log_planned_change "Create GPT partition table on $device"
        log_planned_change "Create ${OLARES_PARTITION_SIZE} Olares partition"
        log_planned_change "Create remaining space Content partition"
        clear_error_context
        return 0
    fi
    
    # Validate required commands
    require_commands parted
    
    # Create GPT partition table
    if ! parted "$device" --script mklabel gpt; then
        error "Failed to create GPT partition table on $device"
        clear_error_context
        return 1
    fi
    
    # Create Olares partition (256GB)
    if ! parted "$device" --script mkpart primary ext4 0% "$OLARES_PARTITION_SIZE"; then
        error "Failed to create Olares partition"
        clear_error_context
        return 1
    fi
    
    # Create Content partition (remaining space)
    if ! parted "$device" --script mkpart primary ext4 "$OLARES_PARTITION_SIZE" 100%; then
        error "Failed to create Content partition"
        clear_error_context
        return 1
    fi
    
    # Wait for kernel to recognize new partitions
    sleep 2
    partprobe "$device" 2>/dev/null || true
    sleep 1
    
    # Verify partitions were created
    if ! lsblk "$device" | grep -q "${device}p1"; then
        error "Olares partition not found after creation"
        clear_error_context
        return 1
    fi
    
    if ! lsblk "$device" | grep -q "${device}p2"; then
        error "Content partition not found after creation"
        clear_error_context
        return 1
    fi
    
    success "NVMe partitions created successfully"
    clear_error_context
    return 0
}

# Format partitions with ext4 filesystem
# Usage: format_partitions "$device"
# Returns: 0 if successful, 1 if failed
format_partitions() {
    local device="$1"
    set_error_context "Partition formatting"
    
    if [[ -z "$device" ]]; then
        error "Device path is required"
        clear_error_context
        return 1
    fi
    
    local olares_partition="${device}p1"
    local content_partition="${device}p2"
    
    log "Formatting partitions with ext4 filesystem..."
    
    if is_dry_run; then
        log_planned_change "Format $olares_partition as ext4 with label 'olares'"
        log_planned_change "Format $content_partition as ext4 with label 'content'"
        clear_error_context
        return 0
    fi
    
    # Validate required commands
    require_commands mkfs.ext4
    
    # Format Olares partition
    log "Formatting Olares partition: $olares_partition"
    if ! mkfs.ext4 -F -L olares "$olares_partition"; then
        error "Failed to format Olares partition"
        clear_error_context
        return 1
    fi
    
    # Format Content partition
    log "Formatting Content partition: $content_partition"
    if ! mkfs.ext4 -F -L content "$content_partition"; then
        error "Failed to format Content partition"
        clear_error_context
        return 1
    fi
    
    success "NVMe partitions formatted successfully"
    clear_error_context
    return 0
}

#
# Mounting Functions
#

# Create mount points and mount partitions
# Usage: mount_partitions "$device"
# Returns: 0 if successful, 1 if failed
mount_partitions() {
    local device="$1"
    set_error_context "Partition mounting"

    if [[ -z "$device" ]]; then
        error "Device path is required"
        clear_error_context
        return 1
    fi

    local olares_partition="${device}p1"
    local content_partition="${device}p2"

    log "Creating mount points and mounting partitions..."

    if is_dry_run; then
        log_planned_change "Create mount point: $OLARES_MOUNT_POINT"
        log_planned_change "Create mount point: $CONTENT_MOUNT_POINT"
        log_planned_change "Mount $olares_partition to $OLARES_MOUNT_POINT"
        log_planned_change "Mount $content_partition to $CONTENT_MOUNT_POINT"
        clear_error_context
        return 0
    fi

    # Create mount points
    if ! mkdir -p "$OLARES_MOUNT_POINT" "$CONTENT_MOUNT_POINT"; then
        error "Failed to create mount points"
        clear_error_context
        return 1
    fi

    # Mount Olares partition
    log "Mounting Olares partition: $olares_partition -> $OLARES_MOUNT_POINT"
    if ! mount "$olares_partition" "$OLARES_MOUNT_POINT"; then
        error "Failed to mount Olares partition"
        clear_error_context
        return 1
    fi

    # Mount Content partition
    log "Mounting Content partition: $content_partition -> $CONTENT_MOUNT_POINT"
    if ! mount "$content_partition" "$CONTENT_MOUNT_POINT"; then
        error "Failed to mount Content partition"
        # Try to unmount Olares partition on failure
        umount "$OLARES_MOUNT_POINT" 2>/dev/null || true
        clear_error_context
        return 1
    fi

    # Set appropriate permissions
    chmod 755 "$OLARES_MOUNT_POINT" "$CONTENT_MOUNT_POINT"
    chown root:root "$OLARES_MOUNT_POINT"
    chown ubuntu:ubuntu "$CONTENT_MOUNT_POINT"

    # Verify mounts
    if ! mountpoint -q "$OLARES_MOUNT_POINT"; then
        error "Olares mount verification failed"
        clear_error_context
        return 1
    fi

    if ! mountpoint -q "$CONTENT_MOUNT_POINT"; then
        error "Content mount verification failed"
        clear_error_context
        return 1
    fi

    success "NVMe partitions mounted successfully"
    log "  Olares: ${olares_partition} -> ${OLARES_MOUNT_POINT}"
    log "  Content: ${content_partition} -> ${CONTENT_MOUNT_POINT}"
    clear_error_context
    return 0
}

# Setup persistent mounts in /etc/fstab
# Usage: setup_persistent_mounts "$device"
# Returns: 0 if successful, 1 if failed
setup_persistent_mounts() {
    local device="$1"
    set_error_context "Persistent mount setup"

    if [[ -z "$device" ]]; then
        error "Device path is required"
        clear_error_context
        return 1
    fi

    local olares_partition="${device}p1"
    local content_partition="${device}p2"

    log "Setting up persistent mounts in /etc/fstab..."

    if is_dry_run; then
        log_planned_change "Add Olares partition to /etc/fstab"
        log_planned_change "Add Content partition to /etc/fstab"
        clear_error_context
        return 0
    fi

    # Validate required commands
    require_commands blkid

    # Get UUIDs for reliable mounting
    local olares_uuid
    local content_uuid

    olares_uuid=$(blkid "$olares_partition" -s UUID -o value 2>/dev/null)
    content_uuid=$(blkid "$content_partition" -s UUID -o value 2>/dev/null)

    if [[ -z "$olares_uuid" ]]; then
        error "Failed to get UUID for Olares partition"
        clear_error_context
        return 1
    fi

    if [[ -z "$content_uuid" ]]; then
        error "Failed to get UUID for Content partition"
        clear_error_context
        return 1
    fi

    # Backup original fstab
    backup_file "/etc/fstab"

    # Remove any existing entries for these mount points
    sed -i "\|$OLARES_MOUNT_POINT|d" /etc/fstab
    sed -i "\|$CONTENT_MOUNT_POINT|d" /etc/fstab

    # Add new entries to fstab
    cat >> /etc/fstab << EOF

# DangerPrep NVMe Storage Mounts
UUID=$olares_uuid $OLARES_MOUNT_POINT ext4 defaults,noatime,discard 0 2
UUID=$content_uuid $CONTENT_MOUNT_POINT ext4 defaults,noatime,discard 0 2
EOF

    # Verify fstab syntax
    if ! mount -a --fake; then
        error "Invalid fstab syntax detected"
        # Restore backup
        if [[ -f "${BACKUP_DIR}/fstab" ]]; then
            cp "${BACKUP_DIR}/fstab" /etc/fstab
        fi
        clear_error_context
        return 1
    fi

    success "NVMe persistent mounts configured"
    log "  Olares: UUID=${olares_uuid} -> ${OLARES_MOUNT_POINT}"
    log "  Content: UUID=${content_uuid} -> ${CONTENT_MOUNT_POINT}"
    clear_error_context
    return 0
}

#
# Main Storage Setup Functions
#

# Main NVMe storage setup orchestration function
# Usage: setup_nvme_storage
# Returns: 0 if successful, 1 if failed
setup_nvme_storage() {
    set_error_context "NVMe storage setup"

    log_section "NVMe Storage Setup"
    log "Setting up NVMe SSD for Olares and Content storage..."

    # Detect NVMe devices
    if ! detect_nvme_devices; then
        info "No NVMe devices found - continuing with existing storage"
        info "NVMe SSD can be added later for expanded storage capacity"
        clear_error_context
        return 0  # Not an error, just continue without NVMe setup
    fi

    local device="${NVME_DEVICE}"
    local olares_partition="${device}p1"
    local content_partition="${device}p2"

    # Check for existing partitions
    if check_existing_partitions "${device}"; then
        log "Existing partitions detected on ${device}"

        # Check if our expected partitions exist
        if [[ -b "${olares_partition}" && -b "${content_partition}" ]]; then
            log "Found existing Olares and Content partitions"

            # Check for existing data on both partitions
            local olares_has_data=false
            local content_has_data=false
            local data_warning_shown=false

            if check_partition_data "${olares_partition}" "Olares partition"; then
                olares_has_data=true
                warning "Olares partition contains existing data"
                data_warning_shown=true
            fi

            if check_partition_data "${content_partition}" "Content partition"; then
                content_has_data=true
                warning "Content partition contains existing data"
                data_warning_shown=true
            fi

            # If any data found, warn and ask for confirmation
            if [[ "${data_warning_shown}" == "true" ]]; then
                if ! is_dry_run; then
                    echo
                    warning "DESTRUCTIVE OPERATION WARNING:"
                    if [[ "${olares_has_data}" == "true" ]]; then
                        warning "• Olares partition will be reformatted (all data lost)"
                    fi
                    if [[ "${content_has_data}" == "true" ]]; then
                        warning "• Content partition will be reformatted (all data lost)"
                    fi
                    echo
                    read -p "Continue and reformat partitions? This will DELETE ALL DATA! (yes/no): " -r
                    if [[ ! ${REPLY} =~ ^[Yy][Ee][Ss]$ ]]; then
                        log "Preserving existing partition data - attempting to mount as-is"
                        # Try to mount existing partitions without reformatting
                        if mount_partitions "${device}" && setup_persistent_mounts "${device}"; then
                            success "Using existing NVMe storage with preserved data"
                            clear_error_context
                            return 0
                        else
                            error "Failed to mount existing partitions"
                            error "Partitions may need reformatting to work properly"
                            clear_error_context
                            return 1
                        fi
                    fi
                fi
            fi

            # Reformat existing partitions
            log "Reformatting existing partitions..."
            if ! format_partitions "${device}"; then
                error "Failed to reformat existing partitions"
                clear_error_context
                return 1
            fi
        else
            # Existing partitions but not our layout - need to repartition
            warning "Existing partition layout does not match DangerPrep requirements"

            # Check for data on any existing partitions
            local existing_data=false
            log "Checking existing partitions for data..."
            for part in "${device}"*; do
                if [[ -b "${part}" && "${part}" != "${device}" ]]; then
                    local part_name
                    part_name=$(basename "${part}")
                    if check_partition_data "${part}" "${part_name}"; then
                        existing_data=true
                    fi
                fi
            done

            if ! is_dry_run; then
                echo
                if [[ "${existing_data}" == "true" ]]; then
                    warning "DESTRUCTIVE OPERATION WARNING:"
                    warning "• Existing partitions contain data that will be PERMANENTLY LOST"
                    warning "• Device will be completely repartitioned for DangerPrep use"
                    echo
                fi
                read -p "Repartition device? This will DELETE ALL DATA! (yes/no): " -r
                if [[ ! ${REPLY} =~ ^[Yy][Ee][Ss]$ ]]; then
                    warning "Cannot proceed without repartitioning - skipping NVMe setup"
                    clear_error_context
                    return 0
                fi
            fi

            # Unmount any existing mounts
            for part in "${device}"*; do
                if [[ -b "${part}" ]] && mountpoint -q "${part}" 2>/dev/null; then
                    log "Unmounting ${part}"
                    umount "${part}" 2>/dev/null || true
                fi
            done

            # Repartition device
            if ! partition_nvme_device "${device}"; then
                error "Failed to repartition device"
                clear_error_context
                return 1
            fi

            # Format new partitions
            if ! format_partitions "${device}"; then
                error "Failed to format new partitions"
                clear_error_context
                return 1
            fi
        fi
    else
        # Clean device - create new partitions
        log "Clean device detected - creating new partition layout"

        if ! partition_nvme_device "${device}"; then
            error "Failed to create partitions"
            clear_error_context
            return 1
        fi

        if ! format_partitions "${device}"; then
            error "Failed to format partitions"
            clear_error_context
            return 1
        fi
    fi

    # Mount partitions
    if ! mount_partitions "${device}"; then
        error "Failed to mount partitions"
        clear_error_context
        return 1
    fi

    # Setup persistent mounts
    if ! setup_persistent_mounts "${device}"; then
        error "Failed to setup persistent mounts"
        # Try to unmount on failure
        umount "${OLARES_MOUNT_POINT}" 2>/dev/null || true
        umount "${CONTENT_MOUNT_POINT}" 2>/dev/null || true
        clear_error_context
        return 1
    fi

    success "NVMe storage setup completed successfully"
    log "  Olares partition: ${olares_partition} -> ${OLARES_MOUNT_POINT}"
    log "  Content partition: ${content_partition} -> ${CONTENT_MOUNT_POINT}"
    log "  Persistent mounts configured in /etc/fstab"

    clear_error_context
    return 0
}

# Cleanup storage mounts (for cleanup script)
# Usage: cleanup_storage_mounts [preserve_content]
# Returns: 0 if successful
cleanup_storage_mounts() {
    local preserve_content="${1:-true}"
    set_error_context "Storage cleanup"

    log "Cleaning up storage mounts..."

    # Clear Olares directory but preserve mount
    if mountpoint -q "${OLARES_MOUNT_POINT}" 2>/dev/null; then
        log "Clearing Olares directory contents..."
        if [[ -d "${OLARES_MOUNT_POINT}" ]]; then
            find "${OLARES_MOUNT_POINT}" -mindepth 1 -delete 2>/dev/null || true
        fi
        success "Olares directory cleared"
    fi

    # Handle content directory
    if mountpoint -q "${CONTENT_MOUNT_POINT}" 2>/dev/null; then
        if [[ "${preserve_content}" == "true" ]]; then
            log "Preserving content directory as requested"
        else
            warning "This will delete all content in ${CONTENT_MOUNT_POINT}"
            read -p "Delete all content? (yes/no): " -r
            if [[ ${REPLY} =~ ^[Yy][Ee][Ss]$ ]]; then
                log "Clearing content directory..."
                if [[ -d "${CONTENT_MOUNT_POINT}" ]]; then
                    find "${CONTENT_MOUNT_POINT}" -mindepth 1 -delete 2>/dev/null || true
                fi
                success "Content directory cleared"
            else
                log "Content directory preserved"
            fi
        fi
    fi

    clear_error_context
    return 0
}

# Export functions for use in other scripts
export -f detect_nvme_devices check_existing_partitions check_partition_data check_content_data
export -f partition_nvme_device format_partitions mount_partitions
export -f setup_persistent_mounts setup_nvme_storage cleanup_storage_mounts
