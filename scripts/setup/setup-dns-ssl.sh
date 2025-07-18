#!/bin/bash

# DangerPrep DNS and SSL Setup Script
# Helps configure and validate DNS and SSL setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_ROOT="$PROJECT_ROOT/docker"
ENV_FILE="$DOCKER_ROOT/infrastructure/.env"

log() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        error "Docker Compose is not available"
        exit 1
    fi
    
    # Check htpasswd
    if ! command -v htpasswd &> /dev/null; then
        warning "htpasswd not found. Install with: sudo apt install apache2-utils"
    fi
    
    success "Prerequisites check passed"
}

# Setup environment file
setup_environment() {
    log "Setting up environment configuration..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f "$ENV_FILE.example" ]]; then
            cp "$ENV_FILE.example" "$ENV_FILE"
            log "Created .env file from example"
        else
            error "Environment example file not found"
            exit 1
        fi
    fi
    
    # Prompt for configuration
    echo
    log "Please configure the following values in $ENV_FILE:"
    echo
    echo "1. DOMAIN_NAME=yourdomain.com"
    echo "2. CF_API_EMAIL=your-email@example.com"
    echo "3. CF_API_KEY=your-cloudflare-api-key (or CF_DNS_API_TOKEN)"
    echo "4. ACME_EMAIL=your-email@example.com"
    echo "5. TRAEFIK_AUTH_USERS=admin:\$2y\$10\$hash"
    echo
    
    read -p "Press Enter when you've configured the .env file..."
}

# Generate Traefik auth hash
generate_auth_hash() {
    if command -v htpasswd &> /dev/null; then
        echo
        log "Generating Traefik authentication hash..."
        read -p "Enter username for Traefik dashboard [admin]: " username
        username=${username:-admin}
        
        read -s -p "Enter password for Traefik dashboard: " password
        echo
        
        if [[ -n "$password" ]]; then
            hash=$(htpasswd -nb "$username" "$password")
            echo
            success "Generated auth hash:"
            echo "TRAEFIK_AUTH_USERS=$hash"
            echo
            log "Add this to your .env file"
        fi
    else
        warning "htpasswd not available. Generate hash manually with:"
        echo "htpasswd -nb admin yourpassword"
    fi
}

# Validate environment configuration
validate_environment() {
    log "Validating environment configuration..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Environment file not found: $ENV_FILE"
        exit 1
    fi
    
    source "$ENV_FILE"
    
    # Check required variables
    local required_vars=("DOMAIN_NAME" "ACME_EMAIL")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            error "Required environment variable $var is not set"
            exit 1
        fi
    done
    
    # Check Cloudflare credentials
    if [[ -z "$CF_DNS_API_TOKEN" ]] && [[ -z "$CF_API_KEY" || -z "$CF_API_EMAIL" ]]; then
        error "Cloudflare credentials not configured. Set either CF_DNS_API_TOKEN or both CF_API_KEY and CF_API_EMAIL"
        exit 1
    fi
    
    success "Environment validation passed"
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    local dirs=(
        "/data/traefik"
        "/data/adguard/work"
        "/data/adguard/conf"
        "/data/local-dns"
    )
    
    for dir in "${dirs[@]}"; do
        sudo mkdir -p "$dir"
        sudo chown -R 1000:1000 "$dir"
    done
    
    success "Directories created"
}

# Deploy DNS infrastructure
deploy_dns() {
    log "Deploying DNS infrastructure..."

    cd "$DOCKER_ROOT/infrastructure/dns"
    docker compose up -d

    # Wait for services to start
    sleep 10

    success "DNS infrastructure deployed"
}

# Deploy Traefik
deploy_traefik() {
    log "Deploying Traefik..."

    cd "$DOCKER_ROOT/infrastructure/traefik"
    docker compose up -d

    # Wait for Traefik to start
    sleep 15

    success "Traefik deployed"
}

# Validate deployment
validate_deployment() {
    log "Validating deployment..."
    
    # Check if containers are running (using new service names)
    local containers=("traefik" "adguardhome" "coredns" "registrar")
    for container in "${containers[@]}"; do
        if docker ps --format "{{.Names}}" | grep -q "$container"; then
            success "$container is running"
        else
            error "$container is not running"
        fi
    done
    
    # Check Traefik dashboard
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 | grep -q "200\|401"; then
        success "Traefik dashboard is accessible"
    else
        warning "Traefik dashboard may not be accessible"
    fi
    
    # Check AdGuard Home
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200"; then
        success "AdGuard Home setup page is accessible"
    else
        warning "AdGuard Home may not be accessible"
    fi
}

# Show next steps
show_next_steps() {
    echo
    success "DNS and SSL setup completed!"
    echo
    log "Next steps:"
    echo "1. Configure AdGuard Home at http://your-server-ip:3000"
    echo "2. Set upstream DNS to 172.20.0.4:53 (CoreDNS)"
    echo "3. Configure your devices to use your-server-ip as DNS"
    echo "4. Deploy other services with: just start"
    echo "5. Access services at https://service.${DOMAIN_NAME}"
    echo
    log "Useful commands:"
    echo "- Check status: just status"
    echo "- View logs: just logs"
    echo "- Monitor health: just monitor"
}

# Main function
main() {
    case "${1:-setup}" in
        setup)
            check_root
            check_prerequisites
            setup_environment
            generate_auth_hash
            validate_environment
            create_directories
            deploy_dns
            deploy_traefik
            validate_deployment
            show_next_steps
            ;;
        validate)
            validate_environment
            validate_deployment
            ;;
        auth)
            generate_auth_hash
            ;;
        *)
            echo "Usage: $0 {setup|validate|auth}"
            echo
            echo "Commands:"
            echo "  setup    - Complete DNS and SSL setup"
            echo "  validate - Validate current deployment"
            echo "  auth     - Generate Traefik auth hash"
            exit 1
            ;;
    esac
}

main "$@"
