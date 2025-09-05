#!/bin/bash
# DangerPrep User Migration Finalization Script
# This script manually completes the pi user cleanup process
# Run this as the new user with sudo privileges

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/dangerprep-user-migration.log"
BACKUP_DIR="/opt/dangerprep/backups/user-migration-$(date +%Y%m%d-%H%M%S)"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${BLUE}[DEBUG]${NC} $*" | tee -a "$LOG_FILE"
    fi
}

# Enhanced input function
enhanced_input() {
    local prompt="$1"
    local default="$2"
    local description="$3"
    
    echo
    echo -e "${BLUE}$prompt${NC}"
    if [[ -n "$description" ]]; then
        echo -e "${YELLOW}$description${NC}"
    fi
    if [[ -n "$default" ]]; then
        echo -n "[$default]: "
    else
        echo -n ": "
    fi
    
    local input
    read -r input
    echo "${input:-$default}"
}

# Enhanced confirmation function
enhanced_confirm() {
    local prompt="$1"
    local default="${2:-no}"
    
    echo
    echo -e "${YELLOW}$prompt${NC}"
    if [[ "$default" == "yes" ]]; then
        echo -n "[Y/n]: "
    else
        echo -n "[y/N]: "
    fi
    
    local response
    read -r response
    response="${response:-$default}"
    
    case "$response" in
        [Yy]|[Yy][Ee][Ss]) return 0 ;;
        *) return 1 ;;
    esac
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run with sudo privileges"
        echo "Usage: sudo $0"
        exit 1
    fi
}

# Check if pi user exists
check_pi_user() {
    if ! id pi >/dev/null 2>&1; then
        log_info "Pi user does not exist - migration already completed"
        return 1
    fi
    return 0
}

# Get current user (the one who ran sudo)
get_current_user() {
    local current_user="${SUDO_USER:-$(whoami)}"
    if [[ "$current_user" == "root" ]]; then
        log_error "Cannot determine the user who ran this script"
        log_error "Please run this script as your new user with sudo:"
        log_error "  sudo $0"
        exit 1
    fi
    echo "$current_user"
}

# Validate new user
validate_new_user() {
    local username="$1"
    
    if [[ "$username" == "pi" ]]; then
        log_error "Cannot finalize migration while logged in as pi user"
        log_error "Please log in as your new user account and run this script"
        exit 1
    fi
    
    if ! id "$username" >/dev/null 2>&1; then
        log_error "User $username does not exist"
        exit 1
    fi
    
    # Check if user has sudo privileges
    if ! groups "$username" | grep -q sudo; then
        log_error "User $username does not have sudo privileges"
        exit 1
    fi
    
    log_success "User $username validated successfully"
}

# Create backup directory
create_backup_dir() {
    mkdir -p "$BACKUP_DIR"
    log_info "Created backup directory: $BACKUP_DIR"
}

# Backup pi user data
backup_pi_user_data() {
    log_info "Creating backup of pi user data..."
    
    if [[ -d "/home/pi" ]]; then
        if tar -czf "$BACKUP_DIR/pi-home-backup.tar.gz" -C /home pi 2>/dev/null; then
            log_success "Pi user home directory backed up"
        else
            log_warn "Failed to backup pi user home directory"
        fi
    fi
    
    # Backup pi user crontab if it exists
    if crontab -u pi -l >/dev/null 2>&1; then
        crontab -u pi -l > "$BACKUP_DIR/pi-crontab.txt" 2>/dev/null || true
        log_success "Pi user crontab backed up"
    fi
}

# Terminate pi user processes
terminate_pi_processes() {
    log_info "Terminating pi user processes..."
    
    if pgrep -u pi >/dev/null 2>&1; then
        log_info "Found running processes for pi user, terminating..."
        
        # First try graceful termination
        pkill -TERM -u pi 2>/dev/null || true
        sleep 3
        
        # Check if any processes are still running
        if pgrep -u pi >/dev/null 2>&1; then
            log_warn "Some processes still running, force killing..."
            pkill -KILL -u pi 2>/dev/null || true
            sleep 2
        fi
        
        # Final check
        if pgrep -u pi >/dev/null 2>&1; then
            log_error "Failed to terminate all pi user processes"
            log_error "You may need to reboot the system to complete cleanup"
            return 1
        else
            log_success "All pi user processes terminated"
        fi
    else
        log_info "No running processes found for pi user"
    fi
}

# Remove pi user account
remove_pi_user() {
    log_info "Removing pi user account..."
    
    # Remove pi user with home directory
    if userdel -r pi 2>/dev/null; then
        log_success "Pi user removed successfully with home directory"
    elif userdel pi 2>/dev/null; then
        log_warn "Pi user removed but home directory may remain"
        # Clean up home directory manually
        if [[ -d "/home/pi" ]]; then
            log_info "Removing pi home directory manually..."
            rm -rf /home/pi 2>/dev/null || log_warn "Failed to remove pi home directory"
        fi
    else
        log_error "Failed to remove pi user account"
        return 1
    fi
    
    # Remove pi crontab if it exists
    rm -f /var/spool/cron/crontabs/pi 2>/dev/null || true
    
    log_success "Pi user account cleanup completed"
}

# Apply SSH hardening
apply_ssh_hardening() {
    local new_username="$1"
    
    log_info "Applying SSH hardening configuration..."
    
    # Get SSH port from current config or use default
    local ssh_port
    ssh_port=$(grep -E "^Port " /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "22")
    
    # Create SSH privilege separation directory if missing
    if [[ ! -d /run/sshd ]]; then
        log_info "Creating SSH privilege separation directory..."
        mkdir -p /run/sshd
        chmod 755 /run/sshd
    fi
    
    # Backup current SSH config
    cp /etc/ssh/sshd_config "$BACKUP_DIR/sshd_config.backup" 2>/dev/null || true
    
    # Apply hardened SSH configuration
    cat > /etc/ssh/sshd_config << EOF
# DangerPrep SSH Configuration - Hardened
Port $ssh_port

# Protocol and encryption
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_ecdsa_key

# Authentication
PermitRootLogin no
PubkeyAuthentication yes
AuthorizedKeysFile /home/%u/.ssh/authorized_keys
PasswordAuthentication no
PermitEmptyPasswords no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
GSSAPIAuthentication no
UsePAM yes

# Modern public key algorithms
PubkeyAcceptedAlgorithms ssh-ed25519,ecdsa-sha2-nistp256,ecdsa-sha2-nistp384,ecdsa-sha2-nistp521,rsa-sha2-512,rsa-sha2-256

# Security settings
X11Forwarding no
PrintMotd no
PrintLastLog yes
TCPKeepAlive no
StrictModes yes
IgnoreRhosts yes
HostbasedAuthentication no
PermitUserEnvironment no
Compression no
ClientAliveInterval 300
ClientAliveCountMax 2
LoginGraceTime 30
MaxAuthTries 3
MaxSessions 4
MaxStartups 10:30:60

# Modern ciphers and algorithms
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,hmac-sha2-256,hmac-sha2-512
KexAlgorithms curve25519-sha256@libssh.org,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512,diffie-hellman-group14-sha256

# User restrictions
AllowUsers $new_username
DenyUsers pi root

# Banner
Banner /etc/ssh/ssh_banner
EOF

    # Create SSH banner
    cat > /etc/ssh/ssh_banner << 'EOF'
================================================================================
                              AUTHORIZED ACCESS ONLY
================================================================================
This system is for authorized users only. All activities are monitored and
logged. Unauthorized access is strictly prohibited and will be prosecuted.
================================================================================
EOF

    # Test SSH configuration
    if sshd -t 2>/dev/null; then
        log_success "SSH configuration validated"
        systemctl restart ssh
        log_success "SSH service restarted with new configuration"
    else
        log_error "SSH configuration validation failed"
        # Restore backup
        if [[ -f "$BACKUP_DIR/sshd_config.backup" ]]; then
            cp "$BACKUP_DIR/sshd_config.backup" /etc/ssh/sshd_config
            log_warn "SSH configuration restored from backup"
        fi
        return 1
    fi
}

# Apply fail2ban configuration
apply_fail2ban_config() {
    log_info "Configuring fail2ban..."

    # Get SSH port from current config
    local ssh_port
    ssh_port=$(grep -E "^Port " /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "22")

    # Backup current fail2ban config
    if [[ -f /etc/fail2ban/jail.local ]]; then
        cp /etc/fail2ban/jail.local "$BACKUP_DIR/jail.local.backup" 2>/dev/null || true
    fi

    # Create fail2ban configuration
    cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
backend = systemd

[sshd]
enabled = true
port = $ssh_port
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
EOF

    # Restart fail2ban
    if systemctl restart fail2ban 2>/dev/null; then
        log_success "Fail2ban configured and restarted"
    else
        log_warn "Failed to restart fail2ban"
        return 1
    fi
}

# Clean up automatic finalization service
cleanup_auto_finalization() {
    log_info "Cleaning up automatic finalization service..."

    # Disable and remove the automatic finalization service
    systemctl disable dangerprep-finalize.service 2>/dev/null || true
    rm -f /etc/systemd/system/dangerprep-finalize.service 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-finalize.sh 2>/dev/null || true
    systemctl daemon-reload 2>/dev/null || true

    log_success "Automatic finalization service cleaned up"
}

# Update system configurations
update_system_configs() {
    local new_username="$1"

    log_info "Updating system configurations..."

    # Update any systemd services that run as pi user
    local service_files
    service_files=$(grep -r "User=pi" /etc/systemd/system/ 2>/dev/null | cut -d: -f1 | sort -u || true)
    if [[ -n "$service_files" ]]; then
        log_debug "Updating systemd services"
        while IFS= read -r service_file; do
            if [[ -f "$service_file" ]]; then
                sed -i "s/User=pi/User=$new_username/g" "$service_file"
                log_debug "Updated service: $service_file"
            fi
        done <<< "$service_files"
        systemctl daemon-reload
    fi

    # Update Docker Compose files that might reference pi user
    if [[ -d "/dangerprep/docker" ]]; then
        find /dangerprep/docker -name "*.yml" -o -name "*.yaml" | while read -r compose_file; do
            if grep -q "pi:" "$compose_file" 2>/dev/null; then
                log_debug "Updating Docker Compose file: $compose_file"
                sed -i "s/pi:/$new_username:/g" "$compose_file"
            fi
        done
    fi

    log_success "System configurations updated"
}

# Show completion summary
show_completion_summary() {
    local new_username="$1"

    echo
    echo "================================================================================"
    echo -e "${GREEN}DangerPrep User Migration Finalization Complete!${NC}"
    echo "================================================================================"
    echo
    echo -e "${BLUE}Summary:${NC}"
    echo "  • Pi user account has been removed"
    echo "  • SSH hardening has been applied"
    echo "  • Fail2ban has been configured"
    echo "  • System configurations have been updated"
    echo "  • Backup created at: $BACKUP_DIR"
    echo
    echo -e "${BLUE}Current user:${NC} $new_username"
    echo -e "${BLUE}SSH access:${NC} Configured and hardened"
    echo -e "${BLUE}Log file:${NC} $LOG_FILE"
    echo
    echo -e "${YELLOW}Important Notes:${NC}"
    echo "  • Make sure you can SSH with your new user before logging out"
    echo "  • The pi user has been completely removed from the system"
    echo "  • All pi user data has been backed up to $BACKUP_DIR"
    echo "  • SSH is now hardened with modern security settings"
    echo
    echo -e "${GREEN}Your DangerPrep system is now ready for use!${NC}"
    echo "================================================================================"
}

# Main function
main() {
    echo "================================================================================"
    echo -e "${BLUE}DangerPrep User Migration Finalization${NC}"
    echo "================================================================================"
    echo
    echo "This script will complete the pi user cleanup process by:"
    echo "  1. Validating the current user setup"
    echo "  2. Backing up pi user data"
    echo "  3. Terminating pi user processes"
    echo "  4. Removing the pi user account"
    echo "  5. Applying SSH hardening"
    echo "  6. Configuring fail2ban"
    echo "  7. Updating system configurations"
    echo

    # Pre-flight checks
    check_root

    if ! check_pi_user; then
        echo -e "${GREEN}Pi user migration already completed!${NC}"
        exit 0
    fi

    local current_user
    current_user=$(get_current_user)
    validate_new_user "$current_user"

    echo -e "${BLUE}Current user:${NC} $current_user"
    echo

    if ! enhanced_confirm "Proceed with pi user migration finalization?" "yes"; then
        log_info "User migration finalization cancelled"
        exit 0
    fi

    # Create backup directory
    create_backup_dir

    # Execute migration steps
    log_info "Starting pi user migration finalization..."

    backup_pi_user_data
    terminate_pi_processes
    remove_pi_user
    apply_ssh_hardening "$current_user"
    apply_fail2ban_config
    cleanup_auto_finalization
    update_system_configs "$current_user"

    show_completion_summary "$current_user"

    log_success "Pi user migration finalization completed successfully!"
}

# Error handling
cleanup_on_error() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Script failed with exit code $exit_code"
        echo
        echo -e "${RED}Migration finalization failed!${NC}"
        echo "Check the log file for details: $LOG_FILE"
        if [[ -d "$BACKUP_DIR" ]]; then
            echo "Backup directory: $BACKUP_DIR"
        fi
    fi
}

trap cleanup_on_error EXIT

# Run main function
main "$@"
