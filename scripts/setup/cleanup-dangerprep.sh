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
    echo "  • Stop all DangerPrep services (Docker, hostapd, dnsmasq, etc.)"
    echo "  • Remove network configurations and restore originals"
    echo "  • Remove all DangerPrep configuration files and scripts"
    echo "  • Clean up user configurations (rootless Docker, etc.)"
    echo "  • Optionally remove installed packages"
    echo "  • Remove Docker containers and networks"
    echo "  • Optionally remove data directories"
    echo "  • Restore system to pre-DangerPrep state"
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

    # Stop Docker services (handle both rootless and regular Docker)
    if command -v docker >/dev/null 2>&1; then
        log "Stopping Docker containers..."

        # Try rootless Docker first
        if [[ -S "/run/user/1000/docker.sock" ]]; then
            sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker stop $(sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker ps -q) 2>/dev/null || true
            sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker rm $(sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker ps -aq) 2>/dev/null || true
            sudo -u ubuntu DOCKER_HOST="unix:///run/user/1000/docker.sock" docker network rm traefik 2>/dev/null || true
        else
            # Regular Docker
            docker stop $(docker ps -q) 2>/dev/null || true
            docker rm $(docker ps -aq) 2>/dev/null || true
            docker network rm traefik 2>/dev/null || true
        fi

        success "Docker services stopped"
    fi

    # Stop system services installed by setup script
    local services_to_stop=(
        "hostapd"
        "dnsmasq"
        "fail2ban"
        "cloudflared"
        "unbound"
        "clamav-daemon"
        "clamav-freshclam"
        "tailscaled"
        "unattended-upgrades"
        "docker"
    )

    for service in "${services_to_stop[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            log "Stopping $service..."
            systemctl stop "$service" 2>/dev/null || true
        fi
    done

    # Disable services that were enabled by setup script
    local services_to_disable=(
        "hostapd"
        "dnsmasq"
        "fail2ban"
        "cloudflared"
        "unbound"
        "tailscaled"
        "unattended-upgrades"
        "docker"
    )

    for service in "${services_to_disable[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            log "Disabling $service..."
            systemctl disable "$service" 2>/dev/null || true
        fi
    done

    success "System services stopped and disabled"
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

    # Reset hostapd default configuration
    if [[ -f /etc/default/hostapd ]]; then
        sed -i 's|DAEMON_CONF="/etc/hostapd/hostapd.conf"|#DAEMON_CONF=""|' /etc/default/hostapd
    fi

    # Reset NetworkManager management
    if command -v nmcli >/dev/null 2>&1; then
        local wifi_interfaces=($(iw dev 2>/dev/null | grep Interface | awk '{print $2}' || echo))
        for interface in "${wifi_interfaces[@]}"; do
            nmcli device set "$interface" managed yes 2>/dev/null || true
        done
    fi

    # Remove subuid/subgid entries for rootless Docker
    if [[ -f /etc/subuid ]]; then
        sed -i '/^ubuntu:/d' /etc/subuid 2>/dev/null || true
    fi
    if [[ -f /etc/subgid ]]; then
        sed -i '/^ubuntu:/d' /etc/subgid 2>/dev/null || true
    fi

    # Disable lingering for ubuntu user
    loginctl disable-linger ubuntu 2>/dev/null || true

    # Apply network changes
    netplan apply 2>/dev/null || true

    success "Network configuration restored"
}

# Remove configurations
remove_configurations() {
    log "Removing DangerPrep configurations..."

    # Remove configuration directories (optimistic cleanup)
    [[ -d /etc/dangerprep ]] && rm -rf /etc/dangerprep 2>/dev/null || true
    [[ -d /var/lib/dangerprep ]] && rm -rf /var/lib/dangerprep 2>/dev/null || true
    [[ -d /etc/cloudflared ]] && rm -rf /etc/cloudflared 2>/dev/null || true
    [[ -f /etc/unbound/unbound.conf.d/dangerprep.conf ]] && rm -f /etc/unbound/unbound.conf.d/dangerprep.conf 2>/dev/null || true
    [[ -f /var/lib/unbound/root.hints ]] && rm -f /var/lib/unbound/root.hints 2>/dev/null || true

    # Remove security tools configurations and cron jobs (optimistic cleanup)
    [[ -f /etc/cron.d/aide-check ]] && rm -f /etc/cron.d/aide-check 2>/dev/null || true
    [[ -f /etc/cron.d/antivirus-scan ]] && rm -f /etc/cron.d/antivirus-scan 2>/dev/null || true
    [[ -f /etc/cron.d/security-audit ]] && rm -f /etc/cron.d/security-audit 2>/dev/null || true
    [[ -f /etc/cron.d/rootkit-scan ]] && rm -f /etc/cron.d/rootkit-scan 2>/dev/null || true
    [[ -f /etc/cron.d/dangerprep-backups ]] && rm -f /etc/cron.d/dangerprep-backups 2>/dev/null || true
    [[ -f /etc/cron.d/dangerprep-monitor ]] && rm -f /etc/cron.d/dangerprep-monitor 2>/dev/null || true

    # Remove new cron jobs (optimistic cleanup)
    [[ -f /etc/cron.d/hardware-monitor ]] && rm -f /etc/cron.d/hardware-monitor 2>/dev/null || true
    [[ -f /etc/cron.d/container-health ]] && rm -f /etc/cron.d/container-health 2>/dev/null || true
    [[ -f /etc/cron.d/suricata-monitor ]] && rm -f /etc/cron.d/suricata-monitor 2>/dev/null || true
    [[ -f /etc/cron.d/cert-renewal ]] && rm -f /etc/cron.d/cert-renewal 2>/dev/null || true

    # Remove all DangerPrep scripts (optimistic cleanup)
    rm -f /usr/local/bin/dangerprep-* 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep 2>/dev/null || true
    rm -f /usr/local/bin/cloudflared 2>/dev/null || true

    # Remove scenario scripts (optimistic cleanup)
    rm -f /usr/local/bin/dangerprep-scenario1 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-scenario2 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-scenario3 2>/dev/null || true

    # Remove new management scripts (optimistic cleanup)
    rm -f /usr/local/bin/dangerprep-hardware-monitor 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-qos 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-certs 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-cert-renew 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-container-health 2>/dev/null || true
    rm -f /usr/local/bin/dangerprep-suricata-monitor 2>/dev/null || true

    # Remove log files and directories (optimistic cleanup)
    rm -f /var/log/dangerprep*.log 2>/dev/null || true
    rm -f /var/log/aide-check.log 2>/dev/null || true
    rm -f /var/log/clamav-scan.log 2>/dev/null || true
    rm -f /var/log/lynis-audit.log 2>/dev/null || true
    rm -f /var/log/rkhunter-scan.log 2>/dev/null || true
    rm -f /var/log/dnsmasq.log 2>/dev/null || true

    # Remove new log files (optimistic cleanup)
    rm -f /var/log/dangerprep-hardware.log 2>/dev/null || true
    rm -f /var/log/dangerprep-container-health.log 2>/dev/null || true
    rm -f /var/log/dangerprep-suricata-alerts.log 2>/dev/null || true

    # Remove fail2ban custom configurations (optimistic cleanup)
    [[ -f /etc/fail2ban/jail.local ]] && rm -f /etc/fail2ban/jail.local 2>/dev/null || true
    [[ -f /etc/fail2ban/filter.d/nginx-botsearch.conf ]] && rm -f /etc/fail2ban/filter.d/nginx-botsearch.conf 2>/dev/null || true

    # Remove SSH banner (optimistic cleanup)
    [[ -f /etc/ssh/ssh_banner ]] && rm -f /etc/ssh/ssh_banner 2>/dev/null || true

    # Remove automatic update configurations added by setup script (optimistic cleanup)
    [[ -f /etc/apt/apt.conf.d/50unattended-upgrades ]] && rm -f /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null || true
    [[ -f /etc/apt/apt.conf.d/20auto-upgrades ]] && rm -f /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null || true

    # Remove Tailscale repository (optimistic cleanup)
    [[ -f /etc/apt/sources.list.d/tailscale.list ]] && rm -f /etc/apt/sources.list.d/tailscale.list 2>/dev/null || true
    [[ -f /usr/share/keyrings/tailscale-archive-keyring.gpg ]] && rm -f /usr/share/keyrings/tailscale-archive-keyring.gpg 2>/dev/null || true

    # Remove Docker daemon configuration (optimistic cleanup)
    [[ -f /etc/docker/daemon.json ]] && rm -f /etc/docker/daemon.json 2>/dev/null || true
    [[ -f /etc/docker/seccomp.json ]] && rm -f /etc/docker/seccomp.json 2>/dev/null || true

    # Remove backup encryption key (optimistic cleanup)
    [[ -d /etc/dangerprep/backup ]] && rm -rf /etc/dangerprep/backup 2>/dev/null || true

    # Remove AIDE database and configuration additions (optimistic cleanup)
    [[ -f /var/lib/aide/aide.db ]] && rm -f /var/lib/aide/aide.db 2>/dev/null || true
    [[ -f /var/lib/aide/aide.db.new ]] && rm -f /var/lib/aide/aide.db.new 2>/dev/null || true

    # Restore original AIDE configuration by removing DangerPrep additions (optimistic cleanup)
    if [[ -f /etc/aide/aide.conf ]]; then
        # Remove DangerPrep specific monitoring rules
        sed -i '/# DangerPrep specific monitoring rules/,$d' /etc/aide/aide.conf 2>/dev/null || true
    fi

    # Remove certificate management files (optimistic cleanup)
    [[ -d /etc/letsencrypt ]] && rm -rf /etc/letsencrypt 2>/dev/null || true
    [[ -d /etc/ssl/dangerprep ]] && rm -rf /etc/ssl/dangerprep 2>/dev/null || true
    [[ -d /var/www/html ]] && rm -rf /var/www/html 2>/dev/null || true

    # Remove Suricata configuration (optimistic cleanup)
    if [[ -f "$BACKUP_DIR/suricata.yaml.original" ]]; then
        cp "$BACKUP_DIR/suricata.yaml.original" /etc/suricata/suricata.yaml 2>/dev/null || true
    fi

    # Remove hardware monitoring configuration (optimistic cleanup)
    if [[ -f "$BACKUP_DIR/sensors3.conf.original" ]]; then
        cp "$BACKUP_DIR/sensors3.conf.original" /etc/sensors3.conf 2>/dev/null || true
    else
        # Remove DangerPrep additions from sensors config
        [[ -f /etc/sensors3.conf ]] && sed -i '/# DangerPrep Hardware Monitoring Configuration/,$d' /etc/sensors3.conf 2>/dev/null || true
    fi

    # Remove temporary files (optimistic cleanup)
    rm -rf /tmp/dangerprep* 2>/dev/null || true
    rm -rf /tmp/aide-report-* 2>/dev/null || true
    rm -rf /tmp/lynis-report-* 2>/dev/null || true

    # Remove additional configurations that setup script creates
    [[ -f /etc/netplan/01-dangerprep*.yaml ]] && rm -f /etc/netplan/01-dangerprep*.yaml 2>/dev/null || true
    [[ -f /etc/hostapd/hostapd.conf ]] && rm -f /etc/hostapd/hostapd.conf 2>/dev/null || true
    [[ -f /etc/iptables/rules.v4 ]] && rm -f /etc/iptables/rules.v4 2>/dev/null || true

    # Remove NFS client configurations (optimistic cleanup)
    [[ -d "$INSTALL_ROOT/nfs" ]] && rm -rf "$INSTALL_ROOT/nfs" 2>/dev/null || true

    # Remove sysctl modifications made by setup script (optimistic cleanup)
    if [[ -f /etc/sysctl.conf ]]; then
        # Remove IP forwarding line added by setup script
        sed -i '/net.ipv4.ip_forward=1/d' /etc/sysctl.conf 2>/dev/null || true
    fi

    # Remove hostapd default configuration modifications (optimistic cleanup)
    if [[ -f /etc/default/hostapd ]]; then
        sed -i 's|DAEMON_CONF="/etc/hostapd/hostapd.conf"|#DAEMON_CONF=""|' /etc/default/hostapd 2>/dev/null || true
    fi

    # Remove dnsmasq configuration created by setup script (optimistic cleanup)
    if [[ -f /etc/dnsmasq.conf ]]; then
        # Check if it's the minimal config created by setup script
        if grep -q "# Minimal dnsmasq config for WiFi hotspot DHCP only" /etc/dnsmasq.conf 2>/dev/null; then
            # Restore original or remove if it was created by setup
            if [[ -f "$BACKUP_DIR/dnsmasq.conf.original" ]]; then
                cp "$BACKUP_DIR/dnsmasq.conf.original" /etc/dnsmasq.conf 2>/dev/null || true
            else
                # Remove the file if no original backup exists
                rm -f /etc/dnsmasq.conf 2>/dev/null || true
            fi
        fi
    fi

    success "Configurations removed"
}

# Remove packages installed by setup script
remove_packages() {
    log "Removing packages installed by DangerPrep setup..."

    # Packages that were specifically installed by setup script
    local packages_to_remove=(
        # Security tools that may not have been on system before
        "aide"
        "rkhunter"
        "chkrootkit"
        "clamav"
        "clamav-daemon"
        "lynis"
        "ossec-hids"
        "acct"
        "psacct"

        # Network tools that may not have been installed
        "hostapd"
        "dnsmasq"
        "iptables-persistent"
        "bridge-utils"
        "wireless-tools"
        "wpasupplicant"
        "iw"
        "rfkill"

        # DNS tools
        "unbound"
        "unbound-anchor"

        # Backup tools
        "borgbackup"
        "restic"

        # Tailscale
        "tailscale"

        # Automatic updates
        "unattended-upgrades"

        # Security hardening
        "apparmor"
        "apparmor-utils"
        "libpam-pwquality"
        "libpam-tmpdir"

        # Hardware monitoring (new)
        "lm-sensors"
        "hddtemp"
        "fancontrol"
        "sensors-applet"

        # Certificate management (new)
        "certbot"
        "python3-certbot-nginx"

        # Traffic control and QoS (new)
        "wondershaper"
        "iperf3"

        # Additional monitoring (new)
        "collectd"
        "collectd-utils"

        # Log management (new)
        "logwatch"
        "rsyslog-gnutls"

        # Advanced security (new)
        "suricata"
    )

    # Ask user which packages to remove
    echo -e "${YELLOW}The following packages were installed by DangerPrep setup:${NC}"
    printf '%s\n' "${packages_to_remove[@]}" | column -c 80
    echo
    read -p "Remove these packages? This may affect other applications! (yes/no): " -r

    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "Removing DangerPrep packages..."

        for package in "${packages_to_remove[@]}"; do
            if dpkg -l 2>/dev/null | grep -q "^ii.*$package " 2>/dev/null; then
                log "Removing $package..."
                DEBIAN_FRONTEND=noninteractive apt remove -y "$package" 2>/dev/null || warning "Failed to remove $package"
            fi
        done

        # Clean up package dependencies (optimistic cleanup)
        apt autoremove -y 2>/dev/null || true
        apt autoclean 2>/dev/null || true

        success "Packages removed"
    else
        info "Packages preserved"
    fi
}

# Remove data directories
remove_data() {
    if [[ "$PRESERVE_DATA" == "true" ]]; then
        log "Preserving data directories as requested"
        return 0
    fi

    log "Removing data directories..."

    # Get install root from environment or default
    local install_root="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"

    # Remove Docker data
    rm -rf "$install_root/data" 2>/dev/null || true
    rm -rf "$install_root/docker" 2>/dev/null || true
    rm -rf "$install_root/nfs" 2>/dev/null || true

    # Remove content directories (be careful here)
    if [[ -d "$install_root/content" ]]; then
        echo -e "${RED}WARNING: This will delete all media files in $install_root/content${NC}"
        read -p "Remove content directories? (yes/no): " -r
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            rm -rf "$install_root/content" 2>/dev/null || true
            success "Content directories removed"
        else
            info "Content directories preserved"
        fi
    fi

    # Remove entire install directory if empty
    if [[ -d "$install_root" ]]; then
        if [[ -z "$(ls -A "$install_root" 2>/dev/null)" ]]; then
            rmdir "$install_root" 2>/dev/null || true
            success "Empty install directory removed"
        else
            info "Install directory preserved (contains files)"
        fi
    fi
}

# Clean up user configurations
cleanup_user_configs() {
    log "Cleaning up user configurations..."

    # Clean up ubuntu user's rootless Docker configuration
    if [[ -d /home/ubuntu ]]; then
        log "Cleaning ubuntu user rootless Docker configuration..."

        # Stop rootless Docker service for ubuntu user
        sudo -u ubuntu systemctl --user stop docker 2>/dev/null || true
        sudo -u ubuntu systemctl --user disable docker 2>/dev/null || true

        # Remove rootless Docker files
        rm -rf /home/ubuntu/.config/systemd/user/docker.service 2>/dev/null || true
        rm -rf /home/ubuntu/bin/docker* 2>/dev/null || true

        # Clean up .bashrc modifications
        if [[ -f /home/ubuntu/.bashrc ]]; then
            sed -i '/export PATH=\/home\/ubuntu\/bin:\$PATH/d' /home/ubuntu/.bashrc 2>/dev/null || true
            sed -i '/export DOCKER_HOST=unix:\/\/\/run\/user\/1000\/docker.sock/d' /home/ubuntu/.bashrc 2>/dev/null || true
        fi

        success "Ubuntu user configuration cleaned"
    fi

    # Remove any remaining Docker socket files
    rm -f /run/user/1000/docker.sock 2>/dev/null || true
    rm -rf /run/user/1000/docker 2>/dev/null || true
}

# Final cleanup
final_cleanup() {
    log "Performing final cleanup..."

    # Clean package cache
    apt autoremove -y 2>/dev/null || true
    apt autoclean 2>/dev/null || true

    # Remove temporary files
    rm -rf /tmp/dangerprep* 2>/dev/null || true
    rm -rf /tmp/aide-report-* 2>/dev/null || true
    rm -rf /tmp/lynis-report-* 2>/dev/null || true

    # Clean up systemd
    systemctl daemon-reload 2>/dev/null || true

    # Remove any remaining DangerPrep systemd services (optimistic cleanup)
    [[ -f /etc/systemd/system/cloudflared.service ]] && rm -f /etc/systemd/system/cloudflared.service 2>/dev/null || true
    rm -f /etc/systemd/system/dangerprep*.service 2>/dev/null || true

    # Remove systemd user services for ubuntu user (optimistic cleanup)
    if [[ -d /home/ubuntu/.config/systemd/user ]]; then
        [[ -f /home/ubuntu/.config/systemd/user/docker.service ]] && rm -f /home/ubuntu/.config/systemd/user/docker.service 2>/dev/null || true
        # Remove directory if empty
        rmdir /home/ubuntu/.config/systemd/user 2>/dev/null || true
        rmdir /home/ubuntu/.config/systemd 2>/dev/null || true
        rmdir /home/ubuntu/.config 2>/dev/null || true
    fi

    # Reload systemd after removing service files (optimistic cleanup)
    systemctl daemon-reload 2>/dev/null || true

    # Reload user systemd for ubuntu user (optimistic cleanup)
    sudo -u ubuntu systemctl --user daemon-reload 2>/dev/null || true

    # Reset iptables to completely clean state (optimistic cleanup)
    iptables -F 2>/dev/null || true
    iptables -t nat -F 2>/dev/null || true
    iptables -t mangle -F 2>/dev/null || true
    iptables -X 2>/dev/null || true
    iptables -P INPUT ACCEPT 2>/dev/null || true
    iptables -P FORWARD ACCEPT 2>/dev/null || true
    iptables -P OUTPUT ACCEPT 2>/dev/null || true

    # Remove iptables rules file (optimistic cleanup)
    [[ -f /etc/iptables/rules.v4 ]] && rm -f /etc/iptables/rules.v4 2>/dev/null || true

    success "Final cleanup completed"
}

# Show completion message
show_completion() {
    success "DangerPrep cleanup completed successfully!"
    echo
    echo -e "${GREEN}System Status:${NC}"
    echo "  • All DangerPrep services stopped and disabled"
    echo "  • Network configuration restored to original state"
    echo "  • All DangerPrep configurations and scripts removed"
    echo "  • User configurations cleaned (rootless Docker, etc.)"
    echo "  • Docker containers and networks removed"
    echo "  • Security tools configurations removed"
    echo "  • Firewall rules reset to default"
    echo "  • Cron jobs and automated tasks removed"
    if [[ "$PRESERVE_DATA" == "true" ]]; then
        echo "  • Data directories preserved"
    else
        echo "  • Data directories removed"
    fi
    echo
    echo -e "${YELLOW}Important Notes:${NC}"
    echo "  • SSH configuration has been restored (check port settings)"
    echo "  • Some packages may have been removed (check if other apps are affected)"
    echo "  • Network interfaces have been reset to NetworkManager control"
    echo "  • Tailscale may need to be reconfigured if you plan to use it again"
    echo
    echo -e "${CYAN}Log file: $LOG_FILE${NC}"
    echo -e "${CYAN}Backup created: $BACKUP_DIR${NC}"
    echo
    echo "The system has been restored to its pre-DangerPrep state."
    echo -e "${GREEN}Reboot recommended to ensure all changes take effect.${NC}"
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
    cleanup_user_configs
    remove_packages
    remove_data
    final_cleanup
    show_completion
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
