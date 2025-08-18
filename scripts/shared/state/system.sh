#!/usr/bin/env bash
# DangerPrep System State Management
# Centralized system state tracking and management
# Author: DangerPrep Project
# Version: 1.0

# This file is sourced by other scripts - no direct execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    echo "Error: This file should be sourced, not executed directly"
    exit 1
fi

# System state configuration
SYSTEM_STATE_DIR="/var/lib/dangerprep"
SYSTEM_STATE_FILE="${SYSTEM_STATE_DIR}/system-state.json"
SYSTEM_LOCK_FILE="/var/run/dangerprep-system.lock"
readonly SYSTEM_LOCK_TIMEOUT=30

# Ensure state directory exists
ensure_system_state_dir() {
    if [[ ! -d "${SYSTEM_STATE_DIR}" ]]; then
        if ! mkdir -p "${SYSTEM_STATE_DIR}" 2>/dev/null; then
            # Fallback to user's home directory if we can't create system directory
            SYSTEM_STATE_DIR="${HOME}/.dangerprep"
            SYSTEM_STATE_FILE="${SYSTEM_STATE_DIR}/system-state.json"
            SYSTEM_LOCK_FILE="${HOME}/.dangerprep-system.lock"
            mkdir -p "${SYSTEM_STATE_DIR}" 2>/dev/null || return 1
        fi
        chmod 755 "${SYSTEM_STATE_DIR}" 2>/dev/null || true
    fi
}

# Initialize system state file if it doesn't exist
init_system_state() {
    ensure_system_state_dir
    
    if [[ ! -f "$SYSTEM_STATE_FILE" ]]; then
        cat > "$SYSTEM_STATE_FILE" << 'EOF'
{
  "version": "1.0",
  "last_update": "",
  "system_mode": "NORMAL",
  "auto_mode_enabled": false,
  "services": {
    "olares": {
      "status": "unknown",
      "last_check": "",
      "health_score": 0
    },
    "host_services": {
      "status": "unknown",
      "last_check": "",
      "health_score": 0
    }
  },
  "system_health": {
    "overall_score": 0,
    "last_assessment": "",
    "issues": [],
    "recommendations": []
  },
  "maintenance": {
    "last_run": "",
    "next_scheduled": "",
    "auto_maintenance": false
  },
  "performance": {
    "cpu_usage": 0,
    "memory_usage": 0,
    "disk_usage": 0,
    "load_average": "0.0 0.0 0.0",
    "last_check": ""
  },
  "backup": {
    "last_backup": "",
    "backup_status": "unknown",
    "auto_backup": false
  }
}
EOF
        chmod 644 "$SYSTEM_STATE_FILE"
    fi
}

# Lock management for atomic operations
acquire_system_lock() {
    local timeout="${1:-$SYSTEM_LOCK_TIMEOUT}"
    local count=0
    
    while [[ $count -lt $timeout ]]; do
        if (set -C; echo $$ > "$SYSTEM_LOCK_FILE") 2>/dev/null; then
            return 0
        fi
        sleep 1
        ((count++))
    done
    
    return 1
}

release_system_lock() {
    if [[ -f "$SYSTEM_LOCK_FILE" ]]; then
        rm -f "$SYSTEM_LOCK_FILE"
    fi
}

# Get system state value
get_system_state() {
    local key="$1"
    local default="${2:-null}"
    
    init_system_state
    
    if [[ -f "$SYSTEM_STATE_FILE" ]]; then
        jq -r ".$key // \"$default\"" "$SYSTEM_STATE_FILE" 2>/dev/null || echo "$default"
    else
        echo "$default"
    fi
}

# Set system state value
set_system_state() {
    local key="$1"
    local value="$2"
    
    init_system_state
    
    if ! acquire_system_lock; then
        return 1
    fi
    
    local temp_file
    temp_file=$(mktemp)
    
    if jq ".$key = \"$value\" | .last_update = \"$(date -Iseconds)\"" "$SYSTEM_STATE_FILE" > "$temp_file"; then
        mv "$temp_file" "$SYSTEM_STATE_FILE"
        release_system_lock
        return 0
    else
        rm -f "$temp_file"
        release_system_lock
        return 1
    fi
}

# Update system state object (for complex updates)
update_system_state() {
    local key="$1"
    local json_value="$2"
    
    init_system_state
    
    if ! acquire_system_lock; then
        return 1
    fi
    
    local temp_file
    temp_file=$(mktemp)
    
    if jq ".$key = $json_value | .last_update = \"$(date -Iseconds)\"" "$SYSTEM_STATE_FILE" > "$temp_file"; then
        mv "$temp_file" "$SYSTEM_STATE_FILE"
        release_system_lock
        return 0
    else
        rm -f "$temp_file"
        release_system_lock
        return 1
    fi
}

# System mode management
get_system_mode() {
    get_system_state "system_mode" "NORMAL"
}

set_system_mode() {
    local mode="$1"
    set_system_state "system_mode" "$mode"
}

# Auto mode management
is_system_auto_mode_enabled() {
    local auto_mode
    auto_mode=$(get_system_state "auto_mode_enabled" "false")
    [[ "$auto_mode" == "true" ]]
}

enable_system_auto_mode() {
    set_system_state "auto_mode_enabled" "true"
}

disable_system_auto_mode() {
    set_system_state "auto_mode_enabled" "false"
}

# Service status management
get_service_status() {
    local service="$1"
    get_system_state "services.$service.status" "unknown"
}

set_service_status() {
    local service="$1"
    local status="$2"
    local timestamp
    timestamp=$(date -Iseconds)
    
    local service_data
    service_data=$(jq -n --arg status "$status" --arg timestamp "$timestamp" '{
        status: $status,
        last_check: $timestamp
    }')
    
    update_system_state "services.$service" "$service_data"
}

# System health management
get_system_health_score() {
    get_system_state "system_health.overall_score" "0"
}

set_system_health_score() {
    local score="$1"
    local timestamp
    timestamp=$(date -Iseconds)
    
    local health_data
    health_data=$(jq -n --arg score "$score" --arg timestamp "$timestamp" '{
        overall_score: ($score | tonumber),
        last_assessment: $timestamp
    }')
    
    update_system_state "system_health" "$health_data"
}

# Performance metrics management
update_system_performance() {
    local cpu_usage="$1"
    local memory_usage="$2"
    local disk_usage="$3"
    local load_average="$4"
    local timestamp
    timestamp=$(date -Iseconds)
    
    local performance_data
    performance_data=$(jq -n \
        --arg cpu "$cpu_usage" \
        --arg memory "$memory_usage" \
        --arg disk "$disk_usage" \
        --arg load "$load_average" \
        --arg timestamp "$timestamp" '{
        cpu_usage: ($cpu | tonumber),
        memory_usage: ($memory | tonumber),
        disk_usage: ($disk | tonumber),
        load_average: $load,
        last_check: $timestamp
    }')
    
    update_system_state "performance" "$performance_data"
}

# Maintenance tracking
update_maintenance_status() {
    local last_run="$1"
    local next_scheduled="$2"
    
    local maintenance_data
    maintenance_data=$(jq -n \
        --arg last_run "$last_run" \
        --arg next_scheduled "$next_scheduled" '{
        last_run: $last_run,
        next_scheduled: $next_scheduled
    }')
    
    update_system_state "maintenance" "$maintenance_data"
}

# Backup status management
update_backup_status() {
    local last_backup="$1"
    local status="$2"
    
    local backup_data
    backup_data=$(jq -n \
        --arg last_backup "$last_backup" \
        --arg status "$status" '{
        last_backup: $last_backup,
        backup_status: $status
    }')
    
    update_system_state "backup" "$backup_data"
}

# Get full system state
get_full_system_state() {
    init_system_state
    cat "$SYSTEM_STATE_FILE" 2>/dev/null || echo "{}"
}

# System state validation
validate_system_state() {
    init_system_state
    
    if [[ -f "$SYSTEM_STATE_FILE" ]]; then
        jq empty "$SYSTEM_STATE_FILE" 2>/dev/null
    else
        return 1
    fi
}

# Cleanup old state data
cleanup_system_state() {
    if [[ -f "$SYSTEM_LOCK_FILE" ]]; then
        local lock_pid
        lock_pid=$(cat "$SYSTEM_LOCK_FILE" 2>/dev/null)
        if [[ -n "$lock_pid" ]] && ! kill -0 "$lock_pid" 2>/dev/null; then
            rm -f "$SYSTEM_LOCK_FILE"
        fi
    fi
}

# Initialize on source
init_system_state
