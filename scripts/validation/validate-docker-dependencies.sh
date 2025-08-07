#!/bin/bash
# Docker Compose Dependencies Validation Script
# Validates all Docker images, networks, volumes, and environment variables

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
ISSUES_FOUND=0

# Validate Docker images exist
validate_docker_images() {
    log "Validating Docker images..."

    local images_checked=0

    # Get all unique images from compose files
    local images=($(find "$PROJECT_ROOT/docker" -name "compose.yml" -type f -exec grep -h "image:" {} \; | sed 's/.*image:\s*//' | sed 's/[[:space:]]*$//' | sort -u))

    for image in "${images[@]}"; do
        if [[ -n "$image" && "$image" != "\${*" ]]; then
            ((images_checked++))
            echo "  Checking image: $image"

            # Check if image exists locally
            if docker image inspect "$image" >/dev/null 2>&1; then
                echo "    ✓ Available locally"
            else
                echo "    ℹ Not cached locally (will be pulled on startup)"
            fi
        fi
    done

    success "Validated $images_checked Docker images"
}

# Validate networks
validate_networks() {
    log "Validating Docker networks..."
    
    local networks_found=()
    local external_networks=()
    
    # Find all network references
    find "$PROJECT_ROOT/docker" -name "compose.yml" -type f | while read -r compose_file; do
        local relative_path="${compose_file#$PROJECT_ROOT/}"
        
        # Check for external networks
        if grep -q "external: true" "$compose_file"; then
            local network_name=$(grep -B5 "external: true" "$compose_file" | grep -E "^\s*[a-zA-Z]" | tail -1 | sed 's/://g' | sed 's/^[[:space:]]*//')
            if [[ -n "$network_name" ]]; then
                external_networks+=("$network_name")
            fi
        fi
        
        # Check for network definitions
        grep -A10 "^networks:" "$compose_file" 2>/dev/null | grep -E "^\s*[a-zA-Z]" | sed 's/://g' | sed 's/^[[:space:]]*//' | while read -r network; do
            if [[ -n "$network" && "$network" != "networks" ]]; then
                networks_found+=("$network")
            fi
        done
    done
    
    # Check if external networks exist
    for network in "${external_networks[@]}"; do
        if docker network ls | grep -q "$network"; then
            echo "  ✓ External network exists: $network"
        else
            warning "  External network not found: $network (will be created on startup)"
        fi
    done
    
    success "Network validation complete"
}

# Validate environment variables
validate_environment_variables() {
    log "Validating environment variables..."
    
    local env_issues=0
    
    find "$PROJECT_ROOT/docker" -name "compose.yml" -type f | while read -r compose_file; do
        local relative_path="${compose_file#$PROJECT_ROOT/}"
        local compose_dir="$(dirname "$compose_file")"
        
        echo "  Checking environment variables in $relative_path..."
        
        # Check if env_file is referenced
        if grep -q "env_file:" "$compose_file"; then
            local env_file="$compose_dir/compose.env"
            if [[ ! -f "$env_file" ]]; then
                error "    Referenced env file not found: compose.env"
                ((env_issues++))
            else
                echo "    ✓ Environment file exists: compose.env"
                
                # Check for undefined variables in compose file
                grep -E "\\\${[^}]+}" "$compose_file" | sed 's/.*\${//' | sed 's/}.*//' | sed 's/:-.*$//' | sort -u | while read -r var; do
                    if [[ -n "$var" ]]; then
                        if grep -q "^$var=" "$env_file" || [[ "$var" == "INSTALL_ROOT" ]]; then
                            echo "      ✓ Variable defined: $var"
                        else
                            warning "      Variable not defined in env file: $var"
                        fi
                    fi
                done
            fi
        fi
        
        # Check for hardcoded environment variables
        if grep -E "^\s*environment:" "$compose_file" >/dev/null; then
            echo "    ✓ Environment section found"
        fi
    done
    
    if [[ $env_issues -eq 0 ]]; then
        success "Environment variable validation complete"
    else
        warning "Found $env_issues environment variable issues"
    fi
}

# Validate volumes
validate_volumes() {
    log "Validating Docker volumes..."
    
    local volume_issues=0
    
    find "$PROJECT_ROOT/docker" -name "compose.yml" -type f | while read -r compose_file; do
        local relative_path="${compose_file#$PROJECT_ROOT/}"
        local compose_dir="$(dirname "$compose_file")"
        
        echo "  Checking volumes in $relative_path..."
        
        # Check volume mounts
        grep -E "^\s*-\s*" "$compose_file" | grep ":" | while read -r volume_line; do
            local volume=$(echo "$volume_line" | sed 's/.*- //' | sed 's/:.*$//')
            
            # Skip special volumes
            [[ "$volume" =~ ^/var/run/docker.sock ]] && continue
            [[ "$volume" =~ ^/proc ]] && continue
            [[ "$volume" =~ ^/sys ]] && continue
            
            # Check if it's a relative path that should exist
            if [[ "$volume" =~ ^\. ]]; then
                local full_path="$compose_dir/${volume#./}"
                if [[ ! -f "$full_path" && ! -d "$full_path" ]]; then
                    warning "    Volume source not found: $volume"
                    ((volume_issues++))
                else
                    echo "    ✓ Volume source exists: $volume"
                fi
            elif [[ "$volume" =~ ^\$\{INSTALL_ROOT\} ]]; then
                echo "    ✓ Volume uses INSTALL_ROOT variable: $volume"
            else
                echo "    ✓ Volume mount: $volume"
            fi
        done
    done
    
    if [[ $volume_issues -eq 0 ]]; then
        success "Volume validation complete"
    else
        warning "Found $volume_issues volume issues"
    fi
}

# Validate service dependencies
validate_service_dependencies() {
    log "Validating service dependencies..."
    
    find "$PROJECT_ROOT/docker" -name "compose.yml" -type f | while read -r compose_file; do
        local relative_path="${compose_file#$PROJECT_ROOT/}"
        
        echo "  Checking dependencies in $relative_path..."
        
        # Check for depends_on
        if grep -q "depends_on:" "$compose_file"; then
            grep -A10 "depends_on:" "$compose_file" | grep -E "^\s*-\s*" | sed 's/.*- //' | while read -r dep_service; do
                if [[ -n "$dep_service" ]]; then
                    # Check if the dependency service is defined in the same file
                    if grep -q "^[[:space:]]*$dep_service:" "$compose_file"; then
                        echo "    ✓ Dependency service found: $dep_service"
                    else
                        warning "    Dependency service not found in same file: $dep_service"
                    fi
                fi
            done
        fi
        
        # Check for external dependencies (like Traefik network)
        if grep -q "traefik" "$compose_file" && ! grep -q "image.*traefik" "$compose_file"; then
            echo "    ✓ Uses Traefik network (external dependency)"
        fi
    done
    
    success "Service dependency validation complete"
}

# Main validation function
main() {
    log "Starting Docker Compose dependencies validation..."
    echo
    
    validate_docker_images
    echo
    
    validate_networks
    echo
    
    validate_environment_variables
    echo
    
    validate_volumes
    echo
    
    validate_service_dependencies
    echo
    
    echo "=================================="
    log "Docker Dependencies Validation Summary:"
    
    if [[ $ISSUES_FOUND -eq 0 ]]; then
        success "All Docker dependencies are valid!"
        exit 0
    else
        error "Found $ISSUES_FOUND dependency issues"
        exit 1
    fi
}

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    error "Docker is not installed or not in PATH"
    exit 1
fi

# Run main function
main "$@"
