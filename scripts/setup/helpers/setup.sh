#!/usr/bin/env bash
# DangerPrep Setup Helper Functions
#
# Purpose: Consolidated setup functions with common patterns
# Usage: Source this file to access setup functions
# Dependencies: logging.sh, errors.sh, services.sh, configure.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Get the directory where this script is located
SETUP_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${SETUP_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${SETUP_HELPER_DIR}/../../shared/errors.sh"
fi

if [[ -z "${SERVICES_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./services.sh
    source "${SETUP_HELPER_DIR}/services.sh"
fi

if [[ -z "${CONFIGURE_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./configure.sh
    source "${SETUP_HELPER_DIR}/configure.sh"
fi

# Mark this file as sourced
export SETUP_HELPER_SOURCED=true

#
# Common Setup Patterns
#

# Generic setup function with common pattern
# Usage: setup_with_config "service_name" "config_loader" [additional_commands...]
setup_with_config() {
    local service_name="$1"
    local config_loader="$2"
    shift 2
    
    if [[ -z "$service_name" ]] || [[ -z "$config_loader" ]]; then
        error "Service name and config loader are required"
        return 1
    fi
    
    log "Setting up $service_name..."
    
    # Load configuration
    if command -v "$config_loader" >/dev/null 2>&1; then
        "$config_loader"
    else
        error "Configuration loader not found: $config_loader"
        return 1
    fi
    
    # Execute additional commands
    for cmd in "$@"; do
        if ! eval "$cmd"; then
            error "Failed to execute command: $cmd"
            return 1
        fi
    done
    
    success "$service_name setup completed"
    return 0
}

# Setup service with systemctl operations
# Usage: setup_service "service_name" "config_loader" [systemctl_actions...]
setup_service() {
    local service_name="$1"
    local config_loader="$2"
    shift 2
    
    if [[ -z "$service_name" ]] || [[ -z "$config_loader" ]]; then
        error "Service name and config loader are required"
        return 1
    fi
    
    log "Setting up $service_name service..."
    
    # Load configuration
    if ! "$config_loader"; then
        error "Failed to load configuration for $service_name"
        return 1
    fi
    
    # Apply systemctl actions
    for action in "$@"; do
        case "$action" in
            "enable")
                systemctl enable "$service_name"
                ;;
            "start")
                systemctl start "$service_name"
                ;;
            "enable-start")
                systemctl enable "$service_name"
                systemctl start "$service_name"
                ;;
            "restart")
                systemctl restart "$service_name"
                ;;
            *)
                if ! eval "$action"; then
                    warning "Failed to execute action: $action"
                fi
                ;;
        esac
    done
    
    success "$service_name service setup completed"
    return 0
}

# Setup with initialization and configuration
# Usage: setup_with_init "service_name" "init_command" "config_loader"
setup_with_init() {
    local service_name="$1"
    local init_command="$2"
    local config_loader="$3"
    
    if [[ -z "$service_name" ]] || [[ -z "$init_command" ]] || [[ -z "$config_loader" ]]; then
        error "Service name, init command, and config loader are required"
        return 1
    fi
    
    log "Setting up $service_name with initialization..."
    
    # Run initialization command
    if ! eval "$init_command"; then
        error "Failed to initialize $service_name"
        return 1
    fi
    
    # Load configuration
    if ! "$config_loader"; then
        error "Failed to load configuration for $service_name"
        return 1
    fi
    
    success "$service_name setup with initialization completed"
    return 0
}

#
# Specific Setup Functions
#

# Setup automatic updates
# Usage: setup_automatic_updates_service
setup_automatic_updates_service() {
    setup_service "unattended-upgrades" "load_unattended_upgrades_config" "enable"
}

# Setup fail2ban security
# Usage: setup_fail2ban_service
setup_fail2ban_service() {
    setup_service "fail2ban" "load_fail2ban_config" "enable-start"
}

# Setup file integrity monitoring
# Usage: setup_file_integrity_monitoring_service
setup_file_integrity_monitoring_service() {
    log "Setting up file integrity monitoring..."
    
    # Initialize AIDE database
    if ! aide --init; then
        error "Failed to initialize AIDE database"
        return 1
    fi
    
    # Move new database to active location
    if [[ -f /var/lib/aide/aide.db.new ]]; then
        mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db
    fi
    
    # Load AIDE configuration
    load_aide_config
    
    success "File integrity monitoring setup completed"
}

# Setup hardware monitoring
# Usage: setup_hardware_monitoring_service
setup_hardware_monitoring_service() {
    log "Setting up hardware monitoring..."
    
    # Auto-detect sensors
    if command -v sensors-detect >/dev/null 2>&1; then
        sensors-detect --auto
    fi
    
    # Load hardware monitoring configuration
    load_hardware_monitoring_config
    
    success "Hardware monitoring setup completed"
}

# Setup network routing
# Usage: setup_network_routing_service
setup_network_routing_service() {
    log "Setting up network routing..."
    
    # Enable IP forwarding
    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    fi
    sysctl -p
    
    # Configure NAT and forwarding rules
    local wan_interface="${WAN_INTERFACE:-eth0}"
    local wifi_interface="${WIFI_INTERFACE:-wlan0}"
    
    iptables -t nat -A POSTROUTING -o "$wan_interface" -j MASQUERADE
    iptables -A FORWARD -i "$wan_interface" -o "$wifi_interface" -m state --state RELATED,ESTABLISHED -j ACCEPT
    iptables -A FORWARD -i "$wifi_interface" -o "$wan_interface" -j ACCEPT
    
    # Save iptables rules
    if command -v iptables-save >/dev/null 2>&1; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
    
    success "Network routing setup completed"
}

# Setup QoS traffic shaping
# Usage: setup_qos_traffic_shaping_service
setup_qos_traffic_shaping_service() {
    setup_with_config "QoS traffic shaping" "load_network_performance_config" "sysctl -p"
}

# Setup DHCP server
# Usage: setup_dhcp_server_service
setup_dhcp_server_service() {
    log "Setting up DHCP server..."
    
    log "DNS will be handled by AdGuard Home system service"
    log "DHCP for WiFi hotspot will use minimal dnsmasq configuration"
    
    # Create minimal dnsmasq config for DHCP only
    load_dnsmasq_minimal_config
    
    # Enable and start dnsmasq
    systemctl enable dnsmasq
    systemctl start dnsmasq
    
    success "DHCP server setup completed"
}

# Setup encrypted backups
# Usage: setup_encrypted_backups_service
setup_encrypted_backups_service() {
    log "Setting up encrypted backups..."
    
    # Create backup directory and key
    create_service_directories "dangerprep-config" "/etc/dangerprep"
    
    # Generate backup encryption key
    if [[ ! -f /etc/dangerprep/backup/backup.key ]]; then
        openssl rand -base64 32 > /etc/dangerprep/backup/backup.key
        chmod 600 /etc/dangerprep/backup/backup.key
    fi
    
    # Load backup cron configuration
    load_backup_cron_config
    
    success "Encrypted backups setup completed"
}

# Setup system monitoring
# Usage: setup_system_monitoring_service
setup_system_monitoring_service() {
    log "Setting up system monitoring..."
    
    # System monitoring is handled by just commands and cron jobs
    # No additional setup required as monitoring scripts are already in place
    
    success "System monitoring setup completed"
}

# Setup advanced security tools
# Usage: setup_advanced_security_tools_service
setup_advanced_security_tools_service() {
    log "Setting up advanced security tools..."
    
    # Configure ClamAV if available
    if command -v clamscan >/dev/null 2>&1; then
        if ! freshclam; then
            warning "Failed to update ClamAV definitions"
        fi
        success "ClamAV configured"
    else
        log "ClamAV not installed, skipping"
    fi
    
    # Configure additional security tools as needed
    success "Advanced security tools setup completed"
}

# Setup all services in the correct order
# Usage: setup_all_services
setup_all_services() {
    log "Setting up all services in dependency order..."
    
    # 1. Basic system services
    setup_automatic_updates_service
    setup_hardware_monitoring_service
    setup_system_monitoring_service
    
    # 2. Security services
    setup_fail2ban_service
    setup_file_integrity_monitoring_service
    setup_advanced_security_tools_service
    setup_encrypted_backups_service
    
    # 3. Network services
    setup_network_routing_service
    setup_qos_traffic_shaping_service
    setup_dhcp_server_service
    
    success "All services setup completed successfully"
}
