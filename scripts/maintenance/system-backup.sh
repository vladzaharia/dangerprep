#!/usr/bin/env bash
# Create system backup

echo "Creating system backup..."
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
sudo mkdir -p "$INSTALL_ROOT/data/backups"
sudo tar -czf "$INSTALL_ROOT/data/backups/dangerprep-backup-$(date +%Y%m%d-%H%M%S).tar.gz" \
    --exclude="$INSTALL_ROOT/content" \
    --exclude="$INSTALL_ROOT/nfs" \
    --exclude="$INSTALL_ROOT/data/backups" \
    "$INSTALL_ROOT/docker" "$INSTALL_ROOT/data" "$INSTALL_ROOT/content"
echo "Backup created in $INSTALL_ROOT/data/backups/"
