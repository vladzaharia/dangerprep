#!/usr/bin/env bash
# DangerPrep Unified Backup Manager
#
# Purpose: Manages system backups with multiple backup types and restore functionality
# Usage: backup-manager.sh [backup|restore|list|verify] [--type TYPE] [--encrypt]
# Dependencies: tar, gzip, openssl, rsync, find (findutils), chmod (coreutils)
# Author: DangerPrep Project
# Version: 1.0

# Modern shell script best practices
set -euo pipefail

# Script metadata
# Script directory
readonly SCRIPT_DIR
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/error-handling.sh
source "${SCRIPT_DIR}/../shared/error-handling.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"

# Configuration variables
readonly DEFAULT_INSTALL_ROOT="/opt/dangerprep"
readonly INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-${DEFAULT_INSTALL_ROOT}}"
readonly BACKUP_DIR="/var/backups/dangerprep"
readonly BACKUP_KEY_DIR="/etc/dangerprep/backup"
readonly BACKUP_KEY="${BACKUP_KEY_DIR}/backup.key"
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-backup.log"

# Show help
show_help() {
    echo "Unified Backup Manager"
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  create [TYPE]        Create backup (types: basic, encrypted, full)"
    echo "  restore [BACKUP]     Restore from backup file"
    echo "  list                 List available backups"
    echo "  cleanup [DAYS]       Remove backups older than DAYS (default: 30)"
    echo "  verify [BACKUP]      Verify backup integrity"
    echo "  help                 Show this help message"
    echo
    echo "Backup Types:"
    echo "  basic               Simple tar.gz backup (default)"
    echo "  encrypted           GPG encrypted backup"
    echo "  full                Complete system backup including content"
    echo
    echo "Examples:"
    echo "  $0 create basic      # Create basic backup"
    echo "  $0 create encrypted  # Create encrypted backup"
    echo "  $0 list              # List all backups"
    echo "  $0 restore backup.tar.gz  # Restore from backup"
}

# Global variables
# Backup configuration variables - used in backup operations
export BACKUP_TYPE="basic"
export ENCRYPT_BACKUP=false
export VERIFY_BACKUP=true
export DRY_RUN=false

# Valid backup types
readonly VALID_BACKUP_TYPES=("basic" "encrypted" "full")

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Validate required commands
    require_commands tar gzip find chmod mkdir

    # Validate root permissions for backup operations
    validate_root_user

    debug "Backup manager initialized"
    clear_error_context
}

# Validate backup type
validate_backup_type() {
    local backup_type="$1"
    local valid_type=false

    for valid in "${VALID_BACKUP_TYPES[@]}"; do
        if [[ "$backup_type" == "$valid" ]]; then
            valid_type=true
            break
        fi
    done

    if [[ "$valid_type" != "true" ]]; then
        error "Invalid backup type: $backup_type"
        error "Valid types: ${VALID_BACKUP_TYPES[*]}"
        return 1
    fi

    debug "Backup type validated: $backup_type"
    return 0
}

# Setup backup environment with proper validation
setup_backup_env() {
    set_error_context "Backup environment setup"

    info "Setting up backup environment"

    # Validate parent directories are writable
    local backup_parent
    backup_parent="$(dirname "${BACKUP_DIR}")"
    validate_directory_writable "$backup_parent" "backup parent directory"

    # Create backup directory
    safe_execute 1 0 mkdir -p "${BACKUP_DIR}"
    safe_execute 1 0 chmod 750 "${BACKUP_DIR}"

    # Create backup key directory if needed
    if [[ ! -d "${BACKUP_KEY_DIR}" ]]; then
        safe_execute 1 0 mkdir -p "${BACKUP_KEY_DIR}"
        safe_execute 1 0 chmod 700 "${BACKUP_KEY_DIR}"
    fi

    # Setup log file
    local log_dir
    log_dir="$(dirname "${DEFAULT_LOG_FILE}")"
    safe_execute 1 0 mkdir -p "$log_dir"
    safe_execute 1 0 touch "${DEFAULT_LOG_FILE}"
    safe_execute 1 0 chmod 640 "${DEFAULT_LOG_FILE}"

    # Register cleanup for temporary files
    register_temp_dir "/tmp/dangerprep-backup-$$"

    success "Backup environment setup completed"
    info "Backup directory: ${BACKUP_DIR}"
    info "Log file: ${DEFAULT_LOG_FILE}"

    clear_error_context
}

# Create basic backup with comprehensive validation
create_basic_backup() {
    set_error_context "Basic backup creation"

    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    validate_not_empty "$timestamp" "timestamp"

    local backup_name="dangerprep-basic-${timestamp}.tar.gz"
    local backup_path
    backup_path=${BACKUP_DIR}/${backup_name}

    log_section "Creating Basic Backup"
    info "Backup name: $backup_name"
    info "Backup path: $backup_path"

    # Define what to backup with validation
    local backup_items=(
        "${INSTALL_ROOT}/docker"
        "${INSTALL_ROOT}/data"
        "/etc/dangerprep"
        "/etc/ssh/sshd_config"
        "/etc/hostapd"
        "/etc/dnsmasq.conf"
        "/etc/fail2ban"
        "/etc/aide"
    )

    # Find existing items with proper validation
    local existing_items=()
    local item_count=0

    log_subsection "Scanning backup items"
    for item in "${backup_items[@]}"; do
        if [[ -e "$item" ]]; then
            existing_items+=("$item")
            ((item_count++))
            debug "Found backup item: $item"
        else
            debug "Backup item not found (skipping): $item"
        fi
    done

    # Add log files separately (they may have wildcards)
    local log_files
    if log_files=$(find /var/log -name "dangerprep*.log" -type f 2>/dev/null); then
        while IFS= read -r log_file; do
            if [[ -n "$log_file" ]]; then
                existing_items+=("$log_file")
                ((item_count++))
                debug "Found log file: $log_file"
            fi
        done <<< "$log_files"
    fi

    # Validate we have items to backup
    if [[ $item_count -eq 0 ]]; then
        warning "No backup items found - nothing to backup"
        clear_error_context
        return 1
    fi

    success "Found $item_count items to backup"
    
    tar -czf "$backup_path" "${existing_items[@]}" 2>/dev/null || {
        error "Failed to create backup"
        return 1
    }
    
    success "Basic backup created: $backup_path"
    info "Backup size: $(du -h "$backup_path" | cut -f1)"
}

# Create encrypted backup
create_encrypted_backup() {
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_name="dangerprep-encrypted-${timestamp}.tar.gz.gpg"
    local backup_path="${BACKUP_DIR}/$backup_name"
    local temp_backup
    temp_backup="$(mktemp -t dangerprep-backup.XXXXXX.tar.gz)"
    chmod 600 "$temp_backup"
    register_temp_file "$temp_backup"
    
    log "Creating encrypted backup: $backup_name"
    
    # Check for backup key
    if [[ ! -f "${BACKUP_KEY}" ]]; then
        warning "Backup key not found, creating new one..."
        mkdir -p "$(dirname "${BACKUP_KEY}")"
        openssl rand -base64 32 > "${BACKUP_KEY}"
        chmod 600 "${BACKUP_KEY}"
        success "New backup key created: ${BACKUP_KEY}"
    fi
    
    # Define what to backup (same as basic)
    local backup_items=(
        "${INSTALL_ROOT}/docker"
        "${INSTALL_ROOT}/data"
        "/etc/dangerprep"
        "/etc/ssh/sshd_config"
        "/etc/hostapd"
        "/etc/dnsmasq.conf"
        "/etc/fail2ban"
        "/etc/aide"
        "/var/log/dangerprep*.log"
    )
    
    # Create temporary backup
    local existing_items=()
    for item in "${backup_items[@]}"; do
        if [[ -e "$item" ]]; then
            existing_items+=("$item")
        fi
    done
    
    if [[ ${#existing_items[@]} -eq 0 ]]; then
        warning "No backup items found"
        return 1
    fi
    
    tar -czf "$temp_backup" "${existing_items[@]}" 2>/dev/null || {
        error "Failed to create temporary backup"
        return 1
    }
    
    # Encrypt backup
    gpg --cipher-algo AES256 --compress-algo 1 --symmetric --passphrase-file "${BACKUP_KEY}" --output "$backup_path" "$temp_backup" || {
        error "Failed to encrypt backup"
        return 1
    }

    # Temp file will be cleaned up automatically by cleanup framework
    
    success "Encrypted backup created: $backup_path"
    info "Backup size: $(du -h "$backup_path" | cut -f1)"
}

# Create full backup
create_full_backup() {
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_name="dangerprep-full-${timestamp}.tar.gz"
    local backup_path="${BACKUP_DIR}/$backup_name"
    
    log "Creating full backup: $backup_name"
    warning "Full backup includes content directory - this may take a while"
    
    # Define what to backup (including content)
    local backup_items=(
        "${INSTALL_ROOT}/docker"
        "${INSTALL_ROOT}/data"
        "${INSTALL_ROOT}/content"
        "/etc/dangerprep"
        "/etc/ssh/sshd_config"
        "/etc/hostapd"
        "/etc/dnsmasq.conf"
        "/etc/fail2ban"
        "/etc/aide"
        "/var/log/dangerprep*.log"
    )
    
    # Create backup
    local existing_items=()
    for item in "${backup_items[@]}"; do
        if [[ -e "$item" ]]; then
            existing_items+=("$item")
        fi
    done
    
    if [[ ${#existing_items[@]} -eq 0 ]]; then
        warning "No backup items found"
        return 1
    fi
    
    tar -czf "$backup_path" "${existing_items[@]}" 2>/dev/null || {
        error "Failed to create full backup"
        return 1
    }
    
    success "Full backup created: $backup_path"
    info "Backup size: $(du -h "$backup_path" | cut -f1)"
}

# List available backups
list_backups() {
    log "Available backups in ${BACKUP_DIR}:"
    
    if [[ ! -d "${BACKUP_DIR}" ]]; then
        warning "Backup directory does not exist"
        return 0
    fi
    
    local backups=()
    mapfile -t backups < <(find "${BACKUP_DIR}" -name "dangerprep-*.tar.gz*" -type f | sort -r)
    
    if [[ ${#backups[@]} -eq 0 ]]; then
        info "No backups found"
        return 0
    fi
    
    echo
    printf "%-40s %-15s %-20s\n" "Backup Name" "Size" "Date"
    printf "%-40s %-15s %-20s\n" "----------------------------------------" "---------------" "--------------------"
    
    for backup in "${backups[@]}"; do
        local name
        name=$(basename "$backup")
        local size
        size=$(du -h "$backup" 2>/dev/null | cut -f1 || echo "Unknown")
        local date
        date=$(stat -c %y "$backup" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1 || echo "Unknown")
        printf "%-40s %-15s %-20s\n" "$name" "$size" "$date"
    done
    echo
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    if [[ -z "$backup_file" ]]; then
        error "No backup file specified"
        show_help
        return 1
    fi
    
    # Check if backup file exists
    if [[ ! -f "$backup_file" ]] && [[ ! -f "${BACKUP_DIR}/$backup_file" ]]; then
        error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Use full path if relative path provided
    if [[ ! -f "$backup_file" ]]; then
        backup_file="${BACKUP_DIR}/$backup_file"
    fi
    
    log "Restoring from backup: $(basename "$backup_file")"
    
    # Check if encrypted
    if [[ "$backup_file" == *.gpg ]]; then
        if [[ ! -f "${BACKUP_KEY}" ]]; then
            error "Backup key not found for encrypted backup: ${BACKUP_KEY}"
            return 1
        fi
        
        local temp_backup
        temp_backup="$(mktemp -t dangerprep-restore.XXXXXX.tar.gz)"
        chmod 600 "$temp_backup"
        register_temp_file "$temp_backup"
        gpg --decrypt --passphrase-file "${BACKUP_KEY}" --output "$temp_backup" "$backup_file" || {
            error "Failed to decrypt backup"
            return 1
        }
        backup_file="$temp_backup"
    fi
    
    # Extract backup
    tar -xzf "$backup_file" -C / || {
        error "Failed to restore backup"
        return 1
    }

    # Temp file will be cleaned up automatically by cleanup framework
    
    success "Backup restored successfully"
    warning "You may need to restart services for changes to take effect"
}

# Cleanup old backups
cleanup_backups() {
    local days
    days=${1:-30}
    
    log "Cleaning up backups older than $days days..."
    
    if [[ ! -d "${BACKUP_DIR}" ]]; then
        warning "Backup directory does not exist"
        return 0
    fi
    
    local old_backups=()
    mapfile -t old_backups < <(find "${BACKUP_DIR}" -name "dangerprep-*.tar.gz*" -type f -mtime +"$days")
    
    if [[ ${#old_backups[@]} -eq 0 ]]; then
        info "No old backups to clean up"
        return 0
    fi
    
    for backup in "${old_backups[@]}"; do
        log "Removing old backup: $(basename "$backup")"
        rm -f "$backup"
    done
    
    success "Cleaned up ${#old_backups[@]} old backups"
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    if [[ -z "$backup_file" ]]; then
        error "No backup file specified"
        return 1
    fi
    
    # Check if backup file exists
    if [[ ! -f "$backup_file" ]] && [[ ! -f "${BACKUP_DIR}/$backup_file" ]]; then
        error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Use full path if relative path provided
    if [[ ! -f "$backup_file" ]]; then
        backup_file="${BACKUP_DIR}/$backup_file"
    fi
    
    log "Verifying backup: $(basename "$backup_file")"
    
    # Check if encrypted
    if [[ "$backup_file" == *.gpg ]]; then
        if [[ ! -f "${BACKUP_KEY}" ]]; then
            error "Backup key not found for encrypted backup: ${BACKUP_KEY}"
            return 1
        fi
        
        # Test decryption
        if gpg --decrypt --passphrase-file "${BACKUP_KEY}" "$backup_file" | tar -tzf - >/dev/null 2>&1; then
            success "Encrypted backup is valid"
        else
            error "Encrypted backup is corrupted or key is invalid"
            return 1
        fi
    else
        # Test extraction
        if tar -tzf "$backup_file" >/dev/null 2>&1; then
            success "Backup is valid"
        else
            error "Backup is corrupted"
            return 1
        fi
    fi
}

# Main function
main() {
    # Show banner for backup operations
    if [[ "${1:-help}" != "help" ]]; then
        show_backup_banner "$@"
        echo
    fi

    setup_backup_env

    case "${1:-help}" in
        create)
            case "${2:-basic}" in
                basic)
                    create_basic_backup
                    ;;
                encrypted)
                    create_encrypted_backup
                    ;;
                full)
                    create_full_backup
                    ;;
                *)
                    error "Unknown backup type: $2"
                    show_help
                    exit 1
                    ;;
            esac
            ;;
        restore)
            restore_backup "$2"
            ;;
        list)
            list_backups
            ;;
        cleanup)
            cleanup_backups "$2"
            ;;
        verify)
            verify_backup "$2"
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
