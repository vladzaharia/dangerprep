#!/usr/bin/env bash
# Uninstall DangerPrep system (preserves data)

echo "Uninstalling DangerPrep system..."

# Stop all services
echo "Stopping all services..."
just stop || true

# Remove all containers
echo "Removing all containers..."
sudo docker ps -a --filter "label=com.docker.compose.project=dangerprep" -q | xargs -r sudo docker rm -f

# Remove Docker networks (except external ones)
echo "Removing Docker networks..."
sudo docker network ls --filter "label=com.docker.compose.project=dangerprep" -q | xargs -r sudo docker network rm

# Remove Docker volumes (be careful with this)
read -p "Remove all Docker volumes? This will delete all data! (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo docker volume ls --filter "label=com.docker.compose.project=dangerprep" -q | xargs -r sudo docker volume rm
fi

# Remove system scripts
echo "Removing system scripts..."
sudo rm -f /usr/local/bin/dangerprep-*

# Unmount NFS shares
if [ -f "./mount-nfs.sh" ]; then
    echo "Unmounting NFS shares..."
    sudo ./mount-nfs.sh unmount || true
fi

echo "Uninstall completed!"
echo "Note: Docker and system packages were not removed."
echo "Note: Content and configuration files were preserved."
