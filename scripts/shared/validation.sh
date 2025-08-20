#!/usr/bin/env bash
# DangerPrep Shared Validation Utility
# Provides common validation functions for user input, file existence, permissions, and system requirements
# Implements comprehensive validation patterns used across all scripts

# Prevent multiple loading
if [[ "${DANGERPREP_VALIDATION_LOADED:-}" == "true" ]]; then
    return 0
fi
DANGERPREP_VALIDATION_LOADED=true

# Modern shell script best practices
set -euo pipefail

# Source required utilities if not already loaded
if [[ -z "${SCRIPT_DIR:-}" ]]; then
    readonly SCRIPT_DIR="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"
fi
if [[ "${DANGERPREP_LOGGING_LOADED:-}" != "true" ]]; then
    # shellcheck source=./logging.sh
        source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/logging.sh"
fi

# Validation configuration
VALIDATION_STRICT_MODE="${VALIDATION_STRICT_MODE:-false}"
VALIDATION_LOG_LEVEL="${VALIDATION_LOG_LEVEL:-INFO}"

# Common regex patterns
declare -r REGEX_EMAIL='^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
declare -r REGEX_IP4='^([0-9]{1,3}\.){3}[0-9]{1,3}$'

declare -r REGEX_PORT='^([1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$'
declare -r REGEX_DOMAIN='^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$'
declare -r REGEX_URL='^https?://[a-zA-Z0-9.-]+(/.*)?$'

# Input validation functions

# Validate that a value is not empty
validate_not_empty() {
    local value="$1"
    local field_name
    field_name=${2:-value}
    
    if [[ -z "$value" ]]; then
        error "Validation failed: $field_name cannot be empty"
        return 1
    fi
    
    debug "Validation passed: $field_name is not empty"
    return 0
}

# Validate string length
validate_string_length() {
    local value="$1"
    local min_length="$2"
    local max_length="$3"
    local field_name
    field_name=${4:-value}
    local length
    length=${#value}
    
    if [[ $length -lt $min_length ]]; then
        error "Validation failed: $field_name must be at least $min_length characters (got $length)"
        return 1
    fi
    
    if [[ $length -gt $max_length ]]; then
        error "Validation failed: $field_name must be at most $max_length characters (got $length)"
        return 1
    fi
    
    debug "Validation passed: $field_name length ($length) is within bounds [$min_length-$max_length]"
    return 0
}

# Validate email address
validate_email() {
    local email="$1"
    local field_name
    field_name=${2:-email}
    
    if [[ ! "$email" =~ ${REGEX_EMAIL} ]]; then
        error "Validation failed: $field_name is not a valid email address: $email"
        return 1
    fi
    
    debug "Validation passed: $field_name is a valid email address"
    return 0
}

# Validate IPv4 address
validate_ipv4() {
    local ip="$1"
    local field_name
    field_name=${2:-IP address}
    
    if [[ ! "$ip" =~ ${REGEX_IP4} ]]; then
        error "Validation failed: $field_name is not a valid IPv4 address: $ip"
        return 1
    fi
    
    # Additional validation for octets
    local IFS='.'
    local -a octets
    read -ra octets <<< "$ip"
    local octet
    
    for octet in "${octets[@]}"; do
        if [[ $octet -gt 255 ]]; then
            error "Validation failed: $field_name has invalid octet: $octet"
            return 1
        fi
    done
    
    debug "Validation passed: $field_name is a valid IPv4 address"
    return 0
}

# Validate port number
validate_port() {
    local port="$1"
    local field_name
    field_name=${2:-port}
    
    if [[ ! "$port" =~ ${REGEX_PORT} ]]; then
        error "Validation failed: $field_name is not a valid port number: $port"
        return 1
    fi
    
    debug "Validation passed: $field_name is a valid port number"
    return 0
}

# Validate domain name
validate_domain() {
    local domain="$1"
    local field_name
    field_name=${2:-domain}
    
    if [[ ! "$domain" =~ ${REGEX_DOMAIN} ]]; then
        error "Validation failed: $field_name is not a valid domain name: $domain"
        return 1
    fi
    
    debug "Validation passed: $field_name is a valid domain name"
    return 0
}

# Validate URL
validate_url() {
    local url="$1"
    local field_name
    field_name=${2:-URL}
    
    if [[ ! "$url" =~ ${REGEX_URL} ]]; then
        error "Validation failed: $field_name is not a valid URL: $url"
        return 1
    fi
    
    debug "Validation passed: $field_name is a valid URL"
    return 0
}

# Validate numeric value
validate_numeric() {
    local value="$1"
    local field_name
    field_name=${2:-value}
    
    if [[ ! "$value" =~ ^[0-9]+$ ]]; then
        error "Validation failed: $field_name must be numeric: $value"
        return 1
    fi
    
    debug "Validation passed: $field_name is numeric"
    return 0
}

# Validate numeric range
validate_numeric_range() {
    local value="$1"
    local min="$2"
    local max="$3"
    local field_name
    field_name=${4:-value}
    
    if ! validate_numeric "$value" "$field_name"; then
        return 1
    fi
    
    if [[ $value -lt $min ]] || [[ $value -gt $max ]]; then
        error "Validation failed: $field_name must be between $min and $max (got $value)"
        return 1
    fi
    
    debug "Validation passed: $field_name ($value) is within range [$min-$max]"
    return 0
}

# File and directory validation functions

# Validate file exists
validate_file_exists() {
    local file="$1"
    local field_name
    field_name=${2:-file}
    
    if [[ ! -f "$file" ]]; then
        error "Validation failed: $field_name does not exist: $file"
        return 1
    fi
    
    debug "Validation passed: $field_name exists"
    return 0
}

# Validate directory exists
validate_directory_exists() {
    local dir="$1"
    local field_name
    field_name=${2:-directory}
    
    if [[ ! -d "$dir" ]]; then
        error "Validation failed: $field_name does not exist: $dir"
        return 1
    fi
    
    debug "Validation passed: $field_name exists"
    return 0
}

# Validate file is readable
validate_file_readable() {
    local file="$1"
    local field_name
    field_name=${2:-file}
    
    if ! validate_file_exists "$file" "$field_name"; then
        return 1
    fi
    
    if [[ ! -r "$file" ]]; then
        error "Validation failed: $field_name is not readable: $file"
        return 1
    fi
    
    debug "Validation passed: $field_name is readable"
    return 0
}

# Validate file is writable
validate_file_writable() {
    local file="$1"
    local field_name
    field_name=${2:-file}
    
    if ! validate_file_exists "$file" "$field_name"; then
        return 1
    fi
    
    if [[ ! -w "$file" ]]; then
        error "Validation failed: $field_name is not writable: $file"
        return 1
    fi
    
    debug "Validation passed: $field_name is writable"
    return 0
}

# Validate file is executable
validate_file_executable() {
    local file="$1"
    local field_name
    field_name=${2:-file}
    
    if ! validate_file_exists "$file" "$field_name"; then
        return 1
    fi
    
    if [[ ! -x "$file" ]]; then
        error "Validation failed: $field_name is not executable: $file"
        return 1
    fi
    
    debug "Validation passed: $field_name is executable"
    return 0
}

# Validate directory is writable
validate_directory_writable() {
    local dir="$1"
    local field_name
    field_name=${2:-directory}
    
    if ! validate_directory_exists "$dir" "$field_name"; then
        return 1
    fi
    
    if [[ ! -w "$dir" ]]; then
        error "Validation failed: $field_name is not writable: $dir"
        return 1
    fi
    
    debug "Validation passed: $field_name is writable"
    return 0
}

# System validation functions

# Validate command exists
validate_command_exists() {
    local cmd="$1"
    local field_name
    field_name=${2:-command}
    
    if ! command -v "$cmd" >/dev/null 2>&1; then
        error "Validation failed: $field_name not found: $cmd"
        return 1
    fi
    
    debug "Validation passed: $field_name exists"
    return 0
}

# Validate user exists
validate_user_exists() {
    local user="$1"
    local field_name
    field_name=${2:-user}
    
    if ! id "$user" >/dev/null 2>&1; then
        error "Validation failed: $field_name does not exist: $user"
        return 1
    fi
    
    debug "Validation passed: $field_name exists"
    return 0
}

# Validate group exists
validate_group_exists() {
    local group="$1"
    local field_name
    field_name=${2:-group}
    
    if ! getent group "$group" >/dev/null 2>&1; then
        error "Validation failed: $field_name does not exist: $group"
        return 1
    fi
    
    debug "Validation passed: $field_name exists"
    return 0
}

# Validate running as root
validate_root_user() {
    if [[ ${EUID} -ne 0 ]]; then
        error "Validation failed: This script must be run as root"
        return 1
    fi
    
    debug "Validation passed: Running as root user"
    return 0
}

# Validate not running as root
validate_not_root_user() {
    if [[ ${EUID} -eq 0 ]]; then
        error "Validation failed: This script should not be run as root"
        return 1
    fi
    
    debug "Validation passed: Not running as root user"
    return 0
}

# Validate disk space available
validate_disk_space() {
    local path="$1"
    local required_mb="$2"
    local field_name
    field_name=${3:-disk space}
    
    if [[ ! -d "$path" ]]; then
        error "Validation failed: Path does not exist for disk space check: $path"
        return 1
    fi
    
    local available_kb
    available_kb=$(df "$path" | awk 'NR==2 {print $4}')
    local available_mb
    available_mb=$((available_kb / 1024))
    
    if [[ $available_mb -lt $required_mb ]]; then
        error "Validation failed: Insufficient $field_name. Required: ${required_mb}MB, Available: ${available_mb}MB"
        return 1
    fi
    
    debug "Validation passed: Sufficient $field_name available (${available_mb}MB >= ${required_mb}MB)"
    return 0
}

# Network validation functions

# Validate network connectivity
validate_network_connectivity() {
    local host
    host=${1:-8.8.8.8}
    local timeout
    timeout=${2:-5}
    local field_name
    field_name=${3:-network connectivity}
    
    if ! ping -c 1 -W "$timeout" "$host" >/dev/null 2>&1; then
        error "Validation failed: No $field_name to $host"
        return 1
    fi
    
    debug "Validation passed: $field_name to $host is working"
    return 0
}

# Validate port is available
validate_port_available() {
    local port="$1"
    local field_name
    field_name=${2:-port}
    
    if ! validate_port "$port" "$field_name"; then
        return 1
    fi
    
    if netstat -ln 2>/dev/null | grep -q ":$port "; then
        error "Validation failed: $field_name $port is already in use"
        return 1
    fi
    
    debug "Validation passed: $field_name $port is available"
    return 0
}

# Composite validation functions

# Validate script arguments
validate_script_args() {
    local expected_count="$1"
    local actual_count="$2"
    local usage_message
    usage_message=${3:-}
    
    if [[ $actual_count -ne $expected_count ]]; then
        error "Validation failed: Expected $expected_count arguments, got $actual_count"
        if [[ -n "$usage_message" ]]; then
            error "Usage: $usage_message"
        fi
        return 1
    fi
    
    debug "Validation passed: Correct number of arguments provided"
    return 0
}

# Validate script environment
validate_script_environment() {
    local required_commands=("$@")
    local cmd
    local failed=false
    
    for cmd in "${required_commands[@]}"; do
        if ! validate_command_exists "$cmd"; then
            failed=true
        fi
    done
    
    if [[ "$failed" == "true" ]]; then
        error "Validation failed: Script environment is not properly configured"
        return 1
    fi
    
    debug "Validation passed: Script environment is properly configured"
    return 0
}

# Configuration functions
enable_strict_validation() {
    VALIDATION_STRICT_MODE=true
    debug "Strict validation mode enabled"
}

disable_strict_validation() {
    VALIDATION_STRICT_MODE=false
    debug "Strict validation mode disabled"
}

# Export functions for use in other scripts
export -f validate_not_empty
export -f validate_string_length
export -f validate_email
export -f validate_ipv4
export -f validate_port
export -f validate_domain
export -f validate_url
export -f validate_numeric
export -f validate_numeric_range
export -f validate_file_exists
export -f validate_directory_exists
export -f validate_file_readable
export -f validate_file_writable
export -f validate_file_executable
export -f validate_directory_writable
export -f validate_command_exists
export -f validate_user_exists
export -f validate_group_exists
export -f validate_root_user
export -f validate_not_root_user
export -f validate_disk_space
export -f validate_network_connectivity
export -f validate_port_available
export -f validate_script_args
export -f validate_script_environment
export -f enable_strict_validation
export -f disable_strict_validation
