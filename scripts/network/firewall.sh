#!/usr/bin/env bash
# DangerPrep Firewall Manager
# Manage iptables rules, port forwarding, and firewall status

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/errors.sh
source "${SCRIPT_DIR}/../shared/errors.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"
# shellcheck source=../shared/network.sh
source "${SCRIPT_DIR}/../shared/network.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-firewall.log"

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Firewall manager failed with exit code ${exit_code}"

    # Restore basic firewall rules to prevent lockout
    iptables -P INPUT ACCEPT 2>/dev/null || true
    iptables -P FORWARD ACCEPT 2>/dev/null || true
    iptables -P OUTPUT ACCEPT 2>/dev/null || true

    error "Cleanup completed"
    exit "${exit_code}"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate root permissions for firewall operations
    validate_root_user

    # Validate required commands
    require_commands iptables iptables-save

    debug "Firewall manager initialized"
    clear_error_context
}

# Load DangerPrep configuration
load_config() {
    # Default values
    SSH_PORT="2222"
    WAN_INTERFACE=""
    WIFI_INTERFACE=""

    # Load from setup script configuration if available
    if [[ -f /etc/dangerprep/interfaces.conf ]]; then
        # shellcheck source=/dev/null
        source /etc/dangerprep/interfaces.conf
    fi

    # Load SSH port from sshd_config if available
    if [[ -f /etc/ssh/sshd_config ]]; then
        local ssh_port_line
        ssh_port_line=$(grep "^Port " /etc/ssh/sshd_config | head -1)
        if [[ -n "$ssh_port_line" ]]; then
            SSH_PORT=$(echo "$ssh_port_line" | awk '{print $2}')
        fi
    fi

    log "Configuration loaded: SSH_PORT=${SSH_PORT}, WAN_INTERFACE=${WAN_INTERFACE}, WIFI_INTERFACE=${WIFI_INTERFACE}"
}

show_firewall_status() {
    echo "Firewall Status:"
    echo "================"
    
    # Check if iptables has rules
    local rule_count
    rule_count=$(iptables -L | grep -c "^Chain\|^target" || echo "0")
    echo "Active iptables rules: $rule_count"
    
    echo
    echo "NAT Rules (POSTROUTING):"
    iptables -t nat -L POSTROUTING -n --line-numbers | head -10
    
    echo
    echo "Forward Rules:"
    iptables -L FORWARD -n --line-numbers | head -10
    
    echo
    echo "Input Rules:"
    iptables -L INPUT -n --line-numbers | head -10
    
    echo
    echo "Port Forwarding Rules:"
    local prerouting_rules
    prerouting_rules=$(iptables -t nat -L PREROUTING -n | grep -c DNAT)
    if [ "$prerouting_rules" -gt 0 ]; then
        iptables -t nat -L PREROUTING -n --line-numbers | grep DNAT
    else
        echo "  No port forwarding rules configured"
    fi
    
    echo
    echo "IP Forwarding:"
    local ip_forward
    ip_forward=$(cat /proc/sys/net/ipv4/ip_forward)
    if [ "$ip_forward" = "1" ]; then
        success "IP forwarding enabled"
    else
        warning "IP forwarding disabled"
    fi
    
    echo
    echo "Common Ports Status:"
    check_port_status "${SSH_PORT}" "SSH"
    check_port_status 80 "HTTP"
    check_port_status 443 "HTTPS"
    check_port_status 53 "DNS"
    check_port_status 67 "DHCP"
}

check_port_status() {
    local port="$1"
    local service="$2"
    
    if iptables -L INPUT -n | grep -q ":$port "; then
        echo "  Port $port ($service): ✅ Allowed"
    else
        echo "  Port $port ($service): ❌ Not explicitly allowed"
    fi
}

reset_firewall() {
    set_error_context "Firewall reset"
    load_config

    log "Resetting firewall to default DangerPrep rules..."

    # Clear all existing rules
    iptables -F
    iptables -t nat -F
    iptables -t mangle -F
    iptables -X

    # Set default policies
    iptables -P INPUT DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT ACCEPT

    # Allow loopback traffic
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A OUTPUT -o lo -j ACCEPT

    # Allow established and related connections
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT

    # Allow SSH on configured port
    iptables -A INPUT -p tcp --dport "${SSH_PORT}" -j ACCEPT

    # Allow HTTP/HTTPS (ports 80, 443)
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT

    # Allow DNS (port 53)
    iptables -A INPUT -p tcp --dport 53 -j ACCEPT
    iptables -A INPUT -p udp --dport 53 -j ACCEPT

    # Allow DHCP (port 67, 68)
    iptables -A INPUT -p udp --dport 67 -j ACCEPT
    iptables -A INPUT -p udp --dport 68 -j ACCEPT

    # Allow Tailscale (port 41641)
    iptables -A INPUT -p udp --dport 41641 -j ACCEPT
    iptables -A INPUT -i tailscale0 -j ACCEPT
    iptables -A FORWARD -i tailscale0 -j ACCEPT
    iptables -A FORWARD -o tailscale0 -j ACCEPT

    # Allow K3s/Kubernetes ports for Olares (only what's needed for external access)
    iptables -A INPUT -p tcp --dport 6443 -j ACCEPT   # K3s API server (for external kubectl access)

    # Configure NAT if interfaces are available
    if [[ -n "${WAN_INTERFACE}" ]]; then
        log "Configuring NAT for WAN interface: ${WAN_INTERFACE}"
        iptables -t nat -A POSTROUTING -o "${WAN_INTERFACE}" -j MASQUERADE
    fi

    # Configure WiFi forwarding if interfaces are available
    if [[ -n "${WIFI_INTERFACE}" && -n "${WAN_INTERFACE}" ]]; then
        log "Configuring WiFi forwarding: ${WIFI_INTERFACE} -> ${WAN_INTERFACE}"
        iptables -A FORWARD -i "${WIFI_INTERFACE}" -o "${WAN_INTERFACE}" -j ACCEPT
        iptables -A FORWARD -i "${WAN_INTERFACE}" -o "${WIFI_INTERFACE}" -m state --state ESTABLISHED,RELATED -j ACCEPT

        # Allow WiFi clients to access local services
        iptables -A INPUT -i "${WIFI_INTERFACE}" -p tcp --dport 80 -j ACCEPT
        iptables -A INPUT -i "${WIFI_INTERFACE}" -p tcp --dport 443 -j ACCEPT
        iptables -A INPUT -i "${WIFI_INTERFACE}" -p tcp --dport 53 -j ACCEPT
        iptables -A INPUT -i "${WIFI_INTERFACE}" -p udp --dport 53 -j ACCEPT
        iptables -A INPUT -i "${WIFI_INTERFACE}" -p udp --dport 67 -j ACCEPT
        iptables -A INPUT -i "${WIFI_INTERFACE}" -p icmp --icmp-type echo-request -j ACCEPT

        # Allow WiFi clients to access Olares services
        iptables -A INPUT -i "${WIFI_INTERFACE}" -p tcp --dport 6443 -j ACCEPT
    fi

    # Save rules
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4

    success "Firewall reset to default DangerPrep configuration"
    log "SSH port: ${SSH_PORT}, WAN: ${WAN_INTERFACE}, WiFi: ${WIFI_INTERFACE}"
}

add_port_forward() {
    local external_port="$1"
    local target="$2"

    set_error_context "Port forwarding setup"
    
    if [ -z "$external_port" ] || [ -z "$target" ]; then
        error "Usage: port-forward <external_port> <target_ip:port>"
        echo "Examples:"
        echo "  port-forward 8080 192.168.120.100:80"
        echo "  port-forward 2222 192.168.120.50:22"
        exit 1
    fi
    
    # Validate port number
    if ! [[ "$external_port" =~ ^[0-9]+$ ]] || [ "$external_port" -lt 1 ] || [ "$external_port" -gt 65535 ]; then
        error "Invalid port number: $external_port"
        exit 1
    fi
    
    # Parse target
    if [[ "$target" =~ ^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):([0-9]+)$ ]]; then
        local target_ip
        target_ip=${BASH_REMATCH[1]}
        local target_port
        target_port=${BASH_REMATCH[2]}
    else
        error "Invalid target format. Use IP:PORT (e.g., 192.168.120.100:80)"
        exit 1
    fi
    
    log "Adding port forwarding rule: $external_port → $target"
    
    # Add DNAT rule for port forwarding
    iptables -t nat -A PREROUTING -p tcp --dport "$external_port" \
        -j DNAT --to-destination "$target"
    
    # Add corresponding FORWARD rule
    iptables -A FORWARD -p tcp -d "$target_ip" --dport "$target_port" -j ACCEPT
    
    # Allow the external port in INPUT if targeting local services
    iptables -A INPUT -p tcp --dport "$external_port" -j ACCEPT
    
    # Save rules
    iptables-save > /etc/iptables/rules.v4
    
    success "Port forwarding added: $external_port → $target"
    
    echo
    echo "Current port forwarding rules:"
    iptables -t nat -L PREROUTING -n --line-numbers | grep DNAT
}

remove_port_forward() {
    local external_port="$1"

    set_error_context "Port forwarding removal"

    if [[ -z "${external_port}" ]]; then
        error "Usage: remove-port-forward <external_port>"
        exit 1
    fi

    log "Removing port forwarding rules for port ${external_port}..."

    # Remove DNAT rules
    iptables -t nat -D PREROUTING -p tcp --dport "${external_port}" -j DNAT --to-destination 2>/dev/null || true

    # Remove INPUT rules
    iptables -D INPUT -p tcp --dport "${external_port}" -j ACCEPT 2>/dev/null || true

    # Save rules
    iptables-save > /etc/iptables/rules.v4

    success "Port forwarding rules removed for port ${external_port}"
    clear_error_context
}

list_port_forwards() {
    echo "Port Forwarding Rules:"
    echo "====================="
    
    local rules
    rules=$(iptables -t nat -L PREROUTING -n --line-numbers | grep DNAT)
    
    if [ -n "$rules" ]; then
        echo "Line  External Port  →  Target"
        echo "----  -------------     ------"
        echo "$rules" | while read -r line_num _chain _target _prot _opt _source _dest extra; do
            if [[ "$extra" =~ dpt:([0-9]+).*to:([0-9.]+:[0-9]+) ]]; then
                local ext_port
                ext_port=${BASH_REMATCH[1]}
                local target_addr
                target_addr=${BASH_REMATCH[2]}
                printf "%-4s  %-13s  →  %s\n" "$line_num" "$ext_port" "$target_addr"
            fi
        done
    else
        echo "No port forwarding rules configured"
    fi
    
    echo
    echo "Use 'just fw-port-forward <port> <target>' to add rules"
}

block_port() {
    local port="$1"

    set_error_context "Port blocking"

    if [[ -z "${port}" ]]; then
        error "Usage: block-port <port>"
        exit 1
    fi

    log "Blocking port ${port}..."

    # Add DROP rule for the port
    iptables -A INPUT -p tcp --dport "${port}" -j DROP
    iptables -A INPUT -p udp --dport "${port}" -j DROP

    # Save rules
    iptables-save > /etc/iptables/rules.v4

    success "Port ${port} blocked"
    clear_error_context
}

allow_port() {
    local port="$1"

    set_error_context "Port allowing"

    if [[ -z "${port}" ]]; then
        error "Usage: allow-port <port>"
        exit 1
    fi

    log "Allowing port ${port}..."

    # Add ACCEPT rule for the port
    iptables -A INPUT -p tcp --dport "${port}" -j ACCEPT
    iptables -A INPUT -p udp --dport "${port}" -j ACCEPT

    # Save rules
    iptables-save > /etc/iptables/rules.v4

    success "Port ${port} allowed"
    clear_error_context
}

# Main function
main() {
    # Initialize script
    init_script

    # Show banner for firewall operations
    if [[ "${1:-}" != "help" && "${1:-}" != "--help" && "${1:-}" != "-h" ]]; then
        show_banner_with_title "Firewall Manager" "security"
        echo
    fi

    case "${1:-}" in
    "status")
        load_config
        show_firewall_status
        ;;
    "reset")
        reset_firewall
        ;;
    "port-forward")
        load_config
        add_port_forward "$2" "$3"
        ;;
    "remove-port-forward")
        load_config
        remove_port_forward "$2"
        ;;
    "list-forwards")
        list_port_forwards
        ;;
    "block-port")
        load_config
        block_port "$2"
        ;;
    "allow-port")
        load_config
        allow_port "$2"
        ;;
    *)
        echo "DangerPrep Firewall Manager"
        echo "Usage: $0 {status|reset|port-forward|remove-port-forward|list-forwards|block-port|allow-port}"
        echo
        echo "Commands:"
        echo "  status                           - Show firewall status and rules"
        echo "  reset                            - Reset to default DangerPrep rules"
        echo "  port-forward <port> <target>     - Add port forwarding rule"
        echo "  remove-port-forward <port>       - Remove port forwarding rule"
        echo "  list-forwards                    - List all port forwarding rules"
        echo "  block-port <port>                - Block a specific port"
        echo "  allow-port <port>                - Allow a specific port"
        echo
        echo "Examples:"
        echo "  $0 status"
        echo "  $0 port-forward 8080 192.168.120.100:80"
        echo "  $0 remove-port-forward 8080"
        echo "  $0 allow-port 3000"
        echo
        echo "Note: This script reads configuration from /etc/dangerprep/interfaces.conf"
        echo "      and SSH port from /etc/ssh/sshd_config"
        exit 1
        ;;
    esac
}

# Run main function
main "$@"
