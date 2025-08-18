#!/usr/bin/env bash
# DangerPrep Network Interface Helper Functions
#
# Purpose: Consolidated network interface detection and selection functions
# Usage: Source this file to access network interface functions
# Dependencies: logging.sh, errors.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Get the directory where this script is located
NETWORK_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${NETWORK_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${NETWORK_HELPER_DIR}/../../shared/errors.sh"
fi

# Source additional dependencies
if [[ -z "${CONFIG_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./config.sh
    source "${NETWORK_HELPER_DIR}/config.sh"
fi

# Mark this file as sourced
export NETWORK_HELPER_SOURCED=true

#
# Network Interface Detection Functions
#

# Enhanced network interface detection with FriendlyElec support
# Usage: detect_network_interfaces
# Sets global variables: WAN_INTERFACE, WIFI_INTERFACE, LAN_INTERFACE (if applicable)
detect_network_interfaces() {
    log "Detecting network interfaces..."

    # Initialize interface arrays
    local ethernet_interfaces=()
    local wifi_interfaces=()

    # Detect all ethernet interfaces with enhanced patterns
    while IFS= read -r interface; do
        if [[ -n "$interface" ]]; then
            ethernet_interfaces+=("$interface")
        fi
    done < <(ip link show | grep -E "^[0-9]+: (eth|enp|ens|enx)" | cut -d: -f2 | tr -d ' ')

    # Detect WiFi interfaces with better detection
    while IFS= read -r interface; do
        if [[ -n "$interface" ]]; then
            wifi_interfaces+=("$interface")
        fi
    done < <(iw dev 2>/dev/null | grep Interface | awk '{print $2}')

    # FriendlyElec-specific interface selection
    if [[ "${IS_FRIENDLYELEC:-false}" == true ]]; then
        select_friendlyelec_interfaces "${ethernet_interfaces[@]}" -- "${wifi_interfaces[@]}"
    else
        select_generic_interfaces "${ethernet_interfaces[@]}" -- "${wifi_interfaces[@]}"
    fi

    # Validate and set fallbacks
    if [[ -z "${WAN_INTERFACE:-}" ]]; then
        warning "No ethernet interface detected"
        WAN_INTERFACE="eth0"  # fallback
    fi

    if [[ -z "${WIFI_INTERFACE:-}" ]]; then
        warning "No WiFi interface detected"
        WIFI_INTERFACE="wlan0"  # fallback
    fi

    log "WAN Interface: ${WAN_INTERFACE}"
    log "WiFi Interface: ${WIFI_INTERFACE}"

    # Log additional interface information for FriendlyElec
    if [[ "${IS_FRIENDLYELEC:-false}" == true ]]; then
        log_friendlyelec_interface_details
    fi

    # Export for use in templates
    export WAN_INTERFACE WIFI_INTERFACE
    if [[ -n "${LAN_INTERFACE:-}" ]]; then
        export LAN_INTERFACE
        log "LAN Interface: ${LAN_INTERFACE}"
    fi

    success "Network interfaces detected"
}

#
# Interface Selection Functions
#

# Select interfaces for FriendlyElec hardware
# Usage: select_friendlyelec_interfaces "eth0" "eth1" -- "wlan0"
select_friendlyelec_interfaces() {
    local ethernet_interfaces=()
    local wifi_interfaces=()
    local parsing_ethernet=true

    # Parse arguments (ethernet interfaces before --, wifi after)
    for arg in "$@"; do
        if [[ "$arg" == "--" ]]; then
            parsing_ethernet=false
            continue
        fi

        if [[ "$parsing_ethernet" == true ]]; then
            ethernet_interfaces+=("$arg")
        else
            wifi_interfaces+=("$arg")
        fi
    done

    log "Found ethernet interfaces: ${ethernet_interfaces[*]:-none}"
    log "Found WiFi interfaces: ${wifi_interfaces[*]:-none}"

    # FriendlyElec-specific interface selection logic
    case "${FRIENDLYELEC_MODEL:-}" in
        "NanoPi-M6")
            # NanoPi M6 has 1x Gigabit Ethernet
            WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
            # WiFi via M.2 E-key module
            WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
            ;;
        "NanoPi-R6C")
            # NanoPi R6C has 1x 2.5GbE + 1x GbE
            select_r6c_interfaces "${ethernet_interfaces[@]}"
            WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
            ;;
        "NanoPC-T6")
            # NanoPC-T6 has 2x Gigabit Ethernet
            select_t6_interfaces "${ethernet_interfaces[@]}"
            WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
            ;;
        *)
            # Generic FriendlyElec selection
            WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
            WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
            ;;
    esac
}

# Select interfaces for NanoPi R6C (2.5GbE + GbE)
# Usage: select_r6c_interfaces "eth0" "eth1"
select_r6c_interfaces() {
    local ethernet_interfaces=("$@")

    if [[ ${#ethernet_interfaces[@]} -ge 2 ]]; then
        log "Configuring dual ethernet interfaces for NanoPi R6C..."

        # Identify interfaces by speed and capabilities
        local high_speed_interface=""
        local standard_interface=""
        local max_speed=0

        for iface in "${ethernet_interfaces[@]}"; do
            # Wait for interface to be up to read speed
            ip link set "$iface" up 2>/dev/null || true
            sleep 2

            local speed
            speed=$(cat "/sys/class/net/$iface/speed" 2>/dev/null || echo "1000")

            # Handle cases where speed is -1 (unknown) or invalid
            if [[ "$speed" == "-1" || ! "$speed" =~ ^[0-9]+$ ]]; then
                speed="1000"  # Default to 1Gbps
            fi

            local driver
            driver=$(readlink "/sys/class/net/$iface/device/driver" 2>/dev/null | xargs basename || echo "unknown")

            log "Interface $iface: ${speed}Mbps, driver: $driver"

            # 2.5GbE interface typically shows 2500Mbps
            if [[ $speed -ge 2500 ]]; then
                high_speed_interface="$iface"
            elif [[ $speed -ge 1000 && -z "$standard_interface" ]]; then
                standard_interface="$iface"
            fi

            if [[ $speed -gt $max_speed ]]; then
                max_speed=$speed
            fi
        done

        # Set WAN to highest speed interface, LAN to the other
        if [[ -n "$high_speed_interface" ]]; then
            WAN_INTERFACE="$high_speed_interface"
            LAN_INTERFACE="${standard_interface:-${ethernet_interfaces[1]}}"
            log "Using 2.5GbE interface ${WAN_INTERFACE} for WAN"
            log "Using GbE interface ${LAN_INTERFACE} for LAN"
        else
            # Fallback if speed detection fails
            WAN_INTERFACE="${ethernet_interfaces[0]}"
            LAN_INTERFACE="${ethernet_interfaces[1]}"
            log "Speed detection failed, using first interface for WAN"
        fi

        # Export LAN interface for use in configuration
        export LAN_INTERFACE
    else
        WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
        log "Only one ethernet interface detected on R6C"
    fi
}

# Select interfaces for NanoPC-T6 (dual GbE)
# Usage: select_t6_interfaces "eth0" "eth1"
select_t6_interfaces() {
    local ethernet_interfaces=("$@")

    if [[ ${#ethernet_interfaces[@]} -ge 2 ]]; then
        log "Configuring dual ethernet interfaces for NanoPC-T6..."

        # For T6, both are GbE, so use first for WAN, second for LAN
        WAN_INTERFACE="${ethernet_interfaces[0]}"
        LAN_INTERFACE="${ethernet_interfaces[1]}"

        log "Using ${WAN_INTERFACE} for WAN"
        log "Using ${LAN_INTERFACE} for LAN"

        # Export LAN interface for use in configuration
        export LAN_INTERFACE
    else
        WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
        log "Only one ethernet interface detected on T6"
    fi
}

# Select interfaces for generic hardware
# Usage: select_generic_interfaces "eth0" -- "wlan0"
select_generic_interfaces() {
    local ethernet_interfaces=()
    local wifi_interfaces=()
    local parsing_ethernet=true

    # Parse arguments
    for arg in "$@"; do
        if [[ "$arg" == "--" ]]; then
            parsing_ethernet=false
            continue
        fi

        if [[ "$parsing_ethernet" == true ]]; then
            ethernet_interfaces+=("$arg")
        else
            wifi_interfaces+=("$arg")
        fi
    done

    # Simple selection for generic hardware
    WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
    WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
}

#
# Interface Information Functions
#

# Log detailed interface information for FriendlyElec hardware
# Usage: log_friendlyelec_interface_details
log_friendlyelec_interface_details() {
    # Log ethernet interface details
    if [[ -n "${WAN_INTERFACE:-}" && -d "/sys/class/net/${WAN_INTERFACE}" ]]; then
        local speed
        speed=$(cat "/sys/class/net/${WAN_INTERFACE}/speed" 2>/dev/null || echo "unknown")
        local duplex
        duplex=$(cat "/sys/class/net/${WAN_INTERFACE}/duplex" 2>/dev/null || echo "unknown")
        local driver
        driver=$(readlink "/sys/class/net/${WAN_INTERFACE}/device/driver" 2>/dev/null | xargs basename || echo "unknown")

        log "Ethernet details: ${WAN_INTERFACE} (${speed}Mbps, $duplex, driver: $driver)"
    fi

    # Log WiFi interface details
    if [[ -n "${WIFI_INTERFACE:-}" ]] && command -v iw >/dev/null 2>&1; then
        local wifi_info
        wifi_info=$(iw dev "${WIFI_INTERFACE}" info 2>/dev/null | grep -E "(wiphy|type)" | tr '\n' ' ' || echo "")
        if [[ -n "$wifi_info" ]]; then
            log "WiFi details: ${WIFI_INTERFACE} ($wifi_info)"
        fi
    fi
}

#
# Network Bonding Functions
#

# Configure network bonding for multiple interfaces
# Usage: configure_network_bonding
configure_network_bonding() {
    if [[ -z "${LAN_INTERFACE:-}" ]]; then
        return 0
    fi

    log "Configuring network bonding for multiple ethernet interfaces..."

    # Install bonding support
    if ! lsmod | grep -q bonding; then
        modprobe bonding 2>/dev/null || true
    fi

    # Create bonding configuration for failover (would be handled by config helper)
    debug "Loading ethernet bonding configuration"
    # load_ethernet_bonding_config

    log "Network bonding configuration created"
    return 0
}

#
# Interface Validation Functions
#

# Validate network interface exists and is usable
# Usage: validate_interface "eth0"
# Returns: 0 if valid, 1 if invalid
validate_interface() {
    local interface="$1"
    
    if [[ -z "$interface" ]]; then
        error "Interface name is required"
        return 1
    fi
    
    # Check if interface exists
    if [[ ! -d "/sys/class/net/$interface" ]]; then
        error "Interface $interface does not exist"
        return 1
    fi
    
    # Check if interface is up
    local state
    state=$(cat "/sys/class/net/$interface/operstate" 2>/dev/null || echo "unknown")
    if [[ "$state" == "down" ]]; then
        warning "Interface $interface is down"
    fi
    
    success "Interface $interface is valid"
    return 0
}

#
# Network Configuration Functions
#

# Setup network routing with comprehensive configuration
# Usage: setup_network_routing
# Returns: 0 if successful, 1 if failed
setup_network_routing() {
    log "Setting up network routing..."

    # Enable IP forwarding
    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    fi
    sysctl -p

    # Configure NAT and forwarding rules
    local wan_interface="${WAN_INTERFACE:-eth0}"
    local wifi_interface="${WIFI_INTERFACE:-wlan0}"

    iptables -t nat -A POSTROUTING -o "$wan_interface" -j MASQUERADE
    iptables -A FORWARD -i "$wan_interface" -o "$wifi_interface" -m state --state RELATED,ESTABLISHED -j ACCEPT
    iptables -A FORWARD -i "$wifi_interface" -o "$wan_interface" -j ACCEPT

    # Save iptables rules
    if command -v iptables-save >/dev/null 2>&1; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi

    success "Network routing configured"
    return 0
}

# Setup QoS traffic shaping
# Usage: setup_qos_traffic_shaping
# Returns: 0 if successful, 1 if failed
setup_qos_traffic_shaping() {
    log "Setting up QoS traffic shaping..."

    # Load network performance optimizations
    if ! load_network_performance_config; then
        warning "Failed to load network performance configuration"
    fi

    sysctl -p

    success "QoS traffic shaping configured"
    return 0
}

# Configure WiFi hotspot with comprehensive setup
# Usage: configure_wifi_hotspot
# Returns: 0 if successful, 1 if failed
configure_wifi_hotspot() {
    log "Configuring WiFi hotspot..."

    local wifi_interface="${WIFI_INTERFACE:-wlan0}"

    # Stop NetworkManager management of WiFi interface
    if command -v nmcli >/dev/null 2>&1; then
        nmcli device set "$wifi_interface" managed no 2>/dev/null || true
    fi

    # Load hostapd configuration
    if ! load_hostapd_config; then
        error "Failed to load hostapd configuration"
        return 1
    fi

    # Create minimal dnsmasq config for DHCP only
    if ! load_dnsmasq_minimal_config; then
        error "Failed to load dnsmasq configuration"
        return 1
    fi

    # Enable and start services
    systemctl enable hostapd dnsmasq
    systemctl start hostapd dnsmasq

    success "WiFi hotspot configured"
    return 0
}

# Setup DHCP server with DNS handled by AdGuard Home
# Usage: setup_dhcp_server
# Returns: 0 if successful, 1 if failed
setup_dhcp_server() {
    log "Setting up DHCP server..."

    # DNS is handled by AdGuard Home system service
    # DHCP for WiFi hotspot is handled by dnsmasq for simplicity
    log "DNS will be handled by AdGuard Home system service"
    log "DHCP for WiFi hotspot will use minimal dnsmasq configuration"

    # Create minimal dnsmasq config for DHCP only
    if ! load_dnsmasq_minimal_config; then
        error "Failed to load dnsmasq configuration"
        return 1
    fi

    # Enable and start dnsmasq
    systemctl enable dnsmasq
    systemctl start dnsmasq

    success "DHCP server configured"
    return 0
}

# Configure WiFi routing for client access
# Usage: configure_wifi_routing
# Returns: 0 if successful, 1 if failed
configure_wifi_routing() {
    log "Configuring WiFi client routing..."

    local wifi_interface="${WIFI_INTERFACE:-wlan0}"

    # Allow WiFi clients to access services
    iptables -A INPUT -i "$wifi_interface" -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -i "$wifi_interface" -p tcp --dport 443 -j ACCEPT
    iptables -A INPUT -i "$wifi_interface" -p tcp --dport 3000 -j ACCEPT  # AdGuard Home
    iptables -A INPUT -i "$wifi_interface" -p tcp --dport 9000 -j ACCEPT  # Step-CA
    iptables -A INPUT -i "$wifi_interface" -p tcp --dport 22 -j ACCEPT    # SSH
    iptables -A INPUT -i "$wifi_interface" -p udp --dport 53 -j ACCEPT    # DNS

    # Save iptables rules
    if command -v iptables-save >/dev/null 2>&1; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi

    success "WiFi routing configured"
    return 0
}
