#!/bin/bash
# DangerPrep DNS Setup Script
# Configures split-tunnel DNS with DoH/DoT and .danger domain resolution

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
ROUTER_IP="192.168.120.1"
DOH_PROVIDER="https://1.1.1.1/dns-query"
DOT_PROVIDER="1.1.1.1"

install_dns_packages() {
    log "Installing DNS packages..."

    # Detect OS and install accordingly
    if command -v apt > /dev/null 2>&1; then
        # Ubuntu/Debian system
        apt update

        # Install DNS packages
        apt install -y dnsmasq
        apt install -y stubby || warning "Stubby not available"

        # For DoH, we'll use cloudflared or configure stubby
        if ! command -v cloudflared > /dev/null 2>&1; then
            log "Installing cloudflared for DoH support..."
            wget -O /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
            chmod +x /usr/local/bin/cloudflared
        fi

    elif command -v opkg > /dev/null 2>&1; then
        # OpenWrt system
        opkg update

        # Install https-dns-proxy for DoH
        opkg install https-dns-proxy

        # Install stubby for DoT (if available)
        opkg install stubby || warning "Stubby not available, using DoH only"
    else
        error "Unsupported package manager"
        exit 1
    fi

    success "DNS packages installed"
}

configure_dnsmasq() {
    log "Configuring dnsmasq..."
    
    # Backup original configuration
    cp /etc/dnsmasq.conf /etc/dnsmasq.conf.backup
    
    # Create new dnsmasq configuration
    cat > /etc/dnsmasq.conf << EOF
# DangerPrep DNS Configuration

# Basic settings
port=53
domain-needed
bogus-priv
no-resolv
no-poll
server=127.0.0.1#5053  # https-dns-proxy
server=127.0.0.1#5054  # Backup DoH

# Cache settings
cache-size=1000
neg-ttl=60

# DHCP settings
dhcp-range=192.168.120.100,192.168.121.254,255.255.252.0,12h
dhcp-option=option:router,$ROUTER_IP
dhcp-option=option:dns-server,$ROUTER_IP

# Local domain resolution (.danger domains)
local=/danger/
domain=danger
expand-hosts

# Service addresses
address=/jellyfin.danger/$ROUTER_IP
address=/komga.danger/$ROUTER_IP
address=/kiwix.danger/$ROUTER_IP
address=/portal.danger/$ROUTER_IP
address=/router.danger/$ROUTER_IP
address=/portainer.danger/$ROUTER_IP

# Tailscale DNS integration
server=100.100.100.100  # Tailscale DNS

# Block common ad domains (optional)
address=/doubleclick.net/0.0.0.0
address=/googleadservices.com/0.0.0.0
address=/googlesyndication.com/0.0.0.0

# Log queries for debugging (disable in production)
log-queries
log-facility=/var/log/dnsmasq.log
EOF
    
    success "dnsmasq configured"
}

configure_https_dns_proxy() {
    log "Configuring https-dns-proxy for DoH..."
    
    # Configure https-dns-proxy
    cat > /etc/config/https-dns-proxy << EOF
config https-dns-proxy
    option bootstrap_dns '1.1.1.1,1.0.0.1'
    option resolver_url '$DOH_PROVIDER'
    option listen_addr '127.0.0.1'
    option listen_port '5053'
    option user 'nobody'
    option group 'nogroup'
    option subnet_addr '192.168.120.0/22'

config https-dns-proxy
    option bootstrap_dns '8.8.8.8,8.8.4.4'
    option resolver_url 'https://8.8.8.8/dns-query'
    option listen_addr '127.0.0.1'
    option listen_port '5054'
    option user 'nobody'
    option group 'nogroup'
    option subnet_addr '192.168.120.0/22'
EOF
    
    # Enable and start https-dns-proxy
    /etc/init.d/https-dns-proxy enable
    /etc/init.d/https-dns-proxy start
    
    success "https-dns-proxy configured"
}

configure_stubby() {
    log "Configuring Stubby for DoT..."
    
    if ! command -v stubby > /dev/null 2>&1; then
        warning "Stubby not available, skipping DoT configuration"
        return 0
    fi
    
    # Configure Stubby
    cat > /etc/stubby/stubby.yml << EOF
resolution_type: GETDNS_RESOLUTION_STUB
dns_transport_list:
  - GETDNS_TRANSPORT_TLS
tls_authentication: GETDNS_AUTHENTICATION_REQUIRED
tls_query_padding_blocksize: 128
edns_client_subnet_private: 1
round_robin_upstreams: 1
idle_timeout: 10000
listen_addresses:
  - 127.0.0.1@5055
  - 0::1@5055

upstream_recursive_servers:
  - address_data: $DOT_PROVIDER
    tls_auth_name: "cloudflare-dns.com"
  - address_data: 8.8.8.8
    tls_auth_name: "dns.google"
  - address_data: 9.9.9.9
    tls_auth_name: "dns.quad9.net"
EOF
    
    # Enable and start Stubby
    /etc/init.d/stubby enable
    /etc/init.d/stubby start
    
    success "Stubby configured for DoT"
}

configure_firewall_dns() {
    log "Configuring firewall for DNS..."
    
    # Allow DNS traffic
    uci set firewall.allow_dns=rule
    uci set firewall.allow_dns.name='Allow DNS'
    uci set firewall.allow_dns.src='lan'
    uci set firewall.allow_dns.dest_port='53'
    uci set firewall.allow_dns.proto='tcp udp'
    uci set firewall.allow_dns.target='ACCEPT'
    
    # Block direct external DNS (force through our resolver)
    uci set firewall.block_external_dns=rule
    uci set firewall.block_external_dns.name='Block External DNS'
    uci set firewall.block_external_dns.src='lan'
    uci set firewall.block_external_dns.dest='wan'
    uci set firewall.block_external_dns.dest_port='53'
    uci set firewall.block_external_dns.proto='tcp udp'
    uci set firewall.block_external_dns.target='REJECT'
    
    # Allow DoH/DoT traffic
    uci set firewall.allow_doh=rule
    uci set firewall.allow_doh.name='Allow DoH/DoT'
    uci set firewall.allow_doh.src='*'
    uci set firewall.allow_doh.dest_port='443 853'
    uci set firewall.allow_doh.proto='tcp'
    uci set firewall.allow_doh.target='ACCEPT'
    
    # Commit firewall changes
    uci commit firewall
    /etc/init.d/firewall restart
    
    success "Firewall configured for DNS"
}

create_dns_monitoring() {
    log "Creating DNS monitoring script..."
    
    cat > /usr/local/bin/dns-monitor.sh << 'EOF'
#!/bin/bash
# DNS monitoring and health check script

LOG_FILE="/var/log/dns-monitor.log"

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check dnsmasq
if ! pgrep dnsmasq > /dev/null; then
    log_message "dnsmasq not running, restarting..."
    /etc/init.d/dnsmasq restart
fi

# Check https-dns-proxy
if ! pgrep https-dns-proxy > /dev/null; then
    log_message "https-dns-proxy not running, restarting..."
    /etc/init.d/https-dns-proxy restart
fi

# Test DNS resolution
if ! nslookup google.com 127.0.0.1 > /dev/null 2>&1; then
    log_message "DNS resolution test failed"
fi

# Test .danger domain resolution
if ! nslookup portal.danger 127.0.0.1 > /dev/null 2>&1; then
    log_message ".danger domain resolution failed"
fi

# Test DoH connectivity
if ! curl -s --max-time 5 https://1.1.1.1/dns-query > /dev/null; then
    log_message "DoH connectivity test failed"
fi

log_message "DNS monitoring check completed"
EOF
    
    chmod +x /usr/local/bin/dns-monitor.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/dns-monitor.sh") | crontab -
    
    success "DNS monitoring script created"
}

test_dns_resolution() {
    log "Testing DNS resolution..."
    
    # Test external resolution
    if nslookup google.com 127.0.0.1 > /dev/null 2>&1; then
        success "External DNS resolution working"
    else
        error "External DNS resolution failed"
    fi
    
    # Test .danger domain resolution
    if nslookup portal.danger 127.0.0.1 > /dev/null 2>&1; then
        success ".danger domain resolution working"
    else
        error ".danger domain resolution failed"
    fi
    
    # Test DoH
    if curl -s --max-time 5 "$DOH_PROVIDER" > /dev/null; then
        success "DoH connectivity working"
    else
        warning "DoH connectivity test failed"
    fi
    
    # Show DNS servers being used
    log "Active DNS configuration:"
    cat /etc/resolv.conf
}

restart_dns_services() {
    log "Restarting DNS services..."
    
    /etc/init.d/dnsmasq restart
    /etc/init.d/https-dns-proxy restart
    
    if command -v stubby > /dev/null 2>&1; then
        /etc/init.d/stubby restart
    fi
    
    success "DNS services restarted"
}

show_dns_status() {
    log "DNS Service Status:"
    echo
    
    echo "dnsmasq: $(pgrep dnsmasq > /dev/null && echo "Running" || echo "Stopped")"
    echo "https-dns-proxy: $(pgrep https-dns-proxy > /dev/null && echo "Running" || echo "Stopped")"
    
    if command -v stubby > /dev/null 2>&1; then
        echo "stubby: $(pgrep stubby > /dev/null && echo "Running" || echo "Stopped")"
    fi
    
    echo
    log "DNS Query Test:"
    echo "External: $(nslookup google.com 127.0.0.1 > /dev/null 2>&1 && echo "OK" || echo "FAILED")"
    echo ".danger domains: $(nslookup portal.danger 127.0.0.1 > /dev/null 2>&1 && echo "OK" || echo "FAILED")"
    echo "DoH connectivity: $(curl -s --max-time 5 "$DOH_PROVIDER" > /dev/null && echo "OK" || echo "FAILED")"
}

show_help() {
    echo "DangerPrep DNS Setup Script"
    echo "Usage: $0 {install|configure|test|restart|status|help}"
    echo
    echo "Commands:"
    echo "  install    - Install and configure DNS services"
    echo "  configure  - Configure existing DNS installation"
    echo "  test       - Test DNS resolution"
    echo "  restart    - Restart DNS services"
    echo "  status     - Show DNS service status"
    echo "  help       - Show this help message"
}

# Main script logic
case "$1" in
    install)
        install_dns_packages
        configure_dnsmasq
        configure_https_dns_proxy
        configure_stubby
        configure_firewall_dns
        create_dns_monitoring
        restart_dns_services
        test_dns_resolution
        success "DNS setup completed!"
        ;;
    configure)
        configure_dnsmasq
        configure_https_dns_proxy
        configure_stubby
        restart_dns_services
        test_dns_resolution
        success "DNS configuration completed!"
        ;;
    test)
        test_dns_resolution
        ;;
    restart)
        restart_dns_services
        ;;
    status)
        show_dns_status
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
