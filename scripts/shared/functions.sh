#!/bin/bash
# DangerPrep Common Functions
# Shared functions for all DangerPrep scripts

# Prevent multiple sourcing
if [[ "${FUNCTIONS_SHARED_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly FUNCTIONS_SHARED_LOADED="true"

# Get the directory where this script is located

# Source all shared utilities
# shellcheck source=./logging.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/logging.sh"
# shellcheck source=./errors.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/errors.sh"
# shellcheck source=./validation.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/validation.sh"
# shellcheck source=./banner.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/banner.sh"

# Configuration loading function
load_config() {
    # Set default configuration values
    export DANGERPREP_ROOT="${DANGERPREP_ROOT:-/opt/dangerprep}"
    export DANGERPREP_CONFIG_DIR="${DANGERPREP_CONFIG_DIR:-${DANGERPREP_ROOT}/config}"
    export DANGERPREP_DATA_DIR="${DANGERPREP_DATA_DIR:-${DANGERPREP_ROOT}/data}"
    export DANGERPREP_CONTENT_DIR="${DANGERPREP_CONTENT_DIR:-${DANGERPREP_ROOT}/content}"
    export DANGERPREP_NFS_DIR="${DANGERPREP_NFS_DIR:-${DANGERPREP_ROOT}/nfs}"
    
    # Load configuration file if it exists
    local config_file="${DANGERPREP_CONFIG_DIR}/dangerprep.conf"
    if [[ -f "$config_file" ]]; then
        # shellcheck source=/dev/null
        source "$config_file"
        log "Loaded configuration from $config_file"
    else
        log "Using default configuration (no config file found at $config_file)"
    fi
    
    # Ensure required directories exist
    mkdir -p "${DANGERPREP_CONFIG_DIR}" "${DANGERPREP_DATA_DIR}" "${DANGERPREP_CONTENT_DIR}" "${DANGERPREP_NFS_DIR}"
}

# Service management functions
is_service_running() {
    local service="$1"
    systemctl is-active --quiet "$service" 2>/dev/null
}

is_service_enabled() {
    local service="$1"
    systemctl is-enabled --quiet "$service" 2>/dev/null
}

start_service() {
    local service="$1"
    if ! is_service_running "$service"; then
        log "Starting $service..."
        if systemctl start "$service"; then
            success "$service started successfully"
        else
            error "Failed to start $service"
            return 1
        fi
    else
        log "$service is already running"
    fi
}

stop_service() {
    local service="$1"
    if is_service_running "$service"; then
        log "Stopping $service..."
        if systemctl stop "$service"; then
            success "$service stopped successfully"
        else
            error "Failed to stop $service"
            return 1
        fi
    else
        log "$service is not running"
    fi
}

restart_service() {
    local service="$1"
    log "Restarting $service..."
    if systemctl restart "$service"; then
        success "$service restarted successfully"
    else
        error "Failed to restart $service"
        return 1
    fi
}

# Package management functions
is_package_manager_available() {
    command -v apt >/dev/null 2>&1 || command -v yum >/dev/null 2>&1 || command -v pacman >/dev/null 2>&1
}

is_k3s_running() {
    kubectl get nodes >/dev/null 2>&1
}

# Network utility functions
get_default_interface() {
    ip route | grep default | head -1 | awk '{print $5}'
}

get_interface_ip() {
    local interface="$1"
    ip addr show "$interface" | grep 'inet ' | head -1 | awk '{print $2}' | cut -d'/' -f1
}

# File utility functions
backup_file() {
    local file="$1"
    local backup_dir="${2:-/var/backups/dangerprep}"
    
    if [[ -f "$file" ]]; then
        mkdir -p "$backup_dir"
        local backup_name
        backup_name="$(basename "$file").backup.$(date +%Y%m%d-%H%M%S)"
        cp "$file" "${backup_dir}/${backup_name}"
        log "Backed up $file to ${backup_dir}/${backup_name}"
    fi
}

# System information functions
get_system_info() {
    echo "System Information:"
    echo "  OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo 'Unknown')"
    echo "  Kernel: $(uname -r)"
    echo "  Architecture: $(uname -m)"
    echo "  Memory: $(free -h | grep Mem | awk '{print $2}')"
    echo "  Disk: $(df -h / | tail -1 | awk '{print $2}')"
    echo "  Uptime: $(uptime -p 2>/dev/null || uptime)"
}

# Hardware detection functions
detect_hardware() {
    # Detect if running on FriendlyElec hardware
    if [[ -f /proc/device-tree/model ]]; then
        local model
        model=$(cat /proc/device-tree/model | tr -d '\0')
        if [[ "$model" =~ (NanoPi|NanoPC|CM3588) ]]; then
            export IS_FRIENDLYELEC=true
            export FRIENDLYELEC_MODEL="$model"
            log "Detected FriendlyElec hardware: $model"
        fi
    fi
    
    # Detect architecture
    case "$(uname -m)" in
        aarch64|arm64)
            export IS_ARM64=true
            ;;
        x86_64|amd64)
            export IS_X86_64=true
            ;;
    esac
}

# Initialize common environment
init_environment() {
    # Detect hardware
    detect_hardware
    
    # Load configuration
    load_config
    
    # Set up logging
    setup_logging
}

# Generate or retrieve WiFi password securely
generate_wifi_password() {
    local password_file="/etc/dangerprep/wifi-password"
    local password_dir
    password_dir="$(dirname "$password_file")"

    # Validate we can create the directory
    if [[ ! -d "$password_dir" ]]; then
        if ! mkdir -p "$password_dir"; then
            error "Cannot create password directory: $password_dir"
            return 1
        fi
    fi

    # Generate password if it doesn't exist
    if [[ ! -f "$password_file" ]]; then
        log "Generating new WiFi password"
        if ! openssl rand -base64 12 > "$password_file"; then
            error "Failed to generate WiFi password"
            return 1
        fi

        # Set secure permissions
        chmod 600 "$password_file"
        chown root:root "$password_file" 2>/dev/null || true

        success "WiFi password generated and stored securely"
    fi

    # Return the password
    cat "$password_file"
}

# Safely clean up files matching a pattern
safe_wildcard_cleanup() {
    local pattern="$1"
    local base_dir="$2"
    local description="${3:-files}"
    local max_depth="${4:-1}"

    # Validate inputs
    validate_not_empty "$pattern" "cleanup pattern"
    validate_directory_exists "$base_dir" "base directory"

    local file_count=0
    local removed_count=0

    # Use find with null delimiter for safety
    while IFS= read -r -d '' file; do
        ((file_count++))

        # Additional safety checks
        if [[ -e "$file" ]]; then
            # Validate file is within expected directory
            local real_file
            real_file="$(realpath "$file" 2>/dev/null)" || continue
            local real_base
            real_base="$(realpath "$base_dir" 2>/dev/null)" || continue

            if [[ "$real_file" == "$real_base"/* ]]; then
                log "Removing $description: $file"
                if safe_execute 1 0 rm -rf "$file"; then
                    ((removed_count++))
                else
                    warning "Failed to remove: $file"
                fi
            else
                warning "Skipping file outside base directory: $file"
            fi
        fi
    done < <(find "$base_dir" -maxdepth "$max_depth" -name "$pattern" -print0 2>/dev/null)

    if [[ $file_count -gt 0 ]]; then
        success "Cleaned up $removed_count of $file_count $description"
    else
        debug "No $description found matching pattern: $pattern"
    fi
}

# State management functions for setup progress tracking
STATE_FILE="/etc/dangerprep/setup-state"

# Initialize state tracking
init_state_tracking() {
    local state_dir
    state_dir="$(dirname "$STATE_FILE")"

    if [[ ! -d "$state_dir" ]]; then
        mkdir -p "$state_dir" || {
            error "Cannot create state directory: $state_dir"
            return 1
        }
    fi

    # Create state file if it doesn't exist
    if [[ ! -f "$STATE_FILE" ]]; then
        cat > "$STATE_FILE" << 'EOF'
# DangerPrep Setup State Tracking
# Format: STEP_NAME=STATUS (NOT_STARTED|IN_PROGRESS|COMPLETED|FAILED)
SYSTEM_UPDATE=NOT_STARTED
PACKAGE_INSTALL=NOT_STARTED
SECURITY_HARDENING=NOT_STARTED
NETWORK_CONFIG=NOT_STARTED
PACKAGE_SETUP=NOT_STARTED
SERVICES_CONFIG=NOT_STARTED
FINAL_SETUP=NOT_STARTED
EOF
        chmod 600 "$STATE_FILE"
        chown root:root "$STATE_FILE" 2>/dev/null || true
        log "State tracking initialized"
    fi
}

# Set step state
set_step_state() {
    local step="$1"
    local state="$2"

    validate_not_empty "$step" "step name"
    validate_not_empty "$state" "state value"

    if [[ ! -f "$STATE_FILE" ]]; then
        init_state_tracking || return 1
    fi

    # Update or add the step state
    if grep -q "^${step}=" "$STATE_FILE"; then
        sed -i "s/^${step}=.*/${step}=${state}/" "$STATE_FILE"
    else
        echo "${step}=${state}" >> "$STATE_FILE"
    fi

    log "Step state updated: $step = $state"
}

# Get step state
get_step_state() {
    local step="$1"

    validate_not_empty "$step" "step name"

    if [[ ! -f "$STATE_FILE" ]]; then
        echo "NOT_STARTED"
        return 0
    fi

    local state
    state=$(grep "^${step}=" "$STATE_FILE" 2>/dev/null | cut -d'=' -f2)
    echo "${state:-NOT_STARTED}"
}

# Check if step is completed
is_step_completed() {
    local step="$1"
    local state
    state=$(get_step_state "$step")
    [[ "$state" == "COMPLETED" ]]
}

# Get last completed step for recovery
get_last_completed_step() {
    if [[ ! -f "$STATE_FILE" ]]; then
        echo ""
        return 0
    fi

    local steps=(
        "SYSTEM_UPDATE"
        "PACKAGE_INSTALL"
        "SECURITY_HARDENING"
        "NETWORK_CONFIG"
        "PACKAGE_SETUP"
        "SERVICES_CONFIG"
        "FINAL_SETUP"
    )

    local last_completed=""
    for step in "${steps[@]}"; do
        if is_step_completed "$step"; then
            last_completed="$step"
        else
            break
        fi
    done

    echo "$last_completed"
}

# Show setup progress
show_setup_progress() {
    if [[ ! -f "$STATE_FILE" ]]; then
        info "No setup progress found"
        return 0
    fi

    log_section "Setup Progress"

    local steps=(
        "SYSTEM_UPDATE:System Update"
        "PACKAGE_INSTALL:Package Installation"
        "SECURITY_HARDENING:Security Hardening"
        "NETWORK_CONFIG:Network Configuration"
        "PACKAGE_SETUP:Package Setup"
        "SERVICES_CONFIG:Services Configuration"
        "FINAL_SETUP:Final Setup"
    )

    for step_info in "${steps[@]}"; do
        local step_name="${step_info%%:*}"
        local step_desc="${step_info##*:}"
        local state
        state=$(get_step_state "$step_name")

        case "$state" in
            "COMPLETED")
                success "✓ $step_desc"
                ;;
            "IN_PROGRESS")
                info "⚠ $step_desc (in progress)"
                ;;
            "FAILED")
                error "✗ $step_desc (failed)"
                ;;
            *)
                debug "○ $step_desc (not started)"
                ;;
        esac
    done
}

# Enhanced dry-run capabilities
DRY_RUN=${DRY_RUN:-false}
DRY_RUN_CHANGES=()

# Enable dry-run mode
enable_dry_run() {
    DRY_RUN=true
    info "Dry-run mode enabled - no changes will be made"
}

# Check if in dry-run mode
is_dry_run() {
    [[ "$DRY_RUN" == "true" ]]
}

# Log a planned change for dry-run mode
log_planned_change() {
    local change_type="$1"
    local description="$2"
    local details="${3:-}"

    if is_dry_run; then
        local change_entry="[$change_type] $description"
        if [[ -n "$details" ]]; then
            change_entry="$change_entry - $details"
        fi
        DRY_RUN_CHANGES+=("$change_entry")
        info "WOULD: $change_entry"
    fi
}

# Execute command with dry-run support
dry_run_execute() {
    local description="$1"
    shift
    local cmd=("$@")

    if is_dry_run; then
        log_planned_change "COMMAND" "$description" "${cmd[*]}"
        return 0
    else
        log "Executing: $description"
        "${cmd[@]}"
    fi
}

# File operation with dry-run support
dry_run_file_op() {
    local operation="$1"
    local file="$2"
    local description="${3:-$operation $file}"

    if is_dry_run; then
        case "$operation" in
            "create"|"write")
                log_planned_change "FILE_CREATE" "$description" "$file"
                ;;
            "modify"|"edit")
                log_planned_change "FILE_MODIFY" "$description" "$file"
                ;;
            "delete"|"remove")
                log_planned_change "FILE_DELETE" "$description" "$file"
                ;;
            "copy")
                local dest="$3"
                log_planned_change "FILE_COPY" "$description" "$file -> $dest"
                ;;
            "move")
                local dest="$3"
                log_planned_change "FILE_MOVE" "$description" "$file -> $dest"
                ;;
            *)
                log_planned_change "FILE_OP" "$description" "$file"
                ;;
        esac
        return 0
    fi

    # In non-dry-run mode, this function just logs the operation
    # The actual file operation should be performed by the caller
    debug "File operation: $operation on $file"
}

# Service operation with dry-run support
dry_run_service_op() {
    local operation="$1"
    local service="$2"
    local description="${3:-$operation service $service}"

    if is_dry_run; then
        case "$operation" in
            "start")
                log_planned_change "SERVICE_START" "$description" "$service"
                ;;
            "stop")
                log_planned_change "SERVICE_STOP" "$description" "$service"
                ;;
            "restart")
                log_planned_change "SERVICE_RESTART" "$description" "$service"
                ;;
            "enable")
                log_planned_change "SERVICE_ENABLE" "$description" "$service"
                ;;
            "disable")
                log_planned_change "SERVICE_DISABLE" "$description" "$service"
                ;;
            *)
                log_planned_change "SERVICE_OP" "$description" "$service"
                ;;
        esac
        return 0
    fi

    # In non-dry-run mode, perform the actual operation
    case "$operation" in
        "start")
            systemctl start "$service"
            ;;
        "stop")
            systemctl stop "$service"
            ;;
        "restart")
            systemctl restart "$service"
            ;;
        "enable")
            systemctl enable "$service"
            ;;
        "disable")
            systemctl disable "$service"
            ;;
        *)
            error "Unknown service operation: $operation"
            return 1
            ;;
    esac
}

# Package operation with dry-run support
dry_run_package_op() {
    local operation="$1"
    shift
    local packages=("$@")

    if is_dry_run; then
        case "$operation" in
            "install")
                log_planned_change "PACKAGE_INSTALL" "Install packages" "${packages[*]}"
                ;;
            "remove"|"uninstall")
                log_planned_change "PACKAGE_REMOVE" "Remove packages" "${packages[*]}"
                ;;
            "update")
                log_planned_change "PACKAGE_UPDATE" "Update package lists" ""
                ;;
            "upgrade")
                log_planned_change "PACKAGE_UPGRADE" "Upgrade packages" "${packages[*]:-all}"
                ;;
            *)
                log_planned_change "PACKAGE_OP" "$operation packages" "${packages[*]}"
                ;;
        esac
        return 0
    fi

    # In non-dry-run mode, perform the actual operation
    case "$operation" in
        "install")
            DEBIAN_FRONTEND=noninteractive apt install -y "${packages[@]}"
            ;;
        "remove")
            DEBIAN_FRONTEND=noninteractive apt remove -y "${packages[@]}"
            ;;
        "update")
            apt update
            ;;
        "upgrade")
            if [[ ${#packages[@]} -eq 0 ]]; then
                DEBIAN_FRONTEND=noninteractive apt upgrade -y
            else
                DEBIAN_FRONTEND=noninteractive apt upgrade -y "${packages[@]}"
            fi
            ;;
        *)
            error "Unknown package operation: $operation"
            return 1
            ;;
    esac
}

# Show dry-run summary
show_dry_run_summary() {
    if ! is_dry_run; then
        return 0
    fi

    log_section "Dry-run Summary"

    if [[ ${#DRY_RUN_CHANGES[@]} -eq 0 ]]; then
        info "No changes would be made"
        return 0
    fi

    info "The following ${#DRY_RUN_CHANGES[@]} changes would be made:"
    echo

    local file_ops=0
    local service_ops=0
    local package_ops=0
    local command_ops=0

    for change in "${DRY_RUN_CHANGES[@]}"; do
        echo "  $change"

        # Count change types for summary
        if [[ "$change" =~ ^\[FILE_ ]]; then
            ((file_ops++))
        elif [[ "$change" =~ ^\[SERVICE_ ]]; then
            ((service_ops++))
        elif [[ "$change" =~ ^\[PACKAGE_ ]]; then
            ((package_ops++))
        elif [[ "$change" =~ ^\[COMMAND\] ]]; then
            ((command_ops++))
        fi
    done

    echo
    info "Summary by operation type:"
    [[ $file_ops -gt 0 ]] && info "  • File operations: $file_ops"
    [[ $service_ops -gt 0 ]] && info "  • Service operations: $service_ops"
    [[ $package_ops -gt 0 ]] && info "  • Package operations: $package_ops"
    [[ $command_ops -gt 0 ]] && info "  • Command executions: $command_ops"

    echo
    warning "This was a dry-run. No actual changes were made to the system."
    info "To perform the actual setup, run the script without --dry-run"
}

# Parse storage size string and convert to GB
# Usage: parse_storage_size "1.8T" or parse_storage_size "500G"
# Returns: size in GB as integer
parse_storage_size() {
    local size_str="$1"
    local size_num
    local size_unit

    # Debug logging if DEBUG is enabled
    if [[ "${DEBUG:-false}" == "true" ]]; then
        debug "parse_storage_size: input='${size_str}'"
    fi

    # Handle empty or invalid input
    if [[ -z "${size_str}" ]]; then
        debug "parse_storage_size: empty input, returning 0"
        echo "0"
        return
    fi

    # Clean the input string - remove whitespace and handle locale issues
    size_str=$(echo "${size_str}" | tr -d '[:space:]' | tr ',' '.')

    # Extract numeric part and unit using more robust regex
    size_num=$(echo "${size_str}" | sed -E 's/^([0-9]+\.?[0-9]*).*$/\1/')
    size_unit=$(echo "${size_str}" | sed -E 's/^[0-9]+\.?[0-9]*(.*)$/\1/' | tr '[:lower:]' '[:upper:]')

    # Debug logging
    if [[ "${DEBUG:-false}" == "true" ]]; then
        debug "parse_storage_size: cleaned='${size_str}', num='${size_num}', unit='${size_unit}'"
    fi

    # Validate numeric part
    if [[ -z "${size_num}" ]] || ! [[ "${size_num}" =~ ^[0-9]+\.?[0-9]*$ ]]; then
        warning "parse_storage_size: invalid numeric part '${size_num}' from '${size_str}'"
        echo "0"
        return
    fi

    # Convert to GB based on unit
    local result
    case "${size_unit}" in
        "T"|"TB")
            # Terabytes to GB (multiply by 1024)
            result=$(echo "${size_num}" | awk '{printf "%.0f", $1 * 1024}')
            ;;
        "G"|"GB"|"")
            # Already in GB or no unit (assume GB)
            result=$(echo "${size_num}" | awk '{printf "%.0f", $1}')
            ;;
        "M"|"MB")
            # Megabytes to GB (divide by 1024)
            result=$(echo "${size_num}" | awk '{printf "%.0f", $1 / 1024}')
            ;;
        "K"|"KB")
            # Kilobytes to GB (divide by 1024^2)
            result=$(echo "${size_num}" | awk '{printf "%.0f", $1 / 1048576}')
            ;;
        "B"|"BYTES")
            # Bytes to GB (divide by 1024^3)
            result=$(echo "${size_num}" | awk '{printf "%.0f", $1 / 1073741824}')
            ;;
        *)
            # Unknown unit, log warning and assume GB
            warning "parse_storage_size: unknown unit '${size_unit}' from '${size_str}', assuming GB"
            result=$(echo "${size_num}" | awk '{printf "%.0f", $1}')
            ;;
    esac

    # Debug logging
    if [[ "${DEBUG:-false}" == "true" ]]; then
        debug "parse_storage_size: result='${result}' GB"
    fi

    echo "${result}"
}

# Export functions for use in other scripts
export -f load_config
export -f is_service_running
export -f is_service_enabled
export -f start_service
export -f stop_service
export -f restart_service
export -f is_package_manager_available
export -f is_k3s_running
export -f get_default_interface
export -f get_interface_ip
export -f backup_file
export -f get_system_info
export -f detect_hardware
export -f init_environment
export -f generate_wifi_password
export -f safe_wildcard_cleanup
export -f init_state_tracking
export -f set_step_state
export -f get_step_state
export -f is_step_completed
export -f get_last_completed_step
export -f show_setup_progress
export -f enable_dry_run
export -f is_dry_run
export -f log_planned_change
export -f dry_run_execute
export -f dry_run_file_op
export -f dry_run_service_op
export -f dry_run_package_op
export -f show_dry_run_summary
export -f parse_storage_size
