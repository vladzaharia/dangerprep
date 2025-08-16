#!/bin/bash
# DangerPrep QoS and Traffic Shaping Management

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../shared/banner.sh"

show_banner_with_title "QoS Manager" "network"
echo

WAN_INTERFACE="${WAN_INTERFACE:-eth0}"
WIFI_INTERFACE="${WIFI_INTERFACE:-wlan0}"
UPLOAD_LIMIT="50mbit"    # Adjust based on your connection
# DOWNLOAD_LIMIT is used in QoS configuration
export DOWNLOAD_LIMIT="100mbit" # Adjust based on your connection

# Load configuration if available
if [[ -f /etc/dangerprep/interfaces.conf ]]; then
    # shellcheck source=/dev/null
    source /etc/dangerprep/interfaces.conf
fi

setup_qos() {
    echo "Setting up QoS on ${WAN_INTERFACE}..."

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

    echo "QoS configured on ${WAN_INTERFACE}"
}

remove_qos() {
    echo "Removing QoS from ${WAN_INTERFACE}..."
    tc qdisc del dev "${WAN_INTERFACE}" root 2>/dev/null || true
    echo "QoS removed from ${WAN_INTERFACE}"
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
    *)
        echo "DangerPrep QoS Management"
        echo "Usage: $0 {setup|remove|status}"
        echo
        echo "Commands:"
        echo "  setup    - Configure QoS traffic shaping"
        echo "  remove   - Remove QoS configuration"
        echo "  status   - Show current QoS status"
        exit 1
        ;;
esac
