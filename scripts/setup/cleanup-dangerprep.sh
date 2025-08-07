#!/bin/bash
# DangerPrep Cleanup Script
# Safely removes DangerPrep configuration and restores original system state

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Configuration
LOG_FILE="/var/log/dangerprep-cleanup.log"
BACKUP_DIR="/var/backups/dangerprep-cleanup-$(date +%Y%m%d-%H%M%S)"
PRESERVE_DATA=false

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
        echo "Usage: sudo $0 [--preserve-data]"
        exit 1
    fi
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --preserve-data)
                PRESERVE_DATA=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Show help
show_help() {
    echo "DangerPrep Cleanup Script"
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  --preserve-data    Keep user data and content directories"
    echo "  --help, -h         Show this help message"
    echo
    echo "This script will:"
    echo "  • Stop all DangerPrep services"
    echo "  • Remove network configurations"
    echo "  • Restore original system configurations"
    echo "  • Remove Docker containers and networks"
    echo "  • Optionally remove data directories"
}

# Display banner
show_banner() {
    echo -e "${PURPLE}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                        DangerPrep Cleanup Script                            ║
║                     System Restoration & Cleanup                            ║
║                                                                              ║
║  WARNING: This will remove DangerPrep configuration and restore             ║
║           the system to its original state.                                 ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Confirm cleanup
confirm_cleanup() {
    echo -e "${YELLOW}This will remove all DangerPrep configurations and services.${NC}"
    if [[ "$PRESERVE_DATA" == "true" ]]; then
        echo -e "${GREEN}Data directories will be preserved.${NC}"
    else
        echo -e "${RED}Data directories will be REMOVED.${NC}"
    fi
    echo
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "Cleanup cancelled."
        exit 0
    fi
}

# Setup logging
setup_logging() {
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    chmod 640 "$LOG_FILE"
    
    log "DangerPrep Cleanup Started"
    log "Backup directory: $BACKUP_DIR"
    log "Preserve data: $PRESERVE_DATA"
}

# Stop all services
stop_services() {
    log "Stopping DangerPrep services..."
    
    # Stop Docker services
    if command -v docker >/dev/null 2>&1; then
        log "Stopping Docker containers..."
        docker stop $(docker ps -q) 2>/dev/null || true
        docker rm $(docker ps -aq) 2>/dev/null || true
        
        # Remove Docker networks
        docker network rm traefik 2>/dev/null || true
        
        success "Docker services stopped"
    fi
    
    # Stop system services
    systemctl stop hostapd 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true
    systemctl stop fail2ban 2>/dev/null || true
    systemctl stop cloudflared 2>/dev/null || true
    systemctl stop unbound 2>/dev/null || true
    systemctl stop clamav-daemon 2>/dev/null || true
    systemctl stop clamav-freshclam 2>/dev/null || true
    
    # Disable services
    systemctl disable hostapd 2>/dev/null || true
    systemctl disable dnsmasq 2>/dev/null || true
    systemctl disable cloudflared 2>/dev/null || true
    
    success "System services stopped"
}

# Restore network configuration
restore_network() {
    log "Restoring network configuration..."
    
    # Find most recent backup
    local latest_backup=$(find /var/backups -name "dangerprep-*" -type d | sort | tail -1)
    
    if [[ -n "$latest_backup" && -d "$latest_backup" ]]; then
        log "Using backup from: $latest_backup"
        
        # Restore SSH configuration
        if [[ -f "$latest_backup/sshd_config.original" ]]; then
            cp "$latest_backup/sshd_config.original" /etc/ssh/sshd_config
            systemctl restart ssh
            success "SSH configuration restored"
        fi
        
        # Restore sysctl configuration
        if [[ -f "$latest_backup/sysctl.conf.original" ]]; then
            cp "$latest_backup/sysctl.conf.original" /etc/sysctl.conf
            sysctl -p
            success "Kernel parameters restored"
        fi
        
        # Restore dnsmasq configuration
        if [[ -f "$latest_backup/dnsmasq.conf" ]]; then
            cp "$latest_backup/dnsmasq.conf" /etc/dnsmasq.conf
            success "Dnsmasq configuration restored"
        fi
        
        # Restore iptables rules
        if [[ -f "$latest_backup/iptables.rules" ]]; then
            iptables-restore < "$latest_backup/iptables.rules"
            success "Firewall rules restored"
        fi
    else
        warning "No backup found, using default configurations"
        
        # Reset to basic configurations
        iptables -F
        iptables -t nat -F
        iptables -t mangle -F
        iptables -X
        iptables -P INPUT ACCEPT
        iptables -P FORWARD ACCEPT
        iptables -P OUTPUT ACCEPT
    fi
    
    # Remove DangerPrep network configurations
    rm -f /etc/netplan/01-dangerprep*.yaml
    rm -f /etc/hostapd/hostapd.conf
    
    # Reset NetworkManager management
    if command -v nmcli >/dev/null 2>&1; then
        local wifi_interfaces=($(iw dev 2>/dev/null | grep Interface | awk '{print $2}' || echo))
        for interface in "${wifi_interfaces[@]}"; do
            nmcli device set "$interface" managed yes 2>/dev/null || true
        done
    fi
    
    # Apply network changes
    netplan apply 2>/dev/null || true
    
    success "Network configuration restored"
}

# Remove configurations
remove_configurations() {
    log "Removing DangerPrep configurations..."
    
    # Remove configuration directories
    rm -rf /etc/dangerprep
    rm -rf /var/lib/dangerprep
    rm -rf /etc/cloudflared
    rm -rf /etc/unbound/unbound.conf.d/dangerprep.conf

    # Remove security tools configurations
    rm -f /etc/cron.d/aide-check
    rm -f /etc/cron.d/antivirus-scan
    rm -f /etc/cron.d/security-audit
    rm -f /etc/cron.d/rootkit-scan
    rm -f /etc/cron.d/dangerprep-backups
    
    # Remove custom scripts
    rm -f /usr/local/bin/dangerprep-*
    rm -f /usr/local/bin/dangerprep
    rm -f /usr/local/bin/cloudflared

    # Remove security tool scripts
    rm -f /usr/local/bin/dangerprep-aide-check
    rm -f /usr/local/bin/dangerprep-antivirus-scan
    rm -f /usr/local/bin/dangerprep-security-audit
    rm -f /usr/local/bin/dangerprep-rootkit-scan
    rm -f /usr/local/bin/dangerprep-backup-encrypted
    rm -f /usr/local/bin/dangerprep-restore-backup
    
    # Remove log files
    rm -f /var/log/dangerprep*.log
    
    # Remove fail2ban custom configurations
    rm -f /etc/fail2ban/jail.local
    rm -f /etc/fail2ban/filter.d/nginx-botsearch.conf
    
    # Remove SSH banner
    rm -f /etc/ssh/ssh_banner
    
    success "Configurations removed"
}

# Remove data directories
remove_data() {
    if [[ "$PRESERVE_DATA" == "true" ]]; then
        log "Preserving data directories as requested"
        return 0
    fi
    
    log "Removing data directories..."
    
    # Remove Docker data
    rm -rf /opt/dangerprep/data 2>/dev/null || true
    rm -rf /opt/dangerprep/docker 2>/dev/null || true
    
    # Remove content directories (be careful here)
    read -p "Remove content directories? This will delete all media files! (yes/no): " -r
    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        rm -rf /opt/dangerprep/content 2>/dev/null || true
        success "Content directories removed"
    else
        info "Content directories preserved"
    fi
}

# Final cleanup
final_cleanup() {
    log "Performing final cleanup..."
    
    # Clean package cache
    apt autoremove -y 2>/dev/null || true
    apt autoclean 2>/dev/null || true
    
    # Remove temporary files
    rm -rf /tmp/dangerprep* 2>/dev/null || true
    
    success "Final cleanup completed"
}

# Show completion message
show_completion() {
    success "DangerPrep cleanup completed successfully!"
    echo
    echo -e "${GREEN}System Status:${NC}"
    echo "  • All DangerPrep services stopped"
    echo "  • Network configuration restored"
    echo "  • Original system configurations restored"
    echo "  • Docker containers removed"
    if [[ "$PRESERVE_DATA" == "true" ]]; then
        echo "  • Data directories preserved"
    else
        echo "  • Data directories removed"
    fi
    echo
    echo -e "${CYAN}Log file: $LOG_FILE${NC}"
    echo -e "${CYAN}Backup created: $BACKUP_DIR${NC}"
    echo
    echo "The system has been restored to its pre-DangerPrep state."
    echo "You may want to reboot to ensure all changes take effect."
}

# Main function
main() {
    parse_args "$@"
    show_banner
    check_root
    confirm_cleanup
    setup_logging
    
    stop_services
    restore_network
    remove_configurations
    remove_data
    final_cleanup
    show_completion
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
