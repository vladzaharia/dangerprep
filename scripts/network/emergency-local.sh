#!/bin/bash
# DangerPrep Local Only Network
# WiFi hotspot with optional ethernet LAN, no internet

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

WIFI_INTERFACE="${WIFI_INTERFACE:-wlan0}"
ETH_INTERFACE="${ETH_INTERFACE:-eth0}"
LAN_IP="192.168.120.1"
LAN_NETWORK="192.168.120.0/22"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

setup_local_only() {
    show_banner_with_title "Emergency Local Network" "network"
    echo
    log "Setting up Local Only Network"
    
    # Configure WiFi interface as hotspot
    log "Configuring WiFi hotspot: $WIFI_INTERFACE"
    ip link set "$WIFI_INTERFACE" up
    ip addr flush dev "$WIFI_INTERFACE"
    ip addr add "$LAN_IP/22" dev "$WIFI_INTERFACE"
    
    # Configure ethernet as LAN if available
    if ip link show "$ETH_INTERFACE" >/dev/null 2>&1; then
        log "Configuring Ethernet LAN: $ETH_INTERFACE"
        ip link set "$ETH_INTERFACE" up
        ip addr flush dev "$ETH_INTERFACE"
        ip addr add "192.168.120.2/22" dev "$ETH_INTERFACE"
        
        # Bridge WiFi and Ethernet
        brctl addbr br0 2>/dev/null || true
        brctl addif br0 "$WIFI_INTERFACE" 2>/dev/null || true
        brctl addif br0 "$ETH_INTERFACE" 2>/dev/null || true
        ip link set br0 up
        ip addr add "$LAN_IP/22" dev br0
    fi
    
    # Disable IP forwarding (local network only)
    echo 0 > /proc/sys/net/ipv4/ip_forward
    
    # Clear NAT rules
    iptables -t nat -F
    
    # Allow local traffic only
    iptables -F
    iptables -P INPUT ACCEPT
    iptables -P FORWARD ACCEPT
    iptables -P OUTPUT ACCEPT
    
    # Block internet access
    iptables -A OUTPUT -d 0.0.0.0/0 -j DROP
    iptables -A FORWARD -d 0.0.0.0/0 -j DROP
    
    # Allow local network traffic
    iptables -I OUTPUT -d "$LAN_NETWORK" -j ACCEPT
    iptables -I FORWARD -d "$LAN_NETWORK" -j ACCEPT
    iptables -I OUTPUT -d 127.0.0.0/8 -j ACCEPT
    
    # Allow DNS and DHCP
    iptables -I OUTPUT -p udp --dport 53 -j ACCEPT
    iptables -I OUTPUT -p udp --dport 67 -j ACCEPT
    
    # Start services
    systemctl start hostapd
    systemctl start dnsmasq
    
    log "Local Only Network configured successfully"
    log "Local only network active"
    log "WiFi Hotspot: $WIFI_INTERFACE ($LAN_IP)"
    if ip link show "$ETH_INTERFACE" >/dev/null 2>&1; then
        log "Ethernet LAN: $ETH_INTERFACE (192.168.120.2)"
    fi
}

show_status() {
    echo "Local Only Network Status"
    echo "========================="
    
    echo "WiFi Interface ($WIFI_INTERFACE):"
    ip addr show "$WIFI_INTERFACE" | grep inet
    
    if ip link show "$ETH_INTERFACE" >/dev/null 2>&1; then
        echo
        echo "Ethernet Interface ($ETH_INTERFACE):"
        ip addr show "$ETH_INTERFACE" | grep inet
    fi
    
    if ip link show br0 >/dev/null 2>&1; then
        echo
        echo "Bridge Interface (br0):"
        ip addr show br0 | grep inet
        echo "Bridge members:"
        brctl show br0
    fi
    
    echo
    echo "Local Network Range: $LAN_NETWORK"
    
    echo
    echo "Connected WiFi clients:"
    iw dev "$WIFI_INTERFACE" station dump 2>/dev/null | grep Station || echo "No clients connected"
    
    echo
    echo "Services:"
    systemctl is-active hostapd dnsmasq
    
    echo
    echo "Internet access: BLOCKED (Local only mode)"
}

cleanup_local_only() {
    log "Cleaning up Local Only Network"
    
    # Remove bridge if it exists
    if ip link show br0 >/dev/null 2>&1; then
        ip link set br0 down
        brctl delbr br0 2>/dev/null || true
    fi
    
    # Reset firewall rules
    iptables -F
    iptables -t nat -F
    iptables -P INPUT ACCEPT
    iptables -P FORWARD ACCEPT
    iptables -P OUTPUT ACCEPT
    
    # Re-enable IP forwarding
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    log "Local Only Network cleanup completed"
}

case "${1:-setup}" in
    setup)
        setup_local_only
        ;;
    status)
        show_status
        ;;
    cleanup)
        cleanup_local_only
        ;;
    *)
        echo "Usage: $0 {setup|status|cleanup}"
        echo
        echo "Local Only Network: WiFi hotspot with optional ethernet LAN, no internet"
        echo "- WiFi hotspot for local devices"
        echo "- Optional Ethernet LAN bridging"
        echo "- No internet access (local only mode)"
        exit 1
        ;;
esac
