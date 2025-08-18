#!/usr/bin/env bash
# DangerPrep Intelligent Network Controller
#
# Purpose: High-level intelligent network management with automatic mode switching
# Usage: network-manager.sh {command} [options]
# Dependencies: state/network.sh, intelligence/network.sh, network.sh
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
readonly SCRIPT_DESCRIPTION="Intelligent Network Controller"

# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/errors.sh
source "${SCRIPT_DIR}/../shared/errors.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"
# shellcheck source=../shared/hardware.sh
source "${SCRIPT_DIR}/../shared/hardware.sh"
# shellcheck source=../shared/network.sh
source "${SCRIPT_DIR}/../shared/network.sh"
# shellcheck source=../shared/state/network.sh
source "${SCRIPT_DIR}/../shared/state/network.sh"
# shellcheck source=../shared/intelligence/network.sh
source "${SCRIPT_DIR}/../shared/intelligence/network.sh"

# Configuration
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-network-manager.log"

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Network controller failed with exit code $exit_code"
    
    # Release any locks
    release_network_lock 2>/dev/null || true
    
    error "Cleanup completed"
    exit $exit_code
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"
    
    # Set up error handling
    trap cleanup_on_error ERR
    
    # Validate required commands
    require_commands ip iptables systemctl jq
    
    # Detect hardware platform
    detect_hardware_platform
    
    # Initialize network state system
    init_network_state
    
    debug "Network controller initialized"
    clear_error_context
}

# Show network status
show_status() {
    set_error_context "Status display"
    
    log_section "Network Controller Status"
    
    # Show network state summary
    get_network_state_summary
    
    echo
    echo "=== Interface Connectivity ==="
    local interfaces
    interfaces=$(ip link show | grep -E "^[0-9]+: " | cut -d: -f2 | tr -d ' ' | grep -v "^lo$")
    
    for interface in $interfaces; do
        local role
        role=$(get_interface_role "$interface")
        local has_internet
        has_internet=$(get_interface_connectivity "$interface" "has_internet")
        local ip_address
        ip_address=$(get_interface_connectivity "$interface" "ip_address")
        
        printf "%-12s %-15s %-8s %s\n" "$interface" "$role" "$has_internet" "$ip_address"
    done
    
    echo
    echo "=== Service Status ==="
    local services=("hostapd" "dnsmasq")
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            printf "%-12s %s\n" "$service" "Running"
        else
            printf "%-12s %s\n" "$service" "Stopped"
        fi
    done
    
    clear_error_context
}

# Enable automatic network management
enable_auto_mode() {
    set_error_context "Auto mode enable"
    
    log_section "Enabling Automatic Network Management"
    
    set_auto_mode "true"
    
    # Force immediate evaluation
    force_network_evaluation
    
    success "Automatic network management enabled"
    clear_error_context
}

# Disable automatic network management
disable_auto_mode() {
    set_error_context "Auto mode disable"
    
    log_section "Disabling Automatic Network Management"
    
    set_auto_mode "false"
    
    info "Automatic network management disabled"
    info "Network configuration will remain in current state"
    clear_error_context
}

# Force network evaluation
force_evaluation() {
    set_error_context "Force evaluation"
    
    log_section "Forcing Network Evaluation"
    
    force_network_evaluation
    
    success "Network evaluation completed"
    clear_error_context
}

# Set WAN interface manually
set_wan_interface() {
    local interface="$1"
    local priority="${2:-primary}"
    
    set_error_context "Manual WAN interface setting"
    
    log_section "Setting WAN Interface"
    
    validate_interface "$interface" "WAN interface"
    
    info "Setting $interface as $priority WAN interface"
    
    case "$priority" in
        primary)
            set_interface_role "$interface" "$ROLE_WAN_PRIMARY"
            ;;
        secondary)
            set_interface_role "$interface" "$ROLE_WAN_SECONDARY"
            ;;
        available)
            set_interface_role "$interface" "$ROLE_WAN_AVAILABLE"
            ;;
        *)
            error "Invalid WAN priority: $priority (use: primary, secondary, available)"
            clear_error_context
            return 1
            ;;
    esac
    
    # Update connectivity status
    scan_single_interface_connectivity "$interface"
    
    # Trigger evaluation if auto mode is enabled
    if is_auto_mode_enabled; then
        force_network_evaluation
    fi
    
    success "WAN interface $interface set as $priority"
    clear_error_context
}

# Clear WAN interface designation
clear_wan_interface() {
    local interface="$1"
    
    set_error_context "WAN interface clearing"
    
    log_section "Clearing WAN Interface"
    
    info "Clearing WAN designation for $interface"
    
    clear_interface_role "$interface"
    
    # Trigger evaluation if auto mode is enabled
    if is_auto_mode_enabled; then
        force_network_evaluation
    fi
    
    success "WAN designation cleared for $interface"
    clear_error_context
}

# Connect to WiFi with automatic WAN designation
wifi_connect() {
    local ssid="$1"
    local password="$2"
    local interface="${3:-wlan0}"
    
    set_error_context "WiFi connection"
    
    log_section "Connecting to WiFi"
    
    validate_interface "$interface" "WiFi interface"
    
    info "Connecting to WiFi: $ssid on $interface"
    
    # Use wifi-manager to connect
    if [[ -f "${SCRIPT_DIR}/wifi-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/wifi-manager.sh" connect "$ssid" "$password" "$interface"
    else
        error "WiFi manager not found: ${SCRIPT_DIR}/wifi-manager.sh"
        clear_error_context
        return 1
    fi
    
    # Handle WiFi connection event
    handle_wifi_connection "$interface" "$ssid" "false"
    
    success "WiFi connection completed"
    clear_error_context
}

# Disconnect from WiFi
wifi_disconnect() {
    local interface="${1:-wlan0}"
    
    set_error_context "WiFi disconnection"
    
    log_section "Disconnecting from WiFi"
    
    info "Disconnecting WiFi interface: $interface"
    
    # Use wifi-manager to disconnect
    if [[ -f "${SCRIPT_DIR}/wifi-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/wifi-manager.sh" disconnect "$interface"
    else
        warning "WiFi manager not found, using basic disconnection"
        ip link set "$interface" down 2>/dev/null || true
    fi
    
    # Handle WiFi disconnection event
    handle_wifi_disconnection "$interface"
    
    success "WiFi disconnection completed"
    clear_error_context
}

# Start WiFi repeater mode
wifi_repeater_start() {
    local upstream_ssid="$1"
    local upstream_password="$2"
    local interface="${3:-wlan0}"
    
    set_error_context "WiFi repeater start"
    
    log_section "Starting WiFi Repeater"
    
    info "Starting WiFi repeater: $upstream_ssid on $interface"
    
    # TODO: Implement WiFi repeater functionality
    # For now, use existing script if available
    if [[ -f "${SCRIPT_DIR}/wifi-repeater.sh" ]]; then
        UPSTREAM_SSID="$upstream_ssid" UPSTREAM_PASSWORD="$upstream_password" \
            bash "${SCRIPT_DIR}/wifi-repeater.sh" setup
    else
        error "WiFi repeater functionality not yet implemented"
        error "Use the existing wifi-repeater.sh script for now"
        clear_error_context
        return 1
    fi
    
    # Handle WiFi connection event (repeater mode)
    handle_wifi_connection "$interface" "$upstream_ssid" "true"
    
    success "WiFi repeater started"
    clear_error_context
}

# Stop WiFi repeater mode
wifi_repeater_stop() {
    local interface="${1:-wlan0}"
    
    set_error_context "WiFi repeater stop"
    
    log_section "Stopping WiFi Repeater"
    
    info "Stopping WiFi repeater on $interface"
    
    # Stop repeater services
    stop_network_services hostapd wpa_supplicant
    
    # Handle WiFi disconnection event
    handle_wifi_disconnection "$interface"
    
    success "WiFi repeater stopped"
    clear_error_context
}

# Force local-only mode
force_local_only() {
    set_error_context "Force local-only mode"
    
    log_section "Forcing Local-Only Mode"
    
    # Clear all WAN interfaces
    set_network_state "wan_primary" "null"
    set_network_state "wan_secondary" "null"
    set_network_state_object "wan_available" "[]"
    
    # Set mode to local-only
    set_network_mode "$MODE_LOCAL_ONLY"
    
    # Apply configuration
    apply_local_only_configuration
    
    success "Local-only mode activated"
    clear_error_context
}

# Reset network configuration to defaults
reset_network() {
    set_error_context "Network reset"

    log_section "Resetting Network Configuration"

    warning "This will reset all network configuration to defaults"

    # Stop all network services
    stop_network_services hostapd dnsmasq wpa_supplicant

    # Clear NAT rules
    clear_nat_rules

    # Recreate default network state
    create_default_network_state

    # Force evaluation
    force_network_evaluation

    success "Network configuration reset to defaults"
    clear_error_context
}

# List network interfaces
# shellcheck disable=SC2329  # Function invoked indirectly via case statement
list_interfaces() {
    set_error_context "Interface listing"

    log_section "Network Interface Listing"

    if [[ -f "${SCRIPT_DIR}/interface-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/interface-manager.sh" list
    else
        error "Interface manager not found: ${SCRIPT_DIR}/interface-manager.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}

# Show detailed WAN configuration
# shellcheck disable=SC2329  # Function invoked indirectly via case statement
show_wan_details() {
    set_error_context "WAN details display"

    log_section "Detailed WAN Configuration"

    if [[ -f "${SCRIPT_DIR}/interface-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/interface-manager.sh" show-wan
    else
        error "Interface manager not found: ${SCRIPT_DIR}/interface-manager.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}

# WiFi scanning
# shellcheck disable=SC2329  # Function invoked indirectly via case statement
wifi_scan() {
    set_error_context "WiFi scanning"

    log_section "WiFi Network Scanning"

    if [[ -f "${SCRIPT_DIR}/wifi-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/wifi-manager.sh" scan
    else
        error "WiFi manager not found: ${SCRIPT_DIR}/wifi-manager.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}

# WiFi access point creation
# shellcheck disable=SC2329  # Function invoked indirectly via case statement
wifi_create_ap() {
    local ssid="$1"
    local password="$2"

    set_error_context "WiFi access point creation"

    log_section "Creating WiFi Access Point"

    if [[ -f "${SCRIPT_DIR}/wifi-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/wifi-manager.sh" ap "$ssid" "$password"
    else
        error "WiFi manager not found: ${SCRIPT_DIR}/wifi-manager.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}

# WiFi status
# shellcheck disable=SC2329  # Function invoked indirectly via case statement
wifi_show_status() {
    set_error_context "WiFi status display"

    log_section "WiFi Interface Status"

    if [[ -f "${SCRIPT_DIR}/wifi-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/wifi-manager.sh" status
    else
        error "WiFi manager not found: ${SCRIPT_DIR}/wifi-manager.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}



# Query network state
query_state() {
    local query="$1"

    case "$query" in
        mode)
            get_network_mode
            ;;
        wan-primary)
            get_wan_primary
            ;;
        wan-secondary)
            get_wan_secondary
            ;;
        wan-all)
            echo "Primary: $(get_wan_primary)"
            echo "Secondary: $(get_wan_secondary)"
            get_wan_available | while read -r interface; do
                echo "Available: $interface"
            done
            ;;
        lan-all)
            get_lan_interfaces
            ;;
        connectivity)
            local interfaces
            interfaces=$(ip link show | grep -E "^[0-9]+: " | cut -d: -f2 | tr -d ' ' | grep -v "^lo$")
            for interface in $interfaces; do
                local has_internet
                has_internet=$(get_interface_connectivity "$interface" "has_internet")
                echo "$interface: $has_internet"
            done
            ;;
        auto-mode)
            if is_auto_mode_enabled; then
                echo "enabled"
            else
                echo "disabled"
            fi
            ;;
        *)
            error "Unknown query: $query"
            return 1
            ;;
    esac
}

# List network interfaces
list_interfaces() {
    set_error_context "Interface listing"

    log_section "Network Interface Listing"

    if [[ -f "${SCRIPT_DIR}/interface-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/interface-manager.sh" list
    else
        error "Interface manager not found: ${SCRIPT_DIR}/interface-manager.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}

# Show detailed WAN configuration
show_wan_details() {
    set_error_context "WAN details display"

    log_section "Detailed WAN Configuration"

    if [[ -f "${SCRIPT_DIR}/interface-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/interface-manager.sh" show-wan
    else
        error "Interface manager not found: ${SCRIPT_DIR}/interface-manager.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}

# WiFi scanning
wifi_scan() {
    set_error_context "WiFi scanning"

    log_section "WiFi Network Scanning"

    if [[ -f "${SCRIPT_DIR}/wifi-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/wifi-manager.sh" scan
    else
        error "WiFi manager not found: ${SCRIPT_DIR}/wifi-manager.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}

# WiFi access point creation
wifi_create_ap() {
    local ssid="$1"
    local password="$2"

    set_error_context "WiFi access point creation"

    log_section "Creating WiFi Access Point"

    info "Creating WiFi access point: $ssid"

    if [[ -f "${SCRIPT_DIR}/wifi-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/wifi-manager.sh" ap "$ssid" "$password"

        # After creating AP, trigger network evaluation if auto mode is enabled
        if is_auto_mode_enabled; then
            info "Triggering network re-evaluation after AP creation"
            force_network_evaluation
        fi
    else
        error "WiFi manager not found: ${SCRIPT_DIR}/wifi-manager.sh"
        clear_error_context
        return 1
    fi

    success "WiFi access point created: $ssid"
    clear_error_context
}

# WiFi status
wifi_show_status() {
    set_error_context "WiFi status display"

    log_section "WiFi Interface Status"

    if [[ -f "${SCRIPT_DIR}/wifi-manager.sh" ]]; then
        bash "${SCRIPT_DIR}/wifi-manager.sh" status
    else
        error "WiFi manager not found: ${SCRIPT_DIR}/wifi-manager.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}

# Network diagnostics
run_diagnostics() {
    local diagnostic_type="${1:-all}"

    set_error_context "Network diagnostics"

    log_section "Network Diagnostics: $diagnostic_type"

    if [[ -f "${SCRIPT_DIR}/network-diagnostics.sh" ]]; then
        case "$diagnostic_type" in
            all|connectivity|interfaces|dns|wifi|speed)
                bash "${SCRIPT_DIR}/network-diagnostics.sh" "$diagnostic_type"
                ;;
            *)
                error "Unknown diagnostic type: $diagnostic_type"
                error "Available types: all, connectivity, interfaces, dns, wifi, speed"
                clear_error_context
                return 1
                ;;
        esac
    else
        error "Network diagnostics not found: ${SCRIPT_DIR}/network-diagnostics.sh"
        clear_error_context
        return 1
    fi

    clear_error_context
}

# Show help information
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [COMMAND] [OPTIONS]

Commands:
    status                         Show current network status
    auto                           Enable automatic network management
    manual                         Disable automatic network management
    evaluate                       Force network re-evaluation

    list-interfaces                List all network interfaces
    show-wan-details               Show detailed WAN configuration
    set-wan INTERFACE [PRIORITY]   Set interface as WAN (priority: primary|secondary|available)
    clear-wan INTERFACE            Remove WAN designation from interface

    wifi-scan                      Scan for WiFi networks
    wifi-connect SSID PASSWORD [INTERFACE]     Connect to WiFi (auto-WAN)
    wifi-disconnect [INTERFACE]                Disconnect from WiFi
    wifi-ap SSID PASSWORD          Create WiFi access point
    wifi-status                    Show WiFi interface status
    wifi-repeater-start SSID PASSWORD [INTERFACE]  Start WiFi repeater
    wifi-repeater-stop [INTERFACE]             Stop WiFi repeater

    diagnostics [TYPE]             Run network diagnostics (all, connectivity, interfaces, dns, wifi, speed)

    local-only                     Force local-only mode (no internet sharing)
    reset                          Reset network configuration to defaults

    query FIELD                   Query network state
                                  Fields: mode, wan-primary, wan-secondary, wan-all,
                                         lan-all, connectivity, auto-mode

Options:
    --help, -h                     Show this help message

Examples:
    ${SCRIPT_NAME} status                      # Show network status
    ${SCRIPT_NAME} auto                        # Enable intelligent management
    ${SCRIPT_NAME} set-wan eth0 primary        # Set eth0 as primary WAN
    ${SCRIPT_NAME} wifi-connect MyWiFi pass123 # Connect to WiFi
    ${SCRIPT_NAME} query mode                  # Show current mode
    ${SCRIPT_NAME} evaluate                    # Force re-evaluation

Exit Codes:
    0   Success
    1   General error
    2   Invalid arguments

For more information, see the DangerPrep documentation.
EOF
}

# Main function
main() {
    # Parse command line arguments first to handle help without root
    local command="${1:-help}"
    
    # Show help without requiring root permissions
    if [[ "$command" == "help" || "$command" == "--help" || "$command" == "-h" ]]; then
        show_help
        exit 0
    fi
    
    # Initialize script (requires root for most operations)
    if [[ "$command" != "query" && "$command" != "status" && "$command" != "diagnostics" && "$command" != "list-interfaces" && "$command" != "show-wan-details" && "$command" != "wifi-scan" && "$command" != "wifi-status" ]]; then
        validate_root_user
    fi
    
    init_script
    
    case "$command" in
        status)
            show_status
            ;;
        auto)
            enable_auto_mode
            ;;
        manual)
            disable_auto_mode
            ;;
        evaluate)
            force_evaluation
            ;;
        list-interfaces)
            list_interfaces
            ;;
        show-wan-details)
            show_wan_details
            ;;
        set-wan)
            if [[ $# -lt 2 ]]; then
                error "Usage: $SCRIPT_NAME set-wan INTERFACE [PRIORITY]"
                exit 2
            fi
            set_wan_interface "$2" "${3:-primary}"
            ;;
        clear-wan)
            if [[ $# -lt 2 ]]; then
                error "Usage: $SCRIPT_NAME clear-wan INTERFACE"
                exit 2
            fi
            clear_wan_interface "$2"
            ;;
        wifi-scan)
            wifi_scan
            ;;
        wifi-connect)
            if [[ $# -lt 3 ]]; then
                error "Usage: $SCRIPT_NAME wifi-connect SSID PASSWORD [INTERFACE]"
                exit 2
            fi
            wifi_connect "$2" "$3" "${4:-wlan0}"
            ;;
        wifi-disconnect)
            wifi_disconnect "${2:-wlan0}"
            ;;
        wifi-ap)
            if [[ $# -lt 3 ]]; then
                error "Usage: $SCRIPT_NAME wifi-ap SSID PASSWORD"
                exit 2
            fi
            wifi_create_ap "$2" "$3"
            ;;
        wifi-status)
            wifi_show_status
            ;;
        wifi-repeater-start)
            if [[ $# -lt 3 ]]; then
                error "Usage: $SCRIPT_NAME wifi-repeater-start SSID PASSWORD [INTERFACE]"
                exit 2
            fi
            wifi_repeater_start "$2" "$3" "${4:-wlan0}"
            ;;
        wifi-repeater-stop)
            wifi_repeater_stop "${2:-wlan0}"
            ;;
        diagnostics)
            run_diagnostics "${2:-all}"
            ;;
        local-only)
            force_local_only
            ;;
        reset)
            reset_network
            ;;
        query)
            if [[ $# -lt 2 ]]; then
                error "Usage: $SCRIPT_NAME query FIELD"
                exit 2
            fi
            query_state "$2"
            ;;
        *)
            error "Unknown command: ${command}"
            error "Use '${SCRIPT_NAME} help' for usage information"
            exit 2
            ;;
    esac
}

# Run main function
main "$@"
