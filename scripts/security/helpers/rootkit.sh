#!/usr/bin/env bash
# DangerPrep Rootkit Detection Scanner
# Performs rootkit detection using rkhunter and chkrootkit
# Usage: helpers/rootkit.sh {scan|update|report|help}
# Dependencies: rkhunter, chkrootkit
# Author: DangerPrep Project
# Version: 1.0


# Prevent multiple sourcing
if [[ "${SECURITY_HELPERS_ROOTKIT_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SECURITY_HELPERS_ROOTKIT_LOADED="true"

set -euo pipefail

# Script metadata
SCRIPT_NAME_SECURITY_ROOTKIT="$(basename "${BASH_SOURCE[0]}" .sh)"

SECURITY_ROOTKIT_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SCRIPT_VERSION_SECURITY_ROOTKIT="1.0"
SCRIPT_DESCRIPTION_SECURITY_ROOTKIT="Rootkit Detection Scanner"

# Source shared utilities
source "${SECURITY_ROOTKIT_SCRIPT_DIR}/../../shared/logging.sh"
source "${SECURITY_ROOTKIT_SCRIPT_DIR}/../../shared/errors.sh"
source "${SECURITY_ROOTKIT_SCRIPT_DIR}/../../shared/validation.sh"
source "${SECURITY_ROOTKIT_SCRIPT_DIR}/../../shared/banner.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-rootkit-scan.log"
readonly RKHUNTER_LOG="/var/log/rkhunter.log"
CHKROOTKIT_LOG="/var/log/chkrootkit-$(date +%Y%m%d-%H%M%S).log"
readonly CHKROOTKIT_LOG
SCAN_REPORT="/tmp/rootkit-scan-report-$(date +%Y%m%d-%H%M%S).txt"
readonly SCAN_REPORT

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "Rootkit scan failed with exit code $exit_code"
    
    # Kill any running scanner processes
    pkill -f rkhunter 2>/dev/null || true
    pkill -f chkrootkit 2>/dev/null || true
    
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    validate_root_user
    
    # Check for available tools
    local available_tools=()
    if command -v rkhunter >/dev/null 2>&1; then
        available_tools+=("rkhunter")
    fi
    if command -v chkrootkit >/dev/null 2>&1; then
        available_tools+=("chkrootkit")
    fi
    
    if [[ ${#available_tools[@]} -eq 0 ]]; then
        error "No rootkit detection tools found"
        error "Please install rkhunter and/or chkrootkit"
        exit 1
    fi
    
    log "Available rootkit scanners: ${available_tools[*]}"
    debug "Rootkit scanner initialized"
    clear_error_context
}

# Show help
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

USAGE:
    ${SCRIPT_NAME} {scan|update|report|help}

COMMANDS:
    scan        Run rootkit detection scan
    update      Update rootkit detection databases
    report      Show summary of last scan
    help        Show this help message

DESCRIPTION:
    Performs rootkit detection using available tools:
    - RKHunter: Comprehensive rootkit detection
    - chkrootkit: Alternative rootkit scanner

EXAMPLES:
    ${SCRIPT_NAME} scan         # Run rootkit detection
    ${SCRIPT_NAME} update       # Update detection databases
    ${SCRIPT_NAME} report       # Show scan summary

EOF
}

# Update rootkit detection databases
update_databases() {
    set_error_context "Database update"
    
    log "Updating rootkit detection databases..."
    
    # Update RKHunter if available
    if command -v rkhunter >/dev/null 2>&1; then
        log "Updating RKHunter database..."
        if rkhunter --update --quiet; then
            success "RKHunter database updated"
        else
            warning "RKHunter database update failed"
        fi
        
        # Update file properties database
        log "Updating RKHunter file properties..."
        if rkhunter --propupd --quiet; then
            success "RKHunter properties updated"
        else
            warning "RKHunter properties update failed"
        fi
    fi
    
    # chkrootkit doesn't have an update mechanism
    if command -v chkrootkit >/dev/null 2>&1; then
        log "chkrootkit uses system package updates"
    fi
    
    clear_error_context
}

# Run RKHunter scan
run_rkhunter_scan() {
    set_error_context "RKHunter scan"
    
    if ! command -v rkhunter >/dev/null 2>&1; then
        warning "RKHunter not available, skipping"
        return 0
    fi
    
    log "Running RKHunter rootkit scan..."
    
    local rkhunter_options=(
        "--check"
        "--skip-keypress"
        "--report-warnings-only"
        "--logfile" "$RKHUNTER_LOG"
    )
    
    local rkhunter_exit_code=0
    if rkhunter "${rkhunter_options[@]}"; then
        rkhunter_exit_code=0
    else
        rkhunter_exit_code=$?
    fi
    
    # RKHunter exit codes:
    # 0 = no warnings
    # 1 = warnings found
    # 2 = errors occurred
    
    case $rkhunter_exit_code in
        0)
            success "RKHunter scan completed - no rootkits detected"
            ;;
        1)
            warning "RKHunter scan found potential issues"
            warning "Check log for details: $RKHUNTER_LOG"
            ;;
        2)
            error "RKHunter scan failed with errors"
            error "Check log for details: $RKHUNTER_LOG"
            ;;
    esac
    
    clear_error_context
    return $rkhunter_exit_code
}

# Run chkrootkit scan
run_chkrootkit_scan() {
    set_error_context "chkrootkit scan"
    
    if ! command -v chkrootkit >/dev/null 2>&1; then
        warning "chkrootkit not available, skipping"
        return 0
    fi
    
    log "Running chkrootkit scan..."
    
    local chkrootkit_exit_code=0
    if chkrootkit > "$CHKROOTKIT_LOG" 2>&1; then
        chkrootkit_exit_code=0
    else
        chkrootkit_exit_code=$?
    fi
    
    # Check for infections in output
    local infections
    infections=$(grep -i "infected\|rootkit\|trojan" "$CHKROOTKIT_LOG" | grep -cv "not infected")
    
    if [[ "$infections" -eq 0 ]]; then
        success "chkrootkit scan completed - no rootkits detected"
    else
        warning "chkrootkit found $infections potential issues"
        warning "Check log for details: $CHKROOTKIT_LOG"
        
        # Show first few issues
        log "Sample findings:"
        grep -i "infected\|rootkit\|trojan" "$CHKROOTKIT_LOG" | grep -v "not infected" | head -3 | while read -r line; do
            warning "  $line"
        done
    fi
    
    clear_error_context
    return $chkrootkit_exit_code
}

# Run comprehensive rootkit scan
run_rootkit_scan() {
    set_error_context "Comprehensive rootkit scan"
    
    log "Starting comprehensive rootkit detection scan..."
    echo
    
    local overall_status=0
    
    # Run RKHunter
    if ! run_rkhunter_scan; then
        overall_status=1
    fi
    echo
    
    # Run chkrootkit
    if ! run_chkrootkit_scan; then
        overall_status=1
    fi
    echo
    
    # Generate summary report
    generate_scan_report
    
    if [[ $overall_status -eq 0 ]]; then
        success "Rootkit scan completed - no threats detected"
    else
        warning "Rootkit scan completed with warnings - review logs"
    fi
    
    clear_error_context
    return $overall_status
}

# Generate scan report
generate_scan_report() {
    set_error_context "Scan report generation"
    
    {
        echo "DangerPrep Rootkit Detection Report"
        echo "Generated: $(date)"
        echo "=================================="
        echo
        
        echo "System Information:"
        echo "  Hostname: $(hostname)"
        echo "  OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo "Unknown")"
        echo "  Kernel: $(uname -r)"
        echo
        
        echo "Scan Tools Used:"
        if command -v rkhunter >/dev/null 2>&1; then
            echo "  RKHunter: $(rkhunter --version 2>/dev/null | head -1 || echo "Available")"
        else
            echo "  RKHunter: Not installed"
        fi
        
        if command -v chkrootkit >/dev/null 2>&1; then
            echo "  chkrootkit: $(chkrootkit -V 2>/dev/null || echo "Available")"
        else
            echo "  chkrootkit: Not installed"
        fi
        echo
        
        # RKHunter results
        if [[ -f "$RKHUNTER_LOG" ]]; then
            echo "RKHunter Results:"
            local rkhunter_warnings
            rkhunter_warnings=$(grep -c "Warning:" "$RKHUNTER_LOG" 2>/dev/null || echo "0")
            echo "  Warnings found: $rkhunter_warnings"
            
            if [[ "$rkhunter_warnings" -gt 0 ]]; then
                echo "  Sample warnings:"
                grep "Warning:" "$RKHUNTER_LOG" 2>/dev/null | head -3 | sed 's/^/    /'
            fi
            echo
        fi
        
        # chkrootkit results
        if [[ -f "$CHKROOTKIT_LOG" ]]; then
            echo "chkrootkit Results:"
            local chkrootkit_issues
            chkrootkit_issues=$(grep -i "infected\|rootkit\|trojan" "$CHKROOTKIT_LOG" | grep -cv "not infected")
            echo "  Issues found: $chkrootkit_issues"
            
            if [[ "$chkrootkit_issues" -gt 0 ]]; then
                echo "  Sample issues:"
                grep -i "infected\|rootkit\|trojan" "$CHKROOTKIT_LOG" | grep -v "not infected" | head -3 | sed 's/^/    /'
            fi
            echo
        fi
        
        echo "Log Files:"
        echo "  RKHunter: $RKHUNTER_LOG"
        echo "  chkrootkit: $CHKROOTKIT_LOG"
        
    } > "$SCAN_REPORT"
    
    success "Scan report generated: $SCAN_REPORT"
    
    clear_error_context
}

# Show scan summary
show_scan_summary() {
    set_error_context "Scan summary"
    
    if [[ -f "$SCAN_REPORT" ]]; then
        cat "$SCAN_REPORT"
    else
        # Try to find the most recent report
        local latest_report
        latest_report=$(find /tmp -name "rootkit-scan-report-*.txt" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
        
        if [[ -n "$latest_report" && -f "$latest_report" ]]; then
            log "Showing latest scan report: $latest_report"
            echo
            cat "$latest_report"
        else
            error "No scan report found. Run scan first."
            return 1
        fi
    fi
    
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
    
    show_banner_with_title "Rootkit Detection Scanner" "security"
    echo
    
    case "$command" in
        scan)
            update_databases
            run_rootkit_scan
            ;;
        update)
            update_databases
            ;;
        report)
            show_scan_summary
            ;;
        *)
            error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Export functions for use in other scripts
export -f update_databases
export -f run_rkhunter_scan
export -f run_chkrootkit_scan
export -f run_rootkit_scan
export -f generate_scan_report
export -f show_scan_summary

# Run main function only if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
