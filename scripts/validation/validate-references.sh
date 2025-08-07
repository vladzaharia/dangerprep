#!/bin/bash
# Comprehensive File Reference Validation Script
# Validates all file references, paths, and dependencies in the DangerPrep project

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

# Check if a file exists relative to project root
check_file_exists() {
    local file_path="$1"
    local context="$2"
    
    if [[ ! -f "$PROJECT_ROOT/$file_path" ]]; then
        error "Missing file: $file_path (referenced in $context)"
        ((ISSUES_FOUND++))
        return 1
    fi
    return 0
}

# Check if a directory exists relative to project root
check_dir_exists() {
    local dir_path="$1"
    local context="$2"
    
    if [[ ! -d "$PROJECT_ROOT/$dir_path" ]]; then
        error "Missing directory: $dir_path (referenced in $context)"
        ((ISSUES_FOUND++))
        return 1
    fi
    return 0
}

# Validate justfile references
validate_justfile() {
    log "Validating justfile references..."
    
    local justfile="$PROJECT_ROOT/justfile"
    if [[ ! -f "$justfile" ]]; then
        error "justfile not found"
        ((ISSUES_FOUND++))
        return 1
    fi
    
    # Extract compose file references
    grep -o "docker/[^/]*/[^/]*/compose\.yml" "$justfile" | sort -u | while read -r compose_file; do
        check_file_exists "$compose_file" "justfile"
    done
    
    # Extract script references
    grep -o "\./scripts/[^[:space:]]*\.sh" "$justfile" | sort -u | while read -r script_file; do
        script_file="${script_file#./}"
        check_file_exists "$script_file" "justfile"
    done
    
    success "Justfile validation complete"
}

# Validate Docker compose file references
validate_compose_files() {
    log "Validating Docker compose file references..."
    
    find "$PROJECT_ROOT/docker" -name "compose.yml" -type f | while read -r compose_file; do
        local relative_path="${compose_file#$PROJECT_ROOT/}"
        local compose_dir="$(dirname "$compose_file")"
        
        echo "  Checking $relative_path..."
        
        # Check for env_file references
        if grep -q "env_file:" "$compose_file"; then
            if grep -q "compose\.env" "$compose_file"; then
                check_file_exists "$(dirname "$relative_path")/compose.env" "$relative_path"
            fi
        fi
        
        # Check for volume mount references to local files and directories
        grep -E "^\s*-\s*\./[^:]*:" "$compose_file" | sed 's/.*- \.\///' | sed 's/:.*$//' | while read -r local_path; do
            if [[ -n "$local_path" ]]; then
                local full_path="$(dirname "$relative_path")/$local_path"
                if [[ ! -f "$PROJECT_ROOT/$full_path" && ! -d "$PROJECT_ROOT/$full_path" ]]; then
                    error "Missing file/directory: $full_path (referenced in $relative_path)"
                    ((ISSUES_FOUND++))
                fi
            fi
        done
        
        # Check for Dockerfile references
        if grep -q "build:" "$compose_file"; then
            if [[ -f "$compose_dir/Dockerfile" ]]; then
                echo "    ✓ Dockerfile found"
            else
                warning "    Dockerfile not found for build context in $relative_path"
            fi
        fi
    done
    
    success "Docker compose validation complete"
}

# Validate script references
validate_scripts() {
    log "Validating script references..."
    
    find "$PROJECT_ROOT/scripts" -name "*.sh" -type f | while read -r script_file; do
        local relative_path="${script_file#$PROJECT_ROOT/}"
        
        echo "  Checking $relative_path..."
        
        # Check for sourced files
        grep -E "^\s*\.\s+|^\s*source\s+" "$script_file" | sed 's/.*[. ]//g' | while read -r sourced_file; do
            if [[ -n "$sourced_file" && "$sourced_file" != "\$"* ]]; then
                # Handle relative paths
                if [[ "$sourced_file" =~ ^\. ]]; then
                    local full_path="$(dirname "$script_file")/$sourced_file"
                    if [[ ! -f "$full_path" ]]; then
                        error "Missing sourced file: $sourced_file (referenced in $relative_path)"
                        ((ISSUES_FOUND++))
                    fi
                fi
            fi
        done
        
        # Check for executable references
        grep -E "^\s*[^#]*\./[^[:space:]]*" "$script_file" | grep -v "dirname" | sed 's/.*\.\///' | sed 's/[[:space:]].*//' | while read -r exec_file; do
            if [[ -n "$exec_file" && "$exec_file" != "\$"* ]]; then
                local full_path="$(dirname "$script_file")/$exec_file"
                if [[ ! -f "$full_path" && ! -f "$PROJECT_ROOT/$exec_file" ]]; then
                    warning "Referenced executable may not exist: $exec_file (in $relative_path)"
                fi
            fi
        done
    done
    
    success "Script validation complete"
}

# Validate documentation references
validate_documentation() {
    log "Validating documentation references..."
    
    find "$PROJECT_ROOT" -name "*.md" -type f | while read -r doc_file; do
        local relative_path="${doc_file#$PROJECT_ROOT/}"
        
        # Skip if in .git directory
        [[ "$relative_path" =~ \.git/ ]] && continue
        
        echo "  Checking $relative_path..."
        
        # Check for file references in markdown
        grep -E "\[.*\]\([^)]*\)" "$doc_file" | grep -o "([^)]*)" | sed 's/[()]//g' | while read -r link; do
            # Skip URLs and anchors
            [[ "$link" =~ ^https?:// ]] && continue
            [[ "$link" =~ ^# ]] && continue
            [[ "$link" =~ ^mailto: ]] && continue
            
            # Check if it's a relative file reference
            if [[ "$link" =~ ^[^/] && ! "$link" =~ ^[a-zA-Z]: ]]; then
                local full_path="$(dirname "$doc_file")/$link"
                if [[ ! -f "$full_path" && ! -d "$full_path" ]]; then
                    warning "Broken link in documentation: $link (in $relative_path)"
                fi
            fi
        done
    done
    
    success "Documentation validation complete"
}

# Validate lib directory references
validate_lib_directory() {
    log "Validating lib directory references..."
    
    # Check just wrapper
    if [[ -f "$PROJECT_ROOT/lib/just/just" ]]; then
        if [[ ! -x "$PROJECT_ROOT/lib/just/just" ]]; then
            error "Just wrapper is not executable"
            ((ISSUES_FOUND++))
        fi
        
        # Check if download script exists
        check_file_exists "lib/just/download.sh" "just wrapper"
        
        # Check if VERSION file exists
        check_file_exists "lib/just/VERSION" "just wrapper"
        
    else
        error "Just wrapper not found at lib/just/just"
        ((ISSUES_FOUND++))
    fi
    
    success "Lib directory validation complete"
}

# Main validation function
main() {
    log "Starting comprehensive file reference validation..."
    echo
    
    validate_justfile
    echo
    
    validate_compose_files
    echo
    
    validate_scripts
    echo
    
    validate_documentation
    echo
    
    validate_lib_directory
    echo
    
    echo "=================================="
    log "Validation Summary:"
    
    if [[ $ISSUES_FOUND -eq 0 ]]; then
        success "All file references are valid!"
        exit 0
    else
        error "Found $ISSUES_FOUND file reference issues"
        exit 1
    fi
}

# Run main function
main "$@"
