#!/usr/bin/env bash
# DangerPrep Monitoring and Backup Helper Functions
#
# Purpose: Consolidated monitoring and backup functions
# Usage: Source this file to access monitoring and backup functions
# Dependencies: logging.sh, errors.sh, directories.sh, config.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Get the directory where this script is located
MONITORING_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${MONITORING_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${MONITORING_HELPER_DIR}/../../shared/errors.sh"
fi

if [[ -z "${DIRECTORIES_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./directories.sh
    source "${MONITORING_HELPER_DIR}/directories.sh"
fi

if [[ -z "${CONFIG_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./config.sh
    source "${MONITORING_HELPER_DIR}/config.sh"
fi

# Mark this file as sourced
export MONITORING_HELPER_SOURCED=true

#
# Backup Functions
#

# Backup original configurations with comprehensive error handling
# Usage: backup_original_configs
# Returns: 0 if successful, 1 if failed
backup_original_configs() {
    log "Backing up original configurations..."
    
    # Ensure backup directory exists
    if ! create_service_directories "backup" "${BACKUP_DIR:-/var/backups/dangerprep}"; then
        error "Failed to create backup directory"
        return 1
    fi
    
    local configs_to_backup=(
        "/etc/ssh/sshd_config"
        "/etc/sysctl.conf"
        "/etc/dnsmasq.conf"
        "/etc/hostapd/hostapd.conf"
        "/etc/fail2ban/jail.local"
        "/etc/netplan"
        "/etc/systemd/resolved.conf"
        "/etc/hosts"
        "/etc/hostname"
        "/etc/crontab"
        "/var/spool/cron/crontabs"
    )
    
    local backup_count=0
    local failed_backups=()
    
    for config in "${configs_to_backup[@]}"; do
        if [[ -e "$config" ]]; then
            local backup_name
            backup_name="$(basename "$config").$(date +%Y%m%d_%H%M%S)"
            
            if cp -r "$config" "${BACKUP_DIR}/${backup_name}" 2>/dev/null; then
                log "Backed up: $config → ${backup_name}"
                ((backup_count++))
            else
                warning "Failed to backup: $config"
                failed_backups+=("$config")
            fi
        else
            debug "Config file not found (may be created later): $config"
        fi
    done
    
    # Create backup manifest
    local manifest_file="${BACKUP_DIR}/backup_manifest.txt"
    {
        echo "# DangerPrep Configuration Backup Manifest"
        echo "# Created: $(date)"
        echo "# Backup directory: ${BACKUP_DIR}"
        echo "# Total files backed up: $backup_count"
        echo ""
        echo "# Backed up files:"
        find "${BACKUP_DIR}" -type f -name "*.2*" | sort
        echo ""
        if [[ ${#failed_backups[@]} -gt 0 ]]; then
            echo "# Failed backups:"
            printf "%s\n" "${failed_backups[@]}"
        fi
    } > "$manifest_file"
    
    if [[ ${#failed_backups[@]} -eq 0 ]]; then
        success "Configuration backup completed: $backup_count files backed up"
        return 0
    else
        warning "Configuration backup completed with ${#failed_backups[@]} failures"
        return 1
    fi
}

# Setup encrypted backups with comprehensive configuration
# Usage: setup_encrypted_backups
# Returns: 0 if successful, 1 if failed
setup_encrypted_backups() {
    log "Setting up encrypted backups..."

    # Create backup directories
    if ! create_service_directories "dangerprep-config" "/etc/dangerprep"; then
        error "Failed to create DangerPrep config directory"
        return 1
    fi

    # Generate backup encryption key if it doesn't exist
    local backup_key_file="/etc/dangerprep/backup/backup.key"
    if [[ ! -f "$backup_key_file" ]]; then
        log "Generating backup encryption key..."
        if ! openssl rand -base64 32 > "$backup_key_file"; then
            error "Failed to generate backup encryption key"
            return 1
        fi
        chmod 600 "$backup_key_file"
        chown root:root "$backup_key_file"
        success "Backup encryption key generated"
    else
        log "Backup encryption key already exists"
    fi

    # Load backup cron configuration
    if ! load_backup_cron_config; then
        error "Failed to load backup cron configuration"
        return 1
    fi

    # Create backup script
    local backup_script="/usr/local/bin/dangerprep-backup"
    if ! create_backup_script "$backup_script"; then
        error "Failed to create backup script"
        return 1
    fi

    # Test backup functionality
    if ! test_backup_functionality; then
        warning "Backup functionality test failed"
    fi

    success "Encrypted backups configured successfully"
    return 0
}

# Create backup script
# Usage: create_backup_script "script_path"
# Returns: 0 if successful, 1 if failed
create_backup_script() {
    local script_path="$1"
    
    if [[ -z "$script_path" ]]; then
        error "Script path required"
        return 1
    fi
    
    log "Creating backup script: $script_path"
    
    cat > "$script_path" << 'EOF'
#!/usr/bin/env bash
# DangerPrep Automated Backup Script
# Generated by DangerPrep setup

set -euo pipefail

BACKUP_KEY="/etc/dangerprep/backup/backup.key"
BACKUP_DIR="/var/backups/dangerprep"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create timestamped backup
backup_configs() {
    local backup_archive="${BACKUP_DIR}/config_backup_${TIMESTAMP}.tar.gz"
    
    # Create encrypted backup of critical configurations
    tar -czf - \
        /etc/dangerprep \
        /etc/ssh/sshd_config \
        /etc/systemd/resolved.conf \
        /var/lib/adguardhome \
        /var/lib/step \
        2>/dev/null | \
    openssl enc -aes-256-cbc -salt -pbkdf2 -pass file:"${BACKUP_KEY}" \
        -out "${backup_archive}.enc"
    
    echo "Backup created: ${backup_archive}.enc"
}

# Cleanup old backups (keep last 7 days)
cleanup_old_backups() {
    find "${BACKUP_DIR}" -name "config_backup_*.tar.gz.enc" -mtime +7 -delete 2>/dev/null || true
}

# Main backup function
main() {
    if [[ ! -f "$BACKUP_KEY" ]]; then
        echo "Error: Backup key not found: $BACKUP_KEY" >&2
        exit 1
    fi
    
    mkdir -p "$BACKUP_DIR"
    backup_configs
    cleanup_old_backups
}

main "$@"
EOF

    chmod +x "$script_path"
    success "Backup script created: $script_path"
    return 0
}

# Test backup functionality
# Usage: test_backup_functionality
# Returns: 0 if successful, 1 if failed
test_backup_functionality() {
    log "Testing backup functionality..."
    
    local test_backup_script="/usr/local/bin/dangerprep-backup"
    
    if [[ ! -x "$test_backup_script" ]]; then
        error "Backup script not found or not executable"
        return 1
    fi
    
    # Run a test backup
    if "$test_backup_script" >/dev/null 2>&1; then
        success "Backup functionality test passed"
        return 0
    else
        warning "Backup functionality test failed"
        return 1
    fi
}

#
# Monitoring Functions
#

# Setup system monitoring with comprehensive configuration
# Usage: setup_system_monitoring
# Returns: 0 if successful
setup_system_monitoring() {
    log "Setting up system monitoring..."

    # System monitoring is primarily handled by just commands
    # This function sets up the monitoring infrastructure

    # Create monitoring directories
    if ! create_service_directories "monitoring" "/var/log/dangerprep"; then
        warning "Failed to create monitoring directories"
    fi

    # Configure log rotation for DangerPrep logs
    if ! configure_log_rotation; then
        warning "Failed to configure log rotation"
    fi

    # Setup monitoring cron jobs
    if ! setup_monitoring_cron_jobs; then
        warning "Failed to setup monitoring cron jobs"
    fi

    success "System monitoring configured"
    return 0
}

# Configure log rotation for DangerPrep logs
# Usage: configure_log_rotation
# Returns: 0 if successful, 1 if failed
configure_log_rotation() {
    log "Configuring log rotation..."
    
    local logrotate_config="/etc/logrotate.d/dangerprep"
    
    cat > "$logrotate_config" << EOF
/var/log/dangerprep/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        systemctl reload rsyslog > /dev/null 2>&1 || true
    endscript
}
EOF

    success "Log rotation configured"
    return 0
}

# Setup monitoring cron jobs
# Usage: setup_monitoring_cron_jobs
# Returns: 0 if successful, 1 if failed
setup_monitoring_cron_jobs() {
    log "Setting up monitoring cron jobs..."
    
    # Add cron job for system health checks
    local cron_entry="*/15 * * * * root /usr/bin/just -f /dangerprep/justfile health-check >/dev/null 2>&1"
    
    if ! echo "$cron_entry" > /etc/cron.d/dangerprep-monitoring; then
        error "Failed to create monitoring cron job"
        return 1
    fi
    
    chmod 644 /etc/cron.d/dangerprep-monitoring
    success "Monitoring cron jobs configured"
    return 0
}

# Setup container health monitoring (placeholder for future Docker integration)
# Usage: setup_container_health_monitoring
# Returns: 0 if successful
setup_container_health_monitoring() {
    log "Setting up container health monitoring..."

    # Note: This is a placeholder for future Docker container monitoring
    # Currently, DangerPrep uses host-based services for Olares compatibility

    log "Container health monitoring is handled by Olares K3s infrastructure"
    log "Host services are monitored via systemd and just commands"

    # Add cron job to run health checks via just
    local health_check_cron="*/5 * * * * root /usr/bin/just -f /dangerprep/justfile health-check >/dev/null 2>&1"
    
    if ! echo "$health_check_cron" > /etc/cron.d/dangerprep-health; then
        warning "Failed to create health check cron job"
    else
        chmod 644 /etc/cron.d/dangerprep-health
        success "Health monitoring cron job configured"
    fi

    success "Container health monitoring configured"
    return 0
}

#
# Main Monitoring and Backup Setup Function
#

# Setup all monitoring and backup services
# Usage: setup_monitoring_and_backup
# Returns: 0 if successful, 1 if any failures
setup_monitoring_and_backup() {
    log_section "Monitoring and Backup Setup"
    
    local setup_errors=0
    
    # Setup system monitoring
    if ! setup_system_monitoring; then
        error "Failed to setup system monitoring"
        ((setup_errors++))
    fi
    
    # Setup encrypted backups
    if ! setup_encrypted_backups; then
        error "Failed to setup encrypted backups"
        ((setup_errors++))
    fi
    
    # Setup container health monitoring
    if ! setup_container_health_monitoring; then
        error "Failed to setup container health monitoring"
        ((setup_errors++))
    fi
    
    if [[ $setup_errors -eq 0 ]]; then
        success "Monitoring and backup setup completed successfully"
        return 0
    else
        warning "Monitoring and backup setup completed with $setup_errors errors"
        return 1
    fi
}
