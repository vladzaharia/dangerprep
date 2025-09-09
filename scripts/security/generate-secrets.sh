#!/bin/bash
set -euo pipefail

# DangerPrep Secret Generation Utility
# Generates random passwords and secrets for all Docker services
# Usage: ./generate-secrets.sh [--force] [--service SERVICE_NAME]

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
SECRETS_DIR="$PROJECT_ROOT/secrets"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Help function
show_help() {
    cat << EOF
DangerPrep Secret Generation Utility

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --force             Regenerate existing secrets (overwrite)
    --service SERVICE   Generate secrets for specific service only
    --help             Show this help message

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
    all                Generate secrets for all services (default)

EXAMPLES:
    $0                          # Generate all missing secrets
    $0 --force                  # Regenerate all secrets
    $0 --service romm           # Generate only ROMM secrets
    $0 --service traefik --force # Regenerate Traefik secrets

EOF
}

# Parse command line arguments
FORCE_REGENERATE=false
TARGET_SERVICE="all"

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_REGENERATE=true
            shift
            ;;
        --service)
            TARGET_SERVICE="$2"
            shift 2
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

# Create secrets directory
create_secrets_dir() {
    log "Creating secrets directory structure..."
    mkdir -p "$SECRETS_DIR"/{romm,step-ca,portainer,arcane,traefik,watchtower,komga,jellyfin,docmost,onedev,shared}
    chmod 700 "$SECRETS_DIR"
    success "Secrets directory created: $SECRETS_DIR"
}

# Generate different types of secrets
generate_password() {
    local length=${1:-24}
    local charset=${2:-"A-Za-z0-9!@#$%^&*()_+-=[]{}|;:,.<>?"}
    openssl rand -base64 48 | tr -d "=+/" | cut -c1-${length}
}

generate_hex_key() {
    local length=${1:-32}
    openssl rand -hex $length
}

generate_base64_key() {
    local length=${1:-32}
    openssl rand -base64 $length | tr -d "=+/"
}

generate_api_token() {
    local length=${1:-64}
    openssl rand -base64 48 | tr -d "=+/" | cut -c1-${length}
}

generate_bcrypt_hash() {
    local username="$1"
    local password="$2"
    local hash
    hash=$(echo "$password" | htpasswd -nBi "$username" 2>/dev/null) || {
        # Fallback if htpasswd not available
        warning "htpasswd not available, using openssl for basic auth"
        hash="$username:$(openssl passwd -apr1 "$password")"
    }
    # Escape dollar signs for Docker Compose by doubling them
    echo "${hash//\$/\$\$}"
}

# Check if secret file exists and should be regenerated
should_generate_secret() {
    local secret_file="$1"
    if [[ ! -f "$secret_file" ]]; then
        return 0  # Generate if doesn't exist
    elif [[ "$FORCE_REGENERATE" == "true" ]]; then
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
    local romm_dir="$SECRETS_DIR/romm"
    
    # ROMM Auth Secret Key (32 bytes hex)
    local auth_key=$(generate_hex_key 32)
    write_secret "$romm_dir/auth_secret_key" "$auth_key" "ROMM auth secret key"
    
    # Database password
    local db_password=$(generate_password 24 "A-Za-z0-9")
    write_secret "$romm_dir/db_password" "$db_password" "ROMM database password"
    
    # Redis password
    local redis_password=$(generate_password 20 "A-Za-z0-9")
    write_secret "$romm_dir/redis_password" "$redis_password" "ROMM Redis password"
    
    success "ROMM secrets generated"
}

# Generate Step-CA secrets
generate_step_ca_secrets() {
    log "Generating Step-CA secrets..."
    local step_ca_dir="$SECRETS_DIR/step-ca"
    
    # CA Password (strong password for root CA)
    local ca_password=$(generate_password 32 "A-Za-z0-9!@#$%^&*")
    write_secret "$step_ca_dir/ca_password" "$ca_password" "Step-CA root password"
    
    success "Step-CA secrets generated"
}

# Generate Portainer secrets
generate_portainer_secrets() {
    log "Generating Portainer secrets..."
    local portainer_dir="$SECRETS_DIR/portainer"
    
    # Admin password (initial setup only)
    local admin_password=$(generate_password 20 "A-Za-z0-9!@#$%^&*")
    write_secret "$portainer_dir/admin_password" "$admin_password" "Portainer admin password"
    
    success "Portainer secrets generated"
}

# Generate Traefik secrets
generate_traefik_secrets() {
    log "Generating Traefik secrets..."
    local traefik_dir="$SECRETS_DIR/traefik"

    # Basic auth password and hash for dashboard access
    local auth_password=$(generate_password 16 "A-Za-z0-9!@#$%^&*")
    local auth_hash=$(generate_bcrypt_hash "admin" "$auth_password")

    write_secret "$traefik_dir/auth_password" "$auth_password" "Traefik auth password"
    write_secret "$traefik_dir/auth_users" "$auth_hash" "Traefik auth users hash"

    success "Traefik secrets generated (Step-CA only)"
}

# Generate Watchtower secrets
generate_watchtower_secrets() {
    log "Generating Watchtower secrets..."
    local watchtower_dir="$SECRETS_DIR/watchtower"
    
    # API token
    local api_token=$(generate_api_token 64)
    write_secret "$watchtower_dir/api_token" "$api_token" "Watchtower API token"
    
    # Email password (placeholder - user should replace with actual app password)
    local email_password=$(generate_password 16 "A-Za-z0-9")
    write_secret "$watchtower_dir/email_password" "$email_password" "Watchtower email password (placeholder)"
    
    # Gotify token (placeholder)
    local gotify_token=$(generate_api_token 32)
    write_secret "$watchtower_dir/gotify_token" "$gotify_token" "Watchtower Gotify token (placeholder)"
    
    success "Watchtower secrets generated"
}

# Generate Komga secrets
generate_komga_secrets() {
    log "Generating Komga secrets..."
    local komga_dir="$SECRETS_DIR/komga"
    
    # SSL Keystore password
    local keystore_password=$(generate_password 16 "A-Za-z0-9")
    write_secret "$komga_dir/keystore_password" "$keystore_password" "Komga SSL keystore password"
    
    success "Komga secrets generated"
}

# Generate Jellyfin secrets
generate_jellyfin_secrets() {
    log "Generating Jellyfin secrets..."
    local jellyfin_dir="$SECRETS_DIR/jellyfin"
    
    # Certificate password
    local cert_password=$(generate_password 16 "A-Za-z0-9")
    write_secret "$jellyfin_dir/certificate_password" "$cert_password" "Jellyfin certificate password"
    
    success "Jellyfin secrets generated"
}

# Generate Arcane secrets
generate_arcane_secrets() {
    log "Generating Arcane secrets..."
    local arcane_dir="$SECRETS_DIR/arcane"

    # Session secret (32 bytes base64)
    local session_secret=$(generate_base64_key 32)
    write_secret "$arcane_dir/session_secret" "$session_secret" "Arcane session secret"

    success "Arcane secrets generated"
}

# Generate Docmost secrets
generate_docmost_secrets() {
    log "Generating Docmost secrets..."
    local docmost_dir="$SECRETS_DIR/docmost"

    # App secret (32 bytes hex)
    local app_secret=$(generate_hex_key 32)
    write_secret "$docmost_dir/app_secret" "$app_secret" "Docmost app secret"

    # Database password
    local db_password=$(generate_password 24 "A-Za-z0-9")
    write_secret "$docmost_dir/db_password" "$db_password" "Docmost database password"

    success "Docmost secrets generated"
}

# Generate OneDev secrets
generate_onedev_secrets() {
    log "Generating OneDev secrets..."
    local onedev_dir="$SECRETS_DIR/onedev"

    # Database password
    local db_password=$(generate_password 24 "A-Za-z0-9")
    write_secret "$onedev_dir/db_password" "$db_password" "OneDev database password"

    success "OneDev secrets generated"
}

# Generate shared secrets
generate_shared_secrets() {
    log "Generating shared secrets..."
    local shared_dir="$SECRETS_DIR/shared"

    # MariaDB root password (if using external database)
    local mariadb_root_password=$(generate_password 24 "A-Za-z0-9")
    write_secret "$shared_dir/mariadb_root_password" "$mariadb_root_password" "MariaDB root password"

    # Redis AUTH password (if using external Redis)
    local redis_auth_password=$(generate_password 20 "A-Za-z0-9")
    write_secret "$shared_dir/redis_auth_password" "$redis_auth_password" "Redis AUTH password"

    success "Shared secrets generated"
}

# Main generation function
generate_secrets() {
    case "$TARGET_SERVICE" in
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
            error "Unknown service: $TARGET_SERVICE"
            show_help
            exit 1
            ;;
    esac
}

# Main execution
main() {
    log "DangerPrep Secret Generation Utility"
    log "Target service: $TARGET_SERVICE"
    log "Force regenerate: $FORCE_REGENERATE"
    
    create_secrets_dir
    generate_secrets
    
    success "Secret generation completed!"
    log "Secrets stored in: $SECRETS_DIR"
    log "Next steps:"
    log "  1. Review generated secrets"
    log "  2. Update Docker environment files"
    log "  3. Replace placeholder API keys with real ones"
}

# Run main function
main "$@"
