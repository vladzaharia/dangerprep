#!/usr/bin/env bash
# DangerPrep Pre-flight Validation Script
#
# Purpose: Validate system compatibility and detect conflicts before installation
# Usage: preflight-check.sh [--fix] [--verbose] [--olares-mode]
# Dependencies: systemctl, apt, lscpu, free, df
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"
readonly SCRIPT_NAME
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

readonly SCRIPT_VERSION="2.0"
readonly SCRIPT_DESCRIPTION="DangerPrep Pre-flight Validation"

# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/errors.sh
source "${SCRIPT_DIR}/../shared/errors.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-preflight.log"

# Global variables
FIX_ISSUES=false
VERBOSE=false
OLARES_MODE=false
ISSUES_FOUND=0
CRITICAL_ISSUES=0

# Show help information
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

OPTIONS:
    --fix           Attempt to fix detected issues automatically
    --verbose       Enable verbose output for debugging
    --olares-mode   Check for Olares-specific requirements
    -h, --help      Show this help message

DESCRIPTION:
    Validates system compatibility and detects conflicts before DangerPrep installation.
    This script will check:
    • System requirements (CPU, RAM, storage)
    • Operating system compatibility
    • Network interface availability
    • Conflicting services and packages
    • Hardware compatibility (FriendlyElec detection)
    • Olares requirements (if --olares-mode is specified)

EXAMPLES:
    ${SCRIPT_NAME}                    # Basic compatibility check
    ${SCRIPT_NAME} --fix              # Check and fix issues automatically
    ${SCRIPT_NAME} --olares-mode      # Check Olares-specific requirements
    ${SCRIPT_NAME} --verbose          # Enable detailed logging

NOTES:
    - This script should be run before setup-dangerprep.sh
    - Use --fix to automatically resolve common issues
    - Use --olares-mode for Olares integration validation
    - Exit code 0 = all checks passed, >0 = issues found

EOF
}

# Error cleanup for preflight check
# shellcheck disable=SC2329  # Function is used by error handler trap
cleanup_on_error() {
    local exit_code=$?
    error "Pre-flight validation failed with exit code $exit_code"

    # Clean up any temporary files that might have been created
    if [[ -n "${TEMP_FILES:-}" ]]; then
        for temp_file in $TEMP_FILES; do
            if [[ -f "$temp_file" ]]; then
                rm -f "$temp_file" 2>/dev/null || true
            fi
        done
    fi

    error "Pre-flight validation cleanup completed"
    exit "$exit_code"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate required commands with better error messages
    if ! require_commands systemctl apt lscpu free df lsblk; then
        error "Missing required system commands for pre-flight validation"
        error "Please ensure this is running on a supported Ubuntu system"
        exit 1
    fi

    # Validate root permissions for system checks
    validate_root_user

    debug "Pre-flight validation script initialized"
    clear_error_context
}

# Check system requirements
check_system_requirements() {
    log_section "System Requirements Check"
    local issues=0

    # CPU check
    log_subsection "CPU Requirements"
    local cpu_cores
    cpu_cores=$(nproc)
    if [[ $cpu_cores -lt 4 ]]; then
        error "Insufficient CPU cores: $cpu_cores (minimum: 4)"
        ((issues++))
        ((CRITICAL_ISSUES++))
    else
        success "CPU cores: $cpu_cores (✓)"
    fi

    # RAM check
    log_subsection "Memory Requirements"
    local ram_gb
    ram_gb=$(free -g | awk '/^Mem:/{print $2}')
    if [[ $ram_gb -lt 8 ]]; then
        error "Insufficient RAM: ${ram_gb}GB (minimum: 8GB)"
        ((issues++))
        ((CRITICAL_ISSUES++))
    else
        success "RAM: ${ram_gb}GB (✓)"
    fi

    # Storage check
    log_subsection "Storage Requirements"
    local storage_gb
    storage_gb=$(df / | awk 'NR==2{print int($4/1024/1024)}')
    if [[ $storage_gb -lt 150 ]]; then
        error "Insufficient storage: ${storage_gb}GB available (minimum: 150GB)"
        ((issues++))
        ((CRITICAL_ISSUES++))
    else
        success "Available storage: ${storage_gb}GB (✓)"
    fi

    # SSD check
    log_subsection "Storage Type Check"
    local root_device
    root_device=$(df / | awk 'NR==2{print $1}' | sed 's/[0-9]*$//')
    if lsblk -d -o name,rota "$root_device" 2>/dev/null | grep -q "1$"; then
        warning "Root filesystem appears to be on HDD (mechanical drive)"
        warning "SSD is strongly recommended for optimal performance"
        ((issues++))
    else
        success "Root filesystem on SSD (✓)"
    fi

    ISSUES_FOUND=$((ISSUES_FOUND + issues))
    return $issues
}

# Check operating system compatibility
check_os_compatibility() {
    log_section "Operating System Compatibility"
    local issues=0

    # Ubuntu version check
    if [[ -f /etc/os-release ]]; then
        # shellcheck source=/dev/null
        source /etc/os-release
        log "Detected OS: $NAME $VERSION"
        
        if [[ "$ID" != "ubuntu" ]]; then
            error "Unsupported OS: $NAME (Ubuntu required)"
            ((issues++))
            ((CRITICAL_ISSUES++))
        elif [[ "$(printf '%s\n' "$VERSION_ID" "20.04" | sort -V | head -n1)" == "$VERSION_ID" && "$VERSION_ID" != "20.04" ]]; then
            error "Unsupported Ubuntu version: $VERSION_ID (minimum: 20.04)"
            ((issues++))
            ((CRITICAL_ISSUES++))
        else
            success "OS compatibility: $NAME $VERSION (✓)"
        fi
    else
        error "Cannot detect operating system"
        ((issues++))
        ((CRITICAL_ISSUES++))
    fi

    # Architecture check
    local arch
    arch=$(uname -m)
    if [[ "$arch" != "x86_64" && "$arch" != "aarch64" ]]; then
        error "Unsupported architecture: $arch (x86_64 or aarch64 required)"
        ((issues++))
        ((CRITICAL_ISSUES++))
    else
        success "Architecture: $arch (✓)"
    fi

    ISSUES_FOUND=$((ISSUES_FOUND + issues))
    return $issues
}

# Check network interfaces
check_network_interfaces() {
    log_section "Network Interface Check"
    local issues=0

    # Ethernet interface check
    local eth_interfaces
    eth_interfaces=$(ip link show | grep -cE "^[0-9]+: (eth|en)")
    if [[ $eth_interfaces -eq 0 ]]; then
        warning "No ethernet interfaces detected"
        warning "WiFi-only setup may have limitations"
        ((issues++))
    else
        success "Ethernet interfaces: $eth_interfaces (✓)"
    fi

    # WiFi interface check
    local wifi_interfaces
    wifi_interfaces=$(iw dev 2>/dev/null | grep -c Interface || echo "0")
    if [[ $wifi_interfaces -eq 0 ]]; then
        warning "No WiFi interfaces detected"
        warning "Hotspot functionality will not be available"
        ((issues++))
    else
        success "WiFi interfaces: $wifi_interfaces (✓)"
    fi

    ISSUES_FOUND=$((ISSUES_FOUND + issues))
    return $issues
}

# Fix conflicting services
fix_conflicting_services() {
    log "Attempting to fix conflicting services..."

    local services_fixed=0
    local conflicting_services=(
        "docker"
        "containerd"
        "k3s"
        "k3s-agent"
        "microk8s"
        "minikube"
    )

    for service in "${conflicting_services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            if [[ "$OLARES_MODE" == "true" && ("$service" == "docker" || "$service" == "containerd") ]]; then
                info "Stopping $service for Olares compatibility..."
                if systemctl stop "$service" 2>/dev/null && systemctl disable "$service" 2>/dev/null; then
                    success "Stopped and disabled $service"
                    ((services_fixed++))
                else
                    warning "Failed to stop $service"
                fi
            else
                warning "Service $service is running but not automatically fixable"
                warning "Please stop $service manually before running DangerPrep setup"
            fi
        fi
    done

    if [[ $services_fixed -gt 0 ]]; then
        success "Fixed $services_fixed conflicting services"
    fi

    return 0
}

# Check for conflicting services
check_conflicting_services() {
    log_section "Conflicting Services Check"
    local issues=0

    # Services that conflict with DangerPrep
    local conflicting_services=(
        "docker"
        "containerd"
        "k3s"
        "k3s-agent"
        "microk8s"
        "minikube"
    )

    for service in "${conflicting_services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            if [[ "$OLARES_MODE" == "true" && ("$service" == "docker" || "$service" == "containerd") ]]; then
                warning "Service $service is running (will be removed for Olares compatibility)"
                if [[ "$FIX_ISSUES" == "true" ]]; then
                    fix_conflicting_services
                fi
            else
                error "Conflicting service running: $service"
                error "Please stop $service before running DangerPrep setup"
                ((issues++))
            fi
        elif systemctl is-enabled --quiet "$service" 2>/dev/null; then
            warning "Service $service is enabled but not running"
            if [[ "$FIX_ISSUES" == "true" ]]; then
                info "Disabling $service..."
                if systemctl disable "$service" 2>/dev/null; then
                    success "Disabled $service"
                else
                    warning "Failed to disable $service"
                fi
            else
                warning "Consider disabling $service before setup"
            fi
        else
            debug "Service $service is not installed or not enabled"
        fi
    done

    ISSUES_FOUND=$((ISSUES_FOUND + issues))
    return $issues
}

# Check for conflicting packages
check_conflicting_packages() {
    log_section "Conflicting Packages Check"
    local issues=0

    # Packages that might conflict with DangerPrep
    local conflicting_packages=(
        "snap"
        "snapd"
        "docker.io"
        "docker-ce"
        "containerd.io"
        "podman"
        "lxd"
        "lxc"
    )

    for package in "${conflicting_packages[@]}"; do
        if dpkg -l 2>/dev/null | grep -q "^ii.*$package "; then
            if [[ "$OLARES_MODE" == "true" && ("$package" == "docker.io" || "$package" == "docker-ce" || "$package" == "containerd.io") ]]; then
                warning "Package $package is installed (will be removed for Olares compatibility)"
            else
                warning "Potentially conflicting package installed: $package"
                ((issues++))
            fi
        fi
    done

    ISSUES_FOUND=$((ISSUES_FOUND + issues))
    return $issues
}

# Check Olares-specific requirements
check_olares_requirements() {
    if [[ "$OLARES_MODE" != "true" ]]; then
        return 0
    fi

    log_section "Olares-Specific Requirements"
    local issues=0

    # Check if Olares is already installed
    if command -v olares-cli >/dev/null 2>&1; then
        warning "Olares CLI already installed"
        warning "Existing installation may conflict with setup"
        ((issues++))
    fi

    # Check for K3s installation
    if [[ -f /usr/local/bin/k3s ]]; then
        warning "K3s already installed"
        warning "Existing K3s installation may conflict with Olares"
        ((issues++))
    fi

    # Check container runtime
    if systemctl is-active --quiet docker 2>/dev/null; then
        info "Docker detected - will be removed for Olares compatibility"
    fi

    ISSUES_FOUND=$((ISSUES_FOUND + issues))
    return $issues
}

# Hardware compatibility check
check_hardware_compatibility() {
    log_section "Hardware Compatibility Check"
    local issues=0

    # FriendlyElec detection
    local board_info=""
    if [[ -f /proc/device-tree/model ]]; then
        board_info=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0')
        log "Board model: $board_info"
        
        if echo "$board_info" | grep -qi "friendlyelec\|nanopi"; then
            success "FriendlyElec hardware detected (✓)"
            
            # Check for RK3588 specific features
            if echo "$board_info" | grep -qi "rk3588"; then
                success "RK3588 SoC detected - hardware acceleration available (✓)"
            fi
        else
            info "Generic hardware detected (no specific optimizations)"
        fi
    else
        info "Cannot detect board model (generic setup will be used)"
    fi

    ISSUES_FOUND=$((ISSUES_FOUND + issues))
    return $issues
}

# Main validation function
main() {
    init_script
    
    show_banner "DangerPrep Pre-flight Check"
    
    log "Starting pre-flight validation..."
    log "Mode: $([ "$OLARES_MODE" == "true" ] && echo "Olares Integration" || echo "Standard")"
    
    # Run all checks
    check_system_requirements
    check_os_compatibility
    check_network_interfaces
    check_conflicting_services
    check_conflicting_packages
    check_olares_requirements
    check_hardware_compatibility
    
    # Summary
    log_section "Validation Summary"
    
    if [[ $CRITICAL_ISSUES -gt 0 ]]; then
        error "Critical issues found: $CRITICAL_ISSUES"
        error "System does not meet minimum requirements"
        exit 1
    elif [[ $ISSUES_FOUND -gt 0 ]]; then
        warning "Non-critical issues found: $ISSUES_FOUND"
        warning "Installation may proceed but with limitations"
        exit 2
    else
        success "All pre-flight checks passed!"
        success "System is ready for DangerPrep installation"
        exit 0
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --fix)
            FIX_ISSUES=true
            info "Fix mode enabled - will attempt to resolve detected issues"
            shift
            ;;
        --verbose)
            # shellcheck disable=SC2034  # Variable reserved for future functionality
            VERBOSE=true
            export DEBUG=true
            info "Verbose mode enabled"
            shift
            ;;
        --olares-mode)
            OLARES_MODE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main function
main "$@"
