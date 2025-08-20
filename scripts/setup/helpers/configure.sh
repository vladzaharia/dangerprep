#!/usr/bin/env bash
# DangerPrep Configuration Helper Functions
#
# Purpose: Consolidated configuration functions with common patterns
# Usage: Source this file to access configuration functions
# Dependencies: logging.sh, errors.sh, config.sh, services.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices

# Prevent multiple sourcing
if [[ "${CONFIGURE_HELPER_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly CONFIGURE_HELPER_LOADED="true"

set -euo pipefail

# Get the directory where this script is located
CONFIGURE_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${CONFIGURE_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${CONFIGURE_HELPER_DIR}/../../shared/errors.sh"
fi

if [[ -z "${CONFIG_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./config.sh
    source "${CONFIGURE_HELPER_DIR}/config.sh"
fi

if [[ -z "${SERVICES_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./services.sh
    source "${CONFIGURE_HELPER_DIR}/services.sh"
fi

# Mark this file as sourced
export CONFIGURE_HELPER_SOURCED=true

#
# Common Configuration Patterns
#

# Generic configuration function with common pattern
# Usage: configure_with_template "service_name" "config_loader_function" [additional_commands...]
configure_with_template() {
    local service_name="$1"
    local config_loader="$2"
    shift 2
    
    if [[ -z "$service_name" ]] || [[ -z "$config_loader" ]]; then
        error "Service name and config loader function are required"
        return 1
    fi
    
    log "Configuring $service_name..."
    
    # Load configuration using the specified loader function
    if command -v "$config_loader" >/dev/null 2>&1; then
        "$config_loader"
    else
        error "Configuration loader function not found: $config_loader"
        return 1
    fi
    
    # Execute additional commands if provided
    for cmd in "$@"; do
        if ! eval "$cmd"; then
            error "Failed to execute command: $cmd"
            return 1
        fi
    done
    
    success "$service_name configured"
    return 0
}

# Configure service with systemctl operations
# Usage: configure_service "service_name" "config_loader" [systemctl_action]
configure_service() {
    local service_name="$1"
    local config_loader="$2"
    local systemctl_action="${3:-restart}"
    
    if [[ -z "$service_name" ]] || [[ -z "$config_loader" ]]; then
        error "Service name and config loader are required"
        return 1
    fi
    
    log "Configuring $service_name service..."
    
    # Load configuration
    if ! "$config_loader"; then
        error "Failed to load configuration for $service_name"
        return 1
    fi
    
    # Apply systemctl action
    case "$systemctl_action" in
        "restart")
            systemctl restart "$service_name"
            ;;
        "reload")
            systemctl reload "$service_name"
            ;;
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
        *)
            warning "Unknown systemctl action: $systemctl_action"
            ;;
    esac
    
    success "$service_name service configured"
    return 0
}

# Configure with validation and testing
# Usage: configure_with_validation "service_name" "config_loader" "validation_command"
configure_with_validation() {
    local service_name="$1"
    local config_loader="$2"
    local validation_cmd="$3"
    
    if [[ -z "$service_name" ]] || [[ -z "$config_loader" ]] || [[ -z "$validation_cmd" ]]; then
        error "Service name, config loader, and validation command are required"
        return 1
    fi
    
    log "Configuring $service_name with validation..."
    
    # Load configuration
    if ! "$config_loader"; then
        error "Failed to load configuration for $service_name"
        return 1
    fi
    
    # Validate configuration
    if eval "$validation_cmd"; then
        success "$service_name configuration validated"
        return 0
    else
        error "$service_name configuration validation failed"
        return 1
    fi
}

#
# Specific Configuration Functions
#

# Configure security services (SSH, fail2ban, kernel hardening)
# Usage: configure_security_services
configure_security_services() {
    log "Configuring security services..."
    
    # SSH hardening with validation
    configure_with_validation "SSH" "load_ssh_config" "sshd -t"
    if [[ $? -eq 0 ]]; then
        chmod 644 /etc/ssh/sshd_config /etc/ssh/ssh_banner
        systemctl restart ssh
        success "SSH configured on port ${SSH_PORT:-2222} with key-only authentication"
    fi
    
    # Fail2ban
    configure_service "fail2ban" "load_fail2ban_config" "enable-start"
    
    # Kernel hardening
    configure_with_template "kernel hardening" "load_kernel_hardening_config" "sysctl -p"
    
    # AIDE
    configure_with_template "AIDE" "load_aide_config"
    
    success "Security services configured"
}

# Configure network services
# Usage: configure_network_services
configure_network_services() {
    log "Configuring network services..."
    
    # WAN interface
    configure_with_template "WAN interface" "load_wan_config" "netplan apply"
    
    # WiFi hotspot
    configure_wifi_hotspot_service
    
    # Network performance
    configure_with_template "network performance" "load_network_performance_config" "sysctl -p"
    
    success "Network services configured"
}

# Configure WiFi hotspot with complex logic
# Usage: configure_wifi_hotspot_service
configure_wifi_hotspot_service() {
    log "Configuring WiFi hotspot..."
    
    # Stop NetworkManager management of WiFi interface
    if command -v nmcli >/dev/null 2>&1; then
        nmcli device set "${WIFI_INTERFACE:-wlan0}" managed no 2>/dev/null || true
    fi
    
    # Load hostapd configuration
    load_hostapd_config
    
    # Load minimal dnsmasq configuration
    load_dnsmasq_minimal_config
    
    # Enable and start services
    systemctl enable hostapd dnsmasq
    systemctl start hostapd dnsmasq
    
    # Configure WiFi routing
    configure_wifi_routing_rules
    
    success "WiFi hotspot configured"
}

# Configure WiFi routing rules
# Usage: configure_wifi_routing_rules
configure_wifi_routing_rules() {
    log "Configuring WiFi routing rules..."
    
    local wifi_interface="${WIFI_INTERFACE:-wlan0}"
    
    # Allow WiFi clients to access services
    iptables -A INPUT -i "$wifi_interface" -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -i "$wifi_interface" -p tcp --dport 443 -j ACCEPT
    iptables -A INPUT -i "$wifi_interface" -p tcp --dport 3000 -j ACCEPT  # AdGuard Home
    iptables -A INPUT -i "$wifi_interface" -p tcp --dport 9000 -j ACCEPT  # Step-CA
    iptables -A INPUT -i "$wifi_interface" -p udp --dport 53 -j ACCEPT    # DNS
    
    # Save iptables rules
    if command -v iptables-save >/dev/null 2>&1; then
        iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    fi
    
    debug "WiFi routing rules configured"
}

# Configure DNS services
# Usage: configure_dns_services
configure_dns_services() {
    log "Configuring DNS services..."
    
    # AdGuard Home configuration
    configure_with_template "AdGuard Home" "load_adguard_config"
    
    # AdGuard Home service
    configure_service "adguardhome" "load_adguardhome_service_config" "enable-start"
    
    # DNS chain configuration
    configure_with_template "DNS chain" "load_systemd_resolved_adguard_config"
    
    success "DNS services configured"
}

# Configure certificate authority
# Usage: configure_certificate_authority
configure_certificate_authority() {
    log "Configuring Step-CA certificate authority..."
    
    # Initialize CA if not already done
    if [[ ! -f /var/lib/step/config/ca.json ]]; then
        log "Initializing Step-CA..."
        
        # Create step user and directories
        create_service_user "step" "/var/lib/step"
        create_service_directories "step-ca" "/var/lib/step"
        
        # Initialize CA with secure defaults
        local ca_name="DangerPrep Internal CA"
        local ca_dns="ca.dangerprep.local"
        
        sudo -u step step ca init \
            --name="$ca_name" \
            --dns="$ca_dns" \
            --address=":9000" \
            --provisioner="admin" \
            --password-file=<(openssl rand -base64 32) \
            --root="/var/lib/step/certs/root_ca.crt" \
            --key="/var/lib/step/secrets/root_ca_key"
        
        success "Step-CA initialized"
    else
        log "Step-CA already initialized"
    fi
    
    # Configure Step-CA service
    configure_service "step-ca" "load_step_ca_service_config" "enable-start"
    
    success "Certificate authority configured"
}

# Configure system services
# Usage: configure_system_services
configure_system_services() {
    log "Configuring system services..."
    
    # Automatic updates
    configure_with_template "automatic updates" "load_unattended_upgrades_config"
    systemctl enable unattended-upgrades
    
    # Hardware monitoring
    configure_with_template "hardware monitoring" "load_hardware_monitoring_config"
    
    # MOTD
    configure_with_template "MOTD" "load_motd_config"
    
    # Backup cron jobs
    configure_with_template "backup cron" "load_backup_cron_config"
    
    success "System services configured"
}

# Configure all services in the correct order
# Usage: configure_all_services
configure_all_services() {
    log "Configuring all services in dependency order..."
    
    # 1. System services first
    configure_system_services
    
    # 2. Security services
    configure_security_services
    
    # 3. Network services
    configure_network_services
    
    # 4. DNS services
    configure_dns_services
    
    # 5. Certificate authority
    configure_certificate_authority
    
    # 6. Hardware-specific configurations
    if [[ "${IS_FRIENDLYELEC:-false}" == true ]]; then
        configure_friendlyelec_hardware
    fi
    
    success "All services configured successfully"
}

# Export functions for use in other scripts
export -f configure_with_template
export -f configure_service
export -f configure_with_validation
export -f configure_security_services
export -f configure_network_services
export -f configure_wifi_hotspot_service
export -f configure_wifi_routing_rules
export -f configure_dns_services
export -f configure_certificate_authority
export -f configure_system_services
export -f configure_all_services
