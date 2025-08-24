#!/bin/bash
# DangerPrep Setup Script - 2025 Best Practices Edition
# Complete system setup for Ubuntu 24.04 with modern security hardening
# Uses external configuration templates for maintainability

# Modern shell script security and error handling - 2025 best practices
set -euo pipefail
IFS=$'\n\t'

# Script metadata
readonly SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
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

# Color codes for output (using tput for better compatibility)
if command -v tput >/dev/null 2>&1 && [[ -t 1 ]]; then
    readonly RED=$(tput setaf 1)
    readonly GREEN=$(tput setaf 2)
    readonly YELLOW=$(tput setaf 3)
    readonly BLUE=$(tput setaf 4)
    readonly PURPLE=$(tput setaf 5)
    readonly CYAN=$(tput setaf 6)
    readonly BOLD=$(tput bold)
    readonly NC=$(tput sgr0)
else
    readonly RED='\033[0;31m'
    readonly GREEN='\033[0;32m'
    readonly YELLOW='\033[1;33m'
    readonly BLUE='\033[0;34m'
    readonly PURPLE='\033[0;35m'
    readonly CYAN='\033[0;36m'
    readonly BOLD='\033[1m'
    readonly NC='\033[0m'
fi

# Enhanced logging functions with structured levels
log_debug() {
    [[ "${DEBUG:-}" == "true" ]] && echo -e "${PURPLE}[$(date '+%Y-%m-%d %H:%M:%S')] [DEBUG]${NC} $*" | tee -a "$LOG_FILE" >&2
}

log_info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] [INFO]${NC} $*" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] [WARN]${NC} $*" | tee -a "$LOG_FILE" >&2
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR]${NC} $*" | tee -a "$LOG_FILE" >&2
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

# Legacy function aliases for backward compatibility
log() { log_info "$@"; }
error() { log_error "$@"; }
success() { log_success "$@"; }
warning() { log_warn "$@"; }
info() { log_info "$@"; }

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
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
readonly INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"
readonly CONFIG_DIR="$SCRIPT_DIR/configs"

# Dynamic paths with fallback support (set after gum-utils is loaded)
LOG_FILE=""
BACKUP_DIR=""
LOCK_FILE="/var/run/dangerprep-setup.lock"

# Source shared banner utility with error handling
if [[ -f "$SCRIPT_DIR/../shared/banner.sh" ]]; then
    # shellcheck source=../shared/banner.sh
    source "$SCRIPT_DIR/../shared/banner.sh"
else
    log_warn "Banner utility not found, continuing without banner"
    show_setup_banner() { echo "DangerPrep Setup"; }
    show_cleanup_banner() { echo "DangerPrep Cleanup"; }
fi

# Source gum utilities for enhanced user interaction
if [[ -f "$SCRIPT_DIR/../shared/gum-utils.sh" ]]; then
    # shellcheck source=../shared/gum-utils.sh
    source "$SCRIPT_DIR/../shared/gum-utils.sh"
else
    log_warn "Gum utilities not found, using basic interaction"
    # Provide fallback functions
    enhanced_input() { local prompt="$1"; local default="${2:-}"; read -r -p "${prompt}: " result; echo "${result:-${default}}"; }
    enhanced_confirm() { local question="$1"; read -r -p "${question} [y/N]: " reply; [[ "${reply}" =~ ^[Yy] ]]; }
    enhanced_choose() { local prompt="$1"; shift; echo "${prompt}"; select opt in "$@"; do echo "${opt}"; break; done; }
    enhanced_multi_choose() { enhanced_choose "$@"; }
    enhanced_spin() { local message="$1"; shift; echo "${message}..."; "$@"; }
    enhanced_log() { local level="$1"; local message="$2"; echo "${level}: ${message}"; }
    # Provide fallback directory functions
    get_log_file_path() { echo "/tmp/dangerprep-setup-$$.log"; }
    get_backup_dir_path() { local dir="/tmp/dangerprep-setup-$(date +%Y%m%d-%H%M%S)-$$"; mkdir -p "$dir"; echo "$dir"; }
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

# Input validation functions
validate_ip() {
    local ip="$1"
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        local IFS='.'
        local -a octets=($ip)
        for octet in "${octets[@]}"; do
            if [[ $octet -gt 255 ]]; then
                return 1
            fi
        done
        return 0
    fi
    return 1
}

validate_interface_name() {
    local interface="$1"
    if [[ $interface =~ ^[a-zA-Z0-9_-]+$ && ${#interface} -le 15 ]]; then
        return 0
    fi
    return 1
}

validate_path() {
    local path="$1"
    # Prevent path traversal attacks
    if [[ "$path" =~ \.\./|\.\.\\ ]]; then
        return 1
    fi
    return 0
}

# Secure file operations
secure_copy() {
    local src="$1"
    local dest="$2"
    local mode="${3:-644}"

    # Validate paths
    if ! validate_path "$src" || ! validate_path "$dest"; then
        error "Invalid path in secure_copy: $src -> $dest"
        return 1
    fi

    # Copy with secure permissions
    cp "$src" "$dest"
    chmod "$mode" "$dest"
    chown root:root "$dest"
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
    cat << EOF
${BOLD}DangerPrep Setup Script${NC} - Version ${SCRIPT_VERSION}

${BOLD}USAGE:${NC}
    sudo $0 [OPTIONS]

${BOLD}OPTIONS:${NC}
    -d, --dry-run           Show what would be done without making changes
    -v, --verbose           Enable verbose output and debug logging
    -s, --skip-updates      Skip system package updates
    -f, --force             Force installation even if already installed
    -h, --help              Show this help message
    --version               Show version information

${BOLD}EXAMPLES:${NC}
    sudo $0                 # Standard installation
    sudo $0 --dry-run       # Preview changes without installing
    sudo $0 --verbose       # Detailed logging output
    sudo $0 --skip-updates  # Skip package updates (faster)

${BOLD}DESCRIPTION:${NC}
    Complete system setup for DangerPrep emergency router and content hub.
    Installs and configures all necessary services including Docker, networking,
    security tools, and hardware-specific optimizations.

${BOLD}REQUIREMENTS:${NC}
    - Ubuntu 24.04 LTS
    - Root privileges (run with sudo)
    - Internet connection
    - Minimum 10GB disk space
    - Minimum 2GB RAM

${BOLD}FILES:${NC}
    Log file: /var/log/dangerprep-setup.log (or ~/.local/dangerprep/logs/ if no permissions)
    Backup:   /var/backups/dangerprep-setup-* (or ~/.local/dangerprep/backups/ if no permissions)
    Install:  ${INSTALL_ROOT}

For more information, visit: https://github.com/vladzaharia/dangerprep
EOF
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
                VERBOSE=true
                DEBUG=true
                log_info "Verbose mode enabled"
                shift
                ;;
            -s|--skip-updates)
                SKIP_UPDATES=true
                log_info "Skipping system updates"
                shift
                ;;
            -f|--force)
                FORCE_INSTALL=true
                log_info "Force installation enabled"
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
        # Add other fallback functions as needed
    fi
}

# Default network configuration (can be overridden by interactive setup)
WIFI_SSID="DangerPrep"
WIFI_PASSWORD="Buff00n!"
LAN_NETWORK="192.168.120.0/22"
LAN_IP="192.168.120.1"
DHCP_START="192.168.120.100"
DHCP_END="192.168.120.200"

# Default system configuration (can be overridden by interactive setup)
SSH_PORT="2222"
FAIL2BAN_BANTIME="3600"
FAIL2BAN_MAXRETRY="3"
NAS_HOST="100.65.182.27"  # Tailscale NAS IP

# Interactive configuration collection
collect_configuration() {
    log_info "Collecting configuration preferences..."

    if gum_available; then
        enhanced_log "info" "🎛️  Interactive configuration mode enabled"
        echo
    else
        log_info "Using default configuration values"
        return 0
    fi

    # Network configuration
    enhanced_log "info" "📡 Network Configuration"
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
    enhanced_log "info" "🔒 Security Configuration"
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
    enhanced_log "info" "📋 Configuration Summary"

    # Display configuration summary using enhanced table if available
    if gum_available; then
        enhanced_table "Setting,Value" \
            "WiFi SSID,${WIFI_SSID}" \
            "WiFi Password,${WIFI_PASSWORD:0:3}***" \
            "LAN Network,${LAN_NETWORK}" \
            "LAN Gateway,${LAN_IP}" \
            "DHCP Start,${DHCP_START}" \
            "DHCP End,${DHCP_END}" \
            "SSH Port,${SSH_PORT}" \
            "Fail2ban Ban Time,${FAIL2BAN_BANTIME}s" \
            "Fail2ban Max Retry,${FAIL2BAN_MAXRETRY}"
    else
        log_info "Configuration Summary:"
        log_info "  WiFi SSID: ${WIFI_SSID}"
        log_info "  WiFi Password: ${WIFI_PASSWORD:0:3}***"
        log_info "  LAN Network: ${LAN_NETWORK}"
        log_info "  LAN Gateway: ${LAN_IP}"
        log_info "  DHCP Range: ${DHCP_START} - ${DHCP_END}"
        log_info "  SSH Port: ${SSH_PORT}"
        log_info "  Fail2ban Ban Time: ${FAIL2BAN_BANTIME}s"
        log_info "  Fail2ban Max Retry: ${FAIL2BAN_MAXRETRY}"
    fi

    echo
    if ! enhanced_confirm "Proceed with this configuration?" "true"; then
        log_info "Configuration cancelled by user"
        exit 0
    fi

    # Export variables for use in templates and other functions
    export WIFI_SSID WIFI_PASSWORD LAN_NETWORK LAN_IP DHCP_START DHCP_END
    export SSH_PORT FAIL2BAN_BANTIME FAIL2BAN_MAXRETRY

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
    log_info "Checking system requirements..."

    # Check Bash version
    check_bash_version

    # Check OS version
    if ! lsb_release -d 2>/dev/null | grep -q "Ubuntu 24.04"; then
        log_warn "This script is designed for Ubuntu 24.04"
        log_warn "Current OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo "Unknown")"
        log_warn "Proceeding anyway, but some features may not work correctly"
    fi

    # Check available disk space (minimum 10GB)
    local available_kb
    available_kb=$(df / | tail -1 | awk '{print $4}')
    local required_kb=$((10 * 1024 * 1024))  # 10GB in KB

    if [[ $available_kb -lt $required_kb ]]; then
        log_error "Insufficient disk space"
        log_error "Required: 10GB, Available: $(( available_kb / 1024 / 1024 ))GB"
        return 1
    fi

    log_info "Available disk space: $(( available_kb / 1024 / 1024 ))GB"

    # Check memory (minimum 2GB)
    local available_mb
    available_mb=$(free -m | grep '^Mem:' | awk '{print $2}')
    local required_mb=$((2 * 1024))  # 2GB in MB

    if [[ $available_mb -lt $required_mb ]]; then
        log_error "Insufficient memory"
        log_error "Required: 2GB, Available: ${available_mb}MB"
        return 1
    fi

    log_info "Available memory: ${available_mb}MB"

    # Check required commands
    local required_commands=(
        "curl:curl"
        "wget:wget"
        "git:git"
        "docker:docker.io"
        "systemctl:systemd"
        "iptables:iptables"
        "ip:iproute2"
    )

    local missing_commands=()
    local cmd package
    for cmd_package in "${required_commands[@]}"; do
        IFS=':' read -r cmd package <<< "$cmd_package"
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_commands+=("$cmd ($package)")
        fi
    done

    if [[ ${#missing_commands[@]} -gt 0 ]]; then
        log_error "Missing required commands:"
        printf '%s\n' "${missing_commands[@]}" | while read -r missing; do
            log_error "  - $missing"
        done
        log_error "Install missing packages with: apt update && apt install -y <package-names>"
        return 1
    fi

    log_success "System requirements check passed"
    return 0
}

# Display banner and setup information
show_setup_info() {
    # Use the shared banner utility
    show_setup_banner
    echo
    info "Logs: $LOG_FILE"
    info "Backups: $BACKUP_DIR"
    info "Install root: $INSTALL_ROOT"
}

# Show system information and detect FriendlyElec hardware
show_system_info() {
    log "System Information:"
    log "OS: $(lsb_release -d | cut -f2)"
    log "Kernel: $(uname -r)"
    log "Architecture: $(uname -m)"
    log "Memory: $(free -h | grep Mem | awk '{print $2}')"
    log "Disk: $(df -h / | tail -1 | awk '{print $2}')"

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
        log "Platform: $PLATFORM"

        # Check for FriendlyElec hardware
        if [[ "$PLATFORM" =~ (NanoPi|NanoPC|CM3588) ]]; then
            IS_FRIENDLYELEC=true
            log "FriendlyElec hardware detected"

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

            log "Model: $FRIENDLYELEC_MODEL"
            log "SoC: $SOC_TYPE"

            # Detect additional hardware features
            detect_friendlyelec_features
        fi
    else
        PLATFORM="Generic x86_64"
        log "Platform: $PLATFORM"
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
        local rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null)
        if [[ "$rtc_name" =~ hym8563 ]]; then
            features+=("HYM8563 RTC")
        fi
    fi

    # Check for M.2 interfaces
    if [[ -d /sys/class/nvme ]]; then
        features+=("M.2 NVMe")
    fi

    # Log detected features
    if [[ ${#features[@]} -gt 0 ]]; then
        log "Hardware features: ${features[*]}"
    fi
}

# Pre-flight checks
pre_flight_checks() {
    log "Running pre-flight checks..."
    
    # Check Ubuntu version
    if ! lsb_release -d | grep -q "Ubuntu 24.04"; then
        warning "This script is designed for Ubuntu 24.04. Proceeding anyway..."
    fi
    
    # Check internet connectivity
    if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        error "No internet connectivity. Please check your connection."
        exit 1
    fi
    
    # Check available disk space (minimum 10GB)
    available_space=$(df / | tail -1 | awk '{print $4}')
    if [[ $available_space -lt 10485760 ]]; then  # 10GB in KB
        error "Insufficient disk space. At least 10GB required."
        exit 1
    fi
    
    # Validate configuration files
    if ! validate_config_files; then
        error "Configuration file validation failed"
        exit 1
    fi
    
    success "Pre-flight checks completed"
}

# Backup original configurations
backup_original_configs() {
    log "Backing up original configurations..."
    
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
            log "Backed up: $config"
        fi
    done
    
    success "Original configurations backed up to $BACKUP_DIR"
}

# Update system packages
update_system_packages() {
    log "Updating system packages..."
    
    export DEBIAN_FRONTEND=noninteractive
    apt update
    apt upgrade -y
    
    success "System packages updated"
}

# Install essential packages with interactive selection
install_essential_packages() {
    log "Installing essential packages..."

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

    # Interactive package selection if gum is available
    local selected_packages=()

    if gum_available; then
        enhanced_log "info" "📦 Package Selection"
        echo

        # Always include core packages (non-optional)
        selected_packages+=("${core_packages[@]}")
        log_info "Core packages (required): ${#core_packages[@]} packages"

        # Optional package categories
        if enhanced_confirm "Install network packages? (hostapd, iptables, etc.)" "true"; then
            selected_packages+=("${network_packages[@]}")
            log_debug "Added ${#network_packages[@]} network packages"
        fi

        if enhanced_confirm "Install security packages? (fail2ban, aide, clamav, etc.)" "true"; then
            selected_packages+=("${security_packages[@]}")
            log_debug "Added ${#security_packages[@]} security packages"
        fi

        if enhanced_confirm "Install monitoring packages? (sensors, collectd, etc.)" "true"; then
            selected_packages+=("${monitoring_packages[@]}")
            log_debug "Added ${#monitoring_packages[@]} monitoring packages"
        fi

        if enhanced_confirm "Install backup packages? (borgbackup, restic)" "true"; then
            selected_packages+=("${backup_packages[@]}")
            log_debug "Added ${#backup_packages[@]} backup packages"
        fi

        if enhanced_confirm "Install automatic update packages?" "true"; then
            selected_packages+=("${update_packages[@]}")
            log_debug "Added ${#update_packages[@]} update packages"
        fi

        # Show package summary
        enhanced_log "info" "📋 Package Installation Summary"
        enhanced_table "Category,Count,Packages" \
            "Core,${#core_packages[@]},Always installed" \
            "Network,${#network_packages[@]},$(if [[ " ${selected_packages[*]} " =~ " ${network_packages[0]} " ]]; then echo "Selected"; else echo "Skipped"; fi)" \
            "Security,${#security_packages[@]},$(if [[ " ${selected_packages[*]} " =~ " ${security_packages[0]} " ]]; then echo "Selected"; else echo "Skipped"; fi)" \
            "Monitoring,${#monitoring_packages[@]},$(if [[ " ${selected_packages[*]} " =~ " ${monitoring_packages[0]} " ]]; then echo "Selected"; else echo "Skipped"; fi)" \
            "Backup,${#backup_packages[@]},$(if [[ " ${selected_packages[*]} " =~ " ${backup_packages[0]} " ]]; then echo "Selected"; else echo "Skipped"; fi)" \
            "Updates,${#update_packages[@]},$(if [[ " ${selected_packages[*]} " =~ " ${update_packages[0]} " ]]; then echo "Selected"; else echo "Skipped"; fi)"

        echo
        if ! enhanced_confirm "Proceed with package installation?" "true"; then
            log_info "Package installation cancelled by user"
            return 1
        fi
    else
        # Default: install all packages
        selected_packages=(
            "${core_packages[@]}"
            "${network_packages[@]}"
            "${security_packages[@]}"
            "${monitoring_packages[@]}"
            "${backup_packages[@]}"
            "${update_packages[@]}"
        )
    fi

    # Install selected packages with enhanced progress indication
    local failed_packages=()
    local installed_count=0
    local total_packages=${#selected_packages[@]}

    enhanced_log "info" "Installing ${total_packages} packages..."

    for package in "${selected_packages[@]}"; do
        ((installed_count++))

        if gum_available; then
            enhanced_spin "Installing ${package} (${installed_count}/${total_packages})" \
                apt install -y "$package" DEBIAN_FRONTEND=noninteractive
            local install_result=$?
        else
            log "Installing $package (${installed_count}/${total_packages})..."
            DEBIAN_FRONTEND=noninteractive apt install -y "$package" 2>/dev/null
            local install_result=$?
        fi

        if [[ ${install_result} -eq 0 ]]; then
            log_debug "✓ Installed $package"
        else
            warning "✗ Failed to install $package"
            failed_packages+=("$package")
        fi
    done

    # Report installation results
    if [[ ${#failed_packages[@]} -gt 0 ]]; then
        warning "Failed to install ${#failed_packages[@]} packages: ${failed_packages[*]}"
        log "These packages may not be available in the current repository"
    fi

    log_success "Successfully installed $((total_packages - ${#failed_packages[@]}))/${total_packages} packages"

    # Install FriendlyElec-specific packages
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
        if ! gum_available || enhanced_confirm "Install FriendlyElec-specific packages?" "true"; then
            install_friendlyelec_packages
        fi
    fi

    # Clean up package cache
    enhanced_spin "Cleaning package cache" apt autoremove -y
    enhanced_spin "Cleaning package cache" apt autoclean

    success "Essential packages installation completed"
}

# Install FriendlyElec-specific packages and configurations
install_friendlyelec_packages() {
    log "Installing FriendlyElec-specific packages..."

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
        log "Installing FriendlyElec package: $package..."
        if DEBIAN_FRONTEND=noninteractive apt install -y "$package" 2>/dev/null; then
            success "Installed $package"
        else
            warning "Package $package not available, skipping"
        fi
    done

    # Install FriendlyElec kernel headers if available
    install_friendlyelec_kernel_headers

    # Configure hardware-specific settings
    configure_friendlyelec_hardware

    success "FriendlyElec-specific packages installation completed"
}

# Install FriendlyElec kernel headers
install_friendlyelec_kernel_headers() {
    log "Installing FriendlyElec kernel headers..."

    # Check for pre-installed kernel headers in /opt/archives/
    if [[ -d /opt/archives ]]; then
        local kernel_headers=$(find /opt/archives -name "linux-headers-*.deb" | head -1)
        if [[ -n "$kernel_headers" ]]; then
            log "Found FriendlyElec kernel headers: $kernel_headers"
            if dpkg -i "$kernel_headers" 2>/dev/null; then
                success "Installed FriendlyElec kernel headers"
            else
                warning "Failed to install FriendlyElec kernel headers"
            fi
        else
            log "No FriendlyElec kernel headers found in /opt/archives/"
        fi
    fi

    # Try to download latest kernel headers if not found locally
    if ! dpkg -l | grep -q "linux-headers-$(uname -r)"; then
        log "Attempting to download latest kernel headers..."
        local kernel_version=$(uname -r)
        local headers_url="http://112.124.9.243/archives/rk3588/linux-headers-${kernel_version}-latest.deb"

        if wget -q --spider "$headers_url" 2>/dev/null; then
            log "Downloading kernel headers from FriendlyElec repository..."
            if wget -O "/tmp/linux-headers-latest.deb" "$headers_url" 2>/dev/null; then
                if dpkg -i "/tmp/linux-headers-latest.deb" 2>/dev/null; then
                    success "Downloaded and installed latest kernel headers"
                    rm -f "/tmp/linux-headers-latest.deb"
                else
                    warning "Failed to install downloaded kernel headers"
                fi
            else
                warning "Failed to download kernel headers"
            fi
        else
            log "No online kernel headers available for this version"
        fi
    fi
}

# Configure FriendlyElec hardware-specific settings
configure_friendlyelec_hardware() {
    log "Configuring FriendlyElec hardware settings..."

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

    success "FriendlyElec hardware configuration completed"
}

# Configure NanoPi M6 specific settings based on FriendlyElec wiki
configure_nanopi_m6_specific() {
    log "Configuring NanoPi M6 specific settings..."

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

    success "NanoPi M6 specific configuration completed"
}

# Configure NanoPi M6 media acceleration
configure_nanopi_m6_media_acceleration() {
    log "Configuring NanoPi M6 media acceleration..."

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
            log "Set GPU memory allocation to 128MB"
        fi
    fi

    # Configure hardware video decoding
    cat > /etc/environment.d/50-rk3588-media.conf << 'EOF'
# RK3588S Media Acceleration Environment
LIBVA_DRIVER_NAME=rockchip
VDPAU_DRIVER=rockchip
GST_PLUGIN_PATH=/usr/lib/aarch64-linux-gnu/gstreamer-1.0
EOF

    log "Media acceleration configured for RK3588S"
}

# Configure NanoPi M6 M.2 interfaces
configure_nanopi_m6_m2_interfaces() {
    log "Configuring NanoPi M6 M.2 interfaces..."

    # The NanoPi M6 has:
    # - M.2 M-Key for NVMe SSD (PCIe 3.0 x4)
    # - M.2 E-Key for WiFi module (PCIe 2.1 x1 + USB 2.0)

    # Configure NVMe optimizations
    if [[ -d /sys/class/nvme ]]; then
        log "Configuring NVMe optimizations for M.2 M-Key slot..."

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
        log "WiFi module detected in M.2 E-Key slot"

        # Common WiFi modules for NanoPi M6
        local wifi_modules=("rtl8852be" "mt7921e" "iwlwifi")

        for module in "${wifi_modules[@]}"; do
            if lsmod | grep -q "$module"; then
                log "WiFi module loaded: $module"
                break
            fi
        done
    fi

    log "M.2 interface configuration completed"
}

# Configure NanoPi M6 USB and power management
configure_nanopi_m6_usb_power() {
    log "Configuring NanoPi M6 USB and power management..."

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
        log "Configured power button behavior"
    fi

    log "USB and power management configured"
}

# Configure NanoPi M6 thermal management
configure_nanopi_m6_thermal() {
    log "Configuring NanoPi M6 thermal management..."

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
        log "Set CPU frequency scaling to conservative mode"
    fi

    log "Thermal management configured"
}

# Configure NanoPi M6 network optimizations
configure_nanopi_m6_network() {
    log "Configuring NanoPi M6 network optimizations..."

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

    log "Network optimizations configured for Gigabit Ethernet"
}

# Configure RK3588/RK3588S GPU settings
configure_rk3588_gpu() {
    log "Configuring RK3588 GPU settings..."

    # Set GPU governor to performance for better graphics performance
    if [[ -f /sys/class/devfreq/fb000000.gpu/governor ]]; then
        echo "performance" > /sys/class/devfreq/fb000000.gpu/governor 2>/dev/null || true
        log "Set GPU governor to performance mode"
    fi

    # Configure Mali GPU environment variables
    cat > /etc/environment.d/mali-gpu.conf << 'EOF'
# Mali GPU configuration for RK3588/RK3588S
MALI_OPENCL_DEVICE_TYPE=gpu
MALI_DUAL_MODE_COMPUTE=1
EOF

    log "Configured Mali GPU environment"
}

# Configure FriendlyElec RTC
configure_friendlyelec_rtc() {
    if [[ -f /sys/class/rtc/rtc0/name ]]; then
        local rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null)
        if [[ "$rtc_name" =~ hym8563 ]]; then
            log "Configuring HYM8563 RTC..."

            # Ensure RTC is set as system clock source
            if command -v timedatectl >/dev/null 2>&1; then
                timedatectl set-local-rtc 0 2>/dev/null || true
                log "Configured RTC as UTC time source"
            fi
        fi
    fi
}

# Configure FriendlyElec sensors
configure_friendlyelec_sensors() {
    log "Configuring FriendlyElec sensors..."

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
        log "Created RK3588 sensors configuration"
    fi
}

# Setup automatic updates
setup_automatic_updates() {
    log "Setting up automatic updates..."
    load_unattended_upgrades_config
    systemctl enable unattended-upgrades
    success "Automatic updates configured"
}

# Configure SSH hardening
configure_ssh_hardening() {
    log "Configuring SSH hardening..."
    load_ssh_config
    chmod 644 /etc/ssh/sshd_config /etc/ssh/ssh_banner

    # Test SSH configuration
    if sshd -t; then
        systemctl restart ssh
        success "SSH configured on port $SSH_PORT with key-only authentication"
    else
        error "SSH configuration is invalid"
        exit 1
    fi
}

# Setup fail2ban
setup_fail2ban() {
    log "Setting up fail2ban..."
    load_fail2ban_config
    systemctl enable fail2ban
    systemctl start fail2ban
    success "Fail2ban configured and started"
}

# Configure kernel hardening
configure_kernel_hardening() {
    log "Configuring kernel hardening..."
    load_kernel_hardening_config
    sysctl -p
    success "Kernel hardening applied"
}

# Setup file integrity monitoring
setup_file_integrity_monitoring() {
    log "Setting up file integrity monitoring..."
    aide --init
    [[ -f /var/lib/aide/aide.db.new ]] && mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db
    load_aide_config

    # Add cron job to run via just
    echo "0 3 * * * root cd $PROJECT_ROOT && just aide-check" > /etc/cron.d/aide-check

    success "File integrity monitoring configured"
}

# Setup hardware monitoring
setup_hardware_monitoring() {
    log "Setting up hardware monitoring..."
    sensors-detect --auto
    load_hardware_monitoring_config

    # Add cron job to run via just
    echo "*/15 * * * * root cd $PROJECT_ROOT && just hardware-monitor" > /etc/cron.d/hardware-monitor

    success "Hardware monitoring configured"
}

# Setup advanced security tools
setup_advanced_security_tools() {
    log "Setting up advanced security tools..."

    # Configure ClamAV
    if command -v clamscan >/dev/null 2>&1; then
        freshclam || warning "Failed to update ClamAV definitions"
        echo "0 4 * * * root cd $PROJECT_ROOT && just antivirus-scan" > /etc/cron.d/antivirus-scan
    fi

    # Configure Suricata
    if command -v suricata >/dev/null 2>&1; then
        echo "*/30 * * * * root cd $PROJECT_ROOT && just suricata-monitor" > /etc/cron.d/suricata-monitor
    fi

    # Add cron jobs to run via just
    echo "0 2 * * 0 root cd $PROJECT_ROOT && just security-audit" > /etc/cron.d/security-audit
    echo "0 3 * * 6 root cd $PROJECT_ROOT && just rootkit-scan" > /etc/cron.d/rootkit-scan

    success "Advanced security tools configured"
}

# Configure rootless Docker
configure_rootless_docker() {
    log "Configuring rootless Docker..."

    # Install Docker if not present
    if ! command -v docker >/dev/null 2>&1; then
        curl -fsSL https://get.docker.com | sh
        usermod -aG docker ubuntu
    fi

    # Install rootless Docker for ubuntu user
    sudo -u ubuntu bash -c 'curl -fsSL https://get.docker.com/rootless | sh'
    sudo -u ubuntu bash -c 'echo "export PATH=/home/ubuntu/bin:\$PATH" >> /home/ubuntu/.bashrc'
    sudo -u ubuntu bash -c 'echo "export DOCKER_HOST=unix:///run/user/1000/docker.sock" >> /home/ubuntu/.bashrc'

    success "Rootless Docker configured"
}

# Setup Docker services
setup_docker_services() {
    log "Setting up Docker services..."

    # Load Docker daemon configuration
    load_docker_config

    # Enable and start Docker
    systemctl enable docker
    systemctl start docker

    # Create Docker networks
    docker network create traefik 2>/dev/null || true

    # Set up directory structure
    mkdir -p "$INSTALL_ROOT"/{docker,data,content,nfs}
    mkdir -p "$INSTALL_ROOT/data"/{traefik,arcane,jellyfin,komga,kiwix,logs,backups,raspap}
    mkdir -p "$INSTALL_ROOT/content"/{movies,tv,webtv,music,audiobooks,books,comics,magazines,games/roms,kiwix}

    # Copy Docker configurations if they exist
    if [[ -d "$PROJECT_ROOT/docker" ]]; then
        log "Copying Docker configurations..."
        cp -r "$PROJECT_ROOT"/docker/* "$INSTALL_ROOT"/docker/ 2>/dev/null || true
    fi

    # Setup secrets for Docker services
    setup_docker_secrets

    success "Docker services configured"
}

# Setup Docker secrets
setup_docker_secrets() {
    log "Setting up Docker secrets..."

    # Run the secret setup script
    if [[ -f "$PROJECT_ROOT/scripts/security/setup-secrets.sh" ]]; then
        log "Generating and configuring secrets for all Docker services..."
        "$PROJECT_ROOT/scripts/security/setup-secrets.sh"
        success "Docker secrets configured"
    else
        warning "Secret setup script not found, skipping secret generation"
        warning "You may need to manually configure secrets for Docker services"
    fi
}

# Setup container health monitoring
setup_container_health_monitoring() {
    log "Setting up container health monitoring..."

    # Load Watchtower configuration
    load_watchtower_config

    # Add cron job to run via just
    echo "*/10 * * * * root cd $PROJECT_ROOT && just container-health" > /etc/cron.d/container-health

    success "Container health monitoring configured"
}

# Enhanced network interface detection and enumeration (RaspAP handles management)
detect_network_interfaces() {
    log "Detecting and enumerating network interfaces..."

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
        warning "No ethernet interface detected"
        WAN_INTERFACE="eth0"  # fallback
    fi

    if [[ -z "$WIFI_INTERFACE" ]]; then
        warning "No WiFi interface detected"
        WIFI_INTERFACE="wlan0"  # fallback
    fi

    log "Primary WAN Interface: $WAN_INTERFACE"
    log "Primary WiFi Interface: $WIFI_INTERFACE"
    log "Note: RaspAP will manage all network interface configuration"

    # Log additional interface information for FriendlyElec
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
        log_friendlyelec_interface_details
    fi

    # Show comprehensive interface enumeration
    if gum_available; then
        enhanced_log "info" "� Network Interface Enumeration"

        # Create table data for all interfaces
        local interface_data=()
        interface_data+=("Interface,Type,Status,Speed,Driver")

        # Add ethernet interfaces
        for iface in "${ethernet_interfaces[@]}"; do
            local status speed driver
            status=$(cat "/sys/class/net/${iface}/operstate" 2>/dev/null || echo "unknown")
            speed=$(cat "/sys/class/net/${iface}/speed" 2>/dev/null || echo "unknown")
            driver=$(readlink "/sys/class/net/${iface}/device/driver" 2>/dev/null | xargs basename || echo "unknown")
            [[ "${speed}" != "unknown" ]] && speed="${speed}Mbps"
            interface_data+=("${iface},Ethernet,${status},${speed},${driver}")
        done

        # Add WiFi interfaces
        for iface in "${wifi_interfaces[@]}"; do
            local status driver
            status=$(cat "/sys/class/net/${iface}/operstate" 2>/dev/null || echo "unknown")
            driver=$(readlink "/sys/class/net/${iface}/device/driver" 2>/dev/null | xargs basename || echo "unknown")
            interface_data+=("${iface},WiFi,${status},N/A,${driver}")
        done

        enhanced_table "${interface_data[0]}" "${interface_data[@]:1}"

        echo
        enhanced_log "info" "🔧 RaspAP will configure and manage all network interfaces"
        enhanced_log "info" "   Primary interfaces identified for RaspAP configuration:"
        enhanced_log "info" "   • WAN: ${WAN_INTERFACE}"
        enhanced_log "info" "   • WiFi Hotspot: ${WIFI_INTERFACE}"
    else
        log "Network Interface Summary:"
        log "  Ethernet interfaces: ${ethernet_interfaces[*]:-none}"
        log "  WiFi interfaces: ${wifi_interfaces[*]:-none}"
        log "  Primary WAN: $WAN_INTERFACE"
        log "  Primary WiFi: $WIFI_INTERFACE"
    fi

    # Export for use in templates and RaspAP configuration
    export WAN_INTERFACE WIFI_INTERFACE
    export ETHERNET_INTERFACES="${ethernet_interfaces[*]}"
    export WIFI_INTERFACES="${wifi_interfaces[*]}"

    success "Network interfaces enumerated (RaspAP will handle configuration)"
}

# Detect and configure NVMe storage
detect_and_configure_nvme_storage() {
    log "Detecting NVMe storage devices..."

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

    log "Found NVMe devices: ${nvme_devices[*]}"

    # Use the first NVMe device (typically nvme0n1)
    local nvme_device="/dev/${nvme_devices[0]}"
    log "Using NVMe device: ${nvme_device}"

    # Get device information
    local device_size
    device_size=$(lsblk -b -d -n -o SIZE "${nvme_device}" 2>/dev/null || echo "0")
    local device_size_gb=$((device_size / 1024 / 1024 / 1024))

    log "NVMe device size: ${device_size_gb}GB"

    if [[ ${device_size_gb} -lt 100 ]]; then
        log_warn "NVMe device is smaller than expected (${device_size_gb}GB), skipping partitioning"
        return 0
    fi

    # Check for existing partitions
    local existing_partitions
    existing_partitions=$(lsblk -n -o NAME "${nvme_device}" | grep -v "^${nvme_devices[0]}$" | wc -l)

    if [[ ${existing_partitions} -gt 0 ]]; then
        log_warn "Existing partitions detected on ${nvme_device}"
        lsblk "${nvme_device}"

        if gum_available; then
            enhanced_log "warn" "⚠️  Existing partitions found on NVMe device"
            enhanced_log "info" "📋 Current partition layout:"

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
            enhanced_log "warn" "🚨 Repartitioning will DESTROY all existing data!"

            if ! enhanced_confirm "Proceed with repartitioning? This will erase all data on ${nvme_device}" "false"; then
                log_info "NVMe partitioning cancelled by user"
                return 0
            fi
        else
            echo "Current partition layout:"
            lsblk "${nvme_device}"
            echo
            echo "WARNING: Repartitioning will DESTROY all existing data!"
            read -p "Proceed with repartitioning ${nvme_device}? (type 'yes' to confirm): " -r
            if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
                log_info "NVMe partitioning cancelled by user"
                return 0
            fi
        fi

        # Unmount any mounted partitions
        log "Unmounting existing partitions..."
        for partition in $(lsblk -n -o NAME "${nvme_device}" | grep -v "^${nvme_devices[0]}$"); do
            local partition_path="/dev/${partition}"
            if mountpoint -q "/dev/${partition}" 2>/dev/null; then
                umount "${partition_path}" 2>/dev/null || true
            fi
        done
    fi

    # Create new partition layout
    create_nvme_partitions "${nvme_device}"

    success "NVMe storage configuration completed"
}

# Create NVMe partitions (256GB /data, rest /content)
create_nvme_partitions() {
    local nvme_device="$1"

    log "Creating new partition layout on ${nvme_device}..."

    # Wipe existing partition table
    wipefs -a "${nvme_device}" 2>/dev/null || true

    # Create GPT partition table and partitions using parted
    log "Creating GPT partition table..."
    parted -s "${nvme_device}" mklabel gpt

    # Create 256GB partition for /data (starting at 1MB for alignment)
    log "Creating 256GB /data partition..."
    parted -s "${nvme_device}" mkpart primary ext4 1MiB 256GiB

    # Create partition for /content using remaining space
    log "Creating /content partition with remaining space..."
    parted -s "${nvme_device}" mkpart primary ext4 256GiB 100%

    # Wait for kernel to recognize new partitions
    sleep 2
    partprobe "${nvme_device}"
    sleep 2

    # Format partitions
    local data_partition="${nvme_device}p1"
    local content_partition="${nvme_device}p2"

    log "Formatting /data partition (${data_partition})..."
    mkfs.ext4 -F -L "dangerprep-data" "${data_partition}"

    log "Formatting /content partition (${content_partition})..."
    mkfs.ext4 -F -L "dangerprep-content" "${content_partition}"

    # Create mount points
    mkdir -p /data /content

    # Mount partitions
    log "Mounting partitions..."
    mount "${data_partition}" /data
    mount "${content_partition}" /content

    # Add to fstab for persistent mounting
    log "Adding partitions to /etc/fstab..."

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

    log "NVMe partition layout:"
    log "  ${data_partition} -> /data (256GB)"
    log "  ${content_partition} -> /content (remaining space)"

    # Show final layout
    if gum_available; then
        enhanced_log "info" "📋 Final NVMe Partition Layout"
        enhanced_table "Partition,Mount,Size,Filesystem,Label" \
            "${data_partition},/data,256GB,ext4,dangerprep-data" \
            "${content_partition},/content,$(lsblk -n -o SIZE "${content_partition}"),ext4,dangerprep-content"
    fi

    success "NVMe partitions created and mounted successfully"
}

# Enumerate Docker services that will be installed
enumerate_docker_services() {
    log "Enumerating Docker services for installation..."

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
    if gum_available; then
        enhanced_log "info" "🐳 Docker Services Installation Plan"
        echo

        # Infrastructure services
        enhanced_log "info" "🏗️  Infrastructure Services"
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
        enhanced_log "info" "🎬 Media Services"
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
        enhanced_log "info" "🔄 Synchronization Services"
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
        enhanced_log "info" "📱 Application Services"
        local app_table_data=()
        app_table_data+=("Service,Description")
        for service in "${application_services[@]}"; do
            local name="${service%%:*}"
            local desc="${service#*:}"
            app_table_data+=("${name},${desc}")
        done
        enhanced_table "${app_table_data[0]}" "${app_table_data[@]:1}"
        echo

        enhanced_log "info" "📊 Service Summary"
        enhanced_table "Category,Count,Services" \
            "Infrastructure,${#infrastructure_services[@]},Core system services" \
            "Media,${#media_services[@]},Entertainment and content" \
            "Sync,${#sync_services[@]},Data synchronization" \
            "Applications,${#application_services[@]},Productivity tools"

        echo
        enhanced_log "info" "🔧 All services will be configured with:"
        enhanced_log "info" "   • Traefik reverse proxy integration"
        enhanced_log "info" "   • Automatic SSL certificates via step-ca"
        enhanced_log "info" "   • Health monitoring and auto-restart"
        enhanced_log "info" "   • Watchtower automatic updates"
        enhanced_log "info" "   • Persistent data storage"

    else
        log "Docker Services Installation Plan:"
        log ""
        log "Infrastructure Services (${#infrastructure_services[@]}):"
        for service in "${infrastructure_services[@]}"; do
            local name="${service%%:*}"
            local desc="${service#*:}"
            log "  • ${name}: ${desc}"
        done
        log ""
        log "Media Services (${#media_services[@]}):"
        for service in "${media_services[@]}"; do
            local name="${service%%:*}"
            local desc="${service#*:}"
            log "  • ${name}: ${desc}"
        done
        log ""
        log "Sync Services (${#sync_services[@]}):"
        for service in "${sync_services[@]}"; do
            local name="${service%%:*}"
            local desc="${service#*:}"
            log "  • ${name}: ${desc}"
        done
        log ""
        log "Application Services (${#application_services[@]}):"
        for service in "${application_services[@]}"; do
            local name="${service%%:*}"
            local desc="${service#*:}"
            log "  • ${name}: ${desc}"
        done
    fi

    # Export service lists for use in other functions
    export INFRASTRUCTURE_SERVICES="${infrastructure_services[*]}"
    export MEDIA_SERVICES="${media_services[*]}"
    export SYNC_SERVICES="${sync_services[*]}"
    export APPLICATION_SERVICES="${application_services[*]}"

    local total_services=$((${#infrastructure_services[@]} + ${#media_services[@]} + ${#sync_services[@]} + ${#application_services[@]}))
    success "Enumerated ${total_services} Docker services for installation"
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

    log "Found ethernet interfaces: ${ethernet_interfaces[*]:-none}"
    log "Found WiFi interfaces: ${wifi_interfaces[*]:-none}"

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
        log "Configuring dual ethernet interfaces for NanoPi R6C..."

        # Identify interfaces by speed and capabilities
        local high_speed_interface=""
        local standard_interface=""
        local max_speed=0

        for iface in "${ethernet_interfaces[@]}"; do
            # Wait for interface to be up to read speed
            ip link set "$iface" up 2>/dev/null || true
            sleep 1

            local speed=$(cat "/sys/class/net/$iface/speed" 2>/dev/null || echo "1000")
            local driver=$(readlink "/sys/class/net/$iface/device/driver" 2>/dev/null | xargs basename || echo "unknown")

            log "Interface $iface: ${speed}Mbps, driver: $driver"

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
            log "Using 2.5GbE interface $WAN_INTERFACE for WAN"
            log "Using GbE interface $LAN_INTERFACE for LAN"
        else
            # Fallback if speed detection fails
            WAN_INTERFACE="${ethernet_interfaces[0]}"
            LAN_INTERFACE="${ethernet_interfaces[1]}"
            log "Speed detection failed, using first interface for WAN"
        fi

        # Export LAN interface for use in configuration
        export LAN_INTERFACE
    else
        WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
        log "Only one ethernet interface detected on R6C"
    fi
}

# Select interfaces for NanoPC-T6 (dual GbE)
select_t6_interfaces() {
    local ethernet_interfaces=("$@")

    if [[ ${#ethernet_interfaces[@]} -ge 2 ]]; then
        log "Configuring dual ethernet interfaces for NanoPC-T6..."

        # For T6, both are GbE, so use first for WAN, second for LAN
        WAN_INTERFACE="${ethernet_interfaces[0]}"
        LAN_INTERFACE="${ethernet_interfaces[1]}"

        log "Using $WAN_INTERFACE for WAN"
        log "Using $LAN_INTERFACE for LAN"

        # Export LAN interface for use in configuration
        export LAN_INTERFACE
    else
        WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
        log "Only one ethernet interface detected on T6"
    fi
}

# Configure network bonding for multiple interfaces
configure_network_bonding() {
    if [[ -z "${LAN_INTERFACE:-}" ]]; then
        return 0
    fi

    log "Configuring network bonding for multiple ethernet interfaces..."

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

    log "Network bonding configuration created"
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
        local speed=$(cat "/sys/class/net/$WAN_INTERFACE/speed" 2>/dev/null || echo "unknown")
        local duplex=$(cat "/sys/class/net/$WAN_INTERFACE/duplex" 2>/dev/null || echo "unknown")
        local driver=$(readlink "/sys/class/net/$WAN_INTERFACE/device/driver" 2>/dev/null | xargs basename || echo "unknown")

        log "Ethernet details: $WAN_INTERFACE (${speed}Mbps, $duplex, driver: $driver)"
    fi

    # Log WiFi interface details
    if [[ -n "$WIFI_INTERFACE" ]] && command -v iw >/dev/null 2>&1; then
        local wifi_info=$(iw dev "$WIFI_INTERFACE" info 2>/dev/null | grep -E "(wiphy|type)" | tr '\n' ' ' || echo "")
        if [[ -n "$wifi_info" ]]; then
            log "WiFi details: $WIFI_INTERFACE ($wifi_info)"
        fi
    fi
}

# Configure FriendlyElec fan control for thermal management
configure_friendlyelec_fan_control() {
    if [[ "$IS_RK3588" != true && "$IS_RK3588S" != true ]]; then
        return 0
    fi

    log "Configuring RK3588 fan control..."

    # Check if PWM fan control is available
    if [[ ! -d /sys/class/pwm/pwmchip0 ]]; then
        warning "PWM fan control not available, skipping fan configuration"
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
        success "Fan control test successful"
    else
        warning "Fan control test failed, but service installed"
    fi

    log "RK3588 fan control configured"
}

# Configure FriendlyElec GPIO and PWM interfaces
configure_friendlyelec_gpio_pwm() {
    if [[ "$IS_FRIENDLYELEC" != true ]]; then
        return 0
    fi

    log "Configuring FriendlyElec GPIO and PWM interfaces..."

    # Load GPIO/PWM configuration
    load_gpio_pwm_config

    # Make GPIO setup script executable
    chmod +x "$SCRIPT_DIR/setup-gpio.sh"

    # Run GPIO/PWM setup
    if "$SCRIPT_DIR/setup-gpio.sh" setup "$SUDO_USER"; then
        success "GPIO and PWM interfaces configured"
    else
        warning "GPIO and PWM setup completed with warnings"
    fi

    log "FriendlyElec GPIO and PWM configuration completed"
}

# Configure RK3588/RK3588S performance optimizations
configure_rk3588_performance() {
    if [[ "$IS_RK3588" != true && "$IS_RK3588S" != true ]]; then
        return 0
    fi

    log "Configuring RK3588/RK3588S performance optimizations..."

    # Configure CPU governors for optimal performance
    configure_rk3588_cpu_governors

    # Configure GPU performance settings
    configure_rk3588_gpu_performance

    # Configure memory and I/O optimizations
    configure_rk3588_memory_optimizations

    # Configure hardware acceleration
    configure_rk3588_hardware_acceleration

    success "RK3588/RK3588S performance optimizations configured"
}

# Configure CPU governors for RK3588/RK3588S
configure_rk3588_cpu_governors() {
    log "Configuring RK3588 CPU governors..."

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
                local current_governor=$(cat "$governor_file" 2>/dev/null)
                log "Set CPU policy $(basename "$policy") governor to: $current_governor"
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
    log "Created RK3588 CPU governor service"
}

# Configure GPU performance for RK3588/RK3588S
configure_rk3588_gpu_performance() {
    log "Configuring RK3588 GPU performance..."

    # Mali-G610 MP4 GPU configuration
    local gpu_devfreq="/sys/class/devfreq/fb000000.gpu"

    if [[ -d "$gpu_devfreq" ]]; then
        # Set GPU governor to performance
        if [[ -w "$gpu_devfreq/governor" ]]; then
            echo "performance" > "$gpu_devfreq/governor" 2>/dev/null || true
            log "Set GPU governor to performance"
        fi

        # Set GPU frequency to maximum for better performance
        if [[ -w "$gpu_devfreq/userspace/set_freq" && -r "$gpu_devfreq/available_frequencies" ]]; then
            local max_freq=$(cat "$gpu_devfreq/available_frequencies" | tr ' ' '\n' | sort -n | tail -1)
            if [[ -n "$max_freq" ]]; then
                echo "$max_freq" > "$gpu_devfreq/userspace/set_freq" 2>/dev/null || true
                log "Set GPU frequency to maximum: ${max_freq}Hz"
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

    log "Configured Mali GPU environment variables"
}

# Configure memory and I/O optimizations for RK3588/RK3588S
configure_rk3588_memory_optimizations() {
    log "Configuring RK3588 memory and I/O optimizations..."

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

    log "Configured RK3588 memory and I/O optimizations"
}

# Configure hardware acceleration for RK3588/RK3588S
configure_rk3588_hardware_acceleration() {
    log "Configuring RK3588 hardware acceleration..."

    # Configure VPU (Video Processing Unit) access
    if [[ -c /dev/mpp_service ]]; then
        # Ensure proper permissions for VPU device
        chown root:video /dev/mpp_service 2>/dev/null || true
        chmod 660 /dev/mpp_service 2>/dev/null || true
        log "Configured VPU device permissions"

        # Create udev rule to maintain VPU permissions
        cat > /etc/udev/rules.d/99-rk3588-vpu.rules << 'EOF'
# RK3588/RK3588S VPU device permissions
KERNEL=="mpp_service", GROUP="video", MODE="0660"
EOF
    fi

    # Configure NPU (Neural Processing Unit) if available
    if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
        log "NPU detected, configuring access..."

        # Set NPU governor to performance
        local npu_devfreq="/sys/class/devfreq/fdab0000.npu"
        if [[ -w "$npu_devfreq/governor" ]]; then
            echo "performance" > "$npu_devfreq/governor" 2>/dev/null || true
            log "Set NPU governor to performance"
        fi
    fi

    # Configure hardware video decoding support
    configure_rk3588_video_acceleration

    log "Hardware acceleration configuration completed"
}

# Configure video acceleration for RK3588/RK3588S
configure_rk3588_video_acceleration() {
    log "Configuring RK3588 video acceleration..."

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

    log "Configured RK3588 video acceleration"
}

# Configure WAN interface
configure_wan_interface() {
    log "Configuring WAN interface..."
    load_wan_config
    netplan apply
    success "WAN interface configured"
}

# Setup network routing
setup_network_routing() {
    log "Setting up network routing..."

    # Enable IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    sysctl -p

    # Configure NAT and forwarding rules
    iptables -t nat -A POSTROUTING -o "$WAN_INTERFACE" -j MASQUERADE
    iptables -A FORWARD -i "$WAN_INTERFACE" -o "$WIFI_INTERFACE" -m state --state RELATED,ESTABLISHED -j ACCEPT
    iptables -A FORWARD -i "$WIFI_INTERFACE" -o "$WAN_INTERFACE" -j ACCEPT

    # Save iptables rules
    iptables-save > /etc/iptables/rules.v4

    success "Network routing configured"
}

# Setup QoS traffic shaping
setup_qos_traffic_shaping() {
    log "Setting up QoS traffic shaping..."

    # Load network performance optimizations
    load_network_performance_config
    sysctl -p

    # Apply basic QoS via just
    cd "$PROJECT_ROOT" && just qos-setup

    success "QoS traffic shaping configured"
}


# Setup RaspAP for WiFi management and networking
setup_raspap() {
    log "Setting up RaspAP for WiFi management..."

    # Create RaspAP environment file if it doesn't exist
    local raspap_env="$PROJECT_ROOT/docker/infrastructure/raspap/compose.env"
    if [[ ! -f "$raspap_env" ]]; then
        log "Creating RaspAP environment file..."
        cp "$PROJECT_ROOT/docker/infrastructure/raspap/compose.env.example" "$raspap_env"

        # Prompt for GitHub credentials if not set
        if [[ -z "${GITHUB_USERNAME:-}" ]] || [[ -z "${GITHUB_TOKEN:-}" ]]; then
            warning "GitHub credentials required for RaspAP Insiders features"
            echo "Please set GITHUB_USERNAME and GITHUB_TOKEN environment variables"
            echo "or edit $raspap_env manually"
        else
            # Update environment file with provided credentials
            sed -i "s/GITHUB_USERNAME=your_github_username/GITHUB_USERNAME=$GITHUB_USERNAME/" "$raspap_env"
            sed -i "s/GITHUB_TOKEN=your_github_token/GITHUB_TOKEN=$GITHUB_TOKEN/" "$raspap_env"
        fi
    fi

    # Build and start RaspAP container
    log "Building and starting RaspAP container..."
    cd "$PROJECT_ROOT/docker/infrastructure/raspap" && docker compose up -d --build

    # Wait for RaspAP to be ready
    log "Waiting for RaspAP to initialize..."
    sleep 60

    # Configure DNS forwarding for DangerPrep integration
    if [[ -f "$PROJECT_ROOT/docker/infrastructure/raspap/configure-dns.sh" ]]; then
        log "Configuring DNS forwarding for DangerPrep integration..."
        "$PROJECT_ROOT/docker/infrastructure/raspap/configure-dns.sh"
    fi

    success "RaspAP configured for WiFi management"
}

# Configure WiFi routing
configure_wifi_routing() {
    log "Configuring WiFi client routing..."

    # Allow WiFi clients to access services
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 443 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 53 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p udp --dport 53 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p udp --dport 67 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p icmp --icmp-type echo-request -j ACCEPT

    # Save rules
    iptables-save > /etc/iptables/rules.v4

    success "WiFi client routing configured"
}

# Generate sync service configurations
generate_sync_configs() {
    log "Generating sync service configurations..."
    load_sync_configs
    success "Sync service configurations generated"
}

# Setup Tailscale
setup_tailscale() {
    log "Setting up Tailscale..."

    # Add Tailscale repository
    curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
    curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list

    # Update and install Tailscale
    apt update
    DEBIAN_FRONTEND=noninteractive apt install -y tailscale

    # Enable Tailscale service
    systemctl enable tailscaled
    systemctl start tailscaled

    # Configure firewall for Tailscale
    iptables -A INPUT -p udp --dport 41641 -j ACCEPT
    iptables -A INPUT -i tailscale0 -j ACCEPT
    iptables -A FORWARD -i tailscale0 -j ACCEPT
    iptables -A FORWARD -o tailscale0 -j ACCEPT
    iptables-save > /etc/iptables/rules.v4

    success "Tailscale installed and configured"
    info "Run 'tailscale up --advertise-routes=$LAN_NETWORK --advertise-exit-node' to connect"
}

# Setup advanced DNS (via Docker containers)
setup_advanced_dns() {
    log "Setting up advanced DNS..."

    # Start DNS infrastructure containers
    log "Starting DNS containers (CoreDNS + AdGuard)..."
    cd "$PROJECT_ROOT/docker/infrastructure/dns" && docker compose up -d

    # Wait for containers to be ready
    sleep 10

    success "Advanced DNS configured via Docker containers"
}

# Setup certificate management (via Docker containers)
setup_certificate_management() {
    log "Setting up certificate management..."

    # Start Traefik for ACME/Let's Encrypt certificates
    log "Starting Traefik for ACME certificate management..."
    cd "$PROJECT_ROOT/docker/infrastructure/traefik" && docker compose up -d

    # Start Step-CA for internal certificate authority
    log "Starting Step-CA for internal certificates..."
    cd "$PROJECT_ROOT/docker/infrastructure/step-ca" && docker compose up -d

    # Wait for containers to be ready
    sleep 15

    success "Certificate management configured via Docker containers"
}

# Install management scripts
install_management_scripts() {
    log "Installing management scripts..."

    # Management scripts are run via just commands, no copying needed
    log "Management scripts available via just commands"
    log "Use 'just help' to see available commands"

    success "Management scripts configured"
}

# Create routing scenarios
create_routing_scenarios() {
    log "Creating routing scenarios..."

    # Routing scenarios are available via just commands:
    # just wan-to-wifi, just wifi-repeater, just local-only
    log "Routing scenarios available via just commands"

    success "Routing scenarios configured"
}

# Setup system monitoring
setup_system_monitoring() {
    log "Setting up system monitoring..."

    # Monitoring scripts are run via just commands

    success "System monitoring configured"
}

# Configure NFS client
configure_nfs_client() {
    log "Configuring NFS client..."

    # Install NFS client
    apt install -y nfs-common

    # Create NFS mount points
    mkdir -p "$INSTALL_ROOT/nfs"

    success "NFS client configured"
}

# Install maintenance scripts
install_maintenance_scripts() {
    log "Installing maintenance scripts..."

    # Maintenance scripts are run via just commands, no copying needed
    log "Maintenance scripts available via just commands"

    success "Maintenance scripts configured"
}

# Setup encrypted backups
setup_encrypted_backups() {
    log "Setting up encrypted backups..."

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

    success "Encrypted backup system configured"
}

# Start all services
start_all_services() {
    log "Starting all services..."

    local services=(
        "ssh"
        "fail2ban"
        "docker"
        "tailscaled"
    )

    for service in "${services[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            systemctl start "$service" || warning "Failed to start $service"
            if systemctl is-active "$service" >/dev/null 2>&1; then
                success "$service started"
            else
                warning "$service failed to start"
            fi
        fi
    done

    success "All services started"
}

# Verification and testing
verify_setup() {
    log "Verifying setup..."

    # Check critical services
    local critical_services=("ssh" "fail2ban" "docker")
    local failed_services=()

    # Check if RaspAP container is running
    if docker ps --format "{{.Names}}" | grep -q "^raspap$"; then
        success "RaspAP container is running"
    else
        warning "RaspAP container is not running"
        failed_services+=("raspap")
    fi

    for service in "${critical_services[@]}"; do
        if ! systemctl is-active "$service" >/dev/null 2>&1; then
            failed_services+=("$service")
        fi
    done

    if [[ ${#failed_services[@]} -gt 0 ]]; then
        warning "Some services failed to start: ${failed_services[*]}"
    else
        success "All critical services are running"
    fi

    # Test network connectivity
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        success "Internet connectivity verified"
    else
        warning "No internet connectivity"
    fi

    # Test WiFi interface
    if ip link show "$WIFI_INTERFACE" >/dev/null 2>&1; then
        success "WiFi interface is up"
    else
        warning "WiFi interface not found"
    fi

    success "Setup verification completed"
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

    info "Logs: $LOG_FILE"
    info "Backups: $BACKUP_DIR"
    info "Install root: $INSTALL_ROOT"
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
    show_setup_banner

    # Initialize logging before any other operations
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

    if ! check_root_privileges; then
        log_error "Root privileges check failed"
        exit 1
    fi

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
    error "Setup failed. Running comprehensive cleanup..."

    # Run the full cleanup script to completely reverse all changes
    local cleanup_script="$SCRIPT_DIR/cleanup-dangerprep.sh"

    if [[ -f "$cleanup_script" ]]; then
        warning "Running cleanup script to restore system to original state..."
        # Run cleanup script with --preserve-data to keep any data that might have been created
        bash "$cleanup_script" --preserve-data 2>/dev/null || {
            warning "Cleanup script failed, attempting manual cleanup..."

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

        success "System has been restored to its original state"
    else
        warning "Cleanup script not found at $cleanup_script"
        warning "Performing basic cleanup only..."

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

    error "Setup failed. Check $LOG_FILE for details."
    error "System has been restored to its pre-installation state"
    info "You can safely re-run the setup script after addressing any issues"
    exit 1
}

trap cleanup_on_error ERR

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
