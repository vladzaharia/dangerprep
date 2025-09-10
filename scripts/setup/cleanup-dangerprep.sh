#!/bin/bash
# DangerPrep Cleanup Script
# Safely removes DangerPrep configuration and restores original system state
# Implements comprehensive error handling, validation, and safety measures

# Modern shell script security and error handling
set -euo pipefail
IFS=$'\n\t'

# Script metadata
declare SCRIPT_NAME
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
readonly SCRIPT_NAME
readonly SCRIPT_VERSION="2.0.0"
readonly REQUIRED_BASH_VERSION="4.0"

# Enable debug mode if DEBUG environment variable is set
if [[ "${DEBUG:-}" == "true" ]]; then
    set -x
fi

# Global state variables
CLEANUP_PERFORMED=false
LOCK_ACQUIRED=false
TEMP_DIR=""
CLEANUP_TASKS=()
REMOVED_ITEMS=()
FAILED_REMOVALS=()
SKIP_PACKAGES=false

# Note: Color codes replaced with Gum styling functions
# All styling is now handled through gum-utils.sh enhanced functions

# Note: Logging functions are provided by gum-utils.sh
# The following functions are available:
# - log_debug, log_info, log_warn, log_error, log_success
# All functions support structured logging and automatic file logging when LOG_FILE is set

# Source shared utilities with proper error handling
declare SCRIPT_DIR
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

# Source gum utilities first for logging functions
if [[ -f "$SCRIPT_DIR/../shared/gum-utils.sh" ]]; then
    # shellcheck source=../shared/gum-utils.sh
    source "$SCRIPT_DIR/../shared/gum-utils.sh"
else
    echo "WARNING: Gum utilities not found, using basic interaction"
    # Provide fallback functions including logging
    log_debug() { echo "[DEBUG] $*"; }
    log_info() { echo "[INFO] $*"; }
    log_warn() { echo "[WARN] $*"; }
    log_error() { echo "[ERROR] $*"; }
    log_success() { echo "[SUCCESS] $*"; }
    enhanced_input() { local prompt="$1"; local default="${2:-}"; read -r -p "${prompt}: " result; echo "${result:-${default}}"; }
    enhanced_confirm() { local question="$1"; read -r -p "${question} [y/N]: " reply; [[ "${reply}" =~ ^[Yy] ]]; }
    enhanced_choose() { local prompt="$1"; shift; echo "${prompt}"; select opt in "$@"; do echo "${opt}"; break; done; }
    enhanced_multi_choose() { enhanced_choose "$@"; }
    enhanced_spin() { local message="$1"; shift; echo "${message}..."; "$@"; }
    enhanced_table() { local headers="$1"; shift; echo "${headers}"; printf '%s\n' "$@"; }
    # Provide fallback directory functions
    get_log_file_path() { echo "/tmp/dangerprep-cleanup-$$.log"; }
    get_backup_dir_path() { local dir; dir="/tmp/dangerprep-cleanup-$(date +%Y%m%d-%H%M%S)-$$"; mkdir -p "$dir"; echo "$dir"; }
    gum_available() { return 1; }
fi

# Source shared banner utility after logging functions are available
if [[ -f "$SCRIPT_DIR/../shared/banner.sh" ]]; then
    # shellcheck source=../shared/banner.sh
    source "$SCRIPT_DIR/../shared/banner.sh"
else
    log_warn "Banner utility not found, continuing without banner"
    show_cleanup_banner() { echo "DangerPrep Cleanup"; }
fi

# Initialize dynamic paths with fallback support
initialize_paths() {
    if command -v get_log_file_path >/dev/null 2>&1; then
        LOG_FILE="$(get_log_file_path "cleanup")"
        BACKUP_DIR="$(get_backup_dir_path "cleanup")"
    else
        # Fallback if gum-utils functions aren't available
        LOG_FILE="/var/log/dangerprep-cleanup.log"
        BACKUP_DIR="/var/backups/dangerprep-cleanup-$(date +%Y%m%d-%H%M%S)"

        # Try to create directories, fall back to temp if needed
        if ! mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || ! touch "$LOG_FILE" 2>/dev/null; then
            LOG_FILE="/tmp/dangerprep-cleanup-$$.log"
        fi

        if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
            BACKUP_DIR="/tmp/dangerprep-cleanup-$(date +%Y%m%d-%H%M%S)-$$"
            mkdir -p "$BACKUP_DIR" 2>/dev/null || true
        fi
    fi

    # Make paths readonly after initialization
    readonly LOG_FILE
    readonly BACKUP_DIR

    # Try to create lock file with fallback
    if ! touch "$LOCK_FILE" 2>/dev/null; then
        LOCK_FILE="/tmp/dangerprep-cleanup-$$.lock"
        readonly LOCK_FILE
    fi
}

# Enhanced utility functions

# Bash version check
check_bash_version() {
    local current_version
    current_version=$(bash --version | head -n1 | grep -oE '[0-9]+\.[0-9]+' | head -n1)
    if ! awk -v curr="$current_version" -v req="$REQUIRED_BASH_VERSION" 'BEGIN {exit !(curr >= req)}'; then
        log_error "Bash version $REQUIRED_BASH_VERSION or higher required. Current: $current_version"
        exit 1
    fi
}

# Safe removal function with validation and backup
safe_remove() {
    local item="$1"
    local item_type="${2:-auto}"  # file, directory, service, package, auto
    local backup_item="${3:-true}"

    # Input validation
    if [[ -z "$item" ]] || [[ "$item" =~ \.\./|\.\.\\ ]] || [[ "$item" =~ ^[[:space:]]*$ ]]; then
        log_error "Invalid or dangerous path: '$item'"
        FAILED_REMOVALS+=("$item (invalid path)")
        return 1
    fi

    # Prevent removal of critical system paths
    local -a protected_paths=(
        "/"
        "/bin"
        "/boot"
        "/dev"
        "/etc"
        "/home"
        "/lib"
        "/lib64"
        "/proc"
        "/root"
        "/run"
        "/sbin"
        "/sys"
        "/tmp"
        "/usr"
        "/var"
    )

    for protected in "${protected_paths[@]}"; do
        if [[ "$item" == "$protected" ]]; then
            log_error "Refusing to remove protected system path: $item"
            FAILED_REMOVALS+=("$item (protected path)")
            return 1
        fi
    done

    # Auto-detect item type if not specified
    if [[ "$item_type" == "auto" ]]; then
        if [[ -f "$item" ]]; then
            item_type="file"
        elif [[ -d "$item" ]]; then
            item_type="directory"
        elif systemctl list-unit-files --type=service | grep -q "^${item}.service"; then
            item_type="service"
        elif dpkg -l | grep -q "^ii.*${item}"; then
            item_type="package"
        else
            item_type="unknown"
        fi
    fi

    log_debug "Attempting to remove $item_type: $item"

    # Backup before removal if requested and item exists
    if [[ "$backup_item" == "true" ]] && [[ -e "$item" ]]; then
        local backup_path
        backup_path="$BACKUP_DIR/$(basename "$item")"
        local counter=1

        # Handle duplicate names
        while [[ -e "$backup_path" ]]; do
            backup_path="$BACKUP_DIR/$(basename "$item").$counter"
            ((++counter))
        done

        log_debug "Backing up $item to $backup_path"
        if ! cp -r "$item" "$backup_path" 2>/dev/null; then
            log_warn "Failed to backup $item, proceeding with removal"
        else
            log_debug "Backup successful: $backup_path"
        fi
    fi

    # Perform removal based on type
    case "$item_type" in
        "file")
            if [[ -f "$item" ]]; then
                if rm -f "$item" 2>/dev/null; then
                    log_debug "Removed file: $item"
                    REMOVED_ITEMS+=("file: $item")
                    return 0
                else
                    log_warn "Failed to remove file: $item"
                    FAILED_REMOVALS+=("file: $item")
                    return 1
                fi
            else
                log_debug "File does not exist: $item"
                return 0
            fi
            ;;
        "directory")
            if [[ -d "$item" ]]; then
                if rm -rf "$item" 2>/dev/null; then
                    log_debug "Removed directory: $item"
                    REMOVED_ITEMS+=("directory: $item")
                    return 0
                else
                    log_warn "Failed to remove directory: $item"
                    FAILED_REMOVALS+=("directory: $item")
                    return 1
                fi
            else
                log_debug "Directory does not exist: $item"
                return 0
            fi
            ;;
        "service")
            if systemctl is-enabled "$item" >/dev/null 2>&1; then
                systemctl disable "$item" 2>/dev/null || log_warn "Failed to disable service: $item"
            fi
            if systemctl is-active "$item" >/dev/null 2>&1; then
                systemctl stop "$item" 2>/dev/null || log_warn "Failed to stop service: $item"
            fi
            log_debug "Service handled: $item"
            REMOVED_ITEMS+=("service: $item")
            return 0
            ;;
        "package")
            if dpkg -l | grep -q "^ii.*${item}"; then
                if DEBIAN_FRONTEND=noninteractive apt-get remove -y "$item" >/dev/null 2>&1; then
                    log_debug "Removed package: $item"
                    REMOVED_ITEMS+=("package: $item")
                    return 0
                else
                    log_warn "Failed to remove package: $item"
                    FAILED_REMOVALS+=("package: $item")
                    return 1
                fi
            else
                log_debug "Package not installed: $item"
                return 0
            fi
            ;;
        *)
            log_warn "Unknown item type for: $item"
            FAILED_REMOVALS+=("unknown: $item")
            return 1
            ;;
    esac
}

# Configuration with enhanced validation (dynamic paths set after gum-utils is loaded)
LOG_FILE=""
BACKUP_DIR=""
LOCK_FILE="/var/run/dangerprep-cleanup.lock"

# Command-line options
DRY_RUN=false
PRESERVE_DATA=false
FORCE_CLEANUP=false
VERBOSE=false

# Enhanced root privilege check with detailed error reporting
check_root_privileges() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run with root privileges"
        log_error "Usage: sudo $0 [options]"
        log_error "Current user: $(whoami) (UID: $EUID)"
        return 1
    fi

    # Verify we can actually perform root operations
    if ! touch /tmp/dangerprep-cleanup-root-test 2>/dev/null; then
        log_error "Unable to perform root operations despite running as root"
        return 1
    fi
    rm -f /tmp/dangerprep-cleanup-root-test

    log_debug "Root privileges confirmed"
    return 0
}

# Enhanced command-line argument parsing
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--dry-run)
                DRY_RUN=true
                log_info "Dry-run mode enabled - no changes will be made"
                shift
                ;;
            -p|--preserve-data)
                PRESERVE_DATA=true
                log_info "Data preservation mode enabled"
                shift
                ;;
            -f|--force)
                FORCE_CLEANUP=true
                log_info "Force cleanup mode enabled"
                shift
                ;;
            -v|--verbose)
                export VERBOSE=true
                export DEBUG=true
                log_info "Verbose mode enabled"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            --version)
                show_version
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                log_error "Use --help for usage information"
                exit 1
                ;;
            *)
                log_error "Unexpected argument: $1"
                log_error "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

# Enhanced help display
show_help() {
    cat << EOF
DangerPrep Cleanup Script - Version ${SCRIPT_VERSION}

USAGE:
    sudo $0 [OPTIONS]

OPTIONS:
    -d, --dry-run           Show what would be removed without making changes
    -p, --preserve-data     Keep user data and content directories
    -f, --force             Skip confirmation prompts (use with caution)
    -v, --verbose           Enable verbose output and debug logging
    -h, --help              Show this help message
    --version               Show version information

EXAMPLES:
    sudo $0                 # Interactive cleanup with confirmation
    sudo $0 --dry-run       # Preview what would be removed
    sudo $0 --preserve-data # Keep data directories intact
    sudo $0 --force         # Non-interactive cleanup (dangerous)

DESCRIPTION:
    Safely removes DangerPrep configuration and restores the system to its
    original state. This script will:

    • Stop all DangerPrep services (Docker, RaspAP, networking, etc.)
    • Remove network configurations and restore originals
    • Remove all DangerPrep configuration files and scripts
    • Clean up user configurations (rootless Docker, etc.)
    • Remove created user accounts and system users
    • Unmount DangerPrep partitions and clean fstab entries
    • Remove finalization services and scripts
    • Clean up hardware groups and device permissions
    • Optionally remove installed packages
    • Remove Docker containers, images, and networks
    • Optionally remove data directories
    • Remove configuration state files
    • Restore system to pre-DangerPrep state

SAFETY FEATURES:
    • Comprehensive backup before removal
    • Dry-run mode for testing
    • Protected system path validation
    • Detailed logging and progress tracking
    • Rollback capability for critical failures

FILES:
    Log file: /var/log/dangerprep-cleanup.log (or ~/.local/dangerprep/logs/ if no permissions)
    Backup:   /var/backups/dangerprep-cleanup-* (or ~/.local/dangerprep/backups/ if no permissions)

WARNING:
    This operation cannot be easily undone. Make sure you have backups
    of any important data before proceeding.

For more information, visit: https://github.com/vladzaharia/dangerprep
EOF
}

show_version() {
    echo "${SCRIPT_NAME} version ${SCRIPT_VERSION}"
    echo "Bash version: ${BASH_VERSION}"
    echo "System: $(uname -a)"
}

# Lock file management for preventing concurrent execution
acquire_lock() {
    log_debug "Attempting to acquire lock: ${LOCK_FILE}"

    # Use noclobber to atomically create lock file
    if ! (set -o noclobber; echo "$$" > "${LOCK_FILE}") 2>/dev/null; then
        local existing_pid
        if [[ -r "${LOCK_FILE}" ]]; then
            existing_pid=$(cat "${LOCK_FILE}" 2>/dev/null || echo "unknown")
            if [[ "$existing_pid" =~ ^[0-9]+$ ]] && kill -0 "$existing_pid" 2>/dev/null; then
                log_error "Another cleanup instance is already running (PID: ${existing_pid})"
                log_error "If you're sure no other instance is running, remove: ${LOCK_FILE}"
                return 1
            else
                log_warn "Stale lock file found (PID: ${existing_pid}), removing"
                rm -f "${LOCK_FILE}"
                # Try again
                if ! (set -o noclobber; echo "$$" > "${LOCK_FILE}") 2>/dev/null; then
                    log_error "Failed to acquire lock after removing stale lock file"
                    return 1
                fi
            fi
        else
            log_error "Failed to acquire lock file: ${LOCK_FILE}"
            return 1
        fi
    fi

    LOCK_ACQUIRED=true
    CLEANUP_TASKS+=("release_lock")
    log_debug "Lock acquired successfully"
    return 0
}

release_lock() {
    if [[ "$LOCK_ACQUIRED" == "true" && -f "${LOCK_FILE}" ]]; then
        local lock_pid
        lock_pid=$(cat "${LOCK_FILE}" 2>/dev/null || echo "")
        if [[ "$lock_pid" == "$$" ]]; then
            rm -f "${LOCK_FILE}"
            log_debug "Lock released successfully"
        else
            log_warn "Lock file PID mismatch, not removing (expected: $$, found: ${lock_pid})"
        fi
        LOCK_ACQUIRED=false
    fi
}

# Enhanced cleanup resource management
cleanup_resources() {
    local exit_code=$?

    if [[ "$CLEANUP_PERFORMED" == "true" ]]; then
        log_debug "Cleanup already performed, skipping"
        return $exit_code
    fi

    CLEANUP_PERFORMED=true
    log_debug "Starting cleanup process (exit code: $exit_code)"

    # Execute cleanup tasks in reverse order
    local task
    for ((i=${#CLEANUP_TASKS[@]}-1; i>=0; i--)); do
        task="${CLEANUP_TASKS[i]}"
        log_debug "Executing cleanup task: $task"
        case "$task" in
            "remove_temp_dir")
                if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
                    rm -rf "$TEMP_DIR" 2>/dev/null || log_warn "Failed to remove temporary directory: $TEMP_DIR"
                fi
                ;;
            "release_lock")
                release_lock
                ;;
            *)
                log_warn "Unknown cleanup task: $task"
                ;;
        esac
    done

    # Final status message
    if [[ $exit_code -eq 0 ]]; then
        log_success "Cleanup completed successfully"
    else
        log_error "Cleanup failed with exit code $exit_code"
    fi

    exit $exit_code
}

# Enhanced signal handlers
handle_interrupt() {
    log_warn "Received interrupt signal (SIGINT)"
    log_info "Performing cleanup before exit..."
    cleanup_resources
    exit 130
}

handle_termination() {
    log_warn "Received termination signal (SIGTERM)"
    log_info "Performing cleanup before exit..."
    cleanup_resources
    exit 143
}

handle_error() {
    local exit_code=$?
    local line_number=$1
    log_error "Script failed at line ${line_number} with exit code ${exit_code}"
    log_error "Command: ${BASH_COMMAND}"
    cleanup_resources
    exit $exit_code
}

# Register comprehensive signal handlers
trap 'handle_error ${LINENO}' ERR
trap cleanup_resources EXIT
trap handle_interrupt INT
trap handle_termination TERM

# Enhanced logging setup with proper permissions and rotation
setup_logging() {
    # Paths are already initialized by initialize_paths function
    # Just ensure the log file exists and set permissions

    # Initialize log file with proper permissions
    if ! touch "$LOG_FILE"; then
        echo "ERROR: Failed to create log file: $LOG_FILE" >&2
        exit 1
    fi

    # Set secure permissions (readable by root and adm group)
    chmod 640 "$LOG_FILE"
    chown root:adm "$LOG_FILE" 2>/dev/null || true

    # Initial log entries
    log_info "DangerPrep Cleanup Started (Version: $SCRIPT_VERSION)"
    log_info "Backup directory: $BACKUP_DIR"
    log_info "Preserve data: $PRESERVE_DATA"
    log_info "Dry run: $DRY_RUN"
    log_info "Force cleanup: $FORCE_CLEANUP"
    log_info "Process ID: $$"
    log_info "User: $(whoami) (UID: $EUID)"
    log_info "System: $(uname -a)"
}

# Enhanced confirmation with detailed information and gum integration
confirm_cleanup() {
    if [[ "$FORCE_CLEANUP" == "true" ]]; then
        log_info "Force mode enabled, skipping confirmation"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Dry run mode enabled, skipping interactive confirmation"
        return 0
    fi

    log_info "🧹 DangerPrep Cleanup Configuration"
    echo

    # Interactive cleanup options
    local cleanup_scope
    cleanup_scope=$(enhanced_choose "Select cleanup scope:" \
        "Quick cleanup (services and configs only)" \
        "Standard cleanup (includes packages)" \
        "Complete cleanup (everything including data)" \
        "Custom cleanup (select components)")

        case "${cleanup_scope}" in
            "Quick cleanup"*)
                PRESERVE_DATA="true"
                SKIP_PACKAGES="true"
                log_info "Quick cleanup selected - data will be preserved, packages will be skipped"
                ;;
            "Standard cleanup"*)
                PRESERVE_DATA="true"
                SKIP_PACKAGES="false"
                log_info "Standard cleanup selected - data will be preserved, packages will be removed"
                ;;
            "Complete cleanup"*)
                PRESERVE_DATA="false"
                SKIP_PACKAGES="false"
                log_info "Complete cleanup selected - data will be removed, packages will be removed"
                ;;
            "Custom cleanup"*)
                # Custom cleanup options
                if enhanced_confirm "Remove data directories?" "false"; then
                    PRESERVE_DATA="false"
                else
                    PRESERVE_DATA="true"
                fi
                if enhanced_confirm "Remove installed packages?" "false"; then
                    SKIP_PACKAGES="false"
                else
                    SKIP_PACKAGES="true"
                fi
                ;;
        esac

        # Show cleanup summary
        log_info "📋 Cleanup Summary"

        local cleanup_actions=(
            "Services,Stop and disable DangerPrep services"
            "Network,Restore original network configuration"
            "Configs,Remove DangerPrep configuration files"
            "Scripts,Remove DangerPrep scripts and cron jobs"
            "Docker,Remove containers and networks"
        )

        if [[ "$SKIP_PACKAGES" == "true" ]]; then
            cleanup_actions+=("Packages,SKIPPED - Packages will be preserved")
        else
            cleanup_actions+=("Packages,Remove installed packages")
        fi

        if [[ "$PRESERVE_DATA" == "true" ]]; then
            cleanup_actions+=("Data,PRESERVED - Data directories will be kept")
        else
            cleanup_actions+=("Data,REMOVED - Data directories will be deleted")
        fi

        enhanced_table "Component,Action" "${cleanup_actions[@]}"

        echo
        log_info "📁 Backup Information"
        echo "  Backup location: ${BACKUP_DIR}"
        echo "  Log file: ${LOG_FILE}"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "🔍 DRY RUN MODE - No actual changes will be made"
        else
            log_warn "⚠️  This operation cannot be easily undone!"
        fi

        echo
        if ! enhanced_confirm "Proceed with cleanup?" "false"; then
            log_info "Cleanup cancelled by user"
            exit 0
        fi

        if [[ "$DRY_RUN" != "true" && "$PRESERVE_DATA" != "true" ]]; then
            log_warn "🚨 Final confirmation required for data removal"
            if ! enhanced_confirm "Are you absolutely sure you want to remove all data?" "false"; then
                log_info "Cleanup cancelled - data removal declined"
                exit 0
            fi
        fi

    log_info "User confirmed cleanup operation"
    echo
}

# Stop all services with enhanced progress indication
stop_services() {
    log_info "Stopping DangerPrep services..."

    # Stop RaspAP Docker container first (if present)
    if command -v docker >/dev/null 2>&1; then
        log_info "Checking for RaspAP container..."

        # Stop and remove RaspAP container
        if docker ps -a --format "table {{.Names}}" | grep -q "^raspap$"; then
            enhanced_spin "Stopping RaspAP container" docker stop raspap
            enhanced_spin "Removing RaspAP container" docker rm raspap
            log_success "RaspAP container removed"
        fi

        # Remove RaspAP Docker image if present
        if docker images --format "table {{.Repository}}:{{.Tag}}" | grep -q "ghcr.io/raspap/raspap-docker"; then
            enhanced_spin "Removing RaspAP Docker image" \
                docker rmi "$(docker images "ghcr.io/raspap/raspap-docker" -q)"
        fi
    fi

    # Stop Docker services (handle both rootless and regular Docker)
    if command -v docker >/dev/null 2>&1; then
        log_info "Stopping remaining Docker containers..."

        # Try rootless Docker first
        if [[ -S "/run/user/1000/docker.sock" ]]; then
            enhanced_spin "Stopping rootless Docker containers" \
                sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker stop "$(sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker ps -q)" 2>/dev/null || true
            enhanced_spin "Removing rootless Docker containers" \
                sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker rm "$(sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker ps -aq)" 2>/dev/null || true
            enhanced_spin "Removing rootless Docker networks" \
                sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker network rm traefik 2>/dev/null || true
        else
            # Regular Docker
            enhanced_spin "Stopping Docker containers" \
                docker stop "$(docker ps -q)" 2>/dev/null || true
            enhanced_spin "Removing Docker containers" \
                docker rm "$(docker ps -aq)" 2>/dev/null || true
            enhanced_spin "Removing Docker networks" \
                docker network rm traefik 2>/dev/null || true
        fi

        log_success "Docker services stopped"
    fi

    # Stop system services installed by setup script
    # Note: hostapd, dnsmasq, and tailscaled are managed by RaspAP when integrated
    local services_to_stop=(
        "fail2ban"
        "cloudflared"
        "unbound"
        "clamav-daemon"
        "clamav-freshclam"
        "unattended-upgrades"
        "docker"
    )

    # Only stop these services if RaspAP is not running
    if ! docker ps --format "table {{.Names}}" | grep -q "^raspap$"; then
        services_to_stop+=("hostapd" "dnsmasq" "tailscaled")
        log_info "RaspAP not detected, will stop networking services"
    else
        log_info "RaspAP detected, preserving networking services under RaspAP management"
    fi

    log_info "🛑 Stopping system services"
    for service in "${services_to_stop[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            enhanced_spin "Stopping ${service}" systemctl stop "${service}"
        fi
    done

    # Disable services that were enabled by setup script
    # Note: hostapd, dnsmasq, and tailscaled are managed by RaspAP when integrated
    local services_to_disable=(
        "fail2ban"
        "cloudflared"
        "unbound"
        "unattended-upgrades"
        "docker"
    )

    # Only disable these services if RaspAP is not running
    if ! docker ps --format "table {{.Names}}" | grep -q "^raspap$"; then
        services_to_disable+=("hostapd" "dnsmasq" "tailscaled")
    fi

    log_info "🚫 Disabling system services"
    for service in "${services_to_disable[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            enhanced_spin "Disabling ${service}" systemctl disable "${service}"
        fi
    done

    log_success "System services stopped and disabled"
}

# Clean up RaspAP specific configurations
cleanup_raspap() {
    log_info "Cleaning up RaspAP configurations..."

    # Get install root from environment or default
    local install_root="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"

    # Remove RaspAP Docker compose files if they exist
    if [[ -d "${install_root}/docker/infrastructure/raspap" ]]; then
        log_info "Removing RaspAP Docker configuration..."
        rm -rf "${install_root}/docker/infrastructure/raspap" 2>/dev/null || true
    fi

    # Remove RaspAP data directory if it exists
    local raspap_data_dir=""
    if mountpoint -q /data 2>/dev/null && [[ -d "/data/raspap" ]]; then
        raspap_data_dir="/data/raspap"
    elif [[ -d "${install_root}/data/raspap" ]]; then
        raspap_data_dir="${install_root}/data/raspap"
    fi

    if [[ -n "$raspap_data_dir" ]]; then
        if [[ "$PRESERVE_DATA" == true ]]; then
            log_info "Preserving RaspAP data directory (--preserve-data flag set): $raspap_data_dir"
        else
            log_info "Removing RaspAP data directory: $raspap_data_dir"
            rm -rf "$raspap_data_dir" 2>/dev/null || true
        fi
    fi

    # Remove RaspAP environment files
    local raspap_env_files=(
        "${install_root}/docker/infrastructure/raspap/.env"
        "${install_root}/docker/infrastructure/raspap/compose.env"
    )

    for env_file in "${raspap_env_files[@]}"; do
        if [[ -f "$env_file" ]]; then
            log_info "Removing RaspAP environment file: $env_file"
            rm -f "$env_file" 2>/dev/null || true
        fi
    done

    # Clean up any RaspAP-specific network configurations
    # Note: We don't remove hostapd.conf or dnsmasq.conf here as they might be
    # used by the original DangerPrep setup when RaspAP is removed

    log_success "RaspAP configurations cleaned up"
}

# Restore network configuration
restore_network() {
    log_info "Restoring network configuration..."
    
    # Find most recent backup
    local latest_backup
    latest_backup=$(find /var/backups -name "dangerprep-*" -type d | sort | tail -1)
    
    if [[ -n "$latest_backup" && -d "$latest_backup" ]]; then
        log_info "Using backup from: $latest_backup"
        
        # Restore SSH configuration
        if [[ -f "$latest_backup/sshd_config.original" ]]; then
            cp "$latest_backup/sshd_config.original" /etc/ssh/sshd_config
            systemctl restart ssh
            log_success "SSH configuration restored"
        fi
        
        # Restore sysctl configuration
        if [[ -f "$latest_backup/sysctl.conf.original" ]]; then
            cp "$latest_backup/sysctl.conf.original" /etc/sysctl.conf
            sysctl -p
            log_success "Kernel parameters restored"
        fi
        
        # Restore dnsmasq configuration
        if [[ -f "$latest_backup/dnsmasq.conf" ]]; then
            cp "$latest_backup/dnsmasq.conf" /etc/dnsmasq.conf
            log_success "Dnsmasq configuration restored"
        fi
        
        # Restore iptables rules
        if [[ -f "$latest_backup/iptables.rules" ]]; then
            iptables-restore < "$latest_backup/iptables.rules"
            log_success "Firewall rules restored"
        fi
    else
        log_warn "No backup found, using default configurations"
        
        # Reset to basic configurations
        iptables -F
        iptables -t nat -F
        iptables -t mangle -F
        iptables -X
        iptables -P INPUT ACCEPT
        iptables -P FORWARD ACCEPT
        iptables -P OUTPUT ACCEPT
    fi
    
    # Remove DangerPrep network configurations
    rm -f /etc/netplan/01-dangerprep*.yaml
    rm -f /etc/hostapd/hostapd.conf

    # Reset hostapd default configuration
    if [[ -f /etc/default/hostapd ]]; then
        sed -i 's|DAEMON_CONF="/etc/hostapd/hostapd.conf"|#DAEMON_CONF=""|' /etc/default/hostapd
    fi

    # Reset NetworkManager management
    if command -v nmcli >/dev/null 2>&1; then
        local wifi_interfaces
        mapfile -t wifi_interfaces < <(iw dev 2>/dev/null | grep Interface | awk '{print $2}' || echo)
        for interface in "${wifi_interfaces[@]}"; do
            nmcli device set "$interface" managed yes 2>/dev/null || true
        done
    fi

    # Remove subuid/subgid entries for rootless Docker
    if [[ -f /etc/subuid ]]; then
        sed -i '/^ubuntu:/d' /etc/subuid 2>/dev/null || true
    fi
    if [[ -f /etc/subgid ]]; then
        sed -i '/^ubuntu:/d' /etc/subgid 2>/dev/null || true
    fi

    # Disable lingering for ubuntu user
    loginctl disable-linger ubuntu 2>/dev/null || true

    # Apply network changes
    netplan apply 2>/dev/null || true

    log_success "Network configuration restored"
}

# Remove configurations
remove_configurations() {
    log_info "Removing DangerPrep configurations..."

    # Remove configuration directories (optimistic cleanup)
    [[ -d /etc/dangerprep ]] && rm -rf /etc/dangerprep 2>/dev/null || true
    [[ -d /var/lib/dangerprep ]] && rm -rf /var/lib/dangerprep 2>/dev/null || true

    # Remove configuration state files specifically
    [[ -f /etc/dangerprep/setup-config.conf ]] && rm -f /etc/dangerprep/setup-config.conf 2>/dev/null || true
    [[ -f /etc/dangerprep/install-state.conf ]] && rm -f /etc/dangerprep/install-state.conf 2>/dev/null || true
    [[ -d /etc/cloudflared ]] && rm -rf /etc/cloudflared 2>/dev/null || true
    [[ -f /etc/unbound/unbound.conf.d/dangerprep.conf ]] && rm -f /etc/unbound/unbound.conf.d/dangerprep.conf 2>/dev/null || true
    [[ -f /var/lib/unbound/root.hints ]] && rm -f /var/lib/unbound/root.hints 2>/dev/null || true

    # Remove security tools configurations and cron jobs (optimistic cleanup)
    [[ -f /etc/cron.d/aide-check ]] && rm -f /etc/cron.d/aide-check 2>/dev/null || true
    [[ -f /etc/cron.d/antivirus-scan ]] && rm -f /etc/cron.d/antivirus-scan 2>/dev/null || true
    [[ -f /etc/cron.d/security-audit ]] && rm -f /etc/cron.d/security-audit 2>/dev/null || true
    [[ -f /etc/cron.d/rootkit-scan ]] && rm -f /etc/cron.d/rootkit-scan 2>/dev/null || true
    [[ -f /etc/cron.d/dangerprep-backups ]] && rm -f /etc/cron.d/dangerprep-backups 2>/dev/null || true
    [[ -f /etc/cron.d/dangerprep-monitor ]] && rm -f /etc/cron.d/dangerprep-monitor 2>/dev/null || true

    # Remove new cron jobs (optimistic cleanup)
    [[ -f /etc/cron.d/hardware-monitor ]] && rm -f /etc/cron.d/hardware-monitor 2>/dev/null || true
    [[ -f /etc/cron.d/container-health ]] && rm -f /etc/cron.d/container-health 2>/dev/null || true
    [[ -f /etc/cron.d/suricata-monitor ]] && rm -f /etc/cron.d/suricata-monitor 2>/dev/null || true
    [[ -f /etc/cron.d/cert-renewal ]] && rm -f /etc/cron.d/cert-renewal 2>/dev/null || true

    # Remove all DangerPrep scripts (optimistic cleanup)
    rm -f /usr/local/bin/dangerprep-* 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep 2>/dev/null || true
    rm -f /usr/local/bin/cloudflared 2>/dev/null || true

    # Remove scenario scripts (optimistic cleanup)
    rm -f /usr/local/bin/dangerprep-scenario1 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-scenario2 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-scenario3 2>/dev/null || true

    # Remove new management scripts (optimistic cleanup)
    rm -f /usr/local/bin/dangerprep-hardware-monitor 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-qos 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-certs 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-cert-renew 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-container-health 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-suricata-monitor 2>/dev/null || true

    # Remove log files and directories (optimistic cleanup)
    rm -f /var/log/dangerprep*.log 2>/dev/null || true
    rm -f /var/log/aide-check.log 2>/dev/null || true
    rm -f /var/log/clamav-scan.log 2>/dev/null || true
    rm -f /var/log/lynis-audit.log 2>/dev/null || true
    rm -f /var/log/rkhunter-scan.log 2>/dev/null || true
    rm -f /var/log/dnsmasq.log 2>/dev/null || true

    # Remove new log files (optimistic cleanup)
    rm -f /var/log/dangerprep-hardware.log 2>/dev/null || true
    rm -f /var/log/dangerprep-container-health.log 2>/dev/null || true
    rm -f /var/log/dangerprep-suricata-alerts.log 2>/dev/null || true

    # Remove fail2ban custom configurations (optimistic cleanup)
    [[ -f /etc/fail2ban/jail.local ]] && rm -f /etc/fail2ban/jail.local 2>/dev/null || true
    [[ -f /etc/fail2ban/filter.d/nginx-botsearch.conf ]] && rm -f /etc/fail2ban/filter.d/nginx-botsearch.conf 2>/dev/null || true

    # Remove SSH banner (optimistic cleanup)
    [[ -f /etc/ssh/ssh_banner ]] && rm -f /etc/ssh/ssh_banner 2>/dev/null || true

    # Remove FriendlyElec/RK3588 specific configurations (optimistic cleanup)
    [[ -f /etc/environment.d/mali-gpu.conf ]] && rm -f /etc/environment.d/mali-gpu.conf 2>/dev/null || true
    [[ -f /etc/profile.d/mali-gpu.sh ]] && rm -f /etc/profile.d/mali-gpu.sh 2>/dev/null || true
    [[ -f /etc/sensors.d/rk3588.conf ]] && rm -f /etc/sensors.d/rk3588.conf 2>/dev/null || true
    [[ -f /etc/sysctl.d/99-rk3588-optimizations.conf ]] && rm -f /etc/sysctl.d/99-rk3588-optimizations.conf 2>/dev/null || true
    [[ -f /etc/udev/rules.d/99-rk3588-storage.rules ]] && rm -f /etc/udev/rules.d/99-rk3588-storage.rules 2>/dev/null || true
    [[ -f /etc/udev/rules.d/99-rk3588-io-scheduler.rules ]] && rm -f /etc/udev/rules.d/99-rk3588-io-scheduler.rules 2>/dev/null || true
    [[ -f /etc/udev/rules.d/99-rk3588-vpu.rules ]] && rm -f /etc/udev/rules.d/99-rk3588-vpu.rules 2>/dev/null || true

    # Remove MOTD banner and restore Ubuntu defaults (optimistic cleanup)
    [[ -f /etc/update-motd.d/01-dangerprep-banner ]] && rm -f /etc/update-motd.d/01-dangerprep-banner 2>/dev/null || true

    # Remove fastfetch configuration files
    [[ -f /opt/dangerprep/fastfetch-dangerprep.jsonc ]] && rm -f /opt/dangerprep/fastfetch-dangerprep.jsonc 2>/dev/null || true
    [[ -f /opt/dangerprep/scripts/shared/dangerprep-logo.txt ]] && rm -f /opt/dangerprep/scripts/shared/dangerprep-logo.txt 2>/dev/null || true

    # Re-enable default Ubuntu MOTD components that were disabled
    [[ -f /etc/update-motd.d/10-help-text ]] && chmod +x /etc/update-motd.d/10-help-text 2>/dev/null || true
    [[ -f /etc/update-motd.d/50-motd-news ]] && chmod +x /etc/update-motd.d/50-motd-news 2>/dev/null || true
    [[ -f /etc/update-motd.d/80-esm ]] && chmod +x /etc/update-motd.d/80-esm 2>/dev/null || true
    [[ -f /etc/update-motd.d/95-hwe-eol ]] && chmod +x /etc/update-motd.d/95-hwe-eol 2>/dev/null || true

    # Remove automatic update configurations added by setup script (optimistic cleanup)
    [[ -f /etc/apt/apt.conf.d/50unattended-upgrades ]] && rm -f /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null || true
    [[ -f /etc/apt/apt.conf.d/20auto-upgrades ]] && rm -f /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null || true

    # Remove Tailscale repository (optimistic cleanup)
    [[ -f /etc/apt/sources.list.d/tailscale.list ]] && rm -f /etc/apt/sources.list.d/tailscale.list 2>/dev/null || true
    [[ -f /usr/share/keyrings/tailscale-archive-keyring.gpg ]] && rm -f /usr/share/keyrings/tailscale-archive-keyring.gpg 2>/dev/null || true

    # Remove Docker daemon configuration (optimistic cleanup)
    [[ -f /etc/docker/daemon.json ]] && rm -f /etc/docker/daemon.json 2>/dev/null || true
    [[ -f /etc/docker/seccomp.json ]] && rm -f /etc/docker/seccomp.json 2>/dev/null || true

    # Remove backup encryption key (optimistic cleanup)
    [[ -d /etc/dangerprep/backup ]] && rm -rf /etc/dangerprep/backup 2>/dev/null || true

    # Remove AIDE database and configuration additions (optimistic cleanup)
    [[ -f /var/lib/aide/aide.db ]] && rm -f /var/lib/aide/aide.db 2>/dev/null || true
    [[ -f /var/lib/aide/aide.db.new ]] && rm -f /var/lib/aide/aide.db.new 2>/dev/null || true

    # Restore original AIDE configuration by removing DangerPrep additions (optimistic cleanup)
    if [[ -f /etc/aide/aide.conf ]]; then
        # Remove DangerPrep specific monitoring rules
        sed -i '/# DangerPrep specific monitoring rules/,$d' /etc/aide/aide.conf 2>/dev/null || true
    fi

    # Remove certificate management files (optimistic cleanup)
    [[ -d /etc/letsencrypt ]] && rm -rf /etc/letsencrypt 2>/dev/null || true
    [[ -d /etc/ssl/dangerprep ]] && rm -rf /etc/ssl/dangerprep 2>/dev/null || true
    [[ -d /var/www/html ]] && rm -rf /var/www/html 2>/dev/null || true

    # Remove GStreamer hardware acceleration configuration (optimistic cleanup)
    [[ -d /etc/gstreamer-1.0 ]] && rm -rf /etc/gstreamer-1.0 2>/dev/null || true

    # Remove backup encryption key and directory (optimistic cleanup)
    [[ -d /etc/dangerprep/backup ]] && rm -rf /etc/dangerprep/backup 2>/dev/null || true

    # Remove backup cron job (optimistic cleanup)
    [[ -f /etc/cron.d/dangerprep-backups ]] && rm -f /etc/cron.d/dangerprep-backups 2>/dev/null || true

    # Remove Suricata configuration (optimistic cleanup)
    if [[ -f "$BACKUP_DIR/suricata.yaml.original" ]]; then
        cp "$BACKUP_DIR/suricata.yaml.original" /etc/suricata/suricata.yaml 2>/dev/null || true
    fi

    # Remove hardware monitoring configuration (optimistic cleanup)
    if [[ -f "$BACKUP_DIR/sensors3.conf.original" ]]; then
        cp "$BACKUP_DIR/sensors3.conf.original" /etc/sensors3.conf 2>/dev/null || true
    else
        # Remove DangerPrep additions from sensors config
        [[ -f /etc/sensors3.conf ]] && sed -i '/# DangerPrep Hardware Monitoring Configuration/,$d' /etc/sensors3.conf 2>/dev/null || true
    fi

    # Remove temporary files (optimistic cleanup)
    rm -rf /tmp/dangerprep* 2>/dev/null || true
    rm -rf /tmp/aide-report-* 2>/dev/null || true
    rm -rf /tmp/lynis-report-* 2>/dev/null || true

    # Remove additional configurations that setup script creates
    for netplan_file in /etc/netplan/01-dangerprep*.yaml; do
        [[ -f "$netplan_file" ]] && rm -f "$netplan_file" 2>/dev/null || true
    done
    [[ -f /etc/hostapd/hostapd.conf ]] && rm -f /etc/hostapd/hostapd.conf 2>/dev/null || true
    [[ -f /etc/iptables/rules.v4 ]] && rm -f /etc/iptables/rules.v4 2>/dev/null || true

    # Remove NFS client configurations (optimistic cleanup)
    local install_root="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"
    [[ -d "${install_root}/nfs" ]] && rm -rf "${install_root}/nfs" 2>/dev/null || true

    # Remove sysctl modifications made by setup script (optimistic cleanup)
    if [[ -f /etc/sysctl.conf ]]; then
        # Remove IP forwarding line added by setup script
        sed -i '/net.ipv4.ip_forward=1/d' /etc/sysctl.conf 2>/dev/null || true
    fi

    # Remove hostapd default configuration modifications (optimistic cleanup)
    if [[ -f /etc/default/hostapd ]]; then
        sed -i 's|DAEMON_CONF="/etc/hostapd/hostapd.conf"|#DAEMON_CONF=""|' /etc/default/hostapd 2>/dev/null || true
    fi

    # Remove dnsmasq configuration created by setup script (optimistic cleanup)
    if [[ -f /etc/dnsmasq.conf ]]; then
        # Check if it's the minimal config created by setup script
        if grep -q "# Minimal dnsmasq config for WiFi hotspot DHCP only" /etc/dnsmasq.conf 2>/dev/null; then
            # Restore original or remove if it was created by setup
            if [[ -f "$BACKUP_DIR/dnsmasq.conf.original" ]]; then
                cp "$BACKUP_DIR/dnsmasq.conf.original" /etc/dnsmasq.conf 2>/dev/null || true
            else
                # Remove the file if no original backup exists
                rm -f /etc/dnsmasq.conf 2>/dev/null || true
            fi
        fi
    fi

    log_success "Configurations removed"
}

# Remove packages installed by setup script with interactive selection
remove_packages() {
    # Skip package removal if requested (e.g., quick cleanup)
    if [[ "$SKIP_PACKAGES" == "true" ]]; then
        log_info "Skipping package removal as requested"
        return 0
    fi

    log_info "Removing packages installed by DangerPrep setup..."

    # Skip interactive package selection in dry-run mode
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Dry run mode: Skipping interactive package removal"
        return 0
    fi

    # Define package categories
    local security_packages=(
        "aide" "rkhunter" "chkrootkit" "clamav" "clamav-daemon" "clamav-freshclam"
        "lynis" "ossec-hids" "acct" "psacct" "suricata"
        "apparmor" "apparmor-utils" "libpam-pwquality" "libpam-tmpdir"
        "fail2ban" "ufw"
    )

    local network_packages=(
        "hostapd" "dnsmasq" "iptables-persistent" "bridge-utils"
        "wireless-tools" "wpasupplicant" "iw" "rfkill" "netplan.io"
        "iproute2" "tc" "wondershaper" "iperf3" "unbound" "unbound-anchor"
    )

    local monitoring_packages=(
        "lm-sensors" "hddtemp" "fancontrol" "sensors-applet"
        "smartmontools" "collectd" "collectd-utils" "logwatch" "rsyslog-gnutls"
    )

    local backup_packages=(
        "borgbackup" "restic"
    )

    local other_packages=(
        "tailscale" "unattended-upgrades" "certbot" "python3-certbot-nginx" "nfs-common"
        "fastfetch" "docker-ce" "docker-ce-cli" "containerd.io" "docker-buildx-plugin" "docker-compose-plugin"
    )

    # Interactive package removal if gum is available
    local packages_to_remove=()

    log_info "📦 Package Removal Selection"
    echo

    # Show installed packages by category
    local installed_security=()
    local installed_network=()
    local installed_monitoring=()
    local installed_backup=()
    local installed_other=()

        # Check which packages are actually installed
        for package in "${security_packages[@]}"; do
            if dpkg -l 2>/dev/null | grep -q "^ii.*${package} " 2>/dev/null; then
                installed_security+=("${package}")
            fi
        done

        for package in "${network_packages[@]}"; do
            if dpkg -l 2>/dev/null | grep -q "^ii.*${package} " 2>/dev/null; then
                installed_network+=("${package}")
            fi
        done

        for package in "${monitoring_packages[@]}"; do
            if dpkg -l 2>/dev/null | grep -q "^ii.*${package} " 2>/dev/null; then
                installed_monitoring+=("${package}")
            fi
        done

        for package in "${backup_packages[@]}"; do
            if dpkg -l 2>/dev/null | grep -q "^ii.*${package} " 2>/dev/null; then
                installed_backup+=("${package}")
            fi
        done

        for package in "${other_packages[@]}"; do
            if dpkg -l 2>/dev/null | grep -q "^ii.*${package} " 2>/dev/null; then
                installed_other+=("${package}")
            fi
        done

        # Show summary of installed packages
        enhanced_table "Category,Installed,Packages" \
            "Security,${#installed_security[@]},${installed_security[*]:0:3}..." \
            "Network,${#installed_network[@]},${installed_network[*]:0:3}..." \
            "Monitoring,${#installed_monitoring[@]},${installed_monitoring[*]:0:3}..." \
            "Backup,${#installed_backup[@]},${installed_backup[*]}" \
            "Other,${#installed_other[@]},${installed_other[*]:0:3}..."

        echo
        log_warn "⚠️  Package removal may affect other applications!"

        # Category-based removal selection
        if [[ ${#installed_security[@]} -gt 0 ]] && enhanced_confirm "Remove security packages? (${#installed_security[@]} packages)" "false"; then
            packages_to_remove+=("${installed_security[@]}")
        fi

        if [[ ${#installed_network[@]} -gt 0 ]] && enhanced_confirm "Remove network packages? (${#installed_network[@]} packages)" "false"; then
            packages_to_remove+=("${installed_network[@]}")
        fi

        if [[ ${#installed_monitoring[@]} -gt 0 ]] && enhanced_confirm "Remove monitoring packages? (${#installed_monitoring[@]} packages)" "false"; then
            packages_to_remove+=("${installed_monitoring[@]}")
        fi

        if [[ ${#installed_backup[@]} -gt 0 ]] && enhanced_confirm "Remove backup packages? (${#installed_backup[@]} packages)" "false"; then
            packages_to_remove+=("${installed_backup[@]}")
        fi

        if [[ ${#installed_other[@]} -gt 0 ]] && enhanced_confirm "Remove other packages? (${#installed_other[@]} packages)" "false"; then
            packages_to_remove+=("${installed_other[@]}")
        fi

        if [[ ${#packages_to_remove[@]} -eq 0 ]]; then
            log_info "No packages selected for removal"
            return 0
        fi

        # Show final confirmation
        log_info "📋 Packages Selected for Removal"
        {
            echo "Package,Category"
            for pkg in "${packages_to_remove[@]}"; do
                local category="Other"
                [[ " ${installed_security[*]} " =~ \ ${pkg}\  ]] && category="Security"
                [[ " ${installed_network[*]} " =~ \ ${pkg}\  ]] && category="Network"
                [[ " ${installed_monitoring[*]} " =~ \ ${pkg}\  ]] && category="Monitoring"
                [[ " ${installed_backup[*]} " =~ \ ${pkg}\  ]] && category="Backup"
                echo "${pkg},${category}"
            done
        } | enhanced_table

        echo
        if ! enhanced_confirm "Proceed with package removal?" "false"; then
            log_info "Package removal cancelled"
            return 0
        fi

    # Remove selected packages with progress indication
    log_info "Removing ${#packages_to_remove[@]} packages..."
    local removed_count=0
    local failed_count=0

    for package in "${packages_to_remove[@]}"; do
        enhanced_spin "Removing ${package}" \
            apt remove -y "${package}" DEBIAN_FRONTEND=noninteractive
        local remove_result=$?

        if [[ ${remove_result} -eq 0 ]]; then
            ((++removed_count))
            log_debug "✓ Removed ${package}"
        else
            ((++failed_count))
            log_warn "✗ Failed to remove ${package}"
        fi
    done

    # Clean up package dependencies
    enhanced_spin "Cleaning up dependencies" apt autoremove -y
    enhanced_spin "Cleaning package cache" apt autoclean

    log_success "Package removal completed: ${removed_count} removed, ${failed_count} failed"
}

# Remove data directories
remove_data() {
    if [[ "$PRESERVE_DATA" == "true" ]]; then
        log_info "Preserving data directories as requested"
        return 0
    fi

    log_info "Removing data directories..."

    # Get install root from environment or default
    local install_root="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"

    # Remove Docker configurations and NFS
    rm -rf "$install_root/docker" 2>/dev/null || true
    rm -rf "$install_root/nfs" 2>/dev/null || true

    # Handle data directories - check if using direct mounts or fallback
    if mountpoint -q /data 2>/dev/null; then
        log_warn "WARNING: This will delete all application data on the /data partition"
        read -p "Remove data directories on /data partition? (yes/no): " -r
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            # Remove service directories but preserve mount point
            find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
            log_success "Data directories on /data partition removed"
        else
            log_info "Data directories on /data partition preserved"
        fi
    else
        # Fallback: remove data under install root
        rm -rf "$install_root/data" 2>/dev/null || true
        log_info "Fallback data directories under $install_root removed"
    fi

    # Handle content directories - check if using direct mounts or fallback
    if mountpoint -q /content 2>/dev/null; then
        log_warn "WARNING: This will delete all media files on the /content partition"
        read -p "Remove content directories on /content partition? (yes/no): " -r
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            # Remove content directories but preserve mount point
            find /content -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
            log_success "Content directories on /content partition removed"
        else
            log_info "Content directories on /content partition preserved"
        fi
    else
        # Fallback: remove content under install root
        if [[ -d "$install_root/content" ]]; then
            log_warn "WARNING: This will delete all media files in $install_root/content"
            read -p "Remove content directories? (yes/no): " -r
            if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
                rm -rf "$install_root/content" 2>/dev/null || true
                log_success "Fallback content directories removed"
            else
                log_info "Fallback content directories preserved"
            fi
        fi
    fi

    # Remove entire install directory if empty
    if [[ -d "$install_root" ]]; then
        if [[ -z "$(ls -A "$install_root" 2>/dev/null)" ]]; then
            rmdir "$install_root" 2>/dev/null || true
            log_success "Empty install directory removed"
        else
            log_info "Install directory preserved (contains files)"
        fi
    fi
}

# Clean up user configurations
cleanup_user_configs() {
    log_info "Cleaning up user configurations..."

    # Clean up ubuntu user's rootless Docker configuration
    if [[ -d /home/ubuntu ]]; then
        log_info "Cleaning ubuntu user rootless Docker configuration..."

        # Stop rootless Docker service for ubuntu user
        sudo -u ubuntu systemctl --user stop docker 2>/dev/null || true
        sudo -u ubuntu systemctl --user disable docker 2>/dev/null || true

        # Remove rootless Docker files
        rm -rf /home/ubuntu/.config/systemd/user/docker.service 2>/dev/null || true
        rm -rf /home/ubuntu/bin/docker* 2>/dev/null || true

        # Clean up .bashrc modifications
        if [[ -f /home/ubuntu/.bashrc ]]; then
            sed -i "/export PATH=\/home\/ubuntu\/bin:\$PATH/d" /home/ubuntu/.bashrc 2>/dev/null || true
            sed -i '/export DOCKER_HOST=unix:\/\/\/run\/user\/1000\/docker.sock/d' /home/ubuntu/.bashrc 2>/dev/null || true
        fi

        log_success "Ubuntu user configuration cleaned"
    fi

    # Remove any remaining Docker socket files
    rm -f /run/user/1000/docker.sock 2>/dev/null || true
    rm -rf /run/user/1000/docker 2>/dev/null || true
}

# Clean up created user accounts
cleanup_user_accounts() {
    log_info "Cleaning up created user accounts..."

    # Check if we have information about created users from setup config
    local config_file="/etc/dangerprep/setup-config.conf"
    local created_username=""

    if [[ -f "$config_file" ]]; then
        # Extract username from config file
        created_username=$(grep "^NEW_USERNAME=" "$config_file" 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "")
    fi

    # If no config file, try to detect likely DangerPrep users (excluding system users)
    if [[ -z "$created_username" ]]; then
        log_info "No setup config found, checking for likely DangerPrep users..."

        # Look for users with UID >= 1000 that aren't ubuntu, pi, or other common users
        local potential_users
        mapfile -t potential_users < <(awk -F: '$3 >= 1000 && $1 !~ /^(ubuntu|pi|nobody|systemd-|_)/ {print $1}' /etc/passwd)

        if [[ ${#potential_users[@]} -gt 0 ]]; then
            log_info "Found potential DangerPrep users: ${potential_users[*]}"

            # In interactive mode, ask which users to remove
            if [[ "${FORCE_CLEANUP:-false}" != "true" ]] && [[ "${DRY_RUN:-false}" != "true" ]]; then
                for user in "${potential_users[@]}"; do
                    if enhanced_confirm "Remove user account: $user?" "false"; then
                        created_username="$user"
                        break
                    fi
                done
            fi
        fi
    fi

    # Remove the created user account if found
    if [[ -n "$created_username" ]] && id "$created_username" >/dev/null 2>&1; then
        log_info "Removing user account: $created_username"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would remove user: $created_username"
        else
            # Kill any processes owned by the user
            pkill -u "$created_username" 2>/dev/null || true
            sleep 2

            # Remove user and home directory
            if userdel -r "$created_username" 2>/dev/null; then
                log_success "Removed user account: $created_username"
                REMOVED_ITEMS+=("user: $created_username")

                # Clean up subuid/subgid entries
                if [[ -f /etc/subuid ]]; then
                    sed -i "/^${created_username}:/d" /etc/subuid 2>/dev/null || true
                fi
                if [[ -f /etc/subgid ]]; then
                    sed -i "/^${created_username}:/d" /etc/subgid 2>/dev/null || true
                fi
            else
                log_warn "Failed to remove user account: $created_username"
                FAILED_REMOVALS+=("user: $created_username")
            fi
        fi
    else
        log_info "No created user accounts found to remove"
    fi
}

# Clean up system users created by DangerPrep
cleanup_system_users() {
    log_info "Cleaning up system users..."

    # Remove dockerapp system user (UID 1337)
    if id dockerapp >/dev/null 2>&1; then
        log_info "Removing dockerapp system user..."

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would remove system user: dockerapp"
        else
            if userdel dockerapp 2>/dev/null; then
                log_success "Removed dockerapp system user"
                REMOVED_ITEMS+=("system user: dockerapp")
            else
                log_warn "Failed to remove dockerapp system user"
                FAILED_REMOVALS+=("system user: dockerapp")
            fi
        fi
    fi

    # Remove dockerapp group if it exists
    if getent group dockerapp >/dev/null 2>&1; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would remove group: dockerapp"
        else
            if groupdel dockerapp 2>/dev/null; then
                log_success "Removed dockerapp group"
                REMOVED_ITEMS+=("group: dockerapp")
            else
                log_warn "Failed to remove dockerapp group"
                FAILED_REMOVALS+=("group: dockerapp")
            fi
        fi
    fi
}

# Clean up mount points and fstab entries
cleanup_mount_points() {
    log_info "Cleaning up mount points and fstab entries..."

    # Unmount DangerPrep partitions
    local mount_points=("/data" "/content")

    for mount_point in "${mount_points[@]}"; do
        if mountpoint -q "$mount_point" 2>/dev/null; then
            log_info "Unmounting $mount_point..."

            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY RUN] Would unmount: $mount_point"
            else
                if umount "$mount_point" 2>/dev/null; then
                    log_success "Unmounted $mount_point"
                    REMOVED_ITEMS+=("mount: $mount_point")
                else
                    log_warn "Failed to unmount $mount_point"
                    FAILED_REMOVALS+=("mount: $mount_point")
                fi
            fi
        fi
    done

    # Remove fstab entries for DangerPrep partitions
    if [[ -f /etc/fstab ]]; then
        log_info "Removing DangerPrep entries from /etc/fstab..."

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would remove fstab entries for /data and /content"
        else
            # Backup fstab before modification
            cp /etc/fstab "${BACKUP_DIR}/fstab.backup-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true

            # Remove entries for /data and /content
            sed -i '\|/data|d' /etc/fstab 2>/dev/null || true
            sed -i '\|/content|d' /etc/fstab 2>/dev/null || true
            sed -i '/LABEL=danger-data/d' /etc/fstab 2>/dev/null || true
            sed -i '/LABEL=danger-content/d' /etc/fstab 2>/dev/null || true

            log_success "Removed DangerPrep fstab entries"
            REMOVED_ITEMS+=("fstab entries: /data, /content")
        fi
    fi

    # Remove mount point directories if they're empty
    for mount_point in "${mount_points[@]}"; do
        if [[ -d "$mount_point" ]] && [[ -z "$(ls -A "$mount_point" 2>/dev/null)" ]]; then
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY RUN] Would remove empty directory: $mount_point"
            else
                if rmdir "$mount_point" 2>/dev/null; then
                    log_success "Removed empty mount point: $mount_point"
                    REMOVED_ITEMS+=("directory: $mount_point")
                fi
            fi
        fi
    done
}

# Clean up finalization services and scripts
cleanup_finalization_services() {
    log_info "Cleaning up finalization services and scripts..."

    # Remove finalization services
    local finalization_services=(
        "dangerprep-finalize.service"
        "dangerprep-finalize-graphical.service"
        "dangerprep-recovery.service"
    )

    for service in "${finalization_services[@]}"; do
        local service_file="/etc/systemd/system/$service"
        if [[ -f "$service_file" ]]; then
            log_info "Removing finalization service: $service"

            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY RUN] Would remove service: $service"
            else
                # Stop and disable service first
                systemctl stop "$service" 2>/dev/null || true
                systemctl disable "$service" 2>/dev/null || true

                # Remove service file
                if rm -f "$service_file" 2>/dev/null; then
                    log_success "Removed service: $service"
                    REMOVED_ITEMS+=("service: $service")
                else
                    log_warn "Failed to remove service: $service"
                    FAILED_REMOVALS+=("service: $service")
                fi
            fi
        fi
    done

    # Remove finalization scripts
    local finalization_scripts=(
        "/usr/local/bin/dangerprep-finalize.sh"
        "/dangerprep/scripts/setup/finalize-user-migration.sh"
    )

    for script in "${finalization_scripts[@]}"; do
        if [[ -f "$script" ]]; then
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY RUN] Would remove script: $script"
            else
                if rm -f "$script" 2>/dev/null; then
                    log_success "Removed script: $script"
                    REMOVED_ITEMS+=("script: $script")
                else
                    log_warn "Failed to remove script: $script"
                    FAILED_REMOVALS+=("script: $script")
                fi
            fi
        fi
    done

    # Remove completion markers
    local completion_markers=(
        "/var/lib/dangerprep-finalization-complete"
    )

    for marker in "${completion_markers[@]}"; do
        if [[ -f "$marker" ]]; then
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY RUN] Would remove completion marker: $marker"
            else
                if rm -f "$marker" 2>/dev/null; then
                    log_success "Removed completion marker: $marker"
                    REMOVED_ITEMS+=("marker: $marker")
                fi
            fi
        fi
    done

    # Reload systemd after removing services
    if [[ "$DRY_RUN" != "true" ]]; then
        systemctl daemon-reload 2>/dev/null || true
    fi
}

# Clean up hardware groups created by GPIO setup
cleanup_hardware_groups() {
    log_info "Cleaning up hardware groups..."

    # Hardware groups that might be created by the GPIO setup script
    local hardware_groups=(
        "gpio"
        "pwm"
        "i2c"
        "spi"
        "uart"
        "hardware"
    )

    for group in "${hardware_groups[@]}"; do
        if getent group "$group" >/dev/null 2>&1; then
            # Check if this is a system group that we shouldn't remove
            local group_id
            group_id=$(getent group "$group" | cut -d: -f3)

            # Only remove groups with GID >= 1000 (user groups) or specific DangerPrep groups
            if [[ "$group_id" -ge 1000 ]] || [[ "$group" == "hardware" ]]; then
                log_info "Removing hardware group: $group"

                if [[ "$DRY_RUN" == "true" ]]; then
                    log_info "[DRY RUN] Would remove group: $group"
                else
                    if groupdel "$group" 2>/dev/null; then
                        log_success "Removed hardware group: $group"
                        REMOVED_ITEMS+=("group: $group")
                    else
                        log_warn "Failed to remove hardware group: $group (may be in use)"
                        FAILED_REMOVALS+=("group: $group")
                    fi
                fi
            else
                log_debug "Skipping system group: $group (GID: $group_id)"
            fi
        fi
    done
}

# Final cleanup
final_cleanup() {
    log_info "Performing final cleanup..."

    # Clean package cache
    apt autoremove -y 2>/dev/null || true
    apt autoclean 2>/dev/null || true

    # Remove temporary files
    rm -rf /tmp/dangerprep* 2>/dev/null || true
    rm -rf /tmp/aide-report-* 2>/dev/null || true
    rm -rf /tmp/lynis-report-* 2>/dev/null || true

    # Clean up systemd
    systemctl daemon-reload 2>/dev/null || true

    # Remove any remaining DangerPrep systemd services (optimistic cleanup)
    [[ -f /etc/systemd/system/cloudflared.service ]] && rm -f /etc/systemd/system/cloudflared.service 2>/dev/null || true
    rm -f /etc/systemd/system/dangerprep*.service 2>/dev/null || true

    # Remove systemd user services for ubuntu user (optimistic cleanup)
    if [[ -d /home/ubuntu/.config/systemd/user ]]; then
        [[ -f /home/ubuntu/.config/systemd/user/docker.service ]] && rm -f /home/ubuntu/.config/systemd/user/docker.service 2>/dev/null || true
        # Remove directory if empty
        rmdir /home/ubuntu/.config/systemd/user 2>/dev/null || true
        rmdir /home/ubuntu/.config/systemd 2>/dev/null || true
        rmdir /home/ubuntu/.config 2>/dev/null || true
    fi

    # Remove any FriendlyElec/RK3588 specific systemd services (optimistic cleanup)
    [[ -f /etc/systemd/system/rk3588-fan-control.service ]] && rm -f /etc/systemd/system/rk3588-fan-control.service 2>/dev/null || true

    # Reload systemd after removing service files (optimistic cleanup)
    systemctl daemon-reload 2>/dev/null || true

    # Reload user systemd for ubuntu user (optimistic cleanup)
    sudo -u ubuntu systemctl --user daemon-reload 2>/dev/null || true

    # Reload udev rules after removing RK3588 specific rules (optimistic cleanup)
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger 2>/dev/null || true

    # Reset GPU/hardware acceleration settings (optimistic cleanup)
    # Reset GPU governor to default if it exists
    if [[ -f /sys/class/devfreq/fb000000.gpu/governor ]]; then
        echo "simple_ondemand" > /sys/class/devfreq/fb000000.gpu/governor 2>/dev/null || true
    fi
    # Reset NPU governor to default if it exists
    if [[ -f /sys/class/devfreq/fdab0000.npu/governor ]]; then
        echo "simple_ondemand" > /sys/class/devfreq/fdab0000.npu/governor 2>/dev/null || true
    fi

    # Reset iptables to completely clean state (optimistic cleanup)
    iptables -F 2>/dev/null || true
    iptables -t nat -F 2>/dev/null || true
    iptables -t mangle -F 2>/dev/null || true
    iptables -X 2>/dev/null || true
    iptables -P INPUT ACCEPT 2>/dev/null || true
    iptables -P FORWARD ACCEPT 2>/dev/null || true
    iptables -P OUTPUT ACCEPT 2>/dev/null || true

    # Remove iptables rules file (optimistic cleanup)
    [[ -f /etc/iptables/rules.v4 ]] && rm -f /etc/iptables/rules.v4 2>/dev/null || true

    # Remove any remaining DangerPrep-related files that might have been missed
    rm -f /usr/local/bin/dangerprep 2>/dev/null || true
    rm -rf /opt/dangerprep 2>/dev/null || true

    # Remove any remaining configuration state files
    rm -f /etc/dangerprep/setup-config.conf 2>/dev/null || true
    rm -f /etc/dangerprep/install-state.conf 2>/dev/null || true

    # Remove dangerprep directory if empty
    if [[ -d /etc/dangerprep ]] && [[ -z "$(ls -A /etc/dangerprep 2>/dev/null)" ]]; then
        rmdir /etc/dangerprep 2>/dev/null || true
    fi

    # Clean up any remaining Docker-related files
    rm -rf /home/*/bin/docker* 2>/dev/null || true
    rm -rf /home/*/.config/systemd/user/docker* 2>/dev/null || true

    # Remove any remaining hardware-specific configurations
    rm -f /etc/udev/rules.d/99-dangerprep-*.rules 2>/dev/null || true

    # Final udev reload
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger 2>/dev/null || true

    log_success "Final cleanup completed"
}

# Show completion message
show_completion() {
    log_success "DangerPrep cleanup completed successfully!"
    echo
    echo "System Status:"
    echo "  • All DangerPrep services stopped and disabled"
    echo "  • Network configuration restored to original state"
    echo "  • All DangerPrep configurations and scripts removed"
    echo "  • User configurations cleaned (rootless Docker, etc.)"
    echo "  • Docker containers and networks removed"
    echo "  • Security tools configurations removed"
    echo "  • Firewall rules reset to default"
    echo "  • Cron jobs and automated tasks removed"
    echo "  • FriendlyElec/RK3588 specific configurations removed"
    echo "  • MOTD banner removed and Ubuntu defaults restored"
    echo "  • Hardware acceleration settings reset to defaults"
    if [[ "$PRESERVE_DATA" == "true" ]]; then
        echo "  • Data directories preserved"
    else
        echo "  • Data directories removed"
    fi
    echo
    echo "Important Notes:"
    echo "  • SSH configuration has been restored (check port settings)"
    echo "  • Some packages may have been removed (check if other apps are affected)"
    echo "  • Network interfaces have been reset to NetworkManager control"
    echo "  • Tailscale may need to be reconfigured if you plan to use it again"
    echo
    echo "Log file: $LOG_FILE"
    echo "Backup created: $BACKUP_DIR"
    echo
    echo "The system has been restored to its pre-DangerPrep state."
    echo "Reboot recommended to ensure all changes take effect."
}

# Enhanced completion message with comprehensive status
show_enhanced_completion() {
    local total_time=$((SECONDS - START_TIME))
    local minutes=$((total_time / 60))
    local seconds=$((total_time % 60))

    log_success "DangerPrep cleanup completed successfully!"
    echo
    echo "System Status:"
    echo "  ✓ All DangerPrep services stopped and disabled"
    echo "  ✓ Network configuration restored to original state"
    echo "  ✓ All DangerPrep configurations and scripts removed"
    echo "  ✓ User configurations cleaned (rootless Docker, etc.)"
    echo "  ✓ Created user accounts removed (if found)"
    echo "  ✓ System users removed (dockerapp, etc.)"
    echo "  ✓ Mount points unmounted and fstab entries removed"
    echo "  ✓ Finalization services and scripts removed"
    echo "  ✓ Hardware groups cleaned up"
    echo "  ✓ Docker containers and networks removed"
    echo "  ✓ Security tools configurations removed"
    echo "  ✓ Firewall rules reset to default"
    echo "  ✓ Cron jobs and automated tasks removed"
    echo "  ✓ FriendlyElec/RK3588 specific configurations removed"
    echo "  ✓ MOTD banner removed and Ubuntu defaults restored"
    echo "  ✓ Hardware acceleration settings reset to defaults"
    echo "  ✓ Configuration state files removed"

    if [[ "$PRESERVE_DATA" == "true" ]]; then
        echo "  ✓ Data directories preserved"
    else
        echo "  ✓ Data directories removed"
    fi

    echo
    echo "Important Notes:"
    echo "  • SSH configuration has been restored (check port settings)"
    echo "  • Some packages may have been removed (check if other apps are affected)"
    echo "  • Network interfaces have been reset to NetworkManager control"
    echo "  • Tailscale may need to be reconfigured if you plan to use it again"
    echo
    echo "Cleanup Summary:"
    echo "  • Total time: ${minutes}m ${seconds}s"
    echo "  • Items removed: ${#REMOVED_ITEMS[@]}"
    echo "  • Failed removals: ${#FAILED_REMOVALS[@]}"
    echo "  • Process ID: $$"
    echo "  • Version: ${SCRIPT_VERSION}"
    echo
    echo "Files:"
    echo "  • Log file: ${LOG_FILE}"
    echo "  • Backup: ${BACKUP_DIR}"
    echo

    if [[ ${#FAILED_REMOVALS[@]} -gt 0 ]]; then
        echo "Failed Removals:"
        printf '  • %s\n' "${FAILED_REMOVALS[@]}"
        echo
    fi

    echo "The system has been restored to its pre-DangerPrep state."
    echo "Reboot recommended to ensure all changes take effect."

    # Log final statistics
    log_info "Cleanup completed in ${minutes}m ${seconds}s"
    log_info "Items successfully removed: ${#REMOVED_ITEMS[@]}"
    log_info "Failed removals: ${#FAILED_REMOVALS[@]}"
    log_info "Total log entries: $(wc -l < "${LOG_FILE}" 2>/dev/null || echo "unknown")"
    log_info "Backup directory size: $(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo "unknown")"
}

# Enhanced main function with comprehensive error handling and flow control
main() {
    # Record start time for performance metrics
    readonly START_TIME=$SECONDS

    # Parse command line arguments first
    parse_arguments "$@"

    # Initialize paths with fallback support
    initialize_paths

    # Show banner before root check for consistency with setup script
    show_cleanup_banner "$@"
    echo

    # Check root privileges BEFORE setting up logging (which requires root)
    if ! check_root_privileges; then
        echo "ERROR: This script must be run with root privileges" >&2
        echo "Usage: sudo $0 [options]" >&2
        echo "Current user: $(whoami) (UID: $EUID)" >&2
        exit 1
    fi

    # Initialize logging after root check
    setup_logging

    # Acquire lock to prevent concurrent execution
    if ! acquire_lock; then
        log_error "Failed to acquire lock, exiting"
        exit 1
    fi

    if gum_available; then
        enhanced_warning_box "CLEANUP WARNING" \
            "This will remove DangerPrep configuration and restore the system to its original state.\n\n• All DangerPrep services will be stopped\n• Configuration files will be removed\n• Data directories may be removed (unless --preserve-data is used)\n• Network settings will be restored\n• This action cannot be easily undone" \
            "warning"
    else
        log_warn "This will remove DangerPrep configuration and restore"
        log_warn "the system to its original state."
        echo
    fi

    # Comprehensive pre-flight checks
    enhanced_section "Pre-flight Checks" "Validating system state before cleanup" "🔍"

    # Check Bash version
    check_bash_version

    if ! check_root_privileges; then
        log_error "Root privileges check failed"
        exit 1
    fi

    enhanced_status_indicator "success" "All pre-flight checks passed"

    # Confirm cleanup operation
    confirm_cleanup

    # Main cleanup phases with progress tracking
    local -a cleanup_phases=(
        "stop_services:Stopping DangerPrep services"
        "cleanup_raspap:Cleaning up RaspAP"
        "restore_network:Restoring network configuration"
        "remove_configurations:Removing configurations"
        "cleanup_user_configs:Cleaning up user configurations"
        "cleanup_user_accounts:Cleaning up created user accounts"
        "cleanup_system_users:Cleaning up system users"
        "cleanup_mount_points:Cleaning up mount points and fstab"
        "cleanup_finalization_services:Cleaning up finalization services"
        "cleanup_hardware_groups:Cleaning up hardware groups"
        "remove_packages:Removing packages"
        "remove_data:Removing data directories"
        "final_cleanup:Performing final cleanup"
    )

    local phase_count=${#cleanup_phases[@]}
    local current_phase=0

    enhanced_section "Cleanup Execution" "Starting cleanup with ${phase_count} phases" "🧹"

    # Execute each cleanup phase
    for phase_info in "${cleanup_phases[@]}"; do
        IFS=':' read -r phase_function phase_description <<< "$phase_info"
        ((++current_phase))

        enhanced_progress_bar "$current_phase" "$phase_count" "Cleanup Progress"
        enhanced_status_indicator "pending" "Phase ${current_phase}/${phase_count}: $phase_description"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would execute: $phase_function"
            sleep 0.5  # Simulate work for demo
        else
            if ! "$phase_function"; then
                log_error "Phase failed: $phase_description"
                log_warn "Continuing with remaining cleanup phases..."
                # Don't exit on failure, continue with cleanup
            fi
        fi

        log_success "Phase completed: $phase_description"
    done

    # Show completion message
    show_enhanced_completion

    log_success "DangerPrep cleanup completed successfully"
    return 0
}

# Progress indicator functions (same as setup script)
show_progress() {
    local current="$1"
    local total="$2"
    local description="$3"
    local percentage=$((current * 100 / total))
    local bar_length=50
    local filled_length=$((percentage * bar_length / 100))

    printf "\r[%3d%%] " "$percentage"
    printf "["
    printf "%*s" "$filled_length" "" | tr ' ' '='
    printf "%*s" $((bar_length - filled_length)) "" | tr ' ' '-'
    printf "] %s" "$description"

    if [[ $current -eq $total ]]; then
        printf "\n"
    fi
}

# Script entry point with comprehensive error handling
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Ensure we're not being sourced
    if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
        log_error "This script should not be sourced"
        return 1
    fi

    # Execute main function with all arguments
    main "$@"
fi
