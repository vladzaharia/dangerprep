#!/usr/bin/env bash
# Start all DangerPrep Docker services

set -e

echo "Starting DangerPrep services..."
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
cd "$INSTALL_ROOT"

# Ensure Traefik network exists
if ! sudo docker network ls | grep -q "traefik"; then
    echo "Creating Traefik network..."
    sudo docker network create traefik
fi

# Start Traefik first (required by all other services)
echo "Starting Traefik..."
sudo docker compose -f docker/infrastructure/traefik/compose.yml up -d
sleep 5

# Start core infrastructure services
echo "Starting infrastructure services..."
sudo docker compose -f docker/infrastructure/portainer/compose.yml up -d
sudo docker compose -f docker/infrastructure/watchtower/compose.yml up -d
sudo docker compose -f docker/infrastructure/dns/compose.yml up -d
sleep 3

# Start media services
echo "Starting media services..."
sudo docker compose -f docker/media/jellyfin/compose.yml up -d
sudo docker compose -f docker/media/komga/compose.yml up -d
sudo docker compose -f docker/media/romm/compose.yml up -d
sleep 3

# Start utility services
echo "Starting utility services..."
sudo docker compose -f docker/infrastructure/portal/compose.yml up -d
sleep 3

# Start sync services
echo "Starting sync services..."
sudo docker compose -f docker/sync/nfs-sync/compose.yml up -d
sudo docker compose -f docker/sync/kiwix-sync/compose.yml up -d

echo "All services started successfully!"
