#!/bin/bash
# DangerPrep Tailscale Setup Script
# Configures Tailscale with subnet routing and exit node functionality

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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root"
    exit 1
fi

# Configuration
SUBNET="192.168.120.0/22"
TAILSCALE_AUTH_KEY="${TAILSCALE_AUTH_KEY:-}"

install_tailscale() {
    log "Installing Tailscale..."

    # Check if already installed
    if command -v tailscale > /dev/null 2>&1; then
        warning "Tailscale already installed"
        return 0
    fi

    # Detect OS and install accordingly
    if command -v apt > /dev/null 2>&1; then
        # Ubuntu/Debian installation
        curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
        curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list
        apt update
        apt install -y tailscale

        # Enable and start service
        systemctl enable tailscaled
        systemctl start tailscaled
    elif command -v opkg > /dev/null 2>&1; then
        # OpenWrt installation
        opkg update
        opkg install tailscale

        # Enable and start service
        /etc/init.d/tailscale enable
        /etc/init.d/tailscale start
    else
        error "Unsupported package manager"
        exit 1
    fi

    success "Tailscale installed"
}

configure_tailscale() {
    log "Configuring Tailscale..."
    
    # Check if auth key is provided
    if [[ -z "$TAILSCALE_AUTH_KEY" ]]; then
        error "TAILSCALE_AUTH_KEY environment variable not set"
        echo "Please set your Tailscale auth key:"
        echo "export TAILSCALE_AUTH_KEY='your-auth-key-here'"
        exit 1
    fi
    
    # Authenticate with Tailscale
    log "Authenticating with Tailscale..."
    tailscale up --authkey="$TAILSCALE_AUTH_KEY" \
        --advertise-routes="$SUBNET" \
        --advertise-exit-node \
        --accept-routes \
        --hostname="dangerprep"
    
    success "Tailscale authenticated and configured"
}

configure_firewall() {
    log "Configuring firewall for Tailscale..."

    # Detect OS and configure firewall accordingly
    if command -v iptables > /dev/null 2>&1 && command -v systemctl > /dev/null 2>&1; then
        # Ubuntu/systemd-based system

        # Allow Tailscale UDP port
        iptables -A INPUT -p udp --dport 41641 -j ACCEPT

        # Allow forwarding between Tailscale and LAN interfaces
        iptables -A FORWARD -i tailscale0 -j ACCEPT
        iptables -A FORWARD -o tailscale0 -j ACCEPT

        # Enable masquerading for Tailscale subnet advertisement
        iptables -t nat -A POSTROUTING -s 100.64.0.0/10 -j MASQUERADE

        # Save iptables rules
        mkdir -p /etc/iptables
        iptables-save > /etc/iptables/rules.v4

        # Enable IP forwarding
        echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
        echo 'net.ipv6.conf.all.forwarding=1' >> /etc/sysctl.conf
        sysctl -p

    elif command -v uci > /dev/null 2>&1; then
        # OpenWrt system

        # Create Tailscale zone
        uci set firewall.tailscale=zone
        uci set firewall.tailscale.name='tailscale'
        uci set firewall.tailscale.input='ACCEPT'
        uci set firewall.tailscale.output='ACCEPT'
        uci set firewall.tailscale.forward='ACCEPT'
        uci set firewall.tailscale.masq='1'
        uci set firewall.tailscale.device='tailscale0'

        # Allow forwarding from Tailscale to LAN
        uci set firewall.tailscale_lan=forwarding
        uci set firewall.tailscale_lan.src='tailscale'
        uci set firewall.tailscale_lan.dest='lan'

        # Allow forwarding from LAN to Tailscale
        uci set firewall.lan_tailscale=forwarding
        uci set firewall.lan_tailscale.src='lan'
        uci set firewall.lan_tailscale.dest='tailscale'

        # Allow Tailscale traffic
        uci set firewall.allow_tailscale=rule
        uci set firewall.allow_tailscale.name='Allow Tailscale'
        uci set firewall.allow_tailscale.src='*'
        uci set firewall.allow_tailscale.dest_port='41641'
        uci set firewall.allow_tailscale.proto='udp'
        uci set firewall.allow_tailscale.target='ACCEPT'

        # Commit changes
        uci commit firewall
        /etc/init.d/firewall restart
    else
        warning "Unknown firewall system, manual configuration required"
    fi

    success "Firewall configured for Tailscale"
}

configure_routing() {
    log "Configuring routing for subnet advertisement..."
    
    # Enable IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    echo 'net.ipv6.conf.all.forwarding=1' >> /etc/sysctl.conf
    sysctl -p
    
    # Configure static routes if needed
    # This will be handled by Tailscale automatically
    
    success "Routing configured"
}

setup_dns_integration() {
    log "Setting up DNS integration..."
    
    # Configure dnsmasq to use Tailscale DNS
    echo "server=100.100.100.100" >> /etc/dnsmasq.conf
    
    # Add .danger domain resolution
    cat >> /etc/dnsmasq.conf << EOF

# DangerPrep local domains
address=/jellyfin.danger/192.168.120.1
address=/komga.danger/192.168.120.1
address=/kiwix.danger/192.168.120.1
address=/portal.danger/192.168.120.1
address=/router.danger/192.168.120.1
address=/portainer.danger/192.168.120.1
EOF
    
    # Restart dnsmasq
    /etc/init.d/dnsmasq restart
    
    success "DNS integration configured"
}

verify_setup() {
    log "Verifying Tailscale setup..."
    
    # Check Tailscale status
    if tailscale status | grep -q "dangerprep"; then
        success "Tailscale is running and connected"
    else
        error "Tailscale setup verification failed"
        return 1
    fi
    
    # Check subnet routes
    if tailscale status | grep -q "$SUBNET"; then
        success "Subnet routes advertised"
    else
        warning "Subnet routes may not be advertised correctly"
    fi
    
    # Check exit node
    if tailscale status | grep -q "exit node"; then
        success "Exit node functionality enabled"
    else
        warning "Exit node may not be enabled"
    fi
    
    # Test connectivity to NAS
    if ping -c 1 -W 2 100.65.182.27 > /dev/null 2>&1; then
        success "NAS connectivity test passed"
    else
        warning "Cannot reach NAS - may need to approve routes in Tailscale admin"
    fi
}

create_monitoring_script() {
    log "Creating Tailscale monitoring script..."
    
    cat > /usr/local/bin/tailscale-monitor.sh << 'EOF'
#!/bin/bash
# Tailscale monitoring and auto-restart script

LOG_FILE="/var/log/tailscale-monitor.log"

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check if Tailscale is running
if ! pgrep -f tailscaled > /dev/null; then
    log_message "Tailscale daemon not running, restarting..."
    /etc/init.d/tailscale restart
    sleep 10
fi

# Check if connected to Tailscale network
if ! tailscale status | grep -q "100."; then
    log_message "Not connected to Tailscale network, attempting reconnection..."
    tailscale up
fi

# Check connectivity to NAS
if ! ping -c 1 -W 2 100.65.182.27 > /dev/null 2>&1; then
    log_message "Cannot reach NAS via Tailscale"
fi

log_message "Tailscale monitoring check completed"
EOF
    
    chmod +x /usr/local/bin/tailscale-monitor.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/tailscale-monitor.sh") | crontab -
    
    success "Tailscale monitoring script created"
}

show_status() {
    log "Tailscale Status:"
    echo
    tailscale status
    echo
    
    log "Network Configuration:"
    ip route show | grep tailscale || echo "No Tailscale routes found"
    echo
    
    log "Firewall Status:"
    iptables -L | grep -i tailscale || echo "No Tailscale firewall rules found"
}

show_help() {
    echo "DangerPrep Tailscale Setup Script"
    echo "Usage: $0 {install|configure|status|help}"
    echo
    echo "Commands:"
    echo "  install    - Install and configure Tailscale"
    echo "  configure  - Configure existing Tailscale installation"
    echo "  status     - Show Tailscale status"
    echo "  help       - Show this help message"
    echo
    echo "Environment Variables:"
    echo "  TAILSCALE_AUTH_KEY - Tailscale authentication key (required)"
}

# Main script logic
case "$1" in
    install)
        install_tailscale
        configure_tailscale
        configure_firewall
        configure_routing
        setup_dns_integration
        create_monitoring_script
        verify_setup
        success "Tailscale setup completed!"
        ;;
    configure)
        configure_tailscale
        configure_firewall
        configure_routing
        setup_dns_integration
        verify_setup
        success "Tailscale configuration completed!"
        ;;
    status)
        show_status
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        error "Invalid command: $1"
        show_help
        exit 1
        ;;
esac
