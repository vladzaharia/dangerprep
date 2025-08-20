#!/usr/bin/env bash
# DangerPrep AdGuard Home Installation Helper Functions
#
# Purpose: Consolidated AdGuard Home installation and configuration functions
# Usage: Source this file to access AdGuard Home installation functions
# Dependencies: logging.sh, errors.sh, services.sh, config.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices

# Prevent multiple sourcing
if [[ "${ADGUARD_HELPER_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly ADGUARD_HELPER_LOADED="true"

set -euo pipefail

# Get the directory where this script is located

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/errors.sh"
fi

if [[ -z "${SERVICES_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./services.sh
    source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/services.sh"
fi

if [[ -z "${CONFIG_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./config.sh
    source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/config.sh"
fi

# Mark this file as sourced
export ADGUARD_HELPER_SOURCED=true

#
# AdGuard Home Version Management
#

# Get latest AdGuard Home version from GitHub API
# Usage: get_latest_adguard_version_safe
# Returns: version string (e.g., "v0.107.52")
get_latest_adguard_version_safe() {
    local latest_version
    local fallback_version="v0.107.52"
    
    # Try to get latest version from GitHub API
    if latest_version=$(curl -s --max-time 10 "https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest" | \
                      grep '"tag_name":' | \
                      sed -E 's/.*"([^"]+)".*/\1/' 2>/dev/null); then
        
        # Validate version format
        if [[ -n "$latest_version" && "$latest_version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "$latest_version"
            return 0
        fi
    fi
    
    # Fallback to known stable version
    warning "Could not fetch latest AdGuard Home version, using fallback: $fallback_version"
    echo "$fallback_version"
    return 0
}

#
# AdGuard Home Installation Functions
#

# Install AdGuard Home as host service with comprehensive error handling
# Usage: install_adguard_home
# Returns: 0 if successful, 1 if failed
install_adguard_home() {
    log "Installing AdGuard Home as host service..."

    # Create AdGuard Home user and directories
    if ! setup_adguard_user_and_directories; then
        error "Failed to setup AdGuard Home user and directories"
        return 1
    fi

    # Download and install binary
    if ! download_and_install_adguard_binary; then
        error "Failed to download and install AdGuard Home binary"
        return 1
    fi

    # Configure AdGuard Home
    if ! configure_adguard_service; then
        error "Failed to configure AdGuard Home service"
        return 1
    fi

    # Start and verify service
    if ! start_and_verify_adguard_service; then
        error "Failed to start AdGuard Home service"
        return 1
    fi

    success "AdGuard Home installed and running as host service"
    return 0
}

# Setup AdGuard Home user and directories
# Usage: setup_adguard_user_and_directories
# Returns: 0 if successful, 1 if failed
setup_adguard_user_and_directories() {
    log "Setting up AdGuard Home user and directories..."

    # Create AdGuard Home user
    if ! create_service_user "adguardhome" "/var/lib/adguardhome"; then
        error "Failed to create adguardhome user"
        return 1
    fi

    # Create directories with secure permissions
    if ! create_service_directories "adguard" "/var/lib/adguardhome" "750" "adguardhome:adguardhome"; then
        error "Failed to create AdGuard Home directories"
        return 1
    fi

    # Set specific permissions for subdirectories
    chmod 750 /var/lib/adguardhome/{work,conf} 2>/dev/null || true
    chmod 755 /etc/adguardhome 2>/dev/null || true

    success "AdGuard Home user and directories created"
    return 0
}

# Download and install AdGuard Home binary
# Usage: download_and_install_adguard_binary
# Returns: 0 if successful, 1 if failed
download_and_install_adguard_binary() {
    log "Downloading and installing AdGuard Home binary..."

    # Get latest version
    local adguard_version
    adguard_version=$(get_latest_adguard_version_safe)
    log "Using AdGuard Home version: $adguard_version"

    # Determine architecture
    local arch="amd64"
    if [[ "${IS_ARM64:-false}" == true ]]; then
        arch="arm64"
    fi

    local adguard_url="https://github.com/AdguardTeam/AdGuardHome/releases/download/${adguard_version}/AdGuardHome_linux_${arch}.tar.gz"
    local temp_dir
    temp_dir=$(mktemp -d)

    # Download with error handling
    log "Downloading AdGuard Home from: $adguard_url"
    if ! curl -fsSL --max-time 300 "$adguard_url" -o "${temp_dir}/adguardhome.tar.gz"; then
        error "Failed to download AdGuard Home"
        rm -rf "$temp_dir"
        return 1
    fi

    # Verify download is not empty
    if [[ ! -s "${temp_dir}/adguardhome.tar.gz" ]]; then
        error "Downloaded AdGuard Home archive is empty"
        rm -rf "$temp_dir"
        return 1
    fi

    # Extract and verify
    cd "$temp_dir" || {
        error "Cannot change to temp directory"
        rm -rf "$temp_dir"
        return 1
    }

    if ! tar -xzf adguardhome.tar.gz; then
        error "Failed to extract AdGuard Home archive"
        rm -rf "$temp_dir"
        return 1
    fi

    if [[ ! -f AdGuardHome/AdGuardHome ]]; then
        error "AdGuard Home binary not found in archive"
        rm -rf "$temp_dir"
        return 1
    fi

    # Install binary with backup
    if [[ -f /usr/local/bin/AdGuardHome ]]; then
        log "Backing up existing AdGuard Home binary"
        cp /usr/local/bin/AdGuardHome /usr/local/bin/AdGuardHome.backup 2>/dev/null || true
    fi

    if ! cp AdGuardHome/AdGuardHome /usr/local/bin/; then
        error "Failed to install AdGuard Home binary"
        rm -rf "$temp_dir"
        return 1
    fi

    chmod +x /usr/local/bin/AdGuardHome
    rm -rf "$temp_dir"

    # Verify installation
    if ! /usr/local/bin/AdGuardHome --version >/dev/null 2>&1; then
        error "AdGuard Home installation verification failed"
        return 1
    fi

    success "AdGuard Home binary installed successfully"
    return 0
}

# Configure AdGuard Home service
# Usage: configure_adguard_service
# Returns: 0 if successful, 1 if failed
configure_adguard_service() {
    log "Configuring AdGuard Home service..."

    # Load AdGuard Home configuration
    if ! load_adguard_config; then
        error "Failed to load AdGuard Home configuration"
        return 1
    fi

    # Create systemd service
    if ! create_adguard_systemd_service_safe; then
        error "Failed to create AdGuard Home systemd service"
        return 1
    fi

    # Set secure permissions
    chown -R adguardhome:adguardhome /var/lib/adguardhome 2>/dev/null || true
    chown -R adguardhome:adguardhome /etc/adguardhome 2>/dev/null || true

    # Ensure configuration files have secure permissions
    if [[ -f /etc/adguardhome/AdGuardHome.yaml ]]; then
        chmod 640 /etc/adguardhome/AdGuardHome.yaml
        chown adguardhome:adguardhome /etc/adguardhome/AdGuardHome.yaml
    fi

    success "AdGuard Home service configured"
    return 0
}

# Create AdGuard Home systemd service safely
# Usage: create_adguard_systemd_service_safe
# Returns: 0 if successful, 1 if failed
create_adguard_systemd_service_safe() {
    log "Creating AdGuard Home systemd service..."

    if ! load_adguardhome_service_config; then
        error "Failed to load AdGuard Home service configuration"
        return 1
    fi

    # Reload systemd daemon
    systemctl daemon-reload

    success "AdGuard Home systemd service created"
    return 0
}

# Start and verify AdGuard Home service
# Usage: start_and_verify_adguard_service
# Returns: 0 if successful, 1 if failed
start_and_verify_adguard_service() {
    log "Starting and verifying AdGuard Home service..."

    # Enable service
    if ! systemctl enable adguardhome; then
        error "Failed to enable AdGuard Home service"
        return 1
    fi

    # Start service
    if ! systemctl start adguardhome; then
        error "Failed to start AdGuard Home service"
        return 1
    fi

    # Wait for service to start
    sleep 3

    # Verify service is running
    if ! systemctl is-active --quiet adguardhome; then
        error "AdGuard Home service is not running"
        log "Service status:"
        systemctl status adguardhome --no-pager || true
        return 1
    fi

    # Verify service is listening on expected ports
    if ! check_adguard_ports; then
        warning "AdGuard Home may not be listening on expected ports"
    fi

    success "AdGuard Home service started and verified"
    return 0
}

# Check if AdGuard Home is listening on expected ports
# Usage: check_adguard_ports
# Returns: 0 if ports are listening, 1 if not
check_adguard_ports() {
    local expected_ports=(3000 5053)
    local listening_ports=()
    local missing_ports=()

    for port in "${expected_ports[@]}"; do
        if ss -tuln 2>/dev/null | grep -q ":${port} "; then
            listening_ports+=("$port")
        else
            missing_ports+=("$port")
        fi
    done

    if [[ ${#missing_ports[@]} -eq 0 ]]; then
        success "AdGuard Home is listening on all expected ports: ${listening_ports[*]}"
        return 0
    else
        warning "AdGuard Home is not listening on ports: ${missing_ports[*]}"
        if [[ ${#listening_ports[@]} -gt 0 ]]; then
            log "Listening on ports: ${listening_ports[*]}"
        fi
        return 1
    fi
}

#
# DNS Configuration Functions
#

# Configure DNS resolution chain
# Usage: configure_dns_chain
# Returns: 0 if successful, 1 if failed
configure_dns_chain() {
    log "Configuring DNS resolution chain..."

    # Configure systemd-resolved to use AdGuard Home
    if ! load_systemd_resolved_adguard_config; then
        error "Failed to load systemd-resolved configuration"
        return 1
    fi

    # Restart systemd-resolved
    if ! systemctl restart systemd-resolved; then
        error "Failed to restart systemd-resolved"
        return 1
    fi

    # Verify DNS configuration
    if ! verify_dns_chain; then
        warning "DNS chain verification failed"
    fi

    success "DNS chain configured: client → systemd-resolved → AdGuard Home → NextDNS"
    return 0
}

# Verify DNS resolution chain
# Usage: verify_dns_chain
# Returns: 0 if working, 1 if issues detected
verify_dns_chain() {
    log "Verifying DNS resolution chain..."

    # Test DNS resolution
    if nslookup google.com >/dev/null 2>&1; then
        success "DNS resolution is working"
        return 0
    else
        warning "DNS resolution test failed"
        return 1
    fi
}

#
# Main AdGuard Home Setup Function
#

# Setup DNS services with AdGuard Home
# Usage: setup_dns_services
# Returns: 0 if successful, 1 if failed
setup_dns_services() {
    log_section "DNS Services Setup"

    # Install AdGuard Home as host service
    if ! install_adguard_home; then
        error "Failed to install AdGuard Home"
        return 1
    fi

    # Configure DNS resolution chain
    if ! configure_dns_chain; then
        error "Failed to configure DNS chain"
        return 1
    fi

    success "Host-based DNS services configured successfully"
    return 0
}

# Export functions for use in other scripts
export -f get_latest_adguard_version_safe
export -f install_adguard_home
export -f setup_adguard_user_and_directories
export -f download_and_install_adguard_binary
export -f configure_adguard_service
export -f create_adguard_systemd_service_safe
export -f start_and_verify_adguard_service
export -f check_adguard_ports
export -f configure_dns_chain
export -f verify_dns_chain
export -f setup_dns_services
