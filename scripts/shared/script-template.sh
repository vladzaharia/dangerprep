#!/usr/bin/env bash
# DangerPrep Script Template
# Template for creating new shell scripts with modern best practices
# 
# Purpose: [Brief description of what this script does]
# Usage: [How to use this script]
# Dependencies: [List of required commands, files, or conditions]
# Author: DangerPrep Project
# Version: 1.0
# Last Modified: $(date +%Y-%m-%d)

# Modern shell script best practices
set -euo pipefail

# Script metadata
readonly SCRIPT_NAME
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"
readonly SCRIPT_DIR
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_VERSION="1.0"
readonly SCRIPT_DESCRIPTION="[Brief description]"

# Source shared utilities
source "${SCRIPT_DIR}/../shared/logging.sh"
source "${SCRIPT_DIR}/../shared/error-handling.sh"
source "${SCRIPT_DIR}/../shared/validation.sh"
source "${SCRIPT_DIR}/../shared/banner.sh"

# Configuration variables (with defaults)
readonly DEFAULT_CONFIG_FILE="/etc/dangerprep/${SCRIPT_NAME}.conf"
CONFIG_FILE="${CONFIG_FILE:-${DEFAULT_CONFIG_FILE}}"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"
QUIET="${QUIET:-false}"

# Global variables
OPERATION_MODE=""
PROCESSED_COUNT=0
ERROR_COUNT=0

# Initialize script
init_script() {
    # Set error context
    set_error_context "Script initialization"
    
    # Set log level based on verbosity
    if [[ "${VERBOSE}" == "true" ]]; then
        set_log_level "DEBUG"
    elif [[ "${QUIET}" == "true" ]]; then
        set_log_level "ERROR"
    fi
    
    # Set log file
    set_log_file "/var/log/dangerprep-${SCRIPT_NAME}.log"
    
    # Log script start
    log_section "Starting ${SCRIPT_NAME} v${SCRIPT_VERSION}"
    debug "Script directory: ${SCRIPT_DIR}"
    debug "Configuration file: ${CONFIG_FILE}"
    debug "Dry run mode: ${DRY_RUN}"
    
    clear_error_context
}

# Load configuration
load_config() {
    set_error_context "Loading configuration"
    
    if [[ -f "${CONFIG_FILE}" ]]; then
        debug "Loading configuration from: ${CONFIG_FILE}"
        # shellcheck source=/dev/null
        source "${CONFIG_FILE}"
        success "Configuration loaded successfully"
    else
        debug "Configuration file not found, using defaults: ${CONFIG_FILE}"
    fi
    
    clear_error_context
}

# Validate environment
validate_environment() {
    set_error_context "Environment validation"
    
    # Validate required commands
    local required_commands=("awk" "sed" "grep")  # Add your required commands
    validate_script_environment "${required_commands[@]}"
    
    # Validate required files/directories
    # validate_directory_exists "/some/required/directory"
    
    # Validate permissions if needed
    # validate_root_user  # or validate_not_root_user
    
    # Validate system requirements
    # validate_disk_space "/tmp" 100  # 100MB free space
    
    success "Environment validation completed"
    clear_error_context
}

# Show help information
show_help() {
    cat << EOF
${SCRIPT_NAME} v${SCRIPT_VERSION} - ${SCRIPT_DESCRIPTION}

Usage: $0 [OPTIONS] [COMMAND] [ARGUMENTS]

Commands:
    help                Show this help message
    version             Show version information
    [add your commands here]

Options:
    -c, --config FILE   Use specified configuration file (default: ${DEFAULT_CONFIG_FILE})
    -n, --dry-run       Show what would be done without making changes
    -v, --verbose       Enable verbose output
    -q, --quiet         Suppress non-error output
    -h, --help          Show this help message

Examples:
    $0 --help
    $0 --dry-run command
    $0 --verbose --config /path/to/config command

Exit Codes:
    0   Success
    1   General error
    2   Invalid arguments
    126 Command not executable
    127 Command not found
    128 Invalid exit argument

For more information, see the DangerPrep documentation.
EOF
}

# Show version information
show_version() {
    echo "${SCRIPT_NAME} version ${SCRIPT_VERSION}"
    echo "Part of the DangerPrep project"
}

# Parse command line arguments
parse_arguments() {
    set_error_context "Argument parsing"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--config)
                CONFIG_FILE="$2"
                validate_file_readable "${CONFIG_FILE}" "configuration file"
                shift 2
                ;;
            -n|--dry-run)
                DRY_RUN=true
                info "Dry run mode enabled"
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -q|--quiet)
                QUIET=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            --version)
                show_version
                exit 0
                ;;
            help)
                show_help
                exit 0
                ;;
            version)
                show_version
                exit 0
                ;;
            # Add your commands here
            # command1)
            #     OPERATION_MODE="command1"
            #     shift
            #     ;;
            -*)
                error "Unknown option: $1"
                error "Use '$0 --help' for usage information"
                exit 2
                ;;
            *)
                # Handle positional arguments
                if [[ -z "${OPERATION_MODE}" ]]; then
                    OPERATION_MODE="$1"
                else
                    error "Unexpected argument: $1"
                    exit 2
                fi
                shift
                ;;
        esac
    done
    
    # Set default operation mode if none specified
    if [[ -z "${OPERATION_MODE}" ]]; then
        OPERATION_MODE="default"
    fi
    
    debug "Operation mode: ${OPERATION_MODE}"
    clear_error_context
}

# Main operation functions (customize these for your script)

# Default operation
perform_default_operation() {
    set_error_context "Default operation"
    
    log_subsection "Performing default operation"
    
    # Add your main logic here
    info "This is the default operation"
    
    if [[ "${DRY_RUN}" == "true" ]]; then
        info "[DRY RUN] Would perform default operation"
    else
        # Actual operation code here
        success "Default operation completed"
    fi
    
    clear_error_context
}

# Example operation function
perform_example_operation() {
    set_error_context "Example operation"
    
    log_subsection "Performing example operation"
    
    # Example of using validation
    validate_not_empty "${OPERATION_MODE}" "operation mode"
    
    # Example of using safe execution with retry
    if [[ "${DRY_RUN}" == "true" ]]; then
        info "[DRY RUN] Would execute example operation"
    else
        safe_execute 3 2 echo "Example command execution"
        ((PROCESSED_COUNT++))
    fi
    
    success "Example operation completed"
    clear_error_context
}

# Cleanup function (called automatically on exit)
cleanup_script() {
    debug "Performing script cleanup"
    
    # Add any cleanup operations here
    # Remove temporary files, reset system state, etc.
    
    debug "Script cleanup completed"
}

# Main execution function
main() {
    # Register cleanup function
    register_cleanup_function cleanup_script
    
    # Initialize script
    init_script
    
    # Parse arguments
    parse_arguments "$@"
    
    # Load configuration
    load_config
    
    # Validate environment
    validate_environment
    
    # Show banner for major operations
    if [[ "${OPERATION_MODE}" != "help" && "${OPERATION_MODE}" != "version" ]]; then
        show_banner_with_title "${SCRIPT_DESCRIPTION}" "default"
        echo
    fi
    
    # Execute based on operation mode
    case "${OPERATION_MODE}" in
        default)
            perform_default_operation
            ;;
        example)
            perform_example_operation
            ;;
        # Add your operation cases here
        *)
            error "Unknown operation: ${OPERATION_MODE}"
            error "Use '$0 --help' for usage information"
            exit 2
            ;;
    esac
    
    # Show summary
    log_section "Operation Summary"
    info "Processed items: ${PROCESSED_COUNT}"
    if [[ ${ERROR_COUNT} -gt 0 ]]; then
        warning "Errors encountered: ${ERROR_COUNT}"
        exit 1
    else
        success "All operations completed successfully"
    fi
}

# Execute main function with all arguments
main "$@"
