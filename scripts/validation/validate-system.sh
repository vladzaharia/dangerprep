#!/bin/bash
# DangerPrep System Validation Script
# Unified validation for compose files, references, docker dependencies, and NFS mounts

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DOCKER_ROOT="$PROJECT_ROOT/docker"
ISSUES_FOUND=0

# Set default environment variables for testing
export INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"
export TZ="America/Los_Angeles"
export TRAEFIK_AUTH_USERS="admin:\$2y\$10\$example-hash"
export CF_API_EMAIL="test@example.com"
export CF_API_KEY="test-api-key"
export ACME_EMAIL="test@example.com"
export PLEX_TOKEN="test-plex-token"
export NAS_HOST="100.65.182.27"
export PLEX_SERVER="100.65.182.27:32400"

# Show help
show_help() {
    echo "DangerPrep System Validation Script"
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  compose      Validate Docker Compose files"
    echo "  references   Validate file references"
    echo "  docker       Validate Docker dependencies"
    echo "  nfs          Test NFS mounts"
    echo "  all          Run all validations (default)"
    echo "  help         Show this help message"
    echo
    echo "Examples:"
    echo "  $0 compose    # Validate only compose files"
    echo "  $0 all        # Run all validations"
}

# Validate Docker Compose files
validate_compose() {
    log "Validating Docker Compose files..."
    
    local compose_files=($(find "$DOCKER_ROOT" -name "compose.yml" -type f | sort))
    
    if [[ ${#compose_files[@]} -eq 0 ]]; then
        warning "No compose.yml files found in $DOCKER_ROOT"
        return 0
    fi
    
    for compose_file in "${compose_files[@]}"; do
        local service_name=$(basename "$(dirname "$compose_file")")
        log "Validating $service_name..."
        
        # Check syntax
        if docker compose -f "$compose_file" config >/dev/null 2>&1; then
            success "  Syntax valid"
        else
            error "  Syntax invalid"
            ((ISSUES_FOUND++))
        fi
        
        # Check for missing environment variables
        local missing_vars=$(docker compose -f "$compose_file" config 2>&1 | grep -o 'variable.*is not set' | wc -l)
        if [[ $missing_vars -gt 0 ]]; then
            warning "  $missing_vars missing environment variables"
            ((ISSUES_FOUND++))
        fi
    done
    
    success "Compose validation complete"
}

# Validate file references
validate_references() {
    log "Validating file references..."
    
    # Check justfile references
    if [[ -f "$PROJECT_ROOT/justfile" ]]; then
        log "Checking justfile references..."
        while IFS= read -r line; do
            if [[ "$line" =~ \./scripts/([^[:space:]]+) ]]; then
                local script_path="$PROJECT_ROOT/scripts/${BASH_REMATCH[1]}"
                if [[ ! -f "$script_path" ]]; then
                    error "  Missing script: $script_path"
                    ((ISSUES_FOUND++))
                fi
            fi
        done < "$PROJECT_ROOT/justfile"
    fi
    
    # Check compose file references
    local compose_files=($(find "$DOCKER_ROOT" -name "compose.yml" -type f))
    for compose_file in "${compose_files[@]}"; do
        local dir=$(dirname "$compose_file")
        
        # Check for referenced env files
        if grep -q "env_file:" "$compose_file"; then
            local env_files=($(grep -A 5 "env_file:" "$compose_file" | grep -E "^\s*-" | sed 's/^\s*-\s*//' | tr -d '"'))
            for env_file in "${env_files[@]}"; do
                local full_path="$dir/$env_file"
                if [[ ! -f "$full_path" ]]; then
                    error "  Missing env file: $full_path"
                    ((ISSUES_FOUND++))
                fi
            done
        fi
    done
    
    success "Reference validation complete"
}

# Validate Docker dependencies
validate_docker() {
    log "Validating Docker dependencies..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running"
        ((ISSUES_FOUND++))
        return 1
    fi
    
    # Check Docker networks
    local compose_files=($(find "$DOCKER_ROOT" -name "compose.yml" -type f))
    for compose_file in "${compose_files[@]}"; do
        if grep -q "external: true" "$compose_file"; then
            local networks=($(grep -B 2 "external: true" "$compose_file" | grep -E "^\s*[a-zA-Z]" | sed 's/://' | tr -d ' '))
            for network in "${networks[@]}"; do
                if ! docker network ls | grep -q "$network"; then
                    error "  Missing Docker network: $network"
                    ((ISSUES_FOUND++))
                fi
            done
        fi
    done
    
    success "Docker validation complete"
}

# Test NFS mounts
validate_nfs() {
    log "Testing NFS connectivity..."
    
    # Check if NFS host is reachable
    if ! ping -c 1 -W 2 "$NAS_HOST" >/dev/null 2>&1; then
        warning "NAS host $NAS_HOST is not reachable"
        return 0
    fi
    
    # Test NFS mount points
    local nfs_mounts=("/mnt/nas/media" "/mnt/nas/backups")
    for mount_point in "${nfs_mounts[@]}"; do
        if [[ -d "$mount_point" ]]; then
            if mountpoint -q "$mount_point"; then
                success "  $mount_point is mounted"
            else
                warning "  $mount_point exists but is not mounted"
            fi
        else
            warning "  $mount_point directory does not exist"
        fi
    done
    
    success "NFS validation complete"
}

# Run all validations
validate_all() {
    log "Running comprehensive system validation..."
    echo
    
    validate_compose
    echo
    
    validate_references
    echo
    
    validate_docker
    echo
    
    validate_nfs
    echo
    
    echo "=================================="
    log "System Validation Summary:"
    
    if [[ $ISSUES_FOUND -eq 0 ]]; then
        success "All validations passed!"
        exit 0
    else
        error "Found $ISSUES_FOUND validation issues"
        exit 1
    fi
}

# Main function
main() {
    case "${1:-all}" in
        compose)
            validate_compose
            ;;
        references)
            validate_references
            ;;
        docker)
            validate_docker
            ;;
        nfs)
            validate_nfs
            ;;
        all)
            validate_all
            ;;
        help|--help|-h)
            show_help
            exit 0
            ;;
        *)
            error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
