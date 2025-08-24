#!/bin/bash
# DangerPrep Configuration Loader
# Flexible template processing system

# Get the directory where this script is located
CONFIG_LOADER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$CONFIG_LOADER_DIR/configs"

# Source gum utilities for enhanced logging and user interaction
if [[ -f "$CONFIG_LOADER_DIR/../shared/gum-utils.sh" ]]; then
    # shellcheck source=../shared/gum-utils.sh
    source "$CONFIG_LOADER_DIR/../shared/gum-utils.sh"
else
    echo "ERROR: gum-utils.sh not found. Cannot continue without logging functions." >&2
    exit 1
fi

# Generic template processor
# Usage: process_template <template_file> <output_file> [var1=value1] [var2=value2] ...
process_template() {
    local template_file="$1"
    local output_file="$2"
    shift 2

    if [[ ! -f "$template_file" ]]; then
        log_error "Template file not found: $template_file"
        return 1
    fi

    # Create output directory if it doesn't exist
    mkdir -p "$(dirname "$output_file")"

    # Backup original file if it exists
    if [[ -f "$output_file" ]]; then
        cp "$output_file" "$BACKUP_DIR/$(basename "$output_file").backup" 2>/dev/null || true
        log_info "Backed up existing file: $output_file"
    fi

    # Read template content
    local content
    content=$(cat "$template_file")

    # Process substitutions from arguments
    for substitution in "$@"; do
        if [[ "$substitution" =~ ^([^=]+)=(.*)$ ]]; then
            local var_name="${BASH_REMATCH[1]}"
            local var_value="${BASH_REMATCH[2]}"
            content="${content//\{\{${var_name}\}\}/$var_value}"
        fi
    done

    # Process common environment variables if they exist
    [[ -n "${SSH_PORT:-}" ]] && content="${content//\{\{SSH_PORT\}\}/$SSH_PORT}"
    [[ -n "${WIFI_SSID:-}" ]] && content="${content//\{\{WIFI_SSID\}\}/$WIFI_SSID}"
    [[ -n "${WIFI_PASSWORD:-}" ]] && content="${content//\{\{WIFI_PASSWORD\}\}/$WIFI_PASSWORD}"
    [[ -n "${WIFI_INTERFACE:-}" ]] && content="${content//\{\{WIFI_INTERFACE\}\}/$WIFI_INTERFACE}"
    [[ -n "${WAN_INTERFACE:-}" ]] && content="${content//\{\{WAN_INTERFACE\}\}/$WAN_INTERFACE}"
    [[ -n "${LAN_IP:-}" ]] && content="${content//\{\{LAN_IP\}\}/$LAN_IP}"
    [[ -n "${LAN_NETWORK:-}" ]] && content="${content//\{\{LAN_NETWORK\}\}/$LAN_NETWORK}"
    [[ -n "${DHCP_START:-}" ]] && content="${content//\{\{DHCP_START\}\}/$DHCP_START}"
    [[ -n "${DHCP_END:-}" ]] && content="${content//\{\{DHCP_END\}\}/$DHCP_END}"
    [[ -n "${FAIL2BAN_BANTIME:-}" ]] && content="${content//\{\{FAIL2BAN_BANTIME\}\}/$FAIL2BAN_BANTIME}"
    [[ -n "${FAIL2BAN_MAXRETRY:-}" ]] && content="${content//\{\{FAIL2BAN_MAXRETRY\}\}/$FAIL2BAN_MAXRETRY}"

    # Write the processed content to output file
    echo "$content" > "$output_file"

    log_info "Generated configuration: $output_file"
}

# Convenience functions for common configurations
load_ssh_config() {
    log_info "Loading SSH configuration..."
    process_template "$CONFIG_DIR/security/sshd_config.tmpl" "/etc/ssh/sshd_config"
    process_template "$CONFIG_DIR/security/ssh_banner.tmpl" "/etc/ssh/ssh_banner"
    chmod 644 /etc/ssh/ssh_banner
}

load_fail2ban_config() {
    log_info "Loading fail2ban configuration..."
    process_template "$CONFIG_DIR/security/jail.local.tmpl" "/etc/fail2ban/jail.local"
    process_template "$CONFIG_DIR/security/nginx-botsearch.conf.tmpl" "/etc/fail2ban/filter.d/nginx-botsearch.conf"
}

load_kernel_hardening_config() {
    log_info "Loading kernel hardening configuration..."
    # Append hardening configuration to existing sysctl.conf
    cat "$CONFIG_DIR/security/sysctl_hardening.conf.tmpl" >> /etc/sysctl.conf
}

load_aide_config() {
    log_info "Loading AIDE configuration..."
    cat "$CONFIG_DIR/security/aide_dangerprep.conf.tmpl" >> /etc/aide/aide.conf
}

load_motd_config() {
    log_info "Loading MOTD configuration..."
    # Install DangerPrep banner for MOTD
    cp "$CONFIG_DIR/system/01-dangerprep-banner" "/etc/update-motd.d/01-dangerprep-banner"
    chmod +x "/etc/update-motd.d/01-dangerprep-banner"

    # Disable default Ubuntu MOTD components that might conflict
    chmod -x /etc/update-motd.d/10-help-text 2>/dev/null || true
    chmod -x /etc/update-motd.d/50-motd-news 2>/dev/null || true
    chmod -x /etc/update-motd.d/80-esm 2>/dev/null || true
    chmod -x /etc/update-motd.d/95-hwe-eol 2>/dev/null || true
}

load_hardware_monitoring_config() {
    log_info "Loading hardware monitoring configuration..."
    cat "$CONFIG_DIR/monitoring/sensors3_dangerprep.conf.tmpl" >> /etc/sensors3.conf
}

load_hostapd_config() {
    log_info "Loading hostapd configuration..."
    process_template "$CONFIG_DIR/network/hostapd.conf.tmpl" "/etc/hostapd/hostapd.conf"
    # Configure hostapd to use our config file
    sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd
}

load_dnsmasq_config() {
    log_info "Loading dnsmasq configuration..."
    process_template "$CONFIG_DIR/network/dnsmasq.conf.tmpl" "/etc/dnsmasq.conf"
    # Create log file
    touch /var/log/dnsmasq.log
    chown dnsmasq:nogroup /var/log/dnsmasq.log
}

load_dnsmasq_advanced_config() {
    log_info "Loading advanced dnsmasq configuration..."
    process_template "$CONFIG_DIR/dns/dnsmasq_advanced.conf.tmpl" "/etc/dnsmasq.conf"
}

load_wan_config() {
    log_info "Loading WAN interface configuration..."
    process_template "$CONFIG_DIR/network/netplan_wan.yaml.tmpl" "/etc/netplan/01-dangerprep-wan.yaml"
}

load_sync_configs() {
    log_info "Loading sync service configurations..."
    local sync_config_dir="$INSTALL_ROOT/config"
    mkdir -p "$sync_config_dir"

    process_template "$CONFIG_DIR/sync/kiwix-sync.yaml.tmpl" "$sync_config_dir/kiwix-sync.yaml"
    process_template "$CONFIG_DIR/sync/nfs-sync.yaml.tmpl" "$sync_config_dir/nfs-sync.yaml"
    process_template "$CONFIG_DIR/sync/offline-sync.yaml.tmpl" "$sync_config_dir/offline-sync.yaml"
}

load_unattended_upgrades_config() {
    log_info "Loading unattended upgrades configuration..."
    process_template "$CONFIG_DIR/system/50unattended-upgrades.tmpl" "/etc/apt/apt.conf.d/50unattended-upgrades"
    process_template "$CONFIG_DIR/system/20auto-upgrades.tmpl" "/etc/apt/apt.conf.d/20auto-upgrades"
}

load_network_performance_config() {
    log_info "Loading network performance configuration..."
    cat "$CONFIG_DIR/network/network_performance.conf.tmpl" >> /etc/sysctl.conf
}

load_docker_config() {
    log_info "Loading Docker daemon configuration..."
    mkdir -p /etc/docker
    process_template "$CONFIG_DIR/docker/daemon.json.tmpl" "/etc/docker/daemon.json"
}

load_watchtower_config() {
    log_info "Loading Watchtower configuration..."
    local watchtower_dir="$INSTALL_ROOT/docker/infrastructure/watchtower"
    mkdir -p "$watchtower_dir"
    process_template "$CONFIG_DIR/docker/watchtower.compose.yml.tmpl" "$watchtower_dir/compose.yml"
}

# Function to validate all configuration files exist
validate_config_files() {
    log_info "Validating configuration files..."

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
        "$CONFIG_DIR/system/01-dangerprep-banner"

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
        log_error "Missing configuration files:"
        printf '%s\n' "${missing_files[@]}"
        return 1
    fi

    log_success "All configuration files validated"
    return 0
}

# Load FriendlyElec-specific configurations
load_friendlyelec_configs() {
    if [[ "$IS_FRIENDLYELEC" != true ]]; then
        return 0
    fi

    log_info "Loading FriendlyElec-specific configurations..."

    # Load RK3588/RK3588S configurations
    if [[ "$IS_RK3588" == true || "$IS_RK3588S" == true ]]; then
        load_rk3588_configs
    fi

    log_success "FriendlyElec configurations loaded"
}

# Load RK3588/RK3588S specific configurations
load_rk3588_configs() {
    log_info "Loading RK3588/RK3588S configurations..."

    # Load sensors configuration
    load_rk3588_sensors_config

    # Load performance optimizations
    load_rk3588_performance_config

    # Load udev rules
    load_rk3588_udev_rules

    # Load GPU configuration
    load_rk3588_gpu_config

    # Load GStreamer hardware acceleration
    load_rk3588_gstreamer_config

    # Load fan control configuration
    load_rk3588_fan_control_config

    # Load GPIO/PWM configuration
    load_gpio_pwm_config
}

# Load RK3588 fan control configuration
load_rk3588_fan_control_config() {
    local template="$CONFIG_DIR/friendlyelec/rk3588-fan-control.conf.tmpl"
    local output="/etc/dangerprep/rk3588-fan-control.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log_info "Loaded RK3588 fan control configuration"
    else
        log_warn "RK3588 fan control template not found: $template"
    fi
}

# Install RK3588 fan control service
install_rk3588_fan_control_service() {
    local template="$CONFIG_DIR/friendlyelec/rk3588-fan-control.service.tmpl"
    local output="/etc/systemd/system/rk3588-fan-control.service"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        systemctl daemon-reload
        systemctl enable rk3588-fan-control.service 2>/dev/null || true
        systemctl start rk3588-fan-control.service 2>/dev/null || true
        log_info "Installed and started RK3588 fan control service"
    else
        log_warn "RK3588 fan control service template not found: $template"
    fi
}

# Load GPIO/PWM configuration
load_gpio_pwm_config() {
    local template="$CONFIG_DIR/friendlyelec/gpio-pwm-setup.conf.tmpl"
    local output="/etc/dangerprep/gpio-pwm-setup.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log_info "Loaded GPIO/PWM configuration"
    else
        log_warn "GPIO/PWM configuration template not found: $template"
    fi
}

# Load RK3588 sensors configuration
load_rk3588_sensors_config() {
    local template="$CONFIG_DIR/friendlyelec/rk3588-sensors.conf.tmpl"
    local output="/etc/sensors.d/rk3588.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log_info "Loaded RK3588 sensors configuration"
    else
        log_warn "RK3588 sensors template not found: $template"
    fi
}

# Load RK3588 performance configuration
load_rk3588_performance_config() {
    local template="$CONFIG_DIR/friendlyelec/rk3588-performance.conf.tmpl"
    local output="/etc/sysctl.d/99-rk3588-optimizations.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log_info "Loaded RK3588 performance configuration"
    else
        log_warn "RK3588 performance template not found: $template"
    fi
}

# Load RK3588 udev rules
load_rk3588_udev_rules() {
    local template="$CONFIG_DIR/friendlyelec/rk3588-udev.rules.tmpl"
    local output="/etc/udev/rules.d/99-rk3588-hardware.rules"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        udevadm control --reload-rules 2>/dev/null || true
        log_info "Loaded RK3588 udev rules"
    else
        log_warn "RK3588 udev rules template not found: $template"
    fi
}

# Load RK3588 GPU configuration
load_rk3588_gpu_config() {
    local template="$CONFIG_DIR/friendlyelec/mali-gpu.conf.tmpl"
    local output="/etc/environment.d/mali-gpu.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log_info "Loaded RK3588 GPU configuration"
    else
        log_warn "RK3588 GPU template not found: $template"
    fi
}

# Load RK3588 GStreamer configuration
load_rk3588_gstreamer_config() {
    local template="$CONFIG_DIR/friendlyelec/gstreamer-hardware.conf.tmpl"
    local output="/etc/gstreamer-1.0/rk3588-hardware.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log_info "Loaded RK3588 GStreamer configuration"
    else
        log_warn "RK3588 GStreamer template not found: $template"
    fi
}
