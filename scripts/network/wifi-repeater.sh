#!/bin/bash
# DangerPrep WiFi Repeater Mode
# Connect to existing WiFi and repeat signal

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../shared/banner.sh"

WIFI_INTERFACE="${WIFI_INTERFACE:-wlan0}"
UPSTREAM_SSID="${UPSTREAM_SSID:-}"
UPSTREAM_PASSWORD="${UPSTREAM_PASSWORD:-}"
LAN_IP="192.168.120.1"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

setup_wifi_repeater() {
    log "Setting up WiFi Repeater Mode"
    
    if [[ -z "${UPSTREAM_SSID}" ]]; then
        echo "Error: UPSTREAM_SSID not set"
        echo "Usage: UPSTREAM_SSID='network_name' UPSTREAM_PASSWORD='password' $0 setup"
        exit 1
    fi
    
    # Stop hostapd temporarily
    systemctl stop hostapd
    
    # Connect to upstream WiFi
    log "Connecting to upstream WiFi: ${UPSTREAM_SSID}"
    wpa_passphrase "${UPSTREAM_SSID}" "${UPSTREAM_PASSWORD}" > /etc/wpa_supplicant/wpa_supplicant.conf
    wpa_supplicant -B -i "${WIFI_INTERFACE}" -c /etc/wpa_supplicant/wpa_supplicant.conf
    dhclient "${WIFI_INTERFACE}"
    
    # Wait for connection
    sleep 10
    
    # Check if connected
    if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        log "Failed to connect to upstream WiFi"
        exit 1
    fi
    
    log "Connected to upstream WiFi successfully"
    
    # Create virtual interface for hotspot
    iw dev "${WIFI_INTERFACE}" interface add "${WIFI_INTERFACE}_ap" type __ap
    ip link set "${WIFI_INTERFACE}_ap" up
    ip addr add "${LAN_IP}/22" dev "${WIFI_INTERFACE}_ap"
    
    # Update hostapd configuration for virtual interface
    sed -i "s/interface=.*/interface=${WIFI_INTERFACE}_ap/" /etc/hostapd/hostapd.conf
    
    # Enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Configure NAT
    iptables -t nat -F
    iptables -t nat -A POSTROUTING -o "${WIFI_INTERFACE}" -j MASQUERADE
    iptables -A FORWARD -i "${WIFI_INTERFACE}_ap" -o "${WIFI_INTERFACE}" -j ACCEPT
    iptables -A FORWARD -i "${WIFI_INTERFACE}" -o "${WIFI_INTERFACE}_ap" -m state --state RELATED,ESTABLISHED -j ACCEPT
    
    # Start services
    systemctl start hostapd
    systemctl start dnsmasq
    
    log "WiFi Repeater Mode configured successfully"
    log "Upstream: ${WIFI_INTERFACE} (connected to ${UPSTREAM_SSID})"
    log "Hotspot: ${WIFI_INTERFACE}_ap (${LAN_IP})"
}

show_status() {
    echo "WiFi Repeater Status"
    echo "===================="
    
    echo "Upstream WiFi (${WIFI_INTERFACE}):"
    ip addr show "${WIFI_INTERFACE}" | grep inet
    iwconfig "${WIFI_INTERFACE}" 2>/dev/null | grep ESSID
    
    echo
    echo "Hotspot Interface (${WIFI_INTERFACE}_ap):"
    ip addr show "${WIFI_INTERFACE}_ap" 2>/dev/null | grep inet || echo "Virtual interface not found"
    
    echo
    echo "Internet connectivity:"
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        echo "Connected"
    else
        echo "Not connected"
    fi
    
    echo
    echo "Services:"
    systemctl is-active hostapd dnsmasq
}

cleanup_wifi_repeater() {
    log "Cleaning up WiFi Repeater Mode"
    
    # Stop services
    systemctl stop hostapd
    systemctl stop dnsmasq
    
    # Remove virtual interface
    iw dev "${WIFI_INTERFACE}_ap" del 2>/dev/null || true
    
    # Disconnect from upstream WiFi
    killall wpa_supplicant 2>/dev/null || true
    
    # Reset hostapd configuration
    sed -i "s/interface=.*/interface=${WIFI_INTERFACE}/" /etc/hostapd/hostapd.conf
    
    log "WiFi Repeater Mode cleanup completed"
}

case "${1:-setup}" in
    setup)
        setup_wifi_repeater
        ;;
    status)
        show_status
        ;;
    cleanup)
        cleanup_wifi_repeater
        ;;
    *)
        echo "Usage: $0 {setup|status|cleanup}"
        echo
        echo "WiFi Repeater Mode: Connect to existing WiFi and repeat signal"
        echo "Environment variables:"
        echo "  UPSTREAM_SSID     - WiFi network to connect to"
        echo "  UPSTREAM_PASSWORD - WiFi network password"
        exit 1
        ;;
esac
