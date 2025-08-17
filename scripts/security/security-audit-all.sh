#!/usr/bin/env bash
# DangerPrep Unified Security Audit Script
# Runs all security checks and provides comprehensive reporting

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
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-security-audit.log"
# shellcheck disable=SC2034  # Used in sourced configuration files and exported for subprocesses
PROJECT_ROOT="$(dirname "$(dirname "${SCRIPT_DIR}")")"
readonly PROJECT_ROOT
export PROJECT_ROOT
REPORT_FILE="/tmp/security-audit-$(date +%Y%m%d-%H%M%S).txt"
readonly REPORT_FILE
readonly CRON_LOG_FILE="/var/log/dangerprep-security-cron.log"
readonly ALERT_THRESHOLD_FILE="/tmp/dangerprep-security-alerts"

# Cron mode flag
CRON_MODE=false

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Security audit failed with exit code ${exit_code}"

    # Clean up temporary files
    rm -f "${REPORT_FILE}.tmp" 2>/dev/null || true

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
    require_commands logger find ss

    # Ensure log directories exist
    mkdir -p "$(dirname "${DEFAULT_LOG_FILE}")" 2>/dev/null || true
    mkdir -p "$(dirname "${CRON_LOG_FILE}")" 2>/dev/null || true
    mkdir -p "$(dirname "${ALERT_THRESHOLD_FILE}")" 2>/dev/null || true

    debug "Security audit initialized"
    clear_error_context
}

# Alert function for critical issues
alert() {
    local message="[ALERT] $1"
    echo "${message}" >> "${CRON_LOG_FILE}"
    echo "$(date '+%Y-%m-%d %H:%M:%S'): $1" >> "${ALERT_THRESHOLD_FILE}"
    logger -t "DANGERPREP-SECURITY" -p daemon.alert "$1"

    # In interactive mode, also display
    if [[ "${CRON_MODE}" != "true" ]]; then
        error "${message}"
    fi
}

# Show security audit banner
show_security_banner() {
    show_banner_with_title "Security Audit Suite" "security"
    echo
    log "Comprehensive security scanning and monitoring for emergency networks"
}

# Show help
show_help() {
    echo "DangerPrep Unified Security Audit Script"
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  aide         Run AIDE integrity check"
    echo "  antivirus    Run ClamAV antivirus scan"
    echo "  lynis        Run Lynis security audit"
    echo "  rootkit      Run rootkit detection scan"
    echo "  audit        Run general security audit"

    echo "  all          Run all security checks (default)"
    echo "  cron         Run all checks in cron-friendly mode (quiet, logs to file)"
    echo "  report       Generate comprehensive security report"
    echo "  help         Show this help message"
    echo
    echo "Examples:"
    echo "  $0 all       # Run all security checks"
    echo "  $0 aide      # Run only AIDE integrity check"
    echo "  $0 report    # Generate security report"
}

# Run AIDE integrity check
run_aide_check() {
    log "Running AIDE integrity check..."
    
    if command -v aide >/dev/null 2>&1; then
        if [[ -f "${SCRIPT_DIR}/aide-check.sh" ]]; then
            bash "${SCRIPT_DIR}/aide-check.sh"
            success "AIDE check completed"
        else
            warning "AIDE check script not found"
        fi
    else
        warning "AIDE not installed"
    fi
}

# Run antivirus scan
run_antivirus_scan() {
    log "Running ClamAV antivirus scan..."
    
    if command -v clamscan >/dev/null 2>&1; then
        if [[ -f "${SCRIPT_DIR}/antivirus-scan.sh" ]]; then
            bash "${SCRIPT_DIR}/antivirus-scan.sh"
            success "Antivirus scan completed"
        else
            warning "Antivirus scan script not found"
        fi
    else
        warning "ClamAV not installed"
    fi
}

# Run Lynis audit
run_lynis_audit() {
    log "Running Lynis security audit..."
    
    if command -v lynis >/dev/null 2>&1; then
        if [[ -f "${SCRIPT_DIR}/lynis-audit.sh" ]]; then
            bash "${SCRIPT_DIR}/lynis-audit.sh"
            success "Lynis audit completed"
        else
            warning "Lynis audit script not found"
        fi
    else
        warning "Lynis not installed"
    fi
}

# Run rootkit scan
run_rootkit_scan() {
    log "Running rootkit detection scan..."
    
    if command -v rkhunter >/dev/null 2>&1 || command -v chkrootkit >/dev/null 2>&1; then
        if [[ -f "${SCRIPT_DIR}/rootkit-scan.sh" ]]; then
            bash "${SCRIPT_DIR}/rootkit-scan.sh"
            success "Rootkit scan completed"
        else
            warning "Rootkit scan script not found"
        fi
    else
        warning "Rootkit detection tools not installed"
    fi
}

# Run general security audit
run_security_audit() {
    log "Running general security audit..."
    
    if [[ -f "${SCRIPT_DIR}/security-audit.sh" ]]; then
        bash "${SCRIPT_DIR}/security-audit.sh"
        success "Security audit completed"
    else
        warning "Security audit script not found"
    fi
}



# Run all security checks
run_all_checks() {
    log "Running comprehensive security audit..."
    echo
    
    run_aide_check
    echo
    
    run_antivirus_scan
    echo
    
    run_lynis_audit
    echo
    
    run_rootkit_scan
    echo
    
    run_security_audit
    echo
    

    
    success "All security checks completed"
    info "Check individual log files for detailed results"
    info "Comprehensive report available at: ${REPORT_FILE}"
}

# Generate comprehensive security report
generate_report() {
    log "Generating comprehensive security report..."
    
    {
        echo "DangerPrep Security Audit Report"
        echo "Generated: $(date)"
        echo "========================================"
        echo
        
        echo "System Information:"
        echo "  Hostname: $(hostname)"
        echo "  OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo "Unknown")"
        echo "  Kernel: $(uname -r)"
        echo "  Uptime: $(uptime -p)"
        echo
        
        echo "Security Tools Status:"
        echo "  AIDE: $(command -v aide >/dev/null 2>&1 && echo "Installed" || echo "Not installed")"
        echo "  ClamAV: $(command -v clamscan >/dev/null 2>&1 && echo "Installed" || echo "Not installed")"
        echo "  Lynis: $(command -v lynis >/dev/null 2>&1 && echo "Installed" || echo "Not installed")"
        echo "  RKHunter: $(command -v rkhunter >/dev/null 2>&1 && echo "Installed" || echo "Not installed")"

        echo "  Fail2ban: $(systemctl is-active fail2ban 2>/dev/null || echo "Not active")"
        echo
        
        echo "Recent Security Events:"
        echo "  Failed SSH attempts (last 24h): $(journalctl --since "24 hours ago" | grep -c "Failed password" || echo "0")"
        echo "  Fail2ban bans (last 24h): $(journalctl --since "24 hours ago" -u fail2ban | grep -c "Ban " || echo "0")"
        echo
        
        echo "File System Security:"
        echo "  Root filesystem permissions: $(find / -maxdepth 0 -printf '%M\n')"
        echo "  /etc permissions: $(find /etc -maxdepth 0 -printf '%M\n')"
        echo "  /var/log permissions: $(find /var/log -maxdepth 0 -printf '%M\n')"
        echo
        
        echo "Network Security:"
        echo "  Open ports: $(ss -tuln | grep -c LISTEN)"
        echo "  Firewall status: $(ufw status 2>/dev/null | head -1 || echo "UFW not configured")"
        echo
        
        echo "For detailed results, check individual log files:"
        echo "  AIDE: /var/log/aide-check.log"
        echo "  ClamAV: /var/log/clamav-scan.log"
        echo "  Lynis: /var/log/lynis-audit.log"
        echo "  RKHunter: /var/log/rkhunter-scan.log"
        echo "  General audit: Check security-audit.sh output"
        
    } | tee "${REPORT_FILE}"
    
    success "Security report generated: ${REPORT_FILE}"
}

# Main function
main() {
    # Initialize script
    init_script

    # Show banner for comprehensive security audit
    if [[ "${1:-all}" == "all" ]]; then
        show_security_banner "$@"
        echo
    fi

    case "${1:-all}" in
        aide)
            run_aide_check
            ;;
        antivirus)
            run_antivirus_scan
            ;;
        lynis)
            run_lynis_audit
            ;;
        rootkit)
            run_rootkit_scan
            ;;
        audit)
            run_security_audit
            ;;
        all)
            show_security_banner "$@"
            run_all_checks
            generate_report
            ;;
        cron)
            CRON_MODE=true
            # Ensure log directories exist
            mkdir -p "$(dirname "${CRON_LOG_FILE}")" 2>/dev/null || true
            mkdir -p "$(dirname "${ALERT_THRESHOLD_FILE}")" 2>/dev/null || true

            # Run all checks in quiet mode
            run_all_checks

            # Check for critical alerts
            if [[ -f "${ALERT_THRESHOLD_FILE}" ]] && [[ -s "${ALERT_THRESHOLD_FILE}" ]]; then
                # Send alert notification (could be extended to email, etc.)
                logger -t "DANGERPREP-SECURITY" -p daemon.alert "Critical security issues detected. Check ${ALERT_THRESHOLD_FILE}"
            fi
            ;;
        report)
            generate_report
            ;;
        help|--help|-h)
            show_help
            exit 0
            ;;
        *)
            error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
