#!/usr/bin/env bash
# DangerPrep Suricata IDS Monitoring
# Real-time monitoring and alerting for Suricata IDS

# Modern shell script best practices

# Prevent multiple sourcing
if [[ "${SECURITY_HELPERS_INTRUSION_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SECURITY_HELPERS_INTRUSION_LOADED="true"

set -euo pipefail

# Script metadata


# Source shared utilities
# shellcheck source=../../shared/logging.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/logging.sh"
# shellcheck source=../../shared/errors.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/errors.sh"
# shellcheck source=../../shared/validation.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/validation.sh"
# shellcheck source=../../shared/banner.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../../shared/banner.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-suricata-monitor.log"
readonly SURICATA_LOG="/var/log/suricata/eve.json"
readonly ALERT_LOG="/var/log/dangerprep-suricata-alerts.log"
readonly ALERT_THRESHOLD=5  # Number of alerts in time window to trigger notification
readonly TIME_WINDOW=3600   # Time window in seconds (1 hour)

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Suricata monitor failed with exit code ${exit_code}"

    # No specific cleanup needed for monitoring

    error "Cleanup completed"
    exit "${exit_code}"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate required commands
    require_commands jq tail logger

    debug "Suricata monitor initialized"
    clear_error_context
}

# Check for recent Suricata alerts
check_suricata_alerts() {
    set_error_context "Suricata alert checking"

    if [[ ! -f "${SURICATA_LOG}" ]]; then
        warning "Suricata log file not found: ${SURICATA_LOG}"
        return 0
    fi

    log "Checking for recent Suricata alerts..."

    # Check for recent alerts (last hour)
    local recent_alerts
    recent_alerts=$(tail -1000 "${SURICATA_LOG}" | jq -r 'select(.event_type=="alert") | select(.timestamp > (now - '"${TIME_WINDOW}"' | strftime("%Y-%m-%dT%H:%M:%S"))) | .alert.signature' 2>/dev/null | wc -l)

    if [[ "${recent_alerts}" -gt 0 ]]; then
        warning "${recent_alerts} new IDS alerts detected in the last hour"
        echo "[$(date)] ${recent_alerts} new IDS alerts detected" >> "${ALERT_LOG}"
        logger -t "SURICATA-ALERT" -p security.warning "${recent_alerts} new IDS alerts detected"

        if [[ "${recent_alerts}" -ge "${ALERT_THRESHOLD}" ]]; then
            error "High number of alerts detected (${recent_alerts} >= ${ALERT_THRESHOLD})"
            logger -t "SURICATA-ALERT" -p security.alert "High number of IDS alerts: ${recent_alerts}"
        fi
    else
        success "No recent IDS alerts detected"
    fi

    clear_error_context
}

# Main function
main() {
    # Initialize script
    init_script

    show_banner_with_title "Suricata IDS Monitor" "security"
    echo

    check_suricata_alerts
}

# Run main function

# Export functions for use in other scripts
export -f cleanup_on_errornexport -f init_scriptnexport -f check_suricata_alertsn
# Run main function only if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
