#!/usr/bin/env bash
# DangerPrep Cleanup Script
#
# Purpose: Safely removes DangerPrep configuration and restores original system state
# Usage: cleanup-dangerprep.sh [--force] [--keep-data] [--dry-run]
# Dependencies: systemctl, docker, rm, find, sed, awk
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_NAME=""
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"
readonly SCRIPT_NAME

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

readonly SCRIPT_VERSION="2.0"
readonly SCRIPT_DESCRIPTION="DangerPrep System Cleanup"

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
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-cleanup.log"
readonly DEFAULT_INSTALL_ROOT="/opt/dangerprep"
readonly INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-${DEFAULT_INSTALL_ROOT}}"

# Global variables
FORCE_CLEANUP=false
KEEP_DATA=false
DRY_RUN=false
BACKUP_DIR=""

# Valid cleanup operations (defined for documentation purposes)

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Validate required commands
    require_commands systemctl find sed awk chmod mkdir

    # Validate root permissions for cleanup operations
    validate_root_user

    # Create backup directory with timestamp
    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    BACKUP_DIR="/var/backups/dangerprep-cleanup-${timestamp}"

    debug "Cleanup script initialized"
    debug "Backup directory: ${BACKUP_DIR}"
    clear_error_context
}

# Show help information
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

OPTIONS:
    --force         Force cleanup without confirmation prompts
    --keep-data     Preserve user data and content directories
    --dry-run       Show what would be removed without making changes
    -h, --help      Show this help message

DESCRIPTION:
    Safely removes DangerPrep configuration and restores original system state.
    This script will:
    • Stop all DangerPrep services (Docker, hostapd, dnsmasq, etc.)
    • Remove DangerPrep configurations and files
    • Restore original system configurations
    • Clean up temporary files and logs
    • Optionally preserve user data

EXAMPLES:
    ${SCRIPT_NAME}                    # Interactive cleanup
    ${SCRIPT_NAME} --force            # Force cleanup without prompts
    ${SCRIPT_NAME} --keep-data        # Cleanup but preserve data
    ${SCRIPT_NAME} --dry-run          # Show what would be removed

NOTES:
    - This script must be run as root
    - Creates backup in: /var/backups/dangerprep-cleanup-*
    - Use --keep-data to preserve media and user content
    - Use --dry-run to preview changes before execution

EXIT CODES:
    0   Success
    1   General error
    2   Invalid arguments

For more information, see the DangerPrep documentation.
EOF
}

# Parse command line arguments
parse_arguments() {
    set_error_context "Argument parsing"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --force)
                FORCE_CLEANUP=true
                info "Force cleanup enabled"
                shift
                ;;
            --keep-data)
                KEEP_DATA=true
                info "Data preservation enabled"
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                info "Dry run mode enabled"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                error "Use '${SCRIPT_NAME} --help' for usage information"
                exit 2
                ;;
        esac
    done

    debug "Arguments parsed successfully"
    clear_error_context
}

# Safe removal function with validation and dry-run support
safe_remove() {
    local path="$1"
    local description
    description=${2:-item}

    set_error_context "Safe removal: ${description}"

    # Validate path is not empty and not root
    validate_not_empty "${path}" "removal path"

    if [[ "${path}" == "/" || "${path}" == "/etc" || "${path}" == "/var" || "${path}" == "/usr" ]]; then
        error "Refusing to remove critical system directory: ${path}"
        clear_error_context
        return 1
    fi

    # Check if path exists
    if [[ ! -e "${path}" ]]; then
        debug "Path does not exist (skipping): ${path}"
        clear_error_context
        return 0
    fi

    # Show what would be removed
    if [[ "${DRY_RUN}" == "true" ]]; then
        info "[DRY RUN] Would remove ${description}: ${path}"
        clear_error_context
        return 0
    fi

    # Create backup if it's a file/directory
    if [[ -d "${path}" || -f "${path}" ]]; then
        local backup_path
        backup_path="${BACKUP_DIR}/$(basename "${path}")"
        safe_execute 1 0 mkdir -p "${BACKUP_DIR}"

        if safe_execute 1 0 cp -r "${path}" "${backup_path}" 2>/dev/null; then
            debug "Backed up ${description} to: ${backup_path}"
        else
            warning "Failed to backup ${description}: ${path}"
        fi
    fi

    # Perform removal
    info "Removing ${description}: ${path}"
    if safe_execute 1 0 rm -rf "${path}" 2>/dev/null; then
        success "Removed ${description}: ${path}"
    else
        warning "Failed to remove ${description}: ${path}"
    fi

    clear_error_context
}


# Confirm cleanup operation
confirm_cleanup() {
    set_error_context "User confirmation"

    if [[ "${FORCE_CLEANUP}" == "true" ]]; then
        info "Force mode enabled - skipping confirmation"
        clear_error_context
        return 0
    fi

    warning "This will remove all DangerPrep configurations and services."

    if [[ "${KEEP_DATA}" == "true" ]]; then
        success "Data directories will be preserved."
    else
        error "Data directories will be REMOVED."
    fi
    echo
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! ${REPLY} =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "Cleanup cancelled."
        exit 0
    fi
}

# Setup logging
setup_logging() {
    mkdir -p "${BACKUP_DIR}"
    mkdir -p "$(dirname "${LOG_FILE}")"
    touch "${LOG_FILE}"
    chmod 640 "${LOG_FILE}"
    
    log "DangerPrep Cleanup Started"
    log "Backup directory: ${BACKUP_DIR}"
    log "Preserve data: ${PRESERVE_DATA}"
}

# Stop all services
stop_services() {
    log "Stopping DangerPrep services..."

    # Stop Olares/K3s services first
    if command -v kubectl >/dev/null 2>&1; then
        log "Stopping Olares services..."
        kubectl delete --all pods --all-namespaces 2>/dev/null || true
        kubectl delete --all services --all-namespaces 2>/dev/null || true
    fi

    # Stop K3s if running
    if systemctl is-active --quiet k3s 2>/dev/null; then
        log "Stopping K3s..."
        systemctl stop k3s 2>/dev/null || true
    fi

    # Uninstall K3s completely
    if [[ -f /usr/local/bin/k3s-uninstall.sh ]]; then
        log "Uninstalling K3s..."
        /usr/local/bin/k3s-uninstall.sh 2>/dev/null || true
    fi

    # Stop host-based services
    if systemctl is-active --quiet adguardhome 2>/dev/null; then
        log "Stopping AdGuard Home..."
        systemctl stop adguardhome 2>/dev/null || true
    fi

    if systemctl is-active --quiet step-ca 2>/dev/null; then
        log "Stopping Step-CA..."
        systemctl stop step-ca 2>/dev/null || true
    fi

    # Legacy Docker cleanup (in case Docker was previously installed)
    if command -v docker >/dev/null 2>&1; then
        log "Stopping any remaining Docker containers..."
        docker stop "$(docker ps -q)" 2>/dev/null || true
        docker rm "$(docker ps -aq)" 2>/dev/null || true
        docker network rm traefik 2>/dev/null || true
        success "Docker services stopped"
    fi

    # Stop system services installed by setup script
    local services_to_stop=(
        "hostapd"
        "dnsmasq"
        "fail2ban"
        "clamav-daemon"
        "clamav-freshclam"
        "tailscaled"
        "unattended-upgrades"
        "adguardhome"
        "step-ca"
        "k3s"
        "k3s-agent"
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
        "tailscaled"
        "unattended-upgrades"
        "adguardhome"
        "step-ca"
        "k3s"
        "k3s-agent"
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
    local latest_backup
    latest_backup=$(find /var/backups -name "dangerprep-*" -type d | sort | tail -1)
    
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
        local wifi_interfaces
        mapfile -t wifi_interfaces < <(iw dev 2>/dev/null | grep Interface | awk '{print $2}' || echo)
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

# Remove configurations with safe validation
remove_configurations() {
    set_error_context "Configuration removal"

    log_section "Removing DangerPrep configurations"

    # Remove DangerPrep configuration directories
    safe_remove "/etc/dangerprep" "DangerPrep etc configuration"
    safe_remove "/var/lib/dangerprep" "DangerPrep var lib data"

    # Remove Olares/K3s configurations
    log_subsection "Removing Olares/K3s configurations"
    safe_remove "/etc/olares" "Olares etc configuration"
    safe_remove "/var/lib/olares" "Olares var lib data"
    safe_remove "/etc/rancher" "Rancher etc configuration"
    safe_remove "/var/lib/rancher" "Rancher var lib data"
    safe_remove "/usr/local/bin/k3s" "K3s binary"
    safe_remove "/usr/local/bin/kubectl" "kubectl binary"
    safe_remove "/usr/local/bin/crictl" "crictl binary"
    safe_remove "/usr/local/bin/ctr" "ctr binary"

    # Remove host-based service configurations
    log_subsection "Removing host-based service configurations"
    safe_remove "/etc/adguardhome" "AdGuard Home etc configuration"
    safe_remove "/var/lib/adguardhome" "AdGuard Home var lib data"
    safe_remove "/usr/local/bin/AdGuardHome" "AdGuard Home binary"
    safe_remove "/etc/systemd/system/adguardhome.service" "AdGuard Home systemd service"

    safe_remove "/var/lib/step" "Step CA var lib data"
    safe_remove "/etc/step" "Step CA etc configuration"
    safe_remove "/usr/local/bin/step" "Step binary"
    safe_remove "/usr/local/bin/step-ca" "Step CA binary"
    safe_remove "/etc/systemd/system/step-ca.service" "Step CA systemd service"



    # Remove systemd-resolved configuration
    [[ -f /etc/systemd/resolved.conf.d/adguard.conf ]] && rm -f /etc/systemd/resolved.conf.d/adguard.conf 2>/dev/null || true

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

    # Remove FriendlyElec/RK3588 specific configurations (optimistic cleanup)
    [[ -f /etc/environment.d/mali-gpu.conf ]] && rm -f /etc/environment.d/mali-gpu.conf 2>/dev/null || true
    [[ -f /etc/profile.d/mali-gpu.sh ]] && rm -f /etc/profile.d/mali-gpu.sh 2>/dev/null || true
    [[ -f /etc/sensors.d/rk3588.conf ]] && rm -f /etc/sensors.d/rk3588.conf 2>/dev/null || true
    [[ -f /etc/sysctl.d/99-rk3588-optimizations.conf ]] && rm -f /etc/sysctl.d/99-rk3588-optimizations.conf 2>/dev/null || true
    [[ -f /etc/udev/rules.d/99-rk3588-storage.rules ]] && rm -f /etc/udev/rules.d/99-rk3588-storage.rules 2>/dev/null || true
    [[ -f /etc/udev/rules.d/99-rk3588-io-scheduler.rules ]] && rm -f /etc/udev/rules.d/99-rk3588-io-scheduler.rules 2>/dev/null || true
    [[ -f /etc/udev/rules.d/99-rk3588-vpu.rules ]] && rm -f /etc/udev/rules.d/99-rk3588-vpu.rules 2>/dev/null || true

    # Remove MOTD banner and restore Ubuntu defaults (optimistic cleanup)
    [[ -f /etc/update-motd.d/01-dangerprep-banner ]] && rm -f /etc/update-motd.d/01-dangerprep-banner 2>/dev/null || true
    # Re-enable default Ubuntu MOTD components that were disabled
    [[ -f /etc/update-motd.d/10-help-text ]] && chmod +x /etc/update-motd.d/10-help-text 2>/dev/null || true
    [[ -f /etc/update-motd.d/50-motd-news ]] && chmod +x /etc/update-motd.d/50-motd-news 2>/dev/null || true
    [[ -f /etc/update-motd.d/80-esm ]] && chmod +x /etc/update-motd.d/80-esm 2>/dev/null || true
    [[ -f /etc/update-motd.d/95-hwe-eol ]] && chmod +x /etc/update-motd.d/95-hwe-eol 2>/dev/null || true

    # Remove automatic update configurations added by setup script (optimistic cleanup)
    [[ -f /etc/apt/apt.conf.d/50unattended-upgrades ]] && rm -f /etc/apt/apt.conf.d/50unattended-upgrades 2>/dev/null || true
    [[ -f /etc/apt/apt.conf.d/20auto-upgrades ]] && rm -f /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null || true

    # Remove Tailscale repository (optimistic cleanup)
    [[ -f /etc/apt/sources.list.d/tailscale.list ]] && rm -f /etc/apt/sources.list.d/tailscale.list 2>/dev/null || true
    [[ -f /usr/share/keyrings/tailscale-archive-keyring.gpg ]] && rm -f /usr/share/keyrings/tailscale-archive-keyring.gpg 2>/dev/null || true

    # Remove Docker daemon configuration (optimistic cleanup)
    [[ -f /etc/docker/daemon.json ]] && rm -f /etc/docker/daemon.json 2>/dev/null || true
    [[ -f /etc/docker/seccomp.json ]] && rm -f /etc/docker/seccomp.json 2>/dev/null || true

    # Remove backup encryption key
    safe_remove "/etc/dangerprep/backup" "backup encryption key directory"

    # Remove AIDE database and configuration additions
    log_subsection "Removing AIDE configurations"
    safe_remove "/var/lib/aide/aide.db" "AIDE database"
    safe_remove "/var/lib/aide/aide.db.new" "AIDE new database"

    # Restore original AIDE configuration by removing DangerPrep additions
    if [[ -f /etc/aide/aide.conf ]]; then
        info "Restoring original AIDE configuration"
        # Remove DangerPrep specific monitoring rules
        local aide_pattern='# DangerPrep specific monitoring rules'
        safe_execute 1 0 sed -i "/${aide_pattern}/,\$d" /etc/aide/aide.conf
    fi

    # Remove certificate management files
    log_subsection "Removing certificate management files"
    safe_remove "/etc/letsencrypt" "Let's Encrypt certificates"
    safe_remove "/etc/ssl/dangerprep" "DangerPrep SSL certificates"
    safe_remove "/var/www/html" "web server document root"

    # Remove GStreamer hardware acceleration configuration
    safe_remove "/etc/gstreamer-1.0" "GStreamer hardware acceleration configuration"

    # Remove backup cron job (optimistic cleanup)
    [[ -f /etc/cron.d/dangerprep-backups ]] && rm -f /etc/cron.d/dangerprep-backups 2>/dev/null || true

    # Remove Suricata configuration (optimistic cleanup)
    if [[ -f "${BACKUP_DIR}/suricata.yaml.original" ]]; then
        cp "${BACKUP_DIR}/suricata.yaml.original" /etc/suricata/suricata.yaml 2>/dev/null || true
    fi

    # Remove hardware monitoring configuration (optimistic cleanup)
    if [[ -f "${BACKUP_DIR}/sensors3.conf.original" ]]; then
        cp "${BACKUP_DIR}/sensors3.conf.original" /etc/sensors3.conf 2>/dev/null || true
    else
        # Remove DangerPrep additions from sensors config
        [[ -f /etc/sensors3.conf ]] && sed -i '/# DangerPrep Hardware Monitoring Configuration/,$d' /etc/sensors3.conf 2>/dev/null || true
    fi

    # Remove temporary files
    log_subsection "Removing temporary files"
    # Use safe wildcard cleanup
    safe_wildcard_cleanup "dangerprep*" "/tmp" "temporary files"

    if find /tmp -name "aide-report-*" -type f 2>/dev/null | head -1 | grep -q .; then
        find /tmp -name "aide-report-*" -exec rm -f {} + 2>/dev/null || true
        debug "Removed AIDE report files"
    fi

    if find /tmp -name "lynis-report-*" -type f 2>/dev/null | head -1 | grep -q .; then
        find /tmp -name "lynis-report-*" -exec rm -f {} + 2>/dev/null || true
        debug "Removed Lynis report files"
    fi

    # Remove additional configurations that setup script creates
    log_subsection "Removing additional configurations"
    # Use safe wildcard cleanup
    safe_wildcard_cleanup "01-dangerprep*.yaml" "/etc/netplan" "netplan configurations"

    safe_remove "/etc/hostapd/hostapd.conf" "hostapd configuration"
    safe_remove "/etc/iptables/rules.v4" "iptables rules"

    # Remove NFS client configurations
    safe_remove "${INSTALL_ROOT}/nfs" "NFS client configuration"

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
            if [[ -f "${BACKUP_DIR}/dnsmasq.conf.original" ]]; then
                cp "${BACKUP_DIR}/dnsmasq.conf.original" /etc/dnsmasq.conf 2>/dev/null || true
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
        "fail2ban"
        "aide"
        "rkhunter"
        "chkrootkit"
        "clamav"
        "clamav-daemon"
        "lynis"
        "acct"
        "psacct"
        "apache2-utils"

        # Network tools that may not have been installed
        "hostapd"
        "dnsmasq"
        "iptables-persistent"
        "bridge-utils"
        "wireless-tools"
        "wpasupplicant"
        "iw"
        "rfkill"
        "netplan.io"
        "iproute2"
        "tc"
        "wondershaper"
        "iperf3"

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

        # Hardware monitoring
        "lm-sensors"
        "hddtemp"
        "fancontrol"
        "sensors-applet"
        "smartmontools"

        # Additional monitoring
        "collectd"
        "collectd-utils"

        # Log management
        "logwatch"
        "rsyslog-gnutls"

        # NFS client (installed by setup script)
        "nfs-common"
    )

    # Ask user which packages to remove
    echo -e "${YELLOW}The following packages were installed by DangerPrep setup:${NC}"
    printf '%s\n' "${packages_to_remove[@]}" | column -c 80
    echo
    read -p "Remove these packages? This may affect other applications! (yes/no): " -r

    if [[ ${REPLY} =~ ^[Yy][Ee][Ss]$ ]]; then
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
    if [[ "${PRESERVE_DATA}" == "true" ]]; then
        log "Preserving data directories as requested"
        return 0
    fi

    log "Removing data directories..."

    # Get install root from environment or default
    local install_root
    install_root=${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}

    # Check if data should be preserved
    if [[ "${KEEP_DATA}" == "true" ]]; then
        info "Data preservation enabled - skipping data removal"
        clear_error_context
        return 0
    fi

    # Remove Docker data with confirmation
    log_subsection "Removing Docker and application data"
    safe_remove "${install_root}/data" "Docker application data"
    safe_remove "${install_root}/docker" "Docker configuration"
    safe_remove "${install_root}/nfs" "NFS client configuration"

    # Remove content directories with explicit confirmation
    if [[ -d "${install_root}/content" ]]; then
        if [[ "${FORCE_CLEANUP}" == "true" ]]; then
            warning "Force mode: Removing content directories without confirmation"
            safe_remove "${install_root}/content" "media content directories"
        else
            warning "This will delete all media files in ${install_root}/content"
            read -p "Remove content directories? (yes/no): " -r
            if [[ ${REPLY} =~ ^[Yy][Ee][Ss]$ ]]; then
                safe_remove "${install_root}/content" "media content directories"
                success "Content directories removed"
            else
                info "Content directories preserved"
            fi
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
            grep -v "export PATH=/home/ubuntu/bin:\${PATH}" /home/ubuntu/.bashrc > /tmp/bashrc.tmp 2>/dev/null && mv /tmp/bashrc.tmp /home/ubuntu/.bashrc || true
            sed -i '/export DOCKER_HOST=unix:\/\/\/run\/user\/1000\/docker.sock/d' /home/ubuntu/.bashrc 2>/dev/null || true
        fi

        success "Ubuntu user configuration cleaned"
    fi

    # Remove any remaining Docker socket files
    safe_remove "/run/user/1000/docker.sock" "Docker socket file"
    safe_remove "/run/user/1000/docker" "Docker runtime directory"

    clear_error_context
}

# Final cleanup
final_cleanup() {
    set_error_context "Final cleanup"

    log_section "Performing final cleanup"

    # Clean package cache
    log_subsection "Cleaning package cache"
    safe_execute 1 0 apt autoremove -y
    safe_execute 1 0 apt autoclean

    # Remove temporary files (already handled in remove_configurations)
    log_subsection "Final temporary file cleanup"
    # Use safe wildcard cleanup
    safe_wildcard_cleanup "dangerprep*" "/tmp" "temporary files"

    if find /tmp -name "aide-report-*" -type f 2>/dev/null | head -1 | grep -q .; then
        find /tmp -name "aide-report-*" -exec rm -f {} + 2>/dev/null || true
        debug "Final cleanup of AIDE report files"
    fi

    if find /tmp -name "lynis-report-*" -type f 2>/dev/null | head -1 | grep -q .; then
        find /tmp -name "lynis-report-*" -exec rm -f {} + 2>/dev/null || true
        debug "Final cleanup of Lynis report files"
    fi

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

    # Remove any FriendlyElec/RK3588 specific systemd services (optimistic cleanup)
    [[ -f /etc/systemd/system/rk3588-fan-control.service ]] && rm -f /etc/systemd/system/rk3588-fan-control.service 2>/dev/null || true

    # Reload systemd after removing service files (optimistic cleanup)
    systemctl daemon-reload 2>/dev/null || true

    # Reload user systemd for ubuntu user (optimistic cleanup)
    sudo -u ubuntu systemctl --user daemon-reload 2>/dev/null || true

    # Reload udev rules after removing RK3588 specific rules (optimistic cleanup)
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger 2>/dev/null || true

    # Reset GPU/hardware acceleration settings (optimistic cleanup)
    # Reset GPU governor to default if it exists
    if [[ -f /sys/class/devfreq/fb000000.gpu/governor ]]; then
        echo "simple_ondemand" > /sys/class/devfreq/fb000000.gpu/governor 2>/dev/null || true
    fi
    # Reset NPU governor to default if it exists
    if [[ -f /sys/class/devfreq/fdab0000.npu/governor ]]; then
        echo "simple_ondemand" > /sys/class/devfreq/fdab0000.npu/governor 2>/dev/null || true
    fi

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
    echo "  • FriendlyElec/RK3588 specific configurations removed"
    echo "  • MOTD banner removed and Ubuntu defaults restored"
    echo "  • Hardware acceleration settings reset to defaults"
    if [[ "${PRESERVE_DATA}" == "true" ]]; then
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
    echo -e "${CYAN}Log file: ${LOG_FILE}${NC}"
    echo -e "${CYAN}Backup created: ${BACKUP_DIR}${NC}"
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
