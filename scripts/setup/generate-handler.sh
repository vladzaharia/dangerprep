#!/bin/bash
# GENERATE Directive Handler Module
# Handles automatic generation of secure values

# Set strict error handling
set -euo pipefail

# Source required utilities
GENERATE_HANDLER_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source gum utilities (includes logging functions)
if [[ -f "$GENERATE_HANDLER_SCRIPT_DIR/../shared/gum-utils.sh" ]]; then
    # shellcheck source=../../shared/gum-utils.sh
    source "$GENERATE_HANDLER_SCRIPT_DIR/../shared/gum-utils.sh"
fi

# =============================================================================
# GENERATION FUNCTIONS
# =============================================================================

# Generate base64 encoded value
generate_base64() {
    local size="$1"
    local var_name="$2"
    
    # Ensure we have openssl
    if ! command -v openssl >/dev/null 2>&1; then
        log_error "openssl is required for base64 generation"
        return 1
    fi
    
    # Generate base64 value and clean it up
    local value
    value=$(openssl rand -base64 "$((size * 3 / 4 + 1))" | tr -d "=+/\n" | cut -c1-"$size") || {
        log_error "Failed to generate base64 value for $var_name"
        return 1
    }
    
    echo "$value"
}

# Generate hexadecimal value
generate_hex() {
    local size="$1"
    local var_name="$2"
    
    # Ensure we have openssl
    if ! command -v openssl >/dev/null 2>&1; then
        log_error "openssl is required for hex generation"
        return 1
    fi
    
    # Generate hex value
    local value
    value=$(openssl rand -hex "$((size / 2 + 1))" | cut -c1-"$size") || {
        log_error "Failed to generate hex value for $var_name"
        return 1
    }
    
    echo "$value"
}

# Generate bcrypt hash (special case for authentication)
generate_bcrypt() {
    local size="$1"
    local var_name="$2"
    
    # Ensure we have openssl
    if ! command -v openssl >/dev/null 2>&1; then
        log_error "openssl is required for bcrypt generation"
        return 1
    fi
    
    # Generate a random password first
    local password
    password=$(openssl rand -base64 32 | tr -d "=+/\n" | cut -c1-16) || {
        log_error "Failed to generate password for bcrypt hash"
        return 1
    }
    
    # Generate bcrypt hash
    local auth_hash
    auth_hash=$(openssl passwd -apr1 "$password") || {
        log_error "Failed to generate bcrypt hash for $var_name"
        return 1
    }

    # Escape dollar signs for Docker Compose by doubling them
    local escaped_hash="${auth_hash//\$/\$\$}"

    # For Traefik auth format: username:hash
    local auth_string="admin:$escaped_hash"
    
    # Log the generated credentials securely
    log_info "Generated authentication credentials for $var_name"
    log_info "Username: admin"
    log_info "Password: $password"
    log_warn "Please save these credentials securely!"
    
    echo "$auth_string"
}

# Generate secure password
generate_password() {
    local size="$1"
    local var_name="$2"
    
    # Ensure we have openssl
    if ! command -v openssl >/dev/null 2>&1; then
        log_error "openssl is required for password generation"
        return 1
    fi
    
    # Generate alphanumeric password
    local value
    value=$(openssl rand -base64 "$((size * 3 / 4 + 1))" | tr -d "=+/\n" | cut -c1-"$size") || {
        log_error "Failed to generate password for $var_name"
        return 1
    }
    
    echo "$value"
}

# Generate default secure value (base64-like)
generate_default() {
    local size="$1"
    local var_name="$2"
    
    generate_base64 "$size" "$var_name"
}

# =============================================================================
# MAIN GENERATE HANDLER
# =============================================================================

# Main function to handle GENERATE directives
# Usage: handle_generate_directive var_name current_value param_type param_size is_optional description
handle_generate_directive() {
    local var_name="$1"
    local current_value="$2"
    local param_type="$3"
    local param_size="$4"
    local is_optional="$5"
    local description="$6"
    
    log_debug "Handling GENERATE for $var_name (type: '$param_type', size: '$param_size', optional: $is_optional)"
    
    # Set default size if not specified
    local size="${param_size:-24}"
    
    # Validate size is numeric
    if ! [[ "$size" =~ ^[0-9]+$ ]] || [[ "$size" -lt 1 ]] || [[ "$size" -gt 256 ]]; then
        log_warn "Invalid size '$size' for $var_name, using default size 24"
        size=24
    fi
    
    # For optional fields, check if we should generate them
    if [[ "$is_optional" == "true" ]]; then
        # In non-interactive mode with defaults, always generate optional secure values
        if [[ "${DOCKER_ENV_USE_DEFAULTS:-false}" == "true" ]]; then
            log_debug "Auto-generating optional secure value for $var_name (non-interactive mode)"
        else
            # Interactive mode - ask user
            local configure_msg="Generate secure value for $var_name?"
            [[ -n "$description" ]] && configure_msg="Generate $var_name ($description)?"

            if ! enhanced_confirm "$configure_msg" "true"; then
                log_debug "User chose to skip optional variable $var_name"
                echo ""
                return 0
            fi
        fi
    fi
    
    # Always generate for GENERATE directives (values in examples are just examples)
    log_debug "Generating new secure value for $var_name"
    
    # Generate value based on type
    local generated_value
    case "$param_type" in
        "b64"|"base64")
            generated_value=$(generate_base64 "$size" "$var_name")
            ;;
        "hex")
            generated_value=$(generate_hex "$size" "$var_name")
            ;;
        "bcrypt")
            generated_value=$(generate_bcrypt "$size" "$var_name")
            ;;
        "pw"|"password")
            generated_value=$(generate_password "$size" "$var_name")
            ;;
        ""|*)
            # Default generation for unknown or empty types
            generated_value=$(generate_default "$size" "$var_name")
            ;;
    esac
    
    if [[ -n "$generated_value" ]]; then
        log_info "Generated secure value for $var_name (type: ${param_type:-default}, size: $size)"
        echo "$generated_value"
    else
        log_error "Failed to generate value for $var_name"
        return 1
    fi
}

# =============================================================================
# VALIDATION HELPERS
# =============================================================================

# Validate GENERATE directive parameters
validate_generate_parameters() {
    local param_type="$1"
    local param_size="$2"
    local is_optional="$3"
    
    # Validate size parameter
    if [[ -n "$param_size" ]]; then
        if ! [[ "$param_size" =~ ^[0-9]+$ ]] || [[ "$param_size" -lt 1 ]] || [[ "$param_size" -gt 256 ]]; then
            log_warn "Invalid size parameter: $param_size (must be 1-256)"
            return 1
        fi
    fi
    
    # Validate known types
    case "$param_type" in
        ""|"b64"|"base64"|"hex"|"bcrypt"|"pw"|"password")
            return 0
            ;;
        *)
            log_warn "Unknown GENERATE type: $param_type, treating as default"
            return 0
            ;;
    esac
}

# Check if current value needs regeneration
needs_generate_update() {
    local current_value="$1"
    local is_optional="$2"

    # Always generate for GENERATE directives - these are meant to be auto-generated
    # The values in .example files are just examples, not actual secure values
    return 0
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Check if required tools are available
check_generation_requirements() {
    local missing_tools=()
    
    if ! command -v openssl >/dev/null 2>&1; then
        missing_tools+=("openssl")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log_error "Missing required tools for value generation: ${missing_tools[*]}"
        log_error "Please install the missing tools and try again"
        return 1
    fi
    
    return 0
}

# Export this module's functions
export -f generate_base64
export -f generate_hex
export -f generate_bcrypt
export -f generate_password
export -f generate_default
export -f handle_generate_directive
export -f validate_generate_parameters
export -f needs_generate_update
export -f check_generation_requirements
