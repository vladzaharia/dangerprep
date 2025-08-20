#!/usr/bin/env bash
# DangerPrep Shared Logging Utility
# Provides standardized logging functions for all DangerPrep scripts
# Eliminates code duplication and ensures consistent logging patterns

# Prevent multiple loading
if [[ "${DANGERPREP_LOGGING_LOADED:-}" == "true" ]]; then
    return 0
fi
DANGERPREP_LOGGING_LOADED=true

# Modern shell script best practices
set -euo pipefail

# Color codes for consistent output formatting
declare -r LOG_RED='\033[0;31m'
declare -r LOG_GREEN='\033[0;32m'
declare -r LOG_YELLOW='\033[1;33m'
declare -r LOG_BLUE='\033[0;34m'
declare -r LOG_PURPLE='\033[0;35m'
declare -r LOG_CYAN='\033[0;36m'
declare -r LOG_WHITE='\033[1;37m'
declare -r LOG_GRAY='\033[0;37m'
declare -r LOG_NC='\033[0m'

# Configuration variables
LOG_FILE="${LOG_FILE:-}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"
LOG_TIMESTAMP_FORMAT="${LOG_TIMESTAMP_FORMAT:-%Y-%m-%d %H:%M:%S}"
LOG_ENABLE_COLOR="${LOG_ENABLE_COLOR:-true}"

# Log levels (numeric for comparison)
declare -r LOG_LEVEL_DEBUG=0
declare -r LOG_LEVEL_INFO=1
declare -r LOG_LEVEL_WARNING=2
declare -r LOG_LEVEL_ERROR=3
declare -r LOG_LEVEL_CRITICAL=4

# Convert log level name to numeric value
get_log_level_numeric() {
    local level
    level=${1:-INFO}
    # Convert to uppercase for bash 3.x compatibility
    level=$(echo "$level" | tr '[:lower:]' '[:upper:]')
    case "$level" in
        DEBUG) echo "${LOG_LEVEL_DEBUG}" ;;
        INFO) echo "${LOG_LEVEL_INFO}" ;;
        WARNING|WARN) echo "${LOG_LEVEL_WARNING}" ;;
        ERROR) echo "${LOG_LEVEL_ERROR}" ;;
        CRITICAL|CRIT) echo "${LOG_LEVEL_CRITICAL}" ;;
        *) echo "${LOG_LEVEL_INFO}" ;;
    esac
}

# Check if message should be logged based on level
should_log() {
    local message_level="$1"
    local current_level_num
    local message_level_num
    
    current_level_num=$(get_log_level_numeric "${LOG_LEVEL}")
    message_level_num=$(get_log_level_numeric "$message_level")
    
    [[ $message_level_num -ge $current_level_num ]]
}

# Detect if output supports colors
supports_color() {
    if [[ "${LOG_ENABLE_COLOR}" != "true" ]]; then
        return 1
    fi
    
    # Check if stdout is a terminal and supports colors
    if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
        local colors
        colors=$(tput colors 2>/dev/null || echo 0)
        [[ $colors -ge 8 ]]
    else
        return 1
    fi
}

# Format timestamp
get_timestamp() {
    date +"${LOG_TIMESTAMP_FORMAT}"
}

# Core logging function
_log_message() {
    local level="$1"
    local color="$2"
    local message="$3"
    local timestamp
    local formatted_message
    local plain_message
    
    # Check if we should log this level
    if ! should_log "$level"; then
        return 0
    fi
    
    timestamp=$(get_timestamp)
    
    # Format message with or without color
    if supports_color; then
        formatted_message="${color}[${level}]${LOG_NC} ${message}"
        plain_message="[${timestamp}] [${level}] ${message}"
    else
        formatted_message="[${level}] ${message}"
        plain_message="[${timestamp}] [${level}] ${message}"
    fi
    
    # Output to stdout/stderr
    if [[ "$level" == "ERROR" || "$level" == "CRITICAL" ]]; then
        echo -e "$formatted_message" >&2
    else
        echo -e "$formatted_message"
    fi
    
    # Log to file if specified
    if [[ -n "${LOG_FILE}" ]]; then
        # Ensure log directory exists
        local log_dir
        log_dir=$(dirname "${LOG_FILE}")
        if [[ ! -d "$log_dir" ]]; then
            mkdir -p "$log_dir" 2>/dev/null || true
        fi
        
        # Append to log file (plain text, no colors)
        echo "$plain_message" >> "${LOG_FILE}" 2>/dev/null || true
    fi
}

# Public logging functions
log() {
    _log_message "INFO" "${LOG_BLUE}" "$1"
}

info() {
    _log_message "INFO" "${LOG_CYAN}" "$1"
}

success() {
    _log_message "INFO" "${LOG_GREEN}" "$1"
}

warning() {
    _log_message "WARNING" "${LOG_YELLOW}" "$1"
}

warn() {
    warning "$1"
}

error() {
    _log_message "ERROR" "${LOG_RED}" "$1"
}

critical() {
    _log_message "CRITICAL" "${LOG_RED}" "$1"
}

debug() {
    _log_message "DEBUG" "${LOG_GRAY}" "$1"
}

# Specialized logging functions
log_command() {
    local cmd="$1"
    debug "Executing: $cmd"
}

log_file_operation() {
    local operation="$1"
    local file="$2"
    debug "File operation: $operation -> $file"
}

log_network_operation() {
    local operation="$1"
    local target="$2"
    debug "Network operation: $operation -> $target"
}

# Progress logging
log_progress() {
    local current="$1"
    local total="$2"
    local message
    message=${3:-Processing}
    local percentage
    
    if [[ $total -gt 0 ]]; then
        percentage=$(( (current * 100) / total ))
        info "$message... [$current/$total] (${percentage}%)"
    else
        info "$message... [$current]"
    fi
}

# Section logging (for major script sections)
log_section() {
    local section="$1"
    if supports_color; then
        echo -e "\n${LOG_PURPLE}=== $section ===${LOG_NC}"
    else
        echo -e "\n=== $section ==="
    fi
    
    if [[ -n "${LOG_FILE}" ]]; then
        echo "[$(get_timestamp)] === $section ===" >> "${LOG_FILE}" 2>/dev/null || true
    fi
}

# Subsection logging
log_subsection() {
    local subsection="$1"
    if supports_color; then
        echo -e "${LOG_WHITE}--- $subsection ---${LOG_NC}"
    else
        echo "--- $subsection ---"
    fi
    
    if [[ -n "${LOG_FILE}" ]]; then
        echo "[$(get_timestamp)] --- $subsection ---" >> "${LOG_FILE}" 2>/dev/null || true
    fi
}

# Configuration functions
set_log_file() {
    LOG_FILE="$1"
    debug "Log file set to: ${LOG_FILE}"
}

set_log_level() {
    LOG_LEVEL="${1^^}"
    debug "Log level set to: ${LOG_LEVEL}"
}

enable_color() {
    LOG_ENABLE_COLOR=true
}

disable_color() {
    LOG_ENABLE_COLOR=false
}

# Utility functions
log_separator() {
    local char
    char=${1:--}
    local length
    length=${2:-50}
    local separator
    
    printf -v separator "%*s" "$length" ""
    separator="${separator// /$char}"
    
    if supports_color; then
        echo -e "${LOG_GRAY}$separator${LOG_NC}"
    else
        echo "$separator"
    fi
}

# Error handling integration
log_error_and_exit() {
    local message="$1"
    local exit_code
    exit_code=${2:-1}
    
    error "$message"
    exit "$exit_code"
}

# Validation logging
log_validation_result() {
    local test_name="$1"
    local result="$2"
    local details
    details=${3:-}
    
    if [[ "$result" == "PASS" || "$result" == "SUCCESS" ]]; then
        success "✓ $test_name"
        [[ -n "$details" ]] && debug "  Details: $details"
    elif [[ "$result" == "FAIL" || "$result" == "ERROR" ]]; then
        error "✗ $test_name"
        [[ -n "$details" ]] && error "  Details: $details"
    elif [[ "$result" == "WARN" || "$result" == "WARNING" ]]; then
        warning "⚠ $test_name"
        [[ -n "$details" ]] && warning "  Details: $details"
    else
        info "• $test_name: $result"
        [[ -n "$details" ]] && debug "  Details: $details"
    fi
}

# Initialize logging (called automatically)
_init_logging() {
    # Set default log file if not specified and we can determine script name
    if [[ -z "${LOG_FILE}" ]] && [[ -n "${BASH_SOURCE[1]:-}" ]]; then
        local script_name
        script_name=$(basename "${BASH_SOURCE[1]}" .sh)
        LOG_FILE="/var/log/dangerprep-${script_name}.log"
    fi
    
    debug "Logging initialized - Level: ${LOG_LEVEL}, File: ${LOG_FILE:-none}, Color: ${LOG_ENABLE_COLOR}"
}

# Auto-initialize when sourced
_init_logging

# Export functions for use in other scripts
export -f get_log_level_numeric
export -f should_log
export -f supports_color
export -f get_timestamp
export -f _log_message
export -f log
export -f info
export -f success
export -f warning
export -f warn
export -f error
export -f critical
export -f debug
export -f log_command
export -f log_file_operation
export -f log_network_operation
export -f log_progress
export -f log_section
export -f log_subsection
export -f set_log_file
export -f set_log_level
export -f enable_color
export -f disable_color
export -f log_separator
export -f log_error_and_exit
export -f log_validation_result
export -f _init_logging
