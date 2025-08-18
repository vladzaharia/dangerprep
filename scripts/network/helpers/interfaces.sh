#!/usr/bin/env bash
# DangerPrep Interface Manager
# Enumerate and manage physical network interfaces

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/errors.sh
source "${SCRIPT_DIR}/../shared/errors.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"
# shellcheck source=../shared/hardware.sh
source "${SCRIPT_DIR}/../shared/hardware.sh"
# shellcheck source=../shared/state/network.sh
source "${SCRIPT_DIR}/../shared/state/network.sh"
# shellcheck source=../shared/intelligence/network.sh
source "${SCRIPT_DIR}/../shared/intelligence/network.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-interface-manager.log"

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Interface manager failed with exit code ${exit_code}"

    # No specific cleanup needed for interface enumeration

    error "Cleanup completed"
    exit "${exit_code}"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate root permissions for system operations
    validate_root_user

    # Validate required commands
    require_commands ip iw jq

    # Initialize network state system
    init_network_state

    debug "Interface manager initialized"
    clear_error_context
}

# Configuration files
INTERFACE_CONFIG="/etc/dangerprep/interfaces.conf"
WAN_CONFIG="/etc/dangerprep/wan.conf"

# Ensure config directory exists
mkdir -p /etc/dangerprep

enumerate_interfaces() {
    log "Enumerating physical network interfaces..."

    # Detect hardware platform first
    detect_hardware_platform

    # Clear existing configuration
    true > "${INTERFACE_CONFIG}"

    {
        echo "# DangerPrep Interface Configuration"
        echo "# Generated on $(date)"
        echo "# Hardware Platform: ${HARDWARE_PLATFORM:-Unknown}"
        if [[ "${IS_FRIENDLYELEC}" == "true" ]]; then
            echo "# FriendlyElec Model: ${FRIENDLYELEC_MODEL}"
        fi
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
    local priority="${2:-primary}"

    if [ -z "$wan_interface" ]; then
        error "Usage: set-wan <interface> [priority]"
        echo "Available interfaces:"
        list_interfaces | grep "Interface:" | awk '{print "  " $2}'
        echo "Priorities: primary, secondary, available"
        return 1
    fi

    # Validate interface exists
    if ! grep -q "_${wan_interface}=" "${INTERFACE_CONFIG}" 2>/dev/null; then
        error "Interface '$wan_interface' not found. Run 'enumerate' first."
        return 1
    fi

    log "Setting WAN interface: $wan_interface (priority: $priority)"

    # Use network state management for multiple WAN support
    case "$priority" in
        primary)
            set_interface_role "$wan_interface" "$ROLE_WAN_PRIMARY"
            ;;
        secondary)
            set_interface_role "$wan_interface" "$ROLE_WAN_SECONDARY"
            ;;
        available)
            set_interface_role "$wan_interface" "$ROLE_WAN_AVAILABLE"
            ;;
        *)
            error "Invalid priority: $priority (use: primary, secondary, available)"
            return 1
            ;;
    esac

    # Update legacy configuration for backward compatibility
    if [[ "$priority" == "primary" ]]; then
        echo "$wan_interface" > "${WAN_CONFIG}"
    fi

    # Trigger network evaluation if auto mode is enabled
    if is_auto_mode_enabled; then
        scan_single_interface_connectivity "$wan_interface"
        force_network_evaluation
    fi

    success "Set $wan_interface as $priority WAN interface"

    # Show updated configuration
    echo
    show_wan_configuration
}

clear_wan_interface() {
    local interface="$1"

    if [[ -n "$interface" ]]; then
        # Clear specific interface
        log "Clearing WAN designation for interface: $interface"
        clear_interface_role "$interface"
        success "Cleared WAN designation for $interface"
    else
        # Clear all WAN interfaces
        log "Clearing all WAN interface designations"
        set_network_state "wan_primary" "null"
        set_network_state "wan_secondary" "null"
        set_network_state_object "wan_available" "[]"

        # Clear legacy configuration
        if [[ -f "${WAN_CONFIG}" ]]; then
            rm "${WAN_CONFIG}"
        fi

        success "Cleared all WAN interface designations"
    fi

    # Trigger network evaluation if auto mode is enabled
    if is_auto_mode_enabled; then
        force_network_evaluation
    fi

    echo
    show_wan_configuration
}

# Show current WAN configuration
show_wan_configuration() {
    echo "Current WAN Configuration:"
    echo "========================="

    local wan_primary
    wan_primary=$(get_wan_primary)
    if [[ "$wan_primary" != "null" && -n "$wan_primary" ]]; then
        echo "  Primary WAN: $wan_primary"
    fi

    local wan_secondary
    wan_secondary=$(get_wan_secondary)
    if [[ "$wan_secondary" != "null" && -n "$wan_secondary" ]]; then
        echo "  Secondary WAN: $wan_secondary"
    fi

    local wan_available
    wan_available=$(get_wan_available)
    if [[ -n "$wan_available" ]]; then
        echo "  Available WAN:"
        echo "$wan_available" | while read -r interface; do
            echo "    - $interface"
        done
    fi

    local lan_interfaces
    lan_interfaces=$(get_lan_interfaces)
    if [[ -n "$lan_interfaces" ]]; then
        echo "  LAN Interfaces:"
        echo "$lan_interfaces" | while read -r interface; do
            echo "    - $interface"
        done
    fi

    if [[ "$wan_primary" == "null" && "$wan_secondary" == "null" && -z "$wan_available" ]]; then
        echo "  No WAN interfaces configured"
        echo "  All interfaces are considered LAN"
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

# Main function
main() {
    # Initialize script
    init_script

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
            set_wan_interface "$2" "$3"
            ;;
        "clear-wan")
            clear_wan_interface "$2"
            ;;
        "show-wan")
            show_wan_configuration
            ;;
        "config"|"show")
            show_current_config
            ;;
        help|--help|-h)
            echo "DangerPrep Interface Manager"
            echo "Usage: $0 {enumerate|list|set-wan|clear-wan|show-wan|config}"
            echo
            echo "Commands:"
            echo "  enumerate              - Scan and enumerate all physical interfaces"
            echo "  list                   - List all available interfaces with details"
            echo "  set-wan <if> [priority] - Designate interface as WAN (priority: primary|secondary|available)"
            echo "  clear-wan [interface]  - Clear WAN designation (specific interface or all)"
            echo "  show-wan               - Show current WAN configuration"
            echo "  config                 - Show current WAN/LAN configuration"
            echo
            echo "Examples:"
            echo "  $0 enumerate"
            echo "  $0 list"
            echo "  $0 set-wan enp1s0 primary"
            echo "  $0 set-wan wlan0 secondary"
            echo "  $0 clear-wan enp1s0"
            echo "  $0 show-wan"
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
main "$@"
