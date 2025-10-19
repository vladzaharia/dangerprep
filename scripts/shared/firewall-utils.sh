#!/bin/bash
# DangerPrep Firewall Utilities
# Provides safe iptables management without destroying existing rules

# Chain names for DangerPrep hotspot
readonly DP_CHAIN_INPUT="DANGERPREP_INPUT"
readonly DP_CHAIN_FORWARD="DANGERPREP_FORWARD"
readonly DP_CHAIN_NAT="DANGERPREP_NAT"
readonly DP_CHAIN_CAPTIVE="DANGERPREP_CAPTIVE"

#######################################
# Create custom chains for DangerPrep hotspot
# This allows us to manage our rules without affecting existing rules
# Returns:
#   0 on success
#######################################
create_hotspot_chains() {
    # Create custom chains if they don't exist
    iptables -N "${DP_CHAIN_INPUT}" 2>/dev/null || iptables -F "${DP_CHAIN_INPUT}"
    iptables -N "${DP_CHAIN_FORWARD}" 2>/dev/null || iptables -F "${DP_CHAIN_FORWARD}"
    iptables -t nat -N "${DP_CHAIN_NAT}" 2>/dev/null || iptables -t nat -F "${DP_CHAIN_NAT}"
    iptables -t nat -N "${DP_CHAIN_CAPTIVE}" 2>/dev/null || iptables -t nat -F "${DP_CHAIN_CAPTIVE}"

    return 0
}

#######################################
# Configure hotspot firewall rules using custom chains
# Arguments:
#   $1 - Hotspot interface (e.g., wlan0)
#   $2 - WAN interface (e.g., eth0)
#   $3 - Hotspot IP address
# Returns:
#   0 on success
#######################################
configure_hotspot_firewall() {
    local hotspot_interface="$1"
    local wan_interface="$2"
    local hotspot_ip="$3"
    
    # Create custom chains
    create_hotspot_chains
    
    # Clear our custom chains
    iptables -F "${DP_CHAIN_INPUT}"
    iptables -F "${DP_CHAIN_FORWARD}"
    iptables -t nat -F "${DP_CHAIN_NAT}"
    iptables -t nat -F "${DP_CHAIN_CAPTIVE}"

    # INPUT chain rules (for traffic to the hotspot itself)
    iptables -A "${DP_CHAIN_INPUT}" -i "${hotspot_interface}" -j ACCEPT
    iptables -A "${DP_CHAIN_INPUT}" -i "${hotspot_interface}" -p udp --dport 67 -j ACCEPT  # DHCP
    iptables -A "${DP_CHAIN_INPUT}" -i "${hotspot_interface}" -p udp --dport 53 -j ACCEPT  # DNS
    iptables -A "${DP_CHAIN_INPUT}" -i "${hotspot_interface}" -p tcp --dport 53 -j ACCEPT  # DNS
    iptables -A "${DP_CHAIN_INPUT}" -i "${hotspot_interface}" -p tcp --dport 80 -j ACCEPT   # HTTP (captive portal)
    iptables -A "${DP_CHAIN_INPUT}" -i "${hotspot_interface}" -p tcp --dport 443 -j ACCEPT  # HTTPS (portal)
    iptables -A "${DP_CHAIN_INPUT}" -i "${hotspot_interface}" -p tcp --dport 3000 -j ACCEPT # Portal app

    # FORWARD chain rules (for traffic through the hotspot)
    iptables -A "${DP_CHAIN_FORWARD}" -i "${hotspot_interface}" -o "${wan_interface}" -j ACCEPT
    iptables -A "${DP_CHAIN_FORWARD}" -i "${wan_interface}" -o "${hotspot_interface}" -m state --state RELATED,ESTABLISHED -j ACCEPT

    # Captive Portal - Redirect HTTP traffic to portal on port 3000
    # This catches captive portal detection attempts and redirects them to our portal
    iptables -t nat -A "${DP_CHAIN_CAPTIVE}" -i "${hotspot_interface}" -p tcp --dport 80 -j DNAT --to-destination "${hotspot_ip}:3000"

    # NAT rules (for masquerading)
    iptables -t nat -A "${DP_CHAIN_NAT}" -o "${wan_interface}" -j MASQUERADE
    
    # Link our custom chains to main chains (if not already linked)
    if ! iptables -C INPUT -j "${DP_CHAIN_INPUT}" 2>/dev/null; then
        iptables -I INPUT 1 -j "${DP_CHAIN_INPUT}"
    fi

    if ! iptables -C FORWARD -j "${DP_CHAIN_FORWARD}" 2>/dev/null; then
        iptables -I FORWARD 1 -j "${DP_CHAIN_FORWARD}"
    fi

    if ! iptables -t nat -C PREROUTING -j "${DP_CHAIN_CAPTIVE}" 2>/dev/null; then
        iptables -t nat -I PREROUTING 1 -j "${DP_CHAIN_CAPTIVE}"
    fi

    if ! iptables -t nat -C POSTROUTING -j "${DP_CHAIN_NAT}" 2>/dev/null; then
        iptables -t nat -I POSTROUTING 1 -j "${DP_CHAIN_NAT}"
    fi

    return 0
}

#######################################
# Remove hotspot firewall rules
# This cleanly removes only our rules without affecting others
# Returns:
#   0 on success
#######################################
remove_hotspot_firewall() {
    # Remove jumps to our custom chains from main chains
    iptables -D INPUT -j "${DP_CHAIN_INPUT}" 2>/dev/null || true
    iptables -D FORWARD -j "${DP_CHAIN_FORWARD}" 2>/dev/null || true
    iptables -t nat -D PREROUTING -j "${DP_CHAIN_CAPTIVE}" 2>/dev/null || true
    iptables -t nat -D POSTROUTING -j "${DP_CHAIN_NAT}" 2>/dev/null || true

    # Flush and delete our custom chains
    iptables -F "${DP_CHAIN_INPUT}" 2>/dev/null || true
    iptables -F "${DP_CHAIN_FORWARD}" 2>/dev/null || true
    iptables -t nat -F "${DP_CHAIN_CAPTIVE}" 2>/dev/null || true
    iptables -t nat -F "${DP_CHAIN_NAT}" 2>/dev/null || true

    iptables -X "${DP_CHAIN_INPUT}" 2>/dev/null || true
    iptables -X "${DP_CHAIN_FORWARD}" 2>/dev/null || true
    iptables -t nat -X "${DP_CHAIN_CAPTIVE}" 2>/dev/null || true
    iptables -t nat -X "${DP_CHAIN_NAT}" 2>/dev/null || true

    return 0
}

#######################################
# Check if hotspot firewall rules are active
# Returns:
#   0 if active, 1 if not active
#######################################
check_hotspot_firewall() {
    if iptables -L "${DP_CHAIN_INPUT}" -n >/dev/null 2>&1 && \
       iptables -L "${DP_CHAIN_FORWARD}" -n >/dev/null 2>&1 && \
       iptables -t nat -L "${DP_CHAIN_NAT}" -n >/dev/null 2>&1; then
        return 0
    fi
    
    return 1
}

#######################################
# Save current iptables rules to a backup file
# Arguments:
#   $1 - Backup file path
# Returns:
#   0 on success, 1 on failure
#######################################
backup_iptables_rules() {
    local backup_file="$1"
    
    if command -v iptables-save >/dev/null 2>&1; then
        mkdir -p "$(dirname "${backup_file}")"
        iptables-save > "${backup_file}" 2>/dev/null
        return $?
    fi
    
    return 1
}

#######################################
# Restore iptables rules from a backup file
# Arguments:
#   $1 - Backup file path
# Returns:
#   0 on success, 1 on failure
#######################################
restore_iptables_rules() {
    local backup_file="$1"
    
    if [[ ! -f "${backup_file}" ]]; then
        return 1
    fi
    
    if command -v iptables-restore >/dev/null 2>&1; then
        iptables-restore < "${backup_file}" 2>/dev/null
        return $?
    fi
    
    return 1
}

#######################################
# Enable IP forwarding
# Arguments:
#   $1 - Sysctl config file path (optional)
# Returns:
#   0 on success
#######################################
enable_ip_forwarding() {
    local sysctl_file="${1:-}"
    
    # Enable immediately
    sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1
    
    # Make persistent if config file provided
    if [[ -n "${sysctl_file}" ]]; then
        mkdir -p "$(dirname "${sysctl_file}")"
        cat > "${sysctl_file}" << EOF
# DangerPrep WiFi Hotspot IP Forwarding Configuration
net.ipv4.ip_forward=1
EOF
        sysctl -p "${sysctl_file}" >/dev/null 2>&1
    fi
    
    return 0
}

#######################################
# Disable IP forwarding
# Arguments:
#   $1 - Sysctl config file path to remove (optional)
# Returns:
#   0 on success
#######################################
disable_ip_forwarding() {
    local sysctl_file="${1:-}"
    
    # Disable immediately
    sysctl -w net.ipv4.ip_forward=0 >/dev/null 2>&1
    
    # Remove config file if provided
    if [[ -n "${sysctl_file}" ]] && [[ -f "${sysctl_file}" ]]; then
        rm -f "${sysctl_file}"
    fi
    
    return 0
}

