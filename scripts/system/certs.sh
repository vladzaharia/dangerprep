#!/usr/bin/env bash
# DangerPrep Certificate Management
# Integrates with Traefik (ACME/Let's Encrypt) and Step-CA (internal CA)

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
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-certs.log"
readonly INFRASTRUCTURE_DIR="/opt/dangerprep/docker"
readonly TRAEFIK_DIR="${INFRASTRUCTURE_DIR}/infrastructure/traefik"
readonly STEP_CA_DIR="${INFRASTRUCTURE_DIR}/infrastructure/step-ca"

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Certificate management failed with exit code ${exit_code}"

    # No specific cleanup needed for certificate operations

    error "Cleanup completed"
    exit "${exit_code}"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate required commands
    require_commands systemctl

    debug "Certificate manager initialized"
    clear_error_context
}

setup_traefik_certificates() {
    set_error_context "Traefik certificate setup"

    log "Setting up Traefik ACME certificates..."

    # Check if Traefik service is available
    if [[ -d "${TRAEFIK_DIR}" ]]; then
        log "Traefik configuration found at ${TRAEFIK_DIR}"
        success "Traefik will automatically obtain certificates via ACME when started"
        log "Check Traefik dashboard for certificate status"
    else
        warning "Traefik directory not found at ${TRAEFIK_DIR}"
        log "Please ensure Traefik is properly configured"
    fi

    clear_error_context
}

setup_step_ca() {
    set_error_context "Step-CA setup"

    log "Setting up Step-CA internal certificate authority..."

    # Check if Step-CA service is running
    if systemctl is-active --quiet step-ca 2>/dev/null; then
        success "Step-CA service is running"
    elif [[ -d "${STEP_CA_DIR}" ]]; then
        log "Step-CA configuration found at ${STEP_CA_DIR}"
        log "Step-CA can be started as a system service"
    else
        warning "Step-CA directory not found at ${STEP_CA_DIR}"
        log "Please ensure Step-CA is properly configured"
    fi

    success "Step-CA provides internal certificates for local services"
    log "Access the CA at https://ca.dangerprep.local"
    clear_error_context
}

show_traefik_certificates() {
    set_error_context "Traefik certificate status"

    log "Traefik Certificate Status:"
    log "=========================="

    if [[ -d "${TRAEFIK_DIR}" ]]; then
        success "Traefik configuration available"

        # Check for certificate files
        if [[ -d "${TRAEFIK_DIR}/acme" ]]; then
            log "ACME certificate directory found"
            local cert_count
            cert_count=$(find "${TRAEFIK_DIR}/acme" -name "*.crt" 2>/dev/null | wc -l)
            log "Certificate files: ${cert_count}"
        fi

        echo ""
        log "Access Traefik dashboard at: https://traefik.dangerprep.local"
    else
        warning "Traefik configuration not found"
    fi
    clear_error_context
}

show_step_ca_status() {
    set_error_context "Step-CA status"

    log "Step-CA Status:"
    log "==============="

    if systemctl is-active --quiet step-ca 2>/dev/null; then
        success "Step-CA service is running"
        local service_status
        service_status=$(systemctl is-active step-ca 2>/dev/null)
        log "Service status: ${service_status}"
    elif [[ -d "${STEP_CA_DIR}" ]]; then
        warning "Step-CA service is not running but configuration exists"
        log "Configuration directory: ${STEP_CA_DIR}"
    else
        warning "Step-CA is not configured"
    fi

    echo ""
    log "Access Step-CA at: https://ca.dangerprep.local"
    log "Download root CA: https://ca.dangerprep.local/roots.pem"
    clear_error_context
}

# Main function
main() {
    # Initialize script
    init_script

    show_banner_with_title "Certificate Manager" "system"
    echo

    case "${1:-status}" in
        traefik)
            setup_traefik_certificates
            ;;
        step-ca)
            setup_step_ca
            ;;
        status)
            show_traefik_certificates
            echo ""
            show_step_ca_status
            ;;
        help|--help|-h)
            echo "DangerPrep Certificate Management"
            echo "Usage: $0 {traefik|step-ca|status}"
            echo
            echo "Commands:"
            echo "  traefik  - Setup/check Traefik ACME certificates"
            echo "  step-ca  - Setup/check Step-CA internal certificates"
            echo "  status   - Show certificate status for both services"
            echo
            echo "Note: Certificates are managed by infrastructure services:"
            echo "  - Traefik: ACME/Let's Encrypt for public certificates"
            echo "  - Step-CA: Internal CA for private certificates"
            exit 0
            ;;
        *)
            error "Unknown command: $1"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
