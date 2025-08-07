#!/bin/bash
# DangerPrep Configuration Loader
# Flexible template processing system

# Get the directory where this script is located
CONFIG_LOADER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$CONFIG_LOADER_DIR/configs"

# Generic template processor
# Usage: process_template <template_file> <output_file> [var1=value1] [var2=value2] ...
process_template() {
    local template_file="$1"
    local output_file="$2"
    shift 2

    if [[ ! -f "$template_file" ]]; then
        error "Template file not found: $template_file"
        return 1
    fi

    # Create output directory if it doesn't exist
    mkdir -p "$(dirname "$output_file")"

    # Backup original file if it exists
    if [[ -f "$output_file" ]]; then
        cp "$output_file" "$BACKUP_DIR/$(basename "$output_file").backup" 2>/dev/null || true
        log "Backed up existing file: $output_file"
    fi

    # Read template content
    local content=$(cat "$template_file")

    # Process substitutions from arguments
    for substitution in "$@"; do
        if [[ "$substitution" =~ ^([^=]+)=(.*)$ ]]; then
            local var_name="${BASH_REMATCH[1]}"
            local var_value="${BASH_REMATCH[2]}"
            content="${content//\{\{${var_name}\}\}/$var_value}"
        fi
    done

    # Process common environment variables if they exist
    [[ -n "$SSH_PORT" ]] && content="${content//\{\{SSH_PORT\}\}/$SSH_PORT}"
    [[ -n "$WIFI_SSID" ]] && content="${content//\{\{WIFI_SSID\}\}/$WIFI_SSID}"
    [[ -n "$WIFI_PASSWORD" ]] && content="${content//\{\{WIFI_PASSWORD\}\}/$WIFI_PASSWORD}"
    [[ -n "$WIFI_INTERFACE" ]] && content="${content//\{\{WIFI_INTERFACE\}\}/$WIFI_INTERFACE}"
    [[ -n "$WAN_INTERFACE" ]] && content="${content//\{\{WAN_INTERFACE\}\}/$WAN_INTERFACE}"
    [[ -n "$LAN_IP" ]] && content="${content//\{\{LAN_IP\}\}/$LAN_IP}"
    [[ -n "$LAN_NETWORK" ]] && content="${content//\{\{LAN_NETWORK\}\}/$LAN_NETWORK}"
    [[ -n "$DHCP_START" ]] && content="${content//\{\{DHCP_START\}\}/$DHCP_START}"
    [[ -n "$DHCP_END" ]] && content="${content//\{\{DHCP_END\}\}/$DHCP_END}"
    [[ -n "$FAIL2BAN_BANTIME" ]] && content="${content//\{\{FAIL2BAN_BANTIME\}\}/$FAIL2BAN_BANTIME}"
    [[ -n "$FAIL2BAN_MAXRETRY" ]] && content="${content//\{\{FAIL2BAN_MAXRETRY\}\}/$FAIL2BAN_MAXRETRY}"

    # Write the processed content to output file
    echo "$content" > "$output_file"

    log "Generated configuration: $output_file"
}

# Convenience functions for common configurations
load_ssh_config() {
    log "Loading SSH configuration..."
    process_template "$CONFIG_DIR/security/sshd_config.tmpl" "/etc/ssh/sshd_config"
    process_template "$CONFIG_DIR/security/ssh_banner.tmpl" "/etc/ssh/ssh_banner"
    chmod 644 /etc/ssh/ssh_banner
}

load_fail2ban_config() {
    log "Loading fail2ban configuration..."
    process_template "$CONFIG_DIR/security/jail.local.tmpl" "/etc/fail2ban/jail.local"
    process_template "$CONFIG_DIR/security/nginx-botsearch.conf.tmpl" "/etc/fail2ban/filter.d/nginx-botsearch.conf"
}

load_kernel_hardening_config() {
    log "Loading kernel hardening configuration..."
    # Append hardening configuration to existing sysctl.conf
    cat "$CONFIG_DIR/security/sysctl_hardening.conf.tmpl" >> /etc/sysctl.conf
}

load_aide_config() {
    log "Loading AIDE configuration..."
    cat "$CONFIG_DIR/security/aide_dangerprep.conf.tmpl" >> /etc/aide/aide.conf
}

load_hardware_monitoring_config() {
    log "Loading hardware monitoring configuration..."
    cat "$CONFIG_DIR/monitoring/sensors3_dangerprep.conf.tmpl" >> /etc/sensors3.conf
}

load_hostapd_config() {
    log "Loading hostapd configuration..."
    process_template "$CONFIG_DIR/network/hostapd.conf.tmpl" "/etc/hostapd/hostapd.conf"
    # Configure hostapd to use our config file
    sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd
}

load_dnsmasq_config() {
    log "Loading dnsmasq configuration..."
    process_template "$CONFIG_DIR/network/dnsmasq.conf.tmpl" "/etc/dnsmasq.conf"
    # Create log file
    touch /var/log/dnsmasq.log
    chown dnsmasq:nogroup /var/log/dnsmasq.log
}

load_dnsmasq_advanced_config() {
    log "Loading advanced dnsmasq configuration..."
    process_template "$CONFIG_DIR/dns/dnsmasq_advanced.conf.tmpl" "/etc/dnsmasq.conf"
}

load_wan_config() {
    log "Loading WAN interface configuration..."
    process_template "$CONFIG_DIR/network/netplan_wan.yaml.tmpl" "/etc/netplan/01-dangerprep-wan.yaml"
}

load_sync_configs() {
    log "Loading sync service configurations..."
    local sync_config_dir="$INSTALL_ROOT/config"
    mkdir -p "$sync_config_dir"

    process_template "$CONFIG_DIR/sync/kiwix-sync.yaml.tmpl" "$sync_config_dir/kiwix-sync.yaml"
    process_template "$CONFIG_DIR/sync/nfs-sync.yaml.tmpl" "$sync_config_dir/nfs-sync.yaml"
    process_template "$CONFIG_DIR/sync/offline-sync.yaml.tmpl" "$sync_config_dir/offline-sync.yaml"
}

load_unattended_upgrades_config() {
    log "Loading unattended upgrades configuration..."
    process_template "$CONFIG_DIR/system/50unattended-upgrades.tmpl" "/etc/apt/apt.conf.d/50unattended-upgrades"
    process_template "$CONFIG_DIR/system/20auto-upgrades.tmpl" "/etc/apt/apt.conf.d/20auto-upgrades"
}

load_network_performance_config() {
    log "Loading network performance configuration..."
    cat "$CONFIG_DIR/network/network_performance.conf.tmpl" >> /etc/sysctl.conf
}

load_docker_config() {
    log "Loading Docker daemon configuration..."
    mkdir -p /etc/docker
    process_template "$CONFIG_DIR/docker/daemon.json.tmpl" "/etc/docker/daemon.json"
}

load_watchtower_config() {
    log "Loading Watchtower configuration..."
    local watchtower_dir="$INSTALL_ROOT/docker/infrastructure/watchtower"
    mkdir -p "$watchtower_dir"
    process_template "$CONFIG_DIR/docker/watchtower.compose.yml.tmpl" "$watchtower_dir/compose.yml"
}

# Function to validate all configuration files exist
validate_config_files() {
    log "Validating configuration files..."

    local missing_files=()
    local config_files=(
        # Security configs
        "$CONFIG_DIR/security/sshd_config.tmpl"
        "$CONFIG_DIR/security/ssh_banner.tmpl"
        "$CONFIG_DIR/security/jail.local.tmpl"
        "$CONFIG_DIR/security/nginx-botsearch.conf.tmpl"
        "$CONFIG_DIR/security/sysctl_hardening.conf.tmpl"
        "$CONFIG_DIR/security/aide_dangerprep.conf.tmpl"

        # Network configs
        "$CONFIG_DIR/network/hostapd.conf.tmpl"
        "$CONFIG_DIR/network/dnsmasq.conf.tmpl"
        "$CONFIG_DIR/network/netplan_wan.yaml.tmpl"
        "$CONFIG_DIR/network/network_performance.conf.tmpl"

        # DNS configs
        "$CONFIG_DIR/dns/dnsmasq_advanced.conf.tmpl"

        # Monitoring configs
        "$CONFIG_DIR/monitoring/sensors3_dangerprep.conf.tmpl"

        # Sync configs
        "$CONFIG_DIR/sync/kiwix-sync.yaml.tmpl"
        "$CONFIG_DIR/sync/nfs-sync.yaml.tmpl"
        "$CONFIG_DIR/sync/offline-sync.yaml.tmpl"

        # System configs
        "$CONFIG_DIR/system/50unattended-upgrades.tmpl"
        "$CONFIG_DIR/system/20auto-upgrades.tmpl"

        # Docker configs
        "$CONFIG_DIR/docker/daemon.json.tmpl"
        "$CONFIG_DIR/docker/watchtower.compose.yml.tmpl"
    )

    for config_file in "${config_files[@]}"; do
        if [[ ! -f "$config_file" ]]; then
            missing_files+=("$config_file")
        fi
    done

    if [[ ${#missing_files[@]} -gt 0 ]]; then
        error "Missing configuration files:"
        printf '%s\n' "${missing_files[@]}"
        return 1
    fi

    success "All configuration files validated"
    return 0
}
