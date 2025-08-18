#!/usr/bin/env bash
# DangerPrep System Optimization
# Performance tuning and system optimization
# Usage: system-optimization.sh {command} [options]
# Dependencies: systemctl, sysctl
# Author: DangerPrep Project
# Version: 1.0

set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


# Source shared utilities
source "${SCRIPT_DIR}/../../shared/logging.sh"
source "${SCRIPT_DIR}/../../shared/errors.sh"
source "${SCRIPT_DIR}/../../shared/validation.sh"
source "${SCRIPT_DIR}/../../shared/banner.sh"
source "${SCRIPT_DIR}/../../shared/state/system.sh"
source "${SCRIPT_DIR}/../../shared/system.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-system-optimization.log"

# Cleanup function
cleanup_on_error() {
    local exit_code=$?
    error "System optimization failed with exit code $exit_code"
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    trap cleanup_on_error ERR
    validate_root_user
    require_commands systemctl sysctl
    debug "System optimization initialized"
    clear_error_context
}

# Show help
show_help() {
    cat << 'EOF'
DangerPrep System Optimization - Performance Tuning

USAGE:
    system-optimization.sh {command} [options]

COMMANDS:
    all                 Run all optimization tasks (default)
    memory              Memory optimization and cleanup
    disk                Disk cleanup and optimization
    network             Network performance tuning
    services            Service optimization
    kernel              Kernel parameter tuning
    packages            Package management optimization
    analyze             Analyze system for optimization opportunities

EXAMPLES:
    system-optimization.sh all         # Run all optimizations
    system-optimization.sh memory      # Memory optimization only
    system-optimization.sh analyze     # Analyze optimization opportunities

NOTE: This script requires root privileges for system modifications.

EOF
}

# Memory optimization
optimize_memory() {
    log_section "Memory Optimization"
    
    # Clear page cache, dentries and inodes
    log "Clearing system caches..."
    sync
    echo 3 > /proc/sys/vm/drop_caches
    success "System caches cleared"
    
    # Optimize swappiness for server workload
    local current_swappiness
    current_swappiness=$(cat /proc/sys/vm/swappiness)
    if [[ $current_swappiness -gt 10 ]]; then
        log "Optimizing swappiness (current: $current_swappiness)..."
        echo 10 > /proc/sys/vm/swappiness
        echo "vm.swappiness = 10" >> /etc/sysctl.conf
        success "Swappiness optimized to 10"
    fi
    
    # Optimize dirty ratio for better I/O performance
    log "Optimizing dirty page ratios..."
    echo 15 > /proc/sys/vm/dirty_ratio
    echo 5 > /proc/sys/vm/dirty_background_ratio
    echo "vm.dirty_ratio = 15" >> /etc/sysctl.conf
    echo "vm.dirty_background_ratio = 5" >> /etc/sysctl.conf
    success "Dirty page ratios optimized"
    
    # Show memory usage after optimization
    local memory_usage
    memory_usage=$(get_memory_usage)
    log "Memory usage after optimization: ${memory_usage}%"
}

# Disk optimization
optimize_disk() {
    log_section "Disk Optimization"
    
    # Clean package cache
    log "Cleaning package cache..."
    apt autoremove -y >/dev/null 2>&1
    apt autoclean >/dev/null 2>&1
    success "Package cache cleaned"
    
    # Clean journal logs
    log "Cleaning journal logs..."
    if command -v journalctl >/dev/null 2>&1; then
        journalctl --vacuum-time=7d >/dev/null 2>&1 || true
        journalctl --vacuum-size=100M >/dev/null 2>&1 || true
        success "Journal logs cleaned"
    fi

    # Clean temporary files
    log "Cleaning temporary files..."
    find /tmp -type f -atime +7 -delete 2>/dev/null || true
    find /var/tmp -type f -atime +7 -delete 2>/dev/null || true
    success "Temporary files cleaned"
    
    # Optimize I/O scheduler for SSDs (if applicable)
    for disk in /sys/block/*/queue/scheduler; do
        if [[ -f "$disk" ]]; then
            local disk_name
            disk_name=$(echo "$disk" | cut -d'/' -f4)
            
            # Check if it's an SSD
            local rotational
            rotational=$(cat "/sys/block/$disk_name/queue/rotational" 2>/dev/null || echo "1")
            
            if [[ "$rotational" == "0" ]]; then
                log "Optimizing I/O scheduler for SSD: $disk_name"
                echo "mq-deadline" > "$disk" 2>/dev/null || true
            fi
        fi
    done
    
    # Show disk usage after optimization
    local disk_usage
    disk_usage=$(get_disk_usage)
    log "Disk usage after optimization: ${disk_usage}%"
}

# Network optimization
optimize_network() {
    log_section "Network Optimization"
    
    # TCP optimization for better performance
    log "Optimizing TCP parameters..."
    
    # Increase TCP buffer sizes
    sysctl -w net.core.rmem_max=16777216 >/dev/null
    sysctl -w net.core.wmem_max=16777216 >/dev/null
    sysctl -w net.ipv4.tcp_rmem="4096 65536 16777216" >/dev/null
    sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216" >/dev/null
    
    # Enable TCP window scaling
    sysctl -w net.ipv4.tcp_window_scaling=1 >/dev/null
    
    # Enable TCP timestamps
    sysctl -w net.ipv4.tcp_timestamps=1 >/dev/null
    
    # Optimize TCP congestion control
    sysctl -w net.ipv4.tcp_congestion_control=bbr >/dev/null 2>&1 || true
    
    # Make changes persistent
    cat >> /etc/sysctl.conf << 'EOF'
# Network optimizations
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 65536 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_timestamps = 1
EOF
    
    success "Network parameters optimized"
}

# Service optimization
optimize_services() {
    log_section "Service Optimization"

    # Restart services to apply optimizations
    log "Restarting key services..."

    # Restart K3s if running
    if is_service_running "k3s"; then
        systemctl restart k3s
        success "K3s restarted"

        # Wait for K3s to be ready
        local max_wait=60
        local wait_time=0
        while [[ ${wait_time} -lt ${max_wait} ]]; do
            if kubectl get nodes >/dev/null 2>&1; then
                success "K3s is ready"
                break
            fi
            sleep 5
            wait_time=$((wait_time + 5))
        done
    fi

    # Optimize systemd services
    log "Optimizing systemd configuration..."
    systemctl daemon-reload
    success "Systemd configuration reloaded"
}

# Kernel parameter optimization
optimize_kernel() {
    log_section "Kernel Optimization"
    
    # File descriptor limits
    log "Optimizing file descriptor limits..."
    echo "fs.file-max = 2097152" >> /etc/sysctl.conf
    sysctl -w fs.file-max=2097152 >/dev/null
    
    # Process limits
    echo "kernel.pid_max = 4194304" >> /etc/sysctl.conf
    sysctl -w kernel.pid_max=4194304 >/dev/null
    
    # Virtual memory optimization
    echo "vm.max_map_count = 262144" >> /etc/sysctl.conf
    sysctl -w vm.max_map_count=262144 >/dev/null
    
    # Network connection tracking
    echo "net.netfilter.nf_conntrack_max = 1048576" >> /etc/sysctl.conf
    sysctl -w net.netfilter.nf_conntrack_max=1048576 >/dev/null 2>&1 || true
    
    success "Kernel parameters optimized"
}

# Package optimization
optimize_packages() {
    log_section "Package Optimization"

    # Update package cache
    log "Updating package cache..."
    if command -v apt >/dev/null 2>&1; then
        apt update >/dev/null 2>&1 || true
        success "APT package cache updated"
    elif command -v yum >/dev/null 2>&1; then
        yum makecache >/dev/null 2>&1 || true
        success "YUM package cache updated"
    fi

    # Clean package cache
    log "Cleaning package cache..."
    if command -v apt >/dev/null 2>&1; then
        apt autoremove -y >/dev/null 2>&1 || true
        apt autoclean >/dev/null 2>&1 || true
        success "APT cache cleaned"
    elif command -v yum >/dev/null 2>&1; then
        yum clean all >/dev/null 2>&1 || true
        success "YUM cache cleaned"
    fi

    # Show package statistics
    local package_count
    package_count=$(get_package_count)
    local upgradable_count
    upgradable_count=$(get_upgradable_packages)

    log "Package statistics:"
    log "  Installed packages: ${package_count}"
    log "  Available updates:  ${upgradable_count}"
}

# Analyze system for optimization opportunities
analyze_optimization() {
    log_section "Optimization Analysis"
    
    local recommendations=()
    
    # Memory analysis
    local memory_usage
    memory_usage=$(get_memory_usage)
    if (( $(echo "$memory_usage > 80" | bc -l) )); then
        recommendations+=("High memory usage (${memory_usage}%) - consider memory optimization")
    fi
    
    # Disk analysis
    local disk_usage
    disk_usage=$(get_disk_usage)
    if [[ $disk_usage -gt 80 ]]; then
        recommendations+=("High disk usage (${disk_usage}%) - consider disk cleanup")
    fi
    
    # CPU analysis
    local cpu_usage
    cpu_usage=$(get_cpu_usage)
    if (( $(echo "$cpu_usage > 80" | bc -l) )); then
        recommendations+=("High CPU usage (${cpu_usage}%) - check for resource-intensive processes")
    fi
    
    # Package analysis
    local upgradable_count
    upgradable_count=$(get_upgradable_packages)
    if [[ ${upgradable_count} -gt 20 ]]; then
        recommendations+=("Many package updates available (${upgradable_count}) - consider updating packages")
    fi
    
    # Swap analysis
    local swap_usage
    swap_usage=$(free | awk '/^Swap:/ {if ($2 > 0) printf "%.1f", $3*100/$2; else print "0"}')
    if (( $(echo "$swap_usage > 50" | bc -l) )); then
        recommendations+=("High swap usage (${swap_usage}%) - consider adding more RAM")
    fi
    
    # Load average analysis
    local load_avg
    load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local cpu_cores
    cpu_cores=$(nproc)
    if (( $(echo "$load_avg > $cpu_cores" | bc -l) )); then
        recommendations+=("High load average ($load_avg) exceeds CPU cores ($cpu_cores)")
    fi
    
    # Display recommendations
    if [[ ${#recommendations[@]} -eq 0 ]]; then
        success "System is well optimized - no major issues found"
    else
        echo "Optimization Recommendations:"
        printf '%s\n' "${recommendations[@]}" | while IFS= read -r recommendation; do
            echo "  • $recommendation"
        done
    fi
    
    # Show current system health
    local health_score
    health_score=$(calculate_system_health_score)
    echo
    echo "Current System Health Score: ${health_score}/100"
}

# Run all optimizations
run_all_optimizations() {
    optimize_memory
    optimize_disk
    optimize_network
    optimize_services
    optimize_kernel
    optimize_packages
    
    # Apply all sysctl changes
    sysctl -p >/dev/null 2>&1
    
    log_section "Optimization Complete"
    
    # Show improvement
    local new_health_score
    new_health_score=$(calculate_system_health_score)
    success "System optimization completed"
    log "New system health score: ${new_health_score}/100"
    
    # Update system state
    set_system_health_score "$new_health_score"
    update_maintenance_status "$(date -Iseconds)" "$(date -d '+1 week' -Iseconds)"
}

# Main function
main() {
    local command="${1:-all}"

    if [[ "$command" == "help" || "$command" == "--help" || "$command" == "-h" ]]; then
        show_help
        exit 0
    fi

    init_script
    show_banner_with_title "System Optimization" "system"

    case "$command" in
        "all")
            run_all_optimizations
            ;;
        "memory")
            optimize_memory
            ;;
        "disk")
            optimize_disk
            ;;
        "network")
            optimize_network
            ;;
        "services")
            optimize_services
            ;;
        "kernel")
            optimize_kernel
            ;;
        "packages")
            optimize_packages
            ;;
        "analyze")
            analyze_optimization
            ;;
        *)
            error "Unknown command: ${command}"
            echo "Use '$0 help' for usage information"
            exit 2
            ;;
    esac
}

main "$@"
