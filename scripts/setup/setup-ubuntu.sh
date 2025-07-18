#!/bin/bash
# Ubuntu 24.04 Setup Script for NanoPi R6C/M6 (RK3588S Platform)
# Converts OpenWRT/FriendlyWRT configurations to Ubuntu equivalents

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
LOG_FILE="/var/log/dangerprep-ubuntu-setup.log"

# Network configuration
LAN_NETWORK="192.168.120.0/22"
LAN_IP="192.168.120.1"
WIFI_SSID="DangerPrep"
WIFI_PASSWORD="emergency2024"

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Display banner
show_banner() {
    echo -e "${GREEN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                    DangerPrep Ubuntu Setup                  ║"
    echo "║                NanoPi R6C/M6 (RK3588S Platform)             ║"
    echo "║                     Ubuntu 24.04 LTS                        ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# System information
show_system_info() {
    log "System Information:"
    echo "  OS: $(lsb_release -d | cut -f2)"
    echo "  Kernel: $(uname -r)"
    echo "  Architecture: $(uname -m)"
    echo "  Hostname: $(hostname)"
    echo "  IP Address: $(hostname -I | awk '{print $1}')"
    echo "  Install Root: $INSTALL_ROOT"
}

# Update system packages (replaces opkg update)
update_system() {
    log "Updating system packages..."
    
    # Update package lists
    apt update
    
    # Upgrade existing packages
    apt upgrade -y
    
    success "System updated successfully"
}

# Install essential packages (replaces OpenWRT opkg packages)
install_system_packages() {
    log "Installing essential system packages..."
    
    # Essential packages (Ubuntu equivalents of OpenWRT packages)
    local packages=(
        # Network tools
        "network-manager"           # Replaces netifd
        "hostapd"                  # WiFi AP functionality
        "dnsmasq"                  # DNS/DHCP server (same as OpenWRT)
        "iptables-persistent"      # Firewall rules persistence
        "bridge-utils"             # Network bridging
        "wireless-tools"           # WiFi utilities
        "wpasupplicant"           # WiFi client authentication
        
        # System utilities
        "curl"                     # HTTP client
        "wget"                     # File downloader
        "rsync"                    # File synchronization
        "htop"                     # Process monitor
        "nano"                     # Text editor
        "vim"                      # Advanced text editor
        "bc"                       # Calculator
        "jq"                       # JSON processor
        "tree"                     # Directory tree viewer
        
        # Development tools
        "git"                      # Version control
        "build-essential"          # Compilation tools
        "python3"                  # Python interpreter
        "python3-pip"              # Python package manager
        
        # Container and virtualization
        "docker.io"                # Docker engine
        "docker-compose"           # Docker Compose
        
        # Storage and filesystem
        "nfs-common"               # NFS client (replaces nfs-utils)
        "smartmontools"            # Disk monitoring
        "parted"                   # Disk partitioning
        
        # Monitoring and logging
        "systemd-journal-remote"   # Log management
        "logrotate"                # Log rotation
        
        # Security
        "ufw"                      # Uncomplicated Firewall
        "fail2ban"                 # Intrusion prevention
        
        # Hardware support
        "linux-firmware"           # Hardware firmware
        "firmware-realtek"         # Realtek WiFi firmware (if available)
    )
    
    for package in "${packages[@]}"; do
        log "Installing $package..."
        if apt install -y "$package" 2>/dev/null; then
            success "Installed $package"
        else
            warning "Failed to install $package (may not be available)"
        fi
    done
    
    success "System packages installed"
}

# Configure Docker (replaces OpenWRT Docker setup)
setup_docker() {
    log "Setting up Docker..."
    
    # Add user to docker group
    usermod -aG docker $SUDO_USER 2>/dev/null || true
    
    # Enable and start Docker service
    systemctl enable docker
    systemctl start docker
    
    # Test Docker installation
    if docker --version > /dev/null 2>&1; then
        success "Docker installed and running"
    else
        error "Docker installation failed"
        exit 1
    fi
}

# Configure network interfaces (replaces OpenWRT UCI network config)
setup_network_interfaces() {
    log "Configuring network interfaces..."

    # Detect network interfaces
    local ethernet_interfaces=($(ip link show | grep -E "^[0-9]+: en" | cut -d: -f2 | tr -d ' '))
    local wifi_interfaces=($(ip link show | grep -E "^[0-9]+: wl" | cut -d: -f2 | tr -d ' '))

    log "Detected interfaces:"
    echo "  Ethernet: ${ethernet_interfaces[*]}"
    echo "  WiFi: ${wifi_interfaces[*]}"

    # Detect platform (R6C has 2 Ethernet ports, M6 has 1)
    local platform="unknown"
    if [ ${#ethernet_interfaces[@]} -eq 2 ]; then
        platform="R6C"
        log "Detected NanoPi R6C (dual Ethernet)"
    elif [ ${#ethernet_interfaces[@]} -eq 1 ]; then
        platform="M6"
        log "Detected NanoPi M6 (single Ethernet)"
    fi

    # Create netplan configuration based on platform
    if [ "$platform" = "R6C" ]; then
        # R6C: Configure both Ethernet ports
        cat > /etc/netplan/01-dangerprep.yaml << EOF
# DangerPrep Network Configuration - NanoPi R6C
network:
  version: 2
  renderer: NetworkManager
  ethernets:
    ${ethernet_interfaces[0]}:
      dhcp4: true
      dhcp6: false
      optional: true
    ${ethernet_interfaces[1]}:
      dhcp4: false
      dhcp6: false
      addresses:
        - $LAN_IP/22
      optional: true
  wifis:
    ${wifi_interfaces[0]:-wlan0}:
      dhcp4: false
      dhcp6: false
      optional: true
      access-points: {}
EOF
    else
        # M6 or single Ethernet: Configure single port as flexible
        cat > /etc/netplan/01-dangerprep.yaml << EOF
# DangerPrep Network Configuration - NanoPi M6
network:
  version: 2
  renderer: NetworkManager
  ethernets:
    ${ethernet_interfaces[0]:-enp1s0}:
      dhcp4: true
      dhcp6: false
      optional: true
  wifis:
    ${wifi_interfaces[0]:-wlan0}:
      dhcp4: false
      dhcp6: false
      optional: true
      access-points: {}
EOF
    fi

    # Apply netplan configuration
    netplan apply

    success "Network interfaces configured for $platform"
}

# Setup WiFi drivers (replaces OpenWRT wireless drivers)
setup_wifi_drivers() {
    log "Setting up WiFi drivers..."
    
    # Check for RTL8822CE (common in NanoPi boards)
    if lspci | grep -i "rtl8822ce" > /dev/null; then
        log "RTL8822CE detected, ensuring driver is loaded..."
        modprobe rtw88_8822ce || warning "Failed to load RTL8822CE driver"
    fi
    
    # Check for USB WiFi adapters
    if lsusb | grep -i "realtek\|ralink\|atheros" > /dev/null; then
        log "USB WiFi adapter detected"
        # Load common USB WiFi drivers
        modprobe rtl8812au 2>/dev/null || true
        modprobe rt2800usb 2>/dev/null || true
        modprobe ath9k_htc 2>/dev/null || true
    fi
    
    # List available WiFi interfaces
    local wifi_interfaces=($(iw dev | grep Interface | awk '{print $2}'))
    if [ ${#wifi_interfaces[@]} -gt 0 ]; then
        success "WiFi interfaces available: ${wifi_interfaces[*]}"
    else
        warning "No WiFi interfaces detected"
    fi
}

# Configure firewall (replaces OpenWRT firewall4/UCI)
setup_firewall() {
    log "Configuring firewall..."
    
    # Disable UFW (we'll use iptables directly)
    ufw --force disable
    
    # Clear existing iptables rules
    iptables -F
    iptables -t nat -F
    iptables -t mangle -F
    iptables -X
    
    # Set default policies
    iptables -P INPUT ACCEPT
    iptables -P FORWARD ACCEPT
    iptables -P OUTPUT ACCEPT
    
    # Allow loopback traffic
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A OUTPUT -o lo -j ACCEPT
    
    # Allow established connections
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    
    # Allow SSH (port 22)
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT
    
    # Allow HTTP/HTTPS (ports 80, 443)
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT
    
    # Allow DNS (port 53)
    iptables -A INPUT -p tcp --dport 53 -j ACCEPT
    iptables -A INPUT -p udp --dport 53 -j ACCEPT
    
    # Allow DHCP (port 67)
    iptables -A INPUT -p udp --dport 67 -j ACCEPT
    
    # Save iptables rules
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
    
    # Enable iptables-persistent service
    systemctl enable netfilter-persistent
    
    success "Firewall configured"
}

# Setup DNS and DHCP (replaces OpenWRT dnsmasq config)
setup_dns_dhcp() {
    log "Configuring DNS and DHCP..."
    
    # Backup original dnsmasq configuration
    cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup 2>/dev/null || true
    
    # Create DangerPrep dnsmasq configuration
    cat > /etc/dnsmasq.d/dangerprep.conf << EOF
# DangerPrep DNS and DHCP Configuration

# Interface binding
interface=wlan0
bind-interfaces

# DHCP configuration
dhcp-range=192.168.120.100,192.168.120.200,12h
dhcp-option=3,$LAN_IP  # Default gateway
dhcp-option=6,$LAN_IP  # DNS server

# DNS configuration
server=1.1.1.1
server=8.8.8.8
server=2606:4700:4700::1111
server=2001:4860:4860::8888

# Local domain
domain=dangerprep.local
expand-hosts

# Cache settings
cache-size=1000
neg-ttl=60

# Logging
log-queries
log-dhcp

# Security
bogus-priv
domain-needed
stop-dns-rebind
rebind-localhost-ok
EOF
    
    # Enable and start dnsmasq
    systemctl enable dnsmasq
    systemctl start dnsmasq
    
    success "DNS and DHCP configured"
}

# Setup Tailscale (Ubuntu version, replaces OpenWRT Tailscale)
setup_tailscale() {
    log "Setting up Tailscale..."
    
    # Add Tailscale repository
    curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
    curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list
    
    # Update package list and install Tailscale
    apt update
    apt install -y tailscale
    
    # Enable Tailscale service
    systemctl enable tailscaled
    systemctl start tailscaled
    
    success "Tailscale installed (run 'tailscale up' to connect)"
}

# Create system directories
create_directories() {
    log "Creating system directories..."
    
    # Create DangerPrep directories
    mkdir -p "$INSTALL_ROOT"/{data,content,nfs,docker,scripts,config}
    mkdir -p "$INSTALL_ROOT/data"/{backups,logs,cache}
    mkdir -p /var/log/dangerprep
    mkdir -p /etc/dangerprep
    
    # Set proper permissions
    chown -R $SUDO_USER:$SUDO_USER "$INSTALL_ROOT" 2>/dev/null || true
    chmod -R 755 "$INSTALL_ROOT"
    
    success "Directories created"
}

# Install Just command runner (replaces make)
install_just() {
    log "Installing Just command runner..."
    
    # Download and install just
    curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin
    
    # Verify installation
    if just --version > /dev/null 2>&1; then
        success "Just installed successfully"
    else
        warning "Just installation may have failed"
    fi
}

# Create routing scenario scripts
create_routing_scripts() {
    log "Creating routing scenario scripts..."
    
    # Create scripts directory
    mkdir -p /usr/local/bin
    
    # Create scenario management script
    cat > /usr/local/bin/dangerprep-router << 'EOF'
#!/bin/bash
# DangerPrep Router Management Script

SCENARIO_DIR="/etc/dangerprep/scenarios"
CURRENT_SCENARIO_FILE="/var/lib/dangerprep/current-scenario"

case "$1" in
    "scenario1"|"eth-to-wifi")
        echo "Starting Scenario 1: Ethernet WAN → WiFi AP"
        /usr/local/bin/dangerprep-scenario1 start
        echo "scenario1" > "$CURRENT_SCENARIO_FILE"
        ;;
    "scenario2"|"wifi-client")
        echo "Starting Scenario 2: WiFi Client → Ethernet LAN"
        /usr/local/bin/dangerprep-scenario2 start "$2" "$3"
        echo "scenario2" > "$CURRENT_SCENARIO_FILE"
        ;;
    "scenario3"|"emergency")
        echo "Starting Scenario 3: Emergency Local Network"
        /usr/local/bin/dangerprep-scenario3 start
        echo "scenario3" > "$CURRENT_SCENARIO_FILE"
        ;;
    "stop")
        echo "Stopping current routing scenario..."
        current=$(cat "$CURRENT_SCENARIO_FILE" 2>/dev/null || echo "none")
        case "$current" in
            "scenario1") /usr/local/bin/dangerprep-scenario1 stop ;;
            "scenario2") /usr/local/bin/dangerprep-scenario2 stop ;;
            "scenario3") /usr/local/bin/dangerprep-scenario3 stop ;;
        esac
        echo "none" > "$CURRENT_SCENARIO_FILE"
        ;;
    "status")
        current=$(cat "$CURRENT_SCENARIO_FILE" 2>/dev/null || echo "none")
        echo "Current scenario: $current"
        case "$current" in
            "scenario1") /usr/local/bin/dangerprep-scenario1 status ;;
            "scenario2") /usr/local/bin/dangerprep-scenario2 status ;;
            "scenario3") /usr/local/bin/dangerprep-scenario3 status ;;
            *) echo "No active scenario" ;;
        esac
        ;;
    *)
        echo "Usage: $0 {scenario1|scenario2|scenario3|stop|status}"
        echo "  scenario1 - Ethernet WAN → WiFi AP"
        echo "  scenario2 <ssid> <password> - WiFi Client → Ethernet LAN"
        echo "  scenario3 - Emergency Local Network"
        exit 1
        ;;
esac
EOF
    
    chmod +x /usr/local/bin/dangerprep-router
    
    # Create state directory
    mkdir -p /var/lib/dangerprep
    
    success "Routing scripts created"
}

# Main installation function
main() {
    show_banner
    check_root
    show_system_info
    
    log "Starting Ubuntu 24.04 setup for DangerPrep..."
    
    update_system
    install_system_packages
    setup_docker
    setup_network_interfaces
    setup_wifi_drivers
    setup_firewall
    setup_dns_dhcp
    setup_tailscale
    create_directories
    install_just
    create_routing_scripts
    
    success "Ubuntu 24.04 setup completed successfully!"
    
    echo
    echo "Next steps:"
    echo "1. Reboot the system: sudo reboot"
    echo "2. Test WiFi interfaces: iw dev"
    echo "3. Configure Tailscale: sudo tailscale up"
    echo "4. Start a routing scenario: sudo dangerprep-router scenario1"
    echo "5. Deploy Docker services: just deploy"
    echo
    echo "Log file: $LOG_FILE"
}

# Handle command line arguments
case "${1:-install}" in
    "install")
        main 2>&1 | tee "$LOG_FILE"
        ;;
    "test")
        log "Testing system configuration..."
        # Add test functions here
        ;;
    *)
        echo "Usage: $0 {install|test}"
        exit 1
        ;;
esac
