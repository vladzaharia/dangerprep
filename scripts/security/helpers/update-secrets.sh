#!/usr/bin/env bash
# DangerPrep Environment File Secret Updater
# Updates Docker compose.env files with generated secrets

# Modern shell script best practices

# Prevent multiple sourcing
if [[ "${SECURITY_HELPERS_UPDATE-SECRETS_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SECURITY_HELPERS_UPDATE-SECRETS_LOADED="true"

set -euo pipefail

# Script metadata


# Source shared utilities
# shellcheck source=../../shared/logging.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/logging.sh"
# shellcheck source=../../shared/errors.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/errors.sh"
# shellcheck source=../../shared/validation.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/validation.sh"
# shellcheck source=../../shared/banner.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/banner.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-update-env-secrets.log"
PROJECT_ROOT="$(dirname "$(dirname "$(dirname "$(realpath "${BASH_SOURCE[0]}")"")")"
readonly PROJECT_ROOT
SECRETS_DIR="${PROJECT_ROOT}/secrets"
readonly DOCKER_DIR="${PROJECT_ROOT}/docker"

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Environment secret update failed with exit code ${exit_code}"

    # Remove any temporary files
    find "${DOCKER_DIR}" -name "*.env.tmp" -delete 2>/dev/null || true

    error "Cleanup completed"
    exit "${exit_code}"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate required commands
    require_commands sed grep

    debug "Environment secret updater initialized"
    clear_error_context
}

# Help function
show_help() {
    cat << EOF
DangerPrep Environment File Secret Updater

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --service SERVICE   Update specific service only
    --dry-run          Show what would be updated without making changes
    --help             Show this help message

SERVICES:
    romm               ROMM game library manager
    step-ca            Step-CA certificate authority
    portainer          Portainer Docker management
    traefik            Traefik reverse proxy
    watchtower         Watchtower container updater
    komga              Komga comic/book server
    jellyfin           Jellyfin media server
    all                Update all services (default)

EOF
}

# Parse command line arguments
DRY_RUN=false
TARGET_SERVICE="all"

while [[ $# -gt 0 ]]; do
    case $1 in
        --service)
            TARGET_SERVICE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Read secret from file
read_secret() {
    local secret_file="$1"
    if [[ -f "$secret_file" ]]; then
        cat "$secret_file"
    else
        error "Secret file not found: $secret_file"
        return 1
    fi
}

# Update environment variable in file
update_env_var() {
    local env_file="$1"
    local var_name="$2"
    local var_value="$3"
    local description="$4"
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "[DRY RUN] Would update $var_name in $(basename "$env_file")"
        return 0
    fi
    
    # Create env file if it doesn't exist
    if [[ ! -f "$env_file" ]]; then
        touch "$env_file"
        chmod 600 "$env_file"
    fi
    
    # Update or add the variable
    if grep -q "^${var_name}=" "$env_file"; then
        # Variable exists, update it
        sed -i.bak "s|^${var_name}=.*|${var_name}=${var_value}|" "$env_file"
        rm -f "${env_file}.bak"
        success "Updated $description in $(basename "$env_file")"
    else
        # Variable doesn't exist, add it
        echo "${var_name}=${var_value}" >> "$env_file"
        success "Added $description to $(basename "$env_file")"
    fi
}

# Update ROMM environment file
update_romm_env() {
    log "Updating ROMM environment file..."
    local env_file="${DOCKER_DIR}/media/romm/compose.env"
    local secrets_dir="${SECRETS_DIR}/romm"
    
    # ROMM Auth Secret Key
    local auth_key
    auth_key=$(read_secret "$secrets_dir/auth_secret_key")
    update_env_var "$env_file" "ROMM_AUTH_SECRET_KEY" "$auth_key" "ROMM auth secret key"
    
    # Database password
    local db_password
    db_password=$(read_secret "$secrets_dir/db_password")
    update_env_var "$env_file" "DB_PASSWD" "$db_password" "database password"
    
    # Redis password
    local redis_password
    redis_password=$(read_secret "$secrets_dir/redis_password")
    update_env_var "$env_file" "REDIS_PASSWORD" "$redis_password" "Redis password"
    
    success "ROMM environment updated"
}

# Update Step-CA environment file
update_step_ca_env() {
    log "Updating Step-CA environment file..."
    local env_file="${DOCKER_DIR}/infrastructure/step-ca/compose.env"
    local secrets_dir="${SECRETS_DIR}/step-ca"
    
    # CA Password
    local ca_password
    ca_password=$(read_secret "$secrets_dir/ca_password")
    update_env_var "$env_file" "DOCKER_STEPCA_INIT_PASSWORD" "$ca_password" "Step-CA password"
    
    success "Step-CA environment updated"
}

# Update Portainer environment file
update_portainer_env() {
    log "Updating Portainer environment file..."
    local env_file="${DOCKER_DIR}/infrastructure/portainer/compose.env"
    local secrets_dir="${SECRETS_DIR}/portainer"
    
    # Admin password
    local admin_password
    admin_password=$(read_secret "$secrets_dir/admin_password")
    update_env_var "$env_file" "PORTAINER_ADMIN_PASSWORD" "$admin_password" "Portainer admin password"
    
    success "Portainer environment updated"
}

# Update Traefik environment file
update_traefik_env() {
    log "Updating Traefik environment file..."
    local env_file="${DOCKER_DIR}/infrastructure/traefik/compose.env"
    local secrets_dir="${SECRETS_DIR}/traefik"
    
    # Auth users hash
    local auth_users
    auth_users=$(read_secret "$secrets_dir/auth_users")
    update_env_var "$env_file" "TRAEFIK_AUTH_USERS" "$auth_users" "Traefik auth users"
    
    success "Traefik environment updated"
}

# Update Watchtower environment file
update_watchtower_env() {
    log "Updating Watchtower environment file..."
    local env_file="${DOCKER_DIR}/infrastructure/watchtower/compose.env"
    local secrets_dir="${SECRETS_DIR}/watchtower"
    
    # API token
    local api_token
    api_token=$(read_secret "$secrets_dir/api_token")
    update_env_var "$env_file" "WATCHTOWER_HTTP_API_TOKEN" "$api_token" "Watchtower API token"
    
    # Email password (placeholder)
    local email_password
    email_password=$(read_secret "$secrets_dir/email_password")
    update_env_var "$env_file" "WATCHTOWER_NOTIFICATION_EMAIL_SERVER_PASSWORD" "$email_password" "Watchtower email password"
    
    # Gotify token (placeholder)
    local gotify_token
    gotify_token=$(read_secret "$secrets_dir/gotify_token")
    update_env_var "$env_file" "WATCHTOWER_NOTIFICATION_GOTIFY_TOKEN" "$gotify_token" "Watchtower Gotify token"
    
    success "Watchtower environment updated"
}

# Update Komga environment file
update_komga_env() {
    log "Updating Komga environment file..."
    local env_file="${DOCKER_DIR}/media/komga/compose.env"
    local secrets_dir="${SECRETS_DIR}/komga"
    
    # SSL Keystore password
    local keystore_password
    keystore_password=$(read_secret "$secrets_dir/keystore_password")
    update_env_var "$env_file" "SERVER_SSL_KEYSTOREPASSWORD" "$keystore_password" "Komga keystore password"
    
    success "Komga environment updated"
}

# Update Jellyfin environment file
update_jellyfin_env() {
    log "Updating Jellyfin environment file..."
    local env_file="${DOCKER_DIR}/media/jellyfin/compose.env"
    local secrets_dir="${SECRETS_DIR}/jellyfin"
    
    # Certificate password
    local cert_password
    cert_password=$(read_secret "$secrets_dir/certificate_password")
    update_env_var "$env_file" "JELLYFIN_CertificatePassword" "$cert_password" "Jellyfin certificate password"
    
    success "Jellyfin environment updated"
}

# Update Arcane environment file
update_arcane_env() {
    log "Updating Arcane environment file..."
    local env_file="${DOCKER_DIR}/infrastructure/arcane/compose.env"
    local secrets_dir="${SECRETS_DIR}/arcane"

    # Session secret
    local session_secret
    session_secret=$(read_secret "$secrets_dir/session_secret")
    update_env_var "$env_file" "PUBLIC_SESSION_SECRET" "$session_secret" "Arcane session secret"

    success "Arcane environment updated"
}

# Update Docmost environment file
update_docmost_env() {
    log "Updating Docmost environment file..."
    local env_file="${DOCKER_DIR}/services/docmost/compose.env"
    local secrets_dir="${SECRETS_DIR}/docmost"

    # App secret
    local app_secret
    app_secret=$(read_secret "$secrets_dir/app_secret")
    update_env_var "$env_file" "APP_SECRET" "$app_secret" "Docmost app secret"

    # Database password
    local db_password
    db_password=$(read_secret "$secrets_dir/db_password")
    update_env_var "$env_file" "POSTGRES_PASSWORD" "$db_password" "Docmost database password"

    # Database URL with password
    local database_url="postgresql://docmost:${db_password}@postgres:5432/docmost?schema=public"
    update_env_var "$env_file" "DATABASE_URL" "$database_url" "Docmost database URL"

    success "Docmost environment updated"
}

# Update OneDev environment file
update_onedev_env() {
    log "Updating OneDev environment file..."
    local env_file="${DOCKER_DIR}/services/onedev/compose.env"
    local secrets_dir="${SECRETS_DIR}/onedev"

    # Database password
    local db_password
    db_password=$(read_secret "$secrets_dir/db_password")
    update_env_var "$env_file" "POSTGRES_PASSWORD" "$db_password" "OneDev database password"

    success "OneDev environment updated"
}

# Main update function
update_environments() {
    case "${TARGET_SERVICE}" in
        "romm")
            update_romm_env
            ;;
        "step-ca")
            update_step_ca_env
            ;;
        "portainer")
            update_portainer_env
            ;;
        "traefik")
            update_traefik_env
            ;;
        "watchtower")
            update_watchtower_env
            ;;
        "komga")
            update_komga_env
            ;;
        "jellyfin")
            update_jellyfin_env
            ;;
        "arcane")
            update_arcane_env
            ;;
        "docmost")
            update_docmost_env
            ;;
        "onedev")
            update_onedev_env
            ;;
        "all")
            update_romm_env
            update_step_ca_env
            update_portainer_env
            update_arcane_env
            update_traefik_env
            update_watchtower_env
            update_komga_env
            update_jellyfin_env
            update_docmost_env
            update_onedev_env
            ;;
        *)
            error "Unknown service: ${TARGET_SERVICE}"
            show_help
            exit 1
            ;;
    esac
}

# Verify secrets exist
verify_secrets() {
    log "Verifying secrets exist..."
    
    if [[ ! -d "${SECRETS_DIR}" ]]; then
        error "Secrets directory not found: ${SECRETS_DIR}"
        error "Run ./scripts/security/generate-secrets.sh first"
        exit 1
    fi
    
    success "Secrets directory found"
}

# Main execution
main() {
    # Initialize script
    init_script

    show_banner_with_title "Environment File Secret Updater" "security"
    echo

    log "Target service: ${TARGET_SERVICE}"
    log "Dry run: ${DRY_RUN}"
    
    verify_secrets
    update_environments
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        success "Dry run completed - no changes made"
    else
        success "Environment files updated with generated secrets!"
        log "Next steps:"
        log "  1. Review updated environment files"
        log "  2. Replace placeholder API keys with real ones"
        log "  3. Start Docker services"
    fi
}

# Run main function

# Export functions for use in other scripts
export -f cleanup_on_errornexport -f init_scriptnexport -f show_helpnexport -f read_secretnexport -f update_env_varnexport -f update_romm_envnexport -f update_step_ca_envnexport -f update_portainer_envnexport -f update_traefik_envnexport -f update_watchtower_envnexport -f update_komga_envnexport -f update_jellyfin_envnexport -f update_arcane_envnexport -f update_docmost_envnexport -f update_onedev_envnexport -f update_environmentsnexport -f verify_secretsn
# Run main function only if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
