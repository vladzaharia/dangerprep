#!/usr/bin/env bash
# Show status of all DangerPrep Docker services

echo "Checking service status..."
echo "========================="
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(traefik|portainer|jellyfin|komga|romm|kiwix|portal|sync|dns|watchtower)"
