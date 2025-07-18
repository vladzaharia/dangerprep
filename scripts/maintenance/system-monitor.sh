#!/bin/bash
# DangerPrep System Monitor
# Comprehensive system health monitoring and alerting

set -e

LOG_FILE="/var/log/dangerprep-monitor.log"
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEMORY=85
ALERT_THRESHOLD_DISK=90
ALERT_THRESHOLD_TEMP=75

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: $1" >> "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1" >> "$LOG_FILE"
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
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local load_avg=$(cat /proc/loadavg | cut -d' ' -f1-3)
    
    echo "--- CPU Information ---"
    echo "CPU Usage: ${cpu_usage}%"
    echo "Load Average: $load_avg"
    
    # Check CPU threshold
    if (( $(echo "$cpu_usage > $ALERT_THRESHOLD_CPU" | bc -l) )); then
        warning "High CPU usage detected: ${cpu_usage}%"
    fi
    echo
}

get_memory_info() {
    local mem_info=$(free -h)
    local mem_usage=$(free | grep Mem | awk '{printf("%.1f"), $3/$2 * 100.0}')
    
    echo "--- Memory Information ---"
    echo "$mem_info"
    echo "Memory Usage: ${mem_usage}%"
    
    # Check memory threshold
    if (( $(echo "$mem_usage > $ALERT_THRESHOLD_MEMORY" | bc -l) )); then
        warning "High memory usage detected: ${mem_usage}%"
    fi
    echo
}

get_disk_info() {
    echo "--- Disk Information ---"
    df -h | grep -E "(^/dev|^tmpfs)" | while read line; do
        echo "$line"
        local usage=$(echo "$line" | awk '{print $5}' | sed 's/%//')
        local mount=$(echo "$line" | awk '{print $6}')
        
        if [[ $usage -gt $ALERT_THRESHOLD_DISK ]]; then
            warning "High disk usage on $mount: ${usage}%"
        fi
    done
    echo
}

get_temperature_info() {
    echo "--- Temperature Information ---"
    if [[ -f /sys/class/thermal/thermal_zone0/temp ]]; then
        local temp=$(($(cat /sys/class/thermal/thermal_zone0/temp) / 1000))
        echo "CPU Temperature: ${temp}°C"
        
        if [[ $temp -gt $ALERT_THRESHOLD_TEMP ]]; then
            warning "High CPU temperature detected: ${temp}°C"
        fi
    else
        echo "Temperature monitoring not available"
    fi
    echo
}

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
        if tailscale status | grep -q "100.65.182.27"; then
            success "Tailscale NAS connectivity: OK"
        else
            warning "Tailscale NAS connectivity: FAILED"
        fi
    else
        warning "Tailscale not installed"
    fi
    
    # Network interfaces
    echo "Active interfaces:"
    ip -brief addr show | grep UP
    echo
}

get_docker_info() {
    echo "--- Docker Services ---"
    
    if command -v docker > /dev/null 2>&1; then
        local running_containers=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep -v NAMES)
        
        if [[ -n "$running_containers" ]]; then
            echo "$running_containers"
            
            # Check for unhealthy containers
            local unhealthy=$(docker ps --filter "health=unhealthy" --format "{{.Names}}")
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
        local nvme_health=$(smartctl -H /dev/nvme0n1 | grep "overall-health")
        echo "NVMe Health: $nvme_health"
    fi
    
    # Check for filesystem errors
    local fs_errors=$(dmesg | grep -i "error\|fail" | tail -5)
    if [[ -n "$fs_errors" ]]; then
        warning "Recent filesystem errors detected"
        echo "$fs_errors"
    fi
    echo
}

# Service-specific health checks
check_service_health() {
    echo "--- Service Health Checks ---"
    
    local services=($(docker ps --format "{{.Names}}" | sort))

    if [ ${#services[@]} -eq 0 ]; then
        warning "No services currently running"
        return 0
    fi

    for service in "${services[@]}"; do
        local status=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "no-healthcheck")
        local state=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "unknown")

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
        get_temperature_info
        get_network_info
        get_docker_info
        get_storage_health
        check_service_health
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

# Main script logic
case "$1" in
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
