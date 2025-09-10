#!/usr/bin/env bash
# Show status of all DangerPrep Docker services

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

# Detect appropriate Docker command
DOCKER_CMD=$(detect_docker_command)

# Set Docker environment for rootless if needed
if [[ "$DOCKER_CMD" == "docker" ]] && [[ -S "/run/user/$(id -u)/docker.sock" ]]; then
    export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
fi

log "Checking DangerPrep service status..."
log "Using Docker command: $DOCKER_CMD"
echo "========================="

# Check if Docker is running
if ! $DOCKER_CMD ps >/dev/null 2>&1; then
    error "Docker is not running or not accessible"
    exit 1
fi

# Show all running containers
echo "All Running Containers:"
$DOCKER_CMD ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo
echo "DangerPrep Services:"
echo "==================="

# Check specific DangerPrep services
SERVICES=(traefik portainer jellyfin komga romm kiwix nfs-sync kiwix-sync offline-sync dns watchtower)

for service in "${SERVICES[@]}"; do
    if $DOCKER_CMD ps --format "{{.Names}}" | grep -q "$service"; then
        local status=$($DOCKER_CMD ps --filter "name=$service" --format "{{.Status}}")
        success "$service: $status"
    else
        warning "$service: Not running"
    fi
done

echo
echo "Container Resource Usage:"
echo "========================"
$DOCKER_CMD stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || warning "Could not get container stats"
