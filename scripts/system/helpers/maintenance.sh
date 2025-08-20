#!/usr/bin/env bash
# DangerPrep System Maintenance Script
# Consolidated validation, permission fixes, and system health checks

# Modern shell script best practices

# Prevent multiple sourcing
if [[ "${SYSTEM_HELPERS_MAINTENANCE_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SYSTEM_HELPERS_MAINTENANCE_LOADED="true"

set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


# Source shared utilities
# shellcheck source=../../shared/logging.sh
source "${SCRIPT_DIR}/../../shared/logging.sh"
# shellcheck source=../../shared/errors.sh
source "${SCRIPT_DIR}/../../shared/errors.sh"
# shellcheck source=../../shared/validation.sh
source "${SCRIPT_DIR}/../../shared/validation.sh"
# shellcheck source=../../shared/banner.sh
source "${SCRIPT_DIR}/../../shared/banner.sh"
# shellcheck source=../../shared/state/system.sh
source "${SCRIPT_DIR}/../../shared/state/system.sh"
# shellcheck source=../../shared/system.sh
source "${SCRIPT_DIR}/../../shared/system.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-system-maintenance.log"
PROJECT_ROOT="$(dirname "$(dirname "${SCRIPT_DIR}")")"
readonly PROJECT_ROOT
readonly DANGERPREP_ROOT="${PROJECT_ROOT}"
readonly DANGERPREP_DATA_DIR="${PROJECT_ROOT}/data"

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "System maintenance failed with exit code ${exit_code}"

    # No specific cleanup needed for maintenance operations

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
    require_commands systemctl df free find

    debug "System maintenance initialized"
    clear_error_context
}

# Show help
show_help() {
    echo "DangerPrep System Maintenance Script"
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  validate     Validate system configuration and dependencies"
    echo "  permissions  Fix file permissions for security"
    echo "  health       Quick system health check"
    echo "  all          Run all maintenance tasks (default)"
    echo "  help         Show this help message"
    echo
    echo "Examples:"
    echo "  $0 all           # Run all maintenance tasks"
    echo "  $0 validate      # Only validate system configuration"
    echo "  $0 permissions   # Only fix file permissions"
}

# Validate system configuration
validate_system() {
    log "Validating system configuration..."
    
    local issues=0
    
    # Check configuration files
    if [[ -d "${DANGERPREP_ROOT}/config" ]]; then
        log "Checking configuration files..."
        while IFS= read -r -d '' config_file; do
            if [[ ! -r "$config_file" ]]; then
                error "Unreadable config file: $config_file"
                ((issues++))
            fi
        done < <(find "${DANGERPREP_ROOT}/config" \( -name "*.yml" -o -name "*.yaml" \) -print0 2>/dev/null)
    fi
    
    # Check critical services
    log "Checking critical services..."
    local critical_services=("systemd-resolved")
    for service in "${critical_services[@]}"; do
        if ! systemctl is-active --quiet "$service" 2>/dev/null; then
            warning "Critical service not running: $service"
            ((issues++))
        fi
    done
    
    # Check disk space
    log "Checking disk space..."
    local disk_usage
    disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 90 ]]; then
        error "Disk usage critical: ${disk_usage}%"
        ((issues++))
    elif [[ $disk_usage -gt 80 ]]; then
        warning "Disk usage high: ${disk_usage}%"
    fi
    
    # Check memory usage
    log "Checking memory usage..."
    local mem_usage
    mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [[ $mem_usage -gt 90 ]]; then
        error "Memory usage critical: ${mem_usage}%"
        ((issues++))
    elif [[ $mem_usage -gt 80 ]]; then
        warning "Memory usage high: ${mem_usage}%"
    fi
    
    if [[ $issues -eq 0 ]]; then
        success "System validation completed - no issues found"
    else
        error "System validation found $issues issues"
        return 1
    fi
}

# Fix file permissions
fix_permissions() {
    log "Fixing file permissions..."
    
    local fixed_count=0
    
    # Fix configuration file permissions
    if [[ -d "${DANGERPREP_ROOT}/config" ]]; then
        while IFS= read -r -d '' config_file; do
            chmod 600 "${config_file}"
            ((fixed_count++))
        done < <(find "${DANGERPREP_ROOT}/config" -name "*.env" -print0 2>/dev/null)
    fi
    
    # Fix script permissions
    if [[ -d "${DANGERPREP_ROOT}/scripts" ]]; then
        while IFS= read -r -d '' script_file; do
            chmod 755 "$script_file"
            ((fixed_count++))
        done < <(find "${DANGERPREP_ROOT}/scripts" -name "*.sh" -print0 2>/dev/null)
    fi
    
    # Fix data directory permissions
    if [[ -d "${DANGERPREP_DATA_DIR}" ]]; then
        chmod 755 "${DANGERPREP_DATA_DIR}"
        find "${DANGERPREP_DATA_DIR}" -type d -exec chmod 755 {} \; 2>/dev/null || true
        find "${DANGERPREP_DATA_DIR}" -type f -exec chmod 644 {} \; 2>/dev/null || true
    fi
    
    success "Fixed permissions for $fixed_count files"
}

# Quick system health check
system_health() {
    log "Performing system health check..."
    
    echo "System Overview:"
    get_system_info
    echo
    
    # Check service status
    echo "Critical Services:"
    local services=("systemd-resolved" "ssh")
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            echo "  $service: ✓ Running"
        else
            echo "  $service: ✗ Not running"
        fi
    done
    echo
    
    # Check network connectivity
    echo "Network Connectivity:"
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        echo "  Internet: ✓ Connected"
    else
        echo "  Internet: ✗ No connection"
    fi
    
    if command -v tailscale >/dev/null 2>&1; then
        local ts_status
        ts_status=$(tailscale status --json 2>/dev/null | jq -r '.BackendState' 2>/dev/null || echo "unknown")
        echo "  Tailscale: $ts_status"
    fi
    echo
    
    # Check package status
    echo "Package Status:"
    local package_count
    package_count=$(get_package_count)
    echo "  Installed packages: ${package_count}"

    local upgradable_count
    upgradable_count=$(get_upgradable_packages)
    if [[ ${upgradable_count} -gt 0 ]]; then
        echo "  Available updates: ${upgradable_count}"
    else
        echo "  All packages up to date"
    fi
}

# Run all maintenance tasks
run_all() {
    log "Running all system maintenance tasks..."
    echo

    # Set maintenance mode
    set_system_mode "MAINTENANCE"

    validate_system
    echo

    fix_permissions
    echo

    system_health
    echo

    # Update maintenance timestamp
    local current_time
    current_time=$(date -Iseconds)
    local next_week
    next_week=$(date -d '+1 week' -Iseconds)
    update_maintenance_status "${current_time}" "${next_week}"

    # Update system health score
    local health_score
    health_score=$(calculate_system_health_score)
    set_system_health_score "${health_score}"

    # Reset system mode
    if is_system_auto_mode_enabled; then
        set_system_mode "AUTO"
    else
        set_system_mode "NORMAL"
    fi

    # Log maintenance completion
    log_system_event "INFO" "System maintenance completed - health score: ${health_score}/100"

    success "All maintenance tasks completed"
    log "System health score: ${health_score}/100"
}

# Main function
main() {
    # Initialize script
    init_script

    case "${1:-all}" in
        validate)
            validate_system
            ;;
        permissions)
            fix_permissions
            ;;
        health)
            system_health
            ;;
        all)
            show_banner_with_title "System Maintenance" "system"
            run_all
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

# Export functions for use in other scripts
export -f cleanup_on_errornexport -f init_scriptnexport -f show_helpnexport -f validate_systemnexport -f fix_permissionsnexport -f system_healthnexport -f run_alln
# Run main function only if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
