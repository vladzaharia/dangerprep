#!/usr/bin/env bash
# DangerPrep Security State Management
# Centralized security state management for coordination between security components
# Author: DangerPrep Project
# Version: 1.0

# Prevent multiple sourcing
if [[ "${SECURITY_STATE_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SECURITY_STATE_LOADED="true"

# Source dependencies
# shellcheck source=../logging.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../logging.sh"
# shellcheck source=../errors.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../errors.sh"

# Security state configuration
SECURITY_STATE_DIR="/var/lib/dangerprep/security"
readonly SECURITY_STATE_FILE="${SECURITY_STATE_DIR}/security-state.json"
readonly SECURITY_LOCK_FILE="/var/run/dangerprep-security.lock"
readonly SECURITY_LOCK_TIMEOUT=30

# Ensure security state directory exists
ensure_security_state_dir() {
    if [[ ! -d "$SECURITY_STATE_DIR" ]]; then
        mkdir -p "$SECURITY_STATE_DIR" 2>/dev/null || true
        chmod 700 "$SECURITY_STATE_DIR" 2>/dev/null || true
    fi
}

# Initialize security state file
init_security_state() {
    ensure_security_state_dir
    
    if [[ ! -f "$SECURITY_STATE_FILE" ]]; then
        local initial_state
        initial_state='{
  "version": "1.0",
  "last_update": "'$(date -Iseconds)'",
  "security_tools": {
    "aide": {
      "status": "unknown",
      "last_check": null,
      "database_initialized": false
    },
    "clamav": {
      "status": "unknown",
      "last_scan": null,
      "definitions_updated": null
    },
    "lynis": {
      "status": "unknown",
      "last_audit": null,
      "hardening_index": null
    },
    "rkhunter": {
      "status": "unknown",
      "last_scan": null,
      "database_updated": null
    },
    "fail2ban": {
      "status": "unknown",
      "active_bans": 0
    }
  },
  "security_status": {
    "overall_score": 0,
    "last_full_audit": null,
    "critical_issues": 0,
    "warnings": 0
  },
  "certificates": {
    "step_ca_status": "unknown",
    "certificates_count": 0,
    "expiring_soon": 0
  },
  "secrets": {
    "last_generated": null,
    "secrets_count": 0
  },
  "monitoring": {
    "suricata_status": "unknown",
    "last_alert": null,
    "alert_count_24h": 0
  }
}'
        echo "$initial_state" > "$SECURITY_STATE_FILE"
        chmod 600 "$SECURITY_STATE_FILE"
    fi
}

# Acquire lock for state operations
acquire_security_lock() {
    local timeout="${1:-$SECURITY_LOCK_TIMEOUT}"
    local count=0
    
    while [[ $count -lt $timeout ]]; do
        if (set -C; echo $$ > "$SECURITY_LOCK_FILE") 2>/dev/null; then
            return 0
        fi
        sleep 1
        ((count++))
    done
    
    return 1
}

# Release lock
release_security_lock() {
    rm -f "$SECURITY_LOCK_FILE" 2>/dev/null || true
}

# Get security state value
get_security_state() {
    local key="$1"
    local default="${2:-null}"
    
    init_security_state
    
    if [[ ! -f "$SECURITY_STATE_FILE" ]]; then
        echo "$default"
        return 1
    fi
    
    jq -r ".$key // \"$default\"" "$SECURITY_STATE_FILE" 2>/dev/null || echo "$default"
}

# Set security state value
set_security_state() {
    local key="$1"
    local value="$2"
    
    init_security_state
    
    if ! acquire_security_lock; then
        error "Failed to acquire security state lock"
        return 1
    fi
    
    local temp_file
    temp_file="$(mktemp)"
    
    # Update the state with new value and timestamp
    jq ".$key = \"$value\" | .last_update = \"$(date -Iseconds)\"" "$SECURITY_STATE_FILE" > "$temp_file" 2>/dev/null
    
    if jq empty "$SECURITY_STATE_FILE" 2>/dev/null; then
        mv "$temp_file" "$SECURITY_STATE_FILE"
        chmod 600 "$SECURITY_STATE_FILE"
        release_security_lock
        return 0
    else
        rm -f "$temp_file"
        release_security_lock
        return 1
    fi
}

# Update security tool status
update_security_tool_status() {
    local tool="$1"
    local status="$2"
    local additional_data="${3:-}"
    
    init_security_state
    
    if ! acquire_security_lock; then
        error "Failed to acquire security state lock"
        return 1
    fi
    
    local temp_file
    temp_file="$(mktemp)"
    
    local jq_filter
    jq_filter=".security_tools.$tool.status = \"$status\" | .security_tools.$tool.last_check = \"$(date -Iseconds)\" | .last_update = \"$(date -Iseconds)\""
    
    # Add additional data if provided
    if [[ -n "$additional_data" ]]; then
        case "$tool" in
            "aide")
                if [[ "$additional_data" == "database_initialized" ]]; then
                    jq_filter="$jq_filter | .security_tools.$tool.database_initialized = true"
                fi
                ;;
            "clamav")
                if [[ "$additional_data" =~ ^scan_completed ]]; then
                    jq_filter="$jq_filter | .security_tools.$tool.last_scan = \"$(date -Iseconds)\""
                elif [[ "$additional_data" == "definitions_updated" ]]; then
                    jq_filter="$jq_filter | .security_tools.$tool.definitions_updated = \"$(date -Iseconds)\""
                fi
                ;;
            "lynis")
                if [[ "$additional_data" =~ ^hardening_index: ]]; then
                    local hardening_index="${additional_data#hardening_index:}"
                    jq_filter="$jq_filter | .security_tools.$tool.hardening_index = $hardening_index | .security_tools.$tool.last_audit = \"$(date -Iseconds)\""
                fi
                ;;
            "rkhunter")
                if [[ "$additional_data" == "database_updated" ]]; then
                    jq_filter="$jq_filter | .security_tools.$tool.database_updated = \"$(date -Iseconds)\""
                elif [[ "$additional_data" == "scan_completed" ]]; then
                    jq_filter="$jq_filter | .security_tools.$tool.last_scan = \"$(date -Iseconds)\""
                fi
                ;;
        esac
    fi
    
    if jq "$jq_filter" "$SECURITY_STATE_FILE" > "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$SECURITY_STATE_FILE"
        chmod 600 "$SECURITY_STATE_FILE"
        release_security_lock
        return 0
    else
        rm -f "$temp_file"
        release_security_lock
        return 1
    fi
}

# Update overall security status
update_security_status() {
    local score="$1"
    local critical_issues="${2:-0}"
    local warnings="${3:-0}"
    
    init_security_state
    
    if ! acquire_security_lock; then
        error "Failed to acquire security state lock"
        return 1
    fi
    
    local temp_file
    temp_file="$(mktemp)"
    
    if jq ".security_status.overall_score = $score | .security_status.critical_issues = $critical_issues | .security_status.warnings = $warnings | .security_status.last_full_audit = \"$(date -Iseconds)\" | .last_update = \"$(date -Iseconds)\"" "$SECURITY_STATE_FILE" > "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$SECURITY_STATE_FILE"
        chmod 600 "$SECURITY_STATE_FILE"
        release_security_lock
        return 0
    else
        rm -f "$temp_file"
        release_security_lock
        return 1
    fi
}

# Update certificate status
update_certificate_status() {
    local step_ca_status="$1"
    local cert_count="${2:-0}"
    local expiring_count="${3:-0}"
    
    init_security_state
    
    if ! acquire_security_lock; then
        error "Failed to acquire security state lock"
        return 1
    fi
    
    local temp_file
    temp_file="$(mktemp)"
    
    if jq ".certificates.step_ca_status = \"$step_ca_status\" | .certificates.certificates_count = $cert_count | .certificates.expiring_soon = $expiring_count | .last_update = \"$(date -Iseconds)\"" "$SECURITY_STATE_FILE" > "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$SECURITY_STATE_FILE"
        chmod 600 "$SECURITY_STATE_FILE"
        release_security_lock
        return 0
    else
        rm -f "$temp_file"
        release_security_lock
        return 1
    fi
}

# Update secrets status
update_secrets_status() {
    local secrets_count="$1"
    
    init_security_state
    
    if ! acquire_security_lock; then
        error "Failed to acquire security state lock"
        return 1
    fi
    
    local temp_file
    temp_file="$(mktemp)"
    
    if jq ".secrets.last_generated = \"$(date -Iseconds)\" | .secrets.secrets_count = $secrets_count | .last_update = \"$(date -Iseconds)\"" "$SECURITY_STATE_FILE" > "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$SECURITY_STATE_FILE"
        chmod 600 "$SECURITY_STATE_FILE"
        release_security_lock
        return 0
    else
        rm -f "$temp_file"
        release_security_lock
        return 1
    fi
}

# Update monitoring status
update_monitoring_status() {
    local suricata_status="$1"
    local alert_count="${2:-0}"
    
    init_security_state
    
    if ! acquire_security_lock; then
        error "Failed to acquire security state lock"
        return 1
    fi
    
    local temp_file
    temp_file="$(mktemp)"
    
    local jq_filter
    jq_filter=".monitoring.suricata_status = \"$suricata_status\" | .monitoring.alert_count_24h = $alert_count | .last_update = \"$(date -Iseconds)\""
    
    if [[ "$alert_count" -gt 0 ]]; then
        jq_filter="$jq_filter | .monitoring.last_alert = \"$(date -Iseconds)\""
    fi
    
    if jq "$jq_filter" "$SECURITY_STATE_FILE" > "$temp_file" 2>/dev/null; then
        mv "$temp_file" "$SECURITY_STATE_FILE"
        chmod 600 "$SECURITY_STATE_FILE"
        release_security_lock
        return 0
    else
        rm -f "$temp_file"
        release_security_lock
        return 1
    fi
}

# Get security summary
get_security_summary() {
    init_security_state
    
    if [[ ! -f "$SECURITY_STATE_FILE" ]]; then
        echo "Security state not initialized"
        return 1
    fi
    
    local summary
    summary=$(jq -r '
        "Security Status Summary:",
        "  Overall Score: " + (.security_status.overall_score | tostring) + "%",
        "  Critical Issues: " + (.security_status.critical_issues | tostring),
        "  Warnings: " + (.security_status.warnings | tostring),
        "  Last Full Audit: " + (.security_status.last_full_audit // "Never"),
        "",
        "Security Tools:",
        "  AIDE: " + .security_tools.aide.status,
        "  ClamAV: " + .security_tools.clamav.status,
        "  Lynis: " + .security_tools.lynis.status,
        "  RKHunter: " + .security_tools.rkhunter.status,
        "  Fail2ban: " + .security_tools.fail2ban.status,
        "",
        "Certificates:",
        "  Step-CA: " + .certificates.step_ca_status,
        "  Total Certificates: " + (.certificates.certificates_count | tostring),
        "  Expiring Soon: " + (.certificates.expiring_soon | tostring),
        "",
        "Monitoring:",
        "  Suricata: " + .monitoring.suricata_status,
        "  Alerts (24h): " + (.monitoring.alert_count_24h | tostring),
        "",
        "Last Update: " + .last_update
    ' "$SECURITY_STATE_FILE" 2>/dev/null)
    
    echo "$summary"
}

# Export security state as JSON
export_security_state() {
    init_security_state
    
    if [[ -f "$SECURITY_STATE_FILE" ]]; then
        cat "$SECURITY_STATE_FILE"
    else
        echo "{}"
    fi
}

# Export functions for use in other scripts
export -f ensure_security_state_dir
export -f init_security_state
export -f acquire_security_lock
export -f release_security_lock
export -f get_security_state
export -f set_security_state
export -f update_security_tool_status
export -f update_security_status
export -f update_certificate_status
export -f update_secrets_status
export -f update_monitoring_status
export -f get_security_summary
export -f export_security_state

# Initialize security state on load
init_security_state
