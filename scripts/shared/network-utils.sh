#!/bin/bash
# DangerPrep Network Utilities
# Provides network-related helper functions with timeout support

# Default timeout for network operations (in seconds)
readonly DEFAULT_NETWORK_TIMEOUT=30

#######################################
# Execute a command with timeout
# Arguments:
#   $1 - Timeout in seconds
#   $@ - Command and arguments to execute
# Returns:
#   Command exit code, or 124 if timeout
#######################################
run_with_timeout() {
    local timeout_seconds="$1"
    shift
    
    if command -v timeout >/dev/null 2>&1; then
        timeout "${timeout_seconds}" "$@"
    else
        # Fallback if timeout command not available
        "$@"
    fi
}

#######################################
# Check if NetworkManager is available and running
# Returns:
#   0 if available and running, 1 otherwise
#######################################
check_networkmanager() {
    # Check if nmcli is available
    if ! command -v nmcli >/dev/null 2>&1; then
        return 1
    fi
    
    # Check if NetworkManager service is running
    if ! systemctl is-active --quiet NetworkManager 2>/dev/null; then
        return 1
    fi
    
    return 0
}

#######################################
# Safely connect to WiFi using nmcli with password from stdin
# This avoids password exposure in process list
# Arguments:
#   $1 - Interface name
#   $2 - SSID
#   $3 - Password
#   $4 - Timeout (optional, default: 30 seconds)
# Returns:
#   0 on success, 1 on failure
#######################################
safe_wifi_connect() {
    local interface="$1"
    local ssid="$2"
    local password="$3"
    local timeout="${4:-${DEFAULT_NETWORK_TIMEOUT}}"
    
    # Create a temporary file for password (with secure permissions)
    local password_file
    password_file=$(mktemp)
    chmod 600 "${password_file}"
    
    # Ensure cleanup
    trap "rm -f '${password_file}'" RETURN
    
    # Write password to file
    echo "${password}" > "${password_file}"
    
    # Disconnect from current network first
    nmcli device disconnect "${interface}" 2>/dev/null || true
    
    # Connect using password file
    if run_with_timeout "${timeout}" \
        nmcli device wifi connect "${ssid}" \
        password-file "${password_file}" \
        ifname "${interface}" 2>&1; then
        rm -f "${password_file}"
        return 0
    else
        rm -f "${password_file}"
        return 1
    fi
}

#######################################
# Scan for WiFi networks with timeout
# Arguments:
#   $1 - Interface name
#   $2 - Timeout (optional, default: 30 seconds)
# Outputs:
#   List of SSIDs, one per line
# Returns:
#   0 on success, 1 on failure
#######################################
safe_wifi_scan() {
    local interface="$1"
    local timeout="${2:-${DEFAULT_NETWORK_TIMEOUT}}"
    
    # Trigger rescan
    run_with_timeout "${timeout}" nmcli device wifi rescan ifname "${interface}" 2>/dev/null || true
    
    # Wait for scan to complete (adaptive wait)
    local wait_time=0
    local max_wait=5
    while [[ $wait_time -lt $max_wait ]]; do
        sleep 1
        ((wait_time++))
        
        # Check if we have results
        if nmcli -t -f SSID device wifi list ifname "${interface}" 2>/dev/null | grep -q .; then
            break
        fi
    done
    
    # Get available networks
    nmcli -t -f SSID device wifi list ifname "${interface}" 2>/dev/null | \
        grep -v "^$" | \
        sort -u
}

#######################################
# Check if an interface supports AP mode
# Arguments:
#   $1 - Interface name
# Returns:
#   0 if AP mode is supported, 1 otherwise
#######################################
check_ap_mode_support() {
    local interface="$1"
    
    # Check using iw list (more reliable than iw info)
    if command -v iw >/dev/null 2>&1; then
        # Get the phy for this interface
        local phy
        phy=$(iw dev "${interface}" info 2>/dev/null | grep wiphy | awk '{print "phy"$2}')
        
        if [[ -n "${phy}" ]]; then
            # Check supported interface modes
            if iw "${phy}" info 2>/dev/null | grep -A 10 "Supported interface modes:" | grep -q "AP"; then
                return 0
            fi
        fi
    fi
    
    # Fallback: check if interface exists and is wireless
    if [[ -d "/sys/class/net/${interface}/wireless" ]]; then
        return 0
    fi
    
    return 1
}

#######################################
# Get the default route interface (WAN interface)
# Returns:
#   Interface name or empty string if not found
#######################################
get_wan_interface() {
    local wan_interface
    wan_interface=$(ip route show default 2>/dev/null | grep -oP 'dev \K\S+' | head -1)
    
    echo "${wan_interface}"
}

#######################################
# Check if an interface has internet connectivity
# Arguments:
#   $1 - Interface name (optional, checks default route if not specified)
# Returns:
#   0 if internet is reachable, 1 otherwise
#######################################
check_internet_connectivity() {
    local interface="${1:-}"
    local ping_args=(-c 1 -W 5)
    
    if [[ -n "${interface}" ]]; then
        ping_args+=(-I "${interface}")
    fi
    
    # Try to ping common DNS servers
    if ping "${ping_args[@]}" 8.8.8.8 >/dev/null 2>&1 || \
       ping "${ping_args[@]}" 1.1.1.1 >/dev/null 2>&1; then
        return 0
    fi
    
    return 1
}

#######################################
# Disable power management on a wireless interface
# This prevents the interface from going to sleep in AP mode
# Arguments:
#   $1 - Interface name
# Returns:
#   0 on success, 1 on failure
#######################################
disable_power_management() {
    local interface="$1"
    
    if command -v iw >/dev/null 2>&1; then
        iw dev "${interface}" set power_save off 2>/dev/null || true
    fi
    
    if command -v iwconfig >/dev/null 2>&1; then
        iwconfig "${interface}" power off 2>/dev/null || true
    fi
    
    return 0
}

#######################################
# Get current SSID for an interface
# Arguments:
#   $1 - Interface name
# Returns:
#   SSID or empty string if not connected
#######################################
get_current_ssid() {
    local interface="$1"
    local ssid
    
    # Try using nmcli first
    if command -v nmcli >/dev/null 2>&1; then
        ssid=$(nmcli -t -f DEVICE,STATE,CONNECTION device status 2>/dev/null | \
               grep "^${interface}:connected:" | \
               cut -d: -f3)
        
        if [[ -n "${ssid}" ]]; then
            echo "${ssid}"
            return 0
        fi
    fi
    
    # Fallback to iw
    if command -v iw >/dev/null 2>&1; then
        ssid=$(iw dev "${interface}" info 2>/dev/null | grep ssid | awk '{print $2}')
        echo "${ssid}"
    fi
}

#######################################
# Verify WiFi connection to specific SSID
# Arguments:
#   $1 - Interface name
#   $2 - Expected SSID
#   $3 - Max wait time in seconds (optional, default: 10)
# Returns:
#   0 if connected to expected SSID, 1 otherwise
#######################################
verify_wifi_connection() {
    local interface="$1"
    local expected_ssid="$2"
    local max_wait="${3:-10}"
    local wait_time=0
    
    while [[ $wait_time -lt $max_wait ]]; do
        local current_ssid
        current_ssid=$(get_current_ssid "${interface}")
        
        if [[ "${current_ssid}" == "${expected_ssid}" ]]; then
            return 0
        fi
        
        sleep 1
        ((wait_time++))
    done
    
    return 1
}

