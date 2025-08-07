#!/usr/bin/env bash
# Update DangerPrep system from repository

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

show_banner_with_title "System Updater" "system"
echo

echo "Updating DangerPrep system..."

# Update from git repository
if [ -d ".git" ]; then
    echo "Pulling latest changes from repository..."
    git pull origin main || git pull origin master
else
    echo "Not a git repository. Please update manually."
fi

# Update just binaries
echo "Updating just binaries..."
./lib/just/download.sh --force

# Restart services to apply updates
echo "Restarting services..."
just restart

echo "Update completed!"
