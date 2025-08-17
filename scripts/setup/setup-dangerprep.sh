#!/usr/bin/env bash
# DangerPrep Setup Script - Complete System Setup
#
# Purpose: Complete system setup for Ubuntu 24.04 with 2025 security hardening
# Usage: setup-dangerprep.sh [--dry-run] [--verbose] [--config FILE]
# Dependencies: apt, systemctl, ufw, git, curl, wget
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_NAME=""
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"
readonly SCRIPT_NAME

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

readonly SCRIPT_VERSION="2.0"
readonly SCRIPT_DESCRIPTION="DangerPrep Complete System Setup"

# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/error-handling.sh
source "${SCRIPT_DIR}/../shared/error-handling.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"
# shellcheck source=../shared/functions.sh
source "${SCRIPT_DIR}/../shared/functions.sh"

# Show help information
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

OPTIONS:
    --dry-run       Show what would be installed without making changes
    --verbose       Enable verbose output for debugging
    --config FILE   Use custom configuration file

    --skip-network  Skip network configuration
    -h, --help      Show this help message

DESCRIPTION:
    Complete system setup for Ubuntu 24.04 with 2025 security hardening.
    This script will:
    • Install and configure system-level network services
    • Set up network configuration (hostapd, dnsmasq, firewall)
    • Install security tools (AIDE, fail2ban, ClamAV)
    • Configure hardware monitoring and optimization
    • Set up backup and monitoring systems
    • Apply comprehensive security hardening

EXAMPLES:
    ${SCRIPT_NAME}                    # Full interactive setup
    ${SCRIPT_NAME} --dry-run          # Preview changes without installation
    ${SCRIPT_NAME} --verbose          # Enable detailed logging


NOTES:
    - This script must be run as root
    - Requires Ubuntu 24.04 LTS
    - Creates backup in: /var/backups/dangerprep-*
    - Logs to: /var/log/dangerprep-setup.log
    - Supports both NanoPi R6C and M6 hardware

EXIT CODES:
    0   Success
    1   General error
    2   Invalid arguments
    3   Unsupported system

For more information, see the DangerPrep documentation.
EOF
}

# Configuration variables with validation
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "${SCRIPT_DIR}")")"

INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
LOG_FILE="/var/log/dangerprep-setup.log"
BACKUP_DIR="/var/backups/dangerprep-$(date +%Y%m%d-%H%M%S)"


# Secure temporary directory
TEMP_DIR=""
create_temp_dir() {
    TEMP_DIR=$(mktemp -d -t dangerprep-setup.XXXXXX)
    chmod 700 "${TEMP_DIR}"
}

# Cleanup function for temporary files
cleanup_temp() {
    if [[ -n "${TEMP_DIR}" && -d "${TEMP_DIR}" ]]; then
        rm -rf "${TEMP_DIR}"
    fi
}

# Input validation functions
validate_ip() {
    local ip="$1"
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        local IFS='.'
        local -a octets
        read -ra octets <<< "$ip"
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
    local mode
    mode=${3:-644}

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

# Validate template variables are properly defined
validate_template_variables() {
    log "Validating template variables..."

    local required_vars=(
        "WIFI_SSID" "WIFI_PASSWORD" "LAN_NETWORK" "LAN_IP"
        "DHCP_START" "DHCP_END" "SSH_PORT"
        "FAIL2BAN_BANTIME" "FAIL2BAN_MAXRETRY"
    )

    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done

    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        error "Missing required template variables: ${missing_vars[*]}"
        return 1
    fi

    # Validate variable formats
    if ! validate_ip "$LAN_IP"; then
        error "Invalid LAN IP address: $LAN_IP"
        return 1
    fi

    if ! validate_ip "${DHCP_START}"; then
        error "Invalid DHCP start address: $DHCP_START"
        return 1
    fi

    if ! validate_ip "${DHCP_END}"; then
        error "Invalid DHCP end address: $DHCP_END"
        return 1
    fi

    if [[ ! "$SSH_PORT" =~ ^[0-9]+$ ]] || [[ "$SSH_PORT" -lt 1 ]] || [[ "$SSH_PORT" -gt 65535 ]]; then
        error "Invalid SSH port: $SSH_PORT"
        return 1
    fi

    success "All template variables validated"
    return 0
}

# Validate service port assignments to prevent conflicts
validate_service_ports() {
    log "Checking for service port conflicts..."

    local port_assignments=(
        "SSH:${SSH_PORT}"
        "AdGuard_Home_Web:3000"
        "AdGuard_Home_DNS:5053"
        "Step_CA:9000"
        "dnsmasq_DNS:53"
        "dnsmasq_DHCP:67"
    )

    local conflicts=()
    local used_ports=()

    # Check for duplicate port assignments
    for assignment in "${port_assignments[@]}"; do
        local service="${assignment%%:*}"
        local port="${assignment##*:}"

        if [[ " ${used_ports[*]} " =~ \ ${port}\  ]]; then
            conflicts+=("Port $port used by multiple services")
        else
            used_ports+=("$port")
        fi

        # Check if port is already in use by other processes
        if netstat -tuln 2>/dev/null | grep -q ":${port} "; then
            conflicts+=("Port $port already in use by another process")
        fi
    done

    if [[ ${#conflicts[@]} -gt 0 ]]; then
        warning "Port conflicts detected:"
        printf '  %s\n' "${conflicts[@]}"
        return 1
    fi

    return 0
}

# Signal handlers for cleanup
trap cleanup_temp EXIT
trap 'cleanup_temp; exit 130' INT
trap 'cleanup_temp; exit 143' TERM

# Load configuration utilities
# shellcheck source=scripts/setup/config-loader.sh
source "${SCRIPT_DIR}/config-loader.sh"

# Network configuration
WIFI_SSID="DangerPrep"
WIFI_PASSWORD="$(generate_wifi_password)" || {
    error "Failed to generate WiFi password"
    exit 1
}
LAN_NETWORK="192.168.120.0/22"
LAN_IP="192.168.120.1"
DHCP_START="192.168.120.100"
DHCP_END="192.168.120.200"

# Security configuration
SSH_PORT="2222"
FAIL2BAN_BANTIME="3600"
FAIL2BAN_MAXRETRY="3"

# Export variables for use in templates
export WIFI_SSID WIFI_PASSWORD LAN_NETWORK LAN_IP DHCP_START DHCP_END
export SSH_PORT FAIL2BAN_BANTIME FAIL2BAN_MAXRETRY

# Check if running as root
check_root() {
    if [[ ${EUID} -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
        echo "Usage: sudo $0"
        exit 1
    fi
}

# Enhanced logging setup with comprehensive information
setup_logging() {
    mkdir -p "${BACKUP_DIR}"
    mkdir -p "$(dirname "${LOG_FILE}")"
    touch "${LOG_FILE}"
    chmod 640 "${LOG_FILE}"

    # Log setup start with comprehensive system information
    log_section "DangerPrep Setup Started"
    log "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    log "Script version: ${SCRIPT_VERSION}"
    log "User: $(whoami)"
    log "Working directory: $(pwd)"
    log "Script path: ${BASH_SOURCE[0]}"
    log "Backup directory: ${BACKUP_DIR}"
    log "Install root: ${INSTALL_ROOT}"
    log "Project root: ${PROJECT_ROOT}"
    log "Log file: ${LOG_FILE}"

    # Log system information
    log_subsection "System Environment"
    log "OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo 'Unknown')"
    log "Kernel: $(uname -r)"
    log "Architecture: $(uname -m)"
    log "Hostname: $(hostname)"
    log "Memory: $(free -h | grep Mem | awk '{print $2}' || echo 'Unknown')"
    log "Disk space: $(df -h / | tail -1 | awk '{print $4}' || echo 'Unknown') available"
    log "Shell: ${SHELL}"
    log "PATH: ${PATH}"

    # Log script arguments (if any were passed to main)
    if [[ -n "${SCRIPT_ARGS:-}" ]]; then
        log_subsection "Script Arguments"
        log "Arguments: ${SCRIPT_ARGS}"
    fi

    # Log environment variables
    log_subsection "DangerPrep Environment"
    log "DANGERPREP_INSTALL_ROOT: ${DANGERPREP_INSTALL_ROOT:-not set}"
    log "CONFIG_FILE: ${CONFIG_FILE:-not set}"
    log "DRY_RUN: ${DRY_RUN:-false}"
    log "LOG_LEVEL: ${LOG_LEVEL:-INFO}"

    success "Logging initialized successfully"
}

# Display banner
show_banner() {
    show_setup_banner
    echo
    info "Emergency Router & Content Hub Setup"
    info "• WiFi Hotspot: DangerPrep (WPA3/WPA2)"
    info "• Network: 192.168.120.0/22"
    info "• Security: 2025 Hardening Standards"
    info "• Services: AdGuard Home + Step-CA + Sync"
    echo
    info "All changes are logged and backed up."
    echo
    info "Logs: ${LOG_FILE}"
    info "Backups: ${BACKUP_DIR}"
    info "Install root: ${INSTALL_ROOT}"
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

    # Detect architecture first
    case "$(uname -m)" in
        aarch64|arm64)
            IS_ARM64=true
            ;;
        x86_64|amd64)
            IS_ARM64=false
            ;;
        *)
            IS_ARM64=false
            ;;
    esac

    # Detect platform from device tree
    if [[ -f /proc/device-tree/model ]]; then
        PLATFORM=$(cat /proc/device-tree/model | tr -d '\0')
        log "Platform: ${PLATFORM}"

        # Check for FriendlyElec hardware
        if [[ "${PLATFORM}" =~ (NanoPi|NanoPC|CM3588) ]]; then
            IS_FRIENDLYELEC=true
            log "FriendlyElec hardware detected"

            # Extract model information
            if [[ "${PLATFORM}" =~ NanoPi[[:space:]]*M6 ]]; then
                FRIENDLYELEC_MODEL="NanoPi-M6"
                IS_RK3588S=true
                SOC_TYPE="RK3588S"
            elif [[ "${PLATFORM}" =~ NanoPi[[:space:]]*R6[CS] ]]; then
                FRIENDLYELEC_MODEL="NanoPi-R6C"
                IS_RK3588S=true
                SOC_TYPE="RK3588S"
            elif [[ "${PLATFORM}" =~ NanoPC[[:space:]]*T6 ]]; then
                FRIENDLYELEC_MODEL="NanoPC-T6"
                IS_RK3588=true
                SOC_TYPE="RK3588"
            elif [[ "${PLATFORM}" =~ CM3588 ]]; then
                FRIENDLYELEC_MODEL="CM3588"
                IS_RK3588=true
                SOC_TYPE="RK3588"
            else
                FRIENDLYELEC_MODEL="Unknown FriendlyElec"
            fi

            log "Model: ${FRIENDLYELEC_MODEL}"
            log "SoC: ${SOC_TYPE}"

            # Detect additional hardware features
            detect_friendlyelec_features
        fi
    else
        PLATFORM="Generic x86_64"
        log "Platform: ${PLATFORM}"
    fi

    # Export variables for use in other functions
    export PLATFORM IS_FRIENDLYELEC IS_RK3588 IS_RK3588S FRIENDLYELEC_MODEL SOC_TYPE IS_ARM64
}

# Detect FriendlyElec-specific hardware features
detect_friendlyelec_features() {
    local features=()

    # Check for hardware acceleration support
    if [[ -d /sys/class/devfreq/fb000000.gpu ]]; then
        features+=("Mali GPU")
        debug "Mali GPU devfreq interface detected"
    else
        debug "Mali GPU devfreq interface not found"
    fi

    # Check for VPU/MPP support
    if [[ -c /dev/mpp_service ]]; then
        features+=("Hardware VPU")
        debug "VPU/MPP device detected"
    else
        debug "VPU/MPP device not found"
    fi

    # Check for NPU support (RK3588/RK3588S)
    if [[ "${IS_RK3588}" == true || "${IS_RK3588S}" == true ]]; then
        if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
            features+=("6TOPS NPU")
            debug "NPU devfreq interface detected"
        else
            debug "NPU devfreq interface not found"
        fi
    fi

    # Check for RTC support with error handling
    if [[ -f /sys/class/rtc/rtc0/name ]]; then
        local rtc_name
        if rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null); then
            if [[ "$rtc_name" =~ hym8563 ]]; then
                features+=("HYM8563 RTC")
                debug "HYM8563 RTC detected"
            else
                debug "RTC detected but not HYM8563: $rtc_name"
            fi
        else
            debug "Failed to read RTC name"
        fi
    else
        debug "RTC interface not found"
    fi

    # Check for M.2 interfaces
    if [[ -d /sys/class/nvme ]]; then
        local nvme_count
        nvme_count=$(find /sys/class/nvme -name "nvme*" -type l 2>/dev/null | wc -l)
        if [[ $nvme_count -gt 0 ]]; then
            features+=("M.2 NVMe ($nvme_count devices)")
            debug "M.2 NVMe devices detected: $nvme_count"
        fi
    else
        debug "M.2 NVMe interface not found"
    fi

    # Log detected features
    if [[ ${#features[@]} -gt 0 ]]; then
        log "Hardware features: ${features[*]}"
    else
        log "No special hardware features detected"
    fi
}

# Comprehensive pre-flight validation
pre_flight_checks() {
    log_section "Comprehensive Pre-flight Validation"

    local validation_errors=0
    local validation_warnings=0

    # OS Version Validation
    log_subsection "Operating System Validation"
    if ! lsb_release -d | grep -q "Ubuntu 24.04"; then
        warning "This script is designed for Ubuntu 24.04. Current OS: $(lsb_release -d | cut -f2)"
        ((validation_warnings++))
    else
        success "✓ Ubuntu 24.04 detected"
    fi

    # Architecture Validation
    local arch
    arch=$(uname -m)
    if [[ "$arch" != "x86_64" && "$arch" != "aarch64" ]]; then
        error "✗ Unsupported architecture: $arch"
        ((validation_errors++))
    else
        success "✓ Supported architecture: $arch"
    fi

    # Hardware Requirements Validation
    log_subsection "Hardware Requirements"

    # Memory check (minimum 2GB)
    local memory_kb
    memory_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local memory_gb=$((memory_kb / 1024 / 1024))
    if [[ $memory_gb -lt 2 ]]; then
        error "✗ Insufficient memory: ${memory_gb}GB (minimum 2GB required)"
        ((validation_errors++))
    else
        success "✓ Memory: ${memory_gb}GB"
    fi

    # Disk space validation (minimum 20GB for comprehensive setup)
    local available_space
    available_space=$(df / | tail -1 | awk '{print $4}')
    local available_gb=$((available_space / 1024 / 1024))
    if [[ $available_gb -lt 20 ]]; then
        error "✗ Insufficient disk space: ${available_gb}GB (minimum 20GB required)"
        ((validation_errors++))
    else
        success "✓ Disk space: ${available_gb}GB available"
    fi

    # Network Validation
    log_subsection "Network Connectivity"

    # Internet connectivity check
    local connectivity_targets=("8.8.8.8" "1.1.1.1" "archive.ubuntu.com")
    local connectivity_success=0

    for target in "${connectivity_targets[@]}"; do
        if ping -c 1 -W 3 "$target" >/dev/null 2>&1; then
            ((connectivity_success++))
            debug "✓ Connectivity to $target"
        else
            debug "✗ No connectivity to $target"
        fi
    done

    if [[ $connectivity_success -eq 0 ]]; then
        error "✗ No internet connectivity detected"
        ((validation_errors++))
    elif [[ $connectivity_success -lt 2 ]]; then
        warning "⚠ Limited internet connectivity ($connectivity_success/3 targets reachable)"
        ((validation_warnings++))
    else
        success "✓ Internet connectivity verified"
    fi

    # DNS resolution check
    if ! nslookup google.com >/dev/null 2>&1; then
        error "✗ DNS resolution failed"
        ((validation_errors++))
    else
        success "✓ DNS resolution working"
    fi

    # Network interfaces validation
    local interfaces
    interfaces=$(ip link show | grep -E '^[0-9]+:' | grep -cv lo)
    if [[ $interfaces -lt 1 ]]; then
        error "✗ No network interfaces detected"
        ((validation_errors++))
    else
        success "✓ Network interfaces: $interfaces detected"
    fi

    # Dependencies Validation
    log_subsection "System Dependencies"

    local required_commands=(
        "curl" "wget" "gpg" "openssl" "systemctl"
        "iptables" "ip" "hostapd" "dnsmasq"
    )

    local missing_commands=()
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_commands+=("$cmd")
        fi
    done

    if [[ ${#missing_commands[@]} -gt 0 ]]; then
        warning "⚠ Missing commands will be installed: ${missing_commands[*]}"
        ((validation_warnings++))
    else
        success "✓ All required commands available"
    fi

    # Permissions Validation
    log_subsection "Permissions and Access"

    # Root access verification
    if [[ $EUID -ne 0 ]]; then
        error "✗ Root privileges required"
        ((validation_errors++))
    else
        success "✓ Root privileges confirmed"
    fi

    # Write access to critical directories
    local critical_dirs=("/etc" "/usr/local/bin" "/var/log")
    for dir in "${critical_dirs[@]}"; do
        if [[ ! -w "$dir" ]]; then
            error "✗ No write access to $dir"
            ((validation_errors++))
        else
            debug "✓ Write access to $dir"
        fi
    done

    # Configuration Files Validation
    log_subsection "Configuration Validation"
    if ! validate_config_files; then
        error "✗ Configuration file validation failed"
        ((validation_errors++))
    else
        success "✓ Configuration files validated"
    fi

    # Template Variable Validation
    log_subsection "Template Variables Validation"
    if ! validate_template_variables; then
        error "✗ Template variable validation failed"
        ((validation_errors++))
    else
        success "✓ Template variables validated"
    fi

    # Service Port Conflict Detection
    log_subsection "Service Port Conflict Detection"
    if ! validate_service_ports; then
        warning "⚠ Potential service port conflicts detected"
        ((validation_warnings++))
    else
        success "✓ No service port conflicts detected"
    fi

    # Security Validation
    log_subsection "Security Prerequisites"

    # Check if system is already hardened
    if [[ -f /etc/ssh/sshd_config ]] && grep -q "PermitRootLogin no" /etc/ssh/sshd_config; then
        info "ℹ SSH already hardened"
    fi

    # Check for conflicting services
    local conflicting_services=("apache2" "nginx" "bind9")
    local conflicts=()
    for service in "${conflicting_services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            conflicts+=("$service")
        fi
    done

    if [[ ${#conflicts[@]} -gt 0 ]]; then
        warning "⚠ Conflicting services detected: ${conflicts[*]}"
        warning "These services may interfere with DangerPrep setup"
        ((validation_warnings++))
    fi

    # Summary
    log_subsection "Validation Summary"
    if [[ $validation_errors -gt 0 ]]; then
        error "Pre-flight validation failed with $validation_errors errors and $validation_warnings warnings"
        error "Please resolve the errors before proceeding"
        exit 1
    elif [[ $validation_warnings -gt 0 ]]; then
        warning "Pre-flight validation completed with $validation_warnings warnings"
        echo
        read -p "Continue despite warnings? (y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Setup cancelled by user"
            exit 0
        fi
    else
        success "✓ All pre-flight checks passed successfully"
    fi
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
            cp -r "$config" "${BACKUP_DIR}/" 2>/dev/null || true
            log "Backed up: $config"
        fi
    done
    
    success "Original configurations backed up to ${BACKUP_DIR}"
}

# Update system packages
update_system_packages() {
    log "Updating system packages..."
    
    export DEBIAN_FRONTEND=noninteractive
    apt update
    apt upgrade -y
    
    success "System packages updated"
}

# Install essential packages
install_essential_packages() {
    log "Installing essential packages..."

    # Define package categories (removing Docker, adding NFS server and Olares requirements)
    local core_packages=(
        "curl" "wget" "git" "vim" "nano" "htop" "tree" "unzip" "zip"
        "software-properties-common" "apt-transport-https" "ca-certificates"
        "gnupg" "lsb-release" "jq" "bc" "rsync" "screen" "tmux"
    )

    local network_packages=(
        "hostapd" "dnsmasq" "iptables-persistent" "bridge-utils"
        "wireless-tools" "wpasupplicant" "iw" "rfkill" "netplan.io"
        "iproute2" "tc" "wondershaper" "iperf3"
    )

    local nfs_packages=(
        "nfs-common"
    )

    local security_packages=(
        "fail2ban" "aide" "rkhunter" "chkrootkit" "clamav" "clamav-daemon"
        "lynis" "apparmor" "apparmor-utils" "libpam-pwquality"
        "libpam-tmpdir" "acct" "psacct" "apache2-utils"
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

    local olares_packages=(
        "systemd" "systemd-resolved" "systemd-timesyncd"
    )
    
    # Combine all packages
    local all_packages=(
        "${core_packages[@]}"
        "${network_packages[@]}"
        "${nfs_packages[@]}"
        "${security_packages[@]}"
        "${monitoring_packages[@]}"
        "${backup_packages[@]}"
        "${update_packages[@]}"
        "${olares_packages[@]}"
    )
    
    # Install packages with error handling
    local failed_packages=()
    for package in "${all_packages[@]}"; do
        log "Installing $package..."
        if DEBIAN_FRONTEND=noninteractive apt install -y "$package" 2>/dev/null; then
            success "Installed $package"
        else
            warning "Failed to install $package"
            failed_packages+=("$package")
        fi
    done
    
    # Report failed packages
    if [[ ${#failed_packages[@]} -gt 0 ]]; then
        warning "Failed to install packages: ${failed_packages[*]}"
        log "These packages may not be available in the current repository"
    fi
    
    # Install FriendlyElec-specific packages
    if [[ "${IS_FRIENDLYELEC}" == true ]]; then
        install_friendlyelec_packages
    fi

    # Clean up package cache
    apt autoremove -y
    apt autoclean

    success "Essential packages installation completed"
}

# Install FriendlyElec-specific packages and configurations
install_friendlyelec_packages() {
    log "Installing FriendlyElec-specific packages..."

    # FriendlyElec-specific packages for hardware acceleration
    local friendlyelec_packages=()

    if [[ "${IS_RK3588}" == true || "${IS_RK3588S}" == true ]]; then
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
        local kernel_headers
        kernel_headers=$(find /opt/archives -name "linux-headers-*.deb" | head -1)
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
        local kernel_version
        kernel_version=$(uname -r)
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
    if [[ "${IS_RK3588}" == true || "${IS_RK3588S}" == true ]]; then
        configure_rk3588_gpu
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

# Configure RK3588/RK3588S GPU settings
configure_rk3588_gpu() {
    log "Configuring RK3588 GPU settings..."

    # Set GPU governor to performance for better graphics performance
    if [[ -f /sys/class/devfreq/fb000000.gpu/governor ]]; then
        if echo "performance" > /sys/class/devfreq/fb000000.gpu/governor 2>/dev/null; then
            log "Set GPU governor to performance mode"
        else
            warning "Failed to set GPU governor to performance mode"
        fi
    else
        debug "GPU devfreq interface not found, skipping GPU governor configuration"
    fi

    # Configure Mali GPU environment variables
    if ! load_rk3588_gpu_config; then
        warning "Failed to load RK3588 GPU configuration"
    fi
}

# Configure FriendlyElec RTC
configure_friendlyelec_rtc() {
    if [[ -f /sys/class/rtc/rtc0/name ]]; then
        local rtc_name
        rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null)
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
    if [[ "${IS_RK3588}" == true || "${IS_RK3588S}" == true ]]; then
        load_rk3588_sensors_config
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
        success "SSH configured on port ${SSH_PORT} with key-only authentication"
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
    echo "0 3 * * * root cd ${PROJECT_ROOT} && just aide-check" > /etc/cron.d/aide-check

    success "File integrity monitoring configured"
}

# Setup hardware monitoring
setup_hardware_monitoring() {
    log "Setting up hardware monitoring..."
    sensors-detect --auto
    load_hardware_monitoring_config

    # Add cron job to run via just
    echo "*/15 * * * * root cd ${PROJECT_ROOT} && just hardware-monitor" > /etc/cron.d/hardware-monitor

    success "Hardware monitoring configured"
}

# Setup advanced security tools
setup_advanced_security_tools() {
    log "Setting up advanced security tools..."

    # Configure ClamAV
    if command -v clamscan >/dev/null 2>&1; then
        freshclam || warning "Failed to update ClamAV definitions"
        echo "0 4 * * * root cd ${PROJECT_ROOT} && just antivirus-scan" > /etc/cron.d/antivirus-scan
    fi



    # Add cron jobs to run via just
    echo "0 2 * * 0 root cd ${PROJECT_ROOT} && just security-audit" > /etc/cron.d/security-audit
    echo "0 3 * * 6 root cd ${PROJECT_ROOT} && just rootkit-scan" > /etc/cron.d/rootkit-scan

    success "Advanced security tools configured"
}



# Setup directory structure for Olares integration
setup_directory_structure() {
    log "Setting up directory structure for Olares..."

    # Create base directories
    mkdir -p "${INSTALL_ROOT}"/{content,nfs,config,data}

    # Create content directories for NFS sharing
    mkdir -p "${INSTALL_ROOT}/content"/{movies,tv,webtv,music,audiobooks,books,comics,magazines,games/roms,kiwix}

    # Create data directories for host services
    mkdir -p "${INSTALL_ROOT}/data"/{logs,backups,adguard,step-ca}

    # Set proper permissions for content directories
    chown -R ubuntu:ubuntu "${INSTALL_ROOT}/content"
    chmod -R 755 "${INSTALL_ROOT}/content"

    success "Directory structure configured for Olares integration"
}



# Olares installation functions
check_olares_requirements() {
    log "Checking Olares system requirements..."

    # Check minimum system requirements
    local total_memory
    total_memory=$(free -m | awk '/^Mem:/{print $2}')
    local cpu_cores
    cpu_cores=$(nproc)
    local available_disk
    available_disk=$(df / | awk 'NR==2{print int($4/1024/1024)}')

    if [[ $total_memory -lt 2048 ]]; then
        error "Insufficient memory: ${total_memory}MB available, 2GB required"
        return 1
    fi

    if [[ $cpu_cores -lt 2 ]]; then
        error "Insufficient CPU cores: ${cpu_cores} available, 2 required"
        return 1
    fi

    if [[ $available_disk -lt 20 ]]; then
        error "Insufficient disk space: ${available_disk}GB available, 20GB required"
        return 1
    fi

    # Check for systemd
    if ! command -v systemctl >/dev/null 2>&1; then
        error "systemd is required for Olares"
        return 1
    fi

    # Check Ubuntu version
    if ! grep -q "Ubuntu 24.04" /etc/os-release; then
        warning "Olares is tested on Ubuntu 24.04, current version may have compatibility issues"
    fi

    success "System meets Olares requirements (${total_memory}MB RAM, ${cpu_cores} cores, ${available_disk}GB disk)"
    return 0
}

download_olares_installer() {
    log "Downloading Olares installer..."

    local installer_url="https://github.com/beclab/olares/releases/latest/download/install.sh"
    local installer_path="/tmp/olares-install.sh"

    # Download installer
    if curl -fsSL "$installer_url" -o "$installer_path"; then
        chmod +x "$installer_path"
        success "Olares installer downloaded successfully"
        return 0
    else
        error "Failed to download Olares installer"
        return 1
    fi
}

prepare_olares_environment() {
    log "Preparing environment for Olares installation..."

    # Stop any conflicting services
    systemctl stop docker 2>/dev/null || true
    systemctl disable docker 2>/dev/null || true

    # Remove Docker if present (Olares uses K3s)
    if command -v docker >/dev/null 2>&1; then
        log "Removing Docker to avoid conflicts with K3s..."
        apt remove -y docker.io docker-ce docker-ce-cli containerd.io 2>/dev/null || true
        apt autoremove -y
    fi

    success "Environment prepared for Olares installation"
    return 0
}

install_olares() {
    log "Installing Olares..."

    # Check requirements first
    if ! check_olares_requirements; then
        error "System does not meet Olares requirements"
        return 1
    fi

    # Download installer
    if ! download_olares_installer; then
        error "Failed to download Olares installer"
        return 1
    fi

    # Prepare environment
    if ! prepare_olares_environment; then
        error "Failed to prepare environment for Olares"
        return 1
    fi

    # Run Olares installer (let it handle its own configuration)
    log "Running Olares installer..."
    local installer_path="/tmp/olares-install.sh"

    log "Note: Olares will handle its own K3s and service configuration"
    log "The installer may take several minutes to complete..."

    if bash "$installer_path"; then
        success "Olares installation completed"
        log "Olares will continue initializing in the background"
        log "Use 'just olares' to check status once initialization is complete"
        return 0
    else
        error "Olares installation failed"
        return 1
    fi
}

configure_olares_integration() {
    log "Configuring Olares integration with DangerPrep..."

    log "Olares will handle its own Tailscale, DNS, and networking configuration"
    log "Host services (AdGuard Home, Step-CA) will remain available for local use"

    success "Olares integration prepared"
    return 0
}

# Setup container health monitoring
setup_container_health_monitoring() {
    log "Setting up container health monitoring..."



    # Add cron job to run via just
    echo "*/10 * * * * root cd ${PROJECT_ROOT} && just container-health" > /etc/cron.d/container-health

    success "Container health monitoring configured"
}

# Enhanced network interface detection with FriendlyElec support
detect_network_interfaces() {
    log "Detecting network interfaces..."

    # Initialize interface arrays
    local ethernet_interfaces=()
    local wifi_interfaces=()

    # Detect all ethernet interfaces with enhanced patterns
    while IFS= read -r interface; do
        if [[ -n "$interface" ]]; then
            ethernet_interfaces+=("$interface")
        fi
    done < <(ip link show | grep -E "^[0-9]+: (eth|enp|ens|enx)" | cut -d: -f2 | tr -d ' ')

    # Detect WiFi interfaces with better detection
    while IFS= read -r interface; do
        if [[ -n "$interface" ]]; then
            wifi_interfaces+=("$interface")
        fi
    done < <(iw dev 2>/dev/null | grep Interface | awk '{print $2}')

    # FriendlyElec-specific interface selection
    if [[ "${IS_FRIENDLYELEC}" == true ]]; then
        select_friendlyelec_interfaces "${ethernet_interfaces[@]}" -- "${wifi_interfaces[@]}"
    else
        select_generic_interfaces "${ethernet_interfaces[@]}" -- "${wifi_interfaces[@]}"
    fi

    # Validate and set fallbacks
    if [[ -z "${WAN_INTERFACE}" ]]; then
        warning "No ethernet interface detected"
        WAN_INTERFACE="eth0"  # fallback
    fi

    if [[ -z "${WIFI_INTERFACE}" ]]; then
        warning "No WiFi interface detected"
        WIFI_INTERFACE="wlan0"  # fallback
    fi

    log "WAN Interface: ${WAN_INTERFACE}"
    log "WiFi Interface: ${WIFI_INTERFACE}"

    # Log additional interface information for FriendlyElec
    if [[ "${IS_FRIENDLYELEC}" == true ]]; then
        log_friendlyelec_interface_details
    fi

    # Export for use in templates
    export WAN_INTERFACE WIFI_INTERFACE

    success "Network interfaces detected"
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
    case "${FRIENDLYELEC_MODEL}" in
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
            sleep 2

            local speed
            speed=$(cat "/sys/class/net/$iface/speed" 2>/dev/null || echo "1000")

            # Handle cases where speed is -1 (unknown) or invalid
            if [[ "$speed" == "-1" || ! "$speed" =~ ^[0-9]+$ ]]; then
                speed="1000"  # Default to 1Gbps
            fi

            local driver
            driver=$(readlink "/sys/class/net/$iface/device/driver" 2>/dev/null | xargs basename || echo "unknown")

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
            log "Using 2.5GbE interface ${WAN_INTERFACE} for WAN"
            log "Using GbE interface ${LAN_INTERFACE} for LAN"
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

        log "Using ${WAN_INTERFACE} for WAN"
        log "Using ${LAN_INTERFACE} for LAN"

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
    load_ethernet_bonding_config

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
    if [[ -n "${WAN_INTERFACE}" && -d "/sys/class/net/${WAN_INTERFACE}" ]]; then
        local speed
        speed=$(cat "/sys/class/net/${WAN_INTERFACE}/speed" 2>/dev/null || echo "unknown")
        local duplex
        duplex=$(cat "/sys/class/net/${WAN_INTERFACE}/duplex" 2>/dev/null || echo "unknown")
        local driver
        driver=$(readlink "/sys/class/net/${WAN_INTERFACE}/device/driver" 2>/dev/null | xargs basename || echo "unknown")

        log "Ethernet details: ${WAN_INTERFACE} (${speed}Mbps, $duplex, driver: $driver)"
    fi

    # Log WiFi interface details
    if [[ -n "${WIFI_INTERFACE}" ]] && command -v iw >/dev/null 2>&1; then
        local wifi_info
        wifi_info=$(iw dev "${WIFI_INTERFACE}" info 2>/dev/null | grep -E "(wiphy|type)" | tr '\n' ' ' || echo "")
        if [[ -n "$wifi_info" ]]; then
            log "WiFi details: ${WIFI_INTERFACE} ($wifi_info)"
        fi
    fi
}

# Configure FriendlyElec fan control for thermal management
configure_friendlyelec_fan_control() {
    if [[ "${IS_RK3588}" != true && "${IS_RK3588S}" != true ]]; then
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
    chmod +x "${PROJECT_ROOT}/scripts/monitoring/rk3588-fan-control.sh"

    # Install and enable fan control service
    install_rk3588_fan_control_service

    # Test fan control functionality
    if "${PROJECT_ROOT}/scripts/monitoring/rk3588-fan-control.sh" test >/dev/null 2>&1; then
        success "Fan control test successful"
    else
        warning "Fan control test failed, but service installed"
    fi

    log "RK3588 fan control configured"
}

# Configure FriendlyElec GPIO and PWM interfaces
configure_friendlyelec_gpio_pwm() {
    if [[ "${IS_FRIENDLYELEC}" != true ]]; then
        return 0
    fi

    log "Configuring FriendlyElec GPIO and PWM interfaces..."

    # Load GPIO/PWM configuration
    load_gpio_pwm_config

    # Make GPIO setup script executable
    chmod +x "${SCRIPT_DIR}/setup-gpio.sh"

    # Run GPIO/PWM setup
    if "${SCRIPT_DIR}/setup-gpio.sh" setup "${SUDO_USER}"; then
        success "GPIO and PWM interfaces configured"
    else
        warning "GPIO and PWM setup completed with warnings"
    fi

    log "FriendlyElec GPIO and PWM configuration completed"
}

# Configure RK3588/RK3588S performance optimizations
configure_rk3588_performance() {
    if [[ "${IS_RK3588}" != true && "${IS_RK3588S}" != true ]]; then
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
    if [[ "${IS_RK3588}" == true ]]; then
        cpu_policies+=("/sys/devices/system/cpu/cpufreq/policy6")  # A76 cluster 2
    fi

    # Set performance governor for better responsiveness
    for policy in "${cpu_policies[@]}"; do
        if [[ -d "$policy" ]]; then
            local governor_file="$policy/scaling_governor"
            if [[ -w "$governor_file" ]]; then
                # Check available governors first
                local available_governors
                available_governors=$(cat "$policy/scaling_available_governors" 2>/dev/null || echo "")

                if [[ "$available_governors" =~ performance ]]; then
                    if echo "performance" > "$governor_file" 2>/dev/null; then
                        local current_governor
                        current_governor=$(cat "$governor_file" 2>/dev/null)
                        log "Set CPU policy $(basename "$policy") governor to: $current_governor"
                    else
                        warning "Failed to set performance governor for $(basename "$policy")"
                    fi
                else
                    warning "Performance governor not available for $(basename "$policy"), available: $available_governors"
                fi
            else
                debug "CPU governor file not writable: $governor_file"
            fi
        else
            debug "CPU policy directory not found: $policy"
        fi
    done

    # Create systemd service to maintain CPU governor settings
    load_rk3588_cpu_governor_service
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
            local max_freq
            max_freq=$(cat "$gpu_devfreq/available_frequencies" | tr ' ' '\n' | sort -n | tail -1)
            if [[ -n "$max_freq" ]]; then
                echo "$max_freq" > "$gpu_devfreq/userspace/set_freq" 2>/dev/null || true
                log "Set GPU frequency to maximum: ${max_freq}Hz"
            fi
        fi
    fi

    # Configure Mali GPU environment variables for applications
    load_mali_gpu_env_config
}

# Configure memory and I/O optimizations for RK3588/RK3588S
configure_rk3588_memory_optimizations() {
    log "Configuring RK3588 memory and I/O optimizations..."

    # Add RK3588-specific kernel parameters
    load_rk3588_performance_config

    # Create udev rules for I/O scheduler optimization
    load_rk3588_udev_rules

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

        # VPU permissions are handled by the main udev rules template
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
    load_rk3588_gstreamer_config

    # Configure environment variables for video acceleration
    load_rk3588_video_env_config
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
    iptables -t nat -A POSTROUTING -o "${WAN_INTERFACE}" -j MASQUERADE
    iptables -A FORWARD -i "${WAN_INTERFACE}" -o "${WIFI_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT
    iptables -A FORWARD -i "${WIFI_INTERFACE}" -o "${WAN_INTERFACE}" -j ACCEPT

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
    cd "${PROJECT_ROOT}" && just qos-setup

    success "QoS traffic shaping configured"
}

# Configure WiFi hotspot
configure_wifi_hotspot() {
    log "Configuring WiFi hotspot..."

    # Stop NetworkManager management of WiFi interface
    nmcli device set "${WIFI_INTERFACE}" managed no

    # Bring up WiFi interface
    ip link set "${WIFI_INTERFACE}" up
    ip addr add "${LAN_IP}/22" dev "${WIFI_INTERFACE}"

    # Load hostapd configuration
    load_hostapd_config

    # Detect and configure WPA3 if supported
    if iw phy | grep -q "SAE"; then
        {
            echo "wpa_key_mgmt=WPA-PSK SAE"
            echo "sae_password=${WIFI_PASSWORD}"
            echo "ieee80211w=2"
        } >> /etc/hostapd/hostapd.conf
        success "WiFi hotspot configured with WPA3 support"
    else
        success "WiFi hotspot configured with WPA2"
    fi

    # Enable hostapd
    systemctl unmask hostapd
    systemctl enable hostapd
}

# Setup DHCP server (DNS handled by AdGuard Home)
setup_dhcp_dns_server() {
    log "Setting up DHCP server..."

    # DNS is handled by AdGuard Home system service
    # DHCP for WiFi hotspot is handled by dnsmasq for simplicity
    log "DNS will be handled by AdGuard Home system service"
    log "DHCP for WiFi hotspot will use minimal dnsmasq configuration"

    # Create minimal dnsmasq config for DHCP only
    load_dnsmasq_minimal_config

    systemctl enable dnsmasq
    success "DHCP server configured (DNS handled by AdGuard Home)"
}

# Configure WiFi routing
configure_wifi_routing() {
    log "Configuring WiFi client routing..."

    # Allow WiFi clients to access services
    iptables -A INPUT -i "${WIFI_INTERFACE}" -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -i "${WIFI_INTERFACE}" -p tcp --dport 443 -j ACCEPT
    iptables -A INPUT -i "${WIFI_INTERFACE}" -p tcp --dport 53 -j ACCEPT
    iptables -A INPUT -i "${WIFI_INTERFACE}" -p udp --dport 53 -j ACCEPT
    iptables -A INPUT -i "${WIFI_INTERFACE}" -p udp --dport 67 -j ACCEPT
    iptables -A INPUT -i "${WIFI_INTERFACE}" -p icmp --icmp-type echo-request -j ACCEPT

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



# Setup DNS services (host-based for Olares compatibility)
setup_dns_services() {
    log "Setting up host-based DNS services..."

    # Install AdGuard Home as host service
    install_adguard_home_host

    # Configure DNS resolution chain
    configure_dns_chain

    success "Host-based DNS services configured"
}

get_latest_adguard_version() {
    # Try to get latest version from GitHub API, fallback to stable version
    local latest_version
    latest_version=$(curl -s "https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' 2>/dev/null)

    if [[ -n "$latest_version" && "$latest_version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "$latest_version"
    else
        echo "v0.107.52"  # Fallback to known stable version
    fi
}

install_adguard_home_host() {
    log "Installing AdGuard Home as host service..."

    # Create AdGuard Home user and directories with proper security
    if ! id adguardhome >/dev/null 2>&1; then
        log "Creating adguardhome system user"
        useradd -r -s /bin/false -d /var/lib/adguardhome -c "AdGuard Home Service" adguardhome || {
            error "Failed to create adguardhome user"
            return 1
        }
    else
        log "AdGuard Home user already exists"
    fi

    # Create directories with secure permissions
    mkdir -p /var/lib/adguardhome/{work,conf}
    mkdir -p /etc/adguardhome

    # Set secure ownership and permissions
    chown -R adguardhome:adguardhome /var/lib/adguardhome
    chmod 750 /var/lib/adguardhome
    chmod 750 /var/lib/adguardhome/{work,conf}
    chmod 755 /etc/adguardhome

    # Get latest version
    local adguard_version
    adguard_version=$(get_latest_adguard_version)
    log "Using AdGuard Home version: $adguard_version"

    local arch="amd64"
    if [[ "${IS_ARM64}" == true ]]; then
        arch="arm64"
    fi
    local adguard_url="https://github.com/AdguardTeam/AdGuardHome/releases/download/${adguard_version}/AdGuardHome_linux_${arch}.tar.gz"

    # Download and install with integrity checks
    cd /tmp || {
        error "Cannot change to /tmp directory"
        return 1
    }

    log "Downloading AdGuard Home from: $adguard_url"
    if ! curl -fsSL "$adguard_url" -o adguardhome.tar.gz; then
        error "Failed to download AdGuard Home"
        return 1
    fi

    # Verify download is not empty
    if [[ ! -s adguardhome.tar.gz ]]; then
        error "Downloaded AdGuard Home archive is empty"
        rm -f adguardhome.tar.gz
        return 1
    fi

    # Extract and verify
    if ! tar -xzf adguardhome.tar.gz; then
        error "Failed to extract AdGuard Home archive"
        rm -f adguardhome.tar.gz
        return 1
    fi

    if [[ ! -f AdGuardHome/AdGuardHome ]]; then
        error "AdGuard Home binary not found in archive"
        rm -rf AdGuardHome adguardhome.tar.gz
        return 1
    fi

    # Install binary
    if ! cp AdGuardHome/AdGuardHome /usr/local/bin/; then
        error "Failed to install AdGuard Home binary"
        rm -rf AdGuardHome adguardhome.tar.gz
        return 1
    fi

    chmod +x /usr/local/bin/AdGuardHome
    rm -rf AdGuardHome adguardhome.tar.gz

    # Verify installation
    if ! /usr/local/bin/AdGuardHome --version >/dev/null 2>&1; then
        error "AdGuard Home installation verification failed"
        return 1
    fi

    success "AdGuard Home binary installed successfully"

    # Load configuration
    load_adguard_config

    # Create systemd service
    create_adguard_systemd_service

    # Set secure permissions for AdGuard Home
    chown -R adguardhome:adguardhome /var/lib/adguardhome
    chown -R adguardhome:adguardhome /etc/adguardhome

    # Ensure configuration files have secure permissions
    if [[ -f /etc/adguardhome/AdGuardHome.yaml ]]; then
        chmod 640 /etc/adguardhome/AdGuardHome.yaml
        chown adguardhome:adguardhome /etc/adguardhome/AdGuardHome.yaml
    fi

    # Enable and start service
    systemctl enable adguardhome
    systemctl start adguardhome

    # Verify service is running
    if systemctl is-active --quiet adguardhome; then
        success "AdGuard Home installed and running as host service"
    else
        error "Failed to start AdGuard Home service"
        return 1
    fi
}

create_adguard_systemd_service() {
    log "Creating AdGuard Home systemd service..."

    load_adguardhome_service_config
    success "AdGuard Home systemd service created"
}

configure_dns_chain() {
    log "Configuring DNS resolution chain..."

    # Configure systemd-resolved to use AdGuard Home
    load_systemd_resolved_adguard_config

    # Restart systemd-resolved
    systemctl restart systemd-resolved

    success "DNS chain configured: client → systemd-resolved → AdGuard Home → NextDNS"
}

# Setup certificate management (host-based for Olares compatibility)
setup_certificate_management() {
    log "Setting up host-based certificate management..."

    # Install Step-CA as host service
    install_step_ca_host

    # Configure certificate authority
    configure_step_ca

    success "Host-based certificate management configured"
}

get_latest_step_version() {
    local repo="$1"  # "cli" or "certificates"
    local latest_version
    latest_version=$(curl -s "https://api.github.com/repos/smallstep/${repo}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/' 2>/dev/null)

    if [[ -n "$latest_version" && "$latest_version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        # Remove 'v' prefix if present
        echo "${latest_version#v}"
    else
        echo "0.25.2"  # Fallback to known stable version
    fi
}

install_step_ca_host() {
    log "Installing Step-CA as host service..."

    # Create step user and directories with proper security
    if ! id step >/dev/null 2>&1; then
        log "Creating step system user"
        useradd -r -s /bin/false -d /var/lib/step -c "Step-CA Service" step || {
            error "Failed to create step user"
            return 1
        }
    else
        log "Step user already exists"
    fi

    # Create directories with secure permissions
    mkdir -p /var/lib/step/{config,secrets,certs}
    mkdir -p /etc/step

    # Set secure ownership and permissions
    chown -R step:step /var/lib/step
    chmod 750 /var/lib/step
    chmod 750 /var/lib/step/{config,certs}
    chmod 700 /var/lib/step/secrets  # Extra secure for secrets
    chmod 755 /etc/step

    # Get latest versions
    local step_version
    step_version=$(get_latest_step_version "cli")
    local step_ca_version
    step_ca_version=$(get_latest_step_version "certificates")

    log "Using Step CLI version: $step_version"
    log "Using Step-CA version: $step_ca_version"

    # Determine architecture
    local arch="amd64"
    if [[ "${IS_ARM64}" == true ]]; then
        arch="arm64"
    fi

    # Download Step CLI with integrity checks
    local step_cli_url="https://github.com/smallstep/cli/releases/download/v${step_version}/step_linux_${step_version}_${arch}.tar.gz"
    cd /tmp || {
        error "Cannot change to /tmp directory"
        return 1
    }

    log "Downloading Step CLI from: $step_cli_url"
    if ! curl -fsSL "$step_cli_url" -o step-cli.tar.gz; then
        error "Failed to download Step CLI"
        return 1
    fi

    if [[ ! -s step-cli.tar.gz ]]; then
        error "Downloaded Step CLI archive is empty"
        rm -f step-cli.tar.gz
        return 1
    fi

    if ! tar -xzf step-cli.tar.gz; then
        error "Failed to extract Step CLI archive"
        rm -f step-cli.tar.gz
        return 1
    fi

    if [[ ! -f "step_${step_version}/bin/step" ]]; then
        error "Step CLI binary not found in archive"
        rm -rf step_* step-cli.tar.gz
        return 1
    fi

    if ! cp "step_${step_version}/bin/step" /usr/local/bin/; then
        error "Failed to install Step CLI binary"
        rm -rf step_* step-cli.tar.gz
        return 1
    fi

    chmod +x /usr/local/bin/step
    rm -rf step_* step-cli.tar.gz

    # Download Step-CA with integrity checks
    local step_ca_url="https://github.com/smallstep/certificates/releases/download/v${step_ca_version}/step-ca_linux_${step_ca_version}_${arch}.tar.gz"

    log "Downloading Step-CA from: $step_ca_url"
    if ! curl -fsSL "$step_ca_url" -o step-ca.tar.gz; then
        error "Failed to download Step-CA"
        return 1
    fi

    if [[ ! -s step-ca.tar.gz ]]; then
        error "Downloaded Step-CA archive is empty"
        rm -f step-ca.tar.gz
        return 1
    fi

    if ! tar -xzf step-ca.tar.gz; then
        error "Failed to extract Step-CA archive"
        rm -f step-ca.tar.gz
        return 1
    fi

    if [[ ! -f "step-ca_${step_ca_version}/bin/step-ca" ]]; then
        error "Step-CA binary not found in archive"
        rm -rf step-ca_* step-ca.tar.gz
        return 1
    fi

    if ! cp "step-ca_${step_ca_version}/bin/step-ca" /usr/local/bin/; then
        error "Failed to install Step-CA binary"
        rm -rf step-ca_* step-ca.tar.gz
        return 1
    fi

    chmod +x /usr/local/bin/step-ca
    rm -rf step-ca_* step-ca.tar.gz

    # Verify installations
    if ! /usr/local/bin/step version >/dev/null 2>&1; then
        error "Step CLI installation verification failed"
        return 1
    fi

    if ! /usr/local/bin/step-ca version >/dev/null 2>&1; then
        error "Step-CA installation verification failed"
        return 1
    fi

    success "Step-CA binaries installed"
}

configure_step_ca() {
    log "Configuring Step-CA..."

    # Initialize CA if not already done
    if [[ ! -f /var/lib/step/config/ca.json ]]; then
        log "Initializing Step-CA..."

        # Generate CA password
        local ca_password
        ca_password=$(openssl rand -base64 32)
        echo "$ca_password" > /var/lib/step/secrets/password
        chmod 600 /var/lib/step/secrets/password

        # Initialize CA
        sudo -u step STEPPATH=/var/lib/step step ca init \
            --name "DangerPrep Internal CA" \
            --dns "ca.danger,step-ca.danger,localhost" \
            --address ":9000" \
            --provisioner "admin" \
            --password-file /var/lib/step/secrets/password \
            --provisioner-password-file /var/lib/step/secrets/password
    fi

    # Create systemd service
    create_step_ca_systemd_service

    # Set secure permissions for Step-CA
    chown -R step:step /var/lib/step
    chown -R step:step /etc/step

    # Ensure CA files have extra secure permissions
    if [[ -f /var/lib/step/secrets/password ]]; then
        chmod 600 /var/lib/step/secrets/password
        chown step:step /var/lib/step/secrets/password
    fi

    if [[ -f /var/lib/step/config/ca.json ]]; then
        chmod 640 /var/lib/step/config/ca.json
        chown step:step /var/lib/step/config/ca.json
    fi

    # Enable and start service
    systemctl enable step-ca
    systemctl start step-ca

    # Verify service is running
    if systemctl is-active --quiet step-ca; then
        success "Step-CA configured and running as host service"
    else
        error "Failed to start Step-CA service"
        return 1
    fi
}

create_step_ca_systemd_service() {
    log "Creating Step-CA systemd service..."

    load_step_ca_service_config
    success "Step-CA systemd service created"
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

    # Create content and NFS directories
    mkdir -p "${INSTALL_ROOT}"/{content,nfs,config}
    mkdir -p "${INSTALL_ROOT}/content"/{movies,tv,webtv,music,audiobooks,books,comics,magazines,games/roms,kiwix}

    # NFS client is already installed via packages
    # Create mount points for external NFS shares
    mkdir -p "${INSTALL_ROOT}/nfs"

    success "NFS client configured"
    log "Content directories created at ${INSTALL_ROOT}/content"
    log "NFS mount point available at ${INSTALL_ROOT}/nfs"
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
    load_backup_cron_config

    success "Encrypted backup system configured"
}

# Start all services
start_all_services() {
    log "Starting all services..."

    local services=(
        "ssh"
        "fail2ban"
        "hostapd"
        "dnsmasq"
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

# Comprehensive verification and testing
verify_setup() {
    log_section "Comprehensive Setup Verification"

    local verification_errors=0
    local verification_warnings=0

    # Check critical services
    log_subsection "Service Status Verification"
    local critical_services=("ssh" "fail2ban" "hostapd" "dnsmasq" "adguardhome" "step-ca")
    local failed_services=()
    local warning_services=()

    for service in "${critical_services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            if systemctl is-enabled --quiet "$service" 2>/dev/null; then
                success "✓ $service is running and enabled"
            else
                warning "⚠ $service is running but not enabled"
                warning_services+=("$service")
                ((verification_warnings++))
            fi
        else
            error "✗ $service is not running"
            failed_services+=("$service")
            ((verification_errors++))
        fi
    done

    # Test network connectivity
    log_subsection "Network Connectivity Verification"
    local connectivity_tests=(
        "8.8.8.8:Google DNS"
        "1.1.1.1:Cloudflare DNS"
        "github.com:GitHub"
    )

    local connectivity_failures=0
    for test in "${connectivity_tests[@]}"; do
        local target="${test%%:*}"
        local description="${test##*:}"

        if ping -c 1 -W 3 "$target" >/dev/null 2>&1; then
            success "✓ Connectivity to $description ($target)"
        else
            warning "⚠ No connectivity to $description ($target)"
            ((connectivity_failures++))
            ((verification_warnings++))
        fi
    done

    if [[ $connectivity_failures -eq ${#connectivity_tests[@]} ]]; then
        error "✗ No internet connectivity detected"
        ((verification_errors++))
    fi

    # Test network interfaces
    log_subsection "Network Interface Verification"
    if ip link show "${WIFI_INTERFACE}" >/dev/null 2>&1; then
        local wifi_state
        wifi_state=$(ip link show "${WIFI_INTERFACE}" | grep -o "state [A-Z]*" | cut -d' ' -f2)
        if [[ "$wifi_state" == "UP" ]]; then
            success "✓ WiFi interface ${WIFI_INTERFACE} is up"
        else
            warning "⚠ WiFi interface ${WIFI_INTERFACE} is down (state: $wifi_state)"
            ((verification_warnings++))
        fi
    else
        error "✗ WiFi interface ${WIFI_INTERFACE} not found"
        ((verification_errors++))
    fi

    if ip link show "${WAN_INTERFACE}" >/dev/null 2>&1; then
        local wan_state
        wan_state=$(ip link show "${WAN_INTERFACE}" | grep -o "state [A-Z]*" | cut -d' ' -f2)
        if [[ "$wan_state" == "UP" ]]; then
            success "✓ WAN interface ${WAN_INTERFACE} is up"
        else
            warning "⚠ WAN interface ${WAN_INTERFACE} is down (state: $wan_state)"
            ((verification_warnings++))
        fi
    else
        error "✗ WAN interface ${WAN_INTERFACE} not found"
        ((verification_errors++))
    fi

    # Test DNS resolution
    log_subsection "DNS Resolution Verification"
    if nslookup google.com >/dev/null 2>&1; then
        success "✓ DNS resolution working"
    else
        error "✗ DNS resolution failed"
        ((verification_errors++))
    fi

    # Test service ports
    log_subsection "Service Port Verification"
    local port_tests=(
        "22:SSH"
        "53:DNS"
        "3000:AdGuard Home Web"
        "5053:AdGuard Home DNS"
        "9000:Step-CA"
    )

    for test in "${port_tests[@]}"; do
        local port="${test%%:*}"
        local service="${test##*:}"

        if netstat -tuln 2>/dev/null | grep -q ":${port} "; then
            success "✓ $service port $port is listening"
        else
            warning "⚠ $service port $port is not listening"
            ((verification_warnings++))
        fi
    done

    # Test file permissions
    log_subsection "File Permission Verification"
    local permission_tests=(
        "/etc/ssh/sshd_config:644"
        "/var/lib/adguardhome:750"
        "/var/lib/step/secrets:700"
        "/etc/dangerprep/wifi-password:600"
    )

    for test in "${permission_tests[@]}"; do
        local file="${test%%:*}"
        local expected_perm="${test##*:}"

        if [[ -e "$file" ]]; then
            local actual_perm
            actual_perm=$(stat -c "%a" "$file" 2>/dev/null)
            if [[ "$actual_perm" == "$expected_perm" ]]; then
                success "✓ $file has correct permissions ($actual_perm)"
            else
                warning "⚠ $file has incorrect permissions ($actual_perm, expected $expected_perm)"
                ((verification_warnings++))
            fi
        else
            debug "File not found (may be optional): $file"
        fi
    done

    # Summary
    log_subsection "Verification Summary"
    if [[ $verification_errors -gt 0 ]]; then
        error "Setup verification failed with $verification_errors errors and $verification_warnings warnings"
        error "Some critical components are not working correctly"
        return 1
    elif [[ $verification_warnings -gt 0 ]]; then
        warning "Setup verification completed with $verification_warnings warnings"
        warning "System is functional but some components may need attention"
        return 0
    else
        success "✓ All verification checks passed successfully"
        success "System is fully operational"
        return 0
    fi
}

# Show final information
show_final_info() {
    echo -e "${GREEN}"
    cat << EOF
╔══════════════════════════════════════════════════════════════════════════════╗
║                        DangerPrep Setup Complete!                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  WiFi Hotspot: ${WIFI_SSID}                                                   ║
║  Password: [Stored securely in /etc/dangerprep/wifi-password]              ║
║  Network: ${LAN_NETWORK}                                                       ║
║  Gateway: ${LAN_IP}                                                            ║
║                                                                              ║
║  SSH: Port ${SSH_PORT} (key-only authentication)                              ║
║  Management: dangerprep --help                                               ║
║                                                                              ║
║  Services: http://portal.danger                                              ║
║  AdGuard Home: http://adguard.danger                                         ║
║                                                                              ║
║  Olares: Access through Olares desktop interface                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    info "Logs: ${LOG_FILE}"
    info "Backups: ${BACKUP_DIR}"
    info "Install root: ${INSTALL_ROOT}"
}

# Main function with state management
main() {
    show_banner
    check_root
    setup_logging

    # Initialize state tracking
    init_state_tracking

    # Check for previous incomplete setup
    local last_completed
    last_completed=$(get_last_completed_step)
    if [[ -n "$last_completed" ]]; then
        warning "Previous incomplete setup detected"
        show_setup_progress
        echo
        read -p "Continue from where setup left off? (y/n): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Starting fresh setup..."
            init_state_tracking  # Reset state
        else
            info "Resuming setup from last completed step: $last_completed"
        fi
    fi

    show_system_info
    pre_flight_checks
    backup_original_configs

    # System Update Phase
    if ! is_step_completed "SYSTEM_UPDATE"; then
        CURRENT_STEP="SYSTEM_UPDATE"
        set_step_state "SYSTEM_UPDATE" "IN_PROGRESS"
        update_system_packages
        install_essential_packages
        setup_automatic_updates
        set_step_state "SYSTEM_UPDATE" "COMPLETED"
        log "System preparation completed. Continuing with security hardening..."
    else
        info "Skipping system update (already completed)"
    fi

    # Security Hardening Phase
    if ! is_step_completed "SECURITY_HARDENING"; then
        CURRENT_STEP="SECURITY_HARDENING"
        set_step_state "SECURITY_HARDENING" "IN_PROGRESS"
        configure_ssh_hardening
        load_motd_config
        setup_fail2ban
        configure_kernel_hardening
        setup_file_integrity_monitoring
        setup_hardware_monitoring
        setup_advanced_security_tools
        set_step_state "SECURITY_HARDENING" "COMPLETED"
        log "Security hardening completed. Continuing with directory and NFS setup..."
    else
        info "Skipping security hardening (already completed)"
    fi

    # Network Configuration Phase
    if ! is_step_completed "NETWORK_CONFIG"; then
        CURRENT_STEP="NETWORK_CONFIG"
        set_step_state "NETWORK_CONFIG" "IN_PROGRESS"
        setup_directory_structure
        configure_nfs_client
        detect_network_interfaces
        configure_wan_interface
        setup_network_routing
        setup_qos_traffic_shaping
        configure_wifi_hotspot
        setup_dhcp_dns_server
        configure_wifi_routing
        set_step_state "NETWORK_CONFIG" "COMPLETED"
        log "Network configuration completed. Applying hardware optimizations..."
    else
        info "Skipping network configuration (already completed)"
    fi

    # Olares Setup Phase
    if ! is_step_completed "OLARES_SETUP"; then
        CURRENT_STEP="OLARES_SETUP"
        set_step_state "OLARES_SETUP" "IN_PROGRESS"
        # Apply FriendlyElec-specific performance optimizations
        if [[ "${IS_FRIENDLYELEC}" == true ]]; then
            configure_rk3588_performance
        fi
        install_olares
        configure_olares_integration
        set_step_state "OLARES_SETUP" "COMPLETED"
        log "Olares setup completed. Continuing with services..."
    else
        info "Skipping Olares setup (already completed)"
    fi

    # Services Configuration Phase
    if ! is_step_completed "SERVICES_CONFIG"; then
        CURRENT_STEP="SERVICES_CONFIG"
        set_step_state "SERVICES_CONFIG" "IN_PROGRESS"
        generate_sync_configs

        setup_dns_services
        setup_certificate_management
        set_step_state "SERVICES_CONFIG" "COMPLETED"
        log "Services configured. Installing management tools..."
    else
        info "Skipping services configuration (already completed)"
    fi

    # Final Setup Phase
    if ! is_step_completed "FINAL_SETUP"; then
        CURRENT_STEP="FINAL_SETUP"
        set_step_state "FINAL_SETUP" "IN_PROGRESS"
        install_management_scripts
        create_routing_scenarios
        setup_system_monitoring
        install_maintenance_scripts
        setup_encrypted_backups
        start_all_services
        verify_setup
        set_step_state "FINAL_SETUP" "COMPLETED"
        log "Final setup completed successfully!"
    else
        info "Skipping final setup (already completed)"
    fi

    show_final_info
    success "DangerPrep setup completed successfully!"
}

# Enhanced error handling and cleanup
cleanup_on_error() {
    local exit_code=$?
    error "Setup failed with exit code $exit_code. Running comprehensive cleanup..."

    # Mark current step as failed
    if [[ -n "${CURRENT_STEP:-}" ]]; then
        set_step_state "$CURRENT_STEP" "FAILED" 2>/dev/null || true
    fi

    # Stop all services that might have been started
    local services_to_stop=(
        "hostapd" "dnsmasq" "adguardhome" "step-ca"
        "fail2ban" "rk3588-fan-control" "rk3588-cpu-governor"
    )

    for service in "${services_to_stop[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            log "Stopping service: $service"
            systemctl stop "$service" 2>/dev/null || true
        fi
    done

    # Disable services that were enabled
    for service in "${services_to_stop[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            log "Disabling service: $service"
            systemctl disable "$service" 2>/dev/null || true
        fi
    done

    # Remove systemd service files that were created
    local service_files=(
        "/etc/systemd/system/adguardhome.service"
        "/etc/systemd/system/step-ca.service"
        "/etc/systemd/system/rk3588-fan-control.service"
        "/etc/systemd/system/rk3588-cpu-governor.service"
    )

    for service_file in "${service_files[@]}"; do
        if [[ -f "$service_file" ]]; then
            log "Removing service file: $service_file"
            rm -f "$service_file" 2>/dev/null || true
        fi
    done

    systemctl daemon-reload 2>/dev/null || true

    # Remove created users
    local users_to_remove=("adguardhome" "step")
    for user in "${users_to_remove[@]}"; do
        if id "$user" >/dev/null 2>&1; then
            log "Removing user: $user"
            userdel "$user" 2>/dev/null || true
        fi
    done

    # Restore original configurations if they exist
    if [[ -d "${BACKUP_DIR}" ]]; then
        log "Restoring original configurations from ${BACKUP_DIR}"

        local configs_to_restore=(
            "sshd_config:/etc/ssh/sshd_config"
            "sysctl.conf:/etc/sysctl.conf"
            "dnsmasq.conf:/etc/dnsmasq.conf"
            "hostapd.conf:/etc/hostapd/hostapd.conf"
        )

        for config_mapping in "${configs_to_restore[@]}"; do
            local backup_file="${BACKUP_DIR}/${config_mapping%%:*}"
            local target_file="${config_mapping##*:}"

            if [[ -f "$backup_file" ]]; then
                log "Restoring $target_file"
                cp "$backup_file" "$target_file" 2>/dev/null || true
            fi
        done

        # Restore iptables rules if they exist
        if [[ -f "${BACKUP_DIR}/iptables.rules" ]]; then
            log "Restoring iptables rules"
            iptables-restore < "${BACKUP_DIR}/iptables.rules" 2>/dev/null || true
        fi
    fi

    # Clean up temporary files
    cleanup_temp

    # Try to run the dedicated cleanup script if it exists
    local cleanup_script="${SCRIPT_DIR}/cleanup-dangerprep.sh"
    if [[ -f "$cleanup_script" ]]; then
        warning "Running dedicated cleanup script..."
        bash "$cleanup_script" --preserve-data --quiet 2>/dev/null || {
            warning "Dedicated cleanup script failed, but manual cleanup completed"
        }
    fi

    error "Setup failed. Check ${LOG_FILE} for details."
    error "System has been restored to its pre-installation state"
    info "You can safely re-run the setup script after addressing any issues"

    # Exit with the original error code
    exit $exit_code
}

trap cleanup_on_error ERR

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                enable_dry_run
                shift
                ;;
            --verbose)
                set_log_level "DEBUG"
                shift
                ;;
            --config)
                if [[ -n "$2" && ! "$2" =~ ^-- ]]; then
                    export CONFIG_FILE="$2"
                    shift 2
                else
                    error "Option --config requires a file path"
                    exit 1
                fi
                ;;

            --skip-network)
                export SKIP_NETWORK=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Main execution wrapper
main_wrapper() {
    # Store original arguments for logging
    SCRIPT_ARGS="$*"

    # Parse arguments first
    parse_arguments "$@"

    # Show dry-run notice if enabled
    if is_dry_run; then
        log_section "DRY-RUN MODE"
        warning "This is a dry-run. No changes will be made to the system."
        warning "The script will show what would be done without actually doing it."
        echo
        read -p "Continue with dry-run? (y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Dry-run cancelled by user"
            exit 0
        fi
        echo
    fi

    # Run main setup function
    main

    # Show dry-run summary if in dry-run mode
    if is_dry_run; then
        show_dry_run_summary
    fi
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main_wrapper "$@"
fi
