#!/bin/bash
# Environment File Processor Module
# Handles processing of environment files and updating variables safely

# Set strict error handling
set -euo pipefail

# Source required utilities
ENV_PROCESSOR_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source gum utilities (includes logging functions)
if [[ -f "$ENV_PROCESSOR_SCRIPT_DIR/../shared/gum-utils.sh" ]]; then
    # shellcheck source=../../shared/gum-utils.sh
    source "$ENV_PROCESSOR_SCRIPT_DIR/../shared/gum-utils.sh"
fi

# Source other modules
if [[ -f "$ENV_PROCESSOR_SCRIPT_DIR/env-parser.sh" ]]; then
    # shellcheck source=./env-parser.sh
    source "$ENV_PROCESSOR_SCRIPT_DIR/env-parser.sh"
fi

if [[ -f "$ENV_PROCESSOR_SCRIPT_DIR/prompt-handler.sh" ]]; then
    # shellcheck source=./prompt-handler.sh
    source "$ENV_PROCESSOR_SCRIPT_DIR/prompt-handler.sh"
fi

if [[ -f "$ENV_PROCESSOR_SCRIPT_DIR/generate-handler.sh" ]]; then
    # shellcheck source=./generate-handler.sh
    source "$ENV_PROCESSOR_SCRIPT_DIR/generate-handler.sh"
fi

# =============================================================================
# FILE OPERATIONS
# =============================================================================

# Create backup of environment file
backup_env_file() {
    local env_file="$1"

    if [[ ! -f "$env_file" ]]; then
        log_debug "No backup needed - file doesn't exist: $env_file"
        return 0
    fi

    local backup_dir
    backup_dir="$(dirname "$env_file")/backups"

    # Create backup directory if it doesn't exist
    if [[ ! -d "$backup_dir" ]]; then
        if ! mkdir -p "$backup_dir" 2>/dev/null; then
            # Fallback to temp directory
            backup_dir="/tmp"
        fi
    fi

    local backup_file="${backup_dir}/$(basename "$env_file").backup-$(date +%Y%m%d-%H%M%S)"

    if cp "$env_file" "$backup_file" 2>/dev/null; then
        log_debug "Created backup: $(basename "$backup_file")"
        echo "$backup_file"
        return 0
    else
        log_warn "Failed to create backup of $(basename "$env_file")"
        return 1
    fi
}

# Check if file is writable
check_file_writable() {
    local file="$1"

    if [[ -f "$file" ]]; then
        [[ -w "$file" ]]
    else
        # Check if directory is writable for new file creation
        local dir
        dir="$(dirname "$file")"
        [[ -w "$dir" ]]
    fi
}

# Safely update a variable in an environment file
update_env_variable() {
    local env_file="$1"
    local var_name="$2"
    local var_value="$3"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        return 1
    fi
    
    if ! check_file_writable "$env_file"; then
        log_error "Cannot write to environment file: $env_file"
        return 1
    fi
    
    # Create backup before modifying
    local backup_file
    backup_file=$(backup_env_file "$env_file")
    
    # Escape special characters for sed
    local escaped_value
    escaped_value=$(printf '%s\n' "$var_value" | sed 's/[[\.*^$()+?{|]/\\&/g')
    
    # Update or add the variable
    if grep -q "^${var_name}=" "$env_file"; then
        # Variable exists, update it
        if sed -i.tmp "s|^${var_name}=.*|${var_name}=${escaped_value}|" "$env_file"; then
            rm -f "${env_file}.tmp"
            log_debug "Updated $var_name in $(basename "$env_file")"
        else
            log_error "Failed to update $var_name in $env_file"
            # Restore from backup if available
            [[ -n "$backup_file" && -f "$backup_file" ]] && cp "$backup_file" "$env_file"
            return 1
        fi
    else
        # Variable doesn't exist, add it
        if echo "${var_name}=${var_value}" >> "$env_file"; then
            log_debug "Added $var_name to $(basename "$env_file")"
        else
            log_error "Failed to add $var_name to $env_file"
            # Restore from backup if available
            [[ -n "$backup_file" && -f "$backup_file" ]] && cp "$backup_file" "$env_file"
            return 1
        fi
    fi
    
    return 0
}

# Create environment file from example
create_env_from_example() {
    local example_file="$1"
    local env_file="$2"
    
    if [[ ! -f "$example_file" ]]; then
        log_error "Example file not found: $example_file"
        return 1
    fi
    
    local env_dir
    env_dir="$(dirname "$env_file")"
    
    if [[ ! -d "$env_dir" ]]; then
        log_error "Directory does not exist: $env_dir"
        return 1
    fi
    
    if [[ ! -w "$env_dir" ]]; then
        log_error "Cannot write to directory: $env_dir"
        return 1
    fi
    
    # Copy example to env file
    if cp "$example_file" "$env_file"; then
        log_info "Created $(basename "$env_file") from $(basename "$example_file")"
        return 0
    else
        log_error "Failed to create $env_file from $example_file"
        return 1
    fi
}

# =============================================================================
# DIRECTIVE PROCESSING
# =============================================================================

# Process a single directive-variable pair with a specific target file
# This version uses CURRENT_ENV_FILE to determine which file to update
process_directive_variable_with_target() {
    local source_file="$1"  # The file being parsed (example file)
    local var_name="$2"
    local current_value="$3"
    local directive="$4"
    local description="$5"
    local params="$6"

    # Use the target env file for updates
    local target_env_file="${CURRENT_ENV_FILE:-$source_file}"

    # Get the current value from the target file, not the source file
    local actual_current_value="$current_value"
    if [[ "$target_env_file" != "$source_file" && -f "$target_env_file" ]]; then
        # Read the actual current value from the target file
        if grep -q "^${var_name}=" "$target_env_file"; then
            actual_current_value=$(grep "^${var_name}=" "$target_env_file" | cut -d'=' -f2- | head -n1)
        fi
    fi

    log_debug "Processing $directive directive for $var_name (target: $(basename "$target_env_file"))"

    # Parse directive parameters
    parse_directive_parameters "$params"
    local param_type="$PARAM_TYPE"
    local param_size="$PARAM_SIZE"
    local is_optional="$IS_OPTIONAL"

    # Validate parameters based on directive type
    case "$directive" in
        "PROMPT")
            if ! validate_prompt_parameters "$param_type" "$param_size" "$is_optional"; then
                log_warn "Invalid parameters for PROMPT directive on $var_name"
            fi
            ;;
        "GENERATE")
            if ! validate_generate_parameters "$param_type" "$param_size" "$is_optional"; then
                log_warn "Invalid parameters for GENERATE directive on $var_name"
            fi
            ;;
    esac

    # Handle the directive
    local new_value=""
    case "$directive" in
        "PROMPT")
            new_value=$(handle_prompt_directive "$var_name" "$actual_current_value" \
                "$param_type" "$is_optional" "$description" "$current_value")
            ;;
        "GENERATE")
            new_value=$(handle_generate_directive "$var_name" "$actual_current_value" \
                "$param_type" "$param_size" "$is_optional" "$description")
            ;;
        *)
            log_error "Unknown directive: $directive"
            return 1
            ;;
    esac

    # Update the target environment file if we got a new value
    if [[ -n "$new_value" && "$new_value" != "$actual_current_value" ]]; then
        if update_env_variable "$target_env_file" "$var_name" "$new_value"; then
            log_info "Updated $var_name"

            # Export critical variables to shell environment
            export_critical_variable "$var_name" "$new_value"
        else
            log_error "Failed to update $var_name in $(basename "$target_env_file")"
            return 1
        fi
    elif [[ -n "$new_value" ]]; then
        log_debug "No change needed for $var_name (current value is already correct)"
    else
        log_debug "No value provided for $var_name (skipped or optional)"
    fi

    return 0
}

# Process a single directive-variable pair
# This is the callback function used by parse_environment_file
process_directive_variable() {
    local env_file="$1"
    local var_name="$2"
    local current_value="$3"
    local directive="$4"
    local description="$5"
    local params="$6"
    
    log_debug "Processing $directive directive for $var_name"
    
    # Parse directive parameters
    parse_directive_parameters "$params"
    local param_type="$PARAM_TYPE"
    local param_size="$PARAM_SIZE"
    local is_optional="$IS_OPTIONAL"
    
    # Validate parameters based on directive type
    case "$directive" in
        "PROMPT")
            if ! validate_prompt_parameters "$param_type" "$param_size" "$is_optional"; then
                log_warn "Invalid parameters for PROMPT directive on $var_name"
            fi
            ;;
        "GENERATE")
            if ! validate_generate_parameters "$param_type" "$param_size" "$is_optional"; then
                log_warn "Invalid parameters for GENERATE directive on $var_name"
            fi
            ;;
    esac
    
    # Handle the directive
    local new_value=""
    case "$directive" in
        "PROMPT")
            new_value=$(handle_prompt_directive "$var_name" "$current_value" \
                "$param_type" "$is_optional" "$description" "$current_value")
            ;;
        "GENERATE")
            new_value=$(handle_generate_directive "$var_name" "$current_value" \
                "$param_type" "$param_size" "$is_optional" "$description")
            ;;
        *)
            log_error "Unknown directive: $directive"
            return 1
            ;;
    esac
    
    # Update the environment file if we got a new value
    if [[ -n "$new_value" && "$new_value" != "$current_value" ]]; then
        if update_env_variable "$env_file" "$var_name" "$new_value"; then
            log_info "Updated $var_name"
            
            # Export critical variables to shell environment
            export_critical_variable "$var_name" "$new_value"
        else
            log_error "Failed to update $var_name"
            return 1
        fi
    elif [[ -z "$new_value" && "$is_optional" == "true" ]]; then
        log_debug "Skipped optional variable $var_name"
    elif [[ -n "$new_value" && "$new_value" == "$current_value" ]]; then
        log_debug "No change needed for $var_name"
    fi
    
    return 0
}

# =============================================================================
# ENVIRONMENT PROCESSING
# =============================================================================

# Process a complete environment file
process_environment_file() {
    local example_file="$1"
    local env_file="${2:-}"

    # Determine env file path if not provided
    if [[ -z "$env_file" ]]; then
        env_file="${example_file%.example}"
    fi

    log_info "Processing environment file: $(basename "$example_file")"

    # Create env file from example if it doesn't exist
    if [[ ! -f "$env_file" ]]; then
        if ! create_env_from_example "$example_file" "$env_file"; then
            return 1
        fi
    fi

    # First, process template substitutions for common variables
    if ! process_template_substitutions "$env_file"; then
        log_warn "Template substitution failed for $(basename "$env_file"), continuing with directive processing"
    fi

    # Parse the EXAMPLE file (which contains the directives) but update the actual env file
    # We need to set a global variable so the callback knows which file to update
    export CURRENT_ENV_FILE="$env_file"
    if ! parse_environment_file "$example_file" "process_directive_variable_with_target"; then
        log_error "Failed to process environment file: $example_file"
        unset CURRENT_ENV_FILE
        return 1
    fi
    unset CURRENT_ENV_FILE

    log_info "Successfully processed $(basename "$env_file")"
    return 0
}

# Process multiple environment files
process_multiple_env_files() {
    local -a example_files=("$@")
    local processed=0
    local failed=0
    
    if [[ ${#example_files[@]} -eq 0 ]]; then
        log_warn "No environment files to process"
        return 0
    fi
    
    log_info "Processing ${#example_files[@]} environment files"
    
    for example_file in "${example_files[@]}"; do
        if [[ -f "$example_file" ]]; then
            if process_environment_file "$example_file"; then
                ((processed++))
            else
                ((failed++))
                log_error "Failed to process: $(basename "$example_file")"
            fi
        else
            ((failed++))
            log_error "File not found: $example_file"
        fi
    done
    
    log_info "Processing complete: $processed successful, $failed failed"
    
    if [[ $failed -gt 0 ]]; then
        return 1
    fi
    
    return 0
}

# =============================================================================
# TEMPLATE PROCESSING
# =============================================================================

# Process template substitutions in environment files
process_template_substitutions() {
    local env_file="$1"

    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        return 1
    fi

    log_debug "Processing template substitutions in $(basename "$env_file")"

    # Create backup before modifying
    local backup_file
    backup_file=$(backup_env_file "$env_file")

    # Read file content
    local content
    content=$(cat "$env_file")

    # Process common environment variables if they exist
    local common_vars=(
        "TZ" "SSH_PORT" "WIFI_SSID" "WIFI_PASSWORD" "WIFI_INTERFACE" "WAN_INTERFACE"
        "LAN_IP" "LAN_NETWORK" "DHCP_START" "DHCP_END" "FAIL2BAN_BANTIME" "FAIL2BAN_MAXRETRY"
        "PROJECT_ROOT" "INSTALL_ROOT" "SMTP_HOST" "SMTP_PORT" "SMTP_USER" "SMTP_PASSWORD" "SMTP_FROM"
        "NOTIFICATION_EMAIL" "ADMIN_EMAIL"
    )

    local substitutions_made=0
    for var in "${common_vars[@]}"; do
        local var_value="${!var:-}"
        if [[ -n "$var_value" ]]; then
            # Check if this variable placeholder exists in the content
            if [[ "$content" == *"{{${var}}}"* ]]; then
                # Escape special characters for sed
                local escaped_value
                escaped_value=$(printf '%s\n' "$var_value" | sed 's/[[\.*^$()+?{|]/\\&/g')

                # Perform substitution
                content="${content//\{\{${var}\}\}/$var_value}"
                ((substitutions_made++))
                log_debug "Substituted {{$var}} with $var_value"
            fi
        fi
    done

    # Write processed content back to file if substitutions were made
    if [[ $substitutions_made -gt 0 ]]; then
        if echo "$content" > "$env_file"; then
            log_info "Applied $substitutions_made template substitutions to $(basename "$env_file")"
            return 0
        else
            log_error "Failed to write template substitutions to $env_file"
            # Restore from backup if available
            [[ -n "$backup_file" && -f "$backup_file" ]] && cp "$backup_file" "$env_file"
            return 1
        fi
    else
        log_debug "No template substitutions needed for $(basename "$env_file")"
        return 0
    fi
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Export critical variables to shell environment for Docker builds
export_critical_variable() {
    local var_name="$1"
    local var_value="$2"
    
    # List of variables that should be exported to shell environment
    local -a critical_vars=(
        "INSTALL_ROOT"
        "TZ"
        "ACME_EMAIL"
        "TRAEFIK_AUTH_USERS"
        "CF_API_EMAIL"
        "CF_API_KEY"
    )
    
    # Check if this variable should be exported
    for critical_var in "${critical_vars[@]}"; do
        if [[ "$var_name" == "$critical_var" ]]; then
            export "$var_name=$var_value"
            log_debug "Exported $var_name to shell environment"
            break
        fi
    done
}

# Find all compose.env.example files in a directory tree
find_env_example_files() {
    local search_dir="$1"

    if [[ ! -d "$search_dir" ]]; then
        log_error "Directory not found: $search_dir"
        return 1
    fi

    find "$search_dir" -name "compose.env.example" -type f | sort
}

# Validate environment file structure
validate_env_file() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        return 1
    fi
    
    # Check for basic syntax issues
    local line_number=0
    local errors=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((line_number++))
        
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
        
        # Check variable assignment format
        if ! [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
            log_warn "Invalid line format at line $line_number in $(basename "$env_file"): $line"
            ((errors++))
        fi
    done < "$env_file"
    
    if [[ $errors -gt 0 ]]; then
        log_warn "Found $errors potential issues in $(basename "$env_file")"
        return 1
    fi
    
    return 0
}

# Export this module's functions
export -f backup_env_file
export -f check_file_writable
export -f update_env_variable
export -f create_env_from_example
export -f process_directive_variable_with_target
export -f process_directive_variable
export -f process_template_substitutions
export -f process_environment_file
export -f process_multiple_env_files
export -f export_critical_variable
export -f find_env_example_files
export -f validate_env_file
