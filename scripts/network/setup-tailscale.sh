#!/usr/bin/env bash
# Setup Tailscale with authentication

if [ -z "$TAILSCALE_AUTH_KEY" ]; then
    echo "Error: TAILSCALE_AUTH_KEY environment variable not set"
    echo "Please run: export TAILSCALE_AUTH_KEY='your-auth-key'"
    exit 1
fi

echo "Setting up Tailscale..."
sudo dangerprep-tailscale install 2>/dev/null || sudo ./scripts/setup-tailscale.sh install
