#!/bin/bash

# Check if iptables is available
if ! command -v iptables >/dev/null 2>&1; then
    echo "Warning: iptables not available, skipping firewall rules"
    exit 0
fi

# Apply firewall rules with error handling
echo "Applying firewall rules..."

# Docker user chain rule (may not exist in all environments)
iptables -I DOCKER-USER -i src_if -o dst_if -j ACCEPT 2>/dev/null || echo "Note: DOCKER-USER chain not available"

# NAT masquerading
iptables -t nat -C POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# Forward rules for WiFi
iptables -C FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || iptables -A FORWARD -i eth0 -o wlan0 -m state --state RELATED,ESTABLISHED -j ACCEPT
iptables -C FORWARD -i wlan0 -o eth0 -j ACCEPT 2>/dev/null || iptables -A FORWARD -i wlan0 -o eth0 -j ACCEPT

# Save rules if iptables-save is available
if command -v iptables-save >/dev/null 2>&1; then
    iptables-save
else
    echo "Warning: iptables-save not available, rules will not persist"
fi

echo "Firewall rules applied successfully"