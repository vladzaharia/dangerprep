#!/bin/bash
set -euo pipefail

# DangerPrep Secret Management Setup
# Sets up the complete secret management system for Docker services
# Usage: ./setup-secrets.sh [--force] [--dry-run]

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "${SCRIPT_DIR}")")"
SECRETS_DIR="${PROJECT_ROOT}/secrets"

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
DangerPrep Secret Management Setup

USAGE:
    $0 [OPTIONS]

OPTIONS:
    --force     Regenerate existing secrets (overwrite)
    --dry-run   Show what would be done without making changes
    --help      Show this help message

DESCRIPTION:
    This script sets up the complete secret management system for DangerPrep:
    1. Generates random secrets for all Docker services
    2. Updates environment files with generated secrets
    3. Sets proper file permissions for security
    4. Creates backup of existing configurations

EXAMPLES:
    $0                  # Set up secrets (skip existing)
    $0 --force          # Regenerate all secrets
    $0 --dry-run        # Preview changes without applying

EOF
}

# Parse command line arguments
FORCE_REGENERATE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_REGENERATE=true
            shift
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

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if running from project root or scripts directory
    if [[ ! -f "${PROJECT_ROOT}/docker/sync/README.md" ]]; then
        error "This script must be run from the DangerPrep project directory"
        exit 1
    fi
    
    # Check for required tools
    local missing_tools=()
    
    if ! command -v openssl >/dev/null 2>&1; then
        missing_tools+=("openssl")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        error "Missing required tools: ${missing_tools[*]}"
        error "Please install the missing tools and try again"
        exit 1
    fi
    
    success "Prerequisites check passed"
}

# Backup existing environment files
backup_env_files() {
    log "Backing up existing environment files..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "[DRY RUN] Would backup environment files"
        return 0
    fi
    
    local backup_dir
    backup_dir="${PROJECT_ROOT}/backups/env-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Find and backup all compose.env files
    find "${PROJECT_ROOT}/docker" -name "compose.env" -type f | while read -r env_file; do
        local relative_path
        relative_path=${env_file#"${PROJECT_ROOT}"/docker/}
        local backup_path="$backup_dir/$relative_path"
        mkdir -p "$(dirname "$backup_path")"
        cp "$env_file" "$backup_path"
        log "Backed up: $relative_path"
    done
    
    success "Environment files backed up to: $backup_dir"
}

# Generate all secrets
generate_all_secrets() {
    log "Generating secrets for all services..."
    
    local generate_args=()
    if [[ "${FORCE_REGENERATE}" == "true" ]]; then
        generate_args+=("--force")
    fi
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        if [[ ${#generate_args[@]} -gt 0 ]]; then
            log "[DRY RUN] Would run: ${SCRIPT_DIR}/generate-secrets.sh ${generate_args[*]}"
        else
            log "[DRY RUN] Would run: ${SCRIPT_DIR}/generate-secrets.sh"
        fi
        return 0
    fi

    if [[ ${#generate_args[@]} -gt 0 ]]; then
        "${SCRIPT_DIR}/generate-secrets.sh" "${generate_args[@]}"
    else
        "${SCRIPT_DIR}/generate-secrets.sh"
    fi
}

# Update environment files
update_all_env_files() {
    log "Updating environment files with generated secrets..."
    
    local update_args=()
    if [[ "${DRY_RUN}" == "true" ]]; then
        update_args+=("--dry-run")
    fi
    
    "${SCRIPT_DIR}/update-env-secrets.sh" "${update_args[@]}"
}

# Set secure permissions
set_secure_permissions() {
    log "Setting secure permissions on secrets and environment files..."
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        log "[DRY RUN] Would set secure permissions on secrets directory"
        log "[DRY RUN] Would set 600 permissions on environment files"
        return 0
    fi
    
    # Secure the secrets directory
    if [[ -d "${SECRETS_DIR}" ]]; then
        chmod -R 700 "${SECRETS_DIR}"
        find "${SECRETS_DIR}" -type f -exec chmod 600 {} \;
        success "Secured secrets directory: ${SECRETS_DIR}"
    fi
    
    # Secure environment files
    find "${PROJECT_ROOT}/docker" -name "compose.env" -type f -exec chmod 600 {} \;
    success "Secured environment files"
}

# Validate secret files
validate_secrets() {
    log "Validating generated secrets..."
    
    local validation_errors=0
    
    # Check if secrets directory exists
    if [[ ! -d "${SECRETS_DIR}" ]]; then
        error "Secrets directory not found: ${SECRETS_DIR}"
        ((validation_errors++))
        return $validation_errors
    fi
    
    # Define required secret files
    local required_secrets=(
        "shared/db_root_password"
        "shared/db_user_password"
        "shared/redis_password"
        "shared/jwt_secret"
    )
    
    # Check each required secret
    for secret in "${required_secrets[@]}"; do
        local secret_file="${SECRETS_DIR}/$secret"
        if [[ ! -f "$secret_file" ]]; then
            error "Missing secret file: $secret"
            ((validation_errors++))
        elif [[ ! -s "$secret_file" ]]; then
            error "Empty secret file: $secret"
            ((validation_errors++))
        else
            log "✓ Valid secret: $secret"
        fi
    done
    
    if [[ $validation_errors -eq 0 ]]; then
        success "All secrets validated successfully"
    else
        error "Found $validation_errors validation errors"
    fi
    
    return $validation_errors
}

# Show summary
show_summary() {
    log "Secret Management Setup Summary"
    echo
    log "Secrets directory: ${SECRETS_DIR}"
    log "Generated secrets for sync services:"
    log "  • Shared database credentials"
    log "  • Redis authentication"
    log "  • JWT signing keys"
    echo
    log "Next steps:"
    log "  1. Review generated secrets in ${SECRETS_DIR}"
    log "  2. Start sync services: just sync-deploy"
    log "  3. Verify services are working correctly"
    echo
    warning "Important security notes:"
    warning "  • Keep the secrets directory secure (700 permissions)"
    warning "  • Backup secrets before making changes"
    warning "  • Never commit secrets to version control"
    warning "  • Rotate secrets periodically for enhanced security"
}

# Main execution
main() {
    log "DangerPrep Secret Management Setup"
    log "Force regenerate: ${FORCE_REGENERATE}"
    log "Dry run: ${DRY_RUN}"
    echo
    
    check_prerequisites
    backup_env_files
    generate_all_secrets
    update_all_env_files
    set_secure_permissions
    
    if [[ "${DRY_RUN}" != "true" ]]; then
        validate_secrets
    fi
    
    show_summary
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        success "Dry run completed - no changes made"
    else
        success "Secret management setup completed successfully!"
    fi
}

# Run main function
main "$@"
