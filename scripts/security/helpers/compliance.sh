#!/usr/bin/env bash
# DangerPrep Lynis Security Audit
# Performs comprehensive security audit using Lynis
# Usage: helpers/compliance.sh {audit|update|report|help}
# Dependencies: lynis
# Author: DangerPrep Project
# Version: 1.0


# Prevent multiple sourcing
if [[ "${SECURITY_HELPERS_COMPLIANCE_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SECURITY_HELPERS_COMPLIANCE_LOADED="true"

set -euo pipefail

# Script metadata
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"


SCRIPT_VERSION="1.0"
SCRIPT_DESCRIPTION="Lynis Security Audit"

# Source shared utilities
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/logging.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/errors.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/validation.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/banner.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-lynis-audit.log"
readonly LYNIS_LOG="/var/log/lynis.log"
readonly LYNIS_REPORT="/var/log/lynis-report.dat"
readonly LYNIS_DATA_DIR="/var/lib/lynis"

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "Lynis audit failed with exit code $exit_code"
    
    # Kill any running lynis processes
    pkill -f lynis 2>/dev/null || true
    
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    validate_root_user
    require_commands lynis
    debug "Lynis audit initialized"
    clear_error_context
}

# Show help
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

USAGE:
    ${SCRIPT_NAME} {audit|update|report|help}

COMMANDS:
    audit       Run comprehensive security audit
    update      Update Lynis database
    report      Show summary of last audit
    help        Show this help message

DESCRIPTION:
    Lynis performs comprehensive security auditing of the system,
    checking for vulnerabilities, misconfigurations, and security
    improvements.

EXAMPLES:
    ${SCRIPT_NAME} audit        # Run full security audit
    ${SCRIPT_NAME} update       # Update Lynis database
    ${SCRIPT_NAME} report       # Show audit summary

EOF
}

# Check Lynis configuration
check_lynis_config() {
    set_error_context "Lynis configuration check"
    
    # Ensure Lynis directories exist
    mkdir -p "$LYNIS_DATA_DIR" 2>/dev/null || true
    mkdir -p "$(dirname "$LYNIS_LOG")" 2>/dev/null || true
    
    # Check Lynis version
    local lynis_version
    lynis_version=$(lynis --version 2>/dev/null | head -1 || echo "Unknown")
    log "Lynis version: $lynis_version"
    
    success "Lynis configuration validated"
    clear_error_context
}

# Update Lynis database
update_lynis_database() {
    set_error_context "Lynis database update"
    
    log "Updating Lynis database..."
    
    if lynis update info; then
        success "Lynis database updated successfully"
    else
        warning "Lynis database update failed or not available"
        log "Continuing with existing database..."
    fi
    
    clear_error_context
}

# Run Lynis security audit
run_security_audit() {
    set_error_context "Lynis security audit"
    
    log "Running Lynis security audit..."
    log "This may take several minutes depending on system complexity"
    
    # Lynis audit options
    local lynis_options=(
        "audit"
        "system"
        "--verbose"
        "--log-file" "$LYNIS_LOG"
        "--report-file" "$LYNIS_REPORT"
        "--quick"
    )
    
    # Run the audit
    local audit_exit_code=0
    if lynis "${lynis_options[@]}"; then
        audit_exit_code=0
    else
        audit_exit_code=$?
    fi
    
    # Lynis exit codes:
    # 0 = no errors
    # 1 = warnings found
    # Other = errors occurred
    
    case $audit_exit_code in
        0)
            success "Security audit completed successfully"
            ;;
        1)
            warning "Security audit completed with warnings"
            warning "Check report for recommendations"
            ;;
        *)
            error "Security audit failed with exit code: $audit_exit_code"
            return 1
            ;;
    esac
    
    # Show audit summary
    show_audit_summary
    
    clear_error_context
    return $audit_exit_code
}

# Show audit summary
show_audit_summary() {
    set_error_context "Audit summary"
    
    if [[ ! -f "$LYNIS_REPORT" ]]; then
        warning "Lynis report file not found: $LYNIS_REPORT"
        return 1
    fi
    
    log "Security Audit Summary:"
    echo
    
    # Extract key metrics from report
    local hardening_index
    hardening_index=$(grep "hardening_index=" "$LYNIS_REPORT" 2>/dev/null | cut -d'=' -f2 || echo "Unknown")
    
    local tests_performed
    tests_performed=$(grep "tests_performed=" "$LYNIS_REPORT" 2>/dev/null | cut -d'=' -f2 || echo "Unknown")
    
    local warnings_count
    warnings_count=$(grep -c "warning\[\]=" "$LYNIS_REPORT" 2>/dev/null || echo "0")
    
    local suggestions_count
    suggestions_count=$(grep -c "suggestion\[\]=" "$LYNIS_REPORT" 2>/dev/null || echo "0")
    
    log "  Hardening Index: ${hardening_index}%"
    log "  Tests Performed: $tests_performed"
    log "  Warnings Found: $warnings_count"
    log "  Suggestions: $suggestions_count"
    echo
    
    # Show top warnings if any
    if [[ "$warnings_count" -gt 0 ]]; then
        warning "Top Security Warnings:"
        grep "warning\[\]=" "$LYNIS_REPORT" 2>/dev/null | head -5 | while IFS='=' read -r _ warning_text; do
            warning "  • $warning_text"
        done
        echo
    fi
    
    # Show top suggestions if any
    if [[ "$suggestions_count" -gt 0 ]]; then
        log "Top Security Suggestions:"
        grep "suggestion\[\]=" "$LYNIS_REPORT" 2>/dev/null | head -5 | while IFS='=' read -r _ suggestion_text; do
            log "  • $suggestion_text"
        done
        echo
    fi
    
    log "Full report available at: $LYNIS_REPORT"
    log "Detailed log available at: $LYNIS_LOG"
    
    clear_error_context
}

# Generate detailed report
generate_detailed_report() {
    set_error_context "Detailed report generation"
    
    if [[ ! -f "$LYNIS_REPORT" ]]; then
        error "No Lynis report found. Run audit first."
        return 1
    fi
    
    local report_file
    report_file="/tmp/lynis-detailed-report-$(date +%Y%m%d-%H%M%S).txt"
    
    {
        echo "DangerPrep Lynis Security Audit - Detailed Report"
        echo "Generated: $(date)"
        echo "================================================"
        echo
        
        # System information
        echo "System Information:"
        grep "os=" "$LYNIS_REPORT" 2>/dev/null | cut -d'=' -f2 | sed 's/^/  OS: /' || echo "  OS: Unknown"
        grep "kernel_version=" "$LYNIS_REPORT" 2>/dev/null | cut -d'=' -f2 | sed 's/^/  Kernel: /' || echo "  Kernel: Unknown"
        echo
        
        # Audit summary
        echo "Audit Summary:"
        local hardening_index
        hardening_index=$(grep "hardening_index=" "$LYNIS_REPORT" 2>/dev/null | cut -d'=' -f2 || echo "Unknown")
        echo "  Hardening Index: ${hardening_index}%"
        
        local tests_performed
        tests_performed=$(grep "tests_performed=" "$LYNIS_REPORT" 2>/dev/null | cut -d'=' -f2 || echo "Unknown")
        echo "  Tests Performed: $tests_performed"
        echo
        
        # All warnings
        local warnings_count
        warnings_count=$(grep -c "warning\[\]=" "$LYNIS_REPORT" 2>/dev/null || echo "0")
        if [[ "$warnings_count" -gt 0 ]]; then
            echo "Security Warnings ($warnings_count):"
            grep "warning\[\]=" "$LYNIS_REPORT" 2>/dev/null | cut -d'=' -f2 | sed 's/^/  • /'
            echo
        fi
        
        # All suggestions
        local suggestions_count
        suggestions_count=$(grep -c "suggestion\[\]=" "$LYNIS_REPORT" 2>/dev/null || echo "0")
        if [[ "$suggestions_count" -gt 0 ]]; then
            echo "Security Suggestions ($suggestions_count):"
            grep "suggestion\[\]=" "$LYNIS_REPORT" 2>/dev/null | cut -d'=' -f2 | sed 's/^/  • /'
            echo
        fi
        
        echo "Raw report file: $LYNIS_REPORT"
        echo "Audit log file: $LYNIS_LOG"
        
    } > "$report_file"
    
    success "Detailed report generated: $report_file"
    
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
    
    show_banner_with_title "Lynis Security Audit" "security"
    echo
    
    check_lynis_config
    
    case "$command" in
        audit)
            update_lynis_database
            run_security_audit
            ;;
        update)
            update_lynis_database
            ;;
        report)
            if [[ -f "$LYNIS_REPORT" ]]; then
                show_audit_summary
                generate_detailed_report
            else
                error "No audit report found. Run audit first."
                exit 1
            fi
            ;;
        *)
            error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}


# Export functions for use in other scripts
export -f cleanup_on_errornexport -f init_scriptnexport -f show_helpnexport -f check_lynis_confignexport -f update_lynis_databasenexport -f run_security_auditnexport -f show_audit_summarynexport -f generate_detailed_reportn
# Run main function only if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
