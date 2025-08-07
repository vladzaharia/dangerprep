#!/bin/bash
# DangerPrep WAN-to-WiFi Routing
# Internet via Ethernet, sharing via WiFi hotspot

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

WAN_INTERFACE="${WAN_INTERFACE:-eth0}"
WIFI_INTERFACE="${WIFI_INTERFACE:-wlan0}"
LAN_IP="192.168.120.1"
LAN_NETWORK="192.168.120.0/22"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

setup_wan_to_wifi() {
    show_banner_with_title "WAN-to-WiFi Routing" "network"
    echo
    log "Setting up WAN-to-WiFi routing: Ethernet WAN to WiFi Hotspot"
    
    # Configure WAN interface for DHCP
    log "Configuring WAN interface: $WAN_INTERFACE"
    dhclient "$WAN_INTERFACE"
    
    # Configure WiFi interface as hotspot
    log "Configuring WiFi hotspot: $WIFI_INTERFACE"
    ip link set "$WIFI_INTERFACE" up
    ip addr add "$LAN_IP/22" dev "$WIFI_INTERFACE"
    
    # Enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Configure NAT
    iptables -t nat -F
    iptables -t nat -A POSTROUTING -o "$WAN_INTERFACE" -j MASQUERADE
    iptables -A FORWARD -i "$WIFI_INTERFACE" -o "$WAN_INTERFACE" -j ACCEPT
    iptables -A FORWARD -i "$WAN_INTERFACE" -o "$WIFI_INTERFACE" -m state --state RELATED,ESTABLISHED -j ACCEPT
    
    # Start services
    systemctl start hostapd
    systemctl start dnsmasq
    
    log "WAN-to-WiFi routing configured successfully"
    log "WAN: $WAN_INTERFACE (DHCP)"
    log "WiFi Hotspot: $WIFI_INTERFACE ($LAN_IP)"
}

show_status() {
    echo "WAN-to-WiFi Status: Ethernet WAN to WiFi Hotspot"
    echo "================================================"
    
    echo "WAN Interface ($WAN_INTERFACE):"
    ip addr show "$WAN_INTERFACE" | grep inet
    
    echo
    echo "WiFi Interface ($WIFI_INTERFACE):"
    ip addr show "$WIFI_INTERFACE" | grep inet
    
    echo
    echo "Routing Table:"
    ip route
    
    echo
    echo "NAT Rules:"
    iptables -t nat -L POSTROUTING -n
    
    echo
    echo "Services:"
    systemctl is-active hostapd dnsmasq
}

case "${1:-setup}" in
    setup)
        setup_wan_to_wifi
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {setup|status}"
        echo
        echo "WAN-to-WiFi Routing: Internet via Ethernet, sharing via WiFi hotspot"
        exit 1
        ;;
esac
