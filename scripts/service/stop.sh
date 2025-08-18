#!/usr/bin/env bash
# DangerPrep Service Stop Script
# Stops all DangerPrep services (Olares + host services)

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


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
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-stop-services.log"

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Service stop failed with exit code ${exit_code}"

    # No specific cleanup needed for stopping services

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

    debug "Service stop script initialized"
    clear_error_context
}

stop_olares_services() {
    log "Stopping Olares services..."

    # Gracefully stop pods first
    if command -v kubectl >/dev/null 2>&1 && kubectl get nodes >/dev/null 2>&1; then
        log "Stopping Olares pods..."
        kubectl delete --all pods --all-namespaces --grace-period=30 2>/dev/null || true
        
        # Wait a moment for graceful shutdown
        sleep 10
    fi

    # Stop K3s
    if systemctl is-active --quiet k3s 2>/dev/null; then
        log "Stopping K3s..."
        if systemctl stop k3s; then
            success "K3s stopped"
        else
            warning "Failed to stop K3s gracefully"
        fi
    else
        log "K3s already stopped"
    fi
}

stop_host_services() {
    log "Stopping host services..."

    # Services to stop (in reverse order of startup)
    local services=(
        "fail2ban"
        "dnsmasq"
        "hostapd"
        "step-ca"
        "adguardhome"
    )

    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            log "Stopping $service..."
            if systemctl stop "$service"; then
                success "$service stopped"
            else
                warning "Failed to stop $service"
            fi
        else
            log "$service already stopped"
        fi
    done

    # Keep Tailscale running for remote access
    log "Keeping Tailscale running for remote access"
}

verify_services_stopped() {
    log "Verifying services are stopped..."

    # Check K3s
    if systemctl is-active --quiet k3s 2>/dev/null; then
        warning "K3s is still running"
    else
        success "K3s is stopped"
    fi

    # Check host services
    local services=(
        "adguardhome:AdGuard Home"
        "step-ca:Step-CA"
        "hostapd:WiFi Hotspot"
        "dnsmasq:DHCP Server"
        "fail2ban:Fail2Ban"
    )

    for service_info in "${services[@]}"; do
        local service
        service=${service_info%%:*}
        local name
        name=${service_info##*:}
        
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            warning "$name is still running"
        else
            success "$name is stopped"
        fi
    done

    # Check Tailscale (should still be running)
    if systemctl is-active --quiet tailscaled 2>/dev/null; then
        success "Tailscale is still running (kept for remote access)"
    else
        warning "Tailscale is stopped"
    fi
}

main() {
    # Initialize script
    init_script

    # Display banner
    show_banner_with_title "Stopping DangerPrep Services" "system"
    echo

    log "Stopping DangerPrep services..."

    # Stop Olares services first
    stop_olares_services

    # Stop host services
    stop_host_services

    # Verify services are stopped
    verify_services_stopped

    success "DangerPrep services stop completed"
    log "Use 'just status' to check service status"
    log "Note: Tailscale is kept running for remote access"
}

# Run main function
main "$@"
