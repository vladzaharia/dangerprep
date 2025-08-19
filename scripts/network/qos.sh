#!/usr/bin/env bash
# DangerPrep QoS and Traffic Shaping Management

# Modern shell script best practices
set -euo pipefail

# Script metadata
NETWORK_QOS_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${NETWORK_QOS_SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/errors.sh
source "${NETWORK_QOS_SCRIPT_DIR}/../shared/errors.sh"
# shellcheck source=../shared/validation.sh
source "${NETWORK_QOS_SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${NETWORK_QOS_SCRIPT_DIR}/../shared/banner.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-qos.log"
WAN_INTERFACE="${WAN_INTERFACE:-eth0}"
WIFI_INTERFACE="${WIFI_INTERFACE:-wlan0}"
UPLOAD_LIMIT="50mbit"    # Adjust based on your connection
# DOWNLOAD_LIMIT is used in QoS configuration
export DOWNLOAD_LIMIT="100mbit" # Adjust based on your connection

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "QoS manager failed with exit code ${exit_code}"

    # Clear any partial QoS rules
    tc qdisc del dev "${WAN_INTERFACE}" root 2>/dev/null || true

    error "Cleanup completed"
    exit "${exit_code}"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate root permissions for QoS operations
    validate_root_user

    # Validate required commands
    require_commands tc ip

    # Load configuration if available
    if [[ -f /etc/dangerprep/interfaces.conf ]]; then
        # shellcheck source=/dev/null
        source /etc/dangerprep/interfaces.conf
    fi

    debug "QoS manager initialized"
    clear_error_context
}

setup_qos() {
    set_error_context "QoS setup"

    log "Setting up QoS on ${WAN_INTERFACE}..."

    # Clear existing rules
    tc qdisc del dev "${WAN_INTERFACE}" root 2>/dev/null || true

    # Create root qdisc
    tc qdisc add dev "${WAN_INTERFACE}" root handle 1: htb default 30

    # Create main class
    tc class add dev "${WAN_INTERFACE}" parent 1: classid 1:1 htb rate "${UPLOAD_LIMIT}"

    # High priority class (SSH, DNS, ICMP)
    tc class add dev "${WAN_INTERFACE}" parent 1:1 classid 1:10 htb rate 10mbit ceil "${UPLOAD_LIMIT}" prio 1

    # Medium priority class (HTTP/HTTPS)
    tc class add dev "${WAN_INTERFACE}" parent 1:1 classid 1:20 htb rate 20mbit ceil "${UPLOAD_LIMIT}" prio 2

    # Low priority class (everything else)
    tc class add dev "${WAN_INTERFACE}" parent 1:1 classid 1:30 htb rate 10mbit ceil "${UPLOAD_LIMIT}" prio 3

    # Add fair queuing to each class
    tc qdisc add dev "${WAN_INTERFACE}" parent 1:10 handle 10: sfq perturb 10
    tc qdisc add dev "${WAN_INTERFACE}" parent 1:20 handle 20: sfq perturb 10
    tc qdisc add dev "${WAN_INTERFACE}" parent 1:30 handle 30: sfq perturb 10

    # Create filters for traffic classification
    # High priority: SSH (port 2222), DNS (port 53), ICMP
    tc filter add dev "${WAN_INTERFACE}" parent 1: protocol ip prio 1 u32 match ip dport 2222 0xffff flowid 1:10
    tc filter add dev "${WAN_INTERFACE}" parent 1: protocol ip prio 1 u32 match ip dport 53 0xffff flowid 1:10
    tc filter add dev "${WAN_INTERFACE}" parent 1: protocol ip prio 1 u32 match ip protocol 1 0xff flowid 1:10

    # Medium priority: HTTP/HTTPS
    tc filter add dev "${WAN_INTERFACE}" parent 1: protocol ip prio 2 u32 match ip dport 80 0xffff flowid 1:20
    tc filter add dev "${WAN_INTERFACE}" parent 1: protocol ip prio 2 u32 match ip dport 443 0xffff flowid 1:20

    success "QoS configured on ${WAN_INTERFACE}"
    clear_error_context
}

remove_qos() {
    set_error_context "QoS removal"

    log "Removing QoS from ${WAN_INTERFACE}..."
    tc qdisc del dev "${WAN_INTERFACE}" root 2>/dev/null || true
    success "QoS removed from ${WAN_INTERFACE}"
    clear_error_context
}

show_qos() {
    echo "QoS Status for ${WAN_INTERFACE}:"
    tc qdisc show dev "${WAN_INTERFACE}"
    echo
    echo "QoS Classes:"
    tc class show dev "${WAN_INTERFACE}"
    echo
    echo "QoS Filters:"
    tc filter show dev "${WAN_INTERFACE}"
}

# Main function
main() {
    # Initialize script
    init_script

    # Show banner for QoS operations
    if [[ "${1:-}" != "help" && "${1:-}" != "--help" && "${1:-}" != "-h" ]]; then
        show_banner_with_title "QoS Manager" "network"
        echo
    fi

    case "${1:-}" in
        setup)
            setup_qos
            ;;
        remove)
            remove_qos
            ;;
        status)
            show_qos
            ;;
        help|--help|-h)
            echo "DangerPrep QoS Management"
            echo "Usage: $0 {setup|remove|status|help}"
            echo
            echo "Commands:"
            echo "  setup    - Configure QoS traffic shaping"
            echo "  remove   - Remove QoS configuration"
            echo "  status   - Show current QoS status"
            echo "  help     - Show this help message"
            exit 0
            ;;
        *)
            echo "DangerPrep QoS Management"
            echo "Usage: $0 {setup|remove|status|help}"
            echo
            echo "Commands:"
            echo "  setup    - Configure QoS traffic shaping"
            echo "  remove   - Remove QoS configuration"
            echo "  status   - Show current QoS status"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
