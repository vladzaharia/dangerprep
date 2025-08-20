#!/usr/bin/env bash
# DangerPrep System Diagnostics
# Comprehensive system analysis and health assessment
# Usage: system-diagnostics.sh {command} [options]
# Dependencies: systemctl, kubectl, jq, bc
# Author: DangerPrep Project
# Version: 1.0

# Prevent multiple sourcing
if [[ "${SYSTEM_DIAGNOSTICS_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SYSTEM_DIAGNOSTICS_LOADED="true"

set -euo pipefail

# Script metadata


# Source shared utilities
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/logging.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/errors.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/validation.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/banner.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/state/system.sh"
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/system.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-system-diagnostics.log"

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "System diagnostics failed with exit code $exit_code"
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    require_commands systemctl jq bc
    debug "System diagnostics initialized"
    clear_error_context
}

# Show help
show_help() {
    cat << 'EOF'
DangerPrep System Diagnostics - Comprehensive System Analysis

USAGE:
    system-diagnostics.sh {command} [options]

COMMANDS:
    all                 Run all diagnostic tests (default)
    hardware            Hardware and system information
    services            Service status and health checks
    performance         Performance analysis and metrics
    network             Network connectivity and configuration
    storage             Storage usage and health
    security            Basic security configuration checks
    packages            Package management analysis
    olares              Olares/K3s cluster diagnostics

EXAMPLES:
    system-diagnostics.sh all         # Run all diagnostics
    system-diagnostics.sh performance # Performance analysis only
    system-diagnostics.sh services    # Service health checks

EOF
}

# Hardware diagnostics
diagnose_hardware() {
    log_section "Hardware Diagnostics"
    
    # System information
    get_system_info
    echo
    
    # CPU information
    echo "CPU Details:"
    echo "============"
    if [[ -f /proc/cpuinfo ]]; then
        local cpu_cores
        cpu_cores=$(nproc)
        echo "  CPU Cores:         $cpu_cores"
        
        local cpu_freq
        cpu_freq=$(lscpu | grep "CPU MHz" | awk '{print $3}' 2>/dev/null || echo "unknown")
        echo "  CPU Frequency:     ${cpu_freq} MHz"
    fi
    echo
    
    # Memory details
    echo "Memory Details:"
    echo "==============="
    free -h
    echo
    
    # Storage details
    echo "Storage Details:"
    echo "================"
    df -h
    echo
    
    # Temperature monitoring (if available)
    if command -v sensors >/dev/null 2>&1; then
        echo "Temperature Sensors:"
        echo "==================="
        sensors 2>/dev/null || echo "  No temperature sensors found"
        echo
    fi
}

# Service diagnostics
diagnose_services() {
    log_section "Service Diagnostics"
    
    # Critical system services
    echo "Critical System Services:"
    echo "========================="
    local critical_services=("systemd-resolved" "ssh")
    for service in "${critical_services[@]}"; do
        local status
        status=$(get_service_status "$service")
        case "$status" in
            "running") echo "  $service: ✓ Running" ;;
            "stopped") echo "  $service: ⚠ Stopped" ;;
            "disabled") echo "  $service: ○ Disabled" ;;
        esac
    done
    echo
    
    # DangerPrep services
    echo "DangerPrep Services:"
    echo "===================="
    local dangerprep_services=("adguardhome:AdGuard Home" "step-ca:Step-CA" "tailscaled:Tailscale" "k3s:Olares/K3s")
    for service_info in "${dangerprep_services[@]}"; do
        local service=${service_info%%:*}
        local name=${service_info##*:}
        local status
        status=$(get_service_status "$service")
        case "$status" in
            "running") echo "  $name: ✓ Running" ;;
            "stopped") echo "  $name: ⚠ Stopped" ;;
            "disabled") echo "  $name: ○ Disabled" ;;
        esac
    done
    echo
    
    # Service startup times
    echo "Service Startup Analysis:"
    echo "========================="
    systemd-analyze blame 2>/dev/null | head -10 || echo "  Unable to analyze startup times"
    echo
}

# Performance diagnostics
diagnose_performance() {
    log_section "Performance Diagnostics"
    
    # Current performance metrics
    echo "Current Performance:"
    echo "==================="
    echo "  CPU Usage:         $(get_cpu_usage)%"
    echo "  Memory Usage:      $(get_memory_usage)%"
    echo "  Disk Usage:        $(get_disk_usage)%"
    echo "  Load Average:      $(get_load_average)"
    echo
    
    # Top processes by CPU
    echo "Top CPU Processes:"
    echo "=================="
    ps aux --sort=-%cpu | head -6
    echo
    
    # Top processes by memory
    echo "Top Memory Processes:"
    echo "===================="
    ps aux --sort=-%mem | head -6
    echo
    
    # Disk I/O (if iostat is available)
    if command -v iostat >/dev/null 2>&1; then
        echo "Disk I/O Statistics:"
        echo "==================="
        iostat -x 1 1 2>/dev/null || echo "  Unable to get I/O statistics"
        echo
    fi
    
    # System health score
    local health_score
    health_score=$(calculate_system_health_score)
    echo "System Health Score: ${health_score}/100"
    echo
}

# Network diagnostics
diagnose_network() {
    log_section "Network Diagnostics"
    
    # Network interfaces
    echo "Network Interfaces:"
    echo "==================="
    ip -br addr show
    echo
    
    # Routing table
    echo "Routing Table:"
    echo "=============="
    ip route show
    echo
    
    # DNS configuration
    echo "DNS Configuration:"
    echo "=================="
    if [[ -f /etc/resolv.conf ]]; then
        cat /etc/resolv.conf
    else
        echo "  No DNS configuration found"
    fi
    echo
    
    # Connectivity tests
    echo "Connectivity Tests:"
    echo "=================="
    if test_internet_connectivity; then
        echo "  Internet:          ✓ Connected"
    else
        echo "  Internet:          ✗ No connection"
    fi
    
    # Tailscale status
    local ts_status
    ts_status=$(get_tailscale_status)
    echo "  Tailscale:         $ts_status"
    echo
}

# Storage diagnostics
diagnose_storage() {
    log_section "Storage Diagnostics"
    
    # Disk usage by filesystem
    echo "Filesystem Usage:"
    echo "================="
    df -h
    echo
    
    # Inode usage
    echo "Inode Usage:"
    echo "============"
    df -i
    echo
    
    # Largest directories
    echo "Largest Directories (Top 10):"
    echo "============================="
    du -h / 2>/dev/null | sort -hr | head -10 || echo "  Unable to analyze directory sizes"
    echo
    
    # Check for disk errors (if smartctl is available)
    if command -v smartctl >/dev/null 2>&1; then
        echo "SMART Disk Health:"
        echo "=================="
        local disks
        disks=$(lsblk -d -o NAME | grep -E '^[a-z]+$' | head -3)
        for disk in $disks; do
            echo "  /dev/$disk:"
            smartctl -H "/dev/$disk" 2>/dev/null | grep -E "(SMART overall-health|PASSED|FAILED)" || echo "    Unable to check SMART status"
        done
        echo
    fi
}

# Security diagnostics
diagnose_security() {
    log_section "Security Diagnostics"
    
    # Firewall status
    echo "Firewall Status:"
    echo "================"
    if command -v ufw >/dev/null 2>&1; then
        ufw status 2>/dev/null || echo "  UFW not configured"
    elif command -v iptables >/dev/null 2>&1; then
        local iptables_rules
        iptables_rules=$(iptables -L | wc -l)
        echo "  iptables rules:    $iptables_rules"
    else
        echo "  No firewall detected"
    fi
    echo
    
    # SSH configuration
    echo "SSH Security:"
    echo "============="
    if [[ -f /etc/ssh/sshd_config ]]; then
        local ssh_port
        ssh_port=$(grep "^Port" /etc/ssh/sshd_config | awk '{print $2}' || echo "22")
        echo "  SSH Port:          $ssh_port"
        
        local root_login
        root_login=$(grep "^PermitRootLogin" /etc/ssh/sshd_config | awk '{print $2}' || echo "unknown")
        echo "  Root Login:        $root_login"
    fi
    echo
    
    # Failed login attempts
    echo "Recent Failed Logins:"
    echo "===================="
    lastb 2>/dev/null | head -5 || echo "  No failed login records"
    echo
}

# Package diagnostics
diagnose_packages() {
    log_section "Package Diagnostics"

    # Package statistics
    echo "Package Statistics:"
    echo "=================="
    local package_count
    package_count=$(get_package_count)
    echo "  Installed packages: ${package_count}"

    local upgradable_count
    upgradable_count=$(get_upgradable_packages)
    echo "  Available updates:  ${upgradable_count}"
    echo

    # Package manager info
    echo "Package Manager:"
    echo "================"
    if command -v apt >/dev/null 2>&1; then
        echo "  Package Manager:   APT (Debian/Ubuntu)"
        local last_update
        last_update=$(stat -c %Y /var/lib/apt/lists 2>/dev/null | head -1)
        if [[ -n "${last_update}" ]]; then
            local update_date
            update_date=$(date -d "@${last_update}" 2>/dev/null || echo "unknown")
            echo "  Last Update:       ${update_date}"
        fi
    elif command -v yum >/dev/null 2>&1; then
        echo "  Package Manager:   YUM (Red Hat/CentOS)"
    elif command -v pacman >/dev/null 2>&1; then
        echo "  Package Manager:   Pacman (Arch Linux)"
    else
        echo "  Package Manager:   Unknown"
    fi
    echo

    # Show some recent package activity if available
    echo "Recent Package Activity:"
    echo "======================="
    if [[ -f /var/log/apt/history.log ]]; then
        tail -10 /var/log/apt/history.log 2>/dev/null | grep -E "(Install|Remove|Upgrade)" | tail -5 || echo "  No recent activity found"
    elif [[ -f /var/log/yum.log ]]; then
        tail -10 /var/log/yum.log 2>/dev/null | tail -5 || echo "  No recent activity found"
    else
        echo "  Package activity logs not available"
    fi
    echo
}

# Olares/K3s diagnostics
diagnose_olares() {
    log_section "Olares/K3s Diagnostics"
    
    if ! is_k3s_running; then
        warning "K3s is not running"
        return
    fi
    
    # Cluster status
    echo "Cluster Status:"
    echo "==============="
    kubectl get nodes 2>/dev/null || echo "  Unable to get cluster nodes"
    echo
    
    # Pod status
    echo "Pod Status:"
    echo "==========="
    kubectl get pods --all-namespaces 2>/dev/null | head -10 || echo "  Unable to get pod status"
    
    local pod_count
    pod_count=$(get_k3s_pod_count)
    if [[ $pod_count -gt 10 ]]; then
        echo "  ... and $((pod_count - 10)) more pods"
    fi
    echo
    
    # Resource usage
    echo "Resource Usage:"
    echo "==============="
    kubectl top nodes 2>/dev/null || echo "  Metrics server not available"
    echo
    
    # Recent events
    echo "Recent Events:"
    echo "=============="
    kubectl get events --sort-by='.lastTimestamp' 2>/dev/null | tail -5 || echo "  Unable to get events"
    echo
}

# Run all diagnostics
run_all_diagnostics() {
    diagnose_hardware
    diagnose_services
    diagnose_performance
    diagnose_network
    diagnose_storage
    diagnose_security
    diagnose_packages
    diagnose_olares
    
    # Summary
    log_section "Diagnostic Summary"
    local health_score
    health_score=$(calculate_system_health_score)
    echo "Overall System Health: ${health_score}/100"
    echo
    echo "Recommendations:"
    get_system_recommendations | while IFS= read -r recommendation; do
        echo "  • $recommendation"
    done
}

# Main function
main() {
    local command="${1:-all}"

    if [[ "$command" == "help" || "$command" == "--help" || "$command" == "-h" ]]; then
        show_help
        exit 0
    fi

    init_script
    show_banner_with_title "System Diagnostics" "system"

    case "$command" in
        "all")
            run_all_diagnostics
            ;;
        "hardware")
            diagnose_hardware
            ;;
        "services")
            diagnose_services
            ;;
        "performance")
            diagnose_performance
            ;;
        "network")
            diagnose_network
            ;;
        "storage")
            diagnose_storage
            ;;
        "security")
            diagnose_security
            ;;
        "packages")
            diagnose_packages
            ;;
        "olares")
            diagnose_olares
            ;;
        *)
            error "Unknown command: ${command}"
            echo "Use '$0 help' for usage information"
            exit 2
            ;;
    esac
}

# Export functions for use in other scripts
export -f run_all_diagnostics
export -f diagnose_hardware
export -f diagnose_services
export -f diagnose_performance
export -f diagnose_network
export -f diagnose_storage
export -f diagnose_security
export -f diagnose_packages
export -f diagnose_olares

# Run main function only if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
