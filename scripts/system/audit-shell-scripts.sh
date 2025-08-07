#!/bin/bash
# Shell Script Best Practices Audit
# Checks all shell scripts for security and best practices

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
TOTAL_ISSUES=0

# Check individual script
audit_script() {
    local script_file="$1"
    local relative_path="${script_file#$PROJECT_ROOT/}"
    local issues=0
    
    echo "  Auditing $relative_path..."
    
    # Check shebang
    local shebang=$(head -n1 "$script_file")
    if [[ ! "$shebang" =~ ^#!/bin/bash ]] && [[ ! "$shebang" =~ ^#!/usr/bin/env\ bash ]]; then
        warning "    Missing or incorrect shebang"
        ((issues++))
    else
        echo "    ✓ Proper shebang"
    fi
    
    # Check for 'set -e' or equivalent error handling
    if grep -q "set -e\|set -euo pipefail\|set -eu" "$script_file"; then
        echo "    ✓ Error handling enabled"
    else
        warning "    Missing 'set -e' for error handling"
        ((issues++))
    fi
    
    # Check for unquoted variables (security risk)
    local unquoted_vars=$(grep -n '\$[A-Za-z_][A-Za-z0-9_]*[^"]' "$script_file" | grep -v '^\s*#' | wc -l || echo 0)
    if [[ $unquoted_vars -gt 0 ]]; then
        warning "    Potential unquoted variables found ($unquoted_vars instances)"
        ((issues++))
    else
        echo "    ✓ Variables appear to be properly quoted"
    fi
    
    # Check for command substitution without quotes
    if grep -q '`.*`\|$(' "$script_file" && ! grep -q '".*`.*`.*"\|".*$(.*)"' "$script_file"; then
        warning "    Command substitution may need quoting"
        ((issues++))
    fi
    
    # Check for hardcoded paths that should be variables
    if grep -q '/opt/\|/usr/local/\|/home/' "$script_file" | grep -v INSTALL_ROOT | grep -v PROJECT_ROOT; then
        warning "    Hardcoded paths found (consider using variables)"
        ((issues++))
    fi
    
    # Check for proper function definitions
    if grep -q '^[a-zA-Z_][a-zA-Z0-9_]*()' "$script_file"; then
        echo "    ✓ Functions properly defined"
    fi
    
    # Check for input validation
    if grep -q '\$1\|\$@\|\$\*' "$script_file"; then
        if grep -q 'if.*\[\[.*\$.*\]\]' "$script_file"; then
            echo "    ✓ Input validation present"
        else
            warning "    Script uses arguments but may lack input validation"
            ((issues++))
        fi
    fi
    
    # Check for proper exit codes
    if grep -q 'exit [0-9]' "$script_file"; then
        echo "    ✓ Explicit exit codes used"
    else
        warning "    Consider using explicit exit codes"
        ((issues++))
    fi
    
    # Check for dangerous commands
    if grep -q 'rm -rf /\|rm -rf \$\|eval\|exec' "$script_file"; then
        error "    Potentially dangerous commands found"
        ((issues++))
    fi
    
    # Check for proper logging
    if grep -q 'echo.*\[\|printf.*\[\|log(' "$script_file"; then
        echo "    ✓ Logging functions used"
    else
        warning "    Consider adding logging for better debugging"
        ((issues++))
    fi
    
    # Check for shellcheck compliance (if available)
    if command -v shellcheck >/dev/null 2>&1; then
        local shellcheck_issues=$(shellcheck "$script_file" 2>/dev/null | wc -l || echo 0)
        if [[ $shellcheck_issues -eq 0 ]]; then
            echo "    ✓ Passes shellcheck"
        else
            warning "    Shellcheck found $shellcheck_issues issues"
            ((issues++))
        fi
    fi
    
    if [[ $issues -eq 0 ]]; then
        echo "    ✓ No issues found"
    else
        echo "    ⚠ Found $issues issues"
        ((TOTAL_ISSUES += issues))
    fi
    
    echo
}

# Check script permissions
check_script_permissions() {
    log "Checking script permissions..."
    
    find "$PROJECT_ROOT/scripts" -name "*.sh" -type f | while read -r script_file; do
        local relative_path="${script_file#$PROJECT_ROOT/}"
        
        if [[ -x "$script_file" ]]; then
            echo "  ✓ $relative_path is executable"
        else
            warning "  $relative_path is not executable"
            ((TOTAL_ISSUES++))
        fi
    done
    
    echo
}

# Check for security best practices
check_security_practices() {
    log "Checking security practices..."
    
    local security_issues=0
    
    # Check for scripts that run as root
    local root_scripts=$(grep -r "sudo\|EUID.*0" "$PROJECT_ROOT/scripts" --include="*.sh" | wc -l || echo 0)
    if [[ $root_scripts -gt 0 ]]; then
        echo "  ℹ Found $root_scripts scripts that may require root privileges"
        echo "    Ensure these scripts validate user permissions properly"
    fi
    
    # Check for scripts that handle sensitive data
    local sensitive_scripts=$(grep -r "password\|token\|key\|secret" "$PROJECT_ROOT/scripts" --include="*.sh" | wc -l || echo 0)
    if [[ $sensitive_scripts -gt 0 ]]; then
        echo "  ℹ Found $sensitive_scripts scripts that may handle sensitive data"
        echo "    Ensure these scripts don't log or expose sensitive information"
    fi
    
    # Check for network operations
    local network_scripts=$(grep -r "curl\|wget\|ssh\|scp" "$PROJECT_ROOT/scripts" --include="*.sh" | wc -l || echo 0)
    if [[ $network_scripts -gt 0 ]]; then
        echo "  ℹ Found $network_scripts scripts that perform network operations"
        echo "    Ensure these scripts validate URLs and handle failures properly"
    fi
    
    success "Security practices review complete"
    echo
}

# Generate recommendations
generate_recommendations() {
    log "Shell Script Best Practices Recommendations:"
    echo
    echo "1. Error Handling:"
    echo "   - Always use 'set -e' or 'set -euo pipefail'"
    echo "   - Check return codes of important commands"
    echo "   - Use explicit exit codes (0 for success, non-zero for errors)"
    echo
    echo "2. Variable Handling:"
    echo "   - Quote all variables: \"\$variable\" not \$variable"
    echo "   - Use \${variable} for clarity when needed"
    echo "   - Validate input parameters before use"
    echo
    echo "3. Security:"
    echo "   - Avoid hardcoded paths, use variables"
    echo "   - Validate all user inputs"
    echo "   - Be careful with commands like rm, eval, exec"
    echo "   - Don't log sensitive information"
    echo
    echo "4. Maintainability:"
    echo "   - Use functions for repeated code"
    echo "   - Add comments for complex logic"
    echo "   - Use consistent naming conventions"
    echo "   - Include usage/help information"
    echo
    echo "5. Testing:"
    echo "   - Test scripts with different inputs"
    echo "   - Use shellcheck for static analysis"
    echo "   - Test error conditions"
}

# Main audit function
main() {
    show_banner_with_title "Shell Script Audit" "system"
    echo
    log "Starting shell script audit..."
    echo
    
    check_script_permissions
    
    # Find and audit all shell scripts
    local script_count=0
    find "$PROJECT_ROOT/scripts" -name "*.sh" -type f | while read -r script_file; do
        audit_script "$script_file"
        ((script_count++))
    done
    
    check_security_practices
    
    echo "=================================="
    log "Shell Script Audit Summary:"
    echo "  Scripts audited: $(find "$PROJECT_ROOT/scripts" -name "*.sh" -type f | wc -l)"
    echo "  Total issues found: $TOTAL_ISSUES"
    
    if [[ $TOTAL_ISSUES -eq 0 ]]; then
        success "All scripts follow best practices!"
    else
        warning "Found $TOTAL_ISSUES issues that should be addressed"
    fi
    
    echo
    generate_recommendations
}

# Run main function
main "$@"
