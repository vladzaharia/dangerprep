#!/bin/bash
# DangerPrep Input Validation Utilities
# Provides validation functions for common input types

#######################################
# Validate an IPv4 address
# Arguments:
#   $1 - IP address to validate
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_ipv4() {
    local ip="$1"
    local IFS='.'
    local -a octets

    # Split into octets
    read -ra octets <<< "$ip"

    # Must have exactly 4 octets
    [[ ${#octets[@]} -ne 4 ]] && return 1

    # Each octet must be 0-255
    for octet in "${octets[@]}"; do
        # Must be numeric
        [[ ! "$octet" =~ ^[0-9]+$ ]] && return 1
        # Must be in range 0-255
        [[ $octet -lt 0 || $octet -gt 255 ]] && return 1
    done

    return 0
}

#######################################
# Validate a network interface name
# Arguments:
#   $1 - Interface name to validate
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_interface() {
    local interface="$1"

    # Must not be empty
    [[ -z "$interface" ]] && return 1

    # Must match valid interface naming pattern
    [[ ! "$interface" =~ ^[a-zA-Z0-9_-]+$ ]] && return 1

    # Must not be too long (kernel limit is 15 chars)
    [[ ${#interface} -gt 15 ]] && return 1

    return 0
}

#######################################
# Validate a WiFi SSID
# Arguments:
#   $1 - SSID to validate
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_ssid() {
    local ssid="$1"

    # Must not be empty
    [[ -z "$ssid" ]] && return 1

    # Must not be longer than 32 bytes (WiFi standard limit)
    [[ ${#ssid} -gt 32 ]] && return 1

    # Must not contain null bytes or control characters (except space)
    if [[ "$ssid" =~ [[:cntrl:]] ]]; then
        # Allow only space (ASCII 32) as control character
        local cleaned="${ssid//[^[:cntrl:]]}"
        cleaned="${cleaned// }"
        [[ -n "$cleaned" ]] && return 1
    fi

    return 0
}

#######################################
# Validate a WiFi password
# Arguments:
#   $1 - Password to validate
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_wifi_password() {
    local password="$1"

    # WPA2 requires 8-63 characters
    [[ ${#password} -lt 8 ]] && return 1
    [[ ${#password} -gt 63 ]] && return 1

    return 0
}

#######################################
# Validate a WiFi channel number
# Arguments:
#   $1 - Channel number to validate
#   $2 - Band (optional: "2.4GHz" or "5GHz", default: "2.4GHz")
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_wifi_channel() {
    local channel="$1"
    local band="${2:-2.4GHz}"

    # Must be numeric
    [[ ! "$channel" =~ ^[0-9]+$ ]] && return 1

    # Validate based on band
    case "$band" in
        "2.4GHz")
            # 2.4GHz: channels 1-14 (14 is Japan only, but we'll allow it)
            [[ $channel -lt 1 || $channel -gt 14 ]] && return 1
            ;;
        "5GHz")
            # 5GHz: channels 36-165 (simplified, actual valid channels are more complex)
            [[ $channel -lt 36 || $channel -gt 165 ]] && return 1
            ;;
        *)
            return 1
            ;;
    esac

    return 0
}

#######################################
# Validate a DHCP range
# Arguments:
#   $1 - Start IP address
#   $2 - End IP address
#   $3 - Network IP (optional, for subnet validation)
# Returns:
#   0 if valid, 1 if invalid
#######################################
validate_dhcp_range() {
    local start_ip="$1"
    local end_ip="$2"
    local network_ip="${3:-}"

    # Validate both IPs
    validate_ipv4 "$start_ip" || return 1
    validate_ipv4 "$end_ip" || return 1

    # Convert IPs to integers for comparison
    local start_int end_int
    start_int=$(ip_to_int "$start_ip")
    end_int=$(ip_to_int "$end_ip")

    # Start must be less than or equal to end
    [[ $start_int -gt $end_int ]] && return 1

    # If network IP provided, validate they're in the same subnet
    if [[ -n "$network_ip" ]]; then
        validate_ipv4 "$network_ip" || return 1
        
        local network_int
        network_int=$(ip_to_int "$network_ip")
        
        # Check if start and end are in the same /24 as network
        # (simplified check - assumes /24 subnet)
        local network_base=$((network_int & 0xFFFFFF00))
        local start_base=$((start_int & 0xFFFFFF00))
        local end_base=$((end_int & 0xFFFFFF00))
        
        [[ $start_base -ne $network_base ]] && return 1
        [[ $end_base -ne $network_base ]] && return 1
    fi

    return 0
}

#######################################
# Convert IPv4 address to integer
# Arguments:
#   $1 - IP address
# Outputs:
#   Integer representation of IP
#######################################
ip_to_int() {
    local ip="$1"
    local IFS='.'
    local -a octets
    read -ra octets <<< "$ip"
    
    echo $(( (octets[0] << 24) + (octets[1] << 16) + (octets[2] << 8) + octets[3] ))
}

#######################################
# Sanitize a string for safe use in commands
# Removes or escapes potentially dangerous characters
# Arguments:
#   $1 - String to sanitize
# Outputs:
#   Sanitized string
#######################################
sanitize_string() {
    local input="$1"
    
    # Remove null bytes
    input="${input//$'\0'/}"
    
    # Remove other control characters except space, tab, newline
    local sanitized=""
    local char
    for (( i=0; i<${#input}; i++ )); do
        char="${input:$i:1}"
        # Keep printable characters and common whitespace
        if [[ "$char" =~ [[:print:][:space:]] ]]; then
            sanitized+="$char"
        fi
    done
    
    echo "$sanitized"
}

#######################################
# Validate a country code (ISO 3166-1 alpha-2)
# Arguments:
#   $1 - Country code to validate
# Returns:
#   0 if valid format, 1 if invalid
#######################################
validate_country_code() {
    local code="$1"
    
    # Must be exactly 2 uppercase letters
    [[ ! "$code" =~ ^[A-Z]{2}$ ]] && return 1
    
    return 0
}

#######################################
# Detect country code from system locale
# Returns:
#   Country code or "US" as fallback
#######################################
detect_country_code() {
    local country_code="US"
    
    # Try to get from locale
    if [[ -n "${LC_ALL:-}" ]]; then
        country_code="${LC_ALL##*_}"
        country_code="${country_code%%.*}"
    elif [[ -n "${LANG:-}" ]]; then
        country_code="${LANG##*_}"
        country_code="${country_code%%.*}"
    fi
    
    # Validate and return
    if validate_country_code "$country_code"; then
        echo "$country_code"
    else
        echo "US"
    fi
}

