#!/usr/bin/env bash
# Start all DangerPrep Docker services

set -e

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect Docker command based on setup
detect_docker_command() {
    # Get the original user if running with sudo
    local target_user="${SUDO_USER:-$USER}"

    # Check if running as ubuntu user with rootless Docker
    if [[ "$target_user" == "ubuntu" ]] && [[ -S "/run/user/1000/docker.sock" ]]; then
        echo "docker"
    # Check if rootless Docker is available for current user
    elif [[ -S "/run/user/$(id -u)/docker.sock" ]]; then
        echo "docker"
    # Check if target user is in docker group
    elif [[ -n "$target_user" ]] && groups "$target_user" 2>/dev/null | grep -q docker; then
        echo "docker"
    # Check if current user is in docker group (fallback)
    elif groups | grep -q docker; then
        echo "docker"
    # Fall back to sudo
    else
        echo "sudo docker"
    fi
}

show_banner_with_title "Starting Docker Services" "docker"
echo
log "Starting DangerPrep services..."
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
cd "$INSTALL_ROOT"

# Detect appropriate Docker command
DOCKER_CMD=$(detect_docker_command)
log "Using Docker command: $DOCKER_CMD"

# Set Docker environment for rootless if needed
if [[ "$DOCKER_CMD" == "docker" ]] && [[ -S "/run/user/$(id -u)/docker.sock" ]]; then
    export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
fi

# Ensure Traefik network exists
if ! $DOCKER_CMD network ls | grep -q "traefik"; then
    log "Creating Traefik network..."
    $DOCKER_CMD network create traefik
fi

# Start Traefik first (required by all other services)
log "Starting Traefik..."
$DOCKER_CMD compose -f docker/infrastructure/traefik/compose.yml up -d
sleep 5

# Start core infrastructure services
log "Starting infrastructure services..."
[[ -f docker/infrastructure/arcane/compose.yml ]] && $DOCKER_CMD compose -f docker/infrastructure/arcane/compose.yml up -d
[[ -f docker/infrastructure/watchtower/compose.yml ]] && $DOCKER_CMD compose -f docker/infrastructure/watchtower/compose.yml up -d
[[ -f docker/infrastructure/dns/compose.yml ]] && $DOCKER_CMD compose -f docker/infrastructure/dns/compose.yml up -d
[[ -f docker/infrastructure/raspap/compose.yml ]] && $DOCKER_CMD compose -f docker/infrastructure/raspap/compose.yml up -d
sleep 3

# Start media services
log "Starting media services..."
[[ -f docker/media/jellyfin/compose.yml ]] && $DOCKER_CMD compose -f docker/media/jellyfin/compose.yml up -d
[[ -f docker/media/komga/compose.yml ]] && $DOCKER_CMD compose -f docker/media/komga/compose.yml up -d
[[ -f docker/media/romm/compose.yml ]] && $DOCKER_CMD compose -f docker/media/romm/compose.yml up -d
sleep 3

# Start utility services
log "Starting utility services..."
[[ -f docker/services/docmost/compose.yml ]] && $DOCKER_CMD compose -f docker/services/docmost/compose.yml up -d
[[ -f docker/services/onedev/compose.yml ]] && $DOCKER_CMD compose -f docker/services/onedev/compose.yml up -d
sleep 3

# Start sync services
log "Starting sync services..."
[[ -f docker/sync/nfs-sync/compose.yml ]] && $DOCKER_CMD compose -f docker/sync/nfs-sync/compose.yml up -d
[[ -f docker/sync/kiwix-sync/compose.yml ]] && $DOCKER_CMD compose -f docker/sync/kiwix-sync/compose.yml up -d
[[ -f docker/sync/offline-sync/compose.yml ]] && $DOCKER_CMD compose -f docker/sync/offline-sync/compose.yml up -d

success "All services started successfully!"
