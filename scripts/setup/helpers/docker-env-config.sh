#!/bin/bash
# Docker Environment Configuration Helper
# Handles environment variable configuration for Docker services

# Source required utilities
DOCKER_ENV_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_ENV_PROJECT_ROOT="$(dirname "$(dirname "$(dirname "${DOCKER_ENV_SCRIPT_DIR}")")")"

# Source gum utilities for consistent user interaction
if [[ -f "$DOCKER_ENV_SCRIPT_DIR/../../shared/gum-utils.sh" ]]; then
    # shellcheck source=../../shared/gum-utils.sh
    source "$DOCKER_ENV_SCRIPT_DIR/../../shared/gum-utils.sh"
fi

# Source required environment parser modules
required_modules=(
    "env-parser.sh"
    "prompt-handler.sh"
    "generate-handler.sh"
    "env-processor.sh"
    "env-error-handler.sh"
)

# Check that all required modules exist
for module in "${required_modules[@]}"; do
    if [[ ! -f "$DOCKER_ENV_SCRIPT_DIR/$module" ]]; then
        echo "❌ ERROR: Required module not found: $module" >&2
        echo "Please ensure all environment parser modules are present in the helpers directory" >&2
        exit 1
    fi
done

# Source all modules
for module in "${required_modules[@]}"; do
    source "$DOCKER_ENV_SCRIPT_DIR/$module"
done

log_debug "Loaded environment parser modules"

# Supported directive types in environment files
# Format: # DIRECTIVE[parameters]: description (parameters are optional)
# PROMPT[type,OPTIONAL]: User input with optional type validation
#   - type: email (email validation), pw/password (hidden input), or omit for text input
#   - OPTIONAL: field can be skipped
# GENERATE[type,size,OPTIONAL]: Auto-generate secure value
#   - type: b64/base64, hex, bcrypt, pw/password, or omit for default generation
#   - size: length of generated value (default: 24)
#   - OPTIONAL: field can be skipped

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

    # Process Docker service environments
    log_info "Processing Docker service environments"
    if process_selected_services_environments; then
        log_success "Successfully configured environment"
        export DOCKER_ENV_CONFIGURED="true"
        return 0
    else
        log_error "Failed to configure Docker service environments"
        return 1
    fi
}

# Process selected services using the environment parser
process_selected_services_environments() {
    log_info "Processing selected Docker services"

    # Build list of environment files for selected services
    local -a env_files=()

    while IFS= read -r service_line; do
        if [[ -n "${service_line}" ]]; then
            # Extract service name from the selection (handle new format: service_name:Description)
            local service_name
            if [[ "${service_line}" == *":"* ]]; then
                # New format: extract service name before first colon
                service_name="${service_line%%:*}"
            else
                # Alternative format: remove description in parentheses
                service_name=$(echo "${service_line}" | sed 's/ (.*//' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
            fi

            # Convert to lowercase for consistency
            service_name="${service_name,,}"

            # Map any remaining display names to internal service names
            case "${service_name}" in
                "kiwix") service_name="kiwix-sync" ;;
                "adguard"|"adguard-home") service_name="dns" ;;
                # All other services should already have correct names
            esac

            # Find the environment file for this service
            local env_file
            env_file=$(find_service_env_file "${service_name}")
            if [[ -n "$env_file" && -f "$env_file" ]]; then
                env_files+=("$env_file")
                log_debug "Added environment file for ${service_name}: $env_file"
            else
                log_warn "No environment file found for service: ${service_name}"
            fi
        fi
    done <<< "${SELECTED_DOCKER_SERVICES}"

    # Process all found environment files using the new parser
    if [[ ${#env_files[@]} -gt 0 ]]; then
        log_info "Processing ${#env_files[@]} environment files"

        local processed=0
        local failed=0

        for env_file in "${env_files[@]}"; do
            local service_name
            service_name=$(basename "$(dirname "$env_file")")

            log_info "Processing environment for: $service_name"

            if process_environment_file "$env_file"; then
                ((processed++))
                log_success "✅ Successfully processed $service_name environment"
            else
                ((failed++))
                log_error "❌ Failed to process $service_name environment"
            fi
        done

        if [[ $failed -eq 0 ]]; then
            log_success "Successfully processed all $processed environment files"
            return 0
        else
            log_error "Failed to process $failed out of $((processed + failed)) environment files"
            return 1
        fi
    else
        log_warn "No environment files found for selected services"
        return 1
    fi
}

# Find environment file for a service
find_service_env_file() {
    local service_name="$1"

    # Determine service directory structure
    local service_dir
    case "${service_name}" in
        "traefik"|"arcane"|"raspap"|"step-ca"|"portainer"|"watchtower"|"dns"|"cdn")
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
        # Handle alternative service names
        "adguardhome"|"adguard")
            service_dir="${DOCKER_ENV_PROJECT_ROOT}/docker/infrastructure/dns"
            ;;
        "kiwix")
            service_dir="${DOCKER_ENV_PROJECT_ROOT}/docker/sync/kiwix-sync"
            ;;
        *)
            log_debug "Unknown service directory structure for: ${service_name}"
            return 1
            ;;
    esac

    local env_example="${service_dir}/compose.env.example"
    if [[ -f "$env_example" ]]; then
        echo "$env_example"
        return 0
    else
        log_debug "Environment example file not found: $env_example"
        return 1
    fi
}

# Collect global environment variables
collect_global_environment_variables() {
    log_info "Configuring global environment variables..."

    # Set timezone if not already configured
    if [[ -z "${TZ:-}" ]]; then
        export TZ="America/Los_Angeles"
        log_debug "Set default timezone: $TZ"
    fi

    # Set installation root if not already configured
    if [[ -z "${INSTALL_ROOT:-}" ]]; then
        export INSTALL_ROOT="${DOCKER_ENV_PROJECT_ROOT}"
        log_debug "Set installation root: $INSTALL_ROOT"
    fi

    log_debug "Global environment variables configured: TZ=${TZ}, INSTALL_ROOT=${INSTALL_ROOT}"
}

