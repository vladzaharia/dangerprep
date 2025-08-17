#!/usr/bin/env bash
# DangerPrep System Monitor
# Comprehensive system health monitoring and alerting

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
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-monitor.log"
readonly ALERT_THRESHOLD_CPU=80
readonly ALERT_THRESHOLD_MEMORY=85
readonly ALERT_THRESHOLD_DISK=90

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Validate required commands
    require_commands top free df systemctl

    debug "System monitor initialized"
    clear_error_context
}

# System information functions
get_system_info() {
    echo "=== DangerPrep System Health Check ==="
    echo "Date: $(date)"
    echo "Hostname: $(hostname)"
    echo "Uptime: $(uptime -p)"
    echo
}

get_cpu_info() {
    local cpu_usage
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local load_avg
    load_avg=$(cat /proc/loadavg | cut -d' ' -f1-3)
    
    echo "--- CPU Information ---"
    echo "CPU Usage: ${cpu_usage}%"
    echo "Load Average: $load_avg"
    
    # Check CPU threshold
    if command -v bc >/dev/null 2>&1; then
        if (( $(echo "$cpu_usage > ${ALERT_THRESHOLD_CPU}" | bc -l) )); then
            warning "High CPU usage detected: ${cpu_usage}%"
        fi
    else
        # Fallback comparison without bc
        if [[ ${cpu_usage%.*} -gt ${ALERT_THRESHOLD_CPU} ]]; then
            warning "High CPU usage detected: ${cpu_usage}%"
        fi
    fi
    echo
}

get_memory_info() {
    local mem_info
    mem_info=$(free -h)
    local mem_usage
    mem_usage=$(free | grep Mem | awk '{printf("%.1f"), $3/$2 * 100.0}')
    
    echo "--- Memory Information ---"
    echo "$mem_info"
    echo "Memory Usage: ${mem_usage}%"
    
    # Check memory threshold
    if command -v bc >/dev/null 2>&1; then
        if (( $(echo "$mem_usage > ${ALERT_THRESHOLD_MEMORY}" | bc -l) )); then
            warning "High memory usage detected: ${mem_usage}%"
        fi
    else
        # Fallback comparison without bc
        if [[ ${mem_usage%.*} -gt ${ALERT_THRESHOLD_MEMORY} ]]; then
            warning "High memory usage detected: ${mem_usage}%"
        fi
    fi
    echo
}

get_disk_info() {
    echo "--- Disk Information ---"
    df -h | grep -E "(^/dev|^tmpfs)" | while read -r line; do
        echo "$line"
        local usage
        usage=$(echo "$line" | awk '{print $5}' | sed 's/%//')
        local mount
        mount=$(echo "$line" | awk '{print $6}')

        if [[ $usage -gt ${ALERT_THRESHOLD_DISK} ]]; then
            warning "High disk usage on $mount: ${usage}%"
        fi
    done
    echo
}

# Temperature monitoring removed - handled by hardware-monitor.sh

get_network_info() {
    echo "--- Network Information ---"

    # Check internet connectivity
    if ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1; then
        success "Internet connectivity: OK"
    else
        error "Internet connectivity: FAILED"
    fi

    # Check Tailscale status
    if command -v tailscale > /dev/null 2>&1; then
        local tailscale_status
        tailscale_status=$(tailscale status 2>/dev/null | head -1)
        if [[ -n "$tailscale_status" ]]; then
            success "Tailscale: Connected"
            # Check for NAS connectivity if configured
            local nas_host
            nas_host=${NAS_HOST:-100.65.182.27}
            if tailscale status | grep -q "$nas_host"; then
                success "Tailscale NAS connectivity: OK"
            else
                warning "Tailscale NAS ($nas_host) not visible"
            fi
        else
            warning "Tailscale: Not connected"
        fi
    else
        warning "Tailscale not installed"
    fi

    # Check DangerPrep network services
    if systemctl is-active --quiet hostapd; then
        success "WiFi Hotspot (hostapd): Running"
    else
        warning "WiFi Hotspot (hostapd): Not running"
    fi

    if systemctl is-active --quiet dnsmasq; then
        success "DNS/DHCP (dnsmasq): Running"
    else
        warning "DNS/DHCP (dnsmasq): Not running"
    fi

    # Network interfaces
    echo "Active interfaces:"
    ip -brief addr show | grep UP
    echo
}

get_docker_info() {
    echo "--- Docker Services ---"
    
    if command -v docker > /dev/null 2>&1; then
        local running_containers
        running_containers=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep -v NAMES)
        
        if [[ -n "$running_containers" ]]; then
            echo "$running_containers"
            
            # Check for unhealthy containers
            local unhealthy
            unhealthy=$(docker ps --filter "health=unhealthy" --format "{{.Names}}")
            if [[ -n "$unhealthy" ]]; then
                error "Unhealthy containers detected: $unhealthy"
            fi
        else
            warning "No Docker containers running"
        fi
        
        # Docker resource usage
        echo
        echo "Docker Resource Usage:"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | head -10
    else
        error "Docker not available"
    fi
    echo
}

get_storage_health() {
    echo "--- Storage Health ---"
    
    # Check NVMe health if available
    if command -v smartctl > /dev/null 2>&1 && [[ -e /dev/nvme0n1 ]]; then
        local nvme_health
        nvme_health=$(smartctl -H /dev/nvme0n1 | grep "overall-health")
        echo "NVMe Health: $nvme_health"
    fi
    
    # Check for filesystem errors
    local fs_errors
    fs_errors=$(dmesg | grep -i "error\|fail" | tail -5)
    if [[ -n "$fs_errors" ]]; then
        warning "Recent filesystem errors detected"
        echo "$fs_errors"
    fi
    echo
}

# Service-specific health checks
check_service_health() {
    echo "--- Service Health Checks ---"

    # Check Docker services
    if command -v docker > /dev/null 2>&1; then
        local services=()
        mapfile -t services < <(docker ps --format "{{.Names}}" 2>/dev/null | sort)

        if [ ${#services[@]} -eq 0 ]; then
            warning "No Docker services currently running"
        else
            for service in "${services[@]}"; do
                local status
                status=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "no-healthcheck")
                local state
                state=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "unknown")

                if [[ "$state" == "running" ]]; then
                    if [[ "$status" == "healthy" ]] || [[ "$status" == "no-healthcheck" ]]; then
                        success "$service: Running ($status)"
                    else
                        warning "$service: Running but $status"
                    fi
                else
                    error "$service: $state"
                fi
            done
        fi
    fi
    echo
}

# Security services health check
check_security_services() {
    echo "--- Security Services ---"

    # Check fail2ban
    if systemctl is-active --quiet fail2ban; then
        success "Fail2ban: Active"
        local banned_ips
        banned_ips=$(fail2ban-client status sshd 2>/dev/null | grep "Banned IP list" | cut -d: -f2 | wc -w)
        if [[ $banned_ips -gt 0 ]]; then
            warning "Fail2ban: $banned_ips IPs currently banned"
        fi
    else
        warning "Fail2ban: Not running"
    fi

    # Check SSH service
    if systemctl is-active --quiet ssh; then
        success "SSH: Running"
        local ssh_port
        ssh_port=$(grep "^Port " /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "22")
        log "SSH Port: $ssh_port"
    else
        error "SSH: Not running"
    fi

    # Check firewall status
    local iptables_rules
    iptables_rules=$(iptables -L | wc -l)
    if [[ $iptables_rules -gt 10 ]]; then
        success "Firewall: Active ($iptables_rules rules)"
    else
        warning "Firewall: Minimal rules configured"
    fi

    # Check AIDE (file integrity monitoring)
    if command -v aide > /dev/null 2>&1; then
        if [[ -f /var/lib/aide/aide.db ]]; then
            success "AIDE: Database present"
        else
            warning "AIDE: Database not initialized"
        fi
    else
        warning "AIDE: Not installed"
    fi

    # Check antivirus
    if command -v clamscan > /dev/null 2>&1; then
        if systemctl is-active --quiet clamav-daemon; then
            success "ClamAV: Running"
        else
            warning "ClamAV: Daemon not running"
        fi
    else
        warning "ClamAV: Not installed"
    fi

    echo
}

# Generate system report
generate_report() {
    log "Generating system health report..."

    {
        get_system_info
        get_cpu_info
        get_memory_info
        get_disk_info
        # Temperature monitoring handled by hardware-monitor.sh
        get_network_info
        get_docker_info
        get_storage_health
        check_service_health
        check_security_services
    } | tee "/tmp/dangerprep-health-$(date +%Y%m%d-%H%M%S).txt"
}

# Continuous monitoring mode
monitor_continuous() {
    log "Starting continuous monitoring mode..."
    
    while true; do
        generate_report > /dev/null
        sleep 300  # Check every 5 minutes
    done
}

# Show help
show_help() {
    echo "DangerPrep System Monitor"
    echo "Usage: $0 {report|monitor|help}"
    echo
    echo "Commands:"
    echo "  report   - Generate one-time health report"
    echo "  monitor  - Start continuous monitoring"
    echo "  help     - Show this help message"
}

# Main function
main() {
    # Initialize script
    init_script

    # Show banner for monitoring operations
    if [[ "${1:-}" != "help" && "${1:-}" != "--help" && "${1:-}" != "-h" ]]; then
        show_banner_with_title "System Monitor" "monitoring"
        echo
    fi

    case "${1:-report}" in
        report)
            generate_report
            ;;
        monitor)
            monitor_continuous
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            generate_report
            ;;
    esac
}

# Run main function
main "$@"
