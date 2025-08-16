#!/usr/bin/env bash
# DangerPrep WAN-to-WiFi Routing Script
#
# Purpose: Configure WAN-to-WiFi routing (Internet via Ethernet, sharing via WiFi hotspot)
# Usage: wan-to-wifi.sh {setup|status}
# Dependencies: dhclient (isc-dhcp-client), ip (iproute2), iptables, hostapd, dnsmasq, systemctl (systemd)
# Author: DangerPrep Project
# Version: 1.0

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_NAME=""
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"
readonly SCRIPT_NAME

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

readonly SCRIPT_VERSION="1.0"
readonly SCRIPT_DESCRIPTION="WAN-to-WiFi Routing Configuration"

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
WAN_INTERFACE="${WAN_INTERFACE:-eth0}"
WIFI_INTERFACE="${WIFI_INTERFACE:-wlan0}"
LAN_IP="192.168.120.1"

setup_wan_to_wifi() {
    set_error_context "WAN-to-WiFi setup"

    # Validate required commands
    require_commands dhclient ip iptables hostapd dnsmasq systemctl

    show_banner_with_title "WAN-to-WiFi Routing" "network"
    echo

    log_section "Setting up WAN-to-WiFi routing: Ethernet WAN to WiFi Hotspot"

    # Validate required commands
    require_commands dhclient ip iptables systemctl

    # Validate root permissions
    validate_root_user

    # Validate interfaces exist
    if [[ ! -d "/sys/class/net/${WAN_INTERFACE}" ]]; then
        error "WAN interface does not exist: ${WAN_INTERFACE}"
        exit 1
    fi

    if [[ ! -d "/sys/class/net/${WIFI_INTERFACE}" ]]; then
        error "WiFi interface does not exist: ${WIFI_INTERFACE}"
        exit 1
    fi

    # Configure WAN interface for DHCP
    set_current_operation "Configuring WAN interface: ${WAN_INTERFACE}"
    info "Configuring WAN interface: ${WAN_INTERFACE}"
    safe_execute 3 2 dhclient "${WAN_INTERFACE}"

    # Configure WiFi interface as hotspot
    set_current_operation "Configuring WiFi hotspot: ${WIFI_INTERFACE}"
    info "Configuring WiFi hotspot: ${WIFI_INTERFACE}"
    safe_execute 1 0 ip link set "${WIFI_INTERFACE}" up
    safe_execute 1 0 ip addr add "${LAN_IP}/22" dev "${WIFI_INTERFACE}"

    # Enable IP forwarding
    set_current_operation "Enabling IP forwarding"
    info "Enabling IP forwarding"
    echo 1 > /proc/sys/net/ipv4/ip_forward

    # Configure NAT
    set_current_operation "Configuring NAT rules"
    info "Configuring NAT rules"
    safe_execute 1 0 iptables -t nat -F
    safe_execute 1 0 iptables -t nat -A POSTROUTING -o "${WAN_INTERFACE}" -j MASQUERADE
    safe_execute 1 0 iptables -A FORWARD -i "${WIFI_INTERFACE}" -o "${WAN_INTERFACE}" -j ACCEPT
    safe_execute 1 0 iptables -A FORWARD -i "${WAN_INTERFACE}" -o "${WIFI_INTERFACE}" -m state --state RELATED,ESTABLISHED -j ACCEPT

    # Start services
    set_current_operation "Starting network services"
    info "Starting hostapd and dnsmasq services"
    safe_execute 3 2 systemctl start hostapd
    safe_execute 3 2 systemctl start dnsmasq

    success "WAN-to-WiFi routing configured successfully"
    info "WAN: ${WAN_INTERFACE} (DHCP)"
    info "WiFi Hotspot: ${WIFI_INTERFACE} (${LAN_IP})"

    clear_error_context
    clear_current_operation
}

show_status() {
    set_error_context "Status display"

    log_section "WAN-to-WiFi Status: Ethernet WAN to WiFi Hotspot"

    log_subsection "WAN Interface (${WAN_INTERFACE})"
    if ip addr show "${WAN_INTERFACE}" >/dev/null 2>&1; then
        ip addr show "${WAN_INTERFACE}" | grep inet || info "No IP address assigned"
    else
        warning "WAN interface not found: ${WAN_INTERFACE}"
    fi

    echo
    log_subsection "WiFi Interface (${WIFI_INTERFACE})"
    if ip addr show "${WIFI_INTERFACE}" >/dev/null 2>&1; then
        ip addr show "${WIFI_INTERFACE}" | grep inet || info "No IP address assigned"
    else
        warning "WiFi interface not found: ${WIFI_INTERFACE}"
    fi

    echo
    log_subsection "Routing Table"
    ip route

    echo
    log_subsection "NAT Rules"
    if iptables -t nat -L POSTROUTING -n >/dev/null 2>&1; then
        iptables -t nat -L POSTROUTING -n
    else
        warning "Unable to display NAT rules (may require root privileges)"
    fi

    echo
    log_subsection "Services Status"
    for service in hostapd dnsmasq; do
        if systemctl is-active "$service" >/dev/null 2>&1; then
            success "$service: active"
        else
            warning "$service: inactive"
        fi
    done

    clear_error_context
}

show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [COMMAND]

Commands:
    setup       Configure WAN-to-WiFi routing
    status      Show current routing status
    help        Show this help message

Description:
    Configures Internet sharing from Ethernet WAN to WiFi hotspot.
    Requires root privileges and proper network interface configuration.

Examples:
    $0 setup    # Configure routing
    $0 status   # Show current status

Exit Codes:
    0   Success
    1   General error
    2   Invalid arguments
EOF
}

# Initialize script
init_script() {
    set_log_file "/var/log/dangerprep-wan-to-wifi.log"
    debug "WAN-to-WiFi script initialized"
}

# Main execution
main() {
    # Initialize
    init_script

    # Parse command
    local command
    command=${1:-setup}

    case "$command" in
        setup)
            setup_wan_to_wifi
            ;;
        status)
            show_status
            ;;
        help|--help|-h)
            show_help
            exit 0
            ;;
        *)
            error "Unknown command: $command"
            error "Use '$0 help' for usage information"
            exit 2
            ;;
    esac
}

# Execute main function
main "$@"
