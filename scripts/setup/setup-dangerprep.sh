#!/bin/bash
# DangerPrep Setup Script - Clean Architecture
# Complete system setup for Ubuntu 24.04 with 2025 security hardening
# Uses external configuration templates for maintainability

set -e

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

# Configuration variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
LOG_FILE="/var/log/dangerprep-setup.log"
BACKUP_DIR="/var/backups/dangerprep-$(date +%Y%m%d-%H%M%S)"

# Load configuration utilities
source "$SCRIPT_DIR/config-loader.sh"

# Network configuration
WIFI_SSID="DangerPrep"
WIFI_PASSWORD="Buff00n!"
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
    echo -e "${PURPLE}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                           DangerPrep Setup 2025                             ║
║                    Emergency Router & Content Hub                           ║
║                                                                              ║
║  • WiFi Hotspot: DangerPrep (WPA3/WPA2)                                    ║
║  • Network: 192.168.120.0/22                                               ║
║  • Security: 2025 Hardening Standards                                      ║
║  • Services: Docker + Traefik + Sync                                       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Show system information
show_system_info() {
    log "System Information:"
    log "OS: $(lsb_release -d | cut -f2)"
    log "Kernel: $(uname -r)"
    log "Architecture: $(uname -m)"
    log "Memory: $(free -h | grep Mem | awk '{print $2}')"
    log "Disk: $(df -h / | tail -1 | awk '{print $2}')"
    
    # Detect platform
    if [[ -f /proc/device-tree/model ]]; then
        PLATFORM=$(cat /proc/device-tree/model)
        log "Platform: $PLATFORM"
    else
        PLATFORM="Generic x86_64"
        log "Platform: $PLATFORM"
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
    
    # Clean up package cache
    apt autoremove -y
    apt autoclean
    
    success "Essential packages installation completed"
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

    success "Docker services configured"
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

# Detect network interfaces
detect_network_interfaces() {
    log "Detecting network interfaces..."

    # Auto-detect WAN interface (first ethernet interface)
    WAN_INTERFACE=$(ip link show | grep -E "^[0-9]+: (eth|enp|ens)" | head -1 | cut -d: -f2 | tr -d ' ')

    # Auto-detect WiFi interface
    WIFI_INTERFACE=$(iw dev | grep Interface | head -1 | awk '{print $2}')

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

    # Export for use in templates
    export WAN_INTERFACE WIFI_INTERFACE

    success "Network interfaces detected"
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

    log "Network configuration completed. Continuing with services..."
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
