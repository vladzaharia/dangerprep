#!/bin/bash
# NFS Mount Testing Script
# Tests NFS mount configuration and accessibility

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
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
NFS_CONFIG="$INSTALL_ROOT/nfs-mounts.conf"
MOUNT_SCRIPT="$INSTALL_ROOT/mount-nfs.sh"

# Check if NFS utilities are available
check_nfs_utilities() {
    log "Checking NFS utilities..."
    
    if ! command -v mount.nfs > /dev/null 2>&1; then
        error "NFS utilities not found. Please install nfs-utils package."
        return 1
    fi
    
    if ! command -v showmount > /dev/null 2>&1; then
        warning "showmount utility not found. Some tests may be limited."
    fi
    
    success "NFS utilities available"
    return 0
}

# Check if NFS configuration exists
check_nfs_config() {
    log "Checking NFS configuration..."
    
    if [[ ! -f "$NFS_CONFIG" ]]; then
        error "NFS configuration file not found: $NFS_CONFIG"
        echo "Run the deployment script first to create the configuration."
        return 1
    fi
    
    if [[ ! -f "$MOUNT_SCRIPT" ]]; then
        error "NFS mount script not found: $MOUNT_SCRIPT"
        echo "Run the deployment script first to create the mount script."
        return 1
    fi
    
    if [[ ! -x "$MOUNT_SCRIPT" ]]; then
        warning "Mount script is not executable. Making it executable..."
        chmod +x "$MOUNT_SCRIPT"
    fi
    
    success "NFS configuration files found"
    return 0
}

# Parse NFS configuration and validate entries
validate_nfs_config() {
    log "Validating NFS configuration..."
    
    local valid_entries=0
    local total_entries=0
    
    while IFS=':' read -r remote_path local_path options; do
        # Skip comments and empty lines
        [[ "$remote_path" =~ ^#.*$ ]] && continue
        [[ -z "$remote_path" ]] && continue
        
        ((total_entries++))
        
        echo "  Validating: $remote_path -> $local_path"
        
        # Check if local path is absolute
        if [[ ! "$local_path" =~ ^/ ]]; then
            error "    Local path must be absolute: $local_path"
            continue
        fi
        
        # Check if local path is within install root
        if [[ ! "$local_path" =~ ^$INSTALL_ROOT ]]; then
            warning "    Local path not within install root: $local_path"
        fi
        
        # Validate NFS options
        if [[ -z "$options" ]]; then
            warning "    No mount options specified"
        fi
        
        ((valid_entries++))
        
    done < "$NFS_CONFIG"
    
    if [[ $total_entries -eq 0 ]]; then
        warning "No NFS mounts configured (all entries are commented out)"
        return 0
    fi
    
    success "Validated $valid_entries/$total_entries NFS mount entries"
    return 0
}

# Test NFS server connectivity
test_nfs_connectivity() {
    log "Testing NFS server connectivity..."
    
    local servers=()
    
    # Extract unique servers from config
    while IFS=':' read -r remote_path local_path options; do
        # Skip comments and empty lines
        [[ "$remote_path" =~ ^#.*$ ]] && continue
        [[ -z "$remote_path" ]] && continue
        
        local server=$(echo "$remote_path" | cut -d':' -f1)
        if [[ ! " ${servers[@]} " =~ " ${server} " ]]; then
            servers+=("$server")
        fi
        
    done < "$NFS_CONFIG"
    
    if [[ ${#servers[@]} -eq 0 ]]; then
        warning "No NFS servers to test (all entries commented out)"
        return 0
    fi
    
    local reachable_servers=0
    
    for server in "${servers[@]}"; do
        echo "  Testing connectivity to $server..."
        
        if ping -c 1 -W 2 "$server" > /dev/null 2>&1; then
            success "    $server is reachable"
            ((reachable_servers++))
            
            # Test NFS service if showmount is available
            if command -v showmount > /dev/null 2>&1; then
                if timeout 10 showmount -e "$server" > /dev/null 2>&1; then
                    success "    NFS service is running on $server"
                else
                    warning "    NFS service may not be running on $server"
                fi
            fi
        else
            error "    $server is not reachable"
        fi
    done
    
    if [[ $reachable_servers -eq ${#servers[@]} ]]; then
        success "All NFS servers are reachable"
    else
        warning "$reachable_servers/${#servers[@]} NFS servers are reachable"
    fi
    
    return 0
}

# Test mount script functionality
test_mount_script() {
    log "Testing mount script functionality..."
    
    # Test script syntax
    if bash -n "$MOUNT_SCRIPT"; then
        success "Mount script syntax is valid"
    else
        error "Mount script has syntax errors"
        return 1
    fi
    
    # Test help/usage
    if "$MOUNT_SCRIPT" 2>&1 | grep -q "Usage:"; then
        success "Mount script shows usage information"
    else
        warning "Mount script may not show proper usage information"
    fi
    
    return 0
}

# Check if any mounts are currently active
check_active_mounts() {
    log "Checking for active NFS mounts..."
    
    local active_mounts=0
    
    while IFS=':' read -r remote_path local_path options; do
        # Skip comments and empty lines
        [[ "$remote_path" =~ ^#.*$ ]] && continue
        [[ -z "$remote_path" ]] && continue
        
        if mountpoint -q "$local_path" 2>/dev/null; then
            success "  $local_path is mounted"
            ((active_mounts++))
        else
            echo "  $local_path is not mounted"
        fi
        
    done < "$NFS_CONFIG"
    
    if [[ $active_mounts -gt 0 ]]; then
        success "$active_mounts NFS mounts are currently active"
    else
        echo "No NFS mounts are currently active"
    fi
    
    return 0
}

# Main test function
main() {
    log "Starting NFS mount configuration tests..."
    log "Install root: $INSTALL_ROOT"
    echo
    
    local tests_passed=0
    local tests_failed=0
    
    # Run tests
    if check_nfs_utilities; then ((tests_passed++)); else ((tests_failed++)); fi
    echo
    
    if check_nfs_config; then ((tests_passed++)); else ((tests_failed++)); fi
    echo
    
    if validate_nfs_config; then ((tests_passed++)); else ((tests_failed++)); fi
    echo
    
    if test_nfs_connectivity; then ((tests_passed++)); else ((tests_failed++)); fi
    echo
    
    if test_mount_script; then ((tests_passed++)); else ((tests_failed++)); fi
    echo
    
    if check_active_mounts; then ((tests_passed++)); else ((tests_failed++)); fi
    echo
    
    # Summary
    echo "=================================="
    log "NFS Test Summary:"
    echo "  Tests passed: $tests_passed"
    echo "  Tests failed: $tests_failed"
    
    if [[ $tests_failed -eq 0 ]]; then
        success "All NFS tests passed!"
        echo
        echo "To mount NFS shares, run:"
        echo "  sudo $MOUNT_SCRIPT mount"
        echo
        echo "To unmount NFS shares, run:"
        echo "  sudo $MOUNT_SCRIPT unmount"
        exit 0
    else
        error "$tests_failed NFS tests failed"
        exit 1
    fi
}

# Run main function
main "$@"
