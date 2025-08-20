#!/usr/bin/env bash
# DangerPrep Certificate Manager
# Manages SSL/TLS certificates and Step-CA integration
# Usage: helpers/certificates.sh {status|generate|renew|validate|help}
# Dependencies: step-cli, openssl
# Author: DangerPrep Project
# Version: 1.0


# Prevent multiple sourcing
if [[ "${SECURITY_HELPERS_CERTIFICATES_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SECURITY_HELPERS_CERTIFICATES_LOADED="true"

set -euo pipefail

# Script metadata
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCRIPT_VERSION="1.0"
SCRIPT_DESCRIPTION="Certificate Manager"

# Source shared utilities
source "${SCRIPT_DIR}/../../shared/logging.sh"
source "${SCRIPT_DIR}/../../shared/errors.sh"
source "${SCRIPT_DIR}/../../shared/validation.sh"
source "${SCRIPT_DIR}/../../shared/banner.sh"
source "${SCRIPT_DIR}/../../shared/security.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-certificate-manager.log"
# readonly STEP_CA_URL="https://ca.dangerprep.local:9000"  # Currently unused
readonly STEP_CA_ROOT="/etc/ssl/certs/step-ca-root.crt"
readonly CERTS_DIR="/etc/ssl/dangerprep"
readonly STEP_CONFIG_DIR="/etc/step-ca"

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "Certificate manager failed with exit code $exit_code"
    rm -f "${CERTS_DIR}/*.tmp" 2>/dev/null || true
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    validate_root_user
    require_commands openssl
    debug "Certificate manager initialized"
    clear_error_context
}

# Show help
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

USAGE:
    ${SCRIPT_NAME} {status|generate|renew|validate|help}

COMMANDS:
    status      Show certificate status and expiration info
    generate    Generate new certificates for services
    renew       Renew expiring certificates
    validate    Validate certificate chain and configuration
    help        Show this help message

EXAMPLES:
    ${SCRIPT_NAME} status       # Show certificate status
    ${SCRIPT_NAME} generate     # Generate new certificates
    ${SCRIPT_NAME} renew        # Renew expiring certificates

EOF
}

# Check Step-CA status
check_step_ca_status() {
    set_error_context "Step-CA status check"
    
    log "Checking Step-CA status..."
    
    # Check if Step-CA is running
    if systemctl is-active step-ca >/dev/null 2>&1; then
        success "Step-CA service is running"
    else
        warning "Step-CA service is not running"
        if systemctl is-enabled step-ca >/dev/null 2>&1; then
            log "Step-CA is enabled but not active"
        else
            warning "Step-CA is not enabled"
        fi
    fi
    
    # Check if step-cli is available
    if command -v step >/dev/null 2>&1; then
        local step_version
        step_version=$(step version 2>/dev/null | head -1 || echo "Unknown")
        log "Step CLI version: $step_version"
    else
        warning "Step CLI not installed"
    fi
    
    # Check root certificate
    if [[ -f "$STEP_CA_ROOT" ]]; then
        log "Step-CA root certificate found: $STEP_CA_ROOT"
        
        # Check certificate validity
        local cert_info
        cert_info=$(openssl x509 -in "$STEP_CA_ROOT" -noout -subject -dates 2>/dev/null || echo "Invalid certificate")
        log "Root certificate info: $cert_info"
    else
        warning "Step-CA root certificate not found: $STEP_CA_ROOT"
    fi
    
    clear_error_context
}

# List certificates and their status
list_certificates() {
    set_error_context "Certificate listing"
    
    log "Scanning for certificates..."
    
    # Ensure certificates directory exists
    mkdir -p "$CERTS_DIR" 2>/dev/null || true
    
    local cert_count=0
    local expiring_count=0
    local expired_count=0
    
    # Find certificate files
    while IFS= read -r -d '' cert_file; do
        if [[ -f "$cert_file" ]]; then
            ((cert_count++))
            
            local cert_subject
            cert_subject=$(openssl x509 -in "$cert_file" -noout -subject 2>/dev/null | sed 's/subject=//' || echo "Invalid")
            
            local cert_dates
            cert_dates=$(openssl x509 -in "$cert_file" -noout -dates 2>/dev/null || echo "Invalid dates")
            
            local not_after
            not_after=$(echo "$cert_dates" | grep "notAfter=" | sed 's/notAfter=//')
            
            if [[ -n "$not_after" ]]; then
                local expiry_epoch
                expiry_epoch=$(date -d "$not_after" +%s 2>/dev/null || echo "0")
                local current_epoch
                current_epoch=$(date +%s)
                local days_until_expiry
                days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
                
                if [[ $days_until_expiry -lt 0 ]]; then
                    error "EXPIRED: $cert_file"
                    error "  Subject: $cert_subject"
                    error "  Expired: $not_after"
                    ((expired_count++))
                elif [[ $days_until_expiry -lt 30 ]]; then
                    warning "EXPIRING SOON: $cert_file"
                    warning "  Subject: $cert_subject"
                    warning "  Expires in: $days_until_expiry days ($not_after)"
                    ((expiring_count++))
                else
                    log "VALID: $cert_file"
                    log "  Subject: $cert_subject"
                    log "  Expires in: $days_until_expiry days"
                fi
            else
                warning "INVALID: $cert_file - Cannot read expiration date"
            fi
        fi
    done < <(find "$CERTS_DIR" /etc/ssl/certs -name "*.crt" -o -name "*.pem" 2>/dev/null | head -20 | tr '\n' '\0')
    
    echo
    log "Certificate Summary:"
    log "  Total certificates: $cert_count"
    log "  Expiring soon (< 30 days): $expiring_count"
    log "  Expired: $expired_count"
    
    clear_error_context
    return $((expiring_count + expired_count))
}

# Generate certificates for common services
generate_certificates() {
    set_error_context "Certificate generation"
    
    log "Generating certificates for DangerPrep services..."
    
    # Check if Step-CA is available
    if ! command -v step >/dev/null 2>&1; then
        error "Step CLI not available - cannot generate certificates"
        return 1
    fi
    
    if ! systemctl is-active step-ca >/dev/null 2>&1; then
        error "Step-CA service not running - cannot generate certificates"
        return 1
    fi
    
    # Ensure certificates directory exists
    mkdir -p "$CERTS_DIR"
    chmod 755 "$CERTS_DIR"
    
    # Common service certificates to generate
    local services=(
        "traefik.dangerprep.local"
        "portainer.dangerprep.local"
        "jellyfin.dangerprep.local"
        "komga.dangerprep.local"
        "romm.dangerprep.local"
    )
    
    local generated_count=0
    
    for service in "${services[@]}"; do
        log "Generating certificate for: $service"
        
        local cert_file="$CERTS_DIR/${service}.crt"
        local key_file="$CERTS_DIR/${service}.key"
        
        # Skip if certificate already exists and is valid
        if [[ -f "$cert_file" ]]; then
            local days_until_expiry
            days_until_expiry=$(openssl x509 -in "$cert_file" -noout -checkend $((30 * 86400)) 2>/dev/null && echo "30+" || echo "0")
            
            if [[ "$days_until_expiry" == "30+" ]]; then
                log "Certificate for $service is still valid, skipping"
                continue
            fi
        fi
        
        # Generate certificate using Step-CA
        if step ca certificate "$service" "$cert_file" "$key_file" --provisioner-password-file /dev/stdin <<< "" 2>/dev/null; then
            chmod 644 "$cert_file"
            chmod 600 "$key_file"
            success "Generated certificate for: $service"
            ((generated_count++))
        else
            warning "Failed to generate certificate for: $service"
        fi
    done
    
    log "Generated $generated_count new certificates"
    
    clear_error_context
}

# Renew expiring certificates
renew_certificates() {
    set_error_context "Certificate renewal"
    
    log "Checking for certificates that need renewal..."
    
    if ! command -v step >/dev/null 2>&1; then
        error "Step CLI not available - cannot renew certificates"
        return 1
    fi
    
    local renewed_count=0
    
    # Find certificates expiring in the next 30 days
    while IFS= read -r -d '' cert_file; do
        if [[ -f "$cert_file" ]]; then
            local not_after
            not_after=$(openssl x509 -in "$cert_file" -noout -dates 2>/dev/null | grep "notAfter=" | sed 's/notAfter=//')
            
            if [[ -n "$not_after" ]]; then
                local expiry_epoch
                expiry_epoch=$(date -d "$not_after" +%s 2>/dev/null || echo "0")
                local current_epoch
                current_epoch=$(date +%s)
                local days_until_expiry
                days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
                
                if [[ $days_until_expiry -lt 30 ]]; then
                    log "Renewing certificate: $cert_file (expires in $days_until_expiry days)"
                    
                    # Extract subject from certificate
                    local subject
                    subject=$(openssl x509 -in "$cert_file" -noout -subject 2>/dev/null | sed 's/subject=//' | grep -o 'CN=[^,]*' | sed 's/CN=//' || echo "")
                    
                    if [[ -n "$subject" ]]; then
                        local key_file="${cert_file%.crt}.key"
                        
                        # Backup old certificate
                        cp "$cert_file" "${cert_file}.backup.$(date +%Y%m%d-%H%M%S)"
                        
                        # Renew certificate
                        if step ca renew "$cert_file" "$key_file" --force 2>/dev/null; then
                            success "Renewed certificate for: $subject"
                            ((renewed_count++))
                        else
                            warning "Failed to renew certificate for: $subject"
                            # Restore backup
                            mv "${cert_file}.backup."* "$cert_file" 2>/dev/null || true
                        fi
                    fi
                fi
            fi
        fi
    done < <(find "$CERTS_DIR" -name "*.crt" 2>/dev/null | tr '\n' '\0')
    
    log "Renewed $renewed_count certificates"
    
    clear_error_context
}

# Validate certificate configuration
validate_certificates() {
    set_error_context "Certificate validation"
    
    log "Validating certificate configuration..."
    
    local validation_errors=0
    
    # Check Step-CA configuration
    if [[ -d "$STEP_CONFIG_DIR" ]]; then
        log "Step-CA configuration directory found: $STEP_CONFIG_DIR"
        
        if [[ -f "$STEP_CONFIG_DIR/config/ca.json" ]]; then
            log "Step-CA configuration file found"
        else
            warning "Step-CA configuration file not found"
            ((validation_errors++))
        fi
    else
        warning "Step-CA configuration directory not found"
        ((validation_errors++))
    fi
    
    # Validate root certificate
    if [[ -f "$STEP_CA_ROOT" ]]; then
        if openssl x509 -in "$STEP_CA_ROOT" -noout -text >/dev/null 2>&1; then
            success "Root certificate is valid"
        else
            error "Root certificate is invalid"
            ((validation_errors++))
        fi
    else
        error "Root certificate not found"
        ((validation_errors++))
    fi
    
    # Check certificate directory permissions
    if [[ -d "$CERTS_DIR" ]]; then
        local dir_perms
        dir_perms=$(stat -c "%a" "$CERTS_DIR")
        if [[ "$dir_perms" == "755" ]]; then
            log "Certificate directory permissions are correct"
        else
            warning "Certificate directory permissions: $dir_perms (expected: 755)"
        fi
    fi
    
    if [[ $validation_errors -eq 0 ]]; then
        success "Certificate validation completed - no errors found"
    else
        error "Certificate validation found $validation_errors errors"
    fi
    
    clear_error_context
    return $validation_errors
}

# Main function
main() {
    local command="${1:-help}"
    
    if [[ "$command" == "help" || "$command" == "--help" || "$command" == "-h" ]]; then
        show_help
        exit 0
    fi
    
    init_script
    
    show_banner_with_title "Certificate Manager" "security"
    echo
    
    case "$command" in
        status)
            check_step_ca_status
            echo
            list_certificates
            ;;
        generate)
            check_step_ca_status
            echo
            generate_certificates
            ;;
        renew)
            check_step_ca_status
            echo
            renew_certificates
            ;;
        validate)
            validate_certificates
            ;;
        *)
            error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}


# Export functions for use in other scripts
export -f cleanup_on_errornexport -f init_scriptnexport -f show_helpnexport -f check_step_ca_statusnexport -f list_certificatesnexport -f generate_certificatesnexport -f renew_certificatesnexport -f validate_certificatesn
# Run main function only if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
