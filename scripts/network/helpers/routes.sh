#!/usr/bin/env bash
# DangerPrep Route Manager
# Flexible routing based on WAN/LAN interface designation

# Modern shell script best practices

# Prevent multiple sourcing
if [[ "${NETWORK_HELPERS_ROUTES_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly NETWORK_HELPERS_ROUTES_LOADED="true"

set -euo pipefail

# Script metadata
NETWORK_ROUTES_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


# Source shared utilities
# shellcheck source=../../shared/logging.sh
source "${NETWORK_ROUTES_SCRIPT_DIR}/../../shared/logging.sh"
# shellcheck source=../../shared/errors.sh
source "${NETWORK_ROUTES_SCRIPT_DIR}/../../shared/errors.sh"
# shellcheck source=../../shared/validation.sh
source "${NETWORK_ROUTES_SCRIPT_DIR}/../../shared/validation.sh"
# shellcheck source=../../shared/banner.sh
source "${NETWORK_ROUTES_SCRIPT_DIR}/../../shared/banner.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-route-manager.log"
readonly INTERFACE_CONFIG="/etc/dangerprep/interfaces.conf"
readonly WAN_CONFIG="/etc/dangerprep/wan.conf"
readonly ROUTING_STATE="/var/lib/dangerprep/routing-state"

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Route manager failed with exit code $exit_code"

    # Stop any DangerPrep connections
    nmcli connection show | grep "DangerPrep" | awk '{print $1}' | while read -r conn; do
        nmcli connection down "${conn}" 2>/dev/null || true
        nmcli connection delete "${conn}" 2>/dev/null || true
    done

    # Clear iptables rules
    iptables -t nat -F POSTROUTING 2>/dev/null || true
    iptables -F FORWARD 2>/dev/null || true

    # Remove dnsmasq configuration
    rm -f /etc/dnsmasq.d/dangerprep-routing.conf
    systemctl restart dnsmasq 2>/dev/null || true

    # Clear routing state
    rm -f "${ROUTING_STATE}"

    error "Cleanup completed"
    exit "${exit_code}"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate root permissions for network operations
    validate_root_user

    # Validate required commands
    require_commands ip iptables nmcli systemctl

    # Ensure directories exist
    mkdir -p /etc/dangerprep /var/lib/dangerprep

    debug "Route manager initialized"
    clear_error_context
}

check_prerequisites() {
    if [ ! -f "${INTERFACE_CONFIG}" ]; then
        error "Interface configuration not found. Run 'just net-enumerate' first."
        exit 1
    fi
}

get_wan_interface() {
    if [[ -f "${WAN_CONFIG}" ]]; then
        cat "${WAN_CONFIG}"
    else
        echo ""
    fi
}

get_lan_interfaces() {
    local wan_interface
    wan_interface=$(get_wan_interface)
    local lan_interfaces=()
    
    # Get all interfaces except WAN
    while IFS= read -r line; do
        if [[ $line =~ ^(ETHERNET|WIFI|TAILSCALE)_([^=]+)=\"(.*)\"$ ]]; then
            local interface
            interface=${BASH_REMATCH[2]}
            if [[ "${interface}" != "${wan_interface}" ]]; then
                lan_interfaces+=("${interface}")
            fi
        fi
    done < "${INTERFACE_CONFIG}"
    
    echo "${lan_interfaces[@]}"
}

get_interface_type() {
    local interface="$1"
    
    while IFS= read -r line; do
        if [[ $line =~ ^(ETHERNET|WIFI|TAILSCALE)_${interface}=\"(.*)\"$ ]]; then
            local type
            type=${BASH_REMATCH[1],,}
            echo "$type"
            return 0
        fi
    done < "${INTERFACE_CONFIG}"
    
    echo "unknown"
}

configure_wan_interface() {
    local wan_interface="$1"
    local wan_type
    wan_type=$(get_interface_type "$wan_interface")
    
    log "Configuring WAN interface: $wan_interface ($wan_type)"
    
    case "$wan_type" in
        "ethernet")
            # Configure Ethernet as DHCP client
            nmcli connection modify "Wired connection 1" \
                ipv4.method auto \
                ipv4.may-fail no \
                connection.autoconnect yes 2>/dev/null || \
            nmcli connection add type ethernet ifname "$wan_interface" \
                con-name "DangerPrep-WAN" \
                ipv4.method auto \
                ipv4.may-fail no \
                connection.autoconnect yes
            
            nmcli connection up "DangerPrep-WAN" 2>/dev/null || \
            nmcli connection up "Wired connection 1"
            ;;
            
        "wifi")
            # WiFi client mode - requires SSID and password
            if [ -z "$2" ] || [ -z "$3" ]; then
                error "WiFi WAN requires SSID and password"
                echo "Usage: start <wifi-ssid> <wifi-password>"
                exit 1
            fi
            
            local ssid="$2"
            local password="$3"
            
            log "Connecting to WiFi: $ssid"
            nmcli device wifi connect "$ssid" password "$password" ifname "$wan_interface"
            ;;
            
        "tailscale")
            error "Tailscale cannot be used as WAN interface"
            exit 1
            ;;
            
        *)
            error "Unknown interface type: $wan_type"
            exit 1
            ;;
    esac
    
    # Wait for connection
    sleep 5
    
    # Verify WAN connectivity
    if ip route | grep -q "default.*$wan_interface"; then
        success "WAN interface $wan_interface configured successfully"
        local wan_ip
        wan_ip=$(ip addr show "$wan_interface" | grep "inet " | awk '{print $2}' | cut -d/ -f1)
        log "WAN IP: $wan_ip"
    else
        error "Failed to configure WAN interface: $wan_interface"
        exit 1
    fi
}

configure_lan_interfaces() {
    local wan_interface="$1"
    local lan_interfaces=()
    mapfile -t lan_interfaces < <(get_lan_interfaces)
    local lan_ip="192.168.120.1"
    local dhcp_interfaces=()
    
    log "Configuring LAN interfaces..."
    
    for interface in "${lan_interfaces[@]}"; do
        local interface_type
        interface_type=$(get_interface_type "$interface")
        
        log "Configuring LAN interface: $interface ($interface_type)"
        
        case "$interface_type" in
            "ethernet")
                # Configure Ethernet as LAN
                nmcli connection modify "Wired connection 1" \
                    ipv4.method manual \
                    ipv4.addresses "$lan_ip/22" \
                    ipv4.gateway "" \
                    ipv4.dns "" \
                    connection.autoconnect yes 2>/dev/null || \
                nmcli connection add type ethernet ifname "$interface" \
                    con-name "DangerPrep-LAN-$interface" \
                    ipv4.method manual \
                    ipv4.addresses "$lan_ip/22" \
                    connection.autoconnect yes
                
                nmcli connection up "DangerPrep-LAN-$interface" 2>/dev/null || \
                nmcli connection up "Wired connection 1"
                
                dhcp_interfaces+=("$interface")
                ;;
                
            "wifi")
                # Configure WiFi as AP
                local ap_ssid="DangerPrep"
                local ap_password="emergency2024"
                
                # Stop any existing hotspot
                nmcli connection delete "DangerPrep-AP-$interface" 2>/dev/null || true
                
                # Create WiFi hotspot
                nmcli device wifi hotspot \
                    ifname "$interface" \
                    con-name "DangerPrep-AP-$interface" \
                    ssid "$ap_ssid" \
                    password "$ap_password" \
                    band bg
                
                dhcp_interfaces+=("$interface")
                success "WiFi AP: $interface (SSID: $ap_ssid)"
                ;;
                
            "tailscale")
                # Tailscale is managed externally, just note it
                log "Tailscale interface: $interface (managed externally)"
                ;;
                
            *)
                warning "Unknown interface type for $interface: $interface_type"
                ;;
        esac
    done
    
    # Configure DHCP for LAN interfaces
    if [ ${#dhcp_interfaces[@]} -gt 0 ]; then
        configure_dhcp_dns "${dhcp_interfaces[@]}"
    fi
}

configure_dhcp_dns() {
    local interfaces=("$@")
    
    log "Configuring DHCP and DNS for LAN interfaces..."
    
    # Create dnsmasq configuration
    cat > /etc/dnsmasq.d/dangerprep-routing.conf << EOF
# DangerPrep Dynamic Routing Configuration
# Generated on $(date)

# Bind to LAN interfaces
$(for interface in "${interfaces[@]}"; do
    echo "interface=$interface"
done)
bind-interfaces

# DHCP configuration
dhcp-range=192.168.120.100,192.168.120.200,12h
dhcp-option=3,192.168.120.1  # Default gateway
dhcp-option=6,192.168.120.1  # DNS server

# DNS forwarding
server=1.1.1.1
server=8.8.8.8
cache-size=1000

# Local domain
domain=dangerprep.local
expand-hosts

# Logging
log-queries
log-dhcp
EOF
    
    # Restart dnsmasq
    systemctl restart dnsmasq
    systemctl enable dnsmasq
    
    success "DHCP and DNS configured for interfaces: ${interfaces[*]}"
}

configure_routing() {
    local wan_interface="$1"
    local lan_interfaces=()
    mapfile -t lan_interfaces < <(get_lan_interfaces)
    
    log "Configuring routing and NAT..."
    
    # Clear existing rules
    iptables -t nat -F POSTROUTING 2>/dev/null || true
    iptables -F FORWARD 2>/dev/null || true
    
    # Enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    sysctl -w net.ipv4.ip_forward=1
    
    # Make IP forwarding persistent
    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    fi
    
    # Set up NAT masquerading for WAN
    iptables -t nat -A POSTROUTING -o "$wan_interface" -j MASQUERADE
    
    # Set up forwarding rules for each LAN interface
    for lan_interface in "${lan_interfaces[@]}"; do
        # Skip Tailscale (it manages its own routing)
        if [ "$(get_interface_type "$lan_interface")" = "tailscale" ]; then
            continue
        fi
        
        # Allow forwarding from LAN to WAN
        iptables -A FORWARD -i "$lan_interface" -o "$wan_interface" -j ACCEPT
        
        # Allow forwarding from WAN to LAN (established connections)
        iptables -A FORWARD -i "$wan_interface" -o "$lan_interface" \
            -m state --state RELATED,ESTABLISHED -j ACCEPT
    done
    
    # Allow inter-LAN communication (including Tailscale)
    for lan1 in "${lan_interfaces[@]}"; do
        for lan2 in "${lan_interfaces[@]}"; do
            if [ "$lan1" != "$lan2" ]; then
                iptables -A FORWARD -i "$lan1" -o "$lan2" -j ACCEPT
            fi
        done
    done
    
    # Allow loopback and established connections
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    
    # Allow LAN to router communication
    for lan_interface in "${lan_interfaces[@]}"; do
        if [ "$(get_interface_type "$lan_interface")" != "tailscale" ]; then
            iptables -A INPUT -i "$lan_interface" -j ACCEPT
        fi
    done
    
    # Save iptables rules
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
    
    success "Routing configured: WAN($wan_interface) ↔ LAN(${lan_interfaces[*]})"
}

start_routing() {
    set_error_context "Starting dynamic routing"
    check_prerequisites

    local wan_interface
    wan_interface=$(get_wan_interface)

    if [[ -z "${wan_interface}" ]]; then
        error "No WAN interface configured. Use 'just net-set-wan <interface>' first."
        exit 1
    fi

    log "Starting dynamic routing..."
    log "WAN: ${wan_interface}"
    log "LAN: $(get_lan_interfaces)"

    configure_wan_interface "${wan_interface}" "$@"
    configure_lan_interfaces "${wan_interface}"
    configure_routing "${wan_interface}"

    # Save routing state
    cat > "${ROUTING_STATE}" << EOF
wan_interface=${wan_interface}
lan_interfaces=$(get_lan_interfaces)
started_at=$(date)
EOF

    success "Dynamic routing started successfully!"
    echo
    show_routing_status
    clear_error_context
}

stop_routing() {
    log "Stopping dynamic routing..."
    
    # Stop all DangerPrep connections
    nmcli connection show | grep "DangerPrep" | awk '{print $1}' | while read -r conn; do
        nmcli connection down "$conn" 2>/dev/null || true
        nmcli connection delete "$conn" 2>/dev/null || true
    done
    
    # Clear iptables rules
    iptables -t nat -F POSTROUTING 2>/dev/null || true
    iptables -F FORWARD 2>/dev/null || true
    
    # Remove dnsmasq configuration
    rm -f /etc/dnsmasq.d/dangerprep-routing.conf
    systemctl restart dnsmasq 2>/dev/null || true
    
    # Clear routing state
    rm -f "${ROUTING_STATE}"
    
    success "Dynamic routing stopped"
}

show_routing_status() {
    echo "Dynamic Routing Status:"
    echo "======================"
    
    local wan_interface
    wan_interface=$(get_wan_interface)
    local lan_interfaces=()
    mapfile -t lan_interfaces < <(get_lan_interfaces)
    
    if [ -n "$wan_interface" ]; then
        echo "WAN Interface: $wan_interface ($(get_interface_type "$wan_interface"))"
        local wan_ip
        wan_ip=$(ip addr show "$wan_interface" 2>/dev/null | grep "inet " | awk '{print $2}' | head -1)
        if [ -n "$wan_ip" ]; then
            echo "  IP: $wan_ip"
        fi
    else
        echo "WAN Interface: None configured"
    fi
    
    echo
    echo "LAN Interfaces:"
    for interface in "${lan_interfaces[@]}"; do
        local interface_type
        interface_type=$(get_interface_type "$interface")
        echo "  $interface ($interface_type)"
        
        local ip
        ip=$(ip addr show "$interface" 2>/dev/null | grep "inet " | awk '{print $2}' | head -1)
        if [ -n "$ip" ]; then
            echo "    IP: $ip"
        fi
    done
    
    echo
    echo "Routing Rules:"
    local nat_rules
    nat_rules=$(iptables -t nat -L POSTROUTING -n | grep -c MASQUERADE)
    local forward_rules
    forward_rules=$(iptables -L FORWARD -n | grep -c ACCEPT)
    echo "  NAT rules: $nat_rules"
    echo "  Forward rules: $forward_rules"
    
    if [ -f "${ROUTING_STATE}" ]; then
        echo
        echo "Started: $(grep started_at "${ROUTING_STATE}" | cut -d= -f2)"
    fi
}

# Main function
main() {
    # Initialize script
    init_script

    # Show banner for route management
    if [[ "${1:-}" != "help" && "${1:-}" != "--help" && "${1:-}" != "-h" ]]; then
        show_banner_with_title "Route Manager" "network"
        echo
    fi

    case "${1:-}" in
        "start")
            shift
            start_routing "$@"
            ;;
        "stop")
            stop_routing
            ;;
        "status")
            show_routing_status
            ;;
        "restart")
            stop_routing
            sleep 3
            shift
            start_routing "$@"
            ;;
        help|--help|-h)
            echo "DangerPrep Route Manager"
            echo "Usage: $0 {start|stop|status|restart} [wifi-ssid] [wifi-password]"
            echo
            echo "Commands:"
            echo "  start [ssid] [pass] - Start routing with current WAN/LAN configuration"
            echo "  stop                - Stop routing and cleanup"
            echo "  status              - Show current routing status"
            echo "  restart [ssid] [pass] - Restart routing"
            echo
            echo "Notes:"
            echo "  - WiFi SSID and password required if WAN interface is WiFi"
            echo "  - Use 'just net-set-wan <interface>' to configure WAN interface first"
            echo "  - Tailscale is always considered part of LAN network"
            exit 0
            ;;
        *)
            error "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function

# Export functions for use in other scripts
export -f cleanup_on_errornexport -f init_scriptnexport -f check_prerequisitesnexport -f get_wan_interfacenexport -f get_lan_interfacesnexport -f get_interface_typenexport -f configure_wan_interfacenexport -f configure_lan_interfacesnexport -f configure_dhcp_dnsnexport -f configure_routingnexport -f start_routingnexport -f stop_routingnexport -f show_routing_statusn
# Run main function only if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
