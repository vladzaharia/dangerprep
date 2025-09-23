#!/bin/bash

# RaspAP DNS Configuration Script for DangerPrep Integration
# This script configures RaspAP to forward DNS queries appropriately

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Check if RaspAP container is running
check_raspap_running() {
    if ! docker ps --format "{{.Names}}" | grep -q "^raspap$"; then
        error "RaspAP container is not running"
        error "Please start RaspAP first: docker compose up -d"
        exit 1
    fi
    log "RaspAP container is running"
}

# Configure DNS forwarding in RaspAP
configure_dns_forwarding() {
    log "Configuring DNS forwarding for DangerPrep integration..."

    # Create dnsmasq configuration for DNS forwarding
    local dns_config="/tmp/raspap-dns-config"

    cat > "$dns_config" << 'EOF'
# DangerPrep DNS Integration Configuration
# Forward local domains to CoreDNS on port 5353
server=/danger/127.0.0.1#5353
server=/danger.diy/127.0.0.1#5353
server=/argos.surf/127.0.0.1#5353

# Forward all other domains to AdGuard for filtering
server=127.0.0.1#3000

# Local domain settings
local=/danger/
local=/danger.diy/
local=/argos.surf/
domain=danger
expand-hosts

# Cache settings for performance
cache-size=1000
neg-ttl=60
EOF

    # Copy configuration to RaspAP container
    docker cp "$dns_config" raspap:/etc/dnsmasq.d/99-dangerprep-dns.conf

    # Remove temporary file
    rm -f "$dns_config"

    log "DNS configuration file created in RaspAP container"
}

# Restart dnsmasq service in RaspAP
restart_dnsmasq() {
    log "Restarting dnsmasq service in RaspAP..."

    # Restart dnsmasq to apply new configuration
    if docker exec raspap systemctl restart dnsmasq 2>/dev/null; then
        log "dnsmasq restarted successfully"
    elif docker exec raspap service dnsmasq restart 2>/dev/null; then
        log "dnsmasq restarted successfully (using service command)"
    elif docker exec raspap killall -HUP dnsmasq 2>/dev/null; then
        log "dnsmasq configuration reloaded"
    else
        warn "Could not restart dnsmasq automatically"
        warn "Please restart dnsmasq manually via RaspAP web interface"
    fi
}

# Display configuration summary
show_configuration_summary() {
    log "DNS Configuration Summary:"
    echo
    echo "DNS Forwarding Rules:"
    echo "  • .danger domains → CoreDNS (127.0.0.1:5353)"
    echo "  • .danger.diy domains → CoreDNS (127.0.0.1:5353)"
    echo "  • .argos.surf domains → CoreDNS (127.0.0.1:5353)"
    echo "  • Other domains → AdGuard (127.0.0.1:3000)"
    echo
    echo "Configuration file: /etc/dnsmasq.d/99-dangerprep-dns.conf"
    echo
    echo "To verify configuration:"
    echo "  docker exec raspap cat /etc/dnsmasq.d/99-dangerprep-dns.conf"
    echo
    echo "Web interface: http://wifi.danger or http://192.168.120.1"
}

# Main function
main() {
    log "Configuring RaspAP DNS forwarding for DangerPrep..."
    echo

    check_raspap_running
    configure_dns_forwarding
    restart_dnsmasq

    echo
    show_configuration_summary

    log "DNS configuration complete!"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi