#!/usr/bin/env bash
# DangerPrep Unified Monitoring Script
# Runs all monitoring checks and provides comprehensive reporting

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
# shellcheck source=../shared/hardware-detection.sh
source "${SCRIPT_DIR}/../shared/hardware-detection.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-monitoring.log"
# shellcheck disable=SC2034  # Used in report generation functions
readonly REPORT_DIR="/tmp"

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Validate required commands
    require_commands bash find systemctl

    # Detect system capabilities
    detect_system_capabilities

    debug "Monitoring suite initialized"
    clear_error_context
}

# Detect system monitoring capabilities
detect_system_capabilities() {
    set_error_context "System capability detection"

    # Use shared hardware detection
    detect_hardware_platform
    get_hardware_summary

    # Check for Docker availability
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        success "Docker monitoring: Available"
    else
        warning "Docker monitoring: Not available"
    fi

    # Check for systemd services
    if command -v systemctl >/dev/null 2>&1; then
        success "Systemd service monitoring: Available"
    else
        warning "Systemd service monitoring: Not available"
    fi

    # Check for network monitoring tools
    if command -v ip >/dev/null 2>&1; then
        success "Network interface monitoring: Available"
    else
        warning "Network interface monitoring: Limited"
    fi

    # Check for fan control capabilities
    if supports_pwm_fan_control; then
        success "PWM fan control: Available (RK3588 platform)"
    else
        debug "PWM fan control: Not available (non-RK3588 platform)"
    fi

    clear_error_context
}

# Show banner (using shared banner utilities)
show_monitoring_banner() {
    show_banner_with_title "Monitoring Suite" "monitoring"
}

# Show help
show_help() {
    echo "DangerPrep Unified Monitoring Script"
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  system       Run system monitoring (CPU, memory, disk, network)"
    echo "  hardware     Run hardware monitoring (temperature, SMART)"
    echo "  all          Run all monitoring checks (default)"
    echo "  report       Generate comprehensive monitoring report"

    echo "  help         Show this help message"
    echo
    echo "Examples:"
    echo "  $0 all           # Run all monitoring checks"
    echo "  $0 system        # Run only system monitoring"

}

# Run system monitoring
run_system_monitoring() {
    set_error_context "System monitoring"
    log "Running system monitoring..."

    if [[ -f "${SCRIPT_DIR}/system-monitor.sh" ]]; then
        if bash "${SCRIPT_DIR}/system-monitor.sh" report; then
            success "System monitoring completed"
        else
            error "System monitoring failed"
            return 1
        fi
    else
        error "System monitor script not found: ${SCRIPT_DIR}/system-monitor.sh"
        return 1
    fi

    clear_error_context
}

# Run hardware monitoring
run_hardware_monitoring() {
    set_error_context "Hardware monitoring"
    log "Running hardware monitoring..."

    if [[ -f "${SCRIPT_DIR}/hardware-monitor.sh" ]]; then
        if bash "${SCRIPT_DIR}/hardware-monitor.sh" report; then
            success "Hardware monitoring completed"
        else
            error "Hardware monitoring failed"
            clear_error_context
            return 1
        fi
    else
        error "Hardware monitor script not found: ${SCRIPT_DIR}/hardware-monitor.sh"
        clear_error_context
        return 1
    fi

    # Check fan control status on RK3588 platforms
    if supports_pwm_fan_control && [[ -f "${SCRIPT_DIR}/rk3588-fan-control.sh" ]]; then
        log "Checking fan control status..."
        if bash "${SCRIPT_DIR}/rk3588-fan-control.sh" status; then
            success "Fan control status check completed"
        else
            warning "Fan control status check failed"
        fi
    fi

    clear_error_context
}

# Run all monitoring checks
run_all_monitoring() {
    set_error_context "Comprehensive monitoring"
    log "Running comprehensive system monitoring..."
    echo

    local system_status=0
    local hardware_status=0

    # Run system monitoring
    if ! run_system_monitoring; then
        system_status=1
        warning "System monitoring encountered errors"
    fi
    echo

    # Run hardware monitoring
    if ! run_hardware_monitoring; then
        hardware_status=1
        warning "Hardware monitoring encountered errors"
    fi
    echo

    # Report overall status
    if [[ $system_status -eq 0 && $hardware_status -eq 0 ]]; then
        success "All monitoring checks completed successfully"
    else
        warning "Some monitoring checks encountered errors"
        if [[ $system_status -ne 0 ]]; then
            warning "- System monitoring had issues"
        fi
        if [[ $hardware_status -ne 0 ]]; then
            warning "- Hardware monitoring had issues"
        fi
    fi

    info "Detailed results available in individual log files"
    clear_error_context
}

# Generate comprehensive monitoring report
generate_report() {
    set_error_context "Report generation"

    local report_file
    report_file="/tmp/monitoring-report-$(date +%Y%m%d-%H%M%S).txt"

    log "Generating comprehensive monitoring report..."

    {
        echo "DangerPrep System Monitoring Report"
        echo "Generated: $(date)"
        echo "========================================"
        echo
        
        echo "System Overview:"
        echo "  Hostname: $(hostname)"
        echo "  Uptime: $(uptime -p)"
        echo "  Load Average: $(cat /proc/loadavg | cut -d' ' -f1-3)"
        echo "  Users: $(who | wc -l) logged in"
        echo
        
        echo "CPU Information:"
        local cpu_usage
        cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
        echo "  Usage: ${cpu_usage}%"
        echo "  Cores: $(nproc)"
        echo "  Model: $(grep "model name" /proc/cpuinfo | head -1 | cut -d':' -f2 | xargs)"
        echo
        
        echo "Memory Information:"
        local mem_info
        mem_info=$(free -h | grep "Mem:")
        echo "  Total: $(echo "$mem_info" | awk '{print $2}')"
        echo "  Used: $(echo "$mem_info" | awk '{print $3}')"
        echo "  Available: $(echo "$mem_info" | awk '{print $7}')"
        echo "  Usage: $(free | grep Mem | awk '{printf "%.1f%%", $3/$2 * 100.0}')"
        echo
        
        echo "Disk Information:"
        df -h | grep -E "^/dev/" | while read -r _filesystem size used _avail percent mount; do
            echo "  $mount: $used/$size ($percent)"
        done
        echo
        
        echo "Network Information:"
        echo "  Interfaces:"
        ip addr show | grep -E "^[0-9]+:" | awk '{print "    " $2}' | sed 's/://'
        echo "  Internet connectivity: $(ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1 && echo "OK" || echo "FAILED")"
        if command -v tailscale >/dev/null 2>&1; then
            echo "  Tailscale: $(tailscale status --json 2>/dev/null | grep -q '"BackendState":"Running"' && echo "Connected" || echo "Disconnected")"
        fi
        echo
        
        echo "Service Status:"
        local services=("ssh" "docker" "fail2ban" "hostapd" "dnsmasq")
        for service in "${services[@]}"; do
            local status
            status=$(systemctl is-active "$service" 2>/dev/null || echo "inactive")
            echo "  $service: $status"
        done
        echo
        
        echo "Docker Information:"
        if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
            echo "  Status: Running"
            echo "  Containers: $(docker ps -q | wc -l) running, $(docker ps -aq | wc -l) total"
            echo "  Images: $(docker images -q | wc -l)"
            echo "  Networks: $(docker network ls -q | wc -l)"
        else
            echo "  Status: Not running or not accessible"
        fi
        echo
        
        echo "Hardware Status:"
        if command -v sensors >/dev/null 2>&1; then
            echo "  Temperature sensors available: Yes"
            local cpu_temp
            cpu_temp=$(sensors 2>/dev/null | grep -i "core\|cpu" | grep -o '[0-9]\+\.[0-9]\+°C' | head -1 || echo "N/A")
            echo "  CPU Temperature: $cpu_temp"
        else
            echo "  Temperature sensors: Not available"
        fi
        
        if command -v smartctl >/dev/null 2>&1; then
            echo "  SMART monitoring: Available"
            local disk_count
            disk_count=$(find /dev/sd* /dev/nvme* -maxdepth 1 -type f 2>/dev/null | wc -l)
            echo "  Monitored disks: $disk_count"
        else
            echo "  SMART monitoring: Not available"
        fi
        echo
        
        echo "Recent System Events:"
        echo "  System boots (last 7 days): $(journalctl --since "7 days ago" | grep -c "systemd.*: Startup finished" || echo "0")"
        echo "  Kernel messages (last 24h): $(journalctl --since "24 hours ago" -k | wc -l)"
        echo "  Failed services (last 24h): $(journalctl --since "24 hours ago" --priority=err | wc -l)"
        echo
        
        echo "Storage Health:"
        echo "  Root filesystem: $(df -h / | tail -1 | awk '{print $5}') used"
        if [[ -d "/var/log" ]]; then
            echo "  Log directory size: $(du -sh /var/log 2>/dev/null | cut -f1 || echo "Unknown")"
        fi
        if [[ -d "/tmp" ]]; then
            echo "  Temp directory size: $(du -sh /tmp 2>/dev/null | cut -f1 || echo "Unknown")"
        fi
        echo
        
        echo "For detailed monitoring data, check:"
        echo "  System monitor log: /var/log/dangerprep-monitor.log"
        echo "  Hardware monitor log: /var/log/dangerprep-hardware.log"
        echo "  System journal: journalctl -f"

    } | tee "$report_file"

    success "Monitoring report generated: $report_file"
    clear_error_context
}



# Main function
main() {
    # Initialize script
    init_script

    # Show banner for comprehensive monitoring
    if [[ "${1:-all}" == "all" ]]; then
        show_banner_with_title "Monitoring Suite" "monitoring"
        echo
    fi

    case "${1:-all}" in
        system)
            run_system_monitoring
            ;;
        hardware)
            run_hardware_monitoring
            ;;
        all)
            show_monitoring_banner "$@"
            run_all_monitoring
            generate_report
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
