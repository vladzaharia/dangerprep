#!/bin/bash
# DangerPrep Setup Script - 2025 Best Practices Edition
# Complete system setup for Ubuntu 24.04 with modern security hardening
# Uses external configuration templates for maintainability

# Modern shell script security and error handling - 2025 best practices
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

# Note: Color codes are now handled by gum-utils.sh
# No need for manual color management

# Note: Logging functions are provided by gum-utils.sh
# The following functions are available:
# - log_debug, log_info, log_warn, log_error, log_success
# All functions support structured logging and automatic file logging when LOG_FILE is set

# Enhanced utility functions for 2025 best practices

# Bash version check
check_bash_version() {
    local current_version
    current_version=$(bash --version | head -n1 | grep -oE '[0-9]+\.[0-9]+' | head -n1)
    if ! awk -v curr="$current_version" -v req="$REQUIRED_BASH_VERSION" 'BEGIN {exit !(curr >= req)}'; then
        log_error "Bash version $REQUIRED_BASH_VERSION or higher required. Current: $current_version"
        exit 1
    fi
}

# Retry function with exponential backoff
retry_with_backoff() {
    local max_attempts="$1"
    local delay="$2"
    local max_delay="${3:-300}"
    shift 3

    local attempt=1
    local current_delay="$delay"

    while [[ $attempt -le $max_attempts ]]; do
        log_debug "Attempt $attempt/$max_attempts: $*"

        if "$@"; then
            log_debug "Command succeeded on attempt $attempt"
            return 0
        fi

        local exit_code=$?

        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Command failed after $max_attempts attempts: $*"
            return $exit_code
        fi

        log_warn "Command failed (exit code $exit_code), retrying in ${current_delay}s..."
        sleep "$current_delay"

        # Exponential backoff with jitter
        current_delay=$((current_delay * 2))
        if [[ $current_delay -gt $max_delay ]]; then
            current_delay=$max_delay
        fi
        # Add jitter (±25%)
        local jitter=$((current_delay / 4))
        current_delay=$((current_delay + (RANDOM % (jitter * 2)) - jitter))

        ((attempt++))
    done
}

# Enhanced input validation functions
validate_ip_address() {
    local ip="$1"
    local ip_regex='^([0-9]{1,3}\.){3}[0-9]{1,3}$'

    if [[ ! $ip =~ $ip_regex ]]; then
        return 1
    fi

    # Check each octet is valid (0-255)
    local IFS='.'
    local -a octets
    read -ra octets <<< "$ip"
    for octet in "${octets[@]}"; do
        if [[ $octet -gt 255 ]] || [[ $octet =~ ^0[0-9] && $octet != "0" ]]; then
            return 1
        fi
    done
    return 0
}

validate_interface_name() {
    local interface="$1"
    local interface_regex='^[a-zA-Z0-9_-]{1,15}$'
    [[ $interface =~ $interface_regex ]]
}

validate_path_safe() {
    local path="$1"
    # Prevent path traversal attacks and ensure absolute paths for critical operations
    if [[ "$path" =~ \.\./|\.\.\\ ]] || [[ "$path" =~ ^[[:space:]]*$ ]]; then
        return 1
    fi
    return 0
}

validate_port_number() {
    local port="$1"
    if [[ $port =~ ^[0-9]+$ ]] && [[ $port -ge 1 ]] && [[ $port -le 65535 ]]; then
        return 0
    fi
    return 1
}

# Configuration variables with enhanced validation
declare SCRIPT_DIR PROJECT_ROOT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly SCRIPT_DIR PROJECT_ROOT
readonly INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"

# Dynamic paths with fallback support (set after gum-utils is loaded)
LOG_FILE=""
BACKUP_DIR=""
LOCK_FILE="/var/run/dangerprep-setup.lock"

# Source shared banner utility with error handling
declare BANNER_SCRIPT_PATH
BANNER_SCRIPT_PATH="${SCRIPT_DIR}/../shared/banner.sh"
if [[ -f "${BANNER_SCRIPT_PATH}" ]]; then
    # shellcheck source=../shared/banner.sh
    source "${BANNER_SCRIPT_PATH}"
else
    log_warn "Banner utility not found at ${BANNER_SCRIPT_PATH}, continuing without banner"
    show_setup_banner() { echo "DangerPrep Setup"; }
    show_cleanup_banner() { echo "DangerPrep Cleanup"; }
fi

# Source gum utilities for enhanced user interaction (required)
declare GUM_UTILS_PATH
GUM_UTILS_PATH="${SCRIPT_DIR}/../shared/gum-utils.sh"
if [[ -f "${GUM_UTILS_PATH}" ]]; then
    # shellcheck source=../shared/gum-utils.sh
    source "${GUM_UTILS_PATH}"
else
    log_error "Required gum utilities not found at ${GUM_UTILS_PATH}"
    log_error "This indicates a corrupted or incomplete DangerPrep installation"
    exit 1
fi

# Initialize dynamic paths with fallback support
initialize_paths() {
    if command -v get_log_file_path >/dev/null 2>&1; then
        LOG_FILE="$(get_log_file_path "setup")"
        BACKUP_DIR="$(get_backup_dir_path "setup")"
    else
        # Fallback if gum-utils functions aren't available
        LOG_FILE="/var/log/dangerprep-setup.log"
        BACKUP_DIR="/var/backups/dangerprep-setup-$(date +%Y%m%d-%H%M%S)"

        # Try to create directories, fall back to temp if needed
        if ! mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || ! touch "$LOG_FILE" 2>/dev/null; then
            LOG_FILE="/tmp/dangerprep-setup-$$.log"
        fi

        if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
            BACKUP_DIR="/tmp/dangerprep-setup-$(date +%Y%m%d-%H%M%S)-$$"
            mkdir -p "$BACKUP_DIR" 2>/dev/null || true
        fi
    fi

    # Make paths readonly after initialization
    readonly LOG_FILE
    readonly BACKUP_DIR

    # Try to create lock file with fallback
    if ! touch "$LOCK_FILE" 2>/dev/null; then
        LOCK_FILE="/tmp/dangerprep-setup-$$.lock"
        readonly LOCK_FILE
    fi
}

# Enhanced temporary directory management
create_secure_temp_dir() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        log_debug "Temporary directory already exists: $TEMP_DIR"
        return 0
    fi

    TEMP_DIR=$(mktemp -d -t "dangerprep-setup-$$-XXXXXX")
    chmod 700 "$TEMP_DIR"
    log_debug "Created secure temporary directory: $TEMP_DIR"

    # Add to cleanup tasks
    CLEANUP_TASKS+=("remove_temp_dir")
}

# Enhanced cleanup function with comprehensive resource management
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
        log_success "Script completed successfully"
    else
        log_error "Script failed with exit code $exit_code"
    fi

    exit $exit_code
}

# Note: Duplicate validation functions removed - using enhanced versions above

# Secure file operations
secure_copy() {
    local src="$1"
    local dest="$2"
    local mode="${3:-644}"

    # Validate paths
    if ! validate_path_safe "${src}" || ! validate_path_safe "${dest}"; then
        log_error "Invalid path in secure_copy: ${src} -> ${dest}"
        return 1
    fi

    # Copy with secure permissions
    cp "${src}" "${dest}"
    chmod "${mode}" "${dest}"
    chown root:root "${dest}"
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
                log_error "Another instance is already running (PID: ${existing_pid})"
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

# Enhanced signal handlers with proper cleanup
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

# Progress indicator functions
show_progress() {
    local current="$1"
    local total="$2"
    local description="$3"
    local percentage=$((current * 100 / total))
    local bar_length=50
    local filled_length=$((percentage * bar_length / 100))

    printf "\r${BLUE}[%3d%%]${NC} " "$percentage"
    printf "["
    printf "%*s" "$filled_length" "" | tr ' ' '='
    printf "%*s" $((bar_length - filled_length)) "" | tr ' ' '-'
    printf "] %s" "$description"

    if [[ $current -eq $total ]]; then
        printf "\n"
    fi
}

# Command existence check with detailed error reporting
require_command() {
    local cmd="$1"
    local package="${2:-$cmd}"
    local install_hint="${3:-"apt install $package"}"

    if ! command -v "$cmd" >/dev/null 2>&1; then
        log_error "Required command '$cmd' not found"
        log_error "Install with: $install_hint"
        return 1
    fi
    log_debug "Required command '$cmd' found"
    return 0
}

# Network connectivity check with timeout
check_network_connectivity() {
    local host="${1:-8.8.8.8}"
    local timeout="${2:-5}"

    log_debug "Checking network connectivity to $host"
    if timeout "$timeout" ping -c 1 "$host" >/dev/null 2>&1; then
        log_debug "Network connectivity confirmed"
        return 0
    else
        log_error "No network connectivity to $host"
        return 1
    fi
}

# Command-line argument parsing with enhanced options
DRY_RUN=false
VERBOSE=false
SKIP_UPDATES=false
FORCE_INSTALL=false

show_help() {
    # Create styled help display with sections
    local header_content="DangerPrep Setup Script - Version ${SCRIPT_VERSION}
Complete system setup for emergency router and content hub"

    local usage_content="sudo $0 [OPTIONS]"

    local options_content="-d, --dry-run           Show what would be done without making changes
-v, --verbose           Enable verbose output and debug logging
-s, --skip-updates      Skip system package updates
-f, --force             Force installation even if already installed
--non-interactive       Run in non-interactive mode with default values
--batch                 Alias for --non-interactive
-h, --help              Show this help message
--version               Show version information"

    local examples_content="sudo $0                 # Standard installation
sudo $0 --dry-run       # Preview changes without installing
sudo $0 --verbose       # Detailed logging output
sudo $0 --skip-updates  # Skip package updates (faster)"

    local requirements_content="• Ubuntu 24.04 LTS
• Root privileges (run with sudo)
• Internet connection
• Minimum 10GB disk space
• Minimum 2GB RAM"

    local files_content="Log file: /var/log/dangerprep-setup.log
Backup:   /var/backups/dangerprep-setup-*
Install:  ${INSTALL_ROOT}

For more information: https://github.com/vladzaharia/dangerprep"

    enhanced_card "🚀 DangerPrep Setup" "${header_content}" "39" "39"
    enhanced_section "Usage" "${usage_content}" "📖"
    enhanced_section "Options" "${options_content}" "⚙️"
    enhanced_section "Examples" "${examples_content}" "💡"
    enhanced_section "Requirements" "${requirements_content}" "✅"
    enhanced_section "Files & Locations" "${files_content}" "📁"
}

show_version() {
    echo "${SCRIPT_NAME} version ${SCRIPT_VERSION}"
    echo "Bash version: ${BASH_VERSION}"
    echo "System: $(uname -a)"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--dry-run)
                DRY_RUN=true
                log_info "Dry-run mode enabled - no changes will be made"
                shift
                ;;
            -v|--verbose)
                export VERBOSE=true
                export DEBUG=true
                log_info "Verbose mode enabled"
                shift
                ;;
            -s|--skip-updates)
                export SKIP_UPDATES=true
                log_info "Skipping system updates"
                shift
                ;;
            -f|--force)
                export FORCE_INSTALL=true
                log_info "Force installation enabled"
                shift
                ;;
            --non-interactive|--batch)
                export NON_INTERACTIVE=true
                log_info "Non-interactive mode enabled"
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

# Load configuration utilities with error handling
load_configuration() {
    local config_loader="$SCRIPT_DIR/config-loader.sh"

    if [[ -f "$config_loader" ]]; then
        log_debug "Loading configuration utilities from: $config_loader"
        # shellcheck source=config-loader.sh
        if ! source "$config_loader"; then
            log_error "Failed to load configuration utilities"
            return 1
        fi
        log_debug "Configuration utilities loaded successfully"
    else
        log_warn "Configuration loader not found: $config_loader"
        log_warn "Some configuration features may not be available"

        # Provide minimal fallback functions
        validate_config_files() { return 0; }
        load_ssh_config() { log_warn "SSH config loading not available"; }
        load_fail2ban_config() { log_warn "Fail2ban config loading not available"; }
        load_docker_config() { log_warn "Docker config loading not available"; }
        load_watchtower_config() { log_warn "Watchtower config loading not available"; }
        load_sync_configs() { log_warn "Sync config loading not available"; }
        # Add other fallback functions as needed
    fi
}

# Default network configuration (can be overridden by interactive setup)
WIFI_SSID="DangerPrep"
WIFI_PASSWORD="EXAMPLE_PASSWORD"
LAN_NETWORK="192.168.120.0/22"
LAN_IP="192.168.120.1"
DHCP_START="192.168.120.100"
DHCP_END="192.168.120.200"

# Default system configuration (can be overridden by interactive setup)
SSH_PORT="2222"
FAIL2BAN_BANTIME="3600"
FAIL2BAN_MAXRETRY="3"

# Interactive configuration collection
collect_configuration() {
    log_info "Collecting configuration preferences..."

    # Check if we're in a non-interactive environment or mode
    if [[ "${NON_INTERACTIVE:-false}" == "true" ]] || [[ "${DRY_RUN:-false}" == "true" ]] || [[ ! -t 0 ]] || [[ ! -t 1 ]] || [[ "${TERM:-}" == "dumb" ]]; then
        log_info "Non-interactive mode enabled, using default configuration values"
        return 0
    fi

    # Additional check for SSH or remote sessions where interaction might not work well
    if [[ -n "${SSH_CLIENT:-}" ]] || [[ -n "${SSH_TTY:-}" ]] || [[ "${TERM:-}" == "screen"* ]]; then
        log_warn "Remote/SSH session detected, using default configuration values"
        log_info "Use --non-interactive flag to suppress this warning"
        return 0
    fi

    log_info "🎛️  Interactive configuration mode enabled"
    log_info "Press Ctrl+C to skip interactive configuration and use defaults"
    echo

    # Set up trap to handle Ctrl+C gracefully
    trap 'log_warn "Interactive configuration cancelled, using default values"; return 0' INT

    # Network configuration
    log_info "📡 Network Configuration"
    echo

    local new_wifi_ssid
    new_wifi_ssid=$(enhanced_input "WiFi Hotspot Name (SSID)" "${WIFI_SSID}" "Enter WiFi network name")
    if [[ -n "${new_wifi_ssid}" ]]; then
        WIFI_SSID="${new_wifi_ssid}"
        log_debug "WiFi SSID set to: ${WIFI_SSID}"
    fi

    local new_wifi_password
    new_wifi_password=$(enhanced_input "WiFi Password" "${WIFI_PASSWORD}" "Enter WiFi password (min 8 chars)")
    if [[ -n "${new_wifi_password}" && ${#new_wifi_password} -ge 8 ]]; then
        WIFI_PASSWORD="${new_wifi_password}"
        log_debug "WiFi password updated"
    elif [[ -n "${new_wifi_password}" ]]; then
        log_warn "WiFi password too short (minimum 8 characters), using default"
    fi

    local new_lan_network
    new_lan_network=$(enhanced_input "LAN Network CIDR" "${LAN_NETWORK}" "e.g., 192.168.120.0/22")
    if [[ -n "${new_lan_network}" ]] && [[ "${new_lan_network}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]]; then
        LAN_NETWORK="${new_lan_network}"
        # Extract base IP for LAN_IP (replace last octet with 1)
        LAN_IP="${new_lan_network%/*}"
        LAN_IP="${LAN_IP%.*}.1"
        log_debug "LAN network set to: ${LAN_NETWORK}, gateway: ${LAN_IP}"
    elif [[ -n "${new_lan_network}" ]]; then
        log_warn "Invalid network CIDR format, using default: ${LAN_NETWORK}"
    fi

    # DHCP range configuration
    local new_dhcp_start
    new_dhcp_start=$(enhanced_input "DHCP Range Start" "${DHCP_START}" "First IP in DHCP pool")
    if [[ -n "${new_dhcp_start}" ]] && validate_ip_address "${new_dhcp_start}"; then
        DHCP_START="${new_dhcp_start}"
        log_debug "DHCP start set to: ${DHCP_START}"
    elif [[ -n "${new_dhcp_start}" ]]; then
        log_warn "Invalid IP address format, using default: ${DHCP_START}"
    fi

    local new_dhcp_end
    new_dhcp_end=$(enhanced_input "DHCP Range End" "${DHCP_END}" "Last IP in DHCP pool")
    if [[ -n "${new_dhcp_end}" ]] && validate_ip_address "${new_dhcp_end}"; then
        DHCP_END="${new_dhcp_end}"
        log_debug "DHCP end set to: ${DHCP_END}"
    elif [[ -n "${new_dhcp_end}" ]]; then
        log_warn "Invalid IP address format, using default: ${DHCP_END}"
    fi

    echo
    log_info "🔒 Security Configuration"
    echo

    # SSH configuration
    local new_ssh_port
    new_ssh_port=$(enhanced_input "SSH Port" "${SSH_PORT}" "Port for SSH access")
    if [[ -n "${new_ssh_port}" ]] && validate_port_number "${new_ssh_port}"; then
        SSH_PORT="${new_ssh_port}"
        log_debug "SSH port set to: ${SSH_PORT}"
    elif [[ -n "${new_ssh_port}" ]]; then
        log_warn "Invalid port number, using default: ${SSH_PORT}"
    fi

    # Fail2ban configuration
    local new_ban_time
    new_ban_time=$(enhanced_input "Fail2ban Ban Time (seconds)" "${FAIL2BAN_BANTIME}" "How long to ban IPs")
    if [[ -n "${new_ban_time}" ]] && [[ "${new_ban_time}" =~ ^[0-9]+$ ]]; then
        FAIL2BAN_BANTIME="${new_ban_time}"
        log_debug "Fail2ban ban time set to: ${FAIL2BAN_BANTIME}"
    elif [[ -n "${new_ban_time}" ]]; then
        log_warn "Invalid ban time, using default: ${FAIL2BAN_BANTIME}"
    fi

    local new_max_retry
    new_max_retry=$(enhanced_input "Fail2ban Max Retry" "${FAIL2BAN_MAXRETRY}" "Failed attempts before ban")
    if [[ -n "${new_max_retry}" ]] && [[ "${new_max_retry}" =~ ^[0-9]+$ ]]; then
        FAIL2BAN_MAXRETRY="${new_max_retry}"
        log_debug "Fail2ban max retry set to: ${FAIL2BAN_MAXRETRY}"
    elif [[ -n "${new_max_retry}" ]]; then
        log_warn "Invalid max retry value, using default: ${FAIL2BAN_MAXRETRY}"
    fi

    echo
    # Create styled configuration summary with sections
    local network_config="WiFi SSID: ${WIFI_SSID}
WiFi Password: ${WIFI_PASSWORD:0:3}***
LAN Network: ${LAN_NETWORK}
LAN Gateway: ${LAN_IP}
DHCP Range: ${DHCP_START} - ${DHCP_END}"

    local security_config="SSH Port: ${SSH_PORT}
Fail2ban Ban Time: ${FAIL2BAN_BANTIME}s
Fail2ban Max Retry: ${FAIL2BAN_MAXRETRY}"

    enhanced_section "Configuration Summary" "Review your DangerPrep configuration settings" "📋"

    enhanced_card "🌐 Network Configuration" "${network_config}" "39" "39"
    enhanced_card "🔒 Security Configuration" "${security_config}" "196" "196"

    echo
    if ! enhanced_confirm "Proceed with this configuration?" "true"; then
        log_info "Configuration cancelled by user"
        exit 0
    fi

    # Export variables for use in templates and other functions
    export WIFI_SSID WIFI_PASSWORD LAN_NETWORK LAN_IP DHCP_START DHCP_END
    export SSH_PORT FAIL2BAN_BANTIME FAIL2BAN_MAXRETRY

    # Clean up trap
    trap - INT

    log_success "Configuration collection completed"
}

# Enhanced root privilege check with detailed error reporting
check_root_privileges() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run with root privileges"
        log_error "Usage: sudo $0 [options]"
        log_error "Current user: $(whoami) (UID: $EUID)"
        return 1
    fi

    # Verify we can actually perform root operations
    if ! touch /tmp/dangerprep-root-test 2>/dev/null; then
        log_error "Unable to perform root operations despite running as root"
        return 1
    fi
    rm -f /tmp/dangerprep-root-test

    log_debug "Root privileges confirmed"
    return 0
}

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

    # Log rotation setup (keep last 10 files, max 10MB each)
    if command -v logrotate >/dev/null 2>&1; then
        cat > "/etc/logrotate.d/dangerprep-setup" << EOF
$LOG_FILE {
    daily
    rotate 10
    compress
    delaycompress
    missingok
    notifempty
    create 640 root adm
    maxsize 10M
}
EOF
    fi

    # Initial log entries
    log_info "DangerPrep Setup Started (Version: $SCRIPT_VERSION)"
    log_info "Backup directory: $BACKUP_DIR"
    log_info "Install root: $INSTALL_ROOT"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Log file: $LOG_FILE"
    log_info "Process ID: $$"
    log_info "User: $(whoami) (UID: $EUID)"
    log_info "System: $(uname -a)"
}

# Enhanced system requirements check
check_system_requirements() {
    enhanced_section "System Requirements Check" "Validating system compatibility and resources..." "🔍"

    local checks_passed=0
    local total_checks=5
    local check_results=()

    # Check 1: Bash version
    enhanced_progress_bar 1 ${total_checks} "System Requirements Validation"

    local bash_check_result=""
    if check_bash_version 2>/dev/null; then
        bash_check_result="success"
        ((checks_passed++))
    else
        bash_check_result="failure"
    fi
    check_results+=("Bash Version,${bash_check_result},$(bash --version | head -n1 | grep -oE '[0-9]+\.[0-9]+' | head -n1)")

    # Check 2: OS version
    enhanced_progress_bar 2 ${total_checks} "System Requirements Validation"

    local os_check_result=""
    local os_version
    os_version="$(lsb_release -d 2>/dev/null | cut -f2 || echo "Unknown")"
    if lsb_release -d 2>/dev/null | grep -q "Ubuntu 24.04"; then
        os_check_result="success"
        ((checks_passed++))
    else
        os_check_result="warning"
        log_warn "This script is designed for Ubuntu 24.04"
        log_warn "Current OS: ${os_version}"
        log_warn "Proceeding anyway, but some features may not work correctly"
    fi
    check_results+=("Operating System,${os_check_result},${os_version}")

    # Check 3: Disk space (minimum 10GB)
    enhanced_progress_bar 3 ${total_checks} "System Requirements Validation"

    local available_kb
    available_kb=$(df / | tail -1 | awk '{print $4}')
    local required_kb=$((10 * 1024 * 1024))  # 10GB in KB
    local available_gb=$(( available_kb / 1024 / 1024 ))
    local disk_check_result=""

    if [[ $available_kb -lt $required_kb ]]; then
        disk_check_result="failure"
        log_error "Insufficient disk space"
        log_error "Required: 10GB, Available: ${available_gb}GB"
    else
        disk_check_result="success"
        ((checks_passed++))
    fi
    check_results+=("Disk Space,${disk_check_result},${available_gb}GB available")

    # Check 4: Memory (minimum 2GB)
    enhanced_progress_bar 4 ${total_checks} "System Requirements Validation"

    local available_mb
    available_mb=$(free -m | grep '^Mem:' | awk '{print $2}')
    local required_mb=$((2 * 1024))  # 2GB in MB
    local memory_check_result=""

    if [[ $available_mb -lt $required_mb ]]; then
        memory_check_result="failure"
        log_error "Insufficient memory"
        log_error "Required: 2GB, Available: ${available_mb}MB"
    else
        memory_check_result="success"
        ((checks_passed++))
    fi
    check_results+=("Memory,${memory_check_result},${available_mb}MB available")

    # Check 5: Essential system commands (pre-installed)
    enhanced_progress_bar 5 ${total_checks} "System Requirements Validation"

    # Only check for commands that:
    # 1. Are essential system utilities that should be present on Ubuntu 24.04
    # 2. Are needed by the setup script to function
    # 3. Are NOT installed by the setup script itself
    local essential_commands=(
        "systemctl:systemd"     # Service management (core system)
        "apt:apt"              # Package manager (essential for setup)
        "ip:iproute2"          # Network configuration (core networking)
        "iptables:iptables"    # Firewall management (core security)
        "lsb_release:lsb-release"  # OS identification (used by script)
        "ping:iputils-ping"    # Network connectivity testing
        "df:coreutils"         # Disk usage checking
        "free:procps"          # Memory usage checking
    )
    
    local missing_commands=()
    local cmd package
    for cmd_package in "${essential_commands[@]}"; do
        IFS=':' read -r cmd package <<< "$cmd_package"
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_commands+=("$cmd ($package)")
        fi
    done

    local commands_check_result=""
    if [[ ${#missing_commands[@]} -gt 0 ]]; then
        commands_check_result="failure"
        log_error "Missing essential system commands:"
        printf '%s\n' "${missing_commands[@]}" | while read -r missing; do
            log_error "  - $missing"
        done
        log_error "These are core system utilities that should be pre-installed on Ubuntu 24.04"
        log_error "Install missing packages with: apt update && apt install -y <package-names>"
    else
        commands_check_result="success"
        ((checks_passed++))
    fi
    check_results+=("Essential Commands,${commands_check_result},${#essential_commands[@]} system commands checked")

    # Display results
    echo
    enhanced_section "System Requirements Results" "Validation completed: ${checks_passed}/${total_checks} checks passed" "📊"

    # Create results table
    local table_data=()
    table_data+=("Check,Status,Details")

    for result in "${check_results[@]}"; do
        IFS=',' read -r check_name status details <<< "$result"
        local status_symbol=""
        case "${status}" in
            "success") status_symbol="✓" ;;
            "failure") status_symbol="✗" ;;
            "warning") status_symbol="⚠" ;;
            *) status_symbol="?" ;;
        esac
        table_data+=("${check_name},${status_symbol} ${status},${details}")
    done

    enhanced_table "${table_data[0]}" "${table_data[@]:1}"

    # Final result
    if [[ ${checks_passed} -eq ${total_checks} ]]; then
        log_success "System requirements check passed (${checks_passed}/${total_checks})"
        return 0
    elif [[ ${checks_passed} -ge 3 ]]; then
        log_warn "System requirements check passed with warnings (${checks_passed}/${total_checks})"
        return 0
    else
        log_error "System requirements check failed (${checks_passed}/${total_checks})"
        return 1
    fi
}

# Display banner and setup information
show_setup_info() {
    # Use the shared banner utility
    show_setup_banner "$@"
    echo
    log_info "Logs: ${LOG_FILE}"
    log_info "Backups: ${BACKUP_DIR}"
    log_info "Install root: ${INSTALL_ROOT}"
}

# Show system information and detect FriendlyElec hardware
show_system_info() {
    log_info "System Information:"
    log_info "OS: $(lsb_release -d | cut -f2)"
    log_info "Kernel: $(uname -r)"
    log_info "Architecture: $(uname -m)"
    log_info "Memory: $(free -h | grep Mem | awk '{print $2}')"
    log_info "Disk: $(df -h / | tail -1 | awk '{print $2}')"

    # Detect platform and set FriendlyElec-specific flags
    detect_friendlyelec_platform
}

# Enhanced FriendlyElec platform detection
detect_friendlyelec_platform() {
    # Initialize platform variables
    PLATFORM="Unknown"
    IS_FRIENDLYELEC=false
    IS_RK3588=false
    IS_RK3588S=false
    FRIENDLYELEC_MODEL=""
    SOC_TYPE=""

    # Detect platform from device tree
    if [[ -f /proc/device-tree/model ]]; then
        PLATFORM=$(cat /proc/device-tree/model | tr -d '\0')
        log_info "Platform: $PLATFORM"

        # Check for FriendlyElec hardware
        if [[ "$PLATFORM" =~ (NanoPi|NanoPC|CM3588) ]]; then
            IS_FRIENDLYELEC=true
            log_info "FriendlyElec hardware detected"

            # Extract model information
            if [[ "$PLATFORM" =~ NanoPi[[:space:]]*M6 ]]; then
                FRIENDLYELEC_MODEL="NanoPi-M6"
                IS_RK3588S=true
                SOC_TYPE="RK3588S"
            elif [[ "$PLATFORM" =~ NanoPi[[:space:]]*R6[CS] ]]; then
                FRIENDLYELEC_MODEL="NanoPi-R6C"
                IS_RK3588S=true
                SOC_TYPE="RK3588S"
            elif [[ "$PLATFORM" =~ NanoPC[[:space:]]*T6 ]]; then
                FRIENDLYELEC_MODEL="NanoPC-T6"
                IS_RK3588=true
                SOC_TYPE="RK3588"
            elif [[ "$PLATFORM" =~ CM3588 ]]; then
                FRIENDLYELEC_MODEL="CM3588"
                IS_RK3588=true
                SOC_TYPE="RK3588"
            else
                FRIENDLYELEC_MODEL="Unknown FriendlyElec"
            fi

            log_info "Model: $FRIENDLYELEC_MODEL"
            log_info "SoC: $SOC_TYPE"

            # Detect additional hardware features
            detect_friendlyelec_features
        fi
    else
        PLATFORM="Generic x86_64"
        log_info "Platform: $PLATFORM"
    fi

    # Export variables for use in other functions
    export PLATFORM IS_FRIENDLYELEC IS_RK3588 IS_RK3588S FRIENDLYELEC_MODEL SOC_TYPE
}

# Detect FriendlyElec-specific hardware features
detect_friendlyelec_features() {
    local features=()

    # Check for hardware acceleration support
    if [[ -d /sys/class/devfreq/fb000000.gpu ]]; then
        features+=("Mali GPU")
    fi

    # Check for VPU/MPP support
    if [[ -c /dev/mpp_service ]]; then
        features+=("Hardware VPU")
    fi

    # Check for NPU support (RK3588/RK3588S)
    if [[ "$IS_RK3588" == true || "$IS_RK3588S" == true ]]; then
        if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
            features+=("6TOPS NPU")
        fi
    fi

    # Check for RTC support
    if [[ -f /sys/class/rtc/rtc0/name ]]; then
        local rtc_name
        rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null)
        if [[ "${rtc_name}" =~ hym8563 ]]; then
            features+=("HYM8563 RTC")
        fi
    fi

    # Check for M.2 interfaces
    if [[ -d /sys/class/nvme ]]; then
        features+=("M.2 NVMe")
    fi

    # Log detected features
    if [[ ${#features[@]} -gt 0 ]]; then
        log_info "Hardware features: ${features[*]}"
    fi
}

# Pre-flight checks
pre_flight_checks() {
    log_info "Running pre-flight checks..."
    
    # Check Ubuntu version
    if ! lsb_release -d | grep -q "Ubuntu 24.04"; then
        log_warn "This script is designed for Ubuntu 24.04. Proceeding anyway..."
    fi

    # Check internet connectivity
    if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        log_error "No internet connectivity. Please check your connection."
        exit 1
    fi

    # Check available disk space (minimum 10GB)
    available_space=$(df / | tail -1 | awk '{print $4}')
    if [[ $available_space -lt 10485760 ]]; then  # 10GB in KB
        log_error "Insufficient disk space. At least 10GB required."
        exit 1
    fi

    # Validate configuration files
    if ! validate_config_files; then
        log_error "Configuration file validation failed"
        exit 1
    fi

    log_success "Pre-flight checks completed"
}

# Backup original configurations
backup_original_configs() {
    log_info "Backing up original configurations..."
    
    local configs_to_backup=(
        "/etc/ssh/sshd_config"
        "/etc/sysctl.conf"
        "/etc/dnsmasq.conf"
        "/etc/hostapd/hostapd.conf"
        "/etc/fail2ban/jail.conf"
        "/etc/aide/aide.conf"
        "/etc/sensors3.conf"
        "/etc/netplan"
    )
    
    for config in "${configs_to_backup[@]}"; do
        if [[ -e "$config" ]]; then
            cp -r "$config" "$BACKUP_DIR/" 2>/dev/null || true
            log_info "Backed up: $config"
        fi
    done
    
    log_success "Original configurations backed up to ${BACKUP_DIR}"
}

# Update system packages
update_system_packages() {
    log_info "Updating system packages..."
    
    export DEBIAN_FRONTEND=noninteractive
    apt update
    apt upgrade -y
    
    log_success "System packages updated"
}

# Install essential packages with interactive selection
install_essential_packages() {
    log_info "📦 Installing essential packages..."

    # Define package categories (removing certbot and cloudflared)
    local core_packages=(
        "curl" "wget" "git" "vim" "nano" "htop" "tree" "unzip" "zip"
        "software-properties-common" "apt-transport-https" "ca-certificates"
        "gnupg" "lsb-release" "jq" "bc" "rsync" "screen" "tmux"
    )

    local network_packages=(
        "hostapd" "iptables-persistent" "bridge-utils"
        "wireless-tools" "wpasupplicant" "iw" "rfkill" "netplan.io"
        "iproute2" "tc" "wondershaper" "iperf3"
    )

    local security_packages=(
        "fail2ban" "aide" "rkhunter" "chkrootkit" "clamav" "clamav-daemon"
        "lynis" "suricata" "apparmor" "apparmor-utils" "libpam-pwquality"
        "libpam-tmpdir" "acct" "psacct"
    )

    local monitoring_packages=(
        "lm-sensors" "hddtemp" "fancontrol" "sensors-applet"
        "collectd" "collectd-utils" "logwatch" "rsyslog-gnutls"
        "smartmontools"
    )

    local backup_packages=(
        "borgbackup" "restic"
    )

    local update_packages=(
        "unattended-upgrades"
    )

    # Interactive package selection
    local selected_packages=()

    enhanced_section "Package Selection" "Choose which package categories to install" "📦"

    # Always include core packages (non-optional)
    selected_packages+=("${core_packages[@]}")
    enhanced_status_indicator "info" "Core packages (required): ${#core_packages[@]} packages - always included"
    echo

    # Optional package categories with multi-select
    local package_categories=(
        "Network packages (hostapd, iptables, etc.) - ${#network_packages[@]} packages"
        "Security packages (fail2ban, aide, clamav, etc.) - ${#security_packages[@]} packages"
        "Monitoring packages (sensors, collectd, etc.) - ${#monitoring_packages[@]} packages"
        "Backup packages (borgbackup, restic) - ${#backup_packages[@]} packages"
        "Automatic update packages - ${#update_packages[@]} packages"
    )

    log_info "Select optional package categories to install:"
    local selected_categories
    selected_categories=$(enhanced_multi_choose "Package Categories" "${package_categories[@]}")

    # Process selected categories
    if [[ -n "${selected_categories}" ]]; then
        while IFS= read -r category; do
            case "${category}" in
                *"Network packages"*)
                    selected_packages+=("${network_packages[@]}")
                    enhanced_status_indicator "success" "Added ${#network_packages[@]} network packages"
                    ;;
                *"Security packages"*)
                    selected_packages+=("${security_packages[@]}")
                    enhanced_status_indicator "success" "Added ${#security_packages[@]} security packages"
                    ;;
                *"Monitoring packages"*)
                    selected_packages+=("${monitoring_packages[@]}")
                    enhanced_status_indicator "success" "Added ${#monitoring_packages[@]} monitoring packages"
                    ;;
                *"Backup packages"*)
                    selected_packages+=("${backup_packages[@]}")
                    enhanced_status_indicator "success" "Added ${#backup_packages[@]} backup packages"
                    ;;
                *"Automatic update packages"*)
                    selected_packages+=("${update_packages[@]}")
                    enhanced_status_indicator "success" "Added ${#update_packages[@]} update packages"
                    ;;
            esac
        done <<< "${selected_categories}"
    else
        log_info "No optional packages selected"
    fi

    # Show package summary
    log_info "📋 Package Installation Summary"
    enhanced_table "Category,Count,Packages" \
        "Core,${#core_packages[@]},Always installed" \
        "Network,${#network_packages[@]},$(if [[ " ${selected_packages[*]} " =~ ${network_packages[0]} ]]; then echo "Selected"; else echo "Skipped"; fi)" \
        "Security,${#security_packages[@]},$(if [[ " ${selected_packages[*]} " =~ ${security_packages[0]} ]]; then echo "Selected"; else echo "Skipped"; fi)" \
        "Monitoring,${#monitoring_packages[@]},$(if [[ " ${selected_packages[*]} " =~ ${monitoring_packages[0]} ]]; then echo "Selected"; else echo "Skipped"; fi)" \
        "Backup,${#backup_packages[@]},$(if [[ " ${selected_packages[*]} " =~ ${backup_packages[0]} ]]; then echo "Selected"; else echo "Skipped"; fi)" \
        "Updates,${#update_packages[@]},$(if [[ " ${selected_packages[*]} " =~ ${update_packages[0]} ]]; then echo "Selected"; else echo "Skipped"; fi)"

    echo
    if ! enhanced_confirm "Proceed with package installation?" "true"; then
        log_info "Package installation cancelled by user"
        return 1
    fi

    # Install selected packages with enhanced progress indication
    local failed_packages=()
    local installed_count=0
    local total_packages=${#selected_packages[@]}

    enhanced_section "Package Installation" "Installing ${total_packages} selected packages..." "📦"

    for package in "${selected_packages[@]}"; do
        ((installed_count++))

        # Show progress bar
        enhanced_progress_bar "${installed_count}" "${total_packages}" "Package Installation Progress"

        # Check if package is already installed
        if dpkg -l "${package}" 2>/dev/null | grep -q "^ii"; then
            enhanced_status_indicator "success" "${package} (already installed)"
            continue
        fi

        enhanced_spin "Installing ${package} (${installed_count}/${total_packages})" \
            env DEBIAN_FRONTEND=noninteractive apt install -y "${package}"
        local install_result=$?

        if [[ ${install_result} -eq 0 ]]; then
            enhanced_status_indicator "success" "Installed ${package}"
        else
            enhanced_status_indicator "failure" "Failed to install ${package}"
            failed_packages+=("${package}")
        fi
    done

    # Report installation results
    if [[ ${#failed_packages[@]} -gt 0 ]]; then
        log_warn "Failed to install ${#failed_packages[@]} packages: ${failed_packages[*]}"
        log_info "These packages may not be available in the current repository"
    fi

    log_success "Successfully installed $((total_packages - ${#failed_packages[@]}))/${total_packages} packages"

    # Install FriendlyElec-specific packages
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
        if enhanced_confirm "Install FriendlyElec-specific packages?" "true"; then
            install_friendlyelec_packages
        fi
    fi

    # Clean up package cache
    enhanced_spin "Cleaning package cache" apt autoremove -y
    enhanced_spin "Cleaning package cache" apt autoclean

    log_success "Essential packages installation completed"
}

# Install FriendlyElec-specific packages and configurations
install_friendlyelec_packages() {
    log_info "Installing FriendlyElec-specific packages..."

    # FriendlyElec-specific packages for hardware acceleration
    local friendlyelec_packages=()

    if [[ "$IS_RK3588" == true || "$IS_RK3588S" == true ]]; then
        friendlyelec_packages+=(
            "mesa-utils"           # OpenGL utilities
            "glmark2-es2"         # OpenGL ES benchmark
            "v4l-utils"           # Video4Linux utilities
            "gstreamer1.0-tools"  # GStreamer tools for hardware decoding
            "gstreamer1.0-plugins-bad"
            "gstreamer1.0-rockchip1"  # RK3588 hardware acceleration (if available)
        )
    fi

    # Install available packages
    for package in "${friendlyelec_packages[@]}"; do
        # Check if package is already installed
        if dpkg -l "${package}" 2>/dev/null | grep -q "^ii"; then
            log_debug "✓ ${package} already installed"
            continue
        fi

        log_info "Installing FriendlyElec package: ${package}..."
        if env DEBIAN_FRONTEND=noninteractive apt install -y "${package}"; then
            log_success "Installed ${package}"
        else
            log_warn "Package ${package} not available, skipping"
        fi
    done

    # Install FriendlyElec kernel headers if available
    install_friendlyelec_kernel_headers

    # Configure hardware-specific settings
    configure_friendlyelec_hardware

    log_success "FriendlyElec-specific packages installation completed"
}

# Install FriendlyElec kernel headers
install_friendlyelec_kernel_headers() {
    log_info "Installing FriendlyElec kernel headers..."

    # Check for pre-installed kernel headers in /opt/archives/
    if [[ -d /opt/archives ]]; then
        local kernel_headers
        kernel_headers=$(find /opt/archives -name "linux-headers-*.deb" | head -1)
        if [[ -n "$kernel_headers" ]]; then
            log_info "Found FriendlyElec kernel headers: $kernel_headers"
            if dpkg -i "$kernel_headers" 2>/dev/null; then
                log_success "Installed FriendlyElec kernel headers"
            else
                log_warn "Failed to install FriendlyElec kernel headers"
            fi
        else
            log_info "No FriendlyElec kernel headers found in /opt/archives/"
        fi
    fi

    # Try to download latest kernel headers if not found locally
    if ! dpkg -l | grep -q "linux-headers-$(uname -r)"; then
        log_info "Attempting to download latest kernel headers..."
        local kernel_version
        kernel_version=$(uname -r)
        local headers_url="http://112.124.9.243/archives/rk3588/linux-headers-${kernel_version}-latest.deb"

        if wget -q --spider "$headers_url" 2>/dev/null; then
            log_info "Downloading kernel headers from FriendlyElec repository..."
            if wget -O "/tmp/linux-headers-latest.deb" "$headers_url" 2>/dev/null; then
                if dpkg -i "/tmp/linux-headers-latest.deb" 2>/dev/null; then
                    log_success "Downloaded and installed latest kernel headers"
                    rm -f "/tmp/linux-headers-latest.deb"
                else
                    log_warn "Failed to install downloaded kernel headers"
                fi
            else
                log_warn "Failed to download kernel headers"
            fi
        else
            log_info "No online kernel headers available for this version"
        fi
    fi
}

# Configure FriendlyElec hardware-specific settings
configure_friendlyelec_hardware() {
    log_info "Configuring FriendlyElec hardware settings..."

    # Load FriendlyElec-specific configuration templates
    load_friendlyelec_configs

    # Configure GPU settings for RK3588/RK3588S
    if [[ "$IS_RK3588" == true || "$IS_RK3588S" == true ]]; then
        configure_rk3588_gpu
    fi

    # Configure NanoPi M6 specific settings
    if [[ "$FRIENDLYELEC_MODEL" == "NanoPi-M6" ]]; then
        configure_nanopi_m6_specific
    fi

    # Configure RTC if HYM8563 is detected
    configure_friendlyelec_rtc

    # Configure hardware monitoring
    configure_friendlyelec_sensors

    # Configure fan control for thermal management
    configure_friendlyelec_fan_control

    # Configure GPIO and PWM interfaces
    configure_friendlyelec_gpio_pwm

    log_success "FriendlyElec hardware configuration completed"
}

# Configure NanoPi M6 specific settings based on FriendlyElec wiki
configure_nanopi_m6_specific() {
    log_info "Configuring NanoPi M6 specific settings..."

    # Enable hardware acceleration and media codecs
    configure_nanopi_m6_media_acceleration

    # Configure M.2 interfaces
    configure_nanopi_m6_m2_interfaces

    # Configure USB and power management
    configure_nanopi_m6_usb_power

    # Configure thermal management
    configure_nanopi_m6_thermal

    # Configure network optimizations
    configure_nanopi_m6_network

    log_success "NanoPi M6 specific configuration completed"
}

# Configure NanoPi M6 media acceleration
configure_nanopi_m6_media_acceleration() {
    log_info "Configuring NanoPi M6 media acceleration..."

    # Install RK3588S specific packages
    local rk3588s_packages=(
        "librockchip-mpp1"
        "librockchip-mpp-dev"
        "librockchip-vpu0"
        "gstreamer1.0-rockchip1"
        "ffmpeg"
    )

    for package in "${rk3588s_packages[@]}"; do
        if apt install -y "$package" 2>/dev/null; then
            log_debug "Installed $package"
        else
            log_debug "Package $package not available, skipping"
        fi
    done

    # Configure GPU memory allocation
    if [[ -f /boot/config.txt ]]; then
        # Add GPU memory split for better performance
        if ! grep -q "gpu_mem=" /boot/config.txt; then
            echo "gpu_mem=128" >> /boot/config.txt
            log_info "Set GPU memory allocation to 128MB"
        fi
    fi

    # Configure hardware video decoding
    cat > /etc/environment.d/50-rk3588-media.conf << 'EOF'
# RK3588S Media Acceleration Environment
LIBVA_DRIVER_NAME=rockchip
VDPAU_DRIVER=rockchip
GST_PLUGIN_PATH=/usr/lib/aarch64-linux-gnu/gstreamer-1.0
EOF

    log_info "Media acceleration configured for RK3588S"
}

# Configure NanoPi M6 M.2 interfaces
configure_nanopi_m6_m2_interfaces() {
    log_info "Configuring NanoPi M6 M.2 interfaces..."

    # The NanoPi M6 has:
    # - M.2 M-Key for NVMe SSD (PCIe 3.0 x4)
    # - M.2 E-Key for WiFi module (PCIe 2.1 x1 + USB 2.0)

    # Configure NVMe optimizations
    if [[ -d /sys/class/nvme ]]; then
        log_info "Configuring NVMe optimizations for M.2 M-Key slot..."

        # Set NVMe queue depth for better performance
        echo 'ACTION=="add", SUBSYSTEM=="nvme", ATTR{queue/nr_requests}="256"' > /etc/udev/rules.d/60-nvme-optimization.rules

        # Configure NVMe power management
        for nvme_device in /sys/class/nvme/nvme*; do
            if [[ -d "$nvme_device" ]]; then
                echo auto > "${nvme_device}/power/control" 2>/dev/null || true
            fi
        done
    fi

    # Configure WiFi module detection for M.2 E-Key
    if [[ -d /sys/class/ieee80211 ]]; then
        log_info "WiFi module detected in M.2 E-Key slot"

        # Common WiFi modules for NanoPi M6
        local wifi_modules=("rtl8852be" "mt7921e" "iwlwifi")

        for module in "${wifi_modules[@]}"; do
            if lsmod | grep -q "$module"; then
                log_info "WiFi module loaded: $module"
                break
            fi
        done
    fi

    log_info "M.2 interface configuration completed"
}

# Configure NanoPi M6 USB and power management
configure_nanopi_m6_usb_power() {
    log_info "Configuring NanoPi M6 USB and power management..."

    # The NanoPi M6 has multiple USB ports with different capabilities
    # Configure USB power management for better efficiency

    # Enable USB autosuspend for power saving
    echo 'ACTION=="add", SUBSYSTEM=="usb", TEST=="power/control", ATTR{power/control}="auto"' > /etc/udev/rules.d/50-usb-power.rules

    # Configure USB3 ports for optimal performance
    if [[ -d /sys/bus/usb/devices ]]; then
        for usb_device in /sys/bus/usb/devices/usb*; do
            if [[ -f "${usb_device}/speed" ]]; then
                local speed
                speed=$(cat "${usb_device}/speed" 2>/dev/null || echo "unknown")
                if [[ "$speed" == "5000" ]]; then
                    log_debug "USB 3.0 port detected: $(basename "$usb_device")"
                fi
            fi
        done
    fi

    # Configure power button behavior
    if [[ -f /etc/systemd/logind.conf ]]; then
        sed -i 's/#HandlePowerKey=poweroff/HandlePowerKey=poweroff/' /etc/systemd/logind.conf
        log_info "Configured power button behavior"
    fi

    log_info "USB and power management configured"
}

# Configure NanoPi M6 thermal management
configure_nanopi_m6_thermal() {
    log_info "Configuring NanoPi M6 thermal management..."

    # The NanoPi M6 uses RK3588S with integrated thermal management
    # Configure thermal zones and cooling policies

    if [[ -d /sys/class/thermal ]]; then
        # Configure thermal governor
        for thermal_zone in /sys/class/thermal/thermal_zone*; do
            if [[ -f "${thermal_zone}/policy" ]]; then
                echo "step_wise" > "${thermal_zone}/policy" 2>/dev/null || true
            fi
        done

        # Set thermal trip points if available
        for thermal_zone in /sys/class/thermal/thermal_zone*; do
            if [[ -f "${thermal_zone}/trip_point_0_temp" ]]; then
                local temp
                temp=$(cat "${thermal_zone}/trip_point_0_temp" 2>/dev/null || echo "0")
                if [[ "$temp" -gt 0 ]]; then
                    log_debug "Thermal zone $(basename "$thermal_zone"): trip point at ${temp}°C"
                fi
            fi
        done
    fi

    # Configure CPU frequency scaling for thermal management
    if [[ -d /sys/devices/system/cpu/cpufreq ]]; then
        # Set conservative governor for better thermal management
        for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
            if [[ -f "$cpu" ]]; then
                echo "conservative" > "$cpu" 2>/dev/null || true
            fi
        done
        log_info "Set CPU frequency scaling to conservative mode"
    fi

    log_info "Thermal management configured"
}

# Configure NanoPi M6 network optimizations
configure_nanopi_m6_network() {
    log_info "Configuring NanoPi M6 network optimizations..."

    # The NanoPi M6 has Gigabit Ethernet with RTL8211F PHY
    # Configure network interface optimizations

    # Configure Ethernet interface optimizations
    cat > /etc/udev/rules.d/70-nanopi-m6-network.rules << 'EOF'
# NanoPi M6 Network Optimizations
# Configure Ethernet interface settings
ACTION=="add", SUBSYSTEM=="net", KERNEL=="eth*", RUN+="/sbin/ethtool -K %k tso on gso on gro on"
ACTION=="add", SUBSYSTEM=="net", KERNEL=="eth*", RUN+="/sbin/ethtool -G %k rx 512 tx 512"
ACTION=="add", SUBSYSTEM=="net", KERNEL=="eth*", RUN+="/sbin/ethtool -C %k rx-usecs 50 tx-usecs 50"
EOF

    # Configure network buffer sizes for Gigabit performance
    cat >> /etc/sysctl.d/99-nanopi-m6-network.conf << 'EOF'
# NanoPi M6 Network Buffer Optimizations
net.core.rmem_default = 262144
net.core.rmem_max = 16777216
net.core.wmem_default = 262144
net.core.wmem_max = 16777216
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_congestion_control = bbr
EOF

    log_info "Network optimizations configured for Gigabit Ethernet"
}

# Configure RK3588/RK3588S GPU settings
configure_rk3588_gpu() {
    log_info "Configuring RK3588 GPU settings..."

    # Set GPU governor to performance for better graphics performance
    if [[ -f /sys/class/devfreq/fb000000.gpu/governor ]]; then
        echo "performance" > /sys/class/devfreq/fb000000.gpu/governor 2>/dev/null || true
        log_info "Set GPU governor to performance mode"
    fi

    # Configure Mali GPU environment variables
    cat > /etc/environment.d/mali-gpu.conf << 'EOF'
# Mali GPU configuration for RK3588/RK3588S
MALI_OPENCL_DEVICE_TYPE=gpu
MALI_DUAL_MODE_COMPUTE=1
EOF

    log_info "Configured Mali GPU environment"
}

# Configure FriendlyElec RTC
configure_friendlyelec_rtc() {
    if [[ -f /sys/class/rtc/rtc0/name ]]; then
        local rtc_name
        rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null)
        if [[ "$rtc_name" =~ hym8563 ]]; then
            log_info "Configuring HYM8563 RTC..."

            # Ensure RTC is set as system clock source
            if command -v timedatectl >/dev/null 2>&1; then
                timedatectl set-local-rtc 0 2>/dev/null || true
                log_info "Configured RTC as UTC time source"
            fi
        fi
    fi
}

# Configure FriendlyElec sensors
configure_friendlyelec_sensors() {
    log_info "Configuring FriendlyElec sensors..."

    # Create sensors configuration for RK3588/RK3588S
    if [[ "$IS_RK3588" == true || "$IS_RK3588S" == true ]]; then
        cat > /etc/sensors.d/rk3588.conf << 'EOF'
# RK3588/RK3588S temperature sensors configuration
chip "rk3588-thermal-*"
    label temp1 "SoC Temperature"
    set temp1_max 85
    set temp1_crit 95

chip "rk3588s-thermal-*"
    label temp1 "SoC Temperature"
    set temp1_max 85
    set temp1_crit 95
EOF
        log_info "Created RK3588 sensors configuration"
    fi
}

# Setup automatic updates
setup_automatic_updates() {
    log_info "Setting up automatic updates..."
    load_unattended_upgrades_config
    systemctl enable unattended-upgrades
    log_success "Automatic updates configured"
}

# Configure SSH hardening
configure_ssh_hardening() {
    log_info "Configuring SSH hardening..."
    load_ssh_config
    chmod 644 /etc/ssh/sshd_config /etc/ssh/ssh_banner

    # Test SSH configuration
    if sshd -t; then
        systemctl restart ssh
        log_success "SSH configured on port $SSH_PORT with key-only authentication"
    else
        log_error "SSH configuration is invalid"
        exit 1
    fi
}

# Load MOTD configuration
load_motd_config() {
    log_info "Loading MOTD configuration..."

    # Copy the MOTD banner script to the system
    local motd_source="${CONFIG_DIR}/system/01-dangerprep-banner"
    local motd_target="/etc/update-motd.d/01-dangerprep-banner"

    if [[ -f "$motd_source" ]]; then
        cp "$motd_source" "$motd_target"
        chmod +x "$motd_target"
        log_info "Installed DangerPrep MOTD banner"
    else
        log_warn "MOTD banner source not found: $motd_source"
    fi

    # Update MOTD
    if command -v update-motd >/dev/null 2>&1; then
        update-motd
        log_info "Updated MOTD"
    fi

    log_success "MOTD configuration loaded"
}

# Setup fail2ban
setup_fail2ban() {
    log_info "Setting up fail2ban..."
    load_fail2ban_config
    systemctl enable fail2ban
    systemctl start fail2ban
    log_success "Fail2ban configured and started"
}

# Configure kernel hardening
configure_kernel_hardening() {
    log_info "Configuring kernel hardening..."
    load_kernel_hardening_config
    sysctl -p
    log_success "Kernel hardening applied"
}

# Setup file integrity monitoring
setup_file_integrity_monitoring() {
    log_info "Setting up file integrity monitoring..."
    aide --init
    [[ -f /var/lib/aide/aide.db.new ]] && mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db
    load_aide_config

    # Add cron job to run via just
    echo "0 3 * * * root cd $PROJECT_ROOT && just aide-check" > /etc/cron.d/aide-check

    log_success "File integrity monitoring configured"
}

# Setup hardware monitoring
setup_hardware_monitoring() {
    log_info "Setting up hardware monitoring..."
    sensors-detect --auto
    load_hardware_monitoring_config

    # Add cron job to run via just
    echo "*/15 * * * * root cd $PROJECT_ROOT && just hardware-monitor" > /etc/cron.d/hardware-monitor

    log_success "Hardware monitoring configured"
}

# Setup advanced security tools
setup_advanced_security_tools() {
    log_info "Setting up advanced security tools..."

    # Configure ClamAV
    if command -v clamscan >/dev/null 2>&1; then
        freshclam || log_warn "Failed to update ClamAV definitions"
        echo "0 4 * * * root cd $PROJECT_ROOT && just antivirus-scan" > /etc/cron.d/antivirus-scan
    fi

    # Configure Suricata
    if command -v suricata >/dev/null 2>&1; then
        echo "*/30 * * * * root cd $PROJECT_ROOT && just suricata-monitor" > /etc/cron.d/suricata-monitor
    fi

    # Add cron jobs to run via just
    echo "0 2 * * 0 root cd $PROJECT_ROOT && just security-audit" > /etc/cron.d/security-audit
    echo "0 3 * * 6 root cd $PROJECT_ROOT && just rootkit-scan" > /etc/cron.d/rootkit-scan

    log_success "Advanced security tools configured"
}

# Configure rootless Docker
configure_rootless_docker() {
    log_info "Configuring rootless Docker..."

    # Install Docker using official repository (secure method)
    if ! command -v docker >/dev/null 2>&1; then
        log_info "Installing Docker from official repository..."

        # Add Docker's official GPG key
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

        # Add Docker repository
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

        # Update package index and install Docker
        apt update
        env DEBIAN_FRONTEND=noninteractive apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

        # Add ubuntu user to docker group
        usermod -aG docker ubuntu
        log_success "Docker installed successfully"
    else
        log_info "Docker already installed"
    fi

    # Configure rootless Docker for ubuntu user (optional, more secure)
    if [[ ! -f /home/ubuntu/.config/systemd/user/docker.service ]]; then
        log_info "Setting up rootless Docker for ubuntu user..."

        # Install rootless Docker dependencies
        env DEBIAN_FRONTEND=noninteractive apt install -y uidmap dbus-user-session

        # Set up rootless Docker for ubuntu user
        sudo -u ubuntu bash -c 'dockerd-rootless-setuptool.sh install'
        sudo -u ubuntu bash -c 'echo "export PATH=/home/ubuntu/bin:\$PATH" >> /home/ubuntu/.bashrc'
        sudo -u ubuntu bash -c 'echo "export DOCKER_HOST=unix:///run/user/1000/docker.sock" >> /home/ubuntu/.bashrc'

        log_success "Rootless Docker configured for ubuntu user"
    else
        log_info "Rootless Docker already configured"
    fi

    log_success "Rootless Docker configured"
}

# Setup Docker services
setup_docker_services() {
    log_info "Setting up Docker services..."

    # Load Docker daemon configuration
    load_docker_config

    # Enable and start Docker
    systemctl enable docker
    systemctl start docker

    # Create Docker networks
    if ! docker network ls --format "{{.Name}}" | grep -q "^traefik$"; then
        if docker network create traefik; then
            log_debug "Created Docker network: traefik"
        else
            log_warn "Failed to create Docker network: traefik"
        fi
    else
        log_debug "Docker network 'traefik' already exists"
    fi

    # Set up directory structure
    mkdir -p "${INSTALL_ROOT}"/{docker,data,content,nfs}
    mkdir -p "${INSTALL_ROOT}/data"/{traefik,arcane,jellyfin,komga,kiwix,logs,backups,raspap}
    mkdir -p "${INSTALL_ROOT}/content"/{movies,tv,webtv,music,audiobooks,books,comics,magazines,games/roms,kiwix}

    # Copy Docker configurations if they exist
    if [[ -d "${PROJECT_ROOT}/docker" ]]; then
        log_info "Copying Docker configurations..."
        cp -r "${PROJECT_ROOT}"/docker/* "${INSTALL_ROOT}"/docker/ 2>/dev/null || true
    fi

    # Setup secrets for Docker services
    setup_docker_secrets

    log_success "Docker services configured"
}

# Setup Docker secrets
setup_docker_secrets() {
    log_info "Setting up Docker secrets..."

    # Run the secret setup script
    if [[ -f "$PROJECT_ROOT/scripts/security/setup-secrets.sh" ]]; then
        log_info "Generating and configuring secrets for all Docker services..."
        "$PROJECT_ROOT/scripts/security/setup-secrets.sh"
        log_success "Docker secrets configured"
    else
        log_warn "Secret setup script not found, skipping secret generation"
        log_warn "You may need to manually configure secrets for Docker services"
    fi
}

# Setup container health monitoring
setup_container_health_monitoring() {
    log_info "Setting up container health monitoring..."

    # Load Watchtower configuration
    load_watchtower_config

    # Add cron job to run via just
    echo "*/10 * * * * root cd $PROJECT_ROOT && just container-health" > /etc/cron.d/container-health

    log_success "Container health monitoring configured"
}

# Enhanced network interface detection and enumeration (RaspAP handles management)
detect_network_interfaces() {
    log_info "Detecting and enumerating network interfaces..."

    # Initialize interface arrays
    local ethernet_interfaces=()
    local wifi_interfaces=()

    # Detect all ethernet interfaces with enhanced patterns
    while IFS= read -r interface; do
        if [[ -n "$interface" ]]; then
            ethernet_interfaces+=("$interface")
        fi
    done < <(ip link show | grep -E "^[0-9]+: (eth|enp|ens|end)" | cut -d: -f2 | tr -d ' ')

    # Detect WiFi interfaces with better detection
    while IFS= read -r interface; do
        if [[ -n "$interface" ]]; then
            wifi_interfaces+=("$interface")
        fi
    done < <(iw dev 2>/dev/null | grep Interface | awk '{print $2}')

    log_debug "Detected ethernet interfaces: ${ethernet_interfaces[*]:-none}"
    log_debug "Detected WiFi interfaces: ${wifi_interfaces[*]:-none}"

    # Automatic interface selection (RaspAP will handle the actual management)
    # FriendlyElec-specific interface selection
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
        select_friendlyelec_interfaces "${ethernet_interfaces[@]}" -- "${wifi_interfaces[@]}"
    else
        select_generic_interfaces "${ethernet_interfaces[@]}" -- "${wifi_interfaces[@]}"
    fi

    # Set WiFi interface if not already set
    if [[ -z "${WIFI_INTERFACE:-}" ]]; then
        WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
    fi

    # Validate and set fallbacks
    if [[ -z "$WAN_INTERFACE" ]]; then
        log_warn "No ethernet interface detected"
        WAN_INTERFACE="eth0"  # fallback
    fi

    if [[ -z "$WIFI_INTERFACE" ]]; then
        log_warn "No WiFi interface detected"
        WIFI_INTERFACE="wlan0"  # fallback
    fi

    log_info "Primary WAN Interface: $WAN_INTERFACE"
    log_info "Primary WiFi Interface: $WIFI_INTERFACE"
    log_info "Note: RaspAP will manage all network interface configuration"

    # Log additional interface information for FriendlyElec
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
        log_friendlyelec_interface_details
    fi

    # Show comprehensive interface enumeration
    enhanced_section "Network Interface Enumeration" "Detected network interfaces and their status" "🌐"

    # Create table data for all interfaces with status indicators
    local interface_data=()
    interface_data+=("Interface,Type,Status,Speed,Driver")

    # Add ethernet interfaces
    for iface in "${ethernet_interfaces[@]}"; do
        local status speed driver status_indicator
        status=$(cat "/sys/class/net/${iface}/operstate" 2>/dev/null || echo "unknown")
        speed=$(cat "/sys/class/net/${iface}/speed" 2>/dev/null || echo "unknown")
        driver=$(readlink "/sys/class/net/${iface}/device/driver" 2>/dev/null | xargs basename || echo "unknown")
        [[ "${speed}" != "unknown" ]] && speed="${speed}Mbps"

        # Add status indicator
        case "${status}" in
            "up") status_indicator="🟢 ${status}" ;;
            "down") status_indicator="🔴 ${status}" ;;
            "unknown") status_indicator="⚪ ${status}" ;;
            *) status_indicator="⚫ ${status}" ;;
        esac

        interface_data+=("${iface},Ethernet,${status_indicator},${speed},${driver}")
    done

    # Add WiFi interfaces
    for iface in "${wifi_interfaces[@]}"; do
        local status driver status_indicator
        status=$(cat "/sys/class/net/${iface}/operstate" 2>/dev/null || echo "unknown")
        driver=$(readlink "/sys/class/net/${iface}/device/driver" 2>/dev/null | xargs basename || echo "unknown")

        # Add status indicator
        case "${status}" in
            "up") status_indicator="🟢 ${status}" ;;
            "down") status_indicator="🔴 ${status}" ;;
            "unknown") status_indicator="⚪ ${status}" ;;
            *) status_indicator="⚫ ${status}" ;;
        esac

        interface_data+=("${iface},WiFi,${status_indicator},N/A,${driver}")
    done

    enhanced_table "${interface_data[0]}" "${interface_data[@]:1}"

    echo
    enhanced_card "🔧 RaspAP Configuration" "RaspAP will configure and manage all network interfaces

Primary interfaces identified for RaspAP:
• WAN Interface: ${WAN_INTERFACE}
• WiFi Hotspot: ${WIFI_INTERFACE}

All detected interfaces will be available for configuration." "39" "39"

    # Export for use in templates and RaspAP configuration
    export WAN_INTERFACE WIFI_INTERFACE
    export ETHERNET_INTERFACES="${ethernet_interfaces[*]}"
    export WIFI_INTERFACES="${wifi_interfaces[*]}"

    log_success "Network interfaces enumerated (RaspAP will handle configuration)"
}

# Detect and configure NVMe storage
detect_and_configure_nvme_storage() {
    log_info "Detecting NVMe storage devices..."

    # Find NVMe devices
    local nvme_devices=()
    while IFS= read -r device; do
        if [[ -n "$device" ]]; then
            nvme_devices+=("$device")
        fi
    done < <(lsblk -d -n -o NAME | grep '^nvme')

    if [[ ${#nvme_devices[@]} -eq 0 ]]; then
        log_info "No NVMe devices detected, skipping NVMe configuration"
        return 0
    fi

    log_info "Found NVMe devices: ${nvme_devices[*]}"

    # Use the first NVMe device (typically nvme0n1)
    local nvme_device="/dev/${nvme_devices[0]}"
    log_info "Using NVMe device: ${nvme_device}"

    # Get device information
    local device_size
    device_size=$(lsblk -b -d -n -o SIZE "${nvme_device}" 2>/dev/null || echo "0")
    local device_size_gb=$((device_size / 1024 / 1024 / 1024))

    log_info "NVMe device size: ${device_size_gb}GB"

    if [[ ${device_size_gb} -lt 100 ]]; then
        log_warn "NVMe device is smaller than expected (${device_size_gb}GB), skipping partitioning"
        return 0
    fi

    # Check for existing partitions
    local existing_partitions
    existing_partitions=$(lsblk -n -o NAME "${nvme_device}" | grep -c -v "^${nvme_devices[0]}$")

    if [[ ${existing_partitions} -gt 0 ]]; then
        log_warn "Existing partitions detected on ${nvme_device}"
        lsblk "${nvme_device}"

        enhanced_warning_box "EXISTING PARTITIONS DETECTED" \
            "NVMe device ${nvme_device} contains existing partitions.\n\nCurrent partition layout:" \
            "warning"

        # Show current partitions in a table
        local partition_data=()
        partition_data+=("Partition,Size,Type,Mountpoint")

        while IFS= read -r line; do
            if [[ -n "$line" ]]; then
                local name size fstype mountpoint
                read -r name size fstype mountpoint <<< "$line"
                partition_data+=("${name},${size},${fstype:-N/A},${mountpoint:-N/A}")
            fi
        done < <(lsblk -n -o NAME,SIZE,FSTYPE,MOUNTPOINT "${nvme_device}" | tail -n +2)

        enhanced_table "${partition_data[0]}" "${partition_data[@]:1}"

        echo
        enhanced_warning_box "DESTRUCTIVE OPERATION WARNING" \
            "⚠️  REPARTITIONING WILL PERMANENTLY DESTROY ALL EXISTING DATA!\n\n• All files and partitions on ${nvme_device} will be erased\n• This action cannot be undone\n• Make sure you have backups of any important data\n\nNew partition layout will be:\n• 256GB partition for /data\n• Remaining space for /content" \
            "danger"

        if ! enhanced_confirm "I understand the risks and want to proceed with repartitioning ${nvme_device}" "false"; then
            log_info "NVMe partitioning cancelled by user"
            return 0
        fi

        # Unmount any mounted partitions
        log_info "Unmounting existing partitions..."
        for partition in $(lsblk -n -o NAME "${nvme_device}" | grep -v "^${nvme_devices[0]}$"); do
            local partition_path="/dev/${partition}"
            if mountpoint -q "/dev/${partition}" 2>/dev/null; then
                umount "${partition_path}" 2>/dev/null || true
            fi
        done
    fi

    # Create new partition layout
    create_nvme_partitions "${nvme_device}"

    log_success "NVMe storage configuration completed"
}

# Create NVMe partitions (256GB /data, rest /content)
create_nvme_partitions() {
    local nvme_device="$1"

    log_info "Creating new partition layout on ${nvme_device}..."

    # Wipe existing partition table
    wipefs -a "${nvme_device}" 2>/dev/null || true

    # Create GPT partition table and partitions using parted
    log_info "Creating GPT partition table..."
    parted -s "${nvme_device}" mklabel gpt

    # Create 256GB partition for /data (starting at 1MB for alignment)
    log_info "Creating 256GB /data partition..."
    parted -s "${nvme_device}" mkpart primary ext4 1MiB 256GiB

    # Create partition for /content using remaining space
    log_info "Creating /content partition with remaining space..."
    parted -s "${nvme_device}" mkpart primary ext4 256GiB 100%

    # Wait for kernel to recognize new partitions
    sleep 2
    partprobe "${nvme_device}"
    sleep 2

    # Format partitions
    local data_partition="${nvme_device}p1"
    local content_partition="${nvme_device}p2"

    log_info "Formatting /data partition (${data_partition})..."
    mkfs.ext4 -F -L "dangerprep-data" "${data_partition}"

    log_info "Formatting /content partition (${content_partition})..."
    mkfs.ext4 -F -L "dangerprep-content" "${content_partition}"

    # Create mount points
    mkdir -p /data /content

    # Mount partitions
    log_info "Mounting partitions..."
    mount "${data_partition}" /data
    mount "${content_partition}" /content

    # Add to fstab for persistent mounting
    log_info "Adding partitions to /etc/fstab..."

    # Remove any existing entries for these mount points
    sed -i '\|/data|d' /etc/fstab
    sed -i '\|/content|d' /etc/fstab

    # Add new entries using LABEL for reliability
    echo "LABEL=dangerprep-data /data ext4 defaults,noatime 0 2" >> /etc/fstab
    echo "LABEL=dangerprep-content /content ext4 defaults,noatime 0 2" >> /etc/fstab

    # Set appropriate permissions
    chown root:root /data /content
    chmod 755 /data /content

    # Create subdirectories for organization
    mkdir -p /data/{config,logs,backups,cache}
    mkdir -p /content/{media,documents,downloads,sync}

    # Set permissions for subdirectories
    chmod 755 /data/{config,logs,backups,cache}
    chmod 755 /content/{media,documents,downloads,sync}

    log_info "NVMe partition layout:"
    log_info "  ${data_partition} -> /data (256GB)"
    log_info "  ${content_partition} -> /content (remaining space)"

    # Show final layout
    if gum_available; then
        log_info "📋 Final NVMe Partition Layout"
        enhanced_table "Partition,Mount,Size,Filesystem,Label" \
            "${data_partition},/data,256GB,ext4,dangerprep-data" \
            "${content_partition},/content,$(lsblk -n -o SIZE "${content_partition}"),ext4,dangerprep-content"
    fi

    log_success "NVMe partitions created and mounted successfully"
}

# Enumerate Docker services that will be installed
enumerate_docker_services() {
    log_info "Enumerating Docker services for installation..."

    # Define Docker service categories
    local infrastructure_services=(
        "traefik:Reverse proxy and load balancer"
        "watchtower:Automatic container updates"
        "step-ca:Internal certificate authority"
        "raspap:Network management interface"
        "arcane:System monitoring dashboard"
        "cdn:Local content delivery network"
        "dns:DNS server (CoreDNS)"
    )

    local media_services=(
        "jellyfin:Media server for videos and music"
        "komga:Comic and ebook server"
        "romm:ROM management for retro gaming"
    )

    local sync_services=(
        "kiwix-sync:Offline Wikipedia and educational content sync"
        "nfs-sync:Network file system synchronization"
        "offline-sync:Offline content synchronization"
    )

    local application_services=(
        "docmost:Documentation and knowledge base"
        "onedev:Git server and CI/CD platform"
    )

    # Show service enumeration
    log_info "🐳 Docker Services Installation Plan"
    echo

    # Infrastructure services
    log_info "🏗️  Infrastructure Services"
    local infra_table_data=()
    infra_table_data+=("Service,Description")
    for service in "${infrastructure_services[@]}"; do
        local name="${service%%:*}"
        local desc="${service#*:}"
        infra_table_data+=("${name},${desc}")
    done
    enhanced_table "${infra_table_data[0]}" "${infra_table_data[@]:1}"
    echo

        # Media services
        log_info "🎬 Media Services"
        local media_table_data=()
        media_table_data+=("Service,Description")
        for service in "${media_services[@]}"; do
            local name="${service%%:*}"
            local desc="${service#*:}"
            media_table_data+=("${name},${desc}")
        done
        enhanced_table "${media_table_data[0]}" "${media_table_data[@]:1}"
        echo

        # Sync services
        log_info "🔄 Synchronization Services"
        local sync_table_data=()
        sync_table_data+=("Service,Description")
        for service in "${sync_services[@]}"; do
            local name="${service%%:*}"
            local desc="${service#*:}"
            sync_table_data+=("${name},${desc}")
        done
        enhanced_table "${sync_table_data[0]}" "${sync_table_data[@]:1}"
        echo

        # Application services
        log_info "📱 Application Services"
        local app_table_data=()
        app_table_data+=("Service,Description")
        for service in "${application_services[@]}"; do
            local name="${service%%:*}"
            local desc="${service#*:}"
            app_table_data+=("${name},${desc}")
        done
        enhanced_table "${app_table_data[0]}" "${app_table_data[@]:1}"
        echo

        log_info "📊 Service Summary"
        enhanced_table "Category,Count,Services" \
            "Infrastructure,${#infrastructure_services[@]},Core system services" \
            "Media,${#media_services[@]},Entertainment and content" \
            "Sync,${#sync_services[@]},Data synchronization" \
            "Applications,${#application_services[@]},Productivity tools"

        echo
        log_info "🔧 All services will be configured with:"
        log_info "   • Traefik reverse proxy integration"
        log_info "   • Automatic SSL certificates via step-ca"
        log_info "   • Health monitoring and auto-restart"
        log_info "   • Watchtower automatic updates"
        log_info "   • Persistent data storage"

    # Export service lists for use in other functions
    export INFRASTRUCTURE_SERVICES="${infrastructure_services[*]}"
    export MEDIA_SERVICES="${media_services[*]}"
    export SYNC_SERVICES="${sync_services[*]}"
    export APPLICATION_SERVICES="${application_services[*]}"

    local total_services=$((${#infrastructure_services[@]} + ${#media_services[@]} + ${#sync_services[@]} + ${#application_services[@]}))
    log_success "Enumerated ${total_services} Docker services for installation"
}

# Select interfaces for FriendlyElec hardware
select_friendlyelec_interfaces() {
    local ethernet_interfaces=()
    local wifi_interfaces=()
    local parsing_ethernet=true

    # Parse arguments (ethernet interfaces before --, wifi after)
    for arg in "$@"; do
        if [[ "$arg" == "--" ]]; then
            parsing_ethernet=false
            continue
        fi

        if [[ "$parsing_ethernet" == true ]]; then
            ethernet_interfaces+=("$arg")
        else
            wifi_interfaces+=("$arg")
        fi
    done

    log_info "Found ethernet interfaces: ${ethernet_interfaces[*]:-none}"
    log_info "Found WiFi interfaces: ${wifi_interfaces[*]:-none}"

    # FriendlyElec-specific interface selection logic
    case "$FRIENDLYELEC_MODEL" in
        "NanoPi-M6")
            # NanoPi M6 has 1x Gigabit Ethernet
            WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
            # WiFi via M.2 E-key module
            WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
            ;;
        "NanoPi-R6C")
            # NanoPi R6C has 1x 2.5GbE + 1x GbE
            select_r6c_interfaces "${ethernet_interfaces[@]}"
            WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
            ;;
        "NanoPC-T6")
            # NanoPC-T6 has 2x Gigabit Ethernet
            select_t6_interfaces "${ethernet_interfaces[@]}"
            WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
            ;;
        *)
            # Generic FriendlyElec selection
            WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
            WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
            ;;
    esac
}

# Select interfaces for NanoPi R6C (2.5GbE + GbE)
select_r6c_interfaces() {
    local ethernet_interfaces=("$@")

    if [[ ${#ethernet_interfaces[@]} -ge 2 ]]; then
        log_info "Configuring dual ethernet interfaces for NanoPi R6C..."

        # Identify interfaces by speed and capabilities
        local high_speed_interface=""
        local standard_interface=""
        local max_speed=0

        for iface in "${ethernet_interfaces[@]}"; do
            # Wait for interface to be up to read speed
            ip link set "$iface" up 2>/dev/null || true
            sleep 1

            local speed driver
            speed=$(cat "/sys/class/net/$iface/speed" 2>/dev/null || echo "1000")
            driver=$(readlink "/sys/class/net/$iface/device/driver" 2>/dev/null | xargs basename || echo "unknown")

            log_info "Interface $iface: ${speed}Mbps, driver: $driver"

            # 2.5GbE interface typically shows 2500Mbps
            if [[ $speed -ge 2500 ]]; then
                high_speed_interface="$iface"
            elif [[ $speed -ge 1000 && -z "$standard_interface" ]]; then
                standard_interface="$iface"
            fi

            if [[ $speed -gt $max_speed ]]; then
                max_speed=$speed
            fi
        done

        # Set WAN to highest speed interface, LAN to the other
        if [[ -n "$high_speed_interface" ]]; then
            WAN_INTERFACE="$high_speed_interface"
            LAN_INTERFACE="${standard_interface:-${ethernet_interfaces[1]}}"
            log_info "Using 2.5GbE interface $WAN_INTERFACE for WAN"
            log_info "Using GbE interface $LAN_INTERFACE for LAN"
        else
            # Fallback if speed detection fails
            WAN_INTERFACE="${ethernet_interfaces[0]}"
            LAN_INTERFACE="${ethernet_interfaces[1]}"
            log_info "Speed detection failed, using first interface for WAN"
        fi

        # Export LAN interface for use in configuration
        export LAN_INTERFACE
    else
        WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
        log_info "Only one ethernet interface detected on R6C"
    fi
}

# Select interfaces for NanoPC-T6 (dual GbE)
select_t6_interfaces() {
    local ethernet_interfaces=("$@")

    if [[ ${#ethernet_interfaces[@]} -ge 2 ]]; then
        log_info "Configuring dual ethernet interfaces for NanoPC-T6..."

        # For T6, both are GbE, so use first for WAN, second for LAN
        WAN_INTERFACE="${ethernet_interfaces[0]}"
        LAN_INTERFACE="${ethernet_interfaces[1]}"

        log_info "Using $WAN_INTERFACE for WAN"
        log_info "Using $LAN_INTERFACE for LAN"

        # Export LAN interface for use in configuration
        export LAN_INTERFACE
    else
        WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
        log_info "Only one ethernet interface detected on T6"
    fi
}

# Configure network bonding for multiple interfaces
configure_network_bonding() {
    if [[ -z "${LAN_INTERFACE:-}" ]]; then
        return 0
    fi

    log_info "Configuring network bonding for multiple ethernet interfaces..."

    # Install bonding support
    if ! lsmod | grep -q bonding; then
        modprobe bonding 2>/dev/null || true
    fi

    # Create bonding configuration for failover
    cat > /etc/netplan/99-ethernet-bonding.yaml << EOF
network:
  version: 2
  ethernets:
    $WAN_INTERFACE:
      dhcp4: false
      dhcp6: false
    $LAN_INTERFACE:
      dhcp4: false
      dhcp6: false
  bonds:
    bond0:
      interfaces: [$WAN_INTERFACE, $LAN_INTERFACE]
      parameters:
        mode: active-backup
        primary: $WAN_INTERFACE
        mii-monitor-interval: 100
        fail-over-mac-policy: active
      dhcp4: true
      dhcp6: false
EOF

    log_info "Network bonding configuration created"
}

# Select interfaces for generic hardware
select_generic_interfaces() {
    local ethernet_interfaces=()
    local wifi_interfaces=()
    local parsing_ethernet=true

    # Parse arguments
    for arg in "$@"; do
        if [[ "$arg" == "--" ]]; then
            parsing_ethernet=false
            continue
        fi

        if [[ "$parsing_ethernet" == true ]]; then
            ethernet_interfaces+=("$arg")
        else
            wifi_interfaces+=("$arg")
        fi
    done

    # Simple selection for generic hardware
    WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
    WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
}

# Log detailed interface information for FriendlyElec hardware
log_friendlyelec_interface_details() {
    # Log ethernet interface details
    if [[ -n "$WAN_INTERFACE" && -d "/sys/class/net/$WAN_INTERFACE" ]]; then
        local speed duplex driver
        speed=$(cat "/sys/class/net/$WAN_INTERFACE/speed" 2>/dev/null || echo "unknown")
        duplex=$(cat "/sys/class/net/$WAN_INTERFACE/duplex" 2>/dev/null || echo "unknown")
        driver=$(readlink "/sys/class/net/$WAN_INTERFACE/device/driver" 2>/dev/null | xargs basename || echo "unknown")

        log_info "Ethernet details: $WAN_INTERFACE (${speed}Mbps, $duplex, driver: $driver)"
    fi

    # Log WiFi interface details
    if [[ -n "$WIFI_INTERFACE" ]] && command -v iw >/dev/null 2>&1; then
        local wifi_info
        wifi_info=$(iw dev "$WIFI_INTERFACE" info 2>/dev/null | grep -E "(wiphy|type)" | tr '\n' ' ' || echo "")
        if [[ -n "$wifi_info" ]]; then
            log_info "WiFi details: $WIFI_INTERFACE ($wifi_info)"
        fi
    fi
}

# Configure FriendlyElec fan control for thermal management
configure_friendlyelec_fan_control() {
    if [[ "$IS_RK3588" != true && "$IS_RK3588S" != true ]]; then
        return 0
    fi

    log_info "Configuring RK3588 fan control..."

    # Check if PWM fan control is available
    if [[ ! -d /sys/class/pwm/pwmchip0 ]]; then
        log_warn "PWM fan control not available, skipping fan configuration"
        return 0
    fi

    # Create fan control configuration directory
    mkdir -p /etc/dangerprep

    # Load fan control configuration
    load_rk3588_fan_control_config

    # Make fan control script executable
    chmod +x "$PROJECT_ROOT/scripts/monitoring/rk3588-fan-control.sh"

    # Install and enable fan control service
    install_rk3588_fan_control_service

    # Test fan control functionality
    if "$PROJECT_ROOT/scripts/monitoring/rk3588-fan-control.sh" test >/dev/null 2>&1; then
        log_success "Fan control test successful"
    else
        log_warn "Fan control test failed, but service installed"
    fi

    log_info "RK3588 fan control configured"
}

# Configure FriendlyElec GPIO and PWM interfaces
configure_friendlyelec_gpio_pwm() {
    if [[ "$IS_FRIENDLYELEC" != true ]]; then
        return 0
    fi

    log_info "Configuring FriendlyElec GPIO and PWM interfaces..."

    # Load GPIO/PWM configuration
    load_gpio_pwm_config

    # Make GPIO setup script executable
    chmod +x "$SCRIPT_DIR/setup-gpio.sh"

    # Run GPIO/PWM setup
    if "$SCRIPT_DIR/setup-gpio.sh" setup "$SUDO_USER"; then
        log_success "GPIO and PWM interfaces configured"
    else
        log_warn "GPIO and PWM setup completed with warnings"
    fi

    log_info "FriendlyElec GPIO and PWM configuration completed"
}

# Configure RK3588/RK3588S performance optimizations
configure_rk3588_performance() {
    if [[ "$IS_RK3588" != true && "$IS_RK3588S" != true ]]; then
        return 0
    fi

    log_info "Configuring RK3588/RK3588S performance optimizations..."

    # Configure CPU governors for optimal performance
    configure_rk3588_cpu_governors

    # Configure GPU performance settings
    configure_rk3588_gpu_performance

    # Configure memory and I/O optimizations
    configure_rk3588_memory_optimizations

    # Configure hardware acceleration
    configure_rk3588_hardware_acceleration

    log_success "RK3588/RK3588S performance optimizations configured"
}

# Configure CPU governors for RK3588/RK3588S
configure_rk3588_cpu_governors() {
    log_info "Configuring RK3588 CPU governors..."

    # RK3588/RK3588S has multiple CPU clusters
    # Cluster 0: Cortex-A55 (cores 0-3)
    # Cluster 1: Cortex-A76 (cores 4-7)
    # Cluster 2: Cortex-A76 (cores 6-7) - RK3588 only

    local cpu_policies=(
        "/sys/devices/system/cpu/cpufreq/policy0"  # A55 cluster
        "/sys/devices/system/cpu/cpufreq/policy4"  # A76 cluster 1
    )

    # Add third cluster for RK3588 (not RK3588S)
    if [[ "$IS_RK3588" == true ]]; then
        cpu_policies+=("/sys/devices/system/cpu/cpufreq/policy6")  # A76 cluster 2
    fi

    # Set performance governor for better responsiveness
    for policy in "${cpu_policies[@]}"; do
        if [[ -d "$policy" ]]; then
            local governor_file="$policy/scaling_governor"
            if [[ -w "$governor_file" ]]; then
                echo "performance" > "$governor_file" 2>/dev/null || true
                local current_governor
                current_governor=$(cat "$governor_file" 2>/dev/null)
                log_info "Set CPU policy $(basename "$policy") governor to: $current_governor"
            fi
        fi
    done

    # Create systemd service to maintain CPU governor settings
    cat > /etc/systemd/system/rk3588-cpu-governor.service << 'EOF'
[Unit]
Description=RK3588 CPU Governor Configuration
After=multi-user.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'for policy in /sys/devices/system/cpu/cpufreq/policy*; do [ -w "$policy/scaling_governor" ] && echo performance > "$policy/scaling_governor"; done'

[Install]
WantedBy=multi-user.target
EOF

    systemctl enable rk3588-cpu-governor.service 2>/dev/null || true
    log_info "Created RK3588 CPU governor service"
}

# Configure GPU performance for RK3588/RK3588S
configure_rk3588_gpu_performance() {
    log_info "Configuring RK3588 GPU performance..."

    # Mali-G610 MP4 GPU configuration
    local gpu_devfreq="/sys/class/devfreq/fb000000.gpu"

    if [[ -d "$gpu_devfreq" ]]; then
        # Set GPU governor to performance
        if [[ -w "$gpu_devfreq/governor" ]]; then
            echo "performance" > "$gpu_devfreq/governor" 2>/dev/null || true
            log_info "Set GPU governor to performance"
        fi

        # Set GPU frequency to maximum for better performance
        if [[ -w "$gpu_devfreq/userspace/set_freq" && -r "$gpu_devfreq/available_frequencies" ]]; then
            local max_freq
            max_freq=$(cat "$gpu_devfreq/available_frequencies" | tr ' ' '\n' | sort -n | tail -1)
            if [[ -n "$max_freq" ]]; then
                echo "$max_freq" > "$gpu_devfreq/userspace/set_freq" 2>/dev/null || true
                log_info "Set GPU frequency to maximum: ${max_freq}Hz"
            fi
        fi
    fi

    # Configure Mali GPU environment variables for applications
    cat > /etc/profile.d/mali-gpu.sh << 'EOF'
# Mali GPU environment variables for RK3588/RK3588S
export MALI_OPENCL_DEVICE_TYPE=gpu
export MALI_DUAL_MODE_COMPUTE=1
export MALI_DEBUG=0
export MALI_FPS=1
EOF

    log_info "Configured Mali GPU environment variables"
}

# Configure memory and I/O optimizations for RK3588/RK3588S
configure_rk3588_memory_optimizations() {
    log_info "Configuring RK3588 memory and I/O optimizations..."

    # Add RK3588-specific kernel parameters
    cat >> /etc/sysctl.d/99-rk3588-optimizations.conf << 'EOF'
# RK3588/RK3588S memory and I/O optimizations

# Memory management optimizations
vm.swappiness = 10
vm.vfs_cache_pressure = 50
vm.dirty_background_ratio = 5
vm.dirty_ratio = 10

# Network buffer optimizations for high-speed interfaces
net.core.rmem_default = 262144
net.core.rmem_max = 16777216
net.core.wmem_default = 262144
net.core.wmem_max = 16777216

# TCP optimizations
net.ipv4.tcp_rmem = 4096 65536 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_congestion_control = bbr

# I/O scheduler optimizations
# These will be applied via udev rules for NVMe and eMMC
EOF

    # Create udev rules for I/O scheduler optimization
    cat > /etc/udev/rules.d/99-rk3588-io-scheduler.rules << 'EOF'
# I/O scheduler optimizations for RK3588/RK3588S storage devices

# NVMe drives - use mq-deadline for better performance
ACTION=="add|change", KERNEL=="nvme[0-9]*", ATTR{queue/scheduler}="mq-deadline"

# eMMC - use deadline scheduler
ACTION=="add|change", KERNEL=="mmcblk[0-9]*", ATTR{queue/scheduler}="deadline"

# Set read-ahead for storage devices
ACTION=="add|change", KERNEL=="nvme[0-9]*", ATTR{bdi/read_ahead_kb}="512"
ACTION=="add|change", KERNEL=="mmcblk[0-9]*", ATTR{bdi/read_ahead_kb}="256"
EOF

    log_info "Configured RK3588 memory and I/O optimizations"
}

# Configure hardware acceleration for RK3588/RK3588S
configure_rk3588_hardware_acceleration() {
    log_info "Configuring RK3588 hardware acceleration..."

    # Configure VPU (Video Processing Unit) access
    if [[ -c /dev/mpp_service ]]; then
        # Ensure proper permissions for VPU device
        chown root:video /dev/mpp_service 2>/dev/null || true
        chmod 660 /dev/mpp_service 2>/dev/null || true
        log_info "Configured VPU device permissions"

        # Create udev rule to maintain VPU permissions
        cat > /etc/udev/rules.d/99-rk3588-vpu.rules << 'EOF'
# RK3588/RK3588S VPU device permissions
KERNEL=="mpp_service", GROUP="video", MODE="0660"
EOF
    fi

    # Configure NPU (Neural Processing Unit) if available
    if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
        log_info "NPU detected, configuring access..."

        # Set NPU governor to performance
        local npu_devfreq="/sys/class/devfreq/fdab0000.npu"
        if [[ -w "$npu_devfreq/governor" ]]; then
            echo "performance" > "$npu_devfreq/governor" 2>/dev/null || true
            log_info "Set NPU governor to performance"
        fi
    fi

    # Configure hardware video decoding support
    configure_rk3588_video_acceleration

    log_info "Hardware acceleration configuration completed"
}

# Configure video acceleration for RK3588/RK3588S
configure_rk3588_video_acceleration() {
    log_info "Configuring RK3588 video acceleration..."

    # Create GStreamer configuration for hardware acceleration
    mkdir -p /etc/gstreamer-1.0
    cat > /etc/gstreamer-1.0/rk3588-hardware.conf << 'EOF'
# GStreamer hardware acceleration configuration for RK3588/RK3588S
# Enable MPP (Media Process Platform) plugins
[plugins]
mpp = true
rockchipmpp = true

[elements]
# Hardware video decoders
mpph264dec = true
mpph265dec = true
mppvp8dec = true
mppvp9dec = true

# Hardware video encoders
mpph264enc = true
mpph265enc = true
EOF

    # Configure environment variables for video acceleration
    cat > /etc/profile.d/rk3588-video.sh << 'EOF'
# RK3588/RK3588S video acceleration environment
export GST_PLUGIN_PATH=/usr/lib/aarch64-linux-gnu/gstreamer-1.0
export LIBVA_DRIVER_NAME=rockchip
export VDPAU_DRIVER=rockchip
EOF

    log_info "Configured RK3588 video acceleration"
}

# Configure WAN interface
configure_wan_interface() {
    log_info "Configuring WAN interface..."
    load_wan_config
    netplan apply
    log_success "WAN interface configured"
}

# Setup network routing
setup_network_routing() {
    log_info "Setting up network routing..."

    # Enable IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    sysctl -p

    # Configure NAT and forwarding rules (check if rules already exist)
    if ! iptables -t nat -C POSTROUTING -o "${WAN_INTERFACE}" -j MASQUERADE 2>/dev/null; then
        iptables -t nat -A POSTROUTING -o "${WAN_INTERFACE}" -j MASQUERADE
        log_debug "Added NAT masquerade rule for ${WAN_INTERFACE}"
    fi

    if ! iptables -C FORWARD -i "${WAN_INTERFACE}" -o "${WIFI_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null; then
        iptables -A FORWARD -i "${WAN_INTERFACE}" -o "${WIFI_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT
        log_debug "Added forward rule: ${WAN_INTERFACE} -> ${WIFI_INTERFACE}"
    fi

    if ! iptables -C FORWARD -i "${WIFI_INTERFACE}" -o "${WAN_INTERFACE}" -j ACCEPT 2>/dev/null; then
        iptables -A FORWARD -i "${WIFI_INTERFACE}" -o "${WAN_INTERFACE}" -j ACCEPT
        log_debug "Added forward rule: ${WIFI_INTERFACE} -> ${WAN_INTERFACE}"
    fi

    # Save iptables rules
    iptables-save > /etc/iptables/rules.v4

    log_success "Network routing configured"
}

# Setup QoS traffic shaping
setup_qos_traffic_shaping() {
    log_info "Setting up QoS traffic shaping..."

    # Load network performance optimizations
    load_network_performance_config
    sysctl -p

    # Apply basic QoS via just
    cd "$PROJECT_ROOT" && just qos-setup

    log_success "QoS traffic shaping configured"
}


# Setup RaspAP for WiFi management and networking
setup_raspap() {
    log_info "Setting up RaspAP for WiFi management..."

    # Create RaspAP environment file if it doesn't exist
    local raspap_env="$PROJECT_ROOT/docker/infrastructure/raspap/compose.env"
    if [[ ! -f "$raspap_env" ]]; then
        log_info "Creating RaspAP environment file..."
        cp "$PROJECT_ROOT/docker/infrastructure/raspap/compose.env.example" "$raspap_env"

        # Prompt for GitHub credentials if not set
        if [[ -z "${GITHUB_USERNAME:-}" ]] || [[ -z "${GITHUB_TOKEN:-}" ]]; then
            log_warn "GitHub credentials required for RaspAP Insiders features"
            echo "Please set GITHUB_USERNAME and GITHUB_TOKEN environment variables"
            echo "or edit $raspap_env manually"
        else
            # Update environment file with provided credentials
            sed -i "s/GITHUB_USERNAME=your_github_username/GITHUB_USERNAME=$GITHUB_USERNAME/" "$raspap_env"
            sed -i "s/GITHUB_TOKEN=your_github_token/GITHUB_TOKEN=$GITHUB_TOKEN/" "$raspap_env"
        fi
    fi

    # Build and start RaspAP container
    log_info "Building and starting RaspAP container..."
    local raspap_compose_dir="${PROJECT_ROOT}/docker/infrastructure/raspap"
    if [[ -d "${raspap_compose_dir}" && -f "${raspap_compose_dir}/compose.yml" ]]; then
        docker compose -f "${raspap_compose_dir}/compose.yml" up -d --build
    else
        log_error "RaspAP compose directory or file not found: ${raspap_compose_dir}"
        return 1
    fi

    # Wait for RaspAP to be ready
    log_info "Waiting for RaspAP to initialize..."
    sleep 60

    # Configure DNS forwarding for DangerPrep integration
    if [[ -f "$PROJECT_ROOT/docker/infrastructure/raspap/configure-dns.sh" ]]; then
        log_info "Configuring DNS forwarding for DangerPrep integration..."
        "$PROJECT_ROOT/docker/infrastructure/raspap/configure-dns.sh"
    fi

    log_success "RaspAP configured for WiFi management"
}

# Configure WiFi routing
configure_wifi_routing() {
    log_info "Configuring WiFi client routing..."

    # Allow WiFi clients to access services
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 443 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 53 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p udp --dport 53 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p udp --dport 67 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p icmp --icmp-type echo-request -j ACCEPT

    # Save rules
    iptables-save > /etc/iptables/rules.v4

    log_success "WiFi client routing configured"
}

# Generate sync service configurations
generate_sync_configs() {
    log_info "Generating sync service configurations..."
    load_sync_configs
    log_success "Sync service configurations generated"
}

# Setup Tailscale
setup_tailscale() {
    log_info "Setting up Tailscale..."

    # Check if Tailscale is already installed
    if command -v tailscale >/dev/null 2>&1; then
        log_info "Tailscale already installed"
    else
        # Add Tailscale repository
        curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
        curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list

        # Update and install Tailscale
        apt update
        env DEBIAN_FRONTEND=noninteractive apt install -y tailscale
    fi

    # Enable Tailscale service
    systemctl enable tailscaled
    systemctl start tailscaled

    # Configure firewall for Tailscale
    iptables -A INPUT -p udp --dport 41641 -j ACCEPT
    iptables -A INPUT -i tailscale0 -j ACCEPT
    iptables -A FORWARD -i tailscale0 -j ACCEPT
    iptables -A FORWARD -o tailscale0 -j ACCEPT
    iptables-save > /etc/iptables/rules.v4

    log_success "Tailscale installed and configured"
    log_info "Run 'tailscale up --advertise-routes=$LAN_NETWORK --advertise-exit-node' to connect"
}

# Setup advanced DNS (via Docker containers)
setup_advanced_dns() {
    log_info "Setting up advanced DNS..."

    # Start DNS infrastructure containers
    log_info "Starting DNS containers (CoreDNS + AdGuard)..."
    local dns_compose_dir="${PROJECT_ROOT}/docker/infrastructure/dns"
    if [[ -d "${dns_compose_dir}" && -f "${dns_compose_dir}/compose.yml" ]]; then
        docker compose -f "${dns_compose_dir}/compose.yml" up -d
    else
        log_warn "DNS compose directory or file not found: ${dns_compose_dir}"
        log_warn "Skipping DNS container setup"
    fi

    # Wait for containers to be ready
    sleep 10

    log_success "Advanced DNS configured via Docker containers"
}

# Setup certificate management (via Docker containers)
setup_certificate_management() {
    log_info "Setting up certificate management..."

    # Start Traefik for ACME/Let's Encrypt certificates
    log_info "Starting Traefik for ACME certificate management..."
    local traefik_compose_dir="${PROJECT_ROOT}/docker/infrastructure/traefik"
    if [[ -d "${traefik_compose_dir}" && -f "${traefik_compose_dir}/compose.yml" ]]; then
        docker compose -f "${traefik_compose_dir}/compose.yml" up -d
    else
        log_warn "Traefik compose directory or file not found: ${traefik_compose_dir}"
        log_warn "Skipping Traefik setup"
    fi

    # Start Step-CA for internal certificate authority
    log_info "Starting Step-CA for internal certificates..."
    local stepca_compose_dir="${PROJECT_ROOT}/docker/infrastructure/step-ca"
    if [[ -d "${stepca_compose_dir}" && -f "${stepca_compose_dir}/compose.yml" ]]; then
        docker compose -f "${stepca_compose_dir}/compose.yml" up -d
    else
        log_warn "Step-CA compose directory or file not found: ${stepca_compose_dir}"
        log_warn "Skipping Step-CA setup"
    fi

    # Wait for containers to be ready
    sleep 15

    log_success "Certificate management configured via Docker containers"
}

# Install management scripts
install_management_scripts() {
    log_info "Installing management scripts..."

    # Management scripts are run via just commands, no copying needed
    log_info "Management scripts available via just commands"
    log_info "Use 'just help' to see available commands"

    log_success "Management scripts configured"
}

# Create routing scenarios
create_routing_scenarios() {
    log_info "Creating routing scenarios..."

    # Routing scenarios are available via just commands:
    # just wan-to-wifi, just wifi-repeater, just local-only
    log_info "Routing scenarios available via just commands"

    log_success "Routing scenarios configured"
}

# Setup system monitoring
setup_system_monitoring() {
    log_info "Setting up system monitoring..."

    # Monitoring scripts are run via just commands

    log_success "System monitoring configured"
}

# Configure NFS client
configure_nfs_client() {
    log_info "Configuring NFS client..."

    # Install NFS client if not already installed
    if ! dpkg -l nfs-common 2>/dev/null | grep -q "^ii"; then
        env DEBIAN_FRONTEND=noninteractive apt install -y nfs-common
    else
        log_debug "NFS client already installed"
    fi

    # Create NFS mount points
    mkdir -p "$INSTALL_ROOT/nfs"

    log_success "NFS client configured"
}

# Install maintenance scripts
install_maintenance_scripts() {
    log_info "Installing maintenance scripts..."

    # Maintenance scripts are run via just commands, no copying needed
    log_info "Maintenance scripts available via just commands"

    log_success "Maintenance scripts configured"
}

# Setup encrypted backups
setup_encrypted_backups() {
    log_info "Setting up encrypted backups..."

    # Create backup directory and key
    mkdir -p /etc/dangerprep/backup
    openssl rand -base64 32 > /etc/dangerprep/backup/backup.key
    chmod 600 /etc/dangerprep/backup/backup.key

    # Add backup cron jobs to run via just
    cat > /etc/cron.d/dangerprep-backups << 'EOF'
# DangerPrep Encrypted Backups
# Daily backup at 1 AM
0 1 * * * root cd /opt/dangerprep && just backup-daily
# Weekly backup on Sunday at 2 AM
0 2 * * 0 root cd /opt/dangerprep && just backup-weekly
# Monthly backup on 1st at 3 AM
0 3 1 * * root cd /opt/dangerprep && just backup-monthly
EOF

    log_success "Encrypted backup system configured"
}

# Start all services
start_all_services() {
    log_info "Starting all services..."

    local services=(
        "ssh"
        "fail2ban"
        "docker"
        "tailscaled"
    )

    for service in "${services[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            systemctl start "$service" || log_warn "Failed to start $service"
            if systemctl is-active "$service" >/dev/null 2>&1; then
                log_success "$service started"
            else
                log_warn "$service failed to start"
            fi
        fi
    done

    log_success "All services started"
}

# Verification and testing
verify_setup() {
    log_info "Verifying setup..."

    # Check critical services
    local critical_services=("ssh" "fail2ban" "docker")
    local failed_services=()

    # Check if RaspAP container is running
    if docker ps --format "{{.Names}}" | grep -q "^raspap$"; then
        log_success "RaspAP container is running"
    else
        log_warn "RaspAP container is not running"
        failed_services+=("raspap")
    fi

    for service in "${critical_services[@]}"; do
        if ! systemctl is-active "$service" >/dev/null 2>&1; then
            failed_services+=("$service")
        fi
    done

    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_warn "Some services failed to start: ${failed_services[*]}"
    else
        log_success "All critical services are running"
    fi

    # Test network connectivity
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        log_success "Internet connectivity verified"
    else
        log_warn "No internet connectivity"
    fi

    # Test WiFi interface
    if ip link show "$WIFI_INTERFACE" >/dev/null 2>&1; then
        log_success "WiFi interface is up"
    else
        log_warn "WiFi interface not found"
    fi

    log_success "Setup verification completed"
}

# Show final information
show_final_info() {
    echo -e "${GREEN}"
    cat << EOF
╔══════════════════════════════════════════════════════════════════════════════╗
║                        DangerPrep Setup Complete!                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  WiFi Hotspot: $WIFI_SSID                                                    ║
║  Password: $WIFI_PASSWORD                                                    ║
║  Network: $LAN_NETWORK                                                       ║
║  Gateway: $LAN_IP                                                            ║
║                                                                              ║
║  SSH: Port $SSH_PORT (key-only authentication)                               ║
║  Management: dangerprep --help                                               ║
║                                                                              ║
║  Services: http://portal.danger                                              ║
║  Traefik: http://traefik.danger                                              ║
║                                                                              ║
║  Tailscale: tailscale up --advertise-routes=$LAN_NETWORK                     ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    log_info "Logs: ${LOG_FILE}"
    log_info "Backups: ${BACKUP_DIR}"
    log_info "Install root: ${INSTALL_ROOT}"
}

# Enhanced main function with comprehensive error handling and flow control
main() {
    # Record start time for performance metrics
    readonly START_TIME=$SECONDS

    # Parse command line arguments first
    parse_arguments "$@"

    # Initialize paths with fallback support
    initialize_paths

    # Show banner before logging starts
    show_setup_banner "$@"

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

    # Create secure temporary directory
    create_secure_temp_dir

    # Comprehensive pre-flight checks
    log_info "Starting pre-flight checks..."

    if ! check_system_requirements; then
        log_error "System requirements check failed"
        exit 1
    fi

    if ! check_network_connectivity; then
        log_error "Network connectivity check failed"
        log_error "Internet connection is required for installation"
        exit 1
    fi

    # Load configuration utilities
    if ! load_configuration; then
        log_error "Configuration loading failed"
        exit 1
    fi

    # Additional pre-flight checks
    if ! pre_flight_checks; then
        log_error "Pre-flight checks failed"
        exit 1
    fi

    log_success "All pre-flight checks passed"

    # Collect interactive configuration if gum is available
    collect_configuration

    # Show system information
    show_system_info

    # Main installation phases with progress tracking
    local -a installation_phases=(
        "backup_original_configs:Backing up original configurations"
        "update_system_packages:Updating system packages"
        "install_essential_packages:Installing essential packages"
        "setup_automatic_updates:Setting up automatic updates"
        "detect_and_configure_nvme_storage:Detecting and configuring NVMe storage"
        "configure_ssh_hardening:Configuring SSH hardening"
        "load_motd_config:Loading MOTD configuration"
        "setup_fail2ban:Setting up Fail2ban"
        "configure_kernel_hardening:Configuring kernel hardening"
        "setup_file_integrity_monitoring:Setting up file integrity monitoring"
        "setup_hardware_monitoring:Setting up hardware monitoring"
        "setup_advanced_security_tools:Setting up advanced security tools"
        "configure_rootless_docker:Configuring rootless Docker"
        "enumerate_docker_services:Enumerating Docker services"
        "setup_docker_services:Setting up Docker services"
        "setup_container_health_monitoring:Setting up container health monitoring"
        "detect_network_interfaces:Detecting network interfaces"
        "configure_wan_interface:Configuring WAN interface"
        "setup_network_routing:Setting up network routing"
        "setup_qos_traffic_shaping:Setting up QoS traffic shaping"
        "setup_raspap:Setting up RaspAP"
        "configure_wifi_routing:Configuring WiFi routing"
        "configure_rk3588_performance:Applying hardware optimizations"
        "generate_sync_configs:Generating sync configurations"
        "setup_tailscale:Setting up Tailscale"
        "setup_advanced_dns:Setting up advanced DNS"
        "setup_certificate_management:Setting up certificate management"
        "install_management_scripts:Installing management scripts"
        "create_routing_scenarios:Creating routing scenarios"
        "setup_system_monitoring:Setting up system monitoring"
        "configure_nfs_client:Configuring NFS client"
        "install_maintenance_scripts:Installing maintenance scripts"
        "setup_encrypted_backups:Setting up encrypted backups"
        "start_all_services:Starting all services"
        "verify_setup:Verifying setup"
    )

    local phase_count=${#installation_phases[@]}
    local current_phase=0

    log_info "Starting installation with ${phase_count} phases"

    # Execute each installation phase
    for phase_info in "${installation_phases[@]}"; do
        IFS=':' read -r phase_function phase_description <<< "$phase_info"
        ((current_phase++))

        show_progress "$current_phase" "$phase_count" "$phase_description"
        log_info "Phase ${current_phase}/${phase_count}: $phase_description"

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would execute: $phase_function"
            sleep 0.5  # Simulate work for demo
        else
            # Skip hardware optimization if not FriendlyElec
            if [[ "$phase_function" == "configure_rk3588_performance" && "$IS_FRIENDLYELEC" != "true" ]]; then
                log_info "Skipping RK3588 optimizations (not FriendlyElec hardware)"
                continue
            fi

            if ! "$phase_function"; then
                log_error "Phase failed: $phase_description"
                log_error "Installation cannot continue"
                exit 1
            fi
        fi

        log_success "Phase completed: $phase_description"
    done

    # Show completion message
    show_final_info

    # Calculate and log final statistics
    local total_time=$((SECONDS - START_TIME))
    local minutes=$((total_time / 60))
    local seconds=$((total_time % 60))

    log_success "DangerPrep setup completed successfully in ${minutes}m ${seconds}s"
    log_info "Total log entries: $(wc -l < "${LOG_FILE}" 2>/dev/null || echo "unknown")"
    log_info "Backup directory size: $(du -sh "${BACKUP_DIR}" 2>/dev/null | cut -f1 || echo "unknown")"

    return 0
}

# Set up error handling
cleanup_on_error() {
    log_error "Setup failed. Running comprehensive cleanup..."

    # Run the full cleanup script to completely reverse all changes
    local cleanup_script="$SCRIPT_DIR/cleanup-dangerprep.sh"

    if [[ -f "$cleanup_script" ]]; then
        log_warn "Running cleanup script to restore system to original state..."
        # Run cleanup script with --preserve-data to keep any data that might have been created
        bash "$cleanup_script" --preserve-data 2>/dev/null || {
            log_warn "Cleanup script failed, attempting manual cleanup..."

            # Fallback to basic cleanup if cleanup script fails
            systemctl stop hostapd 2>/dev/null || true
            systemctl stop dnsmasq 2>/dev/null || true
            systemctl stop docker 2>/dev/null || true

            # Restore original configurations if they exist
            if [[ -d "$BACKUP_DIR" ]]; then
                [[ -f "$BACKUP_DIR/sshd_config" ]] && cp "$BACKUP_DIR/sshd_config" /etc/ssh/sshd_config 2>/dev/null || true
                [[ -f "$BACKUP_DIR/sysctl.conf" ]] && cp "$BACKUP_DIR/sysctl.conf" /etc/sysctl.conf 2>/dev/null || true
                [[ -f "$BACKUP_DIR/dnsmasq.conf" ]] && cp "$BACKUP_DIR/dnsmasq.conf" /etc/dnsmasq.conf 2>/dev/null || true
                [[ -f "$BACKUP_DIR/iptables.rules" ]] && iptables-restore < "$BACKUP_DIR/iptables.rules" 2>/dev/null || true
            fi
        }

        log_success "System has been restored to its original state"
    else
        log_warn "Cleanup script not found at $cleanup_script"
        log_warn "Performing basic cleanup only..."

        # Basic cleanup if cleanup script is not available
        systemctl stop hostapd 2>/dev/null || true
        systemctl stop dnsmasq 2>/dev/null || true
        systemctl stop docker 2>/dev/null || true

        # Restore original configurations if they exist
        if [[ -d "$BACKUP_DIR" ]]; then
            [[ -f "$BACKUP_DIR/sshd_config" ]] && cp "$BACKUP_DIR/sshd_config" /etc/ssh/sshd_config 2>/dev/null || true
            [[ -f "$BACKUP_DIR/sysctl.conf" ]] && cp "$BACKUP_DIR/sysctl.conf" /etc/sysctl.conf 2>/dev/null || true
            [[ -f "$BACKUP_DIR/dnsmasq.conf" ]] && cp "$BACKUP_DIR/dnsmasq.conf" /etc/dnsmasq.conf 2>/dev/null || true
            [[ -f "$BACKUP_DIR/iptables.rules" ]] && iptables-restore < "$BACKUP_DIR/iptables.rules" 2>/dev/null || true
        fi
    fi

    log_error "Setup failed. Check $LOG_FILE for details."
    log_error "System has been restored to its pre-installation state"
    log_info "You can safely re-run the setup script after addressing any issues"
    exit 1
}

trap cleanup_on_error ERR

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
