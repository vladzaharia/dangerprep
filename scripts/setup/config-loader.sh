#!/bin/bash
# DangerPrep Configuration Loader
# Flexible template processing system

# Get the directory where this script is located
CONFIG_LOADER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${CONFIG_LOADER_DIR}/configs"

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
        cp "$output_file" "${BACKUP_DIR}/$(basename "$output_file").backup" 2>/dev/null || true
        log "Backed up existing file: $output_file"
    fi

    # Read template content
    local content
    content=$(cat "$template_file")

    # Process substitutions from arguments
    for substitution in "$@"; do
        if [[ "$substitution" =~ ^([^=]+)=(.*)$ ]]; then
            local var_name
            var_name=${BASH_REMATCH[1]}
            local var_value
            var_value=${BASH_REMATCH[2]}
            content="${content//\{\{${var_name}\}\}/$var_value}"
        fi
    done

    # Process common environment variables if they exist
    [[ -n "${SSH_PORT}" ]] && content="${content//\{\{SSH_PORT\}\}/${SSH_PORT}}"
    [[ -n "${WIFI_SSID}" ]] && content="${content//\{\{WIFI_SSID\}\}/${WIFI_SSID}}"
    [[ -n "${WIFI_PASSWORD}" ]] && content="${content//\{\{WIFI_PASSWORD\}\}/${WIFI_PASSWORD}}"
    [[ -n "${WIFI_INTERFACE}" ]] && content="${content//\{\{WIFI_INTERFACE\}\}/${WIFI_INTERFACE}}"
    [[ -n "${WAN_INTERFACE}" ]] && content="${content//\{\{WAN_INTERFACE\}\}/${WAN_INTERFACE}}"
    [[ -n "${LAN_INTERFACE}" ]] && content="${content//\{\{LAN_INTERFACE\}\}/${LAN_INTERFACE}}"
    [[ -n "${LAN_IP}" ]] && content="${content//\{\{LAN_IP\}\}/${LAN_IP}}"
    [[ -n "${LAN_NETWORK}" ]] && content="${content//\{\{LAN_NETWORK\}\}/${LAN_NETWORK}}"
    [[ -n "${DHCP_START}" ]] && content="${content//\{\{DHCP_START\}\}/${DHCP_START}}"
    [[ -n "${DHCP_END}" ]] && content="${content//\{\{DHCP_END\}\}/${DHCP_END}}"
    [[ -n "${FAIL2BAN_BANTIME}" ]] && content="${content//\{\{FAIL2BAN_BANTIME\}\}/${FAIL2BAN_BANTIME}}"
    [[ -n "${FAIL2BAN_MAXRETRY}" ]] && content="${content//\{\{FAIL2BAN_MAXRETRY\}\}/${FAIL2BAN_MAXRETRY}}"

    # Write the processed content to output file
    echo "$content" > "$output_file"

    log "Generated configuration: $output_file"
}

# Convenience functions for common configurations
load_ssh_config() {
    log "Loading SSH configuration..."
    process_template "${CONFIG_DIR}/security/sshd_config.tmpl" "/etc/ssh/sshd_config"
    process_template "${CONFIG_DIR}/security/ssh_banner.tmpl" "/etc/ssh/ssh_banner"
    chmod 644 /etc/ssh/ssh_banner
}

load_fail2ban_config() {
    log "Loading fail2ban configuration..."
    process_template "${CONFIG_DIR}/security/jail.local.tmpl" "/etc/fail2ban/jail.local"
    process_template "${CONFIG_DIR}/security/nginx-botsearch.conf.tmpl" "/etc/fail2ban/filter.d/nginx-botsearch.conf"
}

load_kernel_hardening_config() {
    log "Loading kernel hardening configuration..."
    # Append hardening configuration to existing sysctl.conf
    cat "${CONFIG_DIR}/security/sysctl_hardening.conf.tmpl" >> /etc/sysctl.conf
}

load_aide_config() {
    log "Loading AIDE configuration..."
    cat "${CONFIG_DIR}/security/aide_dangerprep.conf.tmpl" >> /etc/aide/aide.conf
}

load_motd_config() {
    log "Loading MOTD configuration..."
    # Install DangerPrep banner for MOTD
    cp "${CONFIG_DIR}/system/01-dangerprep-banner" "/etc/update-motd.d/01-dangerprep-banner"
    chmod +x "/etc/update-motd.d/01-dangerprep-banner"

    # Disable default Ubuntu MOTD components that might conflict
    chmod -x /etc/update-motd.d/10-help-text 2>/dev/null || true
    chmod -x /etc/update-motd.d/50-motd-news 2>/dev/null || true
    chmod -x /etc/update-motd.d/80-esm 2>/dev/null || true
    chmod -x /etc/update-motd.d/95-hwe-eol 2>/dev/null || true
}

load_hardware_monitoring_config() {
    log "Loading hardware monitoring configuration..."
    cat "${CONFIG_DIR}/monitoring/sensors3_dangerprep.conf.tmpl" >> /etc/sensors3.conf
}

load_hostapd_config() {
    log "Loading hostapd configuration..."
    process_template "${CONFIG_DIR}/network/hostapd.conf.tmpl" "/etc/hostapd/hostapd.conf"
    # Configure hostapd to use our config file
    sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd
}

load_dnsmasq_config() {
    log "Loading dnsmasq configuration..."
    process_template "${CONFIG_DIR}/network/dnsmasq.conf.tmpl" "/etc/dnsmasq.conf"
    # Create log file
    touch /var/log/dnsmasq.log
    chown dnsmasq:nogroup /var/log/dnsmasq.log
}

load_dnsmasq_advanced_config() {
    log "Loading advanced dnsmasq configuration..."
    process_template "${CONFIG_DIR}/dns/dnsmasq_advanced.conf.tmpl" "/etc/dnsmasq.conf"
}

load_wan_config() {
    log "Loading WAN interface configuration..."
    process_template "${CONFIG_DIR}/network/netplan_wan.yaml.tmpl" "/etc/netplan/01-dangerprep-wan.yaml"
}

load_sync_configs() {
    log "Loading sync service configurations..."
    local sync_config_dir="${INSTALL_ROOT}/config"
    mkdir -p "$sync_config_dir"

    process_template "${CONFIG_DIR}/sync/kiwix-sync.yaml.tmpl" "$sync_config_dir/kiwix-sync.yaml"
    process_template "${CONFIG_DIR}/sync/nfs-sync.yaml.tmpl" "$sync_config_dir/nfs-sync.yaml"
    process_template "${CONFIG_DIR}/sync/offline-sync.yaml.tmpl" "$sync_config_dir/offline-sync.yaml"
}

load_adguard_config() {
    log "Loading AdGuard Home configuration..."

    # Generate password hash for admin user
    local admin_password
    admin_password=${ADGUARD_PASSWORD:-DangerPrep2025!}
    local password_hash
    password_hash=$(echo -n "$admin_password" | sha256sum | cut -d' ' -f1)

    # Set template variables
    export ADGUARD_PASSWORD_HASH="$password_hash"

    process_template "${CONFIG_DIR}/dns/adguard-home.yaml.tmpl" "/etc/adguardhome/AdGuardHome.yaml"
}

load_unattended_upgrades_config() {
    log "Loading unattended upgrades configuration..."
    process_template "${CONFIG_DIR}/system/50unattended-upgrades.tmpl" "/etc/apt/apt.conf.d/50unattended-upgrades"
    process_template "${CONFIG_DIR}/system/20auto-upgrades.tmpl" "/etc/apt/apt.conf.d/20auto-upgrades"
}

load_network_performance_config() {
    log "Loading network performance configuration..."
    cat "${CONFIG_DIR}/network/network_performance.conf.tmpl" >> /etc/sysctl.conf
}

load_docker_config() {
    log "Loading Docker daemon configuration..."
    mkdir -p /etc/docker
    process_template "${CONFIG_DIR}/docker/daemon.json.tmpl" "/etc/docker/daemon.json"
}

load_watchtower_config() {
    log "Loading Watchtower configuration..."
    local watchtower_dir="${INSTALL_ROOT}/docker/infrastructure/watchtower"
    mkdir -p "$watchtower_dir"
    process_template "${CONFIG_DIR}/docker/watchtower.compose.yml.tmpl" "$watchtower_dir/compose.yml"
}

# Function to validate all configuration files exist
validate_config_files() {
    log "Validating configuration files..."

    local missing_files=()
    local config_files=(
        # Security configs
        "${CONFIG_DIR}/security/sshd_config.tmpl"
        "${CONFIG_DIR}/security/ssh_banner.tmpl"
        "${CONFIG_DIR}/security/jail.local.tmpl"
        "${CONFIG_DIR}/security/nginx-botsearch.conf.tmpl"
        "${CONFIG_DIR}/security/sysctl_hardening.conf.tmpl"
        "${CONFIG_DIR}/security/aide_dangerprep.conf.tmpl"

        # Network configs
        "${CONFIG_DIR}/network/hostapd.conf.tmpl"
        "${CONFIG_DIR}/network/dnsmasq.conf.tmpl"
        "${CONFIG_DIR}/network/netplan_wan.yaml.tmpl"
        "${CONFIG_DIR}/network/network_performance.conf.tmpl"

        # DNS configs
        "${CONFIG_DIR}/dns/dnsmasq_advanced.conf.tmpl"

        # Monitoring configs
        "${CONFIG_DIR}/monitoring/sensors3_dangerprep.conf.tmpl"

        # Sync configs
        "${CONFIG_DIR}/sync/kiwix-sync.yaml.tmpl"
        "${CONFIG_DIR}/sync/nfs-sync.yaml.tmpl"
        "${CONFIG_DIR}/sync/offline-sync.yaml.tmpl"

        # System configs
        "${CONFIG_DIR}/system/50unattended-upgrades.tmpl"
        "${CONFIG_DIR}/system/20auto-upgrades.tmpl"
        "${CONFIG_DIR}/system/01-dangerprep-banner"

        # Docker configs
        "${CONFIG_DIR}/docker/daemon.json.tmpl"
        "${CONFIG_DIR}/docker/watchtower.compose.yml.tmpl"

        # FriendlyElec configs
        "${CONFIG_DIR}/friendlyelec/mali-gpu-env.sh.tmpl"
        "${CONFIG_DIR}/friendlyelec/rk3588-video-env.sh.tmpl"
        "${CONFIG_DIR}/friendlyelec/rk3588-cpu-governor.service.tmpl"

        # Additional network configs
        "${CONFIG_DIR}/network/ethernet-bonding.yaml.tmpl"
        "${CONFIG_DIR}/network/dnsmasq-minimal.conf.tmpl"

        # Additional DNS configs
        "${CONFIG_DIR}/dns/adguardhome.service.tmpl"
        "${CONFIG_DIR}/dns/systemd-resolved-adguard.conf.tmpl"

        # Additional security configs
        "${CONFIG_DIR}/security/step-ca.service.tmpl"
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

# Load FriendlyElec-specific configurations
load_friendlyelec_configs() {
    if [[ "${IS_FRIENDLYELEC}" != true ]]; then
        return 0
    fi

    log "Loading FriendlyElec-specific configurations..."

    # Load RK3588/RK3588S configurations
    if [[ "${IS_RK3588}" == true || "${IS_RK3588S}" == true ]]; then
        load_rk3588_configs
    fi

    success "FriendlyElec configurations loaded"
}

# Load RK3588/RK3588S specific configurations
load_rk3588_configs() {
    log "Loading RK3588/RK3588S configurations..."

    # Load sensors configuration
    load_rk3588_sensors_config

    # Load performance optimizations
    load_rk3588_performance_config

    # Load udev rules
    load_rk3588_udev_rules

    # Load GPU configuration
    load_rk3588_gpu_config

    # Load Mali GPU environment variables
    load_mali_gpu_env_config

    # Load GStreamer hardware acceleration
    load_rk3588_gstreamer_config

    # Load video acceleration environment variables
    load_rk3588_video_env_config

    # Load CPU governor service
    load_rk3588_cpu_governor_service

    # Load fan control configuration
    load_rk3588_fan_control_config

    # Load GPIO/PWM configuration
    load_gpio_pwm_config
}

# Load RK3588 fan control configuration
load_rk3588_fan_control_config() {
    local template="${CONFIG_DIR}/friendlyelec/rk3588-fan-control.conf.tmpl"
    local output="/etc/dangerprep/rk3588-fan-control.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log "Loaded RK3588 fan control configuration"
    else
        warning "RK3588 fan control template not found: $template"
    fi
}

# Install RK3588 fan control service
install_rk3588_fan_control_service() {
    local template="${CONFIG_DIR}/friendlyelec/rk3588-fan-control.service.tmpl"
    local output="/etc/systemd/system/rk3588-fan-control.service"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        systemctl daemon-reload
        systemctl enable rk3588-fan-control.service 2>/dev/null || true
        systemctl start rk3588-fan-control.service 2>/dev/null || true
        log "Installed and started RK3588 fan control service"
    else
        warning "RK3588 fan control service template not found: $template"
    fi
}

# Load GPIO/PWM configuration
load_gpio_pwm_config() {
    local template="${CONFIG_DIR}/friendlyelec/gpio-pwm-setup.conf.tmpl"
    local output="/etc/dangerprep/gpio-pwm-setup.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log "Loaded GPIO/PWM configuration"
    else
        warning "GPIO/PWM configuration template not found: $template"
    fi
}

# Load RK3588 sensors configuration
load_rk3588_sensors_config() {
    local template="${CONFIG_DIR}/friendlyelec/rk3588-sensors.conf.tmpl"
    local output="/etc/sensors.d/rk3588.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log "Loaded RK3588 sensors configuration"
    else
        warning "RK3588 sensors template not found: $template"
    fi
}

# Load RK3588 performance configuration
load_rk3588_performance_config() {
    local template="${CONFIG_DIR}/friendlyelec/rk3588-performance.conf.tmpl"
    local output="/etc/sysctl.d/99-rk3588-optimizations.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log "Loaded RK3588 performance configuration"
    else
        warning "RK3588 performance template not found: $template"
    fi
}

# Load RK3588 udev rules
load_rk3588_udev_rules() {
    local template="${CONFIG_DIR}/friendlyelec/rk3588-udev.rules.tmpl"
    local output="/etc/udev/rules.d/99-rk3588-hardware.rules"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        udevadm control --reload-rules 2>/dev/null || true
        log "Loaded RK3588 udev rules"
    else
        warning "RK3588 udev rules template not found: $template"
    fi
}

# Load RK3588 GPU configuration
load_rk3588_gpu_config() {
    local template="${CONFIG_DIR}/friendlyelec/mali-gpu.conf.tmpl"
    local output="/etc/environment.d/mali-gpu.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log "Loaded RK3588 GPU configuration"
    else
        warning "RK3588 GPU template not found: $template"
    fi
}

# Load RK3588 GStreamer configuration
load_rk3588_gstreamer_config() {
    local template="${CONFIG_DIR}/friendlyelec/gstreamer-hardware.conf.tmpl"
    local output="/etc/gstreamer-1.0/rk3588-hardware.conf"

    if [[ -f "$template" ]]; then
        mkdir -p "$(dirname "$output")"
        process_template "$template" "$output"
        log "Loaded RK3588 GStreamer configuration"
    else
        warning "RK3588 GStreamer template not found: $template"
    fi
}

# Load Mali GPU environment variables
load_mali_gpu_env_config() {
    local template="${CONFIG_DIR}/friendlyelec/mali-gpu-env.sh.tmpl"
    local output="/etc/profile.d/mali-gpu.sh"

    if [[ -f "$template" ]]; then
        mkdir -p "$(dirname "$output")"
        process_template "$template" "$output"
        log "Loaded Mali GPU environment configuration"
    else
        warning "Mali GPU environment template not found: $template"
    fi
}

# Load RK3588 video environment variables
load_rk3588_video_env_config() {
    local template="${CONFIG_DIR}/friendlyelec/rk3588-video-env.sh.tmpl"
    local output="/etc/profile.d/rk3588-video.sh"

    if [[ -f "$template" ]]; then
        mkdir -p "$(dirname "$output")"
        process_template "$template" "$output"
        log "Loaded RK3588 video environment configuration"
    else
        warning "RK3588 video environment template not found: $template"
    fi
}

# Load RK3588 CPU governor service
load_rk3588_cpu_governor_service() {
    local template="${CONFIG_DIR}/friendlyelec/rk3588-cpu-governor.service.tmpl"
    local output="/etc/systemd/system/rk3588-cpu-governor.service"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        systemctl daemon-reload
        systemctl enable rk3588-cpu-governor.service 2>/dev/null || true
        log "Loaded and enabled RK3588 CPU governor service"
    else
        warning "RK3588 CPU governor service template not found: $template"
    fi
}

# Load ethernet bonding configuration
load_ethernet_bonding_config() {
    local template="${CONFIG_DIR}/network/ethernet-bonding.yaml.tmpl"
    local output="/etc/netplan/99-ethernet-bonding.yaml"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log "Loaded ethernet bonding configuration"
    else
        warning "Ethernet bonding template not found: $template"
    fi
}

# Load minimal dnsmasq configuration
load_dnsmasq_minimal_config() {
    local template="${CONFIG_DIR}/network/dnsmasq-minimal.conf.tmpl"
    local output="/etc/dnsmasq.conf"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log "Loaded minimal dnsmasq configuration"
    else
        warning "Minimal dnsmasq template not found: $template"
    fi
}

# Load AdGuard Home service configuration
load_adguardhome_service_config() {
    local template="${CONFIG_DIR}/dns/adguardhome.service.tmpl"
    local output="/etc/systemd/system/adguardhome.service"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        systemctl daemon-reload
        log "Loaded AdGuard Home service configuration"
    else
        warning "AdGuard Home service template not found: $template"
    fi
}

# Load systemd-resolved AdGuard configuration
load_systemd_resolved_adguard_config() {
    local template="${CONFIG_DIR}/dns/systemd-resolved-adguard.conf.tmpl"
    local output="/etc/systemd/resolved.conf.d/adguard.conf"

    if [[ -f "$template" ]]; then
        mkdir -p "$(dirname "$output")"
        process_template "$template" "$output"
        log "Loaded systemd-resolved AdGuard configuration"
    else
        warning "systemd-resolved AdGuard template not found: $template"
    fi
}

# Load Step-CA service configuration
load_step_ca_service_config() {
    local template="${CONFIG_DIR}/security/step-ca.service.tmpl"
    local output="/etc/systemd/system/step-ca.service"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        systemctl daemon-reload
        log "Loaded Step-CA service configuration"
    else
        warning "Step-CA service template not found: $template"
    fi
}

# Load backup cron configuration
load_backup_cron_config() {
    local template="${CONFIG_DIR}/system/dangerprep-backups.cron.tmpl"
    local output="/etc/cron.d/dangerprep-backups"

    if [[ -f "$template" ]]; then
        process_template "$template" "$output"
        log "Loaded backup cron configuration"
    else
        warning "Backup cron template not found: $template"
    fi
}
