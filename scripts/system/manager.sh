#!/usr/bin/env bash
# DangerPrep System Manager
# Central intelligent system controller and management interface
# Usage: system-manager.sh {command} [options]
# Dependencies: systemctl, kubectl, jq
# Author: DangerPrep Project
# Version: 1.0

set -euo pipefail

# Script metadata
SYSTEM_MANAGER_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


# Source shared utilities
source "${SYSTEM_MANAGER_SCRIPT_DIR}/../shared/logging.sh"
source "${SYSTEM_MANAGER_SCRIPT_DIR}/../shared/errors.sh"
source "${SYSTEM_MANAGER_SCRIPT_DIR}/../shared/validation.sh"
source "${SYSTEM_MANAGER_SCRIPT_DIR}/../shared/banner.sh"
source "${SYSTEM_MANAGER_SCRIPT_DIR}/../shared/state/system.sh"
source "${SYSTEM_MANAGER_SCRIPT_DIR}/../shared/system.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-system-manager.log"

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "System manager failed with exit code $exit_code"
    cleanup_system_state
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    require_commands systemctl jq
    debug "System manager initialized"
    clear_error_context
}

# Show comprehensive help
show_help() {
    cat << 'EOF'
DangerPrep System Manager - Intelligent System Controller

USAGE:
    system-manager.sh {command} [options]

CORE SYSTEM MANAGEMENT:
    status              Show comprehensive system status
    auto                Enable automatic system management
    manual              Disable automatic system management
    diagnostics         Run comprehensive system diagnostics
    health              Quick system health assessment
    optimize            Optimize system performance

SERVICE MANAGEMENT:
    start               Start all services intelligently
    stop                Stop services gracefully  
    restart             Intelligent restart with dependencies
    service-status      Show detailed service status

SYSTEM MAINTENANCE:
    maintenance         Run system maintenance tasks
    update              Update system from repository
    backup              Create system backup
    monitor             Start continuous system monitoring

SYSTEM INFORMATION:
    info                Show detailed system information
    performance         Show performance metrics
    recommendations     Get system optimization recommendations

QUERY COMMANDS:
    query {metric}      Query specific system metrics
      - mode            Current system mode
      - health-score    System health score (0-100)
      - auto-mode       Auto management status
      - services        Service status summary
      - performance     Performance metrics

EXAMPLES:
    system-manager.sh status           # Show comprehensive status
    system-manager.sh auto             # Enable automatic management
    system-manager.sh diagnostics      # Run full diagnostics
    system-manager.sh query health-score  # Get health score
    system-manager.sh optimize         # Optimize system performance

INTEGRATION:
    This script coordinates with network-manager.sh and security-manager.sh
    for comprehensive system management.

EOF
}

# Core system status display
show_system_status() {
    set_error_context "System status display"
    
    log_section "System Status Overview"
    
    # System information
    get_system_info
    echo
    
    # System health
    local health_score
    health_score=$(calculate_system_health_score)
    local health_status
    health_status=$(get_system_health_status)
    
    echo "System Health:"
    echo "=============="
    echo "  Overall Score:     ${health_score}/100 (${health_status})"
    echo "  Auto Management:   $(is_system_auto_mode_enabled && echo "Enabled" || echo "Disabled")"
    echo "  System Mode:       $(get_system_mode)"
    echo
    
    # Performance metrics
    echo "Performance Metrics:"
    echo "==================="
    echo "  CPU Usage:         $(get_cpu_usage)%"
    echo "  Memory Usage:      $(get_memory_usage)%"
    echo "  Disk Usage:        $(get_disk_usage)%"
    echo "  Load Average:      $(get_load_average)"
    echo
    
    # Service status
    echo "Service Status:"
    echo "==============="
    
    # Olares/K3s status
    if is_k3s_running; then
        echo "  Olares (K3s):      ✓ Running ($(get_k3s_node_count) nodes, $(get_k3s_pod_count) pods)"
    else
        echo "  Olares (K3s):      ✗ Not running"
    fi
    
    # Host services
    local host_services=("adguardhome:AdGuard Home" "step-ca:Step-CA" "tailscaled:Tailscale")
    for service_info in "${host_services[@]}"; do
        local service=${service_info%%:*}
        local name=${service_info##*:}
        local status
        status=$(get_service_status "$service")
        
        case "$status" in
            "running") echo "  ${name}:$(printf '%*s' $((20 - ${#name})) '') ✓ Running" ;;
            "stopped") echo "  ${name}:$(printf '%*s' $((20 - ${#name})) '') ⚠ Stopped" ;;
            "disabled") echo "  ${name}:$(printf '%*s' $((20 - ${#name})) '') ○ Disabled" ;;
        esac
    done
    
    # Package status
    local package_count
    package_count=$(get_package_count)
    echo "  Installed Packages: ${package_count}"

    local upgradable
    upgradable=$(get_upgradable_packages)
    if [[ ${upgradable} -gt 0 ]]; then
        echo "  Updates Available:  ${upgradable}"
    fi
    
    echo
    
    # Network connectivity
    echo "Network Status:"
    echo "==============="
    if test_internet_connectivity; then
        echo "  Internet:          ✓ Connected"
    else
        echo "  Internet:          ✗ No connection"
    fi
    
    local primary_ip
    primary_ip=$(get_primary_ip)
    echo "  Primary IP:        ${primary_ip}"

    local ts_status
    ts_status=$(get_tailscale_status)
    echo "  Tailscale:         ${ts_status}"
    
    # Update system state
    update_system_performance "$(get_cpu_usage)" "$(get_memory_usage)" "$(get_disk_usage)" "$(get_load_average)"
    set_system_health_score "$health_score"
    
    clear_error_context
}

# Enable automatic system management
enable_auto_management() {
    set_error_context "Enable auto management"
    
    log "Enabling automatic system management..."
    
    enable_system_auto_mode
    set_system_mode "AUTO"
    
    success "Automatic system management enabled"
    log "System will now automatically:"
    log "  - Monitor system health and performance"
    log "  - Restart failed services"
    log "  - Optimize system resources"
    log "  - Schedule maintenance tasks"
    
    clear_error_context
}

# Disable automatic system management
disable_auto_management() {
    set_error_context "Disable auto management"
    
    log "Disabling automatic system management..."
    
    disable_system_auto_mode
    set_system_mode "MANUAL"
    
    success "Automatic system management disabled"
    log "System management is now manual"
    
    clear_error_context
}

# Run comprehensive system diagnostics
run_system_diagnostics() {
    set_error_context "System diagnostics"
    
    log_section "System Diagnostics"
    
    # System requirements validation
    log "Validating system requirements..."
    if validate_system_requirements; then
        success "System requirements validated"
    else
        warning "System requirements validation failed"
    fi
    echo
    
    # Service diagnostics
    log "Checking service health..."
    "${SCRIPT_DIR}/service-status.sh" >/dev/null 2>&1
    success "Service diagnostics completed"
    echo
    
    # System maintenance check
    log "Running system maintenance check..."
    "${SCRIPT_DIR}/system-maintenance.sh" validate >/dev/null 2>&1
    success "System maintenance check completed"
    echo
    
    # Performance analysis
    log "Analyzing system performance..."
    local health_score
    health_score=$(calculate_system_health_score)
    echo "  System Health Score: ${health_score}/100"
    echo
    
    # Recommendations
    log "System recommendations:"
    get_system_recommendations | while IFS= read -r recommendation; do
        echo "  • $recommendation"
    done
    
    clear_error_context
}

# Quick system health check
quick_health_check() {
    set_error_context "Health check"
    
    local health_score
    health_score=$(calculate_system_health_score)
    local health_status
    health_status=$(get_system_health_status)
    
    echo "System Health: ${health_score}/100 (${health_status})"
    
    # Show critical issues only
    if [[ $health_score -lt 60 ]]; then
        echo "Critical Issues:"
        get_system_recommendations | head -3 | while IFS= read -r recommendation; do
            echo "  ⚠ $recommendation"
        done
    fi
    
    clear_error_context
}

# System optimization
optimize_system() {
    set_error_context "System optimization"
    
    log_section "System Optimization"
    
    # Check if root permissions are needed
    validate_root_user
    
    log "Optimizing system performance..."
    
    # Clean up system resources
    log "Cleaning up system resources..."
    systemctl restart k3s 2>/dev/null || true
    journalctl --vacuum-time=7d >/dev/null 2>&1
    
    # Package cache cleanup
    if command -v apt >/dev/null 2>&1; then
        log "Cleaning up package cache..."
        apt autoclean >/dev/null 2>&1 || true
    elif command -v yum >/dev/null 2>&1; then
        log "Cleaning up package cache..."
        yum clean all >/dev/null 2>&1 || true
    fi
    
    # Update package cache
    log "Updating package cache..."
    apt update >/dev/null 2>&1 || true
    
    success "System optimization completed"
    
    # Show new health score
    local new_score
    new_score=$(calculate_system_health_score)
    log "New system health score: ${new_score}/100"
    
    clear_error_context
}

# Query system metrics
query_system() {
    local metric="${1:-}"
    
    case "$metric" in
        "mode")
            get_system_mode
            ;;
        "health-score")
            calculate_system_health_score
            ;;
        "auto-mode")
            is_system_auto_mode_enabled && echo "enabled" || echo "disabled"
            ;;
        "services")
            echo "olares:$(is_k3s_running && echo "running" || echo "stopped")"
            echo "packages:$(get_package_count)"
            ;;
        "performance")
            echo "cpu:$(get_cpu_usage)"
            echo "memory:$(get_memory_usage)"
            echo "disk:$(get_disk_usage)"
            echo "load:$(get_load_average)"
            ;;
        *)
            error "Unknown metric: $metric"
            echo "Available metrics: mode, health-score, auto-mode, services, performance"
            return 1
            ;;
    esac
}

# Main function with command parsing
main() {
    local command="${1:-help}"

    if [[ "$command" == "help" || "$command" == "--help" || "$command" == "-h" ]]; then
        show_help
        exit 0
    fi

    # Initialize script for all commands
    init_script

    case "$command" in
        "status")
            show_banner_with_title "System Status" "system"
            show_system_status
            ;;
        "auto")
            enable_auto_management
            ;;
        "manual")
            disable_auto_management
            ;;
        "diagnostics")
            show_banner_with_title "System Diagnostics" "system"
            run_system_diagnostics
            ;;
        "health")
            quick_health_check
            ;;
        "optimize")
            optimize_system
            ;;
        "start")
            "${SCRIPT_DIR}/start-services.sh"
            ;;
        "stop")
            "${SCRIPT_DIR}/stop-services.sh"
            ;;
        "restart")
            "${SCRIPT_DIR}/stop-services.sh"
            sleep 5
            "${SCRIPT_DIR}/start-services.sh"
            ;;
        "service-status")
            "${SCRIPT_DIR}/service-status.sh"
            ;;
        "maintenance")
            "${SCRIPT_DIR}/system-maintenance.sh" all
            ;;
        "update")
            "${SCRIPT_DIR}/system-update.sh"
            ;;
        "backup")
            log "System backup functionality - use backup-manager.sh for advanced options"
            ;;
        "monitor")
            log "Starting continuous system monitoring..."
            log "Use 'just monitor-continuous' for full monitoring"
            ;;
        "info")
            get_system_info
            ;;
        "performance")
            echo "CPU: $(get_cpu_usage)%, Memory: $(get_memory_usage)%, Disk: $(get_disk_usage)%"
            echo "Load: $(get_load_average)"
            ;;
        "recommendations")
            get_system_recommendations
            ;;
        "query")
            query_system "${2:-}"
            ;;
        *)
            error "Unknown command: ${command}"
            echo "Use '$0 help' for usage information"
            exit 2
            ;;
    esac
}

main "$@"
