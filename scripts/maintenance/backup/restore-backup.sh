#!/bin/bash
# DangerPrep Backup Restoration System

BACKUP_DIR="/var/backups/dangerprep"
BACKUP_KEY="/etc/dangerprep/backup/backup.key"
LOG_FILE="/var/log/dangerprep-restore.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}

list_backups() {
    echo "Available backups:"
    if [[ -d "$BACKUP_DIR" ]]; then
        ls -la "$BACKUP_DIR"/*.enc 2>/dev/null | nl
    else
        echo "No backup directory found"
        return 1
    fi
}

restore_backup() {
    local backup_file="$1"
    
    if [[ -z "$backup_file" ]]; then
        error "No backup file specified"
        echo "Usage: $0 restore <backup_file>"
        return 1
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        error "Backup file not found: $backup_file"
        return 1
    fi
    
    if [[ ! -f "$BACKUP_KEY" ]]; then
        error "Backup key not found: $BACKUP_KEY"
        return 1
    fi
    
    log "Starting restore from: $backup_file"
    
    # Create temporary directory for restore
    local temp_dir=$(mktemp -d)
    local decrypted_file="$temp_dir/backup.tar.gz"
    
    # Decrypt backup
    log "Decrypting backup..."
    openssl enc -aes-256-cbc -d -in "$backup_file" -out "$decrypted_file" -pass file:"$BACKUP_KEY"
    
    if [[ $? -ne 0 ]]; then
        error "Failed to decrypt backup"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Create restore point
    local restore_point="/var/backups/pre-restore-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$restore_point"
    
    log "Creating restore point: $restore_point"
    
    # Backup current configurations before restore
    cp -r /etc/dangerprep "$restore_point/" 2>/dev/null || true
    cp /etc/ssh/sshd_config "$restore_point/" 2>/dev/null || true
    cp -r /etc/hostapd "$restore_point/" 2>/dev/null || true
    cp /etc/dnsmasq.conf "$restore_point/" 2>/dev/null || true
    
    # Extract and restore backup
    log "Extracting backup..."
    cd /
    tar -xzf "$decrypted_file"
    
    if [[ $? -eq 0 ]]; then
        log "Backup restored successfully"
        log "Restore point created at: $restore_point"
        
        # Restart services
        log "Restarting services..."
        systemctl restart ssh
        systemctl restart hostapd
        systemctl restart dnsmasq
        systemctl restart fail2ban
        
        log "Restore completed successfully"
    else
        error "Failed to extract backup"
        log "Original configurations preserved at: $restore_point"
    fi
    
    # Clean up temporary files
    rm -rf "$temp_dir"
}

interactive_restore() {
    list_backups
    echo
    read -p "Enter the number of the backup to restore (or 'q' to quit): " choice
    
    if [[ "$choice" == "q" ]]; then
        echo "Restore cancelled"
        return 0
    fi
    
    local backup_file=$(ls "$BACKUP_DIR"/*.enc 2>/dev/null | sed -n "${choice}p")
    
    if [[ -z "$backup_file" ]]; then
        error "Invalid selection"
        return 1
    fi
    
    echo "Selected backup: $(basename "$backup_file")"
    read -p "Are you sure you want to restore this backup? (y/N): " confirm
    
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        restore_backup "$backup_file"
    else
        echo "Restore cancelled"
    fi
}

case "${1:-interactive}" in
    restore)
        restore_backup "$2"
        ;;
    list)
        list_backups
        ;;
    interactive)
        interactive_restore
        ;;
    *)
        echo "DangerPrep Backup Restoration System"
        echo "Usage: $0 {restore <file>|list|interactive}"
        echo
        echo "Commands:"
        echo "  restore <file>  - Restore from specific backup file"
        echo "  list           - List available backups"
        echo "  interactive    - Interactive restore selection"
        exit 1
        ;;
esac
