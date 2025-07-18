#!/bin/bash
# Docker Compose Validation Script
# Tests all compose files for syntax and environment variable issues

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_ROOT="$PROJECT_ROOT/docker"

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

# Find all compose files
find_compose_files() {
    find "$DOCKER_ROOT" -name "compose.yml" -type f | sort
}

# Validate a single compose file
validate_compose_file() {
    local compose_file="$1"
    local compose_dir="$(dirname "$compose_file")"
    local service_name="$(basename "$compose_dir")"
    local category="$(basename "$(dirname "$compose_dir")")"
    
    log "Validating $category/$service_name..."
    
    # Change to compose directory
    cd "$compose_dir"
    
    # Check if compose file exists
    if [[ ! -f "compose.yml" ]]; then
        error "compose.yml not found in $compose_dir"
        return 1
    fi
    
    # Check if env file exists (if referenced)
    if grep -q "env_file:" compose.yml; then
        if [[ ! -f "compose.env" ]]; then
            error "compose.env referenced but not found in $compose_dir"
            return 1
        fi
    fi
    
    # Test compose config
    if docker compose config > /dev/null 2>&1; then
        success "$category/$service_name - Valid"
        return 0
    else
        error "$category/$service_name - Invalid"
        echo "Error details:"
        docker compose config 2>&1 | head -10
        return 1
    fi
}

# Main validation function
main() {
    log "Starting Docker Compose validation..."
    log "Using INSTALL_ROOT: $INSTALL_ROOT"
    
    local compose_files
    local total_files=0
    local valid_files=0
    local invalid_files=0
    
    # Get all compose files
    compose_files=($(find_compose_files))
    total_files=${#compose_files[@]}
    
    if [[ $total_files -eq 0 ]]; then
        warning "No compose.yml files found in $DOCKER_ROOT"
        exit 1
    fi
    
    log "Found $total_files compose files to validate"
    echo
    
    # Validate each file
    for compose_file in "${compose_files[@]}"; do
        if validate_compose_file "$compose_file"; then
            ((valid_files++))
        else
            ((invalid_files++))
        fi
        echo
    done
    
    # Summary
    echo "=================================="
    log "Validation Summary:"
    echo "  Total files: $total_files"
    echo "  Valid files: $valid_files"
    echo "  Invalid files: $invalid_files"
    
    if [[ $invalid_files -eq 0 ]]; then
        success "All compose files are valid!"
        exit 0
    else
        error "$invalid_files compose files have issues"
        exit 1
    fi
}

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    error "Docker is not installed or not in PATH"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    error "Docker Compose is not available"
    exit 1
fi

# Run main function
main "$@"
