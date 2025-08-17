#!/usr/bin/env bash
# DangerPrep Service Startup Script
# Starts all DangerPrep services (Olares + host services)

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/error-handling.sh
source "${SCRIPT_DIR}/../shared/error-handling.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-start-services.log"

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Service startup failed with exit code ${exit_code}"

    # Stop any services that were started
    warning "Attempting to stop any services that were started..."
    systemctl stop adguardhome step-ca hostapd dnsmasq fail2ban 2>/dev/null || true

    error "Cleanup completed"
    exit "${exit_code}"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate root permissions for service operations
    validate_root_user

    # Validate required commands
    require_commands systemctl kubectl

    debug "Service startup script initialized"
    clear_error_context
}

start_host_services() {
    log "Starting host services..."

    local services=(
        "adguardhome"
        "step-ca"
        "tailscaled"
        "hostapd"
        "dnsmasq"
        "fail2ban"
    )

    for service in "${services[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            log "Starting $service..."
            if systemctl start "$service"; then
                success "$service started"
            else
                warning "Failed to start $service"
            fi
        else
            log "Skipping $service (not enabled)"
        fi
    done
}

start_olares_services() {
    log "Starting Olares services..."

    # Start K3s if not running
    if ! systemctl is-active --quiet k3s 2>/dev/null; then
        log "Starting K3s..."
        if systemctl start k3s; then
            success "K3s started"
            
            # Wait for K3s to be ready
            log "Waiting for K3s to be ready..."
            local max_wait=60
            local wait_time=0
            
            while [[ $wait_time -lt $max_wait ]]; do
                if kubectl get nodes >/dev/null 2>&1; then
                    success "K3s is ready"
                    break
                fi
                sleep 5
                wait_time=$((wait_time + 5))
                log "Waiting for K3s... (${wait_time}s/${max_wait}s)"
            done
            
            if [[ $wait_time -ge $max_wait ]]; then
                warning "K3s may still be initializing"
            fi
        else
            error "Failed to start K3s"
            return 1
        fi
    else
        success "K3s already running"
    fi

    # Check Olares pods
    if command -v kubectl >/dev/null 2>&1; then
        log "Checking Olares pods..."
        kubectl get pods --all-namespaces 2>/dev/null || warning "Unable to get pod status"
    fi
}

verify_services() {
    log "Verifying service status..."

    # Check host services
    local host_services=(
        "adguardhome:AdGuard Home"
        "step-ca:Step-CA"
        "tailscaled:Tailscale"
    )

    for service_info in "${host_services[@]}"; do
        local service
        service=${service_info%%:*}
        local name
        name=${service_info##*:}
        
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            success "$name is running"
        else
            warning "$name is not running"
        fi
    done

    # Check K3s
    if systemctl is-active --quiet k3s 2>/dev/null; then
        success "K3s is running"
        
        # Check if kubectl works
        if kubectl get nodes >/dev/null 2>&1; then
            success "Kubernetes API is accessible"
        else
            warning "Kubernetes API is not ready"
        fi
    else
        warning "K3s is not running"
    fi
}

main() {
    # Initialize script
    init_script

    # Display banner
    show_banner_with_title "Starting DangerPrep Services" "system"
    echo

    log "Starting DangerPrep services..."

    # Start host services first
    start_host_services

    # Start Olares services
    start_olares_services

    # Verify all services
    verify_services

    success "DangerPrep services startup completed"
    log "Use 'just status' to check service status"
    log "Use 'just olares' to check Olares/K3s status"
}

# Run main function
main "$@"
