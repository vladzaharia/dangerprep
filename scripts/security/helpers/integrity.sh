#!/usr/bin/env bash
# DangerPrep AIDE File Integrity Check
# Performs file integrity monitoring using AIDE (Advanced Intrusion Detection Environment)
# Usage: helpers/integrity.sh {init|check|update|help}
# Dependencies: aide
# Author: DangerPrep Project
# Version: 1.0


# Prevent multiple sourcing
if [[ "${SECURITY_HELPERS_INTEGRITY_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SECURITY_HELPERS_INTEGRITY_LOADED="true"

set -euo pipefail

# Script metadata
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"


SCRIPT_VERSION="1.0"
SCRIPT_DESCRIPTION="AIDE File Integrity Monitoring"

# Source shared utilities
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/logging.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/errors.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/validation.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/banner.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-aide-check.log"
readonly AIDE_CONFIG="/etc/aide/aide.conf"
readonly AIDE_DB="/var/lib/aide/aide.db"
readonly AIDE_DB_NEW="/var/lib/aide/aide.db.new"
AIDE_REPORT="/var/log/aide-report-$(date +%Y%m%d-%H%M%S).log"
readonly AIDE_REPORT

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "AIDE check failed with exit code $exit_code"
    
    # Remove temporary files
    rm -f "${AIDE_DB_NEW}.tmp" 2>/dev/null || true
    
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    validate_root_user
    require_commands aide
    debug "AIDE check initialized"
    clear_error_context
}

# Show help
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

USAGE:
    ${SCRIPT_NAME} {init|check|update|help}

COMMANDS:
    init        Initialize AIDE database (first-time setup)
    check       Check file integrity against database
    update      Update AIDE database with current state
    help        Show this help message

DESCRIPTION:
    AIDE (Advanced Intrusion Detection Environment) monitors file integrity
    by creating checksums and detecting unauthorized changes to critical files.

EXAMPLES:
    ${SCRIPT_NAME} init     # Initialize database (run once)
    ${SCRIPT_NAME} check    # Check for changes
    ${SCRIPT_NAME} update   # Update database after legitimate changes

EOF
}

# Check if AIDE is properly configured
check_aide_config() {
    set_error_context "AIDE configuration check"
    
    if [[ ! -f "$AIDE_CONFIG" ]]; then
        error "AIDE configuration not found: $AIDE_CONFIG"
        error "Please install and configure AIDE first"
        return 1
    fi
    
    # Ensure AIDE directories exist
    mkdir -p "$(dirname "$AIDE_DB")" 2>/dev/null || true
    mkdir -p "/var/log/aide" 2>/dev/null || true
    
    success "AIDE configuration validated"
    clear_error_context
}

# Initialize AIDE database
init_aide_database() {
    set_error_context "AIDE database initialization"
    
    log "Initializing AIDE database..."
    log "This may take several minutes depending on system size"
    
    # Remove existing database
    if [[ -f "$AIDE_DB" ]]; then
        warning "Existing AIDE database found, backing up..."
        mv "$AIDE_DB" "${AIDE_DB}.backup.$(date +%Y%m%d-%H%M%S)"
    fi
    
    # Initialize new database
    if aide --init --config="$AIDE_CONFIG"; then
        # Move new database to active location
        if [[ -f "$AIDE_DB_NEW" ]]; then
            mv "$AIDE_DB_NEW" "$AIDE_DB"
            success "AIDE database initialized successfully"
            log "Database location: $AIDE_DB"
        else
            error "AIDE database initialization failed - no database created"
            return 1
        fi
    else
        error "AIDE initialization command failed"
        return 1
    fi
    
    clear_error_context
}

# Check file integrity
check_file_integrity() {
    set_error_context "File integrity check"
    
    if [[ ! -f "$AIDE_DB" ]]; then
        error "AIDE database not found: $AIDE_DB"
        error "Run '${SCRIPT_NAME} init' to initialize the database first"
        return 1
    fi
    
    log "Running AIDE file integrity check..."
    log "Report will be saved to: $AIDE_REPORT"
    
    local aide_exit_code=0
    if aide --check --config="$AIDE_CONFIG" > "$AIDE_REPORT" 2>&1; then
        aide_exit_code=0
    else
        aide_exit_code=$?
    fi
    
    # AIDE exit codes:
    # 0 = no changes
    # 1 = new files
    # 2 = removed files  
    # 3 = new and removed files
    # 4 = changed files
    # 5 = new and changed files
    # 6 = removed and changed files
    # 7 = all types of changes
    
    case $aide_exit_code in
        0)
            success "No file integrity violations detected"
            ;;
        [1-7])
            warning "File integrity violations detected (exit code: $aide_exit_code)"
            warning "Check report for details: $AIDE_REPORT"
            
            # Show summary of changes
            if grep -q "Total number of files:" "$AIDE_REPORT"; then
                log "Summary from AIDE report:"
                grep -A 10 "Total number of files:" "$AIDE_REPORT" | head -10
            fi
            ;;
        *)
            error "AIDE check failed with unexpected exit code: $aide_exit_code"
            error "Check report for details: $AIDE_REPORT"
            return 1
            ;;
    esac
    
    clear_error_context
    return $aide_exit_code
}

# Update AIDE database
update_aide_database() {
    set_error_context "AIDE database update"
    
    if [[ ! -f "$AIDE_DB" ]]; then
        error "AIDE database not found: $AIDE_DB"
        error "Run '${SCRIPT_NAME} init' to initialize the database first"
        return 1
    fi
    
    log "Updating AIDE database..."
    warning "This will accept all current file states as legitimate"
    
    # Backup current database
    cp "$AIDE_DB" "${AIDE_DB}.backup.$(date +%Y%m%d-%H%M%S)"
    
    # Update database
    if aide --update --config="$AIDE_CONFIG"; then
        if [[ -f "$AIDE_DB_NEW" ]]; then
            mv "$AIDE_DB_NEW" "$AIDE_DB"
            success "AIDE database updated successfully"
        else
            error "AIDE database update failed - no new database created"
            return 1
        fi
    else
        error "AIDE update command failed"
        return 1
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
    
    show_banner_with_title "AIDE File Integrity Check" "security"
    echo
    
    check_aide_config
    
    case "$command" in
        init)
            init_aide_database
            ;;
        check)
            check_file_integrity
            ;;
        update)
            update_aide_database
            ;;
        *)
            error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}


# Export functions for use in other scripts
export -f cleanup_on_errornexport -f init_scriptnexport -f show_helpnexport -f check_aide_confignexport -f init_aide_databasenexport -f check_file_integritynexport -f update_aide_databasen
# Run main function only if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
