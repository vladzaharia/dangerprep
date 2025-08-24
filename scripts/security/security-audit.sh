#!/bin/bash
# Security Audit Script for DangerPrep
# Checks for security issues in configuration files

set -e

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

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

# Check for sensitive data in environment files
check_sensitive_data() {
    log "Checking for sensitive data in environment files..."
    
    local issues=0
    local env_files=($(find "$PROJECT_ROOT/docker" -name "compose.env" -type f))
    
    for env_file in "${env_files[@]}"; do
        local relative_path="${env_file#$PROJECT_ROOT/}"
        echo "  Checking $relative_path..."
        
        # Check for default/example passwords
        if grep -q "password\|admin\|secret.*=.*admin\|secret.*=.*password\|secret.*=.*123" "$env_file" 2>/dev/null; then
            warning "    Contains default/weak passwords"
            ((++issues))
        fi

        # Check for placeholder values that should be changed
        if grep -q "your-.*-here\|example\.com\|test@example\|change-this" "$env_file" 2>/dev/null; then
            warning "    Contains placeholder values that should be changed"
            ((++issues))
        fi

        # Check for hardcoded API keys/tokens (but allow example ones)
        if grep -E "API_KEY=.{20,}|TOKEN=.{20,}" "$env_file" 2>/dev/null | grep -v "your-.*-here\|test-.*\|example" >/dev/null; then
            error "    May contain real API keys/tokens"
            ((++issues))
        fi
    done
    
    if [[ $issues -eq 0 ]]; then
        success "No sensitive data issues found in environment files"
    else
        warning "Found $issues potential sensitive data issues"
    fi
    
    return 0
}

# Check file permissions
check_file_permissions() {
    log "Checking file permissions..."
    
    local issues=0
    local env_files=($(find "$PROJECT_ROOT/docker" -name "compose.env" -type f))
    
    for env_file in "${env_files[@]}"; do
        local relative_path="${env_file#$PROJECT_ROOT/}"
        local perms=$(stat -c "%a" "$env_file" 2>/dev/null || stat -f "%A" "$env_file" 2>/dev/null || echo "unknown")
        
        # Check if file is world-readable
        if [[ "$perms" =~ [0-9][0-9][4-7] ]]; then
            warning "  $relative_path is world-readable (permissions: $perms)"
            ((++issues))
        fi

        # Check if file is group-writable
        if [[ "$perms" =~ [0-9][2367][0-9] ]]; then
            warning "  $relative_path is group-writable (permissions: $perms)"
            ((++issues))
        fi
    done
    
    if [[ $issues -eq 0 ]]; then
        success "File permissions are secure"
    else
        warning "Found $issues file permission issues"
        echo "  Recommended: chmod 600 docker/*/compose.env"
    fi
    
    return 0
}

# Check for hardcoded secrets in compose files
check_compose_secrets() {
    log "Checking for hardcoded secrets in compose files..."
    
    local issues=0
    local compose_files=($(find "$PROJECT_ROOT/docker" -name "compose.yml" -type f))
    
    for compose_file in "${compose_files[@]}"; do
        local relative_path="${compose_file#$PROJECT_ROOT/}"
        
        # Check for hardcoded passwords/secrets
        if grep -E "password:|secret:|token:" "$compose_file" 2>/dev/null | grep -v "\${" >/dev/null; then
            warning "  $relative_path may contain hardcoded secrets"
            ((++issues))
        fi

        # Check for exposed ports that shouldn't be
        if grep -E "ports:.*[0-9]+:[0-9]+" "$compose_file" 2>/dev/null; then
            local service_name=$(basename "$(dirname "$compose_file")")
            if [[ "$service_name" != "traefik" && "$service_name" != "dns" ]]; then
                warning "  $relative_path exposes ports directly (consider using Traefik instead)"
                ((++issues))
            fi
        fi
    done
    
    if [[ $issues -eq 0 ]]; then
        success "No hardcoded secrets found in compose files"
    else
        warning "Found $issues potential security issues in compose files"
    fi
    
    return 0
}

# Check for secure defaults
check_secure_defaults() {
    log "Checking for secure defaults..."
    
    local issues=0
    
    # Check Traefik configuration
    local traefik_config="$PROJECT_ROOT/docker/infrastructure/traefik/traefik.yml"
    if [[ -f "$traefik_config" ]]; then
        if ! grep -q "insecureSkipVerify.*false\|insecureSkipVerify.*true" "$traefik_config" 2>/dev/null; then
            warning "  Traefik SSL verification settings not explicitly configured"
            ((++issues))
        fi
    fi

    # Check for debug mode in production
    local env_files=($(find "$PROJECT_ROOT/docker" -name "compose.env" -type f))
    for env_file in "${env_files[@]}"; do
        if grep -q "DEBUG=true\|LOG_LEVEL=debug" "$env_file" 2>/dev/null; then
            warning "  Debug mode enabled in $(basename "$(dirname "$env_file")")"
            ((++issues))
        fi
    done
    
    if [[ $issues -eq 0 ]]; then
        success "Secure defaults are configured"
    else
        warning "Found $issues secure default issues"
    fi
    
    return 0
}

# Check for version control security
check_version_control() {
    log "Checking version control security..."
    
    local issues=0
    
    # Check if .env files are in .gitignore
    if [[ -f "$PROJECT_ROOT/.gitignore" ]]; then
        if ! grep -q "\.env\|compose\.env" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
            error "  Environment files not in .gitignore"
            ((++issues))
        fi
    else
        warning "  No .gitignore file found"
        ((++issues))
    fi

    # Check if any .env files are tracked by git
    if [[ -d "$PROJECT_ROOT/.git" ]]; then
        local tracked_env_files=$(git -C "$PROJECT_ROOT" ls-files | grep "\.env$\|compose\.env$" || true)
        if [[ -n "$tracked_env_files" ]]; then
            error "  Environment files are tracked by git:"
            echo "$tracked_env_files" | sed 's/^/    /'
            ((++issues))
        fi
    fi
    
    if [[ $issues -eq 0 ]]; then
        success "Version control security is good"
    else
        error "Found $issues version control security issues"
    fi
    
    return 0
}

# Generate security recommendations
generate_recommendations() {
    log "Security Recommendations:"
    echo
    echo "1. File Permissions:"
    echo "   chmod 600 docker/*/compose.env"
    echo "   chown root:root docker/*/compose.env"
    echo
    echo "2. Environment Variables:"
    echo "   - Change all placeholder values (your-*-here, example.com, etc.)"
    echo "   - Use strong, unique passwords for all services"
    echo "   - Generate proper API keys and tokens"
    echo
    echo "3. Network Security:"
    echo "   - Ensure firewall is configured properly"
    echo "   - Use Traefik for all HTTP services (avoid direct port exposure)"
    echo "   - Enable HTTPS with proper certificates"
    echo
    echo "4. Container Security:"
    echo "   - Run containers as non-root users when possible"
    echo "   - Keep Docker images updated via Watchtower"
    echo "   - Use read-only volumes where appropriate"
    echo
    echo "5. Monitoring:"
    echo "   - Monitor logs for suspicious activity"
    echo "   - Set up alerts for failed authentication attempts"
    echo "   - Regular security audits"
}

# Main audit function
main() {
    show_banner_with_title "Security Configuration Audit" "security"
    echo
    log "Starting security audit..."
    echo
    
    local total_issues=0
    
    check_sensitive_data
    echo
    
    check_file_permissions
    echo
    
    check_compose_secrets
    echo
    
    check_secure_defaults
    echo
    
    check_version_control
    echo
    
    echo "=================================="
    log "Security Audit Complete"
    
    if [[ $total_issues -eq 0 ]]; then
        success "No critical security issues found"
    else
        warning "Security audit found potential issues"
        echo "Please review the warnings above and apply fixes as needed."
    fi
    
    echo
    generate_recommendations
}

# Run main function
main "$@"
