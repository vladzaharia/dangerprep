#!/usr/bin/env bash
# DangerPrep Network Intelligence Engine
#
# Purpose: Decision logic for automatic network mode switching and WAN prioritization
# Usage: Source this file to access network intelligence functions
# Dependencies: state/network.sh, network.sh, ip (iproute2)
# Author: DangerPrep Project
# Version: 1.0

# Modern shell script best practices
set -euo pipefail

# WAN interface priorities (higher number = higher priority)
readonly PRIORITY_ETHERNET=100
readonly PRIORITY_WIFI_REPEATER=80
readonly PRIORITY_WIFI_CLIENT=60
readonly PRIORITY_USB_ETHERNET=40
readonly PRIORITY_OTHER=20

# Evaluation thresholds
readonly CONNECTIVITY_CHECK_TIMEOUT=10
# shellcheck disable=SC2034  # Variable reserved for future use
readonly INTERFACE_STABILITY_TIME=30
readonly MIN_EVALUATION_INTERVAL=15

# Scan all interfaces and update connectivity status
scan_interface_connectivity() {
    set_error_context "Interface connectivity scan"
    
    info "Scanning interface connectivity..."
    
    # Get all active network interfaces
    local interfaces
    interfaces=$(ip link show | grep -E "^[0-9]+: " | cut -d: -f2 | tr -d ' ' | grep -v "^lo$")
    
    for interface in $interfaces; do
        scan_single_interface_connectivity "$interface"
    done
    
    success "Interface connectivity scan completed"
    clear_error_context
}

# Scan connectivity for a single interface
scan_single_interface_connectivity() {
    local interface="$1"
    
    set_error_context "Single interface connectivity scan"
    
    debug "Scanning connectivity for interface: $interface"
    
    # Check if interface is up
    if ! ip link show "$interface" | grep -q "state UP"; then
        debug "Interface $interface is down"
        update_interface_connectivity "$interface" "false" "" ""
        clear_error_context
        return 0
    fi
    
    # Get IP address and gateway
    local ip_address
    ip_address=$(ip addr show "$interface" | grep -oP 'inet \K[\d.]+' | head -1 || echo "")
    
    local gateway
    gateway=$(ip route show dev "$interface" | grep "^default" | awk '{print $3}' | head -1 || echo "")
    
    # Test internet connectivity if we have IP and gateway
    local has_internet="false"
    if [[ -n "$ip_address" && -n "$gateway" ]]; then
        if test_internet_connectivity_via_interface "$interface"; then
            has_internet="true"
            debug "Interface $interface has internet connectivity"
        else
            debug "Interface $interface has no internet connectivity"
        fi
    else
        debug "Interface $interface has no IP address or gateway"
    fi
    
    # Update connectivity status
    update_interface_connectivity "$interface" "$has_internet" "$ip_address" "$gateway"
    
    clear_error_context
}

# Test internet connectivity via specific interface
test_internet_connectivity_via_interface() {
    local interface="$1"
    local test_hosts=("8.8.8.8" "1.1.1.1" "208.67.222.222")
    
    for host in "${test_hosts[@]}"; do
        if timeout "$CONNECTIVITY_CHECK_TIMEOUT" ping -c 1 -W 3 -I "$interface" "$host" >/dev/null 2>&1; then
            return 0
        fi
    done
    
    return 1
}

# Get interface priority based on type and characteristics
get_interface_priority() {
    local interface="$1"
    
    # Ethernet interfaces (highest priority)
    if [[ "$interface" =~ ^(eth|enp|eno|ens)[0-9] ]]; then
        echo "$PRIORITY_ETHERNET"
        return 0
    fi
    
    # USB ethernet interfaces
    if [[ "$interface" =~ ^(usb|enx)[0-9a-f] ]]; then
        echo "$PRIORITY_USB_ETHERNET"
        return 0
    fi
    
    # WiFi interfaces - need to determine if client or repeater
    if [[ "$interface" =~ ^(wlan|wlp)[0-9] ]]; then
        # Check if this is a WiFi repeater (has hostapd running)
        if pgrep -f "hostapd.*$interface" >/dev/null 2>&1; then
            echo "$PRIORITY_WIFI_REPEATER"
        else
            echo "$PRIORITY_WIFI_CLIENT"
        fi
        return 0
    fi
    
    # Other interfaces
    echo "$PRIORITY_OTHER"
}

# Evaluate and prioritize WAN candidates
evaluate_wan_candidates() {
    set_error_context "WAN candidate evaluation"
    
    info "Evaluating WAN candidates..."
    
    # Get all interfaces with internet connectivity
    local candidates=()
    local interfaces
    interfaces=$(ip link show | grep -E "^[0-9]+: " | cut -d: -f2 | tr -d ' ' | grep -v "^lo$")
    
    for interface in $interfaces; do
        if interface_has_internet "$interface"; then
            local priority
            priority=$(get_interface_priority "$interface")
            candidates+=("$priority:$interface")
            debug "WAN candidate: $interface (priority: $priority)"
        fi
    done
    
    if [[ ${#candidates[@]} -eq 0 ]]; then
        info "No WAN candidates found"
        clear_error_context
        return 1
    fi
    
    # Sort candidates by priority (highest first)
    local sorted_candidates
    mapfile -t sorted_candidates < <(printf '%s\n' "${candidates[@]}" | sort -rn)
    
    # Extract interfaces from sorted list
    local primary_wan=""
    local secondary_wan=""
    local available_wan=()
    
    for i in "${!sorted_candidates[@]}"; do
        local interface
        interface=$(echo "${sorted_candidates[$i]}" | cut -d: -f2)
        
        if [[ $i -eq 0 ]]; then
            primary_wan="$interface"
        elif [[ $i -eq 1 ]]; then
            secondary_wan="$interface"
        else
            available_wan+=("$interface")
        fi
    done
    
    # Update network state
    set_wan_primary "$primary_wan"
    if [[ -n "$secondary_wan" ]]; then
        set_wan_secondary "$secondary_wan"
    else
        set_network_state "wan_secondary" "null"
    fi
    
    # Clear and rebuild available WAN list
    set_network_state_object "wan_available" "[]"
    for interface in "${available_wan[@]}"; do
        add_wan_available "$interface"
    done
    
    success "WAN candidates evaluated: primary=$primary_wan, secondary=$secondary_wan"
    clear_error_context
    return 0
}

# Determine optimal network mode based on current state
determine_network_mode() {
    set_error_context "Network mode determination"
    
    local wan_primary
    wan_primary=$(get_wan_primary)
    
    local wan_secondary
    wan_secondary=$(get_wan_secondary)
    
    local wan_available
    wan_available=$(get_wan_available)
    
    # Determine mode based on WAN availability
    if [[ "$wan_primary" != "null" && -n "$wan_primary" ]]; then
        if [[ "$wan_secondary" != "null" && -n "$wan_secondary" ]] || [[ -n "$wan_available" ]]; then
            echo "$MODE_MIXED_MODE"
        else
            echo "$MODE_INTERNET_SHARING"
        fi
    else
        echo "$MODE_LOCAL_ONLY"
    fi
    
    clear_error_context
}

# Evaluate current network configuration and determine if changes are needed
evaluate_network_configuration() {
    set_error_context "Network configuration evaluation"
    
    info "Evaluating network configuration..."
    
    # Skip evaluation if auto mode is disabled
    if ! is_auto_mode_enabled; then
        info "Auto mode disabled, skipping evaluation"
        clear_error_context
        return 0
    fi
    
    # Check if enough time has passed since last evaluation
    local last_evaluation
    last_evaluation=$(get_network_state "last_evaluation" "null")
    if [[ "$last_evaluation" != "null" ]]; then
        local last_epoch
        last_epoch=$(date -d "$last_evaluation" +%s 2>/dev/null || echo "0")
        local current_epoch
        current_epoch=$(date +%s)
        local time_diff
        time_diff=$((current_epoch - last_epoch))
        
        if [[ $time_diff -lt $MIN_EVALUATION_INTERVAL ]]; then
            debug "Skipping evaluation, too soon since last evaluation (${time_diff}s < ${MIN_EVALUATION_INTERVAL}s)"
            clear_error_context
            return 0
        fi
    fi
    
    # Mark evaluation timestamp
    mark_network_evaluation
    
    # Scan interface connectivity
    scan_interface_connectivity
    
    # Evaluate WAN candidates
    evaluate_wan_candidates || true  # Continue even if no WAN candidates found
    
    # Determine optimal network mode
    local optimal_mode
    optimal_mode=$(determine_network_mode)
    
    local current_mode
    current_mode=$(get_network_mode)
    
    # Check if mode change is needed
    if [[ "$current_mode" != "$optimal_mode" ]]; then
        info "Network mode change needed: $current_mode → $optimal_mode"
        set_network_mode "$optimal_mode"
        
        # Trigger network reconfiguration
        apply_network_configuration
    else
        debug "Network mode unchanged: $current_mode"
    fi
    
    success "Network configuration evaluation completed"
    clear_error_context
    return 0
}

# Apply network configuration based on current state
apply_network_configuration() {
    set_error_context "Network configuration application"
    
    local mode
    mode=$(get_network_mode)
    
    info "Applying network configuration for mode: $mode"
    
    case "$mode" in
        "$MODE_INTERNET_SHARING")
            apply_internet_sharing_configuration
            ;;
        "$MODE_LOCAL_ONLY")
            apply_local_only_configuration
            ;;
        "$MODE_MIXED_MODE")
            apply_mixed_mode_configuration
            ;;
        "$MODE_BRIDGE_MODE")
            apply_bridge_mode_configuration
            ;;
        *)
            warning "Unknown network mode: $mode"
            ;;
    esac
    
    success "Network configuration applied for mode: $mode"
    clear_error_context
}

# Apply internet sharing configuration
apply_internet_sharing_configuration() {
    set_error_context "Internet sharing configuration"
    
    local wan_primary
    wan_primary=$(get_wan_primary)
    
    if [[ "$wan_primary" == "null" || -z "$wan_primary" ]]; then
        error "No primary WAN interface for internet sharing"
        clear_error_context
        return 1
    fi
    
    info "Configuring internet sharing via $wan_primary"
    
    # Enable IP forwarding
    enable_ip_forwarding
    
    # Get LAN interfaces
    local lan_interfaces
    lan_interfaces=$(get_lan_interfaces)
    
    # If no LAN interfaces configured, use WiFi as default
    if [[ -z "$lan_interfaces" ]]; then
        local wifi_interface="${WIFI_INTERFACE:-wlan0}"
        if validate_interface "$wifi_interface" >/dev/null 2>&1; then
            add_lan_interface "$wifi_interface"
            lan_interfaces="$wifi_interface"
        fi
    fi
    
    # Configure NAT for each LAN interface
    for lan_interface in $lan_interfaces; do
        if validate_interface "$lan_interface" >/dev/null 2>&1; then
            info "Setting up NAT: $lan_interface → $wan_primary"
            configure_nat_rules "$wan_primary" "$lan_interface" false
            configure_lan_firewall "$lan_interface"
        fi
    done
    
    # Start network services
    start_network_services hostapd dnsmasq
    
    clear_error_context
}

# Apply local-only configuration
apply_local_only_configuration() {
    set_error_context "Local-only configuration"
    
    info "Configuring local-only network"
    
    # Disable IP forwarding
    disable_ip_forwarding
    
    # Clear NAT rules
    clear_nat_rules
    
    # Configure local network
    local wifi_interface="${WIFI_INTERFACE:-wlan0}"
    if validate_interface "$wifi_interface" >/dev/null 2>&1; then
        local lan_ip
        lan_ip=$(get_network_state "configuration.lan_ip" "$DEFAULT_LAN_IP")
        configure_interface_ip "$wifi_interface" "${lan_ip}/22"
        configure_lan_firewall "$wifi_interface"
        add_lan_interface "$wifi_interface"
    fi
    
    # Start local services
    start_network_services hostapd dnsmasq
    
    clear_error_context
}

# Apply mixed mode configuration (multiple WAN sources)
apply_mixed_mode_configuration() {
    set_error_context "Mixed mode configuration"
    
    info "Configuring mixed mode network"
    
    # Use primary WAN for main routing
    apply_internet_sharing_configuration
    
    # TODO: Add load balancing or failover logic for secondary WAN
    
    clear_error_context
}

# Apply bridge mode configuration
apply_bridge_mode_configuration() {
    set_error_context "Bridge mode configuration"
    
    info "Configuring bridge mode network"
    
    # TODO: Implement bridge mode configuration
    warning "Bridge mode not yet implemented"
    
    clear_error_context
}

# Handle interface state change event
handle_interface_change() {
    local interface="$1"
    local change_type="$2"  # up/down/ip_assigned/ip_removed
    
    set_error_context "Interface change handling"
    
    info "Handling interface change: $interface ($change_type)"
    
    # Update connectivity for the changed interface
    scan_single_interface_connectivity "$interface"
    
    # Trigger network re-evaluation
    evaluate_network_configuration
    
    clear_error_context
}

# Handle WiFi connection event
handle_wifi_connection() {
    local interface="$1"
    local ssid="$2"
    local is_repeater="${3:-false}"
    
    set_error_context "WiFi connection handling"
    
    info "Handling WiFi connection: $interface to $ssid (repeater: $is_repeater)"
    
    # Update connectivity for WiFi interface
    scan_single_interface_connectivity "$interface"
    
    # If WiFi has internet, it becomes a WAN candidate
    if interface_has_internet "$interface"; then
        info "WiFi interface $interface has internet, adding as WAN candidate"
    fi
    
    # Trigger network re-evaluation
    evaluate_network_configuration
    
    clear_error_context
}

# Handle WiFi disconnection event
handle_wifi_disconnection() {
    local interface="$1"
    
    set_error_context "WiFi disconnection handling"
    
    info "Handling WiFi disconnection: $interface"
    
    # Clear connectivity status
    update_interface_connectivity "$interface" "false" "" ""
    
    # Remove from WAN roles if assigned
    clear_interface_role "$interface"
    
    # Trigger network re-evaluation
    evaluate_network_configuration
    
    clear_error_context
}

# Force network re-evaluation
force_network_evaluation() {
    set_error_context "Forced network evaluation"
    
    info "Forcing network re-evaluation..."
    
    # Reset last evaluation time to force evaluation
    set_network_state "last_evaluation" "null" false
    
    # Run evaluation
    evaluate_network_configuration
    
    clear_error_context
}
