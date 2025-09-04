#!/bin/bash
# Environment Error Handler Module
# Comprehensive error handling and validation for environment processing

# Set strict error handling
set -euo pipefail

# Source required utilities
ENV_ERROR_HANDLER_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source gum utilities (includes logging functions)
if [[ -f "$ENV_ERROR_HANDLER_SCRIPT_DIR/../../shared/gum-utils.sh" ]]; then
    # shellcheck source=../../shared/gum-utils.sh
    source "$ENV_ERROR_HANDLER_SCRIPT_DIR/../../shared/gum-utils.sh"
fi

# =============================================================================
# ERROR HANDLING CONFIGURATION
# =============================================================================

# Global error tracking
ENV_ERROR_COUNT=0
ENV_WARNING_COUNT=0
ENV_RECOVERY_ATTEMPTS=0
ENV_ERROR_LOG=()

# Maximum recovery attempts
readonly MAX_RECOVERY_ATTEMPTS=3
readonly MAX_INPUT_RETRIES=3

# =============================================================================
# ERROR TRACKING FUNCTIONS
# =============================================================================

# Record an error with context
record_error() {
    local error_type="$1"
    local error_message="$2"
    local context="${3:-}"

    ((ENV_ERROR_COUNT++))
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    local error_entry="[$timestamp] $error_type: $error_message"
    [[ -n "$context" ]] && error_entry+=" (Context: $context)"
    ENV_ERROR_LOG+=("$error_entry")

    log_error "$error_message"
    [[ -n "$context" ]] && log_debug "Error context: $context"
}

# Record a warning with context
record_warning() {
    local warning_message="$1"
    local context="${2:-}"

    ((ENV_WARNING_COUNT++))
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    local warning_entry="[$timestamp] WARNING: $warning_message"
    [[ -n "$context" ]] && warning_entry+=" (Context: $context)"
    ENV_ERROR_LOG+=("$warning_entry")

    log_warn "$warning_message"
    [[ -n "$context" ]] && log_debug "Warning context: $context"
}

# Get error summary
get_error_summary() {
    echo "Errors: $ENV_ERROR_COUNT, Warnings: $ENV_WARNING_COUNT, Recovery attempts: $ENV_RECOVERY_ATTEMPTS"
}

# Display detailed error log
show_error_log() {
    if [[ $ENV_ERROR_COUNT -eq 0 && $ENV_WARNING_COUNT -eq 0 ]]; then
        log_info "No errors or warnings recorded"
        return 0
    fi

    echo
    enhanced_section "Error and Warning Summary" "$(get_error_summary)" "⚠️"

    for entry in "${ENV_ERROR_LOG[@]}"; do
        echo "  $entry"
    done
    echo
}

# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

# Validate system requirements
validate_system_requirements() {
    local missing_tools=()
    local required_tools=("openssl" "sed" "grep" "find")
    
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing_tools+=("$tool")
        fi
    done
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        record_error "SYSTEM_REQUIREMENTS" "Missing required tools: ${missing_tools[*]}"
        return 1
    fi
    
    # Check gum availability
    if ! gum_available; then
        record_warning "Gum not available, falling back to basic input methods"
    fi
    
    return 0
}

# Validate file permissions and accessibility
validate_file_access() {
    local file="$1"
    local operation="${2:-read}"  # read, write, create
    
    case "$operation" in
        "read")
            if [[ ! -f "$file" ]]; then
                record_error "FILE_ACCESS" "File not found: $file"
                return 1
            fi
            if [[ ! -r "$file" ]]; then
                record_error "FILE_ACCESS" "Cannot read file: $file"
                return 1
            fi
            ;;
        "write")
            if [[ -f "$file" && ! -w "$file" ]]; then
                record_error "FILE_ACCESS" "Cannot write to file: $file"
                return 1
            fi
            ;;
        "create")
            local dir
            dir="$(dirname "$file")"
            if [[ ! -d "$dir" ]]; then
                record_error "FILE_ACCESS" "Directory does not exist: $dir"
                return 1
            fi
            if [[ ! -w "$dir" ]]; then
                record_error "FILE_ACCESS" "Cannot write to directory: $dir"
                return 1
            fi
            ;;
    esac
    
    return 0
}

# Validate environment file syntax
validate_env_syntax() {
    local env_file="$1"
    local errors=0
    local line_number=0
    
    if ! validate_file_access "$env_file" "read"; then
        return 1
    fi
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((line_number++))
        
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
        
        # Validate variable assignment format
        if ! [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*=.*$ ]]; then
            record_warning "Invalid syntax at line $line_number in $(basename "$env_file"): $line" "$env_file:$line_number"
            ((errors++))
        fi
        
        # Check for potentially dangerous values
        if [[ "$line" =~ \$\(.*\) ]] || [[ "$line" =~ \`.*\` ]]; then
            record_warning "Potentially dangerous command substitution at line $line_number: $line" "$env_file:$line_number"
        fi
    done < "$env_file"
    
    if [[ $errors -gt 5 ]]; then
        record_error "SYNTAX_VALIDATION" "Too many syntax errors ($errors) in $(basename "$env_file")"
        return 1
    fi
    
    return 0
}

# =============================================================================
# RECOVERY FUNCTIONS
# =============================================================================

# Attempt to recover from file operation errors
recover_file_operation() {
    local operation="$1"
    local file="$2"
    local backup_file="${3:-}"
    
    ((ENV_RECOVERY_ATTEMPTS++))
    
    if [[ $ENV_RECOVERY_ATTEMPTS -gt $MAX_RECOVERY_ATTEMPTS ]]; then
        record_error "RECOVERY_FAILED" "Maximum recovery attempts exceeded"
        return 1
    fi
    
    log_info "Attempting recovery for $operation on $(basename "$file") (attempt $ENV_RECOVERY_ATTEMPTS)"
    
    case "$operation" in
        "backup_restore")
            if [[ -n "$backup_file" && -f "$backup_file" ]]; then
                if cp "$backup_file" "$file"; then
                    log_info "Successfully restored $(basename "$file") from backup"
                    return 0
                else
                    record_error "RECOVERY_FAILED" "Failed to restore from backup: $backup_file"
                    return 1
                fi
            else
                record_error "RECOVERY_FAILED" "No backup file available for recovery"
                return 1
            fi
            ;;
        "permission_fix")
            if enhanced_confirm "Try to fix file permissions for $(basename "$file")?" "true"; then
                if chmod 644 "$file" 2>/dev/null; then
                    log_info "Fixed permissions for $(basename "$file")"
                    return 0
                else
                    record_error "RECOVERY_FAILED" "Failed to fix permissions for $file"
                    return 1
                fi
            fi
            ;;
        "recreate_file")
            if enhanced_confirm "Recreate $(basename "$file") from example?" "false"; then
                local example_file="${file}.example"
                if [[ -f "$example_file" ]]; then
                    if cp "$example_file" "$file"; then
                        log_info "Recreated $(basename "$file") from example"
                        return 0
                    else
                        record_error "RECOVERY_FAILED" "Failed to recreate from example"
                        return 1
                    fi
                else
                    record_error "RECOVERY_FAILED" "No example file found: $example_file"
                    return 1
                fi
            fi
            ;;
    esac
    
    return 1
}

# =============================================================================
# INPUT VALIDATION AND RETRY
# =============================================================================

# Robust input with validation and retry
robust_input() {
    local prompt="$1"
    local validator_function="$2"
    local max_retries="${3:-$MAX_INPUT_RETRIES}"
    local default_value="${4:-}"
    
    local attempt=0
    local value
    
    while [[ $attempt -lt $max_retries ]]; do
        ((attempt++))
        
        if command -v enhanced_input >/dev/null 2>&1; then
            value=$(enhanced_input "$prompt" "$default_value" "")
        else
            echo -n "$prompt: "
            read -r value
        fi
        
        # Use default if empty and default provided
        [[ -z "$value" && -n "$default_value" ]] && value="$default_value"
        
        # Validate input
        if [[ -n "$validator_function" ]] && command -v "$validator_function" >/dev/null 2>&1; then
            if "$validator_function" "$value"; then
                echo "$value"
                return 0
            else
                record_warning "Invalid input (attempt $attempt/$max_retries): $value"
                if [[ $attempt -lt $max_retries ]]; then
                    log_warn "Please try again..."
                fi
            fi
        else
            # No validator, accept any non-empty value
            if [[ -n "$value" ]]; then
                echo "$value"
                return 0
            else
                record_warning "Empty input not allowed (attempt $attempt/$max_retries)"
            fi
        fi
        
        default_value=""  # Clear default for retry attempts
    done
    
    record_error "INPUT_VALIDATION" "Failed to get valid input after $max_retries attempts"
    return 1
}

# =============================================================================
# SAFE OPERATION WRAPPERS
# =============================================================================

# Safe file operation with error handling and recovery
safe_file_operation() {
    local operation="$1"
    local file="$2"
    shift 2
    local -a args=("$@")
    
    # Pre-operation validation
    case "$operation" in
        "read")
            validate_file_access "$file" "read" || return 1
            ;;
        "write"|"update")
            validate_file_access "$file" "write" || {
                recover_file_operation "permission_fix" "$file" || return 1
            }
            ;;
        "create")
            validate_file_access "$file" "create" || return 1
            ;;
    esac
    
    # Create backup for write operations
    local backup_file=""
    if [[ "$operation" == "write" || "$operation" == "update" ]] && [[ -f "$file" ]]; then
        backup_file="${file}.backup.$(date +%Y%m%d_%H%M%S)"
        if ! cp "$file" "$backup_file"; then
            record_warning "Failed to create backup for $(basename "$file")"
            backup_file=""
        fi
    fi
    
    # Perform the operation
    local result=0
    case "$operation" in
        "read")
            cat "$file" || result=1
            ;;
        "write")
            echo "${args[0]}" > "$file" || result=1
            ;;
        "update")
            # This would be handled by specific update functions
            result=1
            ;;
    esac
    
    # Handle operation failure
    if [[ $result -ne 0 ]]; then
        record_error "FILE_OPERATION" "$operation failed on $(basename "$file")"
        
        # Attempt recovery
        if [[ -n "$backup_file" ]]; then
            recover_file_operation "backup_restore" "$file" "$backup_file"
        fi
        
        return 1
    fi
    
    # Clean up old backup on success
    [[ -n "$backup_file" ]] && rm -f "$backup_file"
    return 0
}

# =============================================================================
# CLEANUP FUNCTIONS
# =============================================================================

# Clean up error tracking
cleanup_error_tracking() {
    ENV_ERROR_COUNT=0
    ENV_WARNING_COUNT=0
    ENV_RECOVERY_ATTEMPTS=0
    ENV_ERROR_LOG=()
}

# Emergency cleanup on script exit
emergency_cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -ne 0 ]]; then
        log_error "Script exited with error code $exit_code"
        show_error_log
    fi
    
    # Clean up any temporary files
    find /tmp -name "env_backup_*" -mtime +1 -delete 2>/dev/null || true
}

# Set up emergency cleanup trap
trap emergency_cleanup EXIT

# Export this module's functions
export -f record_error
export -f record_warning
export -f get_error_summary
export -f show_error_log
export -f validate_system_requirements
export -f validate_file_access
export -f validate_env_syntax
export -f recover_file_operation
export -f robust_input
export -f safe_file_operation
export -f cleanup_error_tracking
export -f emergency_cleanup
