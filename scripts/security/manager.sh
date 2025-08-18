#!/usr/bin/env bash
# DangerPrep Security Manager
# Main entry point for all security operations and management
# Usage: security-manager.sh {command} [options]
# Dependencies: Various security tools
# Author: DangerPrep Project
# Version: 1.0

set -euo pipefail

# Script metadata
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCRIPT_VERSION="1.0"
SCRIPT_DESCRIPTION="Security Manager - Main Controller"

# Source shared utilities
source "${SCRIPT_DIR}/../shared/logging.sh"
source "${SCRIPT_DIR}/../shared/errors.sh"
source "${SCRIPT_DIR}/../shared/validation.sh"
source "${SCRIPT_DIR}/../shared/banner.sh"
source "${SCRIPT_DIR}/../shared/security.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-security-manager.log"

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "Security manager failed with exit code $exit_code"
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    debug "Security manager initialized"
    clear_error_context
}

# Show help
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

USAGE:
    ${SCRIPT_NAME} {command} [options]

CORE COMMANDS:
    status              Show comprehensive security status
    diagnostics         Run security diagnostics and validation
    
SECRET MANAGEMENT:
    secrets-generate    Generate secrets for all services
    secrets-update      Update environment files with secrets
    secrets-setup       Complete secret management setup
    
SECURITY AUDITING:
    audit-all           Run all security audits
    audit-aide          Run AIDE file integrity check
    audit-antivirus     Run antivirus scan
    audit-lynis         Run Lynis security audit
    audit-rootkit       Run rootkit detection
    audit-general       Run general security audit
    
CERTIFICATE MANAGEMENT:
    certs-status        Show certificate status
    certs-generate      Generate new certificates
    certs-renew         Renew expiring certificates
    certs-validate      Validate certificate configuration
    
MONITORING:
    monitor-suricata    Monitor Suricata IDS alerts
    monitor-status      Show monitoring status
    
EXAMPLES:
    ${SCRIPT_NAME} status                   # Show security overview
    ${SCRIPT_NAME} audit-all               # Run comprehensive security audit
    ${SCRIPT_NAME} secrets-setup           # Set up secret management
    ${SCRIPT_NAME} certs-status            # Check certificate status

EOF
}

# Show comprehensive security status
show_security_status() {
    set_error_context "Security status overview"
    
    show_banner_with_title "Security Status Overview" "security"
    echo
    
    # Run security diagnostics
    "${SCRIPT_DIR}/security-diagnostics.sh" status
    
    clear_error_context
}

# Run security diagnostics
run_security_diagnostics() {
    set_error_context "Security diagnostics"
    
    show_banner_with_title "Security Diagnostics" "security"
    echo
    
    "${SCRIPT_DIR}/security-diagnostics.sh" validate
    
    clear_error_context
}

# Secret management operations
manage_secrets() {
    local operation="$1"
    
    set_error_context "Secret management ($operation)"
    
    case "$operation" in
        "generate")
            show_banner_with_title "Secret Generation" "security"
            echo
            # Check if generate-secrets.sh exists, if not use helpers/setup-secrets.sh
            if [[ -f "${SCRIPT_DIR}/generate-secrets.sh" ]]; then
                "${SCRIPT_DIR}/generate-secrets.sh"
            else
                log "Using helpers/setup-secrets.sh for secret generation"
                "${SCRIPT_DIR}/helpers/setup-secrets.sh" --force
            fi
            ;;
        "update")
            show_banner_with_title "Secret Environment Update" "security"
            echo
            "${SCRIPT_DIR}/helpers/update-secrets.sh"
            ;;
        "setup")
            show_banner_with_title "Secret Management Setup" "security"
            echo
            "${SCRIPT_DIR}/helpers/setup-secrets.sh"
            ;;
        *)
            error "Unknown secret operation: $operation"
            return 1
            ;;
    esac
    
    clear_error_context
}

# Security audit operations
run_security_audit() {
    local audit_type="$1"
    
    set_error_context "Security audit ($audit_type)"
    
    case "$audit_type" in
        "all")
            show_banner_with_title "Comprehensive Security Audit" "security"
            echo
            "${SCRIPT_DIR}/helpers/orchestrator.sh" all
            ;;
        "aide")
            show_banner_with_title "AIDE File Integrity Check" "security"
            echo
            "${SCRIPT_DIR}/helpers/integrity.sh" check
            ;;
        "antivirus")
            show_banner_with_title "Antivirus Scan" "security"
            echo
            "${SCRIPT_DIR}/helpers/malware.sh" quick
            ;;
        "lynis")
            show_banner_with_title "Lynis Security Audit" "security"
            echo
            "${SCRIPT_DIR}/helpers/compliance.sh" audit
            ;;
        "rootkit")
            show_banner_with_title "Rootkit Detection" "security"
            echo
            "${SCRIPT_DIR}/helpers/rootkit.sh" scan
            ;;
        "general")
            show_banner_with_title "General Security Audit" "security"
            echo
            "${SCRIPT_DIR}/helpers/configuration.sh" audit
            ;;
        *)
            error "Unknown audit type: $audit_type"
            return 1
            ;;
    esac
    
    clear_error_context
}

# Certificate management operations
manage_certificates() {
    local operation="$1"
    
    set_error_context "Certificate management ($operation)"
    
    case "$operation" in
        "status")
            show_banner_with_title "Certificate Status" "security"
            echo
            "${SCRIPT_DIR}/helpers/certificates.sh" status
            ;;
        "generate")
            show_banner_with_title "Certificate Generation" "security"
            echo
            "${SCRIPT_DIR}/helpers/certificates.sh" generate
            ;;
        "renew")
            show_banner_with_title "Certificate Renewal" "security"
            echo
            "${SCRIPT_DIR}/helpers/certificates.sh" renew
            ;;
        "validate")
            show_banner_with_title "Certificate Validation" "security"
            echo
            "${SCRIPT_DIR}/helpers/certificates.sh" validate
            ;;
        *)
            error "Unknown certificate operation: $operation"
            return 1
            ;;
    esac
    
    clear_error_context
}

# Monitoring operations
manage_monitoring() {
    local operation="$1"
    
    set_error_context "Security monitoring ($operation)"
    
    case "$operation" in
        "suricata")
            show_banner_with_title "Suricata IDS Monitor" "security"
            echo
            "${SCRIPT_DIR}/helpers/intrusion.sh"
            ;;
        "status")
            show_banner_with_title "Monitoring Status" "security"
            echo
            log "Security monitoring status:"
            
            # Check Suricata status
            if systemctl is-active suricata >/dev/null 2>&1; then
                success "  Suricata IDS: Running"
            else
                warning "  Suricata IDS: Not running"
            fi
            
            # Check Fail2ban status
            if systemctl is-active fail2ban >/dev/null 2>&1; then
                success "  Fail2ban: Running"
            else
                warning "  Fail2ban: Not running"
            fi
            
            # Check recent alerts
            local recent_alerts
            recent_alerts=$(journalctl --since "24 hours ago" | grep -c "ALERT\|WARNING\|Ban" 2>/dev/null || echo "0")
            log "  Recent security alerts (24h): $recent_alerts"
            ;;
        *)
            error "Unknown monitoring operation: $operation"
            return 1
            ;;
    esac
    
    clear_error_context
}

# Main function with command parsing
main() {
    local command="${1:-help}"
    
    if [[ "$command" == "help" || "$command" == "--help" || "$command" == "-h" ]]; then
        show_help
        exit 0
    fi
    
    # Root validation for operations that need it
    if [[ "$command" != "status" && "$command" != "help" ]]; then
        validate_root_user
    fi
    
    init_script
    
    case "$command" in
        # Core commands
        "status")
            show_security_status
            ;;
        "diagnostics")
            run_security_diagnostics
            ;;
            
        # Secret management
        "secrets-generate")
            manage_secrets "generate"
            ;;
        "secrets-update")
            manage_secrets "update"
            ;;
        "secrets-setup")
            manage_secrets "setup"
            ;;
            
        # Security auditing
        "audit-all")
            run_security_audit "all"
            ;;
        "audit-aide")
            run_security_audit "aide"
            ;;
        "audit-antivirus")
            run_security_audit "antivirus"
            ;;
        "audit-lynis")
            run_security_audit "lynis"
            ;;
        "audit-rootkit")
            run_security_audit "rootkit"
            ;;
        "audit-general")
            run_security_audit "general"
            ;;
            
        # Certificate management
        "certs-status")
            manage_certificates "status"
            ;;
        "certs-generate")
            manage_certificates "generate"
            ;;
        "certs-renew")
            manage_certificates "renew"
            ;;
        "certs-validate")
            manage_certificates "validate"
            ;;
            
        # Monitoring
        "monitor-suricata")
            manage_monitoring "suricata"
            ;;
        "monitor-status")
            manage_monitoring "status"
            ;;
            
        *)
            error "Unknown command: $command"
            echo
            show_help
            exit 1
            ;;
    esac
}

main "$@"
