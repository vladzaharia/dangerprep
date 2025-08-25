#!/bin/bash
# Docker Environment Configuration Helper
# Dynamically parses environment files for configuration directives

# Source required utilities
DOCKER_ENV_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_ENV_PROJECT_ROOT="$(dirname "$(dirname "$(dirname "${DOCKER_ENV_SCRIPT_DIR}")")")"

# Source gum utilities for consistent user interaction
if [[ -f "$DOCKER_ENV_SCRIPT_DIR/../../shared/gum-utils.sh" ]]; then
    # shellcheck source=../../shared/gum-utils.sh
    source "$DOCKER_ENV_SCRIPT_DIR/../../shared/gum-utils.sh"
fi

# Supported directive types in environment files
# Format: # DIRECTIVE: description
# PROMPT: Regular text input
# PASSWORD: Hidden password input
# EMAIL: Email input with validation
# GENERATE: Auto-generate secure value
# OPTIONAL: Optional field, can be skipped
# REQUIRED: Must be provided (same as PROMPT)

# Main function to collect Docker environment configuration
collect_docker_environment_configuration() {
    # Check if Docker environment configuration is already complete
    if [[ -n "${DOCKER_ENV_CONFIGURED:-}" ]] && [[ "${DOCKER_ENV_CONFIGURED}" == "true" ]]; then
        log_debug "Docker environment configuration already completed"
        return 0
    fi

    # Check if any Docker services are selected
    if [[ -z "${SELECTED_DOCKER_SERVICES:-}" ]]; then
        log_debug "No Docker services selected, skipping environment configuration"
        return 0
    fi

    echo
    enhanced_section "Docker Environment Configuration" "Configuring environment variables for selected Docker services" "🔧"

    # Collect global environment variables first
    collect_global_environment_variables

    # Process each selected Docker service
    local services_configured=0
    local services_failed=0

    while IFS= read -r service_line; do
        if [[ -n "${service_line}" ]]; then
            # Extract service name from the selection (remove description)
            local service_name
            service_name=$(echo "${service_line}" | sed 's/ (.*//' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')

            # Map display names to internal service names
            case "${service_name}" in
                "traefik") service_name="traefik" ;;
                "arcane") service_name="arcane" ;;
                "jellyfin") service_name="jellyfin" ;;
                "komga") service_name="komga" ;;
                "kiwix") service_name="kiwix-sync" ;;
                "raspap") service_name="raspap" ;;
                "step-ca") service_name="step-ca" ;;
                "adguard") service_name="adguard" ;;
                "tailscale") service_name="tailscale" ;;
                "romm") service_name="romm" ;;
                "docmost") service_name="docmost" ;;
                "onedev") service_name="onedev" ;;
                "portainer") service_name="portainer" ;;
                "watchtower") service_name="watchtower" ;;
            esac

            log_info "Configuring environment for: ${service_name}"

            if configure_service_environment "${service_name}"; then
                ((services_configured++))
                enhanced_status_indicator "success" "Configured ${service_name} environment"
            else
                ((services_failed++))
                enhanced_status_indicator "warning" "Failed to configure ${service_name} environment (will use defaults)"
            fi
        fi
    done <<< "${SELECTED_DOCKER_SERVICES}"

    # Summary
    if [[ ${services_configured} -gt 0 ]]; then
        log_success "Successfully configured environment for ${services_configured} Docker services"
    fi

    if [[ ${services_failed} -gt 0 ]]; then
        log_warn "${services_failed} services will use default configuration"
    fi

    # Mark configuration as complete
    export DOCKER_ENV_CONFIGURED="true"

    return 0
}

# Collect global environment variables
collect_global_environment_variables() {
    log_info "Configuring global environment variables..."

    # Set default timezone if not already set
    if [[ -z "${TZ:-}" ]]; then
        local default_tz="America/Los_Angeles"
        TZ=$(enhanced_input "Timezone" "${default_tz}" "Enter timezone (e.g., America/Los_Angeles, Europe/London)")
        export TZ
    fi

    # INSTALL_ROOT should already be set as readonly, just ensure it's exported
    if [[ -n "${INSTALL_ROOT:-}" ]]; then
        export INSTALL_ROOT
    else
        log_error "INSTALL_ROOT not set - this should be set by the main setup script"
        return 1
    fi

    log_debug "Global environment variables configured: TZ=${TZ}, INSTALL_ROOT=${INSTALL_ROOT}"
}

# Configure environment for a specific service
configure_service_environment() {
    local service_name="$1"

    # Determine service directory structure
    local service_dir
    case "${service_name}" in
        "traefik"|"arcane"|"raspap"|"step-ca"|"portainer"|"watchtower")
            service_dir="${DOCKER_ENV_PROJECT_ROOT}/docker/infrastructure/${service_name}"
            ;;
        "jellyfin"|"komga"|"romm")
            service_dir="${DOCKER_ENV_PROJECT_ROOT}/docker/media/${service_name}"
            ;;
        "docmost"|"onedev")
            service_dir="${DOCKER_ENV_PROJECT_ROOT}/docker/services/${service_name}"
            ;;
        "kiwix-sync"|"nfs-sync"|"offline-sync")
            service_dir="${DOCKER_ENV_PROJECT_ROOT}/docker/sync/${service_name}"
            ;;
        *)
            log_warn "Unknown service directory structure for: ${service_name}"
            return 1
            ;;
    esac

    local env_file="${service_dir}/compose.env"
    local env_example="${service_dir}/compose.env.example"

    # Check if service directory exists
    if [[ ! -d "${service_dir}" ]]; then
        log_warn "Service directory not found: ${service_dir}"
        return 1
    fi

    # Check if environment example file exists
    if [[ ! -f "${env_example}" ]]; then
        log_debug "No environment example file found for ${service_name}, skipping"
        return 0
    fi

    # Create env file from example if it doesn't exist
    if [[ ! -f "${env_file}" ]]; then
        log_info "Creating environment file for ${service_name}..."
        cp "${env_example}" "${env_file}"
        chmod 600 "${env_file}"  # Secure permissions for env files
    fi

    # Parse environment file for directive comments and process them
    parse_and_process_env_directives "${env_example}" "${env_file}" "${service_name}"

    return 0
}

# Parse environment file for directive comments and process them
parse_and_process_env_directives() {
    local env_example="$1"
    local env_file="$2"
    local service_name="$3"

    local line_num=0
    local pending_directive=""
    local pending_description=""
    local variables_processed=0

    while IFS= read -r line; do
        ((line_num++))

        # Ensure variables are clean at the start of each iteration
        # This prevents any potential contamination from previous iterations
        if [[ -z "${pending_directive:-}" ]]; then
            pending_description=""
        fi

        # Check for directive comments
        if [[ "${line}" =~ ^#[[:space:]]*(PROMPT|PASSWORD|EMAIL|GENERATE|OPTIONAL|REQUIRED):[[:space:]]*(.*)$ ]]; then
            pending_directive="${BASH_REMATCH[1]}"
            # Capture description with explicit string isolation to prevent variable expansion
            pending_description="${BASH_REMATCH[2]}"

            # Immediately isolate the description to prevent any potential contamination
            # Use printf to ensure we get exactly what was captured, no more, no less
            pending_description="$(printf '%s' "${pending_description}")"

            # Debug: Log the raw captured description
            log_debug "Raw captured description: '${pending_description}'"
            log_debug "Raw description length: ${#pending_description}"

            # Clean up the description - remove any problematic characters and ensure it's a single line
            pending_description="${pending_description//[$'\n\r\t']/ }"  # Replace newlines/tabs with spaces
            pending_description="${pending_description//  / }"           # Replace double spaces with single
            pending_description="${pending_description# }"               # Remove leading space
            pending_description="${pending_description% }"               # Remove trailing space

            # Truncate if too long to prevent issues
            if [[ ${#pending_description} -gt 100 ]]; then
                pending_description="${pending_description:0:97}..."
            fi

            # Final isolation to ensure no contamination
            pending_description="$(printf '%s' "${pending_description}")"

            log_debug "Found directive comment: ${pending_directive} - '${pending_description}'"
            log_debug "Cleaned description length: ${#pending_description}"
            continue
        fi

        # Check for variable definitions after directive comments
        if [[ -n "${pending_directive}" ]] && [[ "${line}" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
            local var_name="${BASH_REMATCH[1]}"
            local var_value="${BASH_REMATCH[2]}"

            log_debug "Processing variable ${var_name} with directive ${pending_directive}"
            log_debug "Description: '${pending_description}'"
            log_debug "Current value: '${var_value}'"

            # Create a local copy of the description to prevent contamination
            local local_description
            local_description="$(printf '%s' "${pending_description}")"

            if process_env_directive "${env_file}" "${var_name}" "${pending_directive}" "${local_description}"; then
                ((variables_processed++))
            fi

            # Aggressively clear pending directive and description
            pending_directive=""
            pending_description=""
            unset local_description
        fi

        # Clear pending directive if we hit a non-comment, non-variable line
        if [[ "${line}" =~ ^[^#] ]] && [[ ! "${line}" =~ ^[A-Z_][A-Z0-9_]*= ]]; then
            pending_directive=""
            pending_description=""
        fi

    done < "${env_example}"

    if [[ ${variables_processed} -gt 0 ]]; then
        log_info "Processed ${variables_processed} environment variables for ${service_name}"
    else
        log_debug "No directive-based environment variables found for ${service_name}"
    fi

    return 0
}

# Process a single environment directive
process_env_directive() {
    local env_file="$1"
    local var_name="$2"
    local directive="$3"
    local description="$4"

    # For resumable setup: check if variable was already configured by user in a previous run
    # We detect this by checking if the variable exists in the env file AND has a different value
    # than what's in the example file (indicating user input was already collected)
    local current_value=""
    local example_value=""

    if grep -q "^${var_name}=" "${env_file}"; then
        current_value=$(grep "^${var_name}=" "${env_file}" | cut -d'=' -f2- || true)
    fi

    # Get the value from the example file to compare
    local env_example="${env_file%.env}.env.example"
    if [[ -f "${env_example}" ]] && grep -q "^${var_name}=" "${env_example}"; then
        example_value=$(grep "^${var_name}=" "${env_example}" | cut -d'=' -f2- || true)
    fi

    # Skip if already configured (current value exists and differs from example)
    if [[ -n "${current_value}" ]] && [[ "${current_value}" != "${example_value}" ]]; then
        log_debug "Variable ${var_name} already configured with user value, skipping"
        return 0
    fi

    local new_value=""

    # Sanitize description to prevent shell injection or parsing issues
    # Use printf to ensure we get exactly the input string with no expansion
    local safe_description
    safe_description="$(printf '%s' "${description}")"

    # Debug: Log the description before and after sanitization
    log_debug "Original description for ${var_name}: '${description}'"
    log_debug "Original description length: ${#description}"
    log_debug "Original description hex dump:"
    printf '%s' "${description}" | hexdump -C | head -3 | while read -r line; do
        log_debug "  ${line}"
    done

    # Remove any potentially problematic characters
    safe_description="${safe_description//[\$\`\\\"\']/}"
    # Ensure it's not empty
    if [[ -z "${safe_description// }" ]]; then
        safe_description="Enter value for ${var_name}"
    fi

    # Final isolation to prevent any contamination
    safe_description="$(printf '%s' "${safe_description}")"

    log_debug "Sanitized description for ${var_name}: '${safe_description}'"
    log_debug "Sanitized description length: ${#safe_description}"

    case "${directive}" in
        "PROMPT"|"REQUIRED")
            log_debug "About to call enhanced_input with: '${safe_description}'"
            new_value=$(enhanced_input "${safe_description}" "" "Enter value for ${var_name}")
            ;;
        "PASSWORD")
            new_value=$(enhanced_password "${safe_description}" "Enter password for ${var_name}")
            ;;
        "EMAIL")
            while true; do
                new_value=$(enhanced_input "${safe_description}" "" "Enter valid email address")
                if [[ "${new_value}" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
                    break
                else
                    log_warn "Please enter a valid email address"
                fi
            done
            ;;
        "GENERATE")
            new_value=$(generate_secure_value "${var_name}")
            log_info "Auto-generated secure value for ${var_name}"
            ;;
        "OPTIONAL")
            if enhanced_confirm "Configure ${var_name}?" "false"; then
                new_value=$(enhanced_input "${safe_description}" "" "Enter value for ${var_name}")
            else
                log_debug "Skipping optional variable ${var_name}"
                return 0
            fi
            ;;
        *)
            log_warn "Unknown directive: ${directive} for variable ${var_name}"
            return 1
            ;;
    esac

    # Validate required variables
    if [[ "${directive}" == "REQUIRED" || "${directive}" == "PROMPT" ]] && [[ -z "${new_value}" ]]; then
        log_error "Required variable ${var_name} cannot be empty"
        return 1
    fi

    # Update environment file
    if [[ -n "${new_value}" ]]; then
        update_env_file_variable "${env_file}" "${var_name}" "${new_value}"

        # Export critical variables to shell environment for Docker build args
        export_critical_variables "${var_name}" "${new_value}"
    fi

    return 0
}

# Generate secure values for auto-generated variables
generate_secure_value() {
    local var_name="$1"

    case "${var_name}" in
        *"PASSWORD"*|*"SECRET"*|*"KEY"*)
            # Generate secure password/key
            openssl rand -base64 32 | tr -d "=+/" | cut -c1-24 || {
                log_error "Failed to generate secure password for ${var_name}"
                return 1
            }
            ;;
        "TRAEFIK_AUTH_USERS")
            # Generate htpasswd format for admin user
            local admin_password
            admin_password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-16 || {
                log_error "Failed to generate admin password"
                return 1
            })
            local auth_hash
            auth_hash=$(openssl passwd -apr1 "${admin_password}" || {
                log_error "Failed to generate password hash"
                return 1
            })
            echo "admin:${auth_hash}"
            log_info "Generated Traefik admin credentials - Username: admin, Password: ${admin_password}"
            ;;
        *)
            # Default secure random string
            openssl rand -base64 24 | tr -d "=+/" || {
                log_error "Failed to generate secure value for ${var_name}"
                return 1
            }
            ;;
    esac
}

# Update variable in environment file
update_env_file_variable() {
    local env_file="$1"
    local var_name="$2"
    local var_value="$3"

    # Escape special characters in value for sed
    local escaped_value
    escaped_value=$(printf '%s\n' "${var_value}" | sed 's/[[\.*^$()+?{|]/\\&/g')

    if grep -q "^${var_name}=" "${env_file}"; then
        # Variable exists, update it
        sed -i.bak "s|^${var_name}=.*|${var_name}=${escaped_value}|" "${env_file}"
        rm -f "${env_file}.bak"
    else
        # Variable doesn't exist, add it
        echo "${var_name}=${var_value}" >> "${env_file}"
    fi

    log_debug "Updated ${var_name} in $(basename "${env_file}")"
}

# Export critical variables to shell environment for Docker build args
export_critical_variables() {
    local var_name="$1"
    local var_value="$2"

    # List of variables that need to be exported to shell environment
    # These are typically used in Docker build args or compose interpolation
    case "${var_name}" in
        "GITHUB_USERNAME"|"GITHUB_TOKEN")
            # RaspAP requires these for Docker build
            export "${var_name}=${var_value}"
            log_debug "Exported ${var_name} to shell environment for Docker build"
            ;;
        "ACME_EMAIL")
            # Traefik may need this for ACME configuration
            export "${var_name}=${var_value}"
            log_debug "Exported ${var_name} to shell environment"
            ;;
        "INSTALL_ROOT")
            # Many services need this path - but it may be readonly from main script
            if [[ -n "${INSTALL_ROOT:-}" ]]; then
                # INSTALL_ROOT is already set (likely readonly), just ensure it's exported
                export INSTALL_ROOT
                log_debug "Exported existing ${var_name} to shell environment"
            else
                # INSTALL_ROOT not set, safe to export with new value
                export "${var_name}=${var_value}"
                log_debug "Exported ${var_name} to shell environment"
            fi
            ;;
        *)
            # Most variables don't need shell export, only env file
            log_debug "Variable ${var_name} set in env file only"
            ;;
    esac
}

# Load and export environment variables from a compose.env file
# Usage: load_and_export_env_file "/path/to/compose.env"
load_and_export_env_file() {
    local env_file="$1"

    if [[ ! -f "${env_file}" ]]; then
        log_debug "Environment file not found: ${env_file}"
        return 1
    fi

    log_debug "Loading environment variables from: $(basename "${env_file}")"

    # Read and export variables from env file
    while IFS= read -r line; do
        # Skip comments and empty lines
        if [[ "${line}" =~ ^[[:space:]]*# ]] || [[ -z "${line// }" ]]; then
            continue
        fi

        # Process variable assignments
        if [[ "${line}" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
            local var_name="${BASH_REMATCH[1]}"
            local var_value="${BASH_REMATCH[2]}"

            # Only export critical variables to avoid polluting environment
            case "${var_name}" in
                "GITHUB_USERNAME"|"GITHUB_TOKEN"|"ACME_EMAIL")
                    export "${var_name}=${var_value}"
                    log_debug "Exported ${var_name} from env file"
                    ;;
                "INSTALL_ROOT")
                    # INSTALL_ROOT may be readonly from main script
                    if [[ -n "${INSTALL_ROOT:-}" ]]; then
                        export INSTALL_ROOT
                        log_debug "Exported existing ${var_name} from env file"
                    else
                        export "${var_name}=${var_value}"
                        log_debug "Exported ${var_name} from env file"
                    fi
                    ;;
                *)
                    # Most variables don't need shell export
                    log_debug "Variable ${var_name} not exported to shell environment"
                    ;;
            esac
        fi
    done < "${env_file}"

    return 0
}
