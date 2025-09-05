#!/bin/bash
set -e

# Script to prepare step-ca secrets with proper permissions
# Run this before starting the step-ca container

INSTALL_ROOT="${INSTALL_ROOT:-$(pwd)}"
SECRETS_DIR="${INSTALL_ROOT}/secrets/step-ca"

# Use direct mount point if available, otherwise fallback to INSTALL_ROOT
if mountpoint -q /data 2>/dev/null; then
    DATA_DIR="/data/step-ca"
else
    DATA_DIR="${INSTALL_ROOT}/data/step-ca"
fi

echo "🔐 Preparing step-ca secrets and permissions..."

# Create directories
mkdir -p "$SECRETS_DIR"
mkdir -p "$DATA_DIR"

# Check if password file exists
if [ ! -f "$SECRETS_DIR/ca_password" ]; then
    echo "❌ Error: CA password file not found at $SECRETS_DIR/ca_password"
    echo "Please create this file with a secure password first:"
    echo "  echo 'your-secure-password' > $SECRETS_DIR/ca_password"
    exit 1
fi

# Set proper permissions on secrets directory
chmod 700 "$SECRETS_DIR"
chmod 600 "$SECRETS_DIR/ca_password"

# Set proper permissions on data directory
# Use UID 1000 which is typically the step user in the container
chown -R 1000:1000 "$DATA_DIR" 2>/dev/null || echo "Warning: Could not change ownership of data directory"
chmod 755 "$DATA_DIR"

echo "✅ Secrets and permissions prepared successfully"
echo "📁 Secrets directory: $SECRETS_DIR"
echo "📁 Data directory: $DATA_DIR"
