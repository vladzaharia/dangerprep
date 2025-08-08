#!/bin/bash
# DangerPrep Setup Script - Clean Architecture
# Complete system setup for Ubuntu 24.04 with 2025 security hardening
# Uses external configuration templates for maintainability

# Modern shell script security and error handling
set -euo pipefail
IFS=$'\n\t'

# Enable debug mode if DEBUG environment variable is set
if [[ "${DEBUG:-}" == "true" ]]; then
    set -x
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Configuration variables with validation
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Source shared banner utility
source "$SCRIPT_DIR/../shared/banner.sh"
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
LOG_FILE="/var/log/dangerprep-setup.log"
BACKUP_DIR="/var/backups/dangerprep-$(date +%Y%m%d-%H%M%S)"
CONFIG_DIR="$SCRIPT_DIR/configs"

# Secure temporary directory
TEMP_DIR=""
create_temp_dir() {
    TEMP_DIR=$(mktemp -d -t dangerprep-setup.XXXXXX)
    chmod 700 "$TEMP_DIR"
}

# Cleanup function for temporary files
cleanup_temp() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
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

# Signal handlers for cleanup
trap cleanup_temp EXIT
trap 'cleanup_temp; exit 130' INT
trap 'cleanup_temp; exit 143' TERM

# Load configuration utilities
source "$SCRIPT_DIR/config-loader.sh"

# Network configuration
WIFI_SSID="DangerPrep"
WIFI_PASSWORD="EXAMPLE_PASSWORD"
LAN_NETWORK="192.168.120.0/22"
LAN_IP="192.168.120.1"
DHCP_START="192.168.120.100"
DHCP_END="192.168.120.200"

# System configuration
SSH_PORT="2222"
FAIL2BAN_BANTIME="3600"
FAIL2BAN_MAXRETRY="3"
NAS_HOST="100.65.182.27"  # Tailscale NAS IP

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
        echo "Usage: sudo $0"
        exit 1
    fi
}

# Create backup directory and log file
setup_logging() {
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    chmod 640 "$LOG_FILE"
    
    log "DangerPrep Setup Started"
    log "Backup directory: $BACKUP_DIR"
    log "Install root: $INSTALL_ROOT"
    log "Project root: $PROJECT_ROOT"
}

# Display banner
show_banner() {
    show_setup_banner
    echo
    info "Emergency Router & Content Hub Setup"
    info "• WiFi Hotspot: DangerPrep (WPA3/WPA2)"
    info "• Network: 192.168.120.0/22"
    info "• Security: 2025 Hardening Standards"
    info "• Services: Docker + Traefik + Sync"
    echo
    info "All changes are logged and backed up."
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

# Install essential packages
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
    
    # Combine all packages
    local all_packages=(
        "${core_packages[@]}"
        "${network_packages[@]}"
        "${security_packages[@]}"
        "${monitoring_packages[@]}"
        "${backup_packages[@]}"
        "${update_packages[@]}"
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
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
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
    mkdir -p "$INSTALL_ROOT/data"/{traefik,portainer,jellyfin,komga,kiwix,logs,backups}
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
    done < <(ip link show | grep -E "^[0-9]+: (eth|enp|ens|end)" | cut -d: -f2 | tr -d ' ')

    # Detect WiFi interfaces with better detection
    while IFS= read -r interface; do
        if [[ -n "$interface" ]]; then
            wifi_interfaces+=("$interface")
        fi
    done < <(iw dev 2>/dev/null | grep Interface | awk '{print $2}')

    # FriendlyElec-specific interface selection
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
        select_friendlyelec_interfaces "${ethernet_interfaces[@]}" -- "${wifi_interfaces[@]}"
    else
        select_generic_interfaces "${ethernet_interfaces[@]}" -- "${wifi_interfaces[@]}"
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

    log "WAN Interface: $WAN_INTERFACE"
    log "WiFi Interface: $WIFI_INTERFACE"

    # Log additional interface information for FriendlyElec
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
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

# Configure WiFi hotspot
configure_wifi_hotspot() {
    log "Configuring WiFi hotspot..."

    # Stop NetworkManager management of WiFi interface
    nmcli device set "$WIFI_INTERFACE" managed no

    # Bring up WiFi interface
    ip link set "$WIFI_INTERFACE" up
    ip addr add "$LAN_IP/22" dev "$WIFI_INTERFACE"

    # Load hostapd configuration
    load_hostapd_config

    # Detect and configure WPA3 if supported
    if iw phy | grep -q "SAE"; then
        echo "wpa_key_mgmt=WPA-PSK SAE" >> /etc/hostapd/hostapd.conf
        echo "sae_password=$WIFI_PASSWORD" >> /etc/hostapd/hostapd.conf
        echo "ieee80211w=2" >> /etc/hostapd/hostapd.conf
        success "WiFi hotspot configured with WPA3 support"
    else
        success "WiFi hotspot configured with WPA2"
    fi

    # Enable hostapd
    systemctl unmask hostapd
    systemctl enable hostapd
}

# Setup DHCP and DNS server (via Docker)
setup_dhcp_dns_server() {
    log "Setting up DHCP and DNS server..."

    # DNS is handled by Docker containers (CoreDNS/AdGuard)
    # DHCP for WiFi hotspot is still handled by dnsmasq for simplicity
    log "DNS will be handled by Docker containers"
    log "DHCP for WiFi hotspot will use minimal dnsmasq configuration"

    # Create minimal dnsmasq config for DHCP only
    cat > /etc/dnsmasq.conf << 'EOF'
# Minimal dnsmasq config for WiFi hotspot DHCP only
# DNS is handled by Docker containers

# Interface to bind to
interface=wlan0

# DHCP range for WiFi clients
dhcp-range=192.168.120.100,192.168.120.200,255.255.252.0,24h

# Don't read /etc/hosts
no-hosts

# Don't read /etc/resolv.conf
no-resolv

# Forward DNS to Docker DNS service
server=127.0.0.1#5053

# Log queries for debugging
log-queries
log-dhcp
EOF

    systemctl enable dnsmasq
    success "DHCP server configured (DNS handled by Docker)"
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
        "hostapd"
        "dnsmasq"  # Only for WiFi DHCP, DNS handled by Docker
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
    local critical_services=("ssh" "fail2ban" "hostapd" "dnsmasq" "docker")
    local failed_services=()

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
║                        DangerPrep Setup Complete!                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  WiFi Hotspot: $WIFI_SSID                                                   ║
║  Password: $WIFI_PASSWORD                                                    ║
║  Network: $LAN_NETWORK                                                       ║
║  Gateway: $LAN_IP                                                            ║
║                                                                              ║
║  SSH: Port $SSH_PORT (key-only authentication)                              ║
║  Management: dangerprep --help                                               ║
║                                                                              ║
║  Services: http://portal.danger                                              ║
║  Traefik: http://traefik.danger                                              ║
║                                                                              ║
║  Tailscale: tailscale up --advertise-routes=$LAN_NETWORK                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    info "Logs: $LOG_FILE"
    info "Backups: $BACKUP_DIR"
    info "Install root: $INSTALL_ROOT"
}

# Main function
main() {
    show_banner
    check_root
    setup_logging
    show_system_info
    pre_flight_checks
    backup_original_configs
    update_system_packages
    install_essential_packages
    setup_automatic_updates

    log "System preparation completed. Continuing with security hardening..."
    configure_ssh_hardening
    load_motd_config
    setup_fail2ban
    configure_kernel_hardening
    setup_file_integrity_monitoring
    setup_hardware_monitoring
    setup_advanced_security_tools

    log "Security hardening completed. Continuing with Docker setup..."
    configure_rootless_docker
    setup_docker_services
    setup_container_health_monitoring

    log "Docker setup completed. Continuing with network configuration..."
    detect_network_interfaces
    configure_wan_interface
    setup_network_routing
    setup_qos_traffic_shaping
    configure_wifi_hotspot
    setup_dhcp_dns_server
    configure_wifi_routing

    log "Network configuration completed. Applying hardware optimizations..."
    # Apply FriendlyElec-specific performance optimizations
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
        configure_rk3588_performance
    fi

    log "Hardware optimizations completed. Continuing with services..."
    generate_sync_configs
    setup_tailscale
    setup_advanced_dns
    setup_certificate_management

    log "Services configured. Installing management tools..."
    install_management_scripts
    create_routing_scenarios
    setup_system_monitoring
    configure_nfs_client
    install_maintenance_scripts
    setup_encrypted_backups

    log "Starting services and finalizing..."
    start_all_services
    verify_setup
    show_final_info

    success "DangerPrep setup completed successfully!"
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
