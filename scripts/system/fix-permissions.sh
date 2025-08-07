#!/bin/bash
# Fix file permissions for DangerPrep configuration files

set -e

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

show_banner_with_title "Permission Fixer" "system"
echo

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Fix environment file permissions
fix_env_permissions() {
    log "Fixing environment file permissions..."
    
    local env_files=($(find "$PROJECT_ROOT/docker" -name "compose.env" -type f))
    local fixed_count=0
    
    for env_file in "${env_files[@]}"; do
        local relative_path="${env_file#$PROJECT_ROOT/}"
        echo "  Fixing permissions for $relative_path..."
        
        # Set secure permissions (owner read/write only)
        chmod 600 "$env_file"
        ((fixed_count++))
    done
    
    success "Fixed permissions for $fixed_count environment files"
}

# Fix script permissions
fix_script_permissions() {
    log "Fixing script permissions..."
    
    local script_files=($(find "$PROJECT_ROOT/scripts" -name "*.sh" -type f))
    local fixed_count=0
    
    for script_file in "${script_files[@]}"; do
        local relative_path="${script_file#$PROJECT_ROOT/}"
        echo "  Making $relative_path executable..."
        
        # Make scripts executable
        chmod +x "$script_file"
        ((fixed_count++))
    done
    
    success "Fixed permissions for $fixed_count script files"
}

# Main function
main() {
    log "Starting permission fixes..."
    echo
    
    fix_env_permissions
    echo
    
    fix_script_permissions
    echo
    
    success "All permissions fixed!"
    echo
    echo "Security recommendations:"
    echo "1. Environment files are now readable only by owner (600)"
    echo "2. Scripts are now executable"
    echo "3. Remember to change placeholder values in environment files"
    echo "4. Consider running the security audit again: ./scripts/security-audit.sh"
}

# Run main function
main "$@"
