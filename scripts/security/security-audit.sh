#!/usr/bin/env bash
# DangerPrep General Security Audit
# Performs general security checks and configuration validation
# Usage: security-audit.sh {audit|permissions|services|network|help}
# Dependencies: systemctl, ss, find
# Author: DangerPrep Project
# Version: 1.0

set -euo pipefail

# Script metadata
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"
readonly SCRIPT_NAME
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly SCRIPT_VERSION="1.0"
readonly SCRIPT_DESCRIPTION="General Security Audit"

# Source shared utilities
source "${SCRIPT_DIR}/../shared/logging.sh"
source "${SCRIPT_DIR}/../shared/error-handling.sh"
source "${SCRIPT_DIR}/../shared/validation.sh"
source "${SCRIPT_DIR}/../shared/banner.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-security-audit.log"
AUDIT_REPORT="/tmp/security-audit-report-$(date +%Y%m%d-%H%M%S).txt"
readonly AUDIT_REPORT

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "Security audit failed with exit code $exit_code"
    rm -f "${AUDIT_REPORT}.tmp" 2>/dev/null || true
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    validate_root_user
    require_commands systemctl ss find
    debug "Security audit initialized"
    clear_error_context
}

# Show help
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

USAGE:
    ${SCRIPT_NAME} {audit|permissions|services|network|help}

COMMANDS:
    audit           Run comprehensive security audit
    permissions     Check file and directory permissions
    services        Audit running services and processes
    network         Check network security configuration
    help            Show this help message

EXAMPLES:
    ${SCRIPT_NAME} audit            # Run full security audit
    ${SCRIPT_NAME} permissions      # Check file permissions only
    ${SCRIPT_NAME} services         # Audit services only

EOF
}

# Check file and directory permissions
check_permissions() {
    set_error_context "Permission audit"
    
    log "Checking critical file and directory permissions..."
    
    local permission_issues=0
    
    # Critical system directories
    local critical_dirs=(
        "/etc:755"
        "/etc/passwd:644"
        "/etc/shadow:640"
        "/etc/group:644"
        "/etc/gshadow:640"
        "/etc/ssh:755"
        "/etc/ssh/sshd_config:644"
        "/var/log:755"
        "/tmp:1777"
        "/var/tmp:1777"
    )
    
    for dir_perm in "${critical_dirs[@]}"; do
        local dir_path="${dir_perm%:*}"
        local expected_perm="${dir_perm#*:}"
        
        if [[ -e "$dir_path" ]]; then
            local actual_perm
            actual_perm=$(stat -c "%a" "$dir_path" 2>/dev/null || echo "000")
            
            if [[ "$actual_perm" != "$expected_perm" ]]; then
                warning "Incorrect permissions on $dir_path: $actual_perm (expected: $expected_perm)"
                ((permission_issues++))
            else
                log "✓ Correct permissions on $dir_path: $actual_perm"
            fi
        else
            warning "Critical path not found: $dir_path"
            ((permission_issues++))
        fi
    done
    
    # Check for world-writable files (excluding expected ones)
    log "Checking for unexpected world-writable files..."
    local world_writable
    world_writable=$(find / -type f -perm -002 -not -path "/proc/*" -not -path "/sys/*" -not -path "/dev/*" -not -path "/tmp/*" -not -path "/var/tmp/*" 2>/dev/null | head -10)
    
    if [[ -n "$world_writable" ]]; then
        warning "Found world-writable files:"
        echo "$world_writable" | while read -r file; do
            warning "  $file"
        done
        ((permission_issues++))
    else
        success "No unexpected world-writable files found"
    fi
    
    # Check for SUID/SGID files
    log "Checking SUID/SGID files..."
    local suid_files
    suid_files=$(find /usr /bin /sbin -type f \( -perm -4000 -o -perm -2000 \) 2>/dev/null | wc -l)
    log "Found $suid_files SUID/SGID files"
    
    if [[ $permission_issues -eq 0 ]]; then
        success "File permission audit completed - no issues found"
    else
        warning "File permission audit found $permission_issues issues"
    fi
    
    clear_error_context
    return $permission_issues
}

# Audit running services
audit_services() {
    set_error_context "Service audit"
    
    log "Auditing running services and processes..."
    
    local service_issues=0
    
    # Check for unnecessary services
    local unnecessary_services=(
        "telnet"
        "rsh"
        "rlogin"
        "ftp"
        "tftp"
        "finger"
        "talk"
        "ntalk"
    )
    
    for service in "${unnecessary_services[@]}"; do
        if systemctl is-active "$service" >/dev/null 2>&1; then
            warning "Unnecessary service running: $service"
            ((service_issues++))
        fi
    done
    
    # Check SSH configuration
    if systemctl is-active ssh >/dev/null 2>&1 || systemctl is-active sshd >/dev/null 2>&1; then
        log "Checking SSH configuration..."
        
        if [[ -f "/etc/ssh/sshd_config" ]]; then
            # Check for root login
            if grep -q "^PermitRootLogin yes" /etc/ssh/sshd_config 2>/dev/null; then
                warning "SSH allows root login"
                ((service_issues++))
            fi
            
            # Check for password authentication
            if grep -q "^PasswordAuthentication yes" /etc/ssh/sshd_config 2>/dev/null; then
                log "SSH allows password authentication"
            fi
            
            # Check for empty passwords
            if grep -q "^PermitEmptyPasswords yes" /etc/ssh/sshd_config 2>/dev/null; then
                warning "SSH allows empty passwords"
                ((service_issues++))
            fi
        fi
    fi
    
    # Check for processes running as root
    local root_processes
    root_processes=$(pgrep -u root | wc -l)
    log "Processes running as root: $root_processes"
    
    if [[ $service_issues -eq 0 ]]; then
        success "Service audit completed - no critical issues found"
    else
        warning "Service audit found $service_issues issues"
    fi
    
    clear_error_context
    return $service_issues
}

# Check network security
check_network_security() {
    set_error_context "Network security audit"
    
    log "Checking network security configuration..."
    
    local network_issues=0
    
    # Check open ports
    log "Checking open network ports..."
    local open_ports
    open_ports=$(ss -tuln | grep -c LISTEN)
    log "Open listening ports: $open_ports"
    
    # Show open ports
    log "Open ports summary:"
    ss -tuln | grep LISTEN | while read -r line; do
        log "  $line"
    done
    
    # Check for dangerous ports
    local dangerous_ports=("23" "513" "514" "515" "79" "111")
    for port in "${dangerous_ports[@]}"; do
        if ss -tuln | grep -q ":$port "; then
            warning "Dangerous port $port is open"
            ((network_issues++))
        fi
    done
    
    # Check firewall status
    log "Checking firewall status..."
    if command -v ufw >/dev/null 2>&1; then
        local ufw_status
        ufw_status=$(ufw status | head -1)
        log "UFW status: $ufw_status"
        
        if echo "$ufw_status" | grep -q "inactive"; then
            warning "UFW firewall is inactive"
            ((network_issues++))
        fi
    elif command -v iptables >/dev/null 2>&1; then
        local iptables_rules
        iptables_rules=$(iptables -L | wc -l)
        log "iptables rules: $iptables_rules lines"
    else
        warning "No firewall detected"
        ((network_issues++))
    fi
    
    # Check IP forwarding
    if [[ -f "/proc/sys/net/ipv4/ip_forward" ]]; then
        local ip_forward
        ip_forward=$(cat /proc/sys/net/ipv4/ip_forward)
        if [[ "$ip_forward" == "1" ]]; then
            log "IP forwarding is enabled (expected for router)"
        fi
    fi
    
    if [[ $network_issues -eq 0 ]]; then
        success "Network security audit completed - no critical issues found"
    else
        warning "Network security audit found $network_issues issues"
    fi
    
    clear_error_context
    return $network_issues
}

# Run comprehensive security audit
run_comprehensive_audit() {
    set_error_context "Comprehensive security audit"
    
    log "Starting comprehensive security audit..."
    echo
    
    local total_issues=0
    
    # Run all audit checks
    if ! check_permissions; then
        ((total_issues += $?))
    fi
    echo
    
    if ! audit_services; then
        ((total_issues += $?))
    fi
    echo
    
    if ! check_network_security; then
        ((total_issues += $?))
    fi
    echo
    
    # Generate audit report
    generate_audit_report "$total_issues"
    
    if [[ $total_issues -eq 0 ]]; then
        success "Security audit completed - no critical issues found"
    else
        warning "Security audit found $total_issues total issues"
        warning "Review audit report: $AUDIT_REPORT"
    fi
    
    clear_error_context
    return $total_issues
}

# Generate audit report
generate_audit_report() {
    local total_issues="$1"
    
    set_error_context "Audit report generation"
    
    {
        echo "DangerPrep General Security Audit Report"
        echo "Generated: $(date)"
        echo "========================================"
        echo
        
        echo "System Information:"
        echo "  Hostname: $(hostname)"
        echo "  OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo "Unknown")"
        echo "  Kernel: $(uname -r)"
        echo "  Uptime: $(uptime -p)"
        echo
        
        echo "Audit Summary:"
        echo "  Total Issues Found: $total_issues"
        echo "  Audit Date: $(date)"
        echo
        
        echo "Security Recommendations:"
        echo "  • Regularly update system packages"
        echo "  • Monitor system logs for suspicious activity"
        echo "  • Review and rotate passwords periodically"
        echo "  • Keep firewall rules up to date"
        echo "  • Disable unnecessary services"
        echo
        
        echo "For detailed findings, check the main log file:"
        echo "  $DEFAULT_LOG_FILE"
        
    } > "$AUDIT_REPORT"
    
    success "Audit report generated: $AUDIT_REPORT"
    clear_error_context
}

# Main function
main() {
    local command="${1:-help}"
    
    if [[ "$command" == "help" || "$command" == "--help" || "$command" == "-h" ]]; then
        show_help
        exit 0
    fi
    
    init_script
    
    show_banner_with_title "General Security Audit" "security"
    echo
    
    case "$command" in
        audit)
            run_comprehensive_audit
            ;;
        permissions)
            check_permissions
            ;;
        services)
            audit_services
            ;;
        network)
            check_network_security
            ;;
        *)
            error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
