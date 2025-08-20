#!/usr/bin/env bash
# DangerPrep Olares Installation Helper Functions
#
# Purpose: Consolidated Olares installation and integration functions
# Usage: Source this file to access Olares installation functions
# Dependencies: logging.sh, errors.sh, directories.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices

# Prevent multiple sourcing
if [[ "${OLARES_HELPER_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly OLARES_HELPER_LOADED="true"

set -euo pipefail

# Get the directory where this script is located
OLARES_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${OLARES_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${OLARES_HELPER_DIR}/../../shared/errors.sh"
fi

if [[ -z "${DIRECTORIES_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./directories.sh
    source "${OLARES_HELPER_DIR}/directories.sh"
fi

# Mark this file as sourced
export OLARES_HELPER_SOURCED=true

#
# Olares System Requirements Functions
#

# Check Olares system requirements
# Usage: check_olares_requirements
# Returns: 0 if requirements met, 1 if not
check_olares_requirements() {
    log "Checking Olares system requirements..."

    # Check minimum system requirements
    local total_memory
    total_memory=$(free -m | awk '/^Mem:/{print $2}')
    local cpu_cores
    cpu_cores=$(nproc)
    local available_disk
    available_disk=$(df / | awk 'NR==2{print int($4/1024/1024)}')

    local requirements_met=true

    # Memory requirement (2GB minimum)
    if [[ ${total_memory} -lt 2048 ]]; then
        error "Insufficient memory: ${total_memory}MB available, 2GB required"
        requirements_met=false
    fi

    # CPU requirement (2 cores minimum)
    if [[ ${cpu_cores} -lt 2 ]]; then
        error "Insufficient CPU cores: ${cpu_cores} available, 2 required"
        requirements_met=false
    fi

    # Disk space requirement (20GB minimum)
    if [[ ${available_disk} -lt 20 ]]; then
        error "Insufficient disk space: ${available_disk}GB available, 20GB required"
        requirements_met=false
    fi

    # Check for systemd
    if ! command -v systemctl >/dev/null 2>&1; then
        error "systemd is required for Olares"
        requirements_met=false
    fi

    # Check Ubuntu version (warn if not 24.04)
    if ! grep -q "Ubuntu 24.04" /etc/os-release 2>/dev/null; then
        warning "Olares is tested on Ubuntu 24.04, current version may have compatibility issues"
        local os_version
        os_version=$(grep "PRETTY_NAME" /etc/os-release 2>/dev/null | cut -d'"' -f2 || echo "Unknown")
        log "Current OS: $os_version"
    fi

    # Check for conflicting services
    check_olares_conflicts

    if [[ "$requirements_met" == true ]]; then
        success "System meets Olares requirements (${total_memory}MB RAM, ${cpu_cores} cores, ${available_disk}GB disk)"
        return 0
    else
        error "System does not meet Olares requirements"
        return 1
    fi
}

# Check for services that might conflict with Olares
# Usage: check_olares_conflicts
# Returns: 0 if no conflicts, 1 if conflicts detected
check_olares_conflicts() {
    log "Checking for potential Olares conflicts..."
    
    local conflicts_detected=false
    
    # Check for Docker (Olares uses K3s)
    if command -v docker >/dev/null 2>&1; then
        warning "Docker is installed - will be removed to avoid conflicts with K3s"
        conflicts_detected=true
    fi
    
    # Check for existing Kubernetes installations
    if command -v kubectl >/dev/null 2>&1; then
        warning "kubectl is installed - may conflict with Olares K3s"
        conflicts_detected=true
    fi
    
    # Check for existing container runtimes
    if command -v containerd >/dev/null 2>&1; then
        warning "containerd is installed - may conflict with Olares"
        conflicts_detected=true
    fi
    
    # Check for port conflicts (common Olares ports)
    local olares_ports=(80 443 6443 8080 9090)
    for port in "${olares_ports[@]}"; do
        if ss -tuln 2>/dev/null | grep -q ":${port} "; then
            warning "Port $port is in use - may conflict with Olares services"
            conflicts_detected=true
        fi
    done
    
    if [[ "$conflicts_detected" == true ]]; then
        log "Conflicts detected but will be resolved during installation"
        return 1
    else
        success "No Olares conflicts detected"
        return 0
    fi
}

#
# Olares Installation Functions
#

# Download Olares installer
# Usage: download_olares_installer_safe
# Returns: 0 if successful, 1 if failed
download_olares_installer_safe() {
    log "Downloading Olares installer..."

    local installer_url="https://github.com/beclab/olares/releases/latest/download/install.sh"
    local installer_path="/tmp/olares-install.sh"
    local backup_url="https://raw.githubusercontent.com/beclab/olares/main/scripts/install.sh"

    # Try primary URL first
    if curl -fsSL "$installer_url" -o "$installer_path" 2>/dev/null; then
        chmod +x "$installer_path"
        success "Olares installer downloaded successfully from releases"
        return 0
    else
        warning "Failed to download from releases, trying backup URL..."
        
        # Try backup URL
        if curl -fsSL "$backup_url" -o "$installer_path" 2>/dev/null; then
            chmod +x "$installer_path"
            success "Olares installer downloaded successfully from backup"
            return 0
        else
            error "Failed to download Olares installer from both URLs"
            return 1
        fi
    fi
}

# Prepare environment for Olares installation
# Usage: prepare_olares_environment_safe
# Returns: 0 if successful, 1 if failed
prepare_olares_environment_safe() {
    log "Preparing environment for Olares installation..."

    # Stop and disable conflicting services
    local services_to_stop=("docker" "containerd" "k3s" "k3s-agent")
    for service in "${services_to_stop[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            log "Stopping $service service..."
            systemctl stop "$service" 2>/dev/null || true
        fi
        
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            log "Disabling $service service..."
            systemctl disable "$service" 2>/dev/null || true
        fi
    done

    # Remove Docker if present (Olares uses K3s)
    if command -v docker >/dev/null 2>&1; then
        log "Removing Docker to avoid conflicts with K3s..."
        
        # Stop all Docker containers
        docker stop "$(docker ps -aq)" 2>/dev/null || true
        
        # Remove Docker packages
        local docker_packages=("docker.io" "docker-ce" "docker-ce-cli" "containerd.io" "docker-compose-plugin")
        for package in "${docker_packages[@]}"; do
            if dpkg -l | grep -q "^ii.*$package"; then
                log "Removing $package..."
                apt remove -y "$package" 2>/dev/null || true
            fi
        done
        
        # Clean up Docker data
        if [[ -d /var/lib/docker ]]; then
            log "Cleaning up Docker data..."
            rm -rf /var/lib/docker 2>/dev/null || true
        fi
        
        apt autoremove -y
        success "Docker removed successfully"
    fi

    # Create Olares directories
    create_content_directories "${INSTALL_ROOT:-/dangerprep}"

    # Set up environment variables for Olares
    # Use mounted /olares directory if available, otherwise fall back to install root
    if mountpoint -q "/olares" 2>/dev/null; then
        export OLARES_INSTALL_ROOT="/olares"
        log "Using mounted Olares storage at /olares"
    else
        export OLARES_INSTALL_ROOT="${INSTALL_ROOT:-/dangerprep}"
        log "Using local Olares storage at ${OLARES_INSTALL_ROOT}"
    fi
    export OLARES_DATA_DIR="${OLARES_INSTALL_ROOT}/data"

    success "Environment prepared for Olares installation"
    return 0
}

# Install Olares with comprehensive error handling
# Usage: install_olares
# Returns: 0 if successful, 1 if failed
install_olares() {
    log "Installing Olares..."

    # Check requirements first
    if ! check_olares_requirements; then
        error "System does not meet Olares requirements"
        return 1
    fi

    # Download installer
    if ! download_olares_installer_safe; then
        error "Failed to download Olares installer"
        return 1
    fi

    # Prepare environment
    if ! prepare_olares_environment_safe; then
        error "Failed to prepare environment for Olares"
        return 1
    fi

    # Run Olares installer
    log "Running Olares installer..."
    local installer_path="/tmp/olares-install.sh"

    log "Note: Olares will handle its own K3s and service configuration"
    log "The installer may take several minutes to complete..."

    # Set environment variables for the installer
    export INSTALL_ROOT="${INSTALL_ROOT:-/dangerprep}"
    
    # Run installer with timeout and error handling
    if timeout 1800 bash "$installer_path"; then  # 30 minute timeout
        success "Olares installation completed"
        log "Olares will continue initializing in the background"
        log "Use 'just olares' to check status once initialization is complete"
        
        # Verify installation
        verify_olares_installation
        return 0
    else
        error "Olares installation failed or timed out"
        log "Check /var/log/olares-install.log for details"
        return 1
    fi
}

# Verify Olares installation
# Usage: verify_olares_installation
# Returns: 0 if verified, 1 if issues detected
verify_olares_installation() {
    log "Verifying Olares installation..."
    
    # Check if K3s is running
    if systemctl is-active --quiet k3s 2>/dev/null; then
        success "K3s service is running"
    else
        warning "K3s service is not running yet"
    fi
    
    # Check if kubectl is available
    if command -v kubectl >/dev/null 2>&1; then
        success "kubectl is available"
    else
        warning "kubectl not found in PATH"
    fi
    
    # Check for Olares namespace
    if kubectl get namespace olares-system 2>/dev/null >/dev/null; then
        success "Olares namespace exists"
    else
        warning "Olares namespace not found"
    fi
    
    log "Olares verification completed"
    return 0
}

#
# Olares Integration Functions
#

# Configure Olares integration with DangerPrep
# Usage: configure_olares_integration
# Returns: 0 if successful
configure_olares_integration() {
    log "Configuring Olares integration with DangerPrep..."

    # Create integration configuration
    local integration_config="/etc/dangerprep/olares-integration.conf"
    create_service_directories "dangerprep-config" "/etc/dangerprep"
    
    cat > "$integration_config" << EOF
# DangerPrep-Olares Integration Configuration
# Generated on $(date)

# Olares installation directory
OLARES_ROOT=${INSTALL_ROOT:-/dangerprep}

# Host services that remain available
HOST_ADGUARD_PORT=3000
HOST_STEPCA_PORT=9000

# Integration notes
# - Olares handles its own Tailscale, DNS, and networking configuration
# - Host services (AdGuard Home, Step-CA) remain available for local use
# - Content directories are shared between host and Olares
EOF

    chmod 644 "$integration_config"

    log "Olares will handle its own Tailscale, DNS, and networking configuration"
    log "Host services (AdGuard Home, Step-CA) will remain available for local use"
    log "Content directories at ${INSTALL_ROOT:-/dangerprep}/content are shared"

    success "Olares integration configured"
    return 0
}

# Setup directory structure for Olares integration
# Usage: setup_olares_directory_structure
# Returns: 0 if successful
setup_olares_directory_structure() {
    log "Setting up directory structure for Olares integration..."

    # Use helper function to create directory structure
    create_content_directories "${INSTALL_ROOT:-/dangerprep}"

    success "Directory structure configured for Olares integration"
    return 0
}

#
# Main Olares Installation Workflow
#

# Complete Olares installation workflow
# Usage: install_and_configure_olares
# Returns: 0 if successful, 1 if failed
install_and_configure_olares() {
    log_section "Olares Installation"
    
    # Setup directory structure
    setup_olares_directory_structure
    
    # Install Olares
    if ! install_olares; then
        error "Olares installation failed"
        return 1
    fi
    
    # Configure integration
    configure_olares_integration
    
    success "Olares installation and integration completed"
    return 0
}

# Export functions for use in other scripts
export -f check_olares_requirements
export -f check_olares_conflicts
export -f download_olares_installer_safe
export -f prepare_olares_environment_safe
export -f install_olares
export -f verify_olares_installation
export -f configure_olares_integration
export -f setup_olares_directory_structure
export -f install_and_configure_olares
