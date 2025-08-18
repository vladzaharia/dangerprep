#!/usr/bin/env bash
# DangerPrep Package Management Helper Functions
#
# Purpose: Consolidated package installation and management functions
# Usage: Source this file to access package management functions
# Dependencies: logging.sh, errors.sh, hardware.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Get the directory where this script is located
PACKAGES_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${PACKAGES_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${PACKAGES_HELPER_DIR}/../../shared/errors.sh"
fi

if [[ -z "${HARDWARE_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./hardware.sh
    source "${PACKAGES_HELPER_DIR}/hardware.sh"
fi

# Mark this file as sourced
export PACKAGES_HELPER_SOURCED=true

#
# System Package Management Functions
#

# Update system packages with comprehensive error handling
# Usage: update_system_packages_safe
# Returns: 0 if successful, 1 if failed
update_system_packages_safe() {
    log "Updating system packages..."
    
    export DEBIAN_FRONTEND=noninteractive
    
    # Update package lists with retry logic
    local retry_count=0
    local max_retries=3
    
    while [[ $retry_count -lt $max_retries ]]; do
        if apt update; then
            break
        else
            retry_count=$((retry_count + 1))
            if [[ $retry_count -lt $max_retries ]]; then
                warning "Package update failed, retrying in 5 seconds... (attempt $retry_count/$max_retries)"
                sleep 5
            else
                error "Failed to update package lists after $max_retries attempts"
                return 1
            fi
        fi
    done
    
    # Upgrade packages
    if apt upgrade -y; then
        success "System packages updated successfully"
        return 0
    else
        error "Failed to upgrade system packages"
        return 1
    fi
}

# Install packages with error handling and reporting
# Usage: install_packages_safe "package1" "package2" "package3"
# Returns: 0 if all successful, 1 if any failed
install_packages_safe() {
    local packages=("$@")
    
    if [[ ${#packages[@]} -eq 0 ]]; then
        error "No packages specified for installation"
        return 1
    fi
    
    log "Installing packages: ${packages[*]}"
    
    local failed_packages=()
    local installed_packages=()
    
    for package in "${packages[@]}"; do
        log "Installing $package..."
        if DEBIAN_FRONTEND=noninteractive apt install -y "$package" 2>/dev/null; then
            success "Installed $package"
            installed_packages+=("$package")
        else
            warning "Failed to install $package"
            failed_packages+=("$package")
        fi
    done
    
    # Report results
    if [[ ${#installed_packages[@]} -gt 0 ]]; then
        log "Successfully installed: ${installed_packages[*]}"
    fi
    
    if [[ ${#failed_packages[@]} -gt 0 ]]; then
        warning "Failed to install packages: ${failed_packages[*]}"
        log "These packages may not be available in the current repository"
        return 1
    fi
    
    return 0
}

# Install essential packages by category
# Usage: install_essential_packages
# Returns: 0 if successful, 1 if critical failures
install_essential_packages() {
    log "Installing essential packages by category..."

    # Define package categories
    local core_packages=(
        "curl" "wget" "git" "vim" "nano" "htop" "tree" "unzip" "zip"
        "software-properties-common" "apt-transport-https" "ca-certificates"
        "gnupg" "lsb-release" "jq" "bc" "rsync" "screen" "tmux"
    )

    local network_packages=(
        "hostapd" "dnsmasq" "iptables-persistent" "bridge-utils"
        "wireless-tools" "wpasupplicant" "iw" "rfkill" "netplan.io"
        "iproute2" "tc" "wondershaper" "iperf3"
    )

    local nfs_packages=(
        "nfs-common"
    )

    local security_packages=(
        "fail2ban" "aide" "rkhunter" "chkrootkit" "clamav" "clamav-daemon"
        "lynis" "apparmor" "apparmor-utils" "libpam-pwquality"
        "libpam-tmpdir" "acct" "psacct" "apache2-utils"
    )

    local monitoring_packages=(
        "lm-sensors" "hddtemp" "fancontrol" "sensors-applet"
        "collectd" "collectd-utils" "logwatch" "rsyslog-gnutls"
        "smartmontools"
    )

    local backup_packages=(
        "borgbackup" "restic"
    )

    local update_packages=(
        "unattended-upgrades"
    )

    local olares_packages=(
        "systemd" "systemd-resolved" "systemd-timesyncd"
    )
    
    # Install packages by category with error tracking
    local category_failures=0
    
    # Core packages (critical)
    log "Installing core packages..."
    if ! install_packages_safe "${core_packages[@]}"; then
        error "Critical: Failed to install some core packages"
        category_failures=$((category_failures + 1))
    fi
    
    # Network packages (critical for functionality)
    log "Installing network packages..."
    if ! install_packages_safe "${network_packages[@]}"; then
        warning "Some network packages failed to install"
        category_failures=$((category_failures + 1))
    fi
    
    # NFS packages
    log "Installing NFS packages..."
    if ! install_packages_safe "${nfs_packages[@]}"; then
        warning "NFS packages failed to install"
    fi
    
    # Security packages
    log "Installing security packages..."
    if ! install_packages_safe "${security_packages[@]}"; then
        warning "Some security packages failed to install"
    fi
    
    # Monitoring packages
    log "Installing monitoring packages..."
    if ! install_packages_safe "${monitoring_packages[@]}"; then
        warning "Some monitoring packages failed to install"
    fi
    
    # Backup packages
    log "Installing backup packages..."
    if ! install_packages_safe "${backup_packages[@]}"; then
        warning "Some backup packages failed to install"
    fi
    
    # Update packages
    log "Installing update packages..."
    if ! install_packages_safe "${update_packages[@]}"; then
        warning "Update packages failed to install"
    fi
    
    # Olares packages
    log "Installing Olares-required packages..."
    if ! install_packages_safe "${olares_packages[@]}"; then
        warning "Some Olares packages failed to install"
    fi
    
    # Install FriendlyElec-specific packages if applicable
    if [[ "${IS_FRIENDLYELEC:-false}" == true ]]; then
        log "Installing FriendlyElec-specific packages..."
        install_friendlyelec_packages
    fi

    # Clean up package cache
    log "Cleaning up package cache..."
    apt autoremove -y
    apt autoclean

    # Report final status
    if [[ $category_failures -eq 0 ]]; then
        success "All essential packages installed successfully"
        return 0
    elif [[ $category_failures -le 2 ]]; then
        warning "Essential packages installed with some failures (non-critical)"
        return 0
    else
        error "Critical package installation failures detected"
        return 1
    fi
}

#
# Package Verification Functions
#

# Verify critical packages are installed
# Usage: verify_critical_packages
# Returns: 0 if all critical packages present, 1 if missing
verify_critical_packages() {
    log "Verifying critical packages are installed..."
    
    local critical_packages=(
        "curl" "wget" "systemctl" "hostapd" "dnsmasq" 
        "iptables" "fail2ban" "unattended-upgrades"
    )
    
    local missing_packages=()
    
    for package in "${critical_packages[@]}"; do
        if ! command -v "$package" >/dev/null 2>&1 && ! dpkg -l | grep -q "^ii.*$package"; then
            missing_packages+=("$package")
        fi
    done
    
    if [[ ${#missing_packages[@]} -gt 0 ]]; then
        error "Critical packages missing: ${missing_packages[*]}"
        return 1
    fi
    
    success "All critical packages verified"
    return 0
}

# Check for package conflicts
# Usage: check_package_conflicts
# Returns: 0 if no conflicts, 1 if conflicts detected
check_package_conflicts() {
    log "Checking for package conflicts..."
    
    local conflicts_detected=0
    
    # Check for NetworkManager conflicts with hostapd
    if systemctl is-active --quiet NetworkManager 2>/dev/null; then
        warning "NetworkManager is active - may conflict with hostapd"
        log "Consider disabling NetworkManager or configuring it to ignore WiFi interface"
        conflicts_detected=$((conflicts_detected + 1))
    fi
    
    # Check for systemd-resolved conflicts
    if systemctl is-active --quiet systemd-resolved 2>/dev/null; then
        log "systemd-resolved is active - will be configured to work with AdGuard Home"
    fi
    
    # Check for existing DNS services
    local dns_services=("bind9" "named" "unbound")
    for service in "${dns_services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            warning "DNS service $service is active - may conflict with AdGuard Home"
            conflicts_detected=$((conflicts_detected + 1))
        fi
    done
    
    if [[ $conflicts_detected -eq 0 ]]; then
        success "No package conflicts detected"
        return 0
    else
        warning "Package conflicts detected: $conflicts_detected"
        return 1
    fi
}

#
# Main Package Management Functions
#

# Complete package management workflow
# Usage: manage_packages_complete
# Returns: 0 if successful, 1 if failed
manage_packages_complete() {
    log_section "Package Management"
    
    # Update system packages
    if ! update_system_packages_safe; then
        error "Failed to update system packages"
        return 1
    fi
    
    # Install essential packages
    if ! install_essential_packages; then
        error "Critical package installation failures"
        return 1
    fi
    
    # Verify critical packages
    if ! verify_critical_packages; then
        error "Critical package verification failed"
        return 1
    fi
    
    # Check for conflicts (non-fatal)
    check_package_conflicts || true
    
    success "Package management completed successfully"
    return 0
}
