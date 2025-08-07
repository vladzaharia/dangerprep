#!/usr/bin/env bash
# Update DangerPrep system from repository

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
