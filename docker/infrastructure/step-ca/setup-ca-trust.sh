#!/bin/bash
set -e

# Setup script to configure step-ca trust for Traefik and other services
# This script should be run after step-ca is initialized

INSTALL_ROOT="${INSTALL_ROOT:-$(pwd)}"

# Use direct mount points if available, otherwise fallback to INSTALL_ROOT
if mountpoint -q /data 2>/dev/null; then
    STEP_CA_DATA_DIR="/data/step-ca"
    TRAEFIK_DATA_DIR="/data/traefik"
else
    STEP_CA_DATA_DIR="${INSTALL_ROOT}/data/step-ca"
    TRAEFIK_DATA_DIR="${INSTALL_ROOT}/data/traefik"
fi

ROOT_CERT_PATH="${STEP_CA_DATA_DIR}/certs/root_ca.crt"

echo "Setting up step-ca trust configuration..."

# Wait for step-ca to be initialized
echo "Waiting for step-ca to initialize..."
timeout=60
while [ $timeout -gt 0 ] && [ ! -f "$ROOT_CERT_PATH" ]; do
    sleep 2
    timeout=$((timeout - 2))
done

if [ ! -f "$ROOT_CERT_PATH" ]; then
    echo "Error: step-ca root certificate not found at $ROOT_CERT_PATH"
    echo "Make sure step-ca is running and initialized"
    exit 1
fi

echo "Found step-ca root certificate"

# Create Traefik data directory if it doesn't exist
mkdir -p "$TRAEFIK_DATA_DIR"

# Copy root certificate to Traefik data directory for reference
cp "$ROOT_CERT_PATH" "$TRAEFIK_DATA_DIR/step-ca-root.crt"

echo "Root certificate copied to Traefik data directory"

# Create a combined CA bundle for system trust
CA_BUNDLE_PATH="${TRAEFIK_DATA_DIR}/ca-bundle.crt"

# Start with step-ca root certificate
cp "$ROOT_CERT_PATH" "$CA_BUNDLE_PATH"

# Add system CA certificates if available
if [ -f /etc/ssl/certs/ca-certificates.crt ]; then
    echo "" >> "$CA_BUNDLE_PATH"
    cat /etc/ssl/certs/ca-certificates.crt >> "$CA_BUNDLE_PATH"
elif [ -f /etc/pki/tls/certs/ca-bundle.crt ]; then
    echo "" >> "$CA_BUNDLE_PATH"
    cat /etc/pki/tls/certs/ca-bundle.crt >> "$CA_BUNDLE_PATH"
fi

echo "CA bundle created at $CA_BUNDLE_PATH"

# Set environment variable for ACME client trust
export LEGO_CA_CERTIFICATES="$ROOT_CERT_PATH"

echo "Step-ca trust configuration complete!"
echo ""
echo "Next steps:"
echo "1. Restart Traefik to pick up the new certificate resolver"
echo "2. Update service labels to use 'step-ca' instead of 'cloudflare' resolver"
echo "3. Access the CA download page at http://root.danger"
echo ""
echo "ACME Directory URL: https://ca.danger:9000/acme/acme/directory"
echo "Root Certificate: $ROOT_CERT_PATH"
