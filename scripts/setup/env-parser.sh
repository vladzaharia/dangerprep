#!/bin/bash
# Environment Parser Module
# Core parsing logic for compose.env.example files with PROMPT and GENERATE directives

# Set strict error handling
set -euo pipefail

# Source required utilities
ENV_PARSER_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_PARSER_PROJECT_ROOT="$(dirname "$(dirname "${ENV_PARSER_SCRIPT_DIR}")")"

# Source gum utilities (includes logging functions)
if [[ -f "$ENV_PARSER_SCRIPT_DIR/../shared/gum-utils.sh" ]]; then
    # shellcheck source=../../shared/gum-utils.sh
    source "$ENV_PARSER_SCRIPT_DIR/../shared/gum-utils.sh"
fi



# =============================================================================
# DIRECTIVE PARSING FUNCTIONS
# =============================================================================

# Parse directive parameters from bracket notation
# Input: "[type,size,OPTIONAL]" or "[email,OPTIONAL]" or "[32]" or ""
# Output: Sets global variables: PARAM_TYPE, PARAM_SIZE, IS_OPTIONAL
parse_directive_parameters() {
    local param_string="$1"
    
    # Initialize defaults
    PARAM_TYPE=""
    PARAM_SIZE=""
    IS_OPTIONAL="false"
    
    # Remove brackets if present
    param_string="${param_string#[}"
    param_string="${param_string%]}"
    
    # Return early if empty
    [[ -z "$param_string" ]] && return 0
    
    # Split parameters by comma
    local IFS=','
    local params=($param_string)
    
    for param in "${params[@]}"; do
        # Trim whitespace
        param="$(echo "$param" | xargs)"
        
        case "$param" in
            "OPTIONAL")
                IS_OPTIONAL="true"
                ;;
            "email"|"pw"|"password")
                PARAM_TYPE="$param"
                ;;
            "b64"|"base64"|"hex"|"bcrypt")
                PARAM_TYPE="$param"
                ;;
            [0-9]*)
                PARAM_SIZE="$param"
                ;;
            *)
                # Unknown parameter, treat as type
                [[ -z "$PARAM_TYPE" ]] && PARAM_TYPE="$param"
                ;;
        esac
    done
    
    log_debug "Parsed parameters: TYPE='$PARAM_TYPE', SIZE='$PARAM_SIZE', OPTIONAL='$IS_OPTIONAL'"
}

# Parse a single line for directive comments
# Returns: 0 if directive found, 1 if not a directive
# Usage: parse_directive_line "line" && directive="$PARSE_DIRECTIVE" description="$PARSE_DESCRIPTION" params="$PARSE_PARAMS"
parse_directive_line() {
    local line="$1"

    # Clear global variables
    PARSE_DIRECTIVE=""
    PARSE_DESCRIPTION=""
    PARSE_PARAMS=""

    # Match directive pattern: # DIRECTIVE[params]: description
    if [[ "$line" =~ ^#[[:space:]]*(PROMPT|GENERATE)(\[[^]]*\])?[[:space:]]*:[[:space:]]*(.*)$ ]]; then
        PARSE_DIRECTIVE="${BASH_REMATCH[1]}"
        PARSE_PARAMS="${BASH_REMATCH[2]}"
        PARSE_DESCRIPTION="${BASH_REMATCH[3]}"

        # Clean up description
        PARSE_DESCRIPTION="$(echo "$PARSE_DESCRIPTION" | xargs)"

        log_debug "Found directive: $PARSE_DIRECTIVE with params: '$PARSE_PARAMS'"
        return 0
    fi

    return 1
}

# Parse a variable assignment line
# Returns: 0 if variable found, 1 if not a variable
# Usage: parse_variable_line "line" && var_name="$PARSE_VAR_NAME" var_value="$PARSE_VAR_VALUE"
parse_variable_line() {
    local line="$1"

    # Clear global variables
    PARSE_VAR_NAME=""
    PARSE_VAR_VALUE=""

    if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        PARSE_VAR_NAME="${BASH_REMATCH[1]}"
        PARSE_VAR_VALUE="${BASH_REMATCH[2]}"

        log_debug "Found variable: $PARSE_VAR_NAME = '$PARSE_VAR_VALUE'"
        return 0
    fi

    return 1
}

# Parse a commented out variable assignment line
# Returns: 0 if commented variable found, 1 if not a commented variable
# Usage: parse_commented_variable_line "line" && var_name="$PARSE_VAR_NAME" var_value="$PARSE_VAR_VALUE"
parse_commented_variable_line() {
    local line="$1"

    # Clear global variables
    PARSE_VAR_NAME=""
    PARSE_VAR_VALUE=""

    # Match commented out variable: # VAR_NAME=value (with optional whitespace)
    if [[ "$line" =~ ^[[:space:]]*#[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        PARSE_VAR_NAME="${BASH_REMATCH[1]}"
        PARSE_VAR_VALUE="${BASH_REMATCH[2]}"

        log_debug "Found commented variable: $PARSE_VAR_NAME = '$PARSE_VAR_VALUE' (ignored)"
        return 0
    fi

    return 1
}

# =============================================================================
# ENVIRONMENT FILE PARSING
# =============================================================================

# Parse an environment file and extract directive-variable pairs
# Input: path to compose.env.example file
# Output: Calls process_directive_variable for each directive-variable pair found
parse_environment_file() {
    local env_file="$1"
    local callback_function="${2:-process_directive_variable}"
    
    if [[ ! -f "$env_file" ]]; then
        log_error "Environment file not found: $env_file"
        return 1
    fi
    
    log_info "Parsing environment file: $(basename "$env_file")"
    
    local pending_directive=""
    local pending_description=""
    local pending_params=""
    local line_number=0
    
    while IFS= read -r line || [[ -n "$line" ]]; do
        ((line_number++))
        
        # Skip empty lines and non-directive comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*$ ]] && continue
        
        if parse_directive_line "$line"; then
            # Found a directive comment
            pending_directive="$PARSE_DIRECTIVE"
            pending_description="$PARSE_DESCRIPTION"
            pending_params="$PARSE_PARAMS"
            continue
        fi

        if parse_variable_line "$line"; then
            # Found a variable assignment
            local var_name="$PARSE_VAR_NAME"
            local var_value="$PARSE_VAR_VALUE"

            if [[ -n "$pending_directive" ]]; then
                # Process the directive-variable pair
                log_debug "Processing directive-variable pair: $pending_directive -> $var_name"

                if ! "$callback_function" "$env_file" "$var_name" "$var_value" \
                    "$pending_directive" "$pending_description" "$pending_params"; then
                    log_warn "Failed to process $var_name at line $line_number"
                fi

                # Clear pending directive
                pending_directive=""
                pending_description=""
                pending_params=""
            fi
        elif parse_commented_variable_line "$line"; then
            # Found a commented out variable assignment
            local var_name="$PARSE_VAR_NAME"

            if [[ -n "$pending_directive" ]]; then
                # Skip processing for commented out variables and clear pending directive
                log_debug "Skipping directive for commented variable: $var_name (directive: $pending_directive)"

                # Clear pending directive
                pending_directive=""
                pending_description=""
                pending_params=""
            fi
        fi
    done < "$env_file"
    
    # Warn about unmatched directives
    if [[ -n "$pending_directive" ]]; then
        log_warn "Directive '$pending_directive' found without matching variable in $env_file"
    fi
}

# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

# Validate email address format
validate_email() {
    local email="$1"
    [[ "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]
}

# Validate that a value is not empty (for required fields)
validate_required() {
    local value="$1"
    [[ -n "$value" && "$value" != "change_me_"* ]]
}

# Sanitize description text for safe display
sanitize_description() {
    local description="$1"
    
    # Remove potentially dangerous characters
    description="${description//[\$\`\\\"\']/}"
    # Replace newlines and tabs with spaces
    description="${description//[$'\n\r\t']/ }"
    # Collapse multiple spaces
    description="${description//  / }"
    # Trim whitespace
    description="$(echo "$description" | xargs)"
    
    # Ensure it's not empty
    if [[ -z "$description" ]]; then
        description="Enter value"
    fi
    
    # Truncate if too long
    if [[ ${#description} -gt 100 ]]; then
        description="${description:0:97}..."
    fi
    
    echo "$description"
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Check if a file is writable or can be created
check_file_writable() {
    local file="$1"
    
    if [[ -f "$file" ]]; then
        [[ -w "$file" ]]
    else
        local dir
        dir="$(dirname "$file")"
        [[ -d "$dir" && -w "$dir" ]]
    fi
}

# Create a backup of an environment file
backup_env_file() {
    local env_file="$1"
    local backup_file="${env_file}.backup.$(date +%Y%m%d_%H%M%S)"
    
    if [[ -f "$env_file" ]]; then
        cp "$env_file" "$backup_file"
        log_debug "Created backup: $(basename "$backup_file")"
        echo "$backup_file"
    fi
}

# Export this module's functions
export -f parse_directive_parameters
export -f parse_directive_line
export -f parse_variable_line
export -f parse_commented_variable_line
export -f parse_environment_file
export -f validate_email
export -f validate_required
export -f sanitize_description
export -f check_file_writable
export -f backup_env_file
