#!/bin/bash
# DangerPrep Certificate Management
# Integrates with Traefik (ACME/Let's Encrypt) and Step-CA (internal CA)

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../shared/banner.sh"

show_banner_with_title "Certificate Manager" "system"
echo

DOCKER_DIR="/opt/dangerprep/docker"
TRAEFIK_DIR="${DOCKER_DIR}/infrastructure/traefik"
STEP_CA_DIR="${DOCKER_DIR}/infrastructure/step-ca"

setup_traefik_certificates() {
    echo "Setting up Traefik ACME certificates..."

    # Check if Traefik is running
    if ! docker ps | grep -q traefik; then
        echo "Traefik container not running. Starting Traefik..."
        cd "${TRAEFIK_DIR}" && docker compose up -d
        sleep 10
    fi

    # Traefik handles ACME automatically via configuration
    echo "Traefik will automatically obtain certificates via ACME"
    echo "Check Traefik dashboard for certificate status"
}

setup_step_ca() {
    echo "Setting up Step-CA internal certificate authority..."

    # Check if Step-CA is running
    if ! docker ps | grep -q step-ca; then
        echo "Step-CA container not running. Starting Step-CA..."
        cd "${STEP_CA_DIR}" && docker compose up -d
        sleep 10
    fi

    echo "Step-CA provides internal certificates for local services"
    echo "Access the CA at https://ca.dangerprep.local"
}

show_traefik_certificates() {
    echo "Traefik Certificate Status:"
    echo "=========================="

    if docker ps | grep -q traefik; then
        echo "Traefik is running"

        # Check Traefik logs for certificate info
        echo "Recent certificate activity:"
        docker logs traefik 2>&1 | grep -i "certificate\|acme" | tail -10 || echo "No certificate logs found"

        echo ""
        echo "Access Traefik dashboard at: https://traefik.dangerprep.local"
    else
        echo "Traefik is not running"
    fi
}

show_step_ca_status() {
    echo "Step-CA Status:"
    echo "==============="

    if docker ps | grep -q step-ca; then
        echo "Step-CA is running"

        # Check Step-CA container logs
        echo "Step-CA container status:"
        docker ps --filter "name=step-ca" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

        echo ""
        echo "Access Step-CA at: https://ca.dangerprep.local"
        echo "Download root CA: https://ca.dangerprep.local/roots.pem"
    else
        echo "Step-CA is not running"
    fi
}

case "${1:-status}" in
    traefik)
        setup_traefik_certificates
        ;;
    step-ca)
        setup_step_ca
        ;;
    status)
        show_traefik_certificates
        echo ""
        show_step_ca_status
        ;;
    *)
        echo "DangerPrep Certificate Management"
        echo "Usage: $0 {traefik|step-ca|status}"
        echo
        echo "Commands:"
        echo "  traefik  - Setup/check Traefik ACME certificates"
        echo "  step-ca  - Setup/check Step-CA internal certificates"
        echo "  status   - Show certificate status for both services"
        echo
        echo "Note: Certificates are managed by Docker containers:"
        echo "  - Traefik: ACME/Let's Encrypt for public certificates"
        echo "  - Step-CA: Internal CA for private certificates"
        exit 1
        ;;
esac
