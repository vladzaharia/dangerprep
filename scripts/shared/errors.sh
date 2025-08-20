#!/usr/bin/env bash
# DangerPrep Shared Error Handling Utility
# Provides standardized error handling patterns, trap handlers, and cleanup functions
# Implements robust error handling and recovery mechanisms

# Prevent multiple loading
if [[ "${DANGERPREP_ERROR_HANDLING_LOADED:-}" == "true" ]]; then
    return 0
fi
DANGERPREP_ERROR_HANDLING_LOADED=true

# Modern shell script best practices
set -euo pipefail

# Source logging utility if not already loaded
if [[ -z "${SCRIPT_DIR:-}" ]]; then
    readonly SCRIPT_DIR="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"
fi
if [[ "${DANGERPREP_LOGGING_LOADED:-}" != "true" ]]; then
    # shellcheck source=./logging.sh
        source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/logging.sh"
fi

# Error handling configuration
ERROR_HANDLING_ENABLED="${ERROR_HANDLING_ENABLED:-true}"
CLEANUP_ON_EXIT="${CLEANUP_ON_EXIT:-true}"
ROLLBACK_ON_ERROR="${ROLLBACK_ON_ERROR:-false}"
ERROR_LOG_FILE="${ERROR_LOG_FILE:-/var/log/dangerprep-errors.log}"

# Exit codes (following standard conventions)
declare -r EXIT_GENERAL_ERROR=1
declare -r EXIT_COMMAND_NOT_FOUND=127
declare -r EXIT_SCRIPT_TERMINATED=143

# Global arrays for cleanup and rollback operations
declare -a CLEANUP_FUNCTIONS=()
declare -a ROLLBACK_FUNCTIONS=()
declare -a TEMP_FILES=()
declare -a TEMP_DIRS=()

# Error context tracking
ERROR_CONTEXT=""
CURRENT_OPERATION=""
SCRIPT_START_TIME=""

# Initialize error handling
init_error_handling() {
    if [[ "${ERROR_HANDLING_ENABLED}" != "true" ]]; then
        return 0
    fi
    
    SCRIPT_START_TIME=$(date +%s)
    
    # Set up trap handlers for various signals
    trap 'handle_error $? ${LINENO}' ERR
    trap 'handle_exit $?' EXIT
    trap 'handle_interrupt' INT TERM
    
    # Create error log directory if needed
    local error_log_dir
    error_log_dir=$(dirname "${ERROR_LOG_FILE}")
    if [[ ! -d "$error_log_dir" ]]; then
        mkdir -p "$error_log_dir" 2>/dev/null || true
    fi
    
    debug "Error handling initialized"
}

# Handle script errors
handle_error() {
    local exit_code="$1"
    local line_number="$2"
    local script_name
    script_name=${BASH_SOURCE[1]:-unknown}
    local function_name
    function_name=${FUNCNAME[2]:-main}
    
    # Disable error handling temporarily to prevent recursive errors
    set +e
    
    # Log error details
    {
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR in $script_name"
        echo "  Line: $line_number"
        echo "  Function: $function_name"
        echo "  Exit Code: $exit_code"
        echo "  Context: ${ERROR_CONTEXT:-none}"
        echo "  Operation: ${CURRENT_OPERATION:-none}"
        echo "  Command: ${BASH_COMMAND:-unknown}"
        echo "---"
    } >> "${ERROR_LOG_FILE}" 2>/dev/null || true
    
    # Display user-friendly error message
    error "Script failed at line $line_number in function $function_name"
    if [[ -n "${ERROR_CONTEXT}" ]]; then
        error "Context: ${ERROR_CONTEXT}"
    fi
    if [[ -n "${CURRENT_OPERATION}" ]]; then
        error "During operation: ${CURRENT_OPERATION}"
    fi
    
    # Execute rollback functions if enabled
    if [[ "${ROLLBACK_ON_ERROR}" == "true" ]]; then
        execute_rollback_functions
    fi
    
    # Re-enable error handling for cleanup
    set -e
}

# Handle script exit
handle_exit() {
    local exit_code="$1"
    
    # Disable error handling for cleanup
    set +e
    
    if [[ "${CLEANUP_ON_EXIT}" == "true" ]]; then
        execute_cleanup_functions
    fi
    
    # Log script completion
    if [[ -n "${SCRIPT_START_TIME}" ]]; then
        local end_time duration
        end_time=$(date +%s)
        duration=$((end_time - SCRIPT_START_TIME))
        debug "Script completed in ${duration}s with exit code $exit_code"
    fi
}

# Handle interruption signals (Ctrl+C, TERM)
handle_interrupt() {
    warning "Script interrupted by user or system signal"
    
    # Set error context for cleanup
    ERROR_CONTEXT="Script interrupted"
    
    # Execute cleanup
    if [[ "${CLEANUP_ON_EXIT}" == "true" ]]; then
        execute_cleanup_functions
    fi
    
    exit "${EXIT_SCRIPT_TERMINATED}"
}

# Execute cleanup functions in reverse order
execute_cleanup_functions() {
    if [[ ${#CLEANUP_FUNCTIONS[@]} -eq 0 ]]; then
        return 0
    fi
    
    debug "Executing cleanup functions..."
    
    # Execute in reverse order (LIFO)
    local i
    for ((i=${#CLEANUP_FUNCTIONS[@]}-1; i>=0; i--)); do
        local cleanup_func
        cleanup_func=${CLEANUP_FUNCTIONS[i]}
        debug "Running cleanup function: $cleanup_func"
        
        # Execute cleanup function, but don't fail if it errors
        if ! $cleanup_func 2>/dev/null; then
            warning "Cleanup function failed: $cleanup_func"
        fi
    done
    
    # Clean up temporary files and directories
    cleanup_temp_files
    cleanup_temp_dirs
}

# Execute rollback functions in reverse order
execute_rollback_functions() {
    if [[ ${#ROLLBACK_FUNCTIONS[@]} -eq 0 ]]; then
        return 0
    fi
    
    warning "Executing rollback functions..."
    
    # Execute in reverse order (LIFO)
    local i
    for ((i=${#ROLLBACK_FUNCTIONS[@]}-1; i>=0; i--)); do
        local rollback_func
        rollback_func=${ROLLBACK_FUNCTIONS[i]}
        warning "Running rollback function: $rollback_func"
        
        # Execute rollback function, but don't fail if it errors
        if ! $rollback_func 2>/dev/null; then
            error "Rollback function failed: $rollback_func"
        fi
    done
}

# Clean up temporary files
cleanup_temp_files() {
    if [[ ${#TEMP_FILES[@]} -eq 0 ]]; then
        return 0
    fi
    
    debug "Cleaning up temporary files..."
    
    local file
    for file in "${TEMP_FILES[@]}"; do
        if [[ -f "$file" ]]; then
            debug "Removing temporary file: $file"
            rm -f "$file" 2>/dev/null || warning "Failed to remove temporary file: $file"
        fi
    done
}

# Clean up temporary directories
cleanup_temp_dirs() {
    if [[ ${#TEMP_DIRS[@]} -eq 0 ]]; then
        return 0
    fi
    
    debug "Cleaning up temporary directories..."
    
    local dir
    for dir in "${TEMP_DIRS[@]}"; do
        if [[ -d "$dir" ]]; then
            debug "Removing temporary directory: $dir"
            rm -rf "$dir" 2>/dev/null || warning "Failed to remove temporary directory: $dir"
        fi
    done
}

# Public functions for registering cleanup and rollback operations

# Register a cleanup function to be called on exit
register_cleanup_function() {
    local func="$1"
    CLEANUP_FUNCTIONS+=("$func")
    debug "Registered cleanup function: $func"
}

# Register a rollback function to be called on error
register_rollback_function() {
    local func="$1"
    ROLLBACK_FUNCTIONS+=("$func")
    debug "Registered rollback function: $func"
}

# Register a temporary file for cleanup
register_temp_file() {
    local file="$1"
    TEMP_FILES+=("$file")
    debug "Registered temporary file: $file"
}

# Register a temporary directory for cleanup
register_temp_dir() {
    local dir="$1"
    TEMP_DIRS+=("$dir")
    debug "Registered temporary directory: $dir"
}

# Set error context for better error reporting
set_error_context() {
    ERROR_CONTEXT="$1"
    debug "Error context set: ${ERROR_CONTEXT}"
}

# Set current operation for better error reporting
set_current_operation() {
    CURRENT_OPERATION="$1"
    debug "Current operation set: ${CURRENT_OPERATION}"
}

# Clear error context
clear_error_context() {
    ERROR_CONTEXT=""
    debug "Error context cleared"
}

# Clear current operation
clear_current_operation() {
    CURRENT_OPERATION=""
    debug "Current operation cleared"
}

# Safe command execution with retry logic
safe_execute() {
    local max_attempts
    max_attempts=${1:-1}
    local delay
    delay=${2:-1}
    shift 2
    local cmd=("$@")
    
    local attempt=1
    while [[ $attempt -le $max_attempts ]]; do
        set_current_operation "Executing: ${cmd[*]} (attempt $attempt/$max_attempts)"
        
        if "${cmd[@]}"; then
            clear_current_operation
            return 0
        fi
        
        if [[ $attempt -lt $max_attempts ]]; then
            warning "Command failed (attempt $attempt/$max_attempts), retrying in ${delay}s..."
            sleep "$delay"
            # Exponential backoff
            delay=$((delay * 2))
        fi
        
        ((attempt++))
    done
    
    error "Command failed after $max_attempts attempts: ${cmd[*]}"
    clear_current_operation
    return 1
}

# Validate required commands exist
require_commands() {
    local missing_commands=()
    local cmd
    
    for cmd in "$@"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_commands+=("$cmd")
        fi
    done
    
    if [[ ${#missing_commands[@]} -gt 0 ]]; then
        error "Required commands not found: ${missing_commands[*]}"
        error "Please install the missing commands and try again"
        exit "${EXIT_COMMAND_NOT_FOUND}"
    fi
}

# Validate required files exist
require_files() {
    local missing_files=()
    local file
    
    for file in "$@"; do
        if [[ ! -f "$file" ]]; then
            missing_files+=("$file")
        fi
    done
    
    if [[ ${#missing_files[@]} -gt 0 ]]; then
        error "Required files not found: ${missing_files[*]}"
        exit "${EXIT_GENERAL_ERROR}"
    fi
}

# Validate required directories exist
require_directories() {
    local missing_dirs=()
    local dir
    
    for dir in "$@"; do
        if [[ ! -d "$dir" ]]; then
            missing_dirs+=("$dir")
        fi
    done
    
    if [[ ${#missing_dirs[@]} -gt 0 ]]; then
        error "Required directories not found: ${missing_dirs[*]}"
        exit "${EXIT_GENERAL_ERROR}"
    fi
}

# Create a temporary file and register it for cleanup
create_temp_file() {
    local prefix
    prefix=${1:-dangerprep}
    local temp_file
    
    temp_file=$(mktemp "/tmp/${prefix}.XXXXXX")
    register_temp_file "$temp_file"
    echo "$temp_file"
}

# Create a temporary directory and register it for cleanup
create_temp_dir() {
    local prefix
    prefix=${1:-dangerprep}
    local temp_dir
    
    temp_dir=$(mktemp -d "/tmp/${prefix}.XXXXXX")
    register_temp_dir "$temp_dir"
    echo "$temp_dir"
}

# Configuration functions
enable_error_handling() {
    ERROR_HANDLING_ENABLED=true
    init_error_handling
}

disable_error_handling() {
    ERROR_HANDLING_ENABLED=false
    trap - ERR EXIT INT TERM
}

enable_cleanup_on_exit() {
    CLEANUP_ON_EXIT=true
}

disable_cleanup_on_exit() {
    CLEANUP_ON_EXIT=false
}

enable_rollback_on_error() {
    ROLLBACK_ON_ERROR=true
}

disable_rollback_on_error() {
    ROLLBACK_ON_ERROR=false
}

# Auto-initialize error handling when sourced
init_error_handling

# Export functions for use in other scripts
export -f init_error_handling
export -f handle_error
export -f handle_exit
export -f handle_interrupt
export -f execute_cleanup_functions
export -f execute_rollback_functions
export -f cleanup_temp_files
export -f cleanup_temp_dirs
export -f register_cleanup_function
export -f register_rollback_function
export -f register_temp_file
export -f register_temp_dir
export -f set_error_context
export -f set_current_operation
export -f clear_error_context
export -f clear_current_operation
export -f safe_execute
export -f require_commands
export -f require_files
export -f require_directories
export -f create_temp_file
export -f create_temp_dir
export -f enable_error_handling
export -f disable_error_handling
export -f enable_cleanup_on_exit
export -f disable_cleanup_on_exit
export -f enable_rollback_on_error
export -f disable_rollback_on_error
