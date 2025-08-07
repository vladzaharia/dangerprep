#!/bin/bash
# DangerPrep WiFi Manager
# Manage WiFi interfaces, scanning, connections, and AP mode

set -e

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

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

# Load DangerPrep configuration
load_config() {
    # Default values
    WIFI_INTERFACE=""
    WIFI_SSID="DangerPrep"
    WIFI_PASSWORD="Buff00n!"
    LAN_IP="192.168.120.1"

    # Load from setup script configuration if available
    if [[ -f /etc/dangerprep/interfaces.conf ]]; then
        source /etc/dangerprep/interfaces.conf
    fi

    # Override with detected interface if config doesn't have it
    if [[ -z "$WIFI_INTERFACE" ]]; then
        WIFI_INTERFACE=$(get_wifi_interface)
    fi
}

# Get first available WiFi interface
get_wifi_interface() {
    local wifi_interfaces=($(iw dev | grep Interface | awk '{print $2}'))
    if [ ${#wifi_interfaces[@]} -gt 0 ]; then
        echo "${wifi_interfaces[0]}"
    else
        echo ""
    fi
}

scan_networks() {
    local interface=$(get_wifi_interface)
    
    if [ -z "$interface" ]; then
        error "No WiFi interface found"
        exit 1
    fi
    
    log "Scanning for WiFi networks on $interface..."
    
    # Ensure interface is up
    ip link set "$interface" up 2>/dev/null || true
    
    # Scan for networks
    nmcli device wifi rescan ifname "$interface" 2>/dev/null || true
    sleep 3
    
    echo "Available WiFi Networks:"
    echo "========================"
    
    # Display scan results
    nmcli device wifi list ifname "$interface" | head -20
    
    echo
    echo "Use 'just wifi-connect <SSID> <password>' to connect to a network"
}

connect_to_network() {
    local ssid="$1"
    local password="$2"
    local interface=$(get_wifi_interface)
    
    if [ -z "$ssid" ] || [ -z "$password" ]; then
        error "Usage: connect <ssid> <password>"
        exit 1
    fi
    
    if [ -z "$interface" ]; then
        error "No WiFi interface found"
        exit 1
    fi
    
    log "Connecting to WiFi network: $ssid"
    
    # Delete existing connection if it exists
    nmcli connection delete "$ssid" 2>/dev/null || true
    
    # Connect to network
    if nmcli device wifi connect "$ssid" password "$password" ifname "$interface"; then
        success "Connected to $ssid"
        
        # Show connection details
        sleep 3
        local ip=$(ip addr show "$interface" | grep "inet " | awk '{print $2}' | cut -d/ -f1)
        if [ -n "$ip" ]; then
            log "IP Address: $ip"
        fi
        
        # Test connectivity
        if ping -c 1 -W 3 8.8.8.8 >/dev/null 2>&1; then
            success "Internet connectivity confirmed"
        else
            warning "Connected but no internet access detected"
        fi
    else
        error "Failed to connect to $ssid"
        exit 1
    fi
}

create_access_point() {
    local ssid="$1"
    local password="$2"
    load_config

    if [ -z "$ssid" ] || [ -z "$password" ]; then
        error "Usage: ap <ssid> <password>"
        echo "Password must be at least 8 characters"
        exit 1
    fi

    if [ ${#password} -lt 8 ]; then
        error "Password must be at least 8 characters"
        exit 1
    fi

    if [ -z "$WIFI_INTERFACE" ]; then
        error "No WiFi interface found"
        exit 1
    fi

    log "Creating WiFi access point: $ssid"

    # Check if hostapd is configured and running (from setup script)
    if systemctl is-active --quiet hostapd && [[ -f /etc/hostapd/hostapd.conf ]]; then
        warning "DangerPrep hostapd is already configured and running"
        log "Current configuration uses SSID: $WIFI_SSID"
        log "To use the existing AP, connect to: $WIFI_SSID with password: $WIFI_PASSWORD"
        log "To reconfigure, edit /etc/hostapd/hostapd.conf and restart hostapd"
        return 0
    fi

    # Stop any existing hotspot
    nmcli connection show | grep "Hotspot\|DangerPrep-AP" | awk '{print $1}' | while read conn; do
        nmcli connection down "$conn" 2>/dev/null || true
        nmcli connection delete "$conn" 2>/dev/null || true
    done

    # Create WiFi hotspot using NetworkManager
    if nmcli device wifi hotspot \
        ifname "$WIFI_INTERFACE" \
        con-name "DangerPrep-AP" \
        ssid "$ssid" \
        password "$password" \
        band bg; then

        success "WiFi access point created: $ssid"

        # Show AP details
        sleep 3
        local ip=$(ip addr show "$WIFI_INTERFACE" | grep "inet " | awk '{print $2}' | cut -d/ -f1)
        if [ -n "$ip" ]; then
            log "AP IP Address: $ip"
        fi

        log "Clients can connect with password: $password"
        warning "Note: This AP is managed by NetworkManager, not hostapd"
        warning "For production use, consider using the hostapd configuration from setup script"
    else
        error "Failed to create access point"
        exit 1
    fi
}

show_wifi_status() {
    echo "WiFi Interface Status:"
    echo "====================="
    
    local wifi_interfaces=($(iw dev | grep Interface | awk '{print $2}'))
    
    if [ ${#wifi_interfaces[@]} -eq 0 ]; then
        warning "No WiFi interfaces found"
        return 1
    fi
    
    for interface in "${wifi_interfaces[@]}"; do
        echo
        echo "Interface: $interface"
        
        # Get basic info
        local mac=$(ip link show "$interface" | grep -o "link/ether [a-f0-9:]*" | awk '{print $2}')
        local state=$(ip link show "$interface" | grep -o "state [A-Z]*" | awk '{print $2}')
        echo "  MAC: $mac"
        echo "  State: $state"
        
        # Get IP if assigned
        local ip=$(ip addr show "$interface" | grep "inet " | awk '{print $2}' | head -1)
        if [ -n "$ip" ]; then
            echo "  IP: $ip"
        fi
        
        # Check NetworkManager connection
        local connection=$(nmcli connection show --active | grep "$interface" | awk '{print $1}' | head -1)
        if [ -n "$connection" ]; then
            echo "  Connection: $connection"
            
            # Check if it's an AP or client
            if nmcli connection show "$connection" | grep -q "802-11-wireless.mode.*ap"; then
                echo "  Mode: Access Point"
                local ssid=$(nmcli connection show "$connection" | grep "802-11-wireless.ssid" | awk '{print $2}')
                if [ -n "$ssid" ]; then
                    echo "  SSID: $ssid"
                fi
            else
                echo "  Mode: Client"
                local ssid=$(nmcli connection show "$connection" | grep "802-11-wireless.ssid" | awk '{print $2}')
                if [ -n "$ssid" ]; then
                    echo "  Connected to: $ssid"
                fi
            fi
        else
            echo "  Connection: None"
        fi
        
        # Show signal strength if connected as client
        if [ -n "$connection" ] && ! nmcli connection show "$connection" | grep -q "802-11-wireless.mode.*ap"; then
            local signal=$(nmcli device wifi list | grep "^\*" | awk '{print $7}')
            if [ -n "$signal" ]; then
                echo "  Signal: $signal"
            fi
        fi
    done
    
    echo
    echo "Available Commands:"
    echo "  just wifi-scan                    - Scan for networks"
    echo "  just wifi-connect <ssid> <pass>   - Connect to network"
    echo "  just wifi-ap <ssid> <pass>        - Create access point"
}

disconnect_wifi() {
    local interface=$(get_wifi_interface)
    
    if [ -z "$interface" ]; then
        error "No WiFi interface found"
        exit 1
    fi
    
    log "Disconnecting WiFi on $interface..."
    
    # Get active connection
    local connection=$(nmcli connection show --active | grep "$interface" | awk '{print $1}' | head -1)
    
    if [ -n "$connection" ]; then
        nmcli connection down "$connection"
        success "Disconnected from $connection"
    else
        log "No active WiFi connection found"
    fi
}

# Main command handling
# Show banner for WiFi management
if [[ "${1:-}" != "help" && "${1:-}" != "--help" && "${1:-}" != "-h" && "${1:-}" != "" ]]; then
    show_banner_with_title "WiFi Manager" "network"
    echo
fi

case "${1:-}" in
    "scan")
        scan_networks
        ;;
    "connect")
        connect_to_network "$2" "$3"
        ;;
    "ap")
        create_access_point "$2" "$3"
        ;;
    "status")
        show_wifi_status
        ;;
    "disconnect")
        disconnect_wifi
        ;;
    *)
        echo "DangerPrep WiFi Manager"
        echo "Usage: $0 {scan|connect|ap|status|disconnect}"
        echo
        echo "Commands:"
        echo "  scan                    - Scan for available WiFi networks"
        echo "  connect <ssid> <pass>   - Connect to a WiFi network"
        echo "  ap <ssid> <pass>        - Create WiFi access point"
        echo "  status                  - Show WiFi interface status"
        echo "  disconnect              - Disconnect from current network"
        echo
        echo "Examples:"
        echo "  $0 scan"
        echo "  $0 connect 'MyNetwork' 'password123'"
        echo "  $0 ap 'DangerPrep' 'emergency2024'"
        exit 1
        ;;
esac
