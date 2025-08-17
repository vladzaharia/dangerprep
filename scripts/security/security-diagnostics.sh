#!/usr/bin/env bash
# DangerPrep Security Diagnostics
# Comprehensive security validation and status reporting
# Usage: security-diagnostics.sh {status|validate|report|help}
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
readonly SCRIPT_DESCRIPTION="Security Diagnostics"

# Source shared utilities
source "${SCRIPT_DIR}/../shared/logging.sh"
source "${SCRIPT_DIR}/../shared/error-handling.sh"
source "${SCRIPT_DIR}/../shared/validation.sh"
source "${SCRIPT_DIR}/../shared/banner.sh"
source "${SCRIPT_DIR}/../shared/security-functions.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-security-diagnostics.log"
DIAGNOSTICS_REPORT="/tmp/security-diagnostics-$(date +%Y%m%d-%H%M%S).txt"
readonly DIAGNOSTICS_REPORT

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "Security diagnostics failed with exit code $exit_code"
    rm -f "${DIAGNOSTICS_REPORT}.tmp" 2>/dev/null || true
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    validate_root_user
    require_commands systemctl ss find
    debug "Security diagnostics initialized"
    clear_error_context
}

# Show help
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

USAGE:
    ${SCRIPT_NAME} {status|validate|report|help}

COMMANDS:
    status      Show current security status
    validate    Validate security configuration
    report      Generate comprehensive security report
    help        Show this help message

EXAMPLES:
    ${SCRIPT_NAME} status       # Show security status
    ${SCRIPT_NAME} validate     # Validate configuration
    ${SCRIPT_NAME} report       # Generate full report

EOF
}

# Show security status
show_security_status() {
    set_error_context "Security status"
    
    log "DangerPrep Security Status Overview"
    echo
    
    # Calculate overall security score
    local security_score
    security_score=$(calculate_security_score)
    
    log "Overall Security Score: ${security_score}%"
    
    if [[ $security_score -ge 80 ]]; then
        success "Security status: EXCELLENT"
    elif [[ $security_score -ge 60 ]]; then
        log "Security status: GOOD"
    elif [[ $security_score -ge 40 ]]; then
        warning "Security status: FAIR"
    else
        error "Security status: POOR"
    fi
    echo
    
    # Security tools status
    log "Security Tools Status:"
    local security_tools=("aide" "clamav" "lynis" "rkhunter" "fail2ban")
    
    for tool in "${security_tools[@]}"; do
        local status
        status=$(get_security_tool_status "$tool")
        
        case "$status" in
            "installed_configured"|"active")
                success "  $tool: Ready"
                ;;
            "installed_not_configured"|"enabled_not_active")
                warning "  $tool: Needs configuration"
                ;;
            "installed_not_enabled")
                warning "  $tool: Installed but not enabled"
                ;;
            "not_installed")
                error "  $tool: Not installed"
                ;;
            *)
                log "  $tool: Unknown status"
                ;;
        esac
    done
    echo
    
    # Firewall status
    log "Firewall Status:"
    if command -v ufw >/dev/null 2>&1; then
        local ufw_status
        ufw_status=$(ufw status | head -1)
        if echo "$ufw_status" | grep -q "active"; then
            success "  UFW: Active"
        else
            warning "  UFW: Inactive"
        fi
    elif command -v iptables >/dev/null 2>&1; then
        local iptables_rules
        iptables_rules=$(iptables -L | wc -l)
        if [[ $iptables_rules -gt 10 ]]; then
            success "  iptables: Active ($iptables_rules rules)"
        else
            warning "  iptables: Minimal rules ($iptables_rules)"
        fi
    else
        error "  No firewall detected"
    fi
    echo
    
    # Certificate status
    log "Certificate Status:"
    if systemctl is-active step-ca >/dev/null 2>&1; then
        success "  Step-CA: Running"
    else
        warning "  Step-CA: Not running"
    fi
    
    if [[ -f "/etc/ssl/certs/step-ca-root.crt" ]]; then
        success "  Root Certificate: Present"
    else
        warning "  Root Certificate: Missing"
    fi
    echo
    
    # Recent security events
    log "Recent Security Events (24h):"
    local failed_ssh
    failed_ssh=$(journalctl --since "24 hours ago" | grep -c "Failed password" 2>/dev/null || echo "0")
    log "  Failed SSH attempts: $failed_ssh"
    
    local fail2ban_bans
    fail2ban_bans=$(journalctl --since "24 hours ago" -u fail2ban | grep -c "Ban " 2>/dev/null || echo "0")
    log "  Fail2ban bans: $fail2ban_bans"
    
    clear_error_context
}

# Validate security configuration
validate_security_config() {
    set_error_context "Security configuration validation"
    
    log "Validating security configuration..."
    echo
    
    local validation_errors=0
    
    # Check critical file permissions
    log "Checking critical file permissions..."
    local critical_files=(
        "/etc/passwd:644"
        "/etc/shadow:640"
        "/etc/group:644"
        "/etc/gshadow:640"
    )
    
    for file_perm in "${critical_files[@]}"; do
        local file_path="${file_perm%:*}"
        local expected_perm="${file_perm#*:}"
        
        if [[ -f "$file_path" ]]; then
            local actual_perm
            actual_perm=$(stat -c "%a" "$file_path")
            
            if [[ "$actual_perm" == "$expected_perm" ]]; then
                success "  $file_path: Correct permissions ($actual_perm)"
            else
                error "  $file_path: Incorrect permissions ($actual_perm, expected: $expected_perm)"
                ((validation_errors++))
            fi
        else
            error "  $file_path: File not found"
            ((validation_errors++))
        fi
    done
    echo
    
    # Check SSH configuration
    log "Checking SSH configuration..."
    if [[ -f "/etc/ssh/sshd_config" ]]; then
        # Root login check
        if grep -q "^PermitRootLogin no" /etc/ssh/sshd_config 2>/dev/null; then
            success "  Root login: Disabled"
        elif grep -q "^PermitRootLogin yes" /etc/ssh/sshd_config 2>/dev/null; then
            error "  Root login: Enabled (security risk)"
            ((validation_errors++))
        else
            warning "  Root login: Default setting (check manually)"
        fi
        
        # Empty passwords check
        if grep -q "^PermitEmptyPasswords no" /etc/ssh/sshd_config 2>/dev/null; then
            success "  Empty passwords: Disabled"
        elif grep -q "^PermitEmptyPasswords yes" /etc/ssh/sshd_config 2>/dev/null; then
            error "  Empty passwords: Enabled (security risk)"
            ((validation_errors++))
        else
            success "  Empty passwords: Default (disabled)"
        fi
    else
        warning "  SSH configuration file not found"
    fi
    echo
    
    # Check for dangerous open ports
    log "Checking for dangerous open ports..."
    local dangerous_ports=("23" "513" "514" "515" "79" "111")
    local dangerous_found=0
    
    for port in "${dangerous_ports[@]}"; do
        if ss -tuln | grep -q ":$port "; then
            error "  Dangerous port $port is open"
            ((validation_errors++))
            ((dangerous_found++))
        fi
    done
    
    if [[ $dangerous_found -eq 0 ]]; then
        success "  No dangerous ports detected"
    fi
    echo
    
    # Check system updates
    log "Checking system update status..."
    if command -v apt >/dev/null 2>&1; then
        local updates_available
        updates_available=$(apt list --upgradable 2>/dev/null | wc -l)
        if [[ $updates_available -gt 1 ]]; then
            warning "  $((updates_available - 1)) package updates available"
        else
            success "  System is up to date"
        fi
    elif command -v yum >/dev/null 2>&1; then
        local updates_available
        updates_available=$(yum check-update 2>/dev/null | wc -l)
        if [[ $updates_available -gt 0 ]]; then
            warning "  $updates_available package updates available"
        else
            success "  System is up to date"
        fi
    fi
    echo
    
    # Summary
    if [[ $validation_errors -eq 0 ]]; then
        success "Security configuration validation completed - no errors found"
    else
        error "Security configuration validation found $validation_errors errors"
    fi
    
    clear_error_context
    return $validation_errors
}

# Generate comprehensive security report
generate_security_report() {
    set_error_context "Security report generation"
    
    log "Generating comprehensive security report..."
    
    {
        echo "DangerPrep Security Diagnostics Report"
        echo "Generated: $(date)"
        echo "======================================"
        echo
        
        # System information
        echo "System Information:"
        echo "  Hostname: $(hostname)"
        echo "  OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo "Unknown")"
        echo "  Kernel: $(uname -r)"
        echo "  Uptime: $(uptime -p)"
        echo "  Load Average: $(uptime | awk -F'load average:' '{print $2}')"
        echo
        
        # Security score
        local security_score
        security_score=$(calculate_security_score)
        echo "Security Assessment:"
        echo "  Overall Score: ${security_score}%"
        
        if [[ $security_score -ge 80 ]]; then
            echo "  Status: EXCELLENT"
        elif [[ $security_score -ge 60 ]]; then
            echo "  Status: GOOD"
        elif [[ $security_score -ge 40 ]]; then
            echo "  Status: FAIR"
        else
            echo "  Status: POOR - Immediate attention required"
        fi
        echo
        
        # Security tools
        echo "Security Tools Status:"
        local security_tools=("aide" "clamav" "lynis" "rkhunter" "fail2ban")
        
        for tool in "${security_tools[@]}"; do
            local status
            status=$(get_security_tool_status "$tool")
            echo "  $tool: $status"
        done
        echo
        
        # Network security
        echo "Network Security:"
        local open_ports
        open_ports=$(ss -tuln | grep -c LISTEN)
        echo "  Open ports: $open_ports"
        
        # Firewall status
        if command -v ufw >/dev/null 2>&1; then
            local ufw_status
            ufw_status=$(ufw status | head -1)
            echo "  Firewall (UFW): $ufw_status"
        elif command -v iptables >/dev/null 2>&1; then
            local iptables_rules
            iptables_rules=$(iptables -L | wc -l)
            echo "  Firewall (iptables): $iptables_rules rules"
        else
            echo "  Firewall: Not detected"
        fi
        echo
        
        # Recent security events
        echo "Recent Security Events (24h):"
        local failed_ssh
        failed_ssh=$(journalctl --since "24 hours ago" | grep -c "Failed password" 2>/dev/null || echo "0")
        echo "  Failed SSH attempts: $failed_ssh"
        
        local fail2ban_bans
        fail2ban_bans=$(journalctl --since "24 hours ago" -u fail2ban | grep -c "Ban " 2>/dev/null || echo "0")
        echo "  Fail2ban bans: $fail2ban_bans"
        echo
        
        # Recommendations
        echo "Security Recommendations:"
        if [[ $security_score -lt 80 ]]; then
            echo "  • Install and configure missing security tools"
            echo "  • Enable and configure firewall if not active"
            echo "  • Review and harden SSH configuration"
            echo "  • Regularly update system packages"
            echo "  • Monitor system logs for suspicious activity"
        else
            echo "  • Continue regular security monitoring"
            echo "  • Keep security tools updated"
            echo "  • Review logs periodically"
        fi
        echo
        
        echo "Report generated: $(date)"
        echo "For detailed logs, check: $DEFAULT_LOG_FILE"
        
    } > "$DIAGNOSTICS_REPORT"
    
    success "Security diagnostics report generated: $DIAGNOSTICS_REPORT"
    
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
    
    show_banner_with_title "Security Diagnostics" "security"
    echo
    
    case "$command" in
        status)
            show_security_status
            ;;
        validate)
            validate_security_config
            ;;
        report)
            show_security_status
            echo
            validate_security_config
            echo
            generate_security_report
            ;;
        *)
            error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
