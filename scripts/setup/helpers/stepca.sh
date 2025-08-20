#!/usr/bin/env bash
# DangerPrep Step-CA Installation Helper Functions
#
# Purpose: Consolidated Step-CA installation and configuration functions
# Usage: Source this file to access Step-CA installation functions
# Dependencies: logging.sh, errors.sh, services.sh, config.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices

# Prevent multiple sourcing
if [[ "${STEPCA_HELPER_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly STEPCA_HELPER_LOADED="true"

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
export STEPCA_HELPER_SOURCED=true

#
# Step-CA Version Management
#

# Get latest Step version from GitHub API
# Usage: get_latest_step_version_safe "cli" | "certificates"
# Returns: version string (e.g., "0.25.2")
get_latest_step_version_safe() {
    local repo="$1"  # "cli" or "certificates"
    local fallback_version="0.25.2"
    
    if [[ -z "$repo" ]]; then
        error "Repository name required (cli or certificates)"
        echo "$fallback_version"
        return 1
    fi
    
    local latest_version
    if latest_version=$(curl -s --max-time 10 "https://api.github.com/repos/smallstep/${repo}/releases/latest" | \
                      grep '"tag_name":' | \
                      sed -E 's/.*"([^"]+)".*/\1/' 2>/dev/null); then
        
        # Validate version format and remove 'v' prefix if present
        if [[ -n "$latest_version" && "$latest_version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "${latest_version#v}"
            return 0
        fi
    fi
    
    # Fallback to known stable version
    warning "Could not fetch latest Step $repo version, using fallback: $fallback_version"
    echo "$fallback_version"
    return 0
}

#
# Step-CA Installation Functions
#

# Install Step-CA as host service with comprehensive error handling
# Usage: install_step_ca
# Returns: 0 if successful, 1 if failed
install_step_ca() {
    log "Installing Step-CA as host service..."

    # Create Step user and directories
    if ! setup_step_user_and_directories; then
        error "Failed to setup Step user and directories"
        return 1
    fi

    # Download and install binaries
    if ! download_and_install_step_binaries; then
        error "Failed to download and install Step binaries"
        return 1
    fi

    # Configure Step-CA
    if ! configure_step_ca; then
        error "Failed to configure Step-CA"
        return 1
    fi

    success "Step-CA installed and configured as host service"
    return 0
}

# Setup Step user and directories
# Usage: setup_step_user_and_directories
# Returns: 0 if successful, 1 if failed
setup_step_user_and_directories() {
    log "Setting up Step user and directories..."

    # Create Step user
    if ! create_service_user "step" "/var/lib/step"; then
        error "Failed to create step user"
        return 1
    fi

    # Create directories with secure permissions
    if ! create_service_directories "step-ca" "/var/lib/step" "750" "step:step"; then
        error "Failed to create Step directories"
        return 1
    fi

    # Set specific permissions for subdirectories
    chmod 750 /var/lib/step/{config,certs} 2>/dev/null || true
    chmod 700 /var/lib/step/secrets 2>/dev/null || true  # Extra secure for secrets
    chmod 755 /etc/step 2>/dev/null || true

    success "Step user and directories created"
    return 0
}

# Download and install Step binaries
# Usage: download_and_install_step_binaries
# Returns: 0 if successful, 1 if failed
download_and_install_step_binaries() {
    log "Downloading and installing Step binaries..."

    # Get latest versions
    local step_version
    step_version=$(get_latest_step_version_safe "cli")
    local step_ca_version
    step_ca_version=$(get_latest_step_version_safe "certificates")

    log "Using Step CLI version: $step_version"
    log "Using Step-CA version: $step_ca_version"

    # Determine architecture
    local arch="amd64"
    if [[ "${IS_ARM64:-false}" == true ]]; then
        arch="arm64"
    fi

    # Create temporary directory
    local temp_dir
    temp_dir=$(mktemp -d)

    # Download and install Step CLI
    if ! download_and_install_step_cli "$step_version" "$arch" "$temp_dir"; then
        error "Failed to install Step CLI"
        rm -rf "$temp_dir"
        return 1
    fi

    # Download and install Step-CA
    if ! download_and_install_step_ca "$step_ca_version" "$arch" "$temp_dir"; then
        error "Failed to install Step-CA"
        rm -rf "$temp_dir"
        return 1
    fi

    # Cleanup
    rm -rf "$temp_dir"

    # Verify installations
    if ! verify_step_installations; then
        error "Step installation verification failed"
        return 1
    fi

    success "Step binaries installed successfully"
    return 0
}

# Download and install Step CLI
# Usage: download_and_install_step_cli "version" "arch" "temp_dir"
# Returns: 0 if successful, 1 if failed
download_and_install_step_cli() {
    local version="$1"
    local arch="$2"
    local temp_dir="$3"

    local step_cli_url="https://github.com/smallstep/cli/releases/download/v${version}/step_linux_${version}_${arch}.tar.gz"

    log "Downloading Step CLI from: $step_cli_url"
    cd "$temp_dir" || return 1

    if ! curl -fsSL --max-time 300 "$step_cli_url" -o step-cli.tar.gz; then
        error "Failed to download Step CLI"
        return 1
    fi

    if [[ ! -s step-cli.tar.gz ]]; then
        error "Downloaded Step CLI archive is empty"
        return 1
    fi

    if ! tar -xzf step-cli.tar.gz; then
        error "Failed to extract Step CLI archive"
        return 1
    fi

    if [[ ! -f "step_${version}/bin/step" ]]; then
        error "Step CLI binary not found in archive"
        return 1
    fi

    # Backup existing binary if present
    if [[ -f /usr/local/bin/step ]]; then
        cp /usr/local/bin/step /usr/local/bin/step.backup 2>/dev/null || true
    fi

    if ! cp "step_${version}/bin/step" /usr/local/bin/; then
        error "Failed to install Step CLI binary"
        return 1
    fi

    chmod +x /usr/local/bin/step
    success "Step CLI installed"
    return 0
}

# Download and install Step-CA
# Usage: download_and_install_step_ca "version" "arch" "temp_dir"
# Returns: 0 if successful, 1 if failed
download_and_install_step_ca() {
    local version="$1"
    local arch="$2"
    local temp_dir="$3"

    local step_ca_url="https://github.com/smallstep/certificates/releases/download/v${version}/step-ca_linux_${version}_${arch}.tar.gz"

    log "Downloading Step-CA from: $step_ca_url"
    cd "$temp_dir" || return 1

    if ! curl -fsSL --max-time 300 "$step_ca_url" -o step-ca.tar.gz; then
        error "Failed to download Step-CA"
        return 1
    fi

    if [[ ! -s step-ca.tar.gz ]]; then
        error "Downloaded Step-CA archive is empty"
        return 1
    fi

    if ! tar -xzf step-ca.tar.gz; then
        error "Failed to extract Step-CA archive"
        return 1
    fi

    if [[ ! -f "step-ca_${version}/bin/step-ca" ]]; then
        error "Step-CA binary not found in archive"
        return 1
    fi

    # Backup existing binary if present
    if [[ -f /usr/local/bin/step-ca ]]; then
        cp /usr/local/bin/step-ca /usr/local/bin/step-ca.backup 2>/dev/null || true
    fi

    if ! cp "step-ca_${version}/bin/step-ca" /usr/local/bin/; then
        error "Failed to install Step-CA binary"
        return 1
    fi

    chmod +x /usr/local/bin/step-ca
    success "Step-CA installed"
    return 0
}

# Verify Step installations
# Usage: verify_step_installations
# Returns: 0 if successful, 1 if failed
verify_step_installations() {
    log "Verifying Step installations..."

    if ! /usr/local/bin/step version >/dev/null 2>&1; then
        error "Step CLI installation verification failed"
        return 1
    fi

    if ! /usr/local/bin/step-ca version >/dev/null 2>&1; then
        error "Step-CA installation verification failed"
        return 1
    fi

    success "Step installations verified"
    return 0
}

#
# Step-CA Configuration Functions
#

# Configure Step-CA with comprehensive setup
# Usage: configure_step_ca
# Returns: 0 if successful, 1 if failed
configure_step_ca() {
    log "Configuring Step-CA..."

    # Initialize CA if not already done
    if ! initialize_step_ca; then
        error "Failed to initialize Step-CA"
        return 1
    fi

    # Create systemd service
    if ! create_step_ca_systemd_service_safe; then
        error "Failed to create Step-CA systemd service"
        return 1
    fi

    # Set secure permissions
    if ! set_step_ca_permissions; then
        error "Failed to set Step-CA permissions"
        return 1
    fi

    # Start and verify service
    if ! start_and_verify_step_ca_service; then
        error "Failed to start Step-CA service"
        return 1
    fi

    success "Step-CA configured successfully"
    return 0
}

# Initialize Step-CA
# Usage: initialize_step_ca
# Returns: 0 if successful, 1 if failed
initialize_step_ca() {
    # Check if already initialized
    if [[ -f /var/lib/step/config/ca.json ]]; then
        log "Step-CA already initialized"
        return 0
    fi

    log "Initializing Step-CA..."

    # Generate CA password
    local ca_password
    ca_password=$(openssl rand -base64 32)
    echo "$ca_password" > /var/lib/step/secrets/password
    chmod 600 /var/lib/step/secrets/password
    chown step:step /var/lib/step/secrets/password

    # Initialize CA
    if sudo -u step STEPPATH=/var/lib/step step ca init \
        --name "DangerPrep Internal CA" \
        --dns "ca.danger,step-ca.danger,localhost" \
        --address ":9000" \
        --provisioner "admin" \
        --password-file /var/lib/step/secrets/password \
        --provisioner-password-file /var/lib/step/secrets/password; then
        success "Step-CA initialized successfully"
        return 0
    else
        error "Failed to initialize Step-CA"
        return 1
    fi
}

# Create Step-CA systemd service safely
# Usage: create_step_ca_systemd_service_safe
# Returns: 0 if successful, 1 if failed
create_step_ca_systemd_service_safe() {
    log "Creating Step-CA systemd service..."

    if ! load_step_ca_service_config; then
        error "Failed to load Step-CA service configuration"
        return 1
    fi

    # Reload systemd daemon
    systemctl daemon-reload

    success "Step-CA systemd service created"
    return 0
}

# Set secure permissions for Step-CA
# Usage: set_step_ca_permissions
# Returns: 0 if successful
set_step_ca_permissions() {
    log "Setting secure permissions for Step-CA..."

    # Set ownership
    chown -R step:step /var/lib/step 2>/dev/null || true
    chown -R step:step /etc/step 2>/dev/null || true

    # Set specific file permissions
    if [[ -f /var/lib/step/secrets/password ]]; then
        chmod 600 /var/lib/step/secrets/password
        chown step:step /var/lib/step/secrets/password
    fi

    if [[ -f /var/lib/step/config/ca.json ]]; then
        chmod 640 /var/lib/step/config/ca.json
        chown step:step /var/lib/step/config/ca.json
    fi

    success "Step-CA permissions set"
    return 0
}

# Start and verify Step-CA service
# Usage: start_and_verify_step_ca_service
# Returns: 0 if successful, 1 if failed
start_and_verify_step_ca_service() {
    log "Starting and verifying Step-CA service..."

    # Enable service
    if ! systemctl enable step-ca; then
        error "Failed to enable Step-CA service"
        return 1
    fi

    # Start service
    if ! systemctl start step-ca; then
        error "Failed to start Step-CA service"
        return 1
    fi

    # Wait for service to start
    sleep 3

    # Verify service is running
    if ! systemctl is-active --quiet step-ca; then
        error "Step-CA service is not running"
        log "Service status:"
        systemctl status step-ca --no-pager || true
        return 1
    fi

    # Verify service is listening on port 9000
    if ! check_step_ca_port; then
        warning "Step-CA may not be listening on port 9000"
    fi

    success "Step-CA service started and verified"
    return 0
}

# Check if Step-CA is listening on port 9000
# Usage: check_step_ca_port
# Returns: 0 if listening, 1 if not
check_step_ca_port() {
    if ss -tuln 2>/dev/null | grep -q ":9000 "; then
        success "Step-CA is listening on port 9000"
        return 0
    else
        warning "Step-CA is not listening on port 9000"
        return 1
    fi
}

#
# Main Step-CA Setup Function
#

# Setup certificate management with Step-CA
# Usage: setup_certificate_management
# Returns: 0 if successful, 1 if failed
setup_certificate_management() {
    log_section "Certificate Management Setup"

    # Install Step-CA as host service
    if ! install_step_ca; then
        error "Failed to install Step-CA"
        return 1
    fi

    success "Host-based certificate management configured successfully"
    return 0
}

# Export functions for use in other scripts
export -f get_latest_step_version_safe
export -f install_step_ca
export -f setup_step_user_and_directories
export -f download_and_install_step_binaries
export -f download_and_install_step_cli
export -f download_and_install_step_ca
export -f verify_step_installations
export -f configure_step_ca
export -f initialize_step_ca
export -f create_step_ca_systemd_service_safe
export -f set_step_ca_permissions
export -f start_and_verify_step_ca_service
export -f check_step_ca_port
export -f setup_certificate_management
