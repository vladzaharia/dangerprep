#!/usr/bin/env bash
# DangerPrep System Intelligence
# Automated decision making and system intelligence functions
# Author: DangerPrep Project
# Version: 1.0

# This file is sourced by other scripts - no direct execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Error: This file should be sourced, not executed directly"
    exit 1
fi

# System intelligence configuration
readonly SYSTEM_HEALTH_THRESHOLD_CRITICAL=40
readonly SYSTEM_HEALTH_THRESHOLD_WARNING=60
readonly SYSTEM_HEALTH_THRESHOLD_GOOD=80

readonly CPU_THRESHOLD_HIGH=80
readonly MEMORY_THRESHOLD_HIGH=85
readonly DISK_THRESHOLD_HIGH=85

# System mode definitions
readonly SYSTEM_MODE_NORMAL="NORMAL"
readonly SYSTEM_MODE_AUTO="AUTO"
readonly SYSTEM_MODE_MAINTENANCE="MAINTENANCE"
readonly SYSTEM_MODE_EMERGENCY="EMERGENCY"

# Intelligent system evaluation
evaluate_system_health() {
    local health_score
    health_score=$(calculate_system_health_score)
    
    # Update system state with current health
    set_system_health_score "$health_score"
    
    # Determine system status based on health score
    if [[ $health_score -ge $SYSTEM_HEALTH_THRESHOLD_GOOD ]]; then
        echo "healthy"
    elif [[ $health_score -ge $SYSTEM_HEALTH_THRESHOLD_WARNING ]]; then
        echo "warning"
    elif [[ $health_score -ge $SYSTEM_HEALTH_THRESHOLD_CRITICAL ]]; then
        echo "critical"
    else
        echo "emergency"
    fi
}

# Intelligent service management
should_restart_service() {
    local service="$1"
    local service_status
    service_status=$(get_service_status "$service")
    
    # Only restart if service should be running but isn't
    if [[ "$service_status" == "stopped" ]] && is_service_enabled "$service"; then
        return 0
    fi
    
    return 1
}

# Automatic service recovery
auto_recover_services() {
    local recovered_services=()
    
    # Critical services that should always be running
    local critical_services=("systemd-resolved")
    
    for service in "${critical_services[@]}"; do
        if should_restart_service "$service"; then
            log "Auto-recovering service: $service"
            if systemctl start "$service" >/dev/null 2>&1; then
                recovered_services+=("$service")
                log_system_event "INFO" "Auto-recovered service: $service"
            else
                log_system_event "ERROR" "Failed to auto-recover service: $service"
            fi
        fi
    done
    
    # DangerPrep services
    local dangerprep_services=("adguardhome" "step-ca" "k3s")
    
    for service in "${dangerprep_services[@]}"; do
        if should_restart_service "$service"; then
            log "Auto-recovering DangerPrep service: $service"
            if systemctl start "$service" >/dev/null 2>&1; then
                recovered_services+=("$service")
                log_system_event "INFO" "Auto-recovered DangerPrep service: $service"
            else
                log_system_event "ERROR" "Failed to auto-recover DangerPrep service: $service"
            fi
        fi
    done
    
    if [[ ${#recovered_services[@]} -gt 0 ]]; then
        log "Auto-recovered services: ${recovered_services[*]}"
        return 0
    fi
    
    return 1
}

# Intelligent resource management
should_optimize_system() {
    local cpu_usage
    cpu_usage=$(get_cpu_usage)
    local memory_usage
    memory_usage=$(get_memory_usage)
    local disk_usage
    disk_usage=$(get_disk_usage)
    
    # Check if any resource is above threshold
    if (( $(echo "$cpu_usage > $CPU_THRESHOLD_HIGH" | bc -l) )) || \
       (( $(echo "$memory_usage > $MEMORY_THRESHOLD_HIGH" | bc -l) )) || \
       [[ $disk_usage -gt $DISK_THRESHOLD_HIGH ]]; then
        return 0
    fi
    
    return 1
}

# Automatic system optimization
auto_optimize_system() {
    if ! should_optimize_system; then
        return 1
    fi
    
    log "System resources high - triggering automatic optimization"
    
    # Memory optimization
    local memory_usage
    memory_usage=$(get_memory_usage)
    if (( $(echo "$memory_usage > $MEMORY_THRESHOLD_HIGH" | bc -l) )); then
        log "High memory usage detected - clearing caches"
        sync
        echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
        log_system_event "INFO" "Auto-optimized memory (cleared caches)"
    fi
    
    # Disk optimization
    local disk_usage
    disk_usage=$(get_disk_usage)
    if [[ $disk_usage -gt $DISK_THRESHOLD_HIGH ]]; then
        log "High disk usage detected - cleaning temporary files"
        find /tmp -type f -atime +1 -delete 2>/dev/null || true
        journalctl --vacuum-time=3d >/dev/null 2>&1 || true
        log_system_event "INFO" "Auto-optimized disk (cleaned temporary files)"
    fi
    
    # Package optimization
    local upgradable_count
    upgradable_count=$(get_upgradable_packages)
    if [[ ${upgradable_count} -gt 50 ]]; then
        log "Many package updates available - cleaning package cache"
        if command -v apt >/dev/null 2>&1; then
            apt autoclean >/dev/null 2>&1 || true
        elif command -v yum >/dev/null 2>&1; then
            yum clean all >/dev/null 2>&1 || true
        fi
        log_system_event "INFO" "Auto-optimized packages (cleaned cache)"
    fi
    
    return 0
}

# Intelligent maintenance scheduling
should_run_maintenance() {
    local last_maintenance
    last_maintenance=$(get_system_state "maintenance.last_run" "")
    
    if [[ -z "$last_maintenance" ]]; then
        return 0  # Never run maintenance
    fi
    
    # Check if it's been more than a week since last maintenance
    local last_timestamp
    last_timestamp=$(date -d "$last_maintenance" +%s 2>/dev/null || echo "0")
    local current_timestamp
    current_timestamp=$(date +%s)
    local week_seconds=$((7 * 24 * 3600))
    
    if [[ $((current_timestamp - last_timestamp)) -gt $week_seconds ]]; then
        return 0
    fi
    
    return 1
}

# Automatic maintenance execution
auto_run_maintenance() {
    if ! should_run_maintenance; then
        return 1
    fi
    
    log "Scheduled maintenance due - running automatic maintenance"
    
    # Run basic maintenance tasks
    apt autoremove -y >/dev/null 2>&1 || true
    apt autoclean >/dev/null 2>&1 || true
    journalctl --vacuum-time=7d >/dev/null 2>&1 || true
    
    # Update maintenance timestamp
    update_maintenance_status "$(date -Iseconds)" "$(date -d '+1 week' -Iseconds)"
    
    log_system_event "INFO" "Auto-maintenance completed"
    return 0
}

# System mode management intelligence
determine_system_mode() {
    local current_mode
    current_mode=$(get_system_mode)
    local health_status
    health_status=$(evaluate_system_health)
    
    case "$health_status" in
        "emergency")
            if [[ "$current_mode" != "$SYSTEM_MODE_EMERGENCY" ]]; then
                set_system_mode "$SYSTEM_MODE_EMERGENCY"
                log_system_event "CRITICAL" "System entered emergency mode"
                return 0
            fi
            ;;
        "critical")
            if [[ "$current_mode" == "$SYSTEM_MODE_NORMAL" ]]; then
                set_system_mode "$SYSTEM_MODE_MAINTENANCE"
                log_system_event "WARNING" "System entered maintenance mode due to critical health"
                return 0
            fi
            ;;
        "warning"|"healthy")
            if [[ "$current_mode" == "$SYSTEM_MODE_EMERGENCY" ]] || [[ "$current_mode" == "$SYSTEM_MODE_MAINTENANCE" ]]; then
                if is_system_auto_mode_enabled; then
                    set_system_mode "$SYSTEM_MODE_AUTO"
                else
                    set_system_mode "$SYSTEM_MODE_NORMAL"
                fi
                log_system_event "INFO" "System recovered to normal operation"
                return 0
            fi
            ;;
    esac
    
    return 1
}

# Intelligent system monitoring
monitor_system_changes() {
    local previous_health
    previous_health=$(get_system_state "system_health.overall_score" "0")
    local current_health
    current_health=$(calculate_system_health_score)
    
    # Significant health change detection
    local health_diff
    health_diff=$((current_health - previous_health))
    
    if [[ ${health_diff#-} -gt 20 ]]; then  # Absolute difference > 20
        if [[ $health_diff -gt 0 ]]; then
            log_system_event "INFO" "System health improved significantly: ${previous_health} → ${current_health}"
        else
            log_system_event "WARNING" "System health degraded significantly: ${previous_health} → ${current_health}"
        fi
        return 0
    fi
    
    return 1
}

# Predictive analysis
predict_system_issues() {
    local predictions=()
    
    # Disk space prediction
    local disk_usage
    disk_usage=$(get_disk_usage)
    if [[ $disk_usage -gt 75 ]]; then
        predictions+=("Disk space may become critical within 1-2 weeks")
    fi
    
    # Memory usage trend
    local memory_usage
    memory_usage=$(get_memory_usage)
    if (( $(echo "$memory_usage > 75" | bc -l) )); then
        predictions+=("Memory pressure may cause performance issues")
    fi
    
    # Service failure prediction
    local failed_services=0
    local critical_services=("systemd-resolved" "k3s")
    for service in "${critical_services[@]}"; do
        if ! is_service_running "$service"; then
            ((failed_services++))
        fi
    done
    
    if [[ $failed_services -gt 0 ]]; then
        predictions+=("Service instability detected - system reliability at risk")
    fi
    
    # Package update prediction
    local upgradable_count
    upgradable_count=$(get_upgradable_packages)
    if [[ ${upgradable_count} -gt 30 ]]; then
        predictions+=("Many package updates available - system may have security vulnerabilities")
    fi
    
    # Output predictions
    if [[ ${#predictions[@]} -gt 0 ]]; then
        printf '%s\n' "${predictions[@]}"
        return 0
    fi
    
    return 1
}

# Comprehensive system intelligence evaluation
run_system_intelligence() {
    local actions_taken=()
    
    # Update system performance metrics
    update_system_performance "$(get_cpu_usage)" "$(get_memory_usage)" "$(get_disk_usage)" "$(get_load_average)"
    
    # Evaluate and update system mode
    if determine_system_mode; then
        actions_taken+=("Updated system mode")
    fi
    
    # Monitor for significant changes
    if monitor_system_changes; then
        actions_taken+=("Detected system changes")
    fi
    
    # Auto-recovery if enabled
    if is_system_auto_mode_enabled; then
        if auto_recover_services; then
            actions_taken+=("Auto-recovered services")
        fi

        if auto_optimize_system; then
            actions_taken+=("Auto-optimized system")
        fi

        if auto_run_maintenance; then
            actions_taken+=("Auto-ran maintenance")
        fi
    fi
    
    # Return whether any actions were taken
    if [[ ${#actions_taken[@]} -gt 0 ]]; then
        log "System intelligence actions: ${actions_taken[*]}"
        return 0
    fi
    
    return 1
}

# Emergency response system
handle_system_emergency() {
    local emergency_actions=()
    
    log_system_event "CRITICAL" "System emergency detected - initiating emergency response"
    
    # Stop non-essential services
    local non_essential_services=("adguardhome" "step-ca")
    for service in "${non_essential_services[@]}"; do
        if is_service_running "$service"; then
            systemctl stop "$service" >/dev/null 2>&1 || true
            emergency_actions+=("Stopped $service")
        fi
    done
    
    # Clear all caches
    sync
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    emergency_actions+=("Cleared system caches")
    
    # Clean temporary files aggressively
    find /tmp -type f -delete 2>/dev/null || true
    find /var/tmp -type f -delete 2>/dev/null || true
    emergency_actions+=("Cleaned temporary files")
    
    # Package cache emergency cleanup
    if command -v apt >/dev/null 2>&1; then
        apt autoclean >/dev/null 2>&1 || true
        apt autoremove -y >/dev/null 2>&1 || true
        emergency_actions+=("Emergency package cleanup")
    elif command -v yum >/dev/null 2>&1; then
        yum clean all >/dev/null 2>&1 || true
        emergency_actions+=("Emergency package cleanup")
    fi
    
    log_system_event "INFO" "Emergency actions completed: ${emergency_actions[*]}"
    
    return 0
}

# System intelligence initialization
init_system_intelligence() {
    # Ensure system state is initialized
    init_system_state
    
    # Run initial system evaluation
    evaluate_system_health >/dev/null
    
    # Set initial system mode if not set
    local current_mode
    current_mode=$(get_system_mode)
    if [[ "$current_mode" == "null" || -z "$current_mode" ]]; then
        set_system_mode "$SYSTEM_MODE_NORMAL"
    fi
}

# Initialize on source
init_system_intelligence
