#!/usr/bin/env bash
# DangerPrep Validation Helper Functions
#
# Purpose: Consolidated validation functions for setup scripts
# Usage: Source this file to access validation functions
# Dependencies: logging.sh, errors.sh
# Author: DangerPrep Project
# Version: 2.0

# Prevent multiple sourcing
if [[ "${VALIDATION_HELPER_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly VALIDATION_HELPER_LOADED="true"

# Modern shell script best practices
set -euo pipefail

# Get the directory where this script is located

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/errors.sh"
fi

# Mark this file as sourced
export VALIDATION_HELPER_SOURCED=true

#
# Basic Input Validation Functions
#

# Validate IPv4 address format
# Usage: validate_ip "192.168.1.1"
# Returns: 0 if valid, 1 if invalid
validate_ip() {
    local ip="$1"
    
    if [[ -z "$ip" ]]; then
        return 1
    fi
    
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        local IFS='.'
        local -a octets
        read -ra octets <<< "$ip"
        for octet in "${octets[@]}"; do
            if [[ $octet -gt 255 ]]; then
                return 1
            fi
        done
        return 0
    fi
    return 1
}

# Validate network interface name
# Usage: validate_interface_name "eth0"
# Returns: 0 if valid, 1 if invalid
validate_interface_name() {
    local interface="$1"
    
    if [[ -z "$interface" ]]; then
        return 1
    fi
    
    if [[ $interface =~ ^[a-zA-Z0-9_-]+$ && ${#interface} -le 15 ]]; then
        return 0
    fi
    return 1
}

# Validate file path for security (prevent path traversal)
# Usage: validate_path "/etc/config"
# Returns: 0 if valid, 1 if invalid
validate_path() {
    local path="$1"
    
    if [[ -z "$path" ]]; then
        return 1
    fi
    
    # Prevent path traversal attacks
    if [[ "$path" =~ \.\./|\.\.\\ ]]; then
        return 1
    fi
    return 0
}

# Validate port number
# Usage: validate_port "8080"
# Returns: 0 if valid, 1 if invalid
validate_port() {
    local port="$1"
    
    if [[ -z "$port" ]]; then
        return 1
    fi
    
    if [[ "$port" =~ ^[0-9]+$ ]] && [[ "$port" -ge 1 ]] && [[ "$port" -le 65535 ]]; then
        return 0
    fi
    return 1
}

# Validate CIDR network notation
# Usage: validate_cidr "192.168.1.0/24"
# Returns: 0 if valid, 1 if invalid
validate_cidr() {
    local cidr="$1"
    
    if [[ -z "$cidr" ]]; then
        return 1
    fi
    
    if [[ ! "$cidr" =~ ^[0-9.]+/[0-9]+$ ]]; then
        return 1
    fi
    
    local ip="${cidr%/*}"
    local prefix="${cidr#*/}"
    
    if ! validate_ip "$ip"; then
        return 1
    fi
    
    if [[ "$prefix" -lt 0 ]] || [[ "$prefix" -gt 32 ]]; then
        return 1
    fi
    
    return 0
}

#
# Complex Validation Functions
#

# Validate template variables are properly defined
# Usage: validate_template_variables
# Returns: 0 if all valid, 1 if any missing or invalid
validate_template_variables() {
    log "Validating template variables..."

    local required_vars=(
        "WIFI_SSID" "WIFI_PASSWORD" "LAN_NETWORK" "LAN_IP"
        "DHCP_START" "DHCP_END" "SSH_PORT"
        "FAIL2BAN_BANTIME" "FAIL2BAN_MAXRETRY"
    )

    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done

    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        error "Missing required template variables: ${missing_vars[*]}"
        return 1
    fi

    # Validate variable formats
    if ! validate_ip "$LAN_IP"; then
        error "Invalid LAN IP address: $LAN_IP"
        return 1
    fi

    if ! validate_ip "${DHCP_START}"; then
        error "Invalid DHCP start address: $DHCP_START"
        return 1
    fi

    if ! validate_ip "${DHCP_END}"; then
        error "Invalid DHCP end address: $DHCP_END"
        return 1
    fi

    if ! validate_port "$SSH_PORT"; then
        error "Invalid SSH port: $SSH_PORT"
        return 1
    fi

    success "All template variables validated"
    return 0
}

# Validate service port assignments to prevent conflicts
# Usage: validate_service_ports
# Returns: 0 if no conflicts, 1 if conflicts detected
validate_service_ports() {
    log "Checking for service port conflicts..."

    local port_assignments=(
        "SSH:${SSH_PORT:-2222}"
        "AdGuard_Home_Web:3000"
        "AdGuard_Home_DNS:5053"
        "Step_CA:9000"
        "dnsmasq_DNS:53"
        "dnsmasq_DHCP:67"
    )

    local conflicts=()
    local used_ports=()

    # Check for duplicate port assignments
    for assignment in "${port_assignments[@]}"; do
        local service="${assignment%%:*}"
        local port="${assignment##*:}"

        if [[ " ${used_ports[*]} " =~ \ ${port}\  ]]; then
            conflicts+=("Port $port used by multiple services")
        else
            used_ports+=("$port")
        fi

        # Check if port is already in use by other processes
        if command -v netstat >/dev/null 2>&1; then
            if netstat -tuln 2>/dev/null | grep -q ":${port} "; then
                conflicts+=("Port $port already in use by another process")
            fi
        elif command -v ss >/dev/null 2>&1; then
            if ss -tuln 2>/dev/null | grep -q ":${port} "; then
                conflicts+=("Port $port already in use by another process")
            fi
        fi
    done

    if [[ ${#conflicts[@]} -gt 0 ]]; then
        warning "Port conflicts detected:"
        printf '  %s\n' "${conflicts[@]}"
        return 1
    fi

    return 0
}

# Validate configuration files exist and are readable
# Usage: validate_config_files
# Returns: 0 if all valid, 1 if any issues
validate_config_files() {
    log "Validating configuration files..."
    
    local config_base="$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../configs"
    local required_configs=(
        "system/sysctl.conf.template"
        "security/ssh_config.template"
        "network/hostapd.conf.template"
        "dns/adguard.yaml.template"
    )
    
    local missing_configs=()
    for config in "${required_configs[@]}"; do
        local config_path="${config_base}/${config}"
        if [[ ! -f "$config_path" ]]; then
            missing_configs+=("$config")
        elif [[ ! -r "$config_path" ]]; then
            missing_configs+=("$config (not readable)")
        fi
    done
    
    if [[ ${#missing_configs[@]} -gt 0 ]]; then
        error "Missing or unreadable configuration files:"
        printf '  %s\n' "${missing_configs[@]}"
        return 1
    fi
    
    success "All configuration files validated"
    return 0
}

#
# Secure File Operations
#

# Secure file copy with validation and proper permissions
# Usage: secure_copy "source" "destination" [mode]
# Returns: 0 if successful, 1 if failed
secure_copy() {
    local src="$1"
    local dest="$2"
    local mode="${3:-644}"

    # Validate inputs
    if [[ -z "$src" ]] || [[ -z "$dest" ]]; then
        error "Source and destination paths are required for secure_copy"
        return 1
    fi

    # Validate paths
    if ! validate_path "$src" || ! validate_path "$dest"; then
        error "Invalid path in secure_copy: $src -> $dest"
        return 1
    fi

    # Check source file exists and is readable
    if [[ ! -f "$src" ]]; then
        error "Source file does not exist: $src"
        return 1
    fi

    if [[ ! -r "$src" ]]; then
        error "Source file is not readable: $src"
        return 1
    fi

    # Copy with secure permissions
    if cp "$src" "$dest"; then
        chmod "$mode" "$dest"
        chown root:root "$dest"
        debug "Securely copied $src to $dest with mode $mode"
        return 0
    else
        error "Failed to copy $src to $dest"
        return 1
    fi
}

# Export functions for use in other scripts
export -f validate_ip
export -f validate_interface_name
export -f validate_path
export -f validate_port
export -f validate_cidr
export -f validate_template_variables
export -f validate_service_ports
export -f validate_config_files
export -f secure_copy
