#!/bin/bash
set -e

# Comprehensive deployment script for DangerPrep Private CA
# This script sets up step-ca, configures Traefik, and migrates services

INSTALL_ROOT="${INSTALL_ROOT:-$(pwd)}"
STEP_CA_DIR="${INSTALL_ROOT}/docker/infrastructure/step-ca"

echo "🔐 DangerPrep Private CA Deployment"
echo "===================================="
echo ""

# Check if we're in the right directory
if [ ! -f "${INSTALL_ROOT}/docker/infrastructure/step-ca/compose.yml" ]; then
    echo "❌ Error: step-ca compose.yml not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check if password is set
if [ ! -f "${STEP_CA_DIR}/compose.env" ]; then
    echo "❌ Error: compose.env not found"
    echo "Please create ${STEP_CA_DIR}/compose.env with STEP_CA_PASSWORD set"
    exit 1
fi

# Source the environment file to check password
source "${STEP_CA_DIR}/compose.env"
if [ -z "$STEP_CA_PASSWORD" ] || [ "$STEP_CA_PASSWORD" = "your-secure-ca-password-here" ]; then
    echo "❌ Error: STEP_CA_PASSWORD not set or using default value"
    echo "Please edit ${STEP_CA_DIR}/compose.env and set a secure password"
    exit 1
fi

echo "✅ Configuration validated"
echo ""

# Step 1: Create Traefik network and start CDN
echo "📡 Setting up Docker networks and CDN..."
if ! docker network ls | grep -q "traefik"; then
    docker network create traefik
    echo "✅ Created Traefik network"
else
    echo "✅ Traefik network already exists"
fi

# Start CDN service first (needed for CA download page)
echo "🚀 Starting self-hosted CDN..."
cd "$INSTALL_ROOT"
docker compose -f docker/infrastructure/cdn/compose.yml up -d
echo "✅ CDN service started"

# Step 2: Make scripts executable and prepare secrets
echo "🔧 Setting up scripts and secrets..."
chmod +x "${STEP_CA_DIR}/setup-ca-trust.sh"
chmod +x "${STEP_CA_DIR}/init-ca.sh"
chmod +x "${STEP_CA_DIR}/fix-permissions.sh"
chmod +x "${STEP_CA_DIR}/prepare-secrets.sh"

# Prepare secrets with proper permissions
"${STEP_CA_DIR}/prepare-secrets.sh"
echo "✅ Scripts made executable and secrets prepared"

# Step 3: Start step-ca services
echo "🚀 Starting step-ca services..."
cd "$INSTALL_ROOT"
docker compose -f docker/infrastructure/step-ca/compose.yml up -d

echo "⏳ Waiting for step-ca to initialize..."
sleep 10

# Wait for step-ca to be healthy
timeout=120
while [ $timeout -gt 0 ]; do
    if docker compose -f docker/infrastructure/step-ca/compose.yml ps | grep -q "healthy"; then
        break
    fi
    echo "   Still waiting for step-ca to be healthy..."
    sleep 5
    timeout=$((timeout - 5))
done

if [ $timeout -le 0 ]; then
    echo "❌ step-ca failed to become healthy within 2 minutes"
    echo "Check logs: docker compose -f docker/infrastructure/step-ca/compose.yml logs"
    exit 1
fi

echo "✅ step-ca is running and healthy"

# Step 4: Configure trust
echo "🔒 Configuring certificate trust..."
"${STEP_CA_DIR}/setup-ca-trust.sh"

# Step 5: Services are already configured for step-ca
echo "✅ All services are pre-configured to use step-ca certificates"

# Step 6: Restart Traefik
echo "🔄 Restarting Traefik with new configuration..."
docker compose -f docker/infrastructure/traefik/compose.yml restart

echo "⏳ Waiting for Traefik to restart..."
sleep 10

# Step 7: Verify deployment
echo "🔍 Verifying deployment..."

# Check if step-ca is accessible
if curl -k -s https://ca.danger:9000/health > /dev/null 2>&1; then
    echo "✅ step-ca API is accessible"
else
    echo "⚠️  step-ca API not accessible (this is normal if DNS isn't configured yet)"
fi

# Check if download service is accessible
if curl -s http://root.danger > /dev/null 2>&1; then
    echo "✅ CA download service is accessible"
else
    echo "⚠️  CA download service not accessible (this is normal if DNS isn't configured yet)"
fi

# Step 8: Display summary
echo ""
echo "🎉 Private CA Deployment Complete!"
echo "=================================="
echo ""
echo "📋 Summary:"
echo "  • CDN service: https://cdn.danger"
echo "  • step-ca running at: https://ca.danger:9000"
echo "  • ACME directory: https://ca.danger:9000/acme/acme/directory"
echo "  • Download service: http://root.danger"
echo "  • Root certificate: ${INSTALL_ROOT}/data/step-ca/certs/root_ca.crt"
echo ""
echo "🔧 Next Steps:"
echo "  1. Configure your DNS to point ca.danger, root.danger, and cdn.danger to this server"
echo "  2. Visit http://root.danger to download and install the root certificate"
echo "  3. All services are already configured to use step-ca certificates"
echo "  4. Frontend assets are served from the local CDN at https://cdn.danger"
echo "  5. Monitor certificate issuance in Traefik logs"
echo ""
echo "📚 Useful Commands:"
echo "  • View CDN logs: docker compose -f docker/infrastructure/cdn/compose.yml logs -f"
echo "  • View step-ca logs: docker compose -f docker/infrastructure/step-ca/compose.yml logs -f"
echo "  • View Traefik logs: docker compose -f docker/infrastructure/traefik/compose.yml logs -f"
echo "  • List provisioners: docker exec step-ca_step-ca_1 step ca provisioner list"
echo "  • Check certificate: step ca certificate test.danger test.crt test.key --provisioner acme"
echo ""
echo "🔐 Security Notes:"
echo "  • Root certificate is at: ${INSTALL_ROOT}/data/step-ca/certs/root_ca.crt"
echo "  • CA password is stored in: ${STEP_CA_DIR}/compose.env"
echo "  • Keep backups of the CA data directory"
echo "  • Only install the root certificate on trusted devices"
echo ""

# Optional: Show QR code for mobile access
if command -v qrencode > /dev/null 2>&1; then
    echo "📱 QR Code for mobile access to download page:"
    echo "http://root.danger" | qrencode -t UTF8
    echo ""
fi

echo "✅ Deployment script completed successfully!"
