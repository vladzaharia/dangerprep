#!/usr/bin/env bash
# Update DangerPrep system from repository

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
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-system-update.log"
PROJECT_ROOT="$(dirname "$(dirname "${SCRIPT_DIR}")")"
readonly PROJECT_ROOT

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "System update failed with exit code ${exit_code}"

    # Reset to previous git state if possible
    if [[ -d "${PROJECT_ROOT}/.git" ]]; then
        warning "Attempting to reset to previous state..."
        cd "${PROJECT_ROOT}" && git reset --hard HEAD~1 2>/dev/null || true
    fi

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
    require_commands git

    debug "System updater initialized"
    clear_error_context
}

# Update from git repository
update_repository() {
    set_error_context "Repository update"

    cd "${PROJECT_ROOT}"

    if [[ -d ".git" ]]; then
        log "Pulling latest changes from repository..."
        git pull origin main || git pull origin master
        success "Repository updated successfully"
    else
        warning "Not a git repository. Please update manually."
    fi

    clear_error_context
}

# Update just binaries
update_just_binaries() {
    set_error_context "Just binary update"

    log "Updating just binaries..."
    cd "${PROJECT_ROOT}"

    if [[ -f "./lib/just/download.sh" ]]; then
        ./lib/just/download.sh --force
        success "Just binaries updated"
    else
        warning "Just download script not found"
    fi

    clear_error_context
}

# Restart services to apply updates
restart_services() {
    set_error_context "Service restart"

    log "Restarting services to apply updates..."
    cd "${PROJECT_ROOT}"

    if command -v just >/dev/null 2>&1; then
        just restart
        success "Services restarted"
    else
        warning "Just command not available, skipping service restart"
    fi

    clear_error_context
}

# Main function
main() {
    # Initialize script
    init_script

    show_banner_with_title "System Updater" "system"
    echo

    log "Updating DangerPrep system..."

    # Update from git repository
    update_repository

    # Update just binaries
    update_just_binaries

    # Restart services to apply updates
    restart_services

    success "System update completed!"
}

# Run main function
main "$@"
