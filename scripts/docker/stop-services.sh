#!/usr/bin/env bash
# Stop all DangerPrep Docker services

set -e

echo "Stopping DangerPrep services..."
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
cd "$INSTALL_ROOT"

# Stop services in reverse dependency order
echo "Stopping sync services..."
sudo docker compose -f docker/sync/nfs-sync/compose.yml down
sudo docker compose -f docker/sync/kiwix-sync/compose.yml down

echo "Stopping utility services..."
sudo docker compose -f docker/infrastructure/portal/compose.yml down

echo "Stopping media services..."
sudo docker compose -f docker/media/romm/compose.yml down
sudo docker compose -f docker/media/komga/compose.yml down
sudo docker compose -f docker/media/jellyfin/compose.yml down

echo "Stopping infrastructure services..."
sudo docker compose -f docker/infrastructure/dns/compose.yml down
sudo docker compose -f docker/infrastructure/watchtower/compose.yml down
sudo docker compose -f docker/infrastructure/portainer/compose.yml down

# Stop Traefik last
echo "Stopping Traefik..."
sudo docker compose -f docker/infrastructure/traefik/compose.yml down

echo "All services stopped successfully!"
