#!/usr/bin/env bash
# DangerPrep Shared Network Functions
#
# Purpose: Common networking functions for reuse across network scripts
# Usage: Source this file to access network utility functions
# Dependencies: ip (iproute2), iptables, systemctl (systemd)
# Author: DangerPrep Project
# Version: 1.0

# Modern shell script best practices
set -euo pipefail

# Network configuration defaults
readonly DEFAULT_LAN_NETWORK="192.168.120.0/22"
# shellcheck disable=SC2034  # Used by external scripts
readonly DEFAULT_LAN_IP="192.168.120.1"
# shellcheck disable=SC2034  # Used by external scripts
readonly DEFAULT_WIFI_SSID="DangerPrep"
# shellcheck disable=SC2034  # Used by external scripts
readonly DEFAULT_WIFI_PASSWORD="Buff00n!"

# Validate network interface exists
validate_interface() {
    local interface="$1"
    local interface_type="${2:-interface}"
    
    set_error_context "Interface validation"
    
    if [[ -z "$interface" ]]; then
        error "No $interface_type specified"
        clear_error_context
        return 1
    fi
    
    if [[ ! -d "/sys/class/net/$interface" ]]; then
        error "$interface_type does not exist: $interface"
        clear_error_context
        return 1
    fi
    
    debug "Validated $interface_type: $interface"
    clear_error_context
    return 0
}

# Configure interface with IP address
configure_interface_ip() {
    local interface="$1"
    local ip_address="$2"
    local flush_first="${3:-true}"
    
    set_error_context "Interface IP configuration"
    
    validate_interface "$interface"
    
    info "Configuring $interface with IP: $ip_address"
    
    # Bring interface up
    ip link set "$interface" up
    
    # Flush existing addresses if requested
    if [[ "$flush_first" == "true" ]]; then
        ip addr flush dev "$interface" 2>/dev/null || true
    fi
    
    # Add IP address
    ip addr add "$ip_address" dev "$interface"
    
    success "Interface $interface configured with $ip_address"
    clear_error_context
}

# Enable IP forwarding
enable_ip_forwarding() {
    set_error_context "IP forwarding configuration"
    
    info "Enabling IP forwarding"
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Make it persistent
    if [[ -f /etc/sysctl.conf ]]; then
        if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
            echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
        fi
    fi
    
    success "IP forwarding enabled"
    clear_error_context
}

# Disable IP forwarding
disable_ip_forwarding() {
    set_error_context "IP forwarding configuration"
    
    info "Disabling IP forwarding"
    echo 0 > /proc/sys/net/ipv4/ip_forward
    
    success "IP forwarding disabled"
    clear_error_context
}

# Configure NAT rules for internet sharing
configure_nat_rules() {
    local wan_interface="$1"
    local lan_interface="$2"
    local clear_first="${3:-true}"
    
    set_error_context "NAT configuration"
    
    validate_interface "$wan_interface" "WAN interface"
    validate_interface "$lan_interface" "LAN interface"
    
    info "Configuring NAT: $lan_interface → $wan_interface"
    
    # Clear existing NAT rules if requested
    if [[ "$clear_first" == "true" ]]; then
        iptables -t nat -F POSTROUTING 2>/dev/null || true
        iptables -F FORWARD 2>/dev/null || true
    fi
    
    # Configure NAT
    iptables -t nat -A POSTROUTING -o "$wan_interface" -j MASQUERADE
    iptables -A FORWARD -i "$lan_interface" -o "$wan_interface" -j ACCEPT
    iptables -A FORWARD -i "$wan_interface" -o "$lan_interface" -m state --state RELATED,ESTABLISHED -j ACCEPT
    
    success "NAT configured: $lan_interface → $wan_interface"
    clear_error_context
}

# Clear NAT rules
clear_nat_rules() {
    set_error_context "NAT cleanup"
    
    info "Clearing NAT rules"
    iptables -t nat -F POSTROUTING 2>/dev/null || true
    iptables -F FORWARD 2>/dev/null || true
    
    success "NAT rules cleared"
    clear_error_context
}

# Configure basic firewall rules for LAN
configure_lan_firewall() {
    local lan_interface="$1"
    local lan_network="${2:-$DEFAULT_LAN_NETWORK}"
    
    set_error_context "LAN firewall configuration"
    
    validate_interface "$lan_interface" "LAN interface"
    
    info "Configuring firewall for LAN: $lan_interface ($lan_network)"
    
    # Allow LAN traffic
    iptables -A INPUT -i "$lan_interface" -j ACCEPT
    iptables -A OUTPUT -o "$lan_interface" -j ACCEPT
    
    # Allow established connections
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    
    # Allow loopback
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A OUTPUT -o lo -j ACCEPT
    
    success "LAN firewall configured for $lan_interface"
    clear_error_context
}

# Start network services
start_network_services() {
    local services=("$@")
    
    set_error_context "Network service management"
    
    for service in "${services[@]}"; do
        info "Starting service: $service"
        if systemctl start "$service"; then
            success "Service started: $service"
        else
            error "Failed to start service: $service"
            clear_error_context
            return 1
        fi
    done
    
    clear_error_context
}

# Stop network services
stop_network_services() {
    local services=("$@")
    
    set_error_context "Network service management"
    
    for service in "${services[@]}"; do
        info "Stopping service: $service"
        systemctl stop "$service" 2>/dev/null || true
    done
    
    clear_error_context
}

# Configure DHCP client on interface
configure_dhcp_client() {
    local interface="$1"
    local timeout="${2:-30}"
    
    set_error_context "DHCP client configuration"
    
    validate_interface "$interface"
    
    info "Configuring DHCP client on $interface"
    
    # Release any existing lease
    dhclient -r "$interface" 2>/dev/null || true
    
    # Request new lease with timeout
    if timeout "$timeout" dhclient "$interface"; then
        success "DHCP configured on $interface"
    else
        error "DHCP configuration failed on $interface"
        clear_error_context
        return 1
    fi
    
    clear_error_context
}

# Check internet connectivity
check_internet_connectivity() {
    local test_hosts=("8.8.8.8" "1.1.1.1" "208.67.222.222")
    local timeout="${1:-5}"
    
    set_error_context "Internet connectivity check"
    
    for host in "${test_hosts[@]}"; do
        if ping -c 1 -W "$timeout" "$host" >/dev/null 2>&1; then
            success "Internet connectivity confirmed via $host"
            clear_error_context
            return 0
        fi
    done
    
    warning "No internet connectivity detected"
    clear_error_context
    return 1
}

# Detect WiFi interfaces using multiple fallback methods
# Returns: Array of WiFi interface names (one per line)
detect_wifi_interfaces() {
    local wifi_interfaces=()

    # Method 1: Check /sys/class/net/*/wireless directories (most reliable)
    if [[ -d /sys/class/net ]]; then
        for interface_path in /sys/class/net/*/wireless; do
            if [[ -d "${interface_path}" ]]; then
                local interface
                interface=$(basename "$(dirname "${interface_path}")")
                wifi_interfaces+=("${interface}")
            fi
        done
    fi

    # Method 2: Use iw if available and no interfaces found yet
    if [[ ${#wifi_interfaces[@]} -eq 0 ]] && command -v iw >/dev/null 2>&1; then
        while IFS= read -r interface; do
            if [[ -n "${interface}" ]]; then
                wifi_interfaces+=("${interface}")
            fi
        done < <(iw dev 2>/dev/null | grep Interface | awk '{print $2}' || true)
    fi

    # Method 3: Use nmcli if available and no interfaces found yet
    if [[ ${#wifi_interfaces[@]} -eq 0 ]] && command -v nmcli >/dev/null 2>&1; then
        while IFS= read -r interface; do
            if [[ -n "${interface}" ]]; then
                wifi_interfaces+=("${interface}")
            fi
        done < <(nmcli device status 2>/dev/null | awk '$2 == "wifi" {print $1}' || true)
    fi

    # Method 4: Fallback to /proc/net/wireless if still no interfaces found
    if [[ ${#wifi_interfaces[@]} -eq 0 && -f /proc/net/wireless ]]; then
        while IFS= read -r interface; do
            if [[ -n "${interface}" ]]; then
                wifi_interfaces+=("${interface}")
            fi
        done < <(awk 'NR > 2 && NF > 0 {print $1}' /proc/net/wireless 2>/dev/null | sed 's/:$//' || true)
    fi

    # Output interfaces (one per line)
    if [[ ${#wifi_interfaces[@]} -gt 0 ]]; then
        printf '%s\n' "${wifi_interfaces[@]}"
    fi
}

# Count WiFi interfaces
count_wifi_interfaces() {
    local count=0
    while IFS= read -r interface; do
        if [[ -n "${interface}" ]]; then
            ((count++))
        fi
    done < <(detect_wifi_interfaces)
    echo "${count}"
}

# Get first available WiFi interface
get_first_wifi_interface() {
    detect_wifi_interfaces | head -1
}

# Get interface IP address
get_interface_ip() {
    local interface="$1"

    validate_interface "$interface"

    ip addr show "$interface" | grep -oP 'inet \K[\d.]+' | head -1
}

# Check if interface has IP address
interface_has_ip() {
    local interface="$1"
    
    validate_interface "$interface"
    
    [[ -n "$(get_interface_ip "$interface")" ]]
}

# Wait for interface to get IP address
wait_for_interface_ip() {
    local interface="$1"
    local timeout="${2:-30}"
    local interval="${3:-2}"
    
    set_error_context "Interface IP wait"
    
    validate_interface "$interface"
    
    info "Waiting for $interface to get IP address (timeout: ${timeout}s)"
    
    local elapsed=0
    while [[ $elapsed -lt $timeout ]]; do
        if interface_has_ip "$interface"; then
            local ip
            ip=$(get_interface_ip "$interface")
            success "$interface has IP address: $ip"
            clear_error_context
            return 0
        fi
        
        sleep "$interval"
        elapsed=$((elapsed + interval))
    done
    
    error "Timeout waiting for $interface to get IP address"
    clear_error_context
    return 1
}

# Create bridge interface
create_bridge() {
    local bridge_name="$1"
    shift
    local interfaces=("$@")
    
    set_error_context "Bridge creation"
    
    info "Creating bridge: $bridge_name"
    
    # Create bridge
    if ! ip link show "$bridge_name" >/dev/null 2>&1; then
        ip link add name "$bridge_name" type bridge
    fi
    
    # Add interfaces to bridge
    for interface in "${interfaces[@]}"; do
        validate_interface "$interface"
        info "Adding $interface to bridge $bridge_name"
        ip link set "$interface" master "$bridge_name"
    done
    
    # Bring bridge up
    ip link set "$bridge_name" up
    
    success "Bridge $bridge_name created with interfaces: ${interfaces[*]}"
    clear_error_context
}

# Remove bridge interface
remove_bridge() {
    local bridge_name="$1"
    
    set_error_context "Bridge removal"
    
    if ip link show "$bridge_name" >/dev/null 2>&1; then
        info "Removing bridge: $bridge_name"
        ip link set "$bridge_name" down 2>/dev/null || true
        ip link delete "$bridge_name" 2>/dev/null || true
        success "Bridge $bridge_name removed"
    else
        debug "Bridge $bridge_name does not exist"
    fi
    
    clear_error_context
}
