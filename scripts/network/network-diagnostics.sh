#!/bin/bash
# DangerPrep Network Diagnostics Script
# Essential network troubleshooting tools for emergency router scenarios

set -e

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../shared/functions.sh"

# Initialize environment
init_environment

# Show help
show_help() {
    echo "DangerPrep Network Diagnostics Script"
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  connectivity     Test internet and local network connectivity"
    echo "  interfaces       Show network interface status and configuration"
    echo "  routes           Display routing table and gateway information"
    echo "  dns              Test DNS resolution and configuration"
    echo "  ports            Check open ports and listening services"
    echo "  wifi             Scan and diagnose WiFi connectivity"
    echo "  speed            Test network speed (basic)"
    echo "  all              Run all diagnostic tests"
    echo "  help             Show this help message"
    echo
    echo "Examples:"
    echo "  $0 all           # Run all network diagnostics"
    echo "  $0 connectivity  # Test connectivity only"
    echo "  $0 wifi          # WiFi diagnostics only"
}

# Test connectivity
test_connectivity() {
    log "Testing network connectivity..."
    echo
    
    # Test local connectivity
    echo "Local Network:"
    local gateway
    gateway=$(ip route | grep default | head -1 | awk '{print $3}')
    if [[ -n "$gateway" ]]; then
        if ping -c 3 -W 2 "$gateway" >/dev/null 2>&1; then
            echo "  Gateway ($gateway): ✓ Reachable"
        else
            echo "  Gateway ($gateway): ✗ Unreachable"
        fi
    else
        echo "  Gateway: ✗ No default gateway found"
    fi
    
    # Test internet connectivity
    echo
    echo "Internet Connectivity:"
    local test_hosts=("8.8.8.8" "1.1.1.1" "9.9.9.9")
    local reachable=0
    
    for host in "${test_hosts[@]}"; do
        if ping -c 2 -W 2 "$host" >/dev/null 2>&1; then
            echo "  $host: ✓ Reachable"
            ((reachable++))
        else
            echo "  $host: ✗ Unreachable"
        fi
    done
    
    if [[ $reachable -gt 0 ]]; then
        success "Internet connectivity: $reachable/${#test_hosts[@]} hosts reachable"
    else
        error "No internet connectivity detected"
    fi
}

# Show interface status
show_interfaces() {
    log "Network interface diagnostics..."
    echo
    
    echo "Interface Status:"
    ip -br addr show | while read -r interface status addresses; do
        echo "  $interface: $status"
        if [[ "$status" == "UP" ]] && [[ -n "$addresses" ]]; then
            echo "    Addresses: $addresses"
        fi
    done
    
    echo
    echo "Interface Statistics:"
    for interface in $(ip -o link show | awk -F': ' '{print $2}' | grep -v lo); do
        if [[ -f "/sys/class/net/$interface/statistics/rx_bytes" ]]; then
            local rx_bytes tx_bytes
            rx_bytes=$(cat "/sys/class/net/$interface/statistics/rx_bytes")
            tx_bytes=$(cat "/sys/class/net/$interface/statistics/tx_bytes")
            local rx_mb tx_mb
            rx_mb=$((rx_bytes / 1024 / 1024))
            tx_mb=$((tx_bytes / 1024 / 1024))
            echo "  $interface: RX ${rx_mb}MB, TX ${tx_mb}MB"
        fi
    done
}

# Show routing information
show_routes() {
    log "Routing diagnostics..."
    echo
    
    echo "Routing Table:"
    ip route show | head -10
    
    echo
    echo "Default Gateway:"
    ip route | grep default || echo "  No default gateway configured"
    
    echo
    echo "ARP Table (recent):"
    ip neigh show | head -10 || echo "  No ARP entries"
}

# Test DNS resolution
test_dns() {
    log "DNS diagnostics..."
    echo
    
    echo "DNS Configuration:"
    if [[ -f /etc/resolv.conf ]]; then
        grep nameserver /etc/resolv.conf | head -3
    fi
    
    echo
    echo "DNS Resolution Test:"
    local test_domains=("google.com" "cloudflare.com" "github.com")
    
    for domain in "${test_domains[@]}"; do
        if nslookup "$domain" >/dev/null 2>&1; then
            echo "  $domain: ✓ Resolves"
        else
            echo "  $domain: ✗ Failed to resolve"
        fi
    done
    
    # Test reverse DNS
    echo
    echo "Reverse DNS Test:"
    if nslookup 8.8.8.8 >/dev/null 2>&1; then
        echo "  8.8.8.8: ✓ Reverse lookup works"
    else
        echo "  8.8.8.8: ✗ Reverse lookup failed"
    fi
}

# Check open ports
check_ports() {
    log "Port diagnostics..."
    echo
    
    echo "Listening Ports:"
    if command -v ss >/dev/null 2>&1; then
        ss -tuln | head -15
    elif command -v netstat >/dev/null 2>&1; then
        netstat -tuln | head -15
    else
        echo "  No port scanning tools available (ss/netstat)"
    fi
    
    echo
    echo "Common Service Ports:"
    local common_ports=("22:SSH" "53:DNS" "80:HTTP" "443:HTTPS" "67:DHCP")
    
    for port_info in "${common_ports[@]}"; do
        local port="${port_info%:*}"
        local service="${port_info#*:}"
        if ss -tuln 2>/dev/null | grep -q ":$port " || netstat -tuln 2>/dev/null | grep -q ":$port "; then
            echo "  $service ($port): ✓ Listening"
        else
            echo "  $service ($port): ✗ Not listening"
        fi
    done
}

# WiFi diagnostics
wifi_diagnostics() {
    log "WiFi diagnostics..."
    echo
    
    # Find WiFi interfaces
    local wifi_interfaces=()
    while IFS= read -r interface; do
        wifi_interfaces+=("$interface")
    done < <(iw dev 2>/dev/null | grep Interface | awk '{print $2}' || true)
    
    if [[ ${#wifi_interfaces[@]} -eq 0 ]]; then
        echo "No WiFi interfaces found"
        return
    fi
    
    for interface in "${wifi_interfaces[@]}"; do
        echo "WiFi Interface: $interface"
        
        # Interface status
        if ip link show "$interface" | grep -q "state UP"; then
            echo "  Status: UP"
        else
            echo "  Status: DOWN"
        fi
        
        # Current connection
        if iw dev "$interface" link 2>/dev/null | grep -q "Connected"; then
            echo "  Connection: Connected"
            iw dev "$interface" link 2>/dev/null | grep SSID || true
        else
            echo "  Connection: Not connected"
        fi
        
        # Available networks (limited scan)
        echo "  Available Networks:"
        if iw dev "$interface" scan 2>/dev/null | grep "SSID:" | head -5 | sed 's/^/    /'; then
            true
        else
            echo "    Scan failed or no networks found"
        fi
        echo
    done
}

# Basic speed test
speed_test() {
    log "Basic network speed test..."
    echo
    
    echo "Testing download speed (basic)..."
    if command -v curl >/dev/null 2>&1; then
        # Download a small file and measure speed
        local start_time end_time duration speed
        start_time=$(date +%s.%N)
        if curl -s -o /dev/null "http://speedtest.ftp.otenet.gr/files/test1Mb.db" --max-time 10; then
            end_time=$(date +%s.%N)
            duration=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "1")
            speed=$(echo "scale=2; 1 / $duration" | bc -l 2>/dev/null || echo "unknown")
            echo "  Approximate speed: ${speed} MB/s"
        else
            echo "  Speed test failed - no internet connectivity"
        fi
    else
        echo "  curl not available for speed test"
    fi
}

# Run all diagnostics
run_all() {
    show_banner "DangerPrep Network Diagnostics"
    echo
    
    test_connectivity
    echo
    
    show_interfaces
    echo
    
    show_routes
    echo
    
    test_dns
    echo
    
    check_ports
    echo
    
    wifi_diagnostics
    echo
    
    speed_test
    echo
    
    success "Network diagnostics completed"
}

# Main function
main() {
    case "${1:-all}" in
        connectivity)
            test_connectivity
            ;;
        interfaces)
            show_interfaces
            ;;
        routes)
            show_routes
            ;;
        dns)
            test_dns
            ;;
        ports)
            check_ports
            ;;
        wifi)
            wifi_diagnostics
            ;;
        speed)
            speed_test
            ;;
        all)
            run_all
            ;;
        help|--help|-h)
            show_help
            exit 0
            ;;
        *)
            error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
