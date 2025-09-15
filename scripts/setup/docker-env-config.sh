#!/bin/bash
# Docker Environment Configuration Helper
# Handles environment variable configuration for Docker services

# Source required utilities
DOCKER_ENV_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_ENV_PROJECT_ROOT="$(dirname "$(dirname "$(dirname "${DOCKER_ENV_SCRIPT_DIR}")")")"

# Source gum utilities for consistent user interaction
if [[ -f "$DOCKER_ENV_SCRIPT_DIR/../shared/gum-utils.sh" ]]; then
    # shellcheck source=../../shared/gum-utils.sh
    source "$DOCKER_ENV_SCRIPT_DIR/../shared/gum-utils.sh"
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

# Discover all available Docker services by scanning directory structure
discover_docker_services() {
    local docker_root="${DOCKER_ENV_PROJECT_ROOT}/docker"
    local -a discovered_services=()

    if [[ ! -d "$docker_root" ]]; then
        log_error "Docker directory not found: $docker_root"
        return 1
    fi

    # Scan each category directory
    for category_dir in "$docker_root"/*; do
        if [[ ! -d "$category_dir" ]]; then
            continue
        fi

        local category_name
        category_name=$(basename "$category_dir")

        # Skip non-service directories
        if [[ "$category_name" == "shared" || "$category_name" == "templates" ]]; then
            continue
        fi

        # Scan services in this category
        for service_dir in "$category_dir"/*; do
            if [[ ! -d "$service_dir" ]]; then
                continue
            fi

            local service_name
            service_name=$(basename "$service_dir")

            # Check if this is a valid service (has compose.yml and compose.env.example)
            if [[ -f "$service_dir/compose.yml" && -f "$service_dir/compose.env.example" ]]; then
                # Extract service names from compose.yml
                local compose_services
                compose_services=$(extract_compose_services "$service_dir/compose.yml")

                if [[ -n "$compose_services" ]]; then
                    discovered_services+=("${service_name}:${service_name} (${compose_services})")
                    log_debug "Discovered service: ${service_name} with services: ${compose_services}"
                fi
            fi
        done
    done

    # Output discovered services
    printf '%s\n' "${discovered_services[@]}"
}

# Extract service names from a Docker Compose file
extract_compose_services() {
    local compose_file="$1"

    if [[ ! -f "$compose_file" ]]; then
        return 1
    fi

    # Use awk to extract service names from the services: section
    local services
    services=$(awk '
        /^services:/ { in_services = 1; next }
        /^[a-zA-Z]/ && in_services == 1 { in_services = 0 }
        in_services == 1 && /^  [a-zA-Z0-9_-]+:/ {
            gsub(/^  /, "")
            gsub(/:.*$/, "")
            print $0
        }
    ' "$compose_file" | tr '\n' ',' | sed 's/,$//')

    echo "$services"
}

# Find service directory dynamically
find_service_directory() {
    local service_name="$1"
    local docker_root="${DOCKER_ENV_PROJECT_ROOT}/docker"

    # Search through all category directories
    for category_dir in "$docker_root"/*; do
        if [[ ! -d "$category_dir" ]]; then
            continue
        fi

        local potential_service_dir="$category_dir/$service_name"
        if [[ -d "$potential_service_dir" && -f "$potential_service_dir/compose.yml" ]]; then
            echo "$potential_service_dir"
            return 0
        fi
    done

    # Handle alternative service names
    case "$service_name" in
        "adguardhome"|"adguard")
            if [[ -d "$docker_root/infrastructure/dns" ]]; then
                echo "$docker_root/infrastructure/dns"
                return 0
            fi
            ;;
        "kiwix")
            if [[ -d "$docker_root/sync/kiwix-sync" ]]; then
                echo "$docker_root/sync/kiwix-sync"
                return 0
            fi
            ;;
    esac

    return 1
}

# Find environment file for a service
find_service_env_file() {
    local service_name="$1"

    # Find the service directory dynamically
    local service_dir
    service_dir=$(find_service_directory "$service_name")

    if [[ -z "$service_dir" ]]; then
        log_debug "Service directory not found for: ${service_name}"
        return 1
    fi

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
        # Check if we're in interactive mode
        if [[ "${NON_INTERACTIVE:-false}" != "true" ]]; then
            log_info "Select your timezone for Docker services:"

            # Common timezone options
            local timezone_options=(
                "America/New_York (Eastern Time)"
                "America/Chicago (Central Time)"
                "America/Denver (Mountain Time)"
                "America/Los_Angeles (Pacific Time)"
                "America/Phoenix (Arizona Time)"
                "America/Anchorage (Alaska Time)"
                "Pacific/Honolulu (Hawaii Time)"
                "UTC (Coordinated Universal Time)"
                "Europe/London (GMT/BST)"
                "Europe/Paris (CET/CEST)"
                "Asia/Tokyo (JST)"
                "Australia/Sydney (AEST/AEDT)"
                "Other (enter manually)"
            )

            local selected_timezone
            if command -v enhanced_choose >/dev/null 2>&1; then
                selected_timezone=$(enhanced_choose "Timezone Selection" "${timezone_options[@]}")
            else
                # Fallback if enhanced_choose is not available
                echo "Available timezones:"
                for i in "${!timezone_options[@]}"; do
                    echo "$((i+1)). ${timezone_options[i]}"
                done
                read -p "Select timezone (1-${#timezone_options[@]}): " selection
                if [[ "$selection" =~ ^[0-9]+$ ]] && [[ "$selection" -ge 1 ]] && [[ "$selection" -le "${#timezone_options[@]}" ]]; then
                    selected_timezone="${timezone_options[$((selection-1))]}"
                fi
            fi

            if [[ -n "$selected_timezone" ]]; then
                if [[ "$selected_timezone" == "Other"* ]]; then
                    # Manual entry
                    local manual_tz
                    if command -v enhanced_input >/dev/null 2>&1; then
                        manual_tz=$(enhanced_input "Timezone" "America/Los_Angeles" "Enter timezone (e.g., America/New_York)")
                    else
                        read -p "Enter timezone (e.g., America/New_York): " manual_tz
                    fi
                    if [[ -n "$manual_tz" ]]; then
                        export TZ="$manual_tz"
                    else
                        export TZ="America/Los_Angeles"
                    fi
                else
                    # Extract timezone from selection (before the parentheses)
                    export TZ="${selected_timezone%% (*}"
                fi
            else
                export TZ="America/Los_Angeles"
            fi
        else
            export TZ="America/Los_Angeles"
        fi
        log_info "Set timezone: $TZ"
    else
        log_debug "Using existing timezone: $TZ"
    fi

    # Set installation root if not already configured
    if [[ -z "${INSTALL_ROOT:-}" ]]; then
        export INSTALL_ROOT="${DOCKER_ENV_PROJECT_ROOT}"
        log_debug "Set installation root: $INSTALL_ROOT"
    fi

    log_debug "Global environment variables configured: TZ=${TZ}, INSTALL_ROOT=${INSTALL_ROOT}"
}

