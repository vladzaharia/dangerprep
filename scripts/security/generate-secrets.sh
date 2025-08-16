#!/usr/bin/env bash
# DangerPrep Secret Generation Utility
#
# Purpose: Generates random passwords and secrets for all Docker services
# Usage: generate-secrets.sh [--force] [--service SERVICE_NAME]
# Dependencies: openssl, htpasswd (apache2-utils), chmod (coreutils), mkdir (coreutils)
# Author: DangerPrep Project
# Version: 1.0

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_NAME=""
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"
readonly SCRIPT_NAME

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

readonly SCRIPT_VERSION="1.0"
readonly SCRIPT_DESCRIPTION="Secret Generation Utility"

# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/error-handling.sh
source "${SCRIPT_DIR}/../shared/error-handling.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"

# Configuration variables
PROJECT_ROOT=""
PROJECT_ROOT="$(dirname "$(dirname "${SCRIPT_DIR}")")"
readonly PROJECT_ROOT

readonly SECRETS_DIR="${PROJECT_ROOT}/secrets"

# Help function
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

USAGE:
    ${SCRIPT_NAME} [OPTIONS]

OPTIONS:
    --force             Regenerate existing secrets (overwrite)
    --service SERVICE   Generate secrets for specific service only
    -h, --help          Show this help message

SERVICES:
    romm               ROMM game library manager
    step-ca            Step-CA certificate authority
    portainer          Portainer Docker management
    arcane             Arcane Docker management UI
    traefik            Traefik reverse proxy
    watchtower         Watchtower container updater
    komga              Komga comic/book server
    jellyfin           Jellyfin media server
    docmost            Docmost collaborative wiki
    onedev             OneDev Git server with CI/CD
    shared             Shared database and service secrets
    all                Generate secrets for all services (default)

EXAMPLES:
    $0                          # Generate all missing secrets
    $0 --force                  # Regenerate all secrets
    $0 --service romm           # Generate only ROMM secrets
    $0 --service traefik --force # Regenerate Traefik secrets

NOTES:
    - Secrets are stored in: ${SECRETS_DIR}
    - Existing secrets are preserved unless --force is used
    - Generated secrets have restrictive permissions (600)
    - Some services may require additional manual configuration
    - Do not run as root for security reasons

EXIT CODES:
    0   Success
    1   General error
    2   Invalid arguments

For more information, see the DangerPrep documentation.
EOF
}

# Global variables
FORCE_REGENERATE=false
TARGET_SERVICE="all"

# Valid services list
readonly VALID_SERVICES=(
    "romm" "step-ca" "portainer" "arcane" "traefik"
    "watchtower" "komga" "jellyfin" "docmost" "onedev" "shared" "all"
)

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "/var/log/dangerprep-generate-secrets.log"

    # Validate required commands
    require_commands openssl chmod mkdir

    # Validate directories
    validate_directory_exists "${PROJECT_ROOT}" "project root"

    debug "Secret generation script initialized"
    clear_error_context
}

# Validate service name
validate_service_name() {
    local service="$1"
    local valid_service=false

    for valid in "${VALID_SERVICES[@]}"; do
        if [[ "$service" == "$valid" ]]; then
            valid_service=true
            break
        fi
    done

    if [[ "$valid_service" != "true" ]]; then
        error "Invalid service name: $service"
        error "Valid services: ${VALID_SERVICES[*]}"
        return 1
    fi

    debug "Service name validated: $service"
    return 0
}

# Parse command line arguments
parse_arguments() {
    set_error_context "Argument parsing"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                FORCE_REGENERATE=true
                info "Force regeneration enabled"
                shift
                ;;
            --service)
                if [[ -z "${2:-}" ]]; then
                    error "Service name required after --service"
                    exit 2
                fi
                TARGET_SERVICE="$2"
                validate_service_name "${TARGET_SERVICE}"
                info "Target service: ${TARGET_SERVICE}"
                shift 2
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                error "Use '$0 --help' for usage information"
                exit 2
                ;;
        esac
    done

    debug "Arguments parsed successfully"
    clear_error_context
}

# Create secrets directory with proper validation
create_secrets_dir() {
    set_error_context "Creating secrets directory"

    info "Creating secrets directory structure..."

    # Validate parent directory is writable
    local parent_dir
    parent_dir="$(dirname "${SECRETS_DIR}")"
    validate_directory_writable "${parent_dir}" "parent directory"

    # Create main secrets directory
    safe_execute 1 0 mkdir -p "${SECRETS_DIR}"

    # Create service subdirectories
    local services=("romm" "step-ca" "portainer" "arcane" "traefik" "watchtower" "komga" "jellyfin" "docmost" "onedev" "shared")
    for service in "${services[@]}"; do
        safe_execute 1 0 mkdir -p "${SECRETS_DIR}/${service}"
        debug "Created directory: ${SECRETS_DIR}/${service}"
    done

    # Set restrictive permissions
    safe_execute 1 0 chmod 700 "${SECRETS_DIR}"
    for service in "${services[@]}"; do
        safe_execute 1 0 chmod 700 "${SECRETS_DIR}/${service}"
    done

    success "Secrets directory created: ${SECRETS_DIR}"
    clear_error_context
}

# Generate different types of secrets with validation
generate_password() {
    local length
    length=${1:-24}
    # Note: charset parameter removed as it's not used in current implementation

    # Validate length
    validate_numeric_range "$length" 8 128 "password length"

    # Generate password using openssl
    local password
    password=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-"${length}")

    # Validate generated password
    validate_not_empty "$password" "generated password"
    validate_string_length "$password" "$length" "$length" "generated password"

    echo "$password"
}

generate_hex_key() {
    local length
    length=${1:-32}

    # Validate length
    validate_numeric_range "$length" 8 128 "hex key length"

    # Generate hex key
    local hex_key
    hex_key=$(openssl rand -hex "$length")

    # Validate generated key
    validate_not_empty "$hex_key" "generated hex key"

    echo "$hex_key"
}

generate_base64_key() {
    local length
    length=${1:-32}

    # Validate length
    validate_numeric_range "$length" 8 128 "base64 key length"

    # Generate base64 key
    local base64_key
    base64_key=$(openssl rand -base64 "$length" | tr -d "=+/")

    # Validate generated key
    validate_not_empty "$base64_key" "generated base64 key"

    echo "$base64_key"
}

generate_api_token() {
    local length
    length=${1:-64}

    # Validate length
    validate_numeric_range "$length" 16 256 "API token length"

    # Generate API token
    local api_token
    api_token=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-"${length}")

    # Validate generated token
    validate_not_empty "$api_token" "generated API token"
    validate_string_length "$api_token" "$length" "$length" "generated API token"

    echo "$api_token"
}

generate_bcrypt_hash() {
    local username="$1"
    local password="$2"
    echo "$password" | htpasswd -nBi "$username" 2>/dev/null || {
        # Fallback if htpasswd not available
        warning "htpasswd not available, using openssl for basic auth"
        echo "$username:$(openssl passwd -apr1 "$password")"
    }
}

# Check if secret file exists and should be regenerated
should_generate_secret() {
    local secret_file="$1"
    if [[ ! -f "$secret_file" ]]; then
        return 0  # Generate if doesn't exist
    elif [[ "${FORCE_REGENERATE}" == "true" ]]; then
        return 0  # Generate if force flag is set
    else
        return 1  # Skip if exists and no force
    fi
}

# Write secret to file with proper permissions
write_secret() {
    local secret_file="$1"
    local secret_value="$2"
    local description="$3"
    
    if should_generate_secret "$secret_file"; then
        echo "$secret_value" > "$secret_file"
        chmod 600 "$secret_file"
        success "Generated $description: $(basename "$secret_file")"
    else
        log "Skipping $description (already exists): $(basename "$secret_file")"
    fi
}

# Generate ROMM secrets
generate_romm_secrets() {
    log "Generating ROMM secrets..."
    local romm_dir="${SECRETS_DIR}/romm"

    # ROMM Auth Secret Key (32 bytes hex)
    local auth_key
    auth_key=$(generate_hex_key 32)
    write_secret "$romm_dir/auth_secret_key" "$auth_key" "ROMM auth secret key"

    # Database password
    local db_password
    db_password=$(generate_password 24 "A-Za-z0-9")
    write_secret "$romm_dir/db_password" "$db_password" "ROMM database password"

    # Redis password
    local redis_password
    redis_password=$(generate_password 20 "A-Za-z0-9")
    write_secret "$romm_dir/redis_password" "$redis_password" "ROMM Redis password"

    success "ROMM secrets generated"
}

# Generate Step-CA secrets
generate_step_ca_secrets() {
    log "Generating Step-CA secrets..."
    local step_ca_dir="${SECRETS_DIR}/step-ca"
    
    # CA Password (strong password for root CA)
    local ca_password
    ca_password=$(generate_password 32 "A-Za-z0-9!@#$%^&*")
    write_secret "$step_ca_dir/ca_password" "$ca_password" "Step-CA root password"
    
    success "Step-CA secrets generated"
}

# Generate Portainer secrets
generate_portainer_secrets() {
    log "Generating Portainer secrets..."
    local portainer_dir="${SECRETS_DIR}/portainer"
    
    # Admin password (initial setup only)
    local admin_password
    admin_password=$(generate_password 20 "A-Za-z0-9!@#$%^&*")
    write_secret "$portainer_dir/admin_password" "$admin_password" "Portainer admin password"
    
    success "Portainer secrets generated"
}

# Generate Traefik secrets
generate_traefik_secrets() {
    log "Generating Traefik secrets..."
    local traefik_dir="${SECRETS_DIR}/traefik"

    # Basic auth password and hash for dashboard access
    local auth_password
    auth_password=$(generate_password 16 "A-Za-z0-9!@#$%^&*")
    local auth_hash
    auth_hash=$(generate_bcrypt_hash "admin" "$auth_password")

    write_secret "$traefik_dir/auth_password" "$auth_password" "Traefik auth password"
    write_secret "$traefik_dir/auth_users" "$auth_hash" "Traefik auth users hash"

    success "Traefik secrets generated (Step-CA only)"
}

# Generate Watchtower secrets
generate_watchtower_secrets() {
    log "Generating Watchtower secrets..."
    local watchtower_dir="${SECRETS_DIR}/watchtower"
    
    # API token
    local api_token
    api_token=$(generate_api_token 64)
    write_secret "$watchtower_dir/api_token" "$api_token" "Watchtower API token"
    
    # Email password (placeholder - user should replace with actual app password)
    local email_password
    email_password=$(generate_password 16 "A-Za-z0-9")
    write_secret "$watchtower_dir/email_password" "$email_password" "Watchtower email password (placeholder)"
    
    # Gotify token (placeholder)
    local gotify_token
    gotify_token=$(generate_api_token 32)
    write_secret "$watchtower_dir/gotify_token" "$gotify_token" "Watchtower Gotify token (placeholder)"
    
    success "Watchtower secrets generated"
}

# Generate Komga secrets
generate_komga_secrets() {
    log "Generating Komga secrets..."
    local komga_dir="${SECRETS_DIR}/komga"
    
    # SSL Keystore password
    local keystore_password
    keystore_password=$(generate_password 16 "A-Za-z0-9")
    write_secret "$komga_dir/keystore_password" "$keystore_password" "Komga SSL keystore password"
    
    success "Komga secrets generated"
}

# Generate Jellyfin secrets
generate_jellyfin_secrets() {
    log "Generating Jellyfin secrets..."
    local jellyfin_dir="${SECRETS_DIR}/jellyfin"
    
    # Certificate password
    local cert_password
    cert_password=$(generate_password 16 "A-Za-z0-9")
    write_secret "$jellyfin_dir/certificate_password" "$cert_password" "Jellyfin certificate password"
    
    success "Jellyfin secrets generated"
}

# Generate Arcane secrets
generate_arcane_secrets() {
    log "Generating Arcane secrets..."
    local arcane_dir="${SECRETS_DIR}/arcane"

    # Session secret (32 bytes base64)
    local session_secret
    session_secret=$(generate_base64_key 32)
    write_secret "$arcane_dir/session_secret" "$session_secret" "Arcane session secret"

    success "Arcane secrets generated"
}

# Generate Docmost secrets
generate_docmost_secrets() {
    log "Generating Docmost secrets..."
    local docmost_dir="${SECRETS_DIR}/docmost"

    # App secret (32 bytes hex)
    local app_secret
    app_secret=$(generate_hex_key 32)
    write_secret "$docmost_dir/app_secret" "$app_secret" "Docmost app secret"

    # Database password
    local db_password
    db_password=$(generate_password 24 "A-Za-z0-9")
    write_secret "$docmost_dir/db_password" "$db_password" "Docmost database password"

    success "Docmost secrets generated"
}

# Generate OneDev secrets
generate_onedev_secrets() {
    log "Generating OneDev secrets..."
    local onedev_dir="${SECRETS_DIR}/onedev"

    # Database password
    local db_password
    db_password=$(generate_password 24 "A-Za-z0-9")
    write_secret "$onedev_dir/db_password" "$db_password" "OneDev database password"

    success "OneDev secrets generated"
}

# Generate shared secrets
generate_shared_secrets() {
    log "Generating shared secrets..."
    local shared_dir="${SECRETS_DIR}/shared"

    # MariaDB root password (if using external database)
    local mariadb_root_password
    mariadb_root_password=$(generate_password 24 "A-Za-z0-9")
    write_secret "$shared_dir/mariadb_root_password" "$mariadb_root_password" "MariaDB root password"

    # Redis AUTH password (if using external Redis)
    local redis_auth_password
    redis_auth_password=$(generate_password 20 "A-Za-z0-9")
    write_secret "$shared_dir/redis_auth_password" "$redis_auth_password" "Redis AUTH password"

    success "Shared secrets generated"
}

# Main generation function
generate_secrets() {
    case "${TARGET_SERVICE}" in
        "romm")
            generate_romm_secrets
            ;;
        "step-ca")
            generate_step_ca_secrets
            ;;
        "portainer")
            generate_portainer_secrets
            ;;
        "traefik")
            generate_traefik_secrets
            ;;
        "watchtower")
            generate_watchtower_secrets
            ;;
        "komga")
            generate_komga_secrets
            ;;
        "jellyfin")
            generate_jellyfin_secrets
            ;;
        "arcane")
            generate_arcane_secrets
            ;;
        "docmost")
            generate_docmost_secrets
            ;;
        "onedev")
            generate_onedev_secrets
            ;;
        "all")
            generate_romm_secrets
            generate_step_ca_secrets
            generate_portainer_secrets
            generate_arcane_secrets
            generate_traefik_secrets
            generate_watchtower_secrets
            generate_komga_secrets
            generate_jellyfin_secrets
            generate_docmost_secrets
            generate_onedev_secrets
            generate_shared_secrets
            ;;
        *)
            error "Unknown service: ${TARGET_SERVICE}"
            show_help
            exit 1
            ;;
    esac
}

# Cleanup function
cleanup_script() {
    debug "Performing script cleanup"
    # No specific cleanup needed for secret generation
    debug "Script cleanup completed"
}

# Main execution
main() {
    # Register cleanup function
    register_cleanup_function cleanup_script

    # Initialize script
    init_script

    # Parse arguments
    parse_arguments "$@"

    # Show banner
    show_banner_with_title "${SCRIPT_DESCRIPTION}" "security"
    echo

    # Log operation details
    log_section "DangerPrep Secret Generation"
    info "Target service: ${TARGET_SERVICE}"
    info "Force regenerate: ${FORCE_REGENERATE}"
    info "Secrets directory: ${SECRETS_DIR}"

    # Create directory structure
    create_secrets_dir

    # Generate secrets
    generate_secrets

    # Show completion summary
    log_section "Secret Generation Complete"
    success "All secrets generated successfully!"
    info "Secrets stored in: ${SECRETS_DIR}"

    log_subsection "Next Steps"
    info "1. Review generated secrets for accuracy"
    info "2. Update Docker environment files with new secrets"
    info "3. Replace placeholder API keys with real ones where needed"
    info "4. Ensure proper file permissions are maintained (600)"

    success "Secret generation completed successfully!"
}

# Execute main function
main "$@"
