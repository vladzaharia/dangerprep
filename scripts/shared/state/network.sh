#!/usr/bin/env bash
# DangerPrep Network State Management
#
# Purpose: Centralized network state tracking and management
# Usage: Source this file to access network state functions
# Dependencies: jq (for JSON processing), ip (iproute2)
# Author: DangerPrep Project
# Version: 1.0

# Modern shell script best practices
set -euo pipefail

# Network state configuration
readonly NETWORK_STATE_DIR="/var/lib/dangerprep"
readonly NETWORK_STATE_FILE="${NETWORK_STATE_DIR}/network-state.json"
readonly NETWORK_CONFIG_DIR="/etc/dangerprep/network"
readonly NETWORK_LOCK_FILE="/var/run/dangerprep-network.lock"

# Network modes
readonly MODE_LOCAL_ONLY="LOCAL_ONLY"
# shellcheck disable=SC2034  # Used by intelligence/network.sh
readonly MODE_INTERNET_SHARING="INTERNET_SHARING"
# shellcheck disable=SC2034  # Reserved for future bridge mode implementation
readonly MODE_BRIDGE_MODE="BRIDGE_MODE"
# shellcheck disable=SC2034  # Reserved for future mixed mode implementation
readonly MODE_MIXED_MODE="MIXED_MODE"

# Interface roles
readonly ROLE_WAN_PRIMARY="WAN_PRIMARY"
readonly ROLE_WAN_SECONDARY="WAN_SECONDARY"
readonly ROLE_WAN_AVAILABLE="WAN_AVAILABLE"
readonly ROLE_LAN="LAN"
readonly ROLE_DISABLED="DISABLED"

# Initialize network state system
init_network_state() {
    set_error_context "Network state initialization"
    
    # Create directories
    mkdir -p "$NETWORK_STATE_DIR" 2>/dev/null || true
    mkdir -p "$NETWORK_CONFIG_DIR" 2>/dev/null || true
    
    # Initialize state file if it doesn't exist
    if [[ ! -f "$NETWORK_STATE_FILE" ]]; then
        create_default_network_state
    fi
    
    # Validate state file
    if ! validate_network_state_file; then
        warning "Invalid network state file, recreating"
        create_default_network_state
    fi
    
    clear_error_context
}

# Create default network state
create_default_network_state() {
    set_error_context "Default network state creation"
    
    local default_state
    default_state=$(cat << 'EOF'
{
  "version": "1.0",
  "mode": "LOCAL_ONLY",
  "auto_mode": true,
  "wan_primary": null,
  "wan_secondary": null,
  "wan_available": [],
  "lan_interfaces": [],
  "disabled_interfaces": [],
  "connectivity_status": {},
  "last_update": null,
  "last_evaluation": null,
  "configuration": {
    "lan_network": "192.168.120.0/22",
    "lan_ip": "192.168.120.1",
    "wifi_ssid": "DangerPrep",
    "wifi_password": "Buff00n!",
    "evaluation_interval": 30,
    "connectivity_timeout": 10
  }
}
EOF
    )
    
    echo "$default_state" > "$NETWORK_STATE_FILE"
    chmod 644 "$NETWORK_STATE_FILE"
    
    success "Default network state created"
    clear_error_context
}

# Validate network state file
validate_network_state_file() {
    [[ -f "$NETWORK_STATE_FILE" ]] && jq empty "$NETWORK_STATE_FILE" 2>/dev/null
}

# Acquire network state lock
acquire_network_lock() {
    local timeout="${1:-10}"
    local elapsed=0
    
    while [[ $elapsed -lt $timeout ]]; do
        if (set -C; echo $$ > "$NETWORK_LOCK_FILE") 2>/dev/null; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done
    
    return 1
}

# Release network state lock
release_network_lock() {
    rm -f "$NETWORK_LOCK_FILE"
}

# Get network state value
get_network_state() {
    local key="$1"
    local default="${2:-null}"
    
    if [[ ! -f "$NETWORK_STATE_FILE" ]]; then
        echo "$default"
        return 0
    fi
    
    jq -r ".$key // \"$default\"" "$NETWORK_STATE_FILE" 2>/dev/null || echo "$default"
}

# Set network state value
set_network_state() {
    local key="$1"
    local value="$2"
    local update_timestamp="${3:-true}"
    
    set_error_context "Network state update"
    
    if ! acquire_network_lock; then
        error "Failed to acquire network state lock"
        clear_error_context
        return 1
    fi
    
    # Update the state
    local temp_file
    temp_file=$(mktemp)
    
    if [[ "$update_timestamp" == "true" ]]; then
        jq ".$key = \"$value\" | .last_update = \"$(date -Iseconds)\"" "$NETWORK_STATE_FILE" > "$temp_file"
    else
        jq ".$key = \"$value\"" "$NETWORK_STATE_FILE" > "$temp_file"
    fi
    
    mv "$temp_file" "$NETWORK_STATE_FILE"
    release_network_lock
    
    debug "Network state updated: $key = $value"
    clear_error_context
}

# Set network state object
set_network_state_object() {
    local key="$1"
    local json_value="$2"
    local update_timestamp="${3:-true}"
    
    set_error_context "Network state object update"
    
    if ! acquire_network_lock; then
        error "Failed to acquire network state lock"
        clear_error_context
        return 1
    fi
    
    local temp_file
    temp_file=$(mktemp)
    
    if [[ "$update_timestamp" == "true" ]]; then
        jq ".$key = $json_value | .last_update = \"$(date -Iseconds)\"" "$NETWORK_STATE_FILE" > "$temp_file"
    else
        jq ".$key = $json_value" "$NETWORK_STATE_FILE" > "$temp_file"
    fi
    
    mv "$temp_file" "$NETWORK_STATE_FILE"
    release_network_lock
    
    debug "Network state object updated: $key"
    clear_error_context
}

# Get current network mode
get_network_mode() {
    get_network_state "mode" "$MODE_LOCAL_ONLY"
}

# Set network mode
set_network_mode() {
    local mode="$1"
    set_network_state "mode" "$mode"
    info "Network mode set to: $mode"
}

# Get WAN interfaces
get_wan_primary() {
    get_network_state "wan_primary" "null"
}

get_wan_secondary() {
    get_network_state "wan_secondary" "null"
}

get_wan_available() {
    get_network_state "wan_available" "[]" | jq -r '.[]' 2>/dev/null || true
}

# Set WAN interfaces
set_wan_primary() {
    local interface="$1"
    set_network_state "wan_primary" "$interface"
    info "Primary WAN interface set to: $interface"
}

set_wan_secondary() {
    local interface="$1"
    set_network_state "wan_secondary" "$interface"
    info "Secondary WAN interface set to: $interface"
}

# Add/remove WAN available interfaces
add_wan_available() {
    local interface="$1"
    
    set_error_context "WAN available interface addition"
    
    if ! acquire_network_lock; then
        error "Failed to acquire network state lock"
        clear_error_context
        return 1
    fi
    
    local temp_file
    temp_file=$(mktemp)
    
    jq ".wan_available |= (. + [\"$interface\"] | unique) | .last_update = \"$(date -Iseconds)\"" "$NETWORK_STATE_FILE" > "$temp_file"
    mv "$temp_file" "$NETWORK_STATE_FILE"
    
    release_network_lock
    
    debug "Added WAN available interface: $interface"
    clear_error_context
}

remove_wan_available() {
    local interface="$1"
    
    set_error_context "WAN available interface removal"
    
    if ! acquire_network_lock; then
        error "Failed to acquire network state lock"
        clear_error_context
        return 1
    fi
    
    local temp_file
    temp_file=$(mktemp)
    
    jq ".wan_available |= (. - [\"$interface\"]) | .last_update = \"$(date -Iseconds)\"" "$NETWORK_STATE_FILE" > "$temp_file"
    mv "$temp_file" "$NETWORK_STATE_FILE"
    
    release_network_lock
    
    debug "Removed WAN available interface: $interface"
    clear_error_context
}

# Get/set LAN interfaces
get_lan_interfaces() {
    get_network_state "lan_interfaces" "[]" | jq -r '.[]' 2>/dev/null || true
}

add_lan_interface() {
    local interface="$1"
    
    set_error_context "LAN interface addition"
    
    if ! acquire_network_lock; then
        error "Failed to acquire network state lock"
        clear_error_context
        return 1
    fi
    
    local temp_file
    temp_file=$(mktemp)
    
    jq ".lan_interfaces |= (. + [\"$interface\"] | unique) | .last_update = \"$(date -Iseconds)\"" "$NETWORK_STATE_FILE" > "$temp_file"
    mv "$temp_file" "$NETWORK_STATE_FILE"
    
    release_network_lock
    
    debug "Added LAN interface: $interface"
    clear_error_context
}

remove_lan_interface() {
    local interface="$1"
    
    set_error_context "LAN interface removal"
    
    if ! acquire_network_lock; then
        error "Failed to acquire network state lock"
        clear_error_context
        return 1
    fi
    
    local temp_file
    temp_file=$(mktemp)
    
    jq ".lan_interfaces |= (. - [\"$interface\"]) | .last_update = \"$(date -Iseconds)\"" "$NETWORK_STATE_FILE" > "$temp_file"
    mv "$temp_file" "$NETWORK_STATE_FILE"
    
    release_network_lock
    
    debug "Removed LAN interface: $interface"
    clear_error_context
}

# Get interface role
get_interface_role() {
    local interface="$1"
    
    local wan_primary
    wan_primary=$(get_wan_primary)
    if [[ "$wan_primary" == "$interface" ]]; then
        echo "$ROLE_WAN_PRIMARY"
        return 0
    fi
    
    local wan_secondary
    wan_secondary=$(get_wan_secondary)
    if [[ "$wan_secondary" == "$interface" ]]; then
        echo "$ROLE_WAN_SECONDARY"
        return 0
    fi
    
    if get_wan_available | grep -q "^$interface$"; then
        echo "$ROLE_WAN_AVAILABLE"
        return 0
    fi
    
    if get_lan_interfaces | grep -q "^$interface$"; then
        echo "$ROLE_LAN"
        return 0
    fi
    
    echo "$ROLE_DISABLED"
}

# Set interface role
set_interface_role() {
    local interface="$1"
    local role="$2"
    
    set_error_context "Interface role assignment"
    
    # Remove interface from all current roles
    clear_interface_role "$interface"
    
    # Assign new role
    case "$role" in
        "$ROLE_WAN_PRIMARY")
            set_wan_primary "$interface"
            ;;
        "$ROLE_WAN_SECONDARY")
            set_wan_secondary "$interface"
            ;;
        "$ROLE_WAN_AVAILABLE")
            add_wan_available "$interface"
            ;;
        "$ROLE_LAN")
            add_lan_interface "$interface"
            ;;
        "$ROLE_DISABLED")
            # Already cleared, nothing to do
            ;;
        *)
            error "Unknown interface role: $role"
            clear_error_context
            return 1
            ;;
    esac
    
    info "Interface $interface role set to: $role"
    clear_error_context
}

# Clear interface from all roles
clear_interface_role() {
    local interface="$1"
    
    # Clear from WAN primary/secondary
    local wan_primary
    wan_primary=$(get_wan_primary)
    if [[ "$wan_primary" == "$interface" ]]; then
        set_network_state "wan_primary" "null"
    fi
    
    local wan_secondary
    wan_secondary=$(get_wan_secondary)
    if [[ "$wan_secondary" == "$interface" ]]; then
        set_network_state "wan_secondary" "null"
    fi
    
    # Remove from WAN available and LAN
    remove_wan_available "$interface"
    remove_lan_interface "$interface"
}

# Update connectivity status for interface
update_interface_connectivity() {
    local interface="$1"
    local has_internet="${2:-false}"
    local ip_address="${3:-}"
    local gateway="${4:-}"
    
    set_error_context "Interface connectivity update"
    
    local connectivity_info
    connectivity_info=$(jq -n \
        --arg interface "$interface" \
        --arg has_internet "$has_internet" \
        --arg ip_address "$ip_address" \
        --arg gateway "$gateway" \
        --arg timestamp "$(date -Iseconds)" \
        '{
            has_internet: ($has_internet == "true"),
            ip_address: $ip_address,
            gateway: $gateway,
            last_check: $timestamp
        }')
    
    if ! acquire_network_lock; then
        error "Failed to acquire network state lock"
        clear_error_context
        return 1
    fi
    
    local temp_file
    temp_file=$(mktemp)
    
    jq ".connectivity_status[\"$interface\"] = $connectivity_info | .last_update = \"$(date -Iseconds)\"" "$NETWORK_STATE_FILE" > "$temp_file"
    mv "$temp_file" "$NETWORK_STATE_FILE"
    
    release_network_lock
    
    debug "Updated connectivity for $interface: internet=$has_internet"
    clear_error_context
}

# Get interface connectivity status
get_interface_connectivity() {
    local interface="$1"
    local field="${2:-has_internet}"
    
    jq -r ".connectivity_status[\"$interface\"].$field // false" "$NETWORK_STATE_FILE" 2>/dev/null
}

# Check if interface has internet
interface_has_internet() {
    local interface="$1"
    [[ "$(get_interface_connectivity "$interface" "has_internet")" == "true" ]]
}

# Get network state summary
get_network_state_summary() {
    set_error_context "Network state summary"
    
    if [[ ! -f "$NETWORK_STATE_FILE" ]]; then
        echo "Network state not initialized"
        clear_error_context
        return 1
    fi
    
    echo "=== Network State Summary ==="
    echo "Mode: $(get_network_mode)"
    echo "Auto Mode: $(get_network_state "auto_mode" "true")"
    echo "Primary WAN: $(get_wan_primary)"
    echo "Secondary WAN: $(get_wan_secondary)"
    echo "Available WAN: $(get_wan_available | tr '\n' ' ')"
    echo "LAN Interfaces: $(get_lan_interfaces | tr '\n' ' ')"
    echo "Last Update: $(get_network_state "last_update" "Never")"
    echo "Last Evaluation: $(get_network_state "last_evaluation" "Never")"
    
    clear_error_context
}

# Mark evaluation timestamp
mark_network_evaluation() {
    set_network_state "last_evaluation" "$(date -Iseconds)" false
}

# Check if auto mode is enabled
is_auto_mode_enabled() {
    [[ "$(get_network_state "auto_mode" "true")" == "true" ]]
}

# Enable/disable auto mode
set_auto_mode() {
    local enabled="$1"
    set_network_state "auto_mode" "$enabled"
    info "Auto mode set to: $enabled"
}
