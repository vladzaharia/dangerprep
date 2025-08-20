#!/usr/bin/env bash
# DangerPrep Verification Helper Functions
#
# Purpose: Consolidated verification and testing functions
# Usage: Source this file to access verification functions
# Dependencies: logging.sh, errors.sh
# Author: DangerPrep Project
# Version: 2.0

# Prevent multiple sourcing
if [[ "${VERIFICATION_HELPER_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly VERIFICATION_HELPER_LOADED="true"

# Modern shell script best practices
set -euo pipefail

# Get the directory where this script is located
VERIFICATION_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${VERIFICATION_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${VERIFICATION_HELPER_DIR}/../../shared/errors.sh"
fi

# Mark this file as sourced
export VERIFICATION_HELPER_SOURCED=true

#
# Service Management Functions
#

# Start all critical services
# Usage: start_all_services
# Returns: 0 if successful, 1 if any failures
start_all_services() {
    log "Starting all critical services..."

    local services=(
        "ssh"
        "fail2ban"
        "hostapd"
        "dnsmasq"
        "adguardhome"
        "step-ca"
    )

    local failed_services=()
    local started_services=()

    for service in "${services[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            if systemctl start "$service" 2>/dev/null; then
                if systemctl is-active "$service" >/dev/null 2>&1; then
                    success "$service started successfully"
                    started_services+=("$service")
                else
                    warning "$service failed to start properly"
                    failed_services+=("$service")
                fi
            else
                warning "Failed to start $service"
                failed_services+=("$service")
            fi
        else
            debug "$service is not enabled, skipping"
        fi
    done

    # Report results
    if [[ ${#failed_services[@]} -eq 0 ]]; then
        success "All enabled services started successfully"
        return 0
    else
        warning "Some services failed to start: ${failed_services[*]}"
        if [[ ${#started_services[@]} -gt 0 ]]; then
            log "Successfully started: ${started_services[*]}"
        fi
        return 1
    fi
}

#
# Verification Functions
#

# Verify service status
# Usage: verify_service_status
# Returns: number of errors found
verify_service_status() {
    log_subsection "Service Status Verification"
    
    local critical_services=("ssh" "fail2ban" "hostapd" "dnsmasq" "adguardhome" "step-ca")
    local failed_services=()
    local warning_services=()
    local errors=0
    local warnings=0

    for service in "${critical_services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            if systemctl is-enabled --quiet "$service" 2>/dev/null; then
                success "✓ $service is running and enabled"
            else
                warning "⚠ $service is running but not enabled"
                warning_services+=("$service")
                ((warnings++))
            fi
        else
            error "✗ $service is not running"
            failed_services+=("$service")
            ((errors++))
        fi
    done

    # Export results for main verification function
    export VERIFICATION_SERVICE_ERRORS=$errors
    export VERIFICATION_SERVICE_WARNINGS=$warnings
    return $errors
}

# Verify network connectivity
# Usage: verify_network_connectivity
# Returns: number of errors found
verify_network_connectivity() {
    log_subsection "Network Connectivity Verification"
    
    local connectivity_tests=(
        "8.8.8.8:Google DNS"
        "1.1.1.1:Cloudflare DNS"
        "github.com:GitHub"
    )

    local connectivity_failures=0
    local errors=0
    local warnings=0

    for test in "${connectivity_tests[@]}"; do
        local target="${test%%:*}"
        local description="${test##*:}"

        if ping -c 1 -W 3 "$target" >/dev/null 2>&1; then
            success "✓ Connectivity to $description ($target)"
        else
            warning "⚠ No connectivity to $description ($target)"
            ((connectivity_failures++))
            ((warnings++))
        fi
    done

    if [[ $connectivity_failures -eq ${#connectivity_tests[@]} ]]; then
        error "✗ No internet connectivity detected"
        ((errors++))
    fi

    # Export results for main verification function
    export VERIFICATION_CONNECTIVITY_ERRORS=$errors
    export VERIFICATION_CONNECTIVITY_WARNINGS=$warnings
    return $errors
}

# Verify network interfaces
# Usage: verify_network_interfaces
# Returns: number of errors found
verify_network_interfaces() {
    log_subsection "Network Interface Verification"
    
    local errors=0
    local warnings=0

    # Check WiFi interface
    if [[ -n "${WIFI_INTERFACE:-}" ]]; then
        if ip link show "${WIFI_INTERFACE}" >/dev/null 2>&1; then
            local wifi_state
            wifi_state=$(ip link show "${WIFI_INTERFACE}" | grep -o "state [A-Z]*" | cut -d' ' -f2)
            if [[ "$wifi_state" == "UP" ]]; then
                success "✓ WiFi interface ${WIFI_INTERFACE} is up"
            else
                warning "⚠ WiFi interface ${WIFI_INTERFACE} is down (state: $wifi_state)"
                ((warnings++))
            fi
        else
            error "✗ WiFi interface ${WIFI_INTERFACE} not found"
            ((errors++))
        fi
    else
        debug "WiFi interface not configured"
    fi

    # Check WAN interface
    if [[ -n "${WAN_INTERFACE:-}" ]]; then
        if ip link show "${WAN_INTERFACE}" >/dev/null 2>&1; then
            local wan_state
            wan_state=$(ip link show "${WAN_INTERFACE}" | grep -o "state [A-Z]*" | cut -d' ' -f2)
            if [[ "$wan_state" == "UP" ]]; then
                success "✓ WAN interface ${WAN_INTERFACE} is up"
            else
                warning "⚠ WAN interface ${WAN_INTERFACE} is down (state: $wan_state)"
                ((warnings++))
            fi
        else
            error "✗ WAN interface ${WAN_INTERFACE} not found"
            ((errors++))
        fi
    else
        debug "WAN interface not configured"
    fi

    # Export results for main verification function
    export VERIFICATION_INTERFACE_ERRORS=$errors
    export VERIFICATION_INTERFACE_WARNINGS=$warnings
    return $errors
}

# Verify DNS resolution
# Usage: verify_dns_resolution
# Returns: number of errors found
verify_dns_resolution() {
    log_subsection "DNS Resolution Verification"
    
    local errors=0
    local test_domains=("google.com" "github.com" "cloudflare.com")
    local successful_resolutions=0

    for domain in "${test_domains[@]}"; do
        if nslookup "$domain" >/dev/null 2>&1; then
            success "✓ DNS resolution working for $domain"
            ((successful_resolutions++))
        else
            warning "⚠ DNS resolution failed for $domain"
        fi
    done

    if [[ $successful_resolutions -eq 0 ]]; then
        error "✗ DNS resolution completely failed"
        ((errors++))
    elif [[ $successful_resolutions -lt ${#test_domains[@]} ]]; then
        warning "⚠ Partial DNS resolution issues detected"
    else
        success "✓ DNS resolution working properly"
    fi

    # Export results for main verification function
    export VERIFICATION_DNS_ERRORS=$errors
    return $errors
}

# Verify service ports
# Usage: verify_service_ports
# Returns: number of warnings found
verify_service_ports() {
    log_subsection "Service Port Verification"
    
    local port_tests=(
        "22:SSH"
        "53:DNS"
        "3000:AdGuard Home Web"
        "5053:AdGuard Home DNS"
        "9000:Step-CA"
    )

    local warnings=0

    for test in "${port_tests[@]}"; do
        local port="${test%%:*}"
        local service="${test##*:}"

        if ss -tuln 2>/dev/null | grep -q ":${port} "; then
            success "✓ $service port $port is listening"
        else
            warning "⚠ $service port $port is not listening"
            ((warnings++))
        fi
    done

    # Export results for main verification function
    export VERIFICATION_PORT_WARNINGS=$warnings
    return 0
}

# Verify file permissions
# Usage: verify_file_permissions
# Returns: number of warnings found
verify_file_permissions() {
    log_subsection "File Permission Verification"
    
    local permission_tests=(
        "/etc/ssh/sshd_config:644"
        "/var/lib/adguardhome:750"
        "/var/lib/step/secrets:700"
        "/etc/dangerprep/wifi-password:600"
    )

    local warnings=0

    for test in "${permission_tests[@]}"; do
        local file="${test%%:*}"
        local expected_perm="${test##*:}"

        if [[ -e "$file" ]]; then
            local actual_perm
            actual_perm=$(stat -c "%a" "$file" 2>/dev/null)
            if [[ "$actual_perm" == "$expected_perm" ]]; then
                success "✓ $file has correct permissions ($actual_perm)"
            else
                warning "⚠ $file has incorrect permissions ($actual_perm, expected $expected_perm)"
                ((warnings++))
            fi
        else
            debug "File not found (may be optional): $file"
        fi
    done

    # Export results for main verification function
    export VERIFICATION_PERMISSION_WARNINGS=$warnings
    return 0
}

#
# Main Verification Function
#

# Comprehensive setup verification
# Usage: verify_setup
# Returns: 0 if successful, 1 if errors found
verify_setup() {
    log_section "Comprehensive Setup Verification"

    local total_errors=0
    local total_warnings=0

    # Run all verification checks
    verify_service_status
    total_errors=$((total_errors + VERIFICATION_SERVICE_ERRORS))
    total_warnings=$((total_warnings + VERIFICATION_SERVICE_WARNINGS))

    verify_network_connectivity
    total_errors=$((total_errors + VERIFICATION_CONNECTIVITY_ERRORS))
    total_warnings=$((total_warnings + VERIFICATION_CONNECTIVITY_WARNINGS))

    verify_network_interfaces
    total_errors=$((total_errors + VERIFICATION_INTERFACE_ERRORS))
    total_warnings=$((total_warnings + VERIFICATION_INTERFACE_WARNINGS))

    verify_dns_resolution
    total_errors=$((total_errors + VERIFICATION_DNS_ERRORS))

    verify_service_ports
    total_warnings=$((total_warnings + VERIFICATION_PORT_WARNINGS))

    verify_file_permissions
    total_warnings=$((total_warnings + VERIFICATION_PERMISSION_WARNINGS))

    # Summary
    log_subsection "Verification Summary"
    if [[ $total_errors -gt 0 ]]; then
        error "Setup verification failed with $total_errors errors and $total_warnings warnings"
        error "Some critical components are not working correctly"
        return 1
    elif [[ $total_warnings -gt 0 ]]; then
        warning "Setup verification completed with $total_warnings warnings"
        warning "System is functional but some components may need attention"
        return 0
    else
        success "✓ All verification checks passed successfully"
        success "System is fully operational"
        return 0
    fi
}

# Export functions for use in other scripts
export -f start_all_services
export -f verify_service_health
export -f verify_network_connectivity
export -f verify_dns_resolution
export -f verify_certificate_authority
export -f verify_file_permissions
export -f verify_system_security
export -f verify_backup_functionality
export -f verify_monitoring_services
export -f run_comprehensive_verification
