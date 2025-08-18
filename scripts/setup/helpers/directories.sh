#!/usr/bin/env bash
# DangerPrep Directory Management Helper Functions
#
# Purpose: Consolidated directory creation and management functions
# Usage: Source this file to access directory management functions
# Dependencies: logging.sh, errors.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Get the directory where this script is located
DIRECTORIES_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${DIRECTORIES_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${DIRECTORIES_HELPER_DIR}/../../shared/errors.sh"
fi

# Mark this file as sourced
export DIRECTORIES_HELPER_SOURCED=true

#
# Core Directory Creation Functions
#

# Create directory with secure permissions
# Usage: create_secure_directory "/path/to/dir" [mode] [owner:group]
# Returns: 0 if successful, 1 if failed
create_secure_directory() {
    local dir_path="$1"
    local mode="${2:-755}"
    local ownership="${3:-root:root}"
    
    if [[ -z "$dir_path" ]]; then
        error "Directory path is required"
        return 1
    fi
    
    if mkdir -p "$dir_path"; then
        chmod "$mode" "$dir_path"
        chown "$ownership" "$dir_path"
        debug "Created secure directory: $dir_path (mode: $mode, owner: $ownership)"
        return 0
    else
        error "Failed to create directory: $dir_path"
        return 1
    fi
}

# Create multiple directories with the same permissions
# Usage: create_secure_directories "755" "root:root" "/path/one" "/path/two" "/path/three"
# Returns: 0 if all successful, 1 if any failed
create_secure_directories() {
    local mode="$1"
    local ownership="$2"
    shift 2
    
    local failed_dirs=()
    for dir_path in "$@"; do
        if ! create_secure_directory "$dir_path" "$mode" "$ownership"; then
            failed_dirs+=("$dir_path")
        fi
    done
    
    if [[ ${#failed_dirs[@]} -gt 0 ]]; then
        error "Failed to create directories: ${failed_dirs[*]}"
        return 1
    fi
    
    return 0
}

#
# Specialized Directory Structure Functions
#

# Create logging and backup directory structure
# Usage: create_logging_directories
# Returns: 0 if successful, 1 if failed
create_logging_directories() {
    log "Creating logging and backup directories..."
    
    local backup_dir="${BACKUP_DIR:-/var/backups/dangerprep-$(date +%Y%m%d-%H%M%S)}"
    local log_file="${LOG_FILE:-/var/log/dangerprep-setup.log}"
    local log_dir
    log_dir="$(dirname "$log_file")"
    
    if create_secure_directory "$backup_dir" "750" "root:root" && \
       create_secure_directory "$log_dir" "755" "root:root"; then
        success "Logging and backup directories created"
        return 0
    else
        error "Failed to create logging directories"
        return 1
    fi
}

# Create DangerPrep content directory structure
# Usage: create_content_directories [install_root]
# Returns: 0 if successful, 1 if failed
create_content_directories() {
    local install_root="${1:-${INSTALL_ROOT:-/dangerprep}}"
    
    log "Creating DangerPrep content directory structure..."
    
    # Create base directories
    if ! create_secure_directory "${install_root}" "755" "root:root"; then
        return 1
    fi
    
    # Create main structure directories
    local base_dirs=(
        "${install_root}/content"
        "${install_root}/nfs"
        "${install_root}/config"
        "${install_root}/data"
    )
    
    if ! create_secure_directories "755" "root:root" "${base_dirs[@]}"; then
        return 1
    fi
    
    # Create content subdirectories
    local content_dirs=(
        "${install_root}/content/movies"
        "${install_root}/content/tv"
        "${install_root}/content/webtv"
        "${install_root}/content/music"
        "${install_root}/content/audiobooks"
        "${install_root}/content/books"
        "${install_root}/content/comics"
        "${install_root}/content/magazines"
        "${install_root}/content/games/roms"
        "${install_root}/content/kiwix"
    )
    
    if ! create_secure_directories "755" "ubuntu:ubuntu" "${content_dirs[@]}"; then
        return 1
    fi
    
    # Create data subdirectories
    local data_dirs=(
        "${install_root}/data/logs"
        "${install_root}/data/backups"
        "${install_root}/data/adguard"
        "${install_root}/data/step-ca"
    )
    
    if ! create_secure_directories "755" "root:root" "${data_dirs[@]}"; then
        return 1
    fi
    
    success "DangerPrep content directory structure created"
    return 0
}

# Create service-specific directories
# Usage: create_service_directories "service_name" "base_path" [mode] [ownership]
# Returns: 0 if successful, 1 if failed
create_service_directories() {
    local service_name="$1"
    local base_path="$2"
    local mode="${3:-755}"
    local ownership="${4:-root:root}"
    
    if [[ -z "$service_name" ]] || [[ -z "$base_path" ]]; then
        error "Service name and base path are required"
        return 1
    fi
    
    log "Creating directories for $service_name..."
    
    case "$service_name" in
        "adguard")
            local adguard_dirs=(
                "/var/lib/adguardhome/work"
                "/var/lib/adguardhome/conf"
                "/etc/adguardhome"
            )
            create_secure_directories "$mode" "$ownership" "${adguard_dirs[@]}"
            ;;
        "step-ca")
            local step_dirs=(
                "/var/lib/step/config"
                "/var/lib/step/secrets"
                "/var/lib/step/certs"
                "/etc/step"
            )
            create_secure_directories "700" "$ownership" "${step_dirs[@]}"
            ;;
        "dangerprep-config")
            local config_dirs=(
                "/etc/dangerprep"
                "/etc/dangerprep/backup"
            )
            create_secure_directories "$mode" "$ownership" "${config_dirs[@]}"
            ;;
        *)
            warning "Unknown service: $service_name, creating generic directory structure"
            create_secure_directory "$base_path" "$mode" "$ownership"
            ;;
    esac
}

# Create NFS client directories
# Usage: create_nfs_directories [install_root]
# Returns: 0 if successful, 1 if failed
create_nfs_directories() {
    local install_root="${1:-${INSTALL_ROOT:-/dangerprep}}"
    
    log "Creating NFS client directories..."
    
    # Create NFS mount points
    local nfs_dirs=(
        "${install_root}/nfs"
        "${install_root}/content"
    )
    
    if create_secure_directories "755" "root:root" "${nfs_dirs[@]}"; then
        # Create content structure for NFS sharing
        create_content_directories "$install_root"
        success "NFS client directories created"
        return 0
    else
        error "Failed to create NFS directories"
        return 1
    fi
}

#
# Directory Validation and Cleanup Functions
#

# Validate directory exists and has correct permissions
# Usage: validate_directory "/path/to/dir" [expected_mode] [expected_owner]
# Returns: 0 if valid, 1 if invalid
validate_directory() {
    local dir_path="$1"
    local expected_mode="${2:-}"
    local expected_owner="${3:-}"
    
    if [[ ! -d "$dir_path" ]]; then
        error "Directory does not exist: $dir_path"
        return 1
    fi
    
    if [[ -n "$expected_mode" ]]; then
        local actual_mode
        actual_mode=$(stat -c "%a" "$dir_path" 2>/dev/null || echo "")
        if [[ "$actual_mode" != "$expected_mode" ]]; then
            warning "Directory $dir_path has mode $actual_mode, expected $expected_mode"
        fi
    fi
    
    if [[ -n "$expected_owner" ]]; then
        local actual_owner
        actual_owner=$(stat -c "%U:%G" "$dir_path" 2>/dev/null || echo "")
        if [[ "$actual_owner" != "$expected_owner" ]]; then
            warning "Directory $dir_path has owner $actual_owner, expected $expected_owner"
        fi
    fi
    
    return 0
}

# Clean up empty directories
# Usage: cleanup_empty_directories "/base/path"
# Returns: 0 if successful, 1 if failed
cleanup_empty_directories() {
    local base_path="$1"
    
    if [[ -z "$base_path" ]] || [[ ! -d "$base_path" ]]; then
        error "Invalid base path for cleanup: $base_path"
        return 1
    fi
    
    log "Cleaning up empty directories under $base_path..."
    
    # Find and remove empty directories (excluding the base path itself)
    find "$base_path" -mindepth 1 -type d -empty -delete 2>/dev/null || true
    
    success "Empty directory cleanup completed"
    return 0
}
