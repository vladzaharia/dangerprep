#!/bin/bash
# PROMPT Directive Handler Module
# Handles user input prompts with validation using gum

# Set strict error handling
set -euo pipefail

# Source required utilities
PROMPT_HANDLER_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source gum utilities (includes logging functions)
if [[ -f "$PROMPT_HANDLER_SCRIPT_DIR/../shared/gum-utils.sh" ]]; then
    # shellcheck source=../../shared/gum-utils.sh
    source "$PROMPT_HANDLER_SCRIPT_DIR/../shared/gum-utils.sh"
fi

# Source environment parser for validation functions
if [[ -f "$PROMPT_HANDLER_SCRIPT_DIR/env-parser.sh" ]]; then
    # shellcheck source=./env-parser.sh
    source "$PROMPT_HANDLER_SCRIPT_DIR/env-parser.sh"
fi

# =============================================================================
# PROMPT HANDLER FUNCTIONS
# =============================================================================

# Handle email input with validation
prompt_email() {
    local description="$1"
    local current_value="$2"
    local is_optional="$3"
    
    local safe_description
    safe_description="$(sanitize_description "$description")"
    
    # Add email context to description
    if [[ "$safe_description" != *"email"* ]]; then
        safe_description="$safe_description (email address)"
    fi
    
    local value
    while true; do
        value=$(enhanced_input "$safe_description" "$current_value" "Enter valid email address")
        
        # Handle optional fields
        if [[ "$is_optional" == "true" && -z "$value" ]]; then
            log_debug "Skipping optional email field"
            echo ""
            return 0
        fi
        
        # Validate email format
        if validate_email "$value"; then
            echo "$value"
            return 0
        else
            log_warn "Please enter a valid email address (e.g., user@example.com)"
            current_value=""  # Clear invalid input for retry
        fi
    done
}

# Handle password input
prompt_password() {
    local description="$1"
    local current_value="$2"
    local is_optional="$3"
    
    local safe_description
    safe_description="$(sanitize_description "$description")"
    
    # Add password context to description
    if [[ "$safe_description" != *"password"* ]]; then
        safe_description="$safe_description (password)"
    fi
    
    local value
    value=$(enhanced_password "$safe_description" "Enter password (hidden input)")
    
    # Handle optional fields
    if [[ "$is_optional" == "true" && -z "$value" ]]; then
        log_debug "Skipping optional password field"
        echo ""
        return 0
    fi
    
    # Validate required password
    if [[ "$is_optional" != "true" && -z "$value" ]]; then
        log_error "Password cannot be empty"
        return 1
    fi
    
    echo "$value"
}

# Handle general text input
prompt_text() {
    local description="$1"
    local current_value="$2"
    local is_optional="$3"
    
    local safe_description
    safe_description="$(sanitize_description "$description")"
    
    local placeholder="Enter value"
    [[ -n "$current_value" ]] && placeholder="Current: $current_value"
    
    local value
    value=$(enhanced_input "$safe_description" "$current_value" "$placeholder")
    
    # Handle optional fields
    if [[ "$is_optional" == "true" && -z "$value" ]]; then
        log_debug "Skipping optional text field"
        echo ""
        return 0
    fi
    
    # Validate required field
    if [[ "$is_optional" != "true" && -z "$value" ]]; then
        log_error "Value cannot be empty"
        return 1
    fi
    
    echo "$value"
}

# =============================================================================
# MAIN PROMPT HANDLER
# =============================================================================

# Main function to handle PROMPT directives
# Usage: handle_prompt_directive var_name current_value param_type is_optional description
handle_prompt_directive() {
    local var_name="$1"
    local current_value="$2"
    local param_type="$3"
    local is_optional="$4"
    local description="$5"
    
    log_debug "Handling PROMPT for $var_name (type: '$param_type', optional: $is_optional)"
    
    # For optional fields, ask if user wants to configure them
    if [[ "$is_optional" == "true" ]]; then
        local configure_msg="Configure $var_name?"
        [[ -n "$description" ]] && configure_msg="Configure $var_name ($description)?"

        if ! enhanced_confirm "$configure_msg" "false"; then
            log_debug "User chose to skip optional variable $var_name"
            echo ""
            return 0
        fi
    fi
    
    # Handle different prompt types
    case "$param_type" in
        "email")
            prompt_email "$description" "$current_value" "$is_optional"
            ;;
        "pw"|"password")
            prompt_password "$description" "$current_value" "$is_optional"
            ;;
        ""|*)
            # Default text input for unknown or empty types
            prompt_text "$description" "$current_value" "$is_optional"
            ;;
    esac
}

# =============================================================================
# VALIDATION HELPERS
# =============================================================================

# Validate PROMPT directive parameters
validate_prompt_parameters() {
    local param_type="$1"
    local param_size="$2"
    local is_optional="$3"
    
    # PROMPT directives don't use size parameter
    if [[ -n "$param_size" ]]; then
        log_warn "PROMPT directive does not support size parameter, ignoring: $param_size"
    fi
    
    # Validate known types
    case "$param_type" in
        ""|"email"|"pw"|"password")
            return 0
            ;;
        *)
            log_warn "Unknown PROMPT type: $param_type, treating as text input"
            return 0
            ;;
    esac
}

# Check if current value needs updating
needs_prompt_update() {
    local current_value="$1"
    local is_optional="$2"

    # Always prompt for PROMPT directives - these are meant to be configured by user
    # The values in .example files are just examples, not defaults
    return 0
}

# =============================================================================
# INTERACTIVE HELPERS
# =============================================================================

# Show current value and ask if user wants to change it
confirm_value_change() {
    local var_name="$1"
    local current_value="$2"
    local description="$3"
    
    if [[ -z "$current_value" || "$current_value" == "change_me_"* ]]; then
        return 0  # Always change empty or placeholder values
    fi
    
    local display_value="$current_value"
    # Truncate long values for display
    if [[ ${#display_value} -gt 50 ]]; then
        display_value="${display_value:0:47}..."
    fi
    
    local change_msg="Change $var_name from '$display_value'?"
    [[ -n "$description" ]] && change_msg="$change_msg ($description)"
    
    enhanced_confirm "$change_msg" "false"
}

# Export this module's functions
export -f prompt_email
export -f prompt_password
export -f prompt_text
export -f handle_prompt_directive
export -f validate_prompt_parameters
export -f needs_prompt_update
export -f confirm_value_change
