#!/usr/bin/env bash
# DangerPrep System Functions Library
# Common system utilities and helper functions
# Author: DangerPrep Project
# Version: 1.0

# Prevent multiple sourcing
if [[ "${SYSTEM_SHARED_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SYSTEM_SHARED_LOADED="true"

# System information functions
get_system_info() {
    echo "System Information:"
    echo "=================="
    echo "  Hostname:          $(hostname)"
    echo "  OS:                $(lsb_release -d 2>/dev/null | cut -f2 || uname -s)"
    echo "  Kernel:            $(uname -r)"
    echo "  Architecture:      $(uname -m)"
    echo "  Uptime:            $(uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}')"
    
    # Hardware info
    if [[ -f /proc/cpuinfo ]]; then
        local cpu_model
        cpu_model=$(grep "model name" /proc/cpuinfo | head -1 | cut -d':' -f2 | xargs)
        echo "  CPU:               $cpu_model"
    fi
    
    # Memory info
    local total_mem
    total_mem=$(free -h | awk '/^Mem:/ {print $2}')
    echo "  Total Memory:      $total_mem"
    
    # Storage info
    local root_disk
    root_disk=$(df -h / | awk 'NR==2 {print $2}')
    echo "  Root Disk:         $root_disk"
}

# Performance metrics collection
get_cpu_usage() {
    # Get CPU usage percentage (1-minute average)
    local cpu_usage
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//' 2>/dev/null)
    if [[ -z "$cpu_usage" ]]; then
        # Fallback method
        cpu_usage=$(grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}' 2>/dev/null)
    fi
    printf "%.1f" "${cpu_usage:-0}"
}

get_memory_usage() {
    # Get memory usage percentage
    free | awk 'NR==2{printf "%.1f", $3*100/$2}'
}

get_disk_usage() {
    # Get root disk usage percentage
    df / | awk 'NR==2{print $5}' | sed 's/%//'
}

get_load_average() {
    # Get system load average
    uptime | awk -F'load average:' '{print $2}' | xargs
}

# Service management functions
is_service_running() {
    local service="$1"
    systemctl is-active --quiet "$service" 2>/dev/null
}

is_service_enabled() {
    local service="$1"
    systemctl is-enabled --quiet "$service" 2>/dev/null
}

get_service_status() {
    local service="$1"
    
    if is_service_running "$service"; then
        echo "running"
    elif is_service_enabled "$service"; then
        echo "stopped"
    else
        echo "disabled"
    fi
}

# Package management functions
get_package_count() {
    if command -v dpkg >/dev/null 2>&1; then
        dpkg -l | grep -c "^ii" 2>/dev/null || echo "0"
    elif command -v rpm >/dev/null 2>&1; then
        rpm -qa | wc -l 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

get_upgradable_packages() {
    if command -v apt >/dev/null 2>&1; then
        apt list --upgradable 2>/dev/null | grep -c "upgradable" || echo "0"
    elif command -v yum >/dev/null 2>&1; then
        yum check-update -q 2>/dev/null | wc -l || echo "0"
    else
        echo "0"
    fi
}

# Kubernetes/Olares functions
is_k3s_running() {
    systemctl is-active --quiet k3s 2>/dev/null
}

is_kubectl_available() {
    command -v kubectl >/dev/null 2>&1 && kubectl get nodes >/dev/null 2>&1
}

get_k3s_node_count() {
    if is_kubectl_available; then
        kubectl get nodes --no-headers 2>/dev/null | wc -l
    else
        echo "0"
    fi
}

get_k3s_pod_count() {
    if is_kubectl_available; then
        kubectl get pods --all-namespaces --no-headers 2>/dev/null | wc -l
    else
        echo "0"
    fi
}

# Network connectivity functions
test_internet_connectivity() {
    local test_hosts=("8.8.8.8" "1.1.1.1" "208.67.222.222")
    
    for host in "${test_hosts[@]}"; do
        if ping -c 1 -W 3 "$host" >/dev/null 2>&1; then
            return 0
        fi
    done
    
    return 1
}

get_primary_ip() {
    ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || echo "unknown"
}

get_tailscale_status() {
    if command -v tailscale >/dev/null 2>&1; then
        tailscale status --json 2>/dev/null | jq -r '.BackendState' 2>/dev/null || echo "unknown"
    else
        echo "not_installed"
    fi
}

# System health assessment functions
calculate_system_health_score() {
    local score=100
    
    # CPU usage impact (0-30 points deduction)
    local cpu_usage
    cpu_usage=$(get_cpu_usage)
    if (( $(echo "$cpu_usage > 90" | bc -l) )); then
        score=$((score - 30))
    elif (( $(echo "$cpu_usage > 70" | bc -l) )); then
        score=$((score - 20))
    elif (( $(echo "$cpu_usage > 50" | bc -l) )); then
        score=$((score - 10))
    fi
    
    # Memory usage impact (0-25 points deduction)
    local memory_usage
    memory_usage=$(get_memory_usage)
    if (( $(echo "$memory_usage > 90" | bc -l) )); then
        score=$((score - 25))
    elif (( $(echo "$memory_usage > 80" | bc -l) )); then
        score=$((score - 15))
    elif (( $(echo "$memory_usage > 70" | bc -l) )); then
        score=$((score - 10))
    fi
    
    # Disk usage impact (0-25 points deduction)
    local disk_usage
    disk_usage=$(get_disk_usage)
    if [[ $disk_usage -gt 95 ]]; then
        score=$((score - 25))
    elif [[ $disk_usage -gt 85 ]]; then
        score=$((score - 15))
    elif [[ $disk_usage -gt 75 ]]; then
        score=$((score - 10))
    fi
    
    # Service status impact (0-20 points deduction)
    local critical_services=("systemd-resolved" "ssh")
    local failed_services=0
    for service in "${critical_services[@]}"; do
        if ! is_service_running "$service"; then
            ((failed_services++))
        fi
    done
    score=$((score - (failed_services * 10)))
    
    # Ensure score doesn't go below 0
    if [[ $score -lt 0 ]]; then
        score=0
    fi
    
    echo "$score"
}

get_system_health_status() {
    local score
    score=$(calculate_system_health_score)
    
    if [[ $score -ge 90 ]]; then
        echo "excellent"
    elif [[ $score -ge 75 ]]; then
        echo "good"
    elif [[ $score -ge 60 ]]; then
        echo "fair"
    elif [[ $score -ge 40 ]]; then
        echo "poor"
    else
        echo "critical"
    fi
}

# System optimization recommendations
get_system_recommendations() {
    local recommendations=()
    
    # Check CPU usage
    local cpu_usage
    cpu_usage=$(get_cpu_usage)
    if (( $(echo "$cpu_usage > 80" | bc -l) )); then
        recommendations+=("High CPU usage detected - consider identifying resource-intensive processes")
    fi
    
    # Check memory usage
    local memory_usage
    memory_usage=$(get_memory_usage)
    if (( $(echo "$memory_usage > 85" | bc -l) )); then
        recommendations+=("High memory usage detected - consider restarting services or adding more RAM")
    fi
    
    # Check disk usage
    local disk_usage
    disk_usage=$(get_disk_usage)
    if [[ $disk_usage -gt 80 ]]; then
        recommendations+=("High disk usage detected - consider cleaning up old files or expanding storage")
    fi
    
    # Check for package updates
    local upgradable_count
    upgradable_count=$(get_upgradable_packages)
    if [[ ${upgradable_count} -gt 10 ]]; then
        recommendations+=("Many package updates available (${upgradable_count}) - consider running system updates")
    fi
    
    # Check internet connectivity
    if ! test_internet_connectivity; then
        recommendations+=("No internet connectivity - check network configuration")
    fi
    
    # Output recommendations
    if [[ ${#recommendations[@]} -eq 0 ]]; then
        echo "No recommendations - system is running well"
    else
        printf '%s\n' "${recommendations[@]}"
    fi
}

# File and directory utilities
ensure_directory() {
    local dir="$1"
    local mode="${2:-755}"
    
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        chmod "$mode" "$dir"
    fi
}

safe_file_operation() {
    local operation="$1"
    local file="$2"
    shift 2
    
    case "$operation" in
        "backup")
            if [[ -f "$file" ]]; then
                cp "$file" "${file}.backup.$(date +%Y%m%d_%H%M%S)"
            fi
            ;;
        "restore")
            local backup_file="$1"
            if [[ -f "$backup_file" ]]; then
                cp "$backup_file" "$file"
            fi
            ;;
        *)
            return 1
            ;;
    esac
}

# Logging and notification functions
log_system_event() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date -Iseconds)
    
    echo "[$timestamp] [$level] $message" >> "/var/log/dangerprep-system-events.log"
}

# System validation functions
validate_system_requirements() {
    local requirements_met=true
    
    # Check required commands
    local required_commands=("systemctl" "jq" "curl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            echo "Missing required command: $cmd"
            requirements_met=false
        fi
    done
    
    # Check minimum disk space (5GB)
    local available_space
    available_space=$(df / | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 5242880 ]]; then  # 5GB in KB
        echo "Insufficient disk space - minimum 5GB required"
        requirements_met=false
    fi
    
    # Check minimum memory (1GB)
    local total_memory
    total_memory=$(free | awk 'NR==2{print $2}')
    if [[ $total_memory -lt 1048576 ]]; then  # 1GB in KB
        echo "Insufficient memory - minimum 1GB required"
        requirements_met=false
    fi

    $requirements_met
}

# Export functions for use in other scripts
export -f get_system_info
export -f get_cpu_usage
export -f get_memory_usage
export -f get_disk_usage
export -f get_load_average
export -f is_service_running
export -f is_service_enabled
export -f get_service_status
export -f get_package_count
export -f get_upgradable_packages
export -f is_k3s_running
export -f is_kubectl_available
export -f get_k3s_node_count
export -f get_k3s_pod_count
export -f test_internet_connectivity
export -f get_primary_ip
export -f get_tailscale_status
export -f calculate_system_health_score
export -f get_system_health_status
export -f get_system_recommendations
export -f ensure_directory
export -f safe_file_operation
export -f log_system_event
export -f validate_system_requirements
