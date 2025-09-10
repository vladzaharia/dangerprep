#!/usr/bin/env bash
# Stop all DangerPrep Docker services

set -e

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

log "Stopping DangerPrep services..."
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
cd "$INSTALL_ROOT"

# Detect appropriate Docker command
DOCKER_CMD=$(detect_docker_command)
log "Using Docker command: $DOCKER_CMD"

# Set Docker environment for rootless if needed
if [[ "$DOCKER_CMD" == "docker" ]] && [[ -S "/run/user/$(id -u)/docker.sock" ]]; then
    export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
fi

# Stop services in reverse dependency order
log "Stopping sync services..."
[[ -f docker/sync/offline-sync/compose.yml ]] && $DOCKER_CMD compose -f docker/sync/offline-sync/compose.yml down
[[ -f docker/sync/kiwix-sync/compose.yml ]] && $DOCKER_CMD compose -f docker/sync/kiwix-sync/compose.yml down
[[ -f docker/sync/nfs-sync/compose.yml ]] && $DOCKER_CMD compose -f docker/sync/nfs-sync/compose.yml down

log "Stopping utility services..."
[[ -f docker/services/onedev/compose.yml ]] && $DOCKER_CMD compose -f docker/services/onedev/compose.yml down
[[ -f docker/services/docmost/compose.yml ]] && $DOCKER_CMD compose -f docker/services/docmost/compose.yml down

log "Stopping media services..."
[[ -f docker/media/romm/compose.yml ]] && $DOCKER_CMD compose -f docker/media/romm/compose.yml down
[[ -f docker/media/komga/compose.yml ]] && $DOCKER_CMD compose -f docker/media/komga/compose.yml down
[[ -f docker/media/jellyfin/compose.yml ]] && $DOCKER_CMD compose -f docker/media/jellyfin/compose.yml down

log "Stopping infrastructure services..."
[[ -f docker/infrastructure/raspap/compose.yml ]] && $DOCKER_CMD compose -f docker/infrastructure/raspap/compose.yml down
[[ -f docker/infrastructure/dns/compose.yml ]] && $DOCKER_CMD compose -f docker/infrastructure/dns/compose.yml down
[[ -f docker/infrastructure/watchtower/compose.yml ]] && $DOCKER_CMD compose -f docker/infrastructure/watchtower/compose.yml down
[[ -f docker/infrastructure/arcane/compose.yml ]] && $DOCKER_CMD compose -f docker/infrastructure/arcane/compose.yml down

# Stop Traefik last
log "Stopping Traefik..."
[[ -f docker/infrastructure/traefik/compose.yml ]] && $DOCKER_CMD compose -f docker/infrastructure/traefik/compose.yml down

success "All services stopped successfully!"
