#!/bin/bash
# DangerPrep Interface Manager
# Enumerate and manage physical network interfaces

set -e

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../shared/banner.sh"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration files
INTERFACE_CONFIG="/etc/dangerprep/interfaces.conf"
WAN_CONFIG="/etc/dangerprep/wan.conf"

# Ensure config directory exists
mkdir -p /etc/dangerprep

enumerate_interfaces() {
    log "Enumerating physical network interfaces..."
    
    # Clear existing configuration
    true > "${INTERFACE_CONFIG}"
    
    {
        echo "# DangerPrep Interface Configuration"
        echo "# Generated on $(date)"
        echo ""
    } >> "${INTERFACE_CONFIG}"
    
    # Enumerate Ethernet interfaces
    log "Detecting Ethernet interfaces..."
    local eth_interfaces=()
    mapfile -t eth_interfaces < <(ip link show | grep -E "^[0-9]+: en" | cut -d: -f2 | tr -d ' ')
    
    for interface in "${eth_interfaces[@]}"; do
        local mac
        mac=$(ip link show "$interface" | grep -o "link/ether [a-f0-9:]*" | awk '{print $2}')
        local state
        state=$(ip link show "$interface" | grep -o "state [A-Z]*" | awk '{print $2}')
        local speed="unknown"
        
        # Try to get link speed
        if [ -f "/sys/class/net/$interface/speed" ]; then
            speed=$(cat "/sys/class/net/$interface/speed" 2>/dev/null || echo "unknown")
            if [ "$speed" != "unknown" ] && [ "$speed" -gt 0 ]; then
                speed="${speed}Mbps"
            fi
        fi
        
        echo "ETHERNET_$interface=\"type=ethernet,mac=$mac,state=$state,speed=$speed\"" >> "${INTERFACE_CONFIG}"
        success "Ethernet: $interface ($mac, $state, $speed)"
    done
    
    # Enumerate WiFi interfaces
    log "Detecting WiFi interfaces..."
    local wifi_interfaces=()
    mapfile -t wifi_interfaces < <(iw dev | grep Interface | awk '{print $2}')
    
    for interface in "${wifi_interfaces[@]}"; do
        local mac
        mac=$(ip link show "$interface" | grep -o "link/ether [a-f0-9:]*" | awk '{print $2}')
        local state
        state=$(ip link show "$interface" | grep -o "state [A-Z]*" | awk '{print $2}')
        local driver="unknown"
        local capabilities=""
        
        # Get driver information
        if [ -d "/sys/class/net/$interface/device/driver" ]; then
            driver=$(basename "$(readlink "/sys/class/net/$interface/device/driver")" 2>/dev/null || echo "unknown")
        fi
        
        # Check WiFi capabilities
        local phy
        phy=$(iw dev "$interface" info | grep wiphy | awk '{print $2}')
        if [ -n "$phy" ]; then
            # Check for AP mode support
            if iw phy "phy$phy" info | grep -q "AP"; then
                capabilities="${capabilities}ap,"
            fi
            # Check for monitor mode support
            if iw phy "phy$phy" info | grep -q "monitor"; then
                capabilities="${capabilities}monitor,"
            fi
            # Check for mesh support
            if iw phy "phy$phy" info | grep -q "mesh"; then
                capabilities="${capabilities}mesh,"
            fi
        fi
        capabilities=${capabilities%,}  # Remove trailing comma
        
        echo "WIFI_$interface=\"type=wifi,mac=$mac,state=$state,driver=$driver,capabilities=$capabilities\"" >> "${INTERFACE_CONFIG}"
        success "WiFi: $interface ($mac, $state, $driver, caps: $capabilities)"
    done
    
    # Enumerate Tailscale interface
    log "Detecting Tailscale interface..."
    if ip link show tailscale0 >/dev/null 2>&1; then
        local ts_ip
        ts_ip=$(ip addr show tailscale0 | grep "inet " | awk '{print $2}' | head -1)
        local ts_state
        ts_state=$(ip link show tailscale0 | grep -o "state [A-Z]*" | awk '{print $2}')
        
        echo "TAILSCALE_tailscale0=\"type=tailscale,ip=$ts_ip,state=$ts_state\"" >> "${INTERFACE_CONFIG}"
        success "Tailscale: tailscale0 ($ts_ip, $ts_state)"
    else
        warning "Tailscale interface not found"
    fi
    
    {
        echo ""
        echo "# Interface enumeration completed on $(date)"
    } >> "${INTERFACE_CONFIG}"
    
    success "Interface enumeration completed"
}

list_interfaces() {
    if [ ! -f "${INTERFACE_CONFIG}" ]; then
        warning "No interface configuration found. Run 'enumerate' first."
        return 1
    fi
    
    echo "Available Network Interfaces:"
    echo "============================="
    
    # Parse and display interfaces
    while IFS= read -r line; do
        if [[ $line =~ ^(ETHERNET|WIFI|TAILSCALE)_([^=]+)=\"(.*)\"$ ]]; then
            local type
            type=${BASH_REMATCH[1],,}  # Convert to lowercase
            local interface
            interface=${BASH_REMATCH[2]}
            local config
            config=${BASH_REMATCH[3]}
            
            echo
            echo "Interface: $interface"
            echo "  Type: $type"
            
            # Parse configuration
            IFS=',' read -ra CONFIG_PARTS <<< "$config"
            for part in "${CONFIG_PARTS[@]}"; do
                IFS='=' read -ra KV <<< "$part"
                if [ ${#KV[@]} -eq 2 ]; then
                    echo "  ${KV[0]}: ${KV[1]}"
                fi
            done
            
            # Show current IP if assigned
            local current_ip
            current_ip=$(ip addr show "$interface" 2>/dev/null | grep "inet " | awk '{print $2}' | head -1)
            if [ -n "$current_ip" ]; then
                echo "  current_ip: $current_ip"
            fi
            
            # Show if this is the current WAN
            if [ -f "${WAN_CONFIG}" ] && grep -q "^$interface$" "${WAN_CONFIG}"; then
                echo "  role: WAN"
            else
                echo "  role: LAN"
            fi
        fi
    done < "${INTERFACE_CONFIG}"
    
    echo
}

set_wan_interface() {
    local wan_interface="$1"
    
    if [ -z "$wan_interface" ]; then
        error "Usage: set-wan <interface>"
        echo "Available interfaces:"
        list_interfaces | grep "Interface:" | awk '{print "  " $2}'
        return 1
    fi
    
    # Validate interface exists
    if ! grep -q "_${wan_interface}=" "${INTERFACE_CONFIG}" 2>/dev/null; then
        error "Interface '$wan_interface' not found. Run 'enumerate' first."
        return 1
    fi
    
    # Set WAN interface
    echo "$wan_interface" > "${WAN_CONFIG}"
    success "Set $wan_interface as WAN interface"
    
    # Show updated configuration
    echo
    echo "Current Configuration:"
    echo "  WAN: $wan_interface"
    echo "  LAN: All other interfaces + Tailscale"
}

clear_wan_interface() {
    if [ -f "${WAN_CONFIG}" ]; then
        rm "${WAN_CONFIG}"
        success "Cleared WAN interface designation"
        echo "All interfaces are now considered LAN"
    else
        log "No WAN interface was set"
    fi
}

show_current_config() {
    echo "Current Interface Configuration:"
    echo "==============================="
    
    if [ -f "${WAN_CONFIG}" ]; then
        local wan_interface
        wan_interface=$(cat "${WAN_CONFIG}")
        echo "WAN Interface: $wan_interface"
        echo
        echo "LAN Interfaces:"
        
        # List all interfaces except WAN
        while IFS= read -r line; do
            if [[ $line =~ ^(ETHERNET|WIFI|TAILSCALE)_([^=]+)=\"(.*)\"$ ]]; then
                local interface
                interface=${BASH_REMATCH[2]}
                if [ "$interface" != "$wan_interface" ]; then
                    local type
                    type=${BASH_REMATCH[1],,}
                    echo "  $interface ($type)"
                fi
            fi
        done < "${INTERFACE_CONFIG}"
    else
        echo "WAN Interface: None (all interfaces are LAN)"
        echo
        echo "LAN Interfaces:"
        while IFS= read -r line; do
            if [[ $line =~ ^(ETHERNET|WIFI|TAILSCALE)_([^=]+)=\"(.*)\"$ ]]; then
                local interface
                interface=${BASH_REMATCH[2]}
                local type
                type=${BASH_REMATCH[1],,}
                echo "  $interface ($type)"
            fi
        done < "${INTERFACE_CONFIG}"
    fi
    
    echo
    echo "Tailscale is always considered part of LAN network"
}

# Main command handling
# Show banner for interface management
if [[ "${1:-}" != "help" && "${1:-}" != "--help" && "${1:-}" != "-h" ]]; then
    show_banner_with_title "Interface Manager" "network"
    echo
fi

case "${1:-}" in
    "enumerate")
        enumerate_interfaces
        ;;
    "list")
        list_interfaces
        ;;
    "set-wan")
        set_wan_interface "$2"
        ;;
    "clear-wan")
        clear_wan_interface
        ;;
    "config"|"show")
        show_current_config
        ;;
    *)
        echo "DangerPrep Interface Manager"
        echo "Usage: $0 {enumerate|list|set-wan|clear-wan|config}"
        echo
        echo "Commands:"
        echo "  enumerate     - Scan and enumerate all physical interfaces"
        echo "  list          - List all available interfaces with details"
        echo "  set-wan <if>  - Designate an interface as WAN"
        echo "  clear-wan     - Clear WAN designation (all interfaces become LAN)"
        echo "  config        - Show current WAN/LAN configuration"
        echo
        echo "Examples:"
        echo "  $0 enumerate"
        echo "  $0 list"
        echo "  $0 set-wan enp1s0"
        echo "  $0 set-wan wlan0"
        echo "  $0 clear-wan"
        exit 1
        ;;
esac
