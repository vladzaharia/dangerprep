#!/bin/sh

# DNS Registrar Service
# Watches Docker containers for dns.register labels and updates local DNS records

set -e

# Configuration
DOMAIN_NAME="${DOMAIN_NAME:-danger}"
EXTERNAL_DOMAIN_NAME="${EXTERNAL_DOMAIN_NAME:-danger.diy}"
ARGOS_DOMAIN_NAME="${ARGOS_DOMAIN_NAME:-argos.surf}"
DNS_CONFIG_DIR="/dns-config"
DNS_DB_FILE="${DNS_CONFIG_DIR}/db.${DOMAIN_NAME}"
EXTERNAL_DNS_DB_FILE="${DNS_CONFIG_DIR}/db.${EXTERNAL_DOMAIN_NAME}"
ARGOS_DNS_DB_FILE="${DNS_CONFIG_DIR}/db.${ARGOS_DOMAIN_NAME}"
UPDATE_INTERVAL="${DNS_UPDATE_INTERVAL:-30}"

# Detect host IP where Traefik is exposed on ports 80/443
detect_host_ip() {
    # Try environment variables first
    if [ -n "${HOST_IP:-}" ]; then
        echo "$HOST_IP"
        return
    fi
    if [ -n "${LAN_IP:-}" ]; then
        echo "$LAN_IP"
        return
    fi

    # Try to detect the default gateway (likely the host)
    local gateway_ip
    gateway_ip=$(ip route show default 2>/dev/null | awk '/default/ {print $3}' | head -1)
    if [ -n "$gateway_ip" ]; then
        echo "$gateway_ip"
        return
    fi

    # Fallback to common DangerPrep default
    echo "192.168.120.1"
}

HOST_IP=$(detect_host_ip)

# Install required packages
apk add --no-cache docker-cli jq curl

# Ensure DNS config directory exists
mkdir -p "$DNS_CONFIG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Get all containers with dns.register labels
get_dns_registrations() {
    docker ps --format "table {{.Names}}\t{{.Labels}}" | \
    grep "dns.register" | \
    while read -r name labels; do
        # Extract dns.register value from labels
        dns_domain=$(echo "$labels" | grep -o 'dns\.register=[^,]*' | cut -d'=' -f2)
        if [ -n "$dns_domain" ]; then
            # Get container IP in traefik network
            # Check if container is connected to traefik network and get its IP
            # For most services behind Traefik, this will be empty and we'll use Traefik's IP
            container_ip=$(docker inspect "$name" --format '{{with index .NetworkSettings.Networks "traefik"}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "")

            # If no traefik network IP, use host IP (where Traefik is exposed on ports 80/443)
            # This is the correct behavior - DNS should point to the host where Traefik is running
            if [ -z "$container_ip" ]; then
                container_ip="$HOST_IP"
                log "Container $name not in traefik network, using host IP: $HOST_IP"
            else
                log "Container $name found in traefik network with IP: $container_ip"
            fi

            echo "$dns_domain $container_ip"
        fi
    done
}

# Generate DNS zone file for a specific domain
generate_dns_zone_for_domain() {
    local zone_file="$1"
    local domain_name="$2"
    local temp_file="${zone_file}.tmp"

    # DNS zone header
    cat > "$temp_file" << EOF
\$TTL 300
@       IN      SOA     ns1.${domain_name}. admin.${domain_name}. (
                        $(date +%Y%m%d%H)  ; Serial
                        3600               ; Refresh
                        1800               ; Retry
                        604800             ; Expire
                        300 )              ; Minimum TTL

; Name servers
@       IN      NS      ns1.${domain_name}.
ns1     IN      A       172.21.0.4

; Default records
@       IN      A       ${HOST_IP}
*       IN      A       ${HOST_IP}

EOF

    # Add container-specific records
    get_dns_registrations | while read -r domain ip; do
        if [ -n "$domain" ] && [ -n "$ip" ]; then
            # Extract subdomain from dns.register label
            # Handle both full domain (subdomain.danger) and subdomain-only formats
            if echo "$domain" | grep -q "\."; then
                # Full domain format - extract subdomain
                hostname=$(echo "$domain" | sed "s/\.${DOMAIN_NAME}$//" | sed "s/\.${EXTERNAL_DOMAIN_NAME}$//" | sed "s/\.${ARGOS_DOMAIN_NAME}$//")
            else
                # Subdomain-only format - use as-is
                hostname="$domain"
            fi

            # Create DNS record for this domain
            echo "${hostname}    IN      A       ${ip}" >> "$temp_file"
            log "Registered: ${hostname}.${domain_name} -> ${ip}"
        fi
    done

    # Atomic update
    mv "$temp_file" "$zone_file"
}

# Generate all DNS zone files
generate_dns_zones() {
    log "Generating DNS zones for all domains..."
    generate_dns_zone_for_domain "$DNS_DB_FILE" "$DOMAIN_NAME"
    generate_dns_zone_for_domain "$EXTERNAL_DNS_DB_FILE" "$EXTERNAL_DOMAIN_NAME"
    generate_dns_zone_for_domain "$ARGOS_DNS_DB_FILE" "$ARGOS_DOMAIN_NAME"
}

# Reload CoreDNS configuration
reload_coredns() {
    # Send HUP signal to CoreDNS to reload configuration
    # Find the CoreDNS container using the service name pattern
    local coredns_container=$(docker ps --format "{{.Names}}" | grep "coredns" | head -1)
    if [ -n "$coredns_container" ]; then
        docker exec "$coredns_container" kill -HUP 1 2>/dev/null || true
    fi
}

# Main loop
main() {
    log "DNS Registrar starting..."
    log "Internal domain: ${DOMAIN_NAME}"
    log "External domain: ${EXTERNAL_DOMAIN_NAME}"
    log "Argos domain: ${ARGOS_DOMAIN_NAME}"
    log "Host IP (where Traefik is exposed): ${HOST_IP}"
    log "Update interval: ${UPDATE_INTERVAL}s"

    while true; do
        log "Updating DNS registrations..."

        # Generate new zone files for all domains
        generate_dns_zones

        # Reload CoreDNS
        reload_coredns

        log "DNS update complete"
        sleep "$UPDATE_INTERVAL"
    done
}

# Handle signals
trap 'log "Shutting down..."; exit 0' TERM INT

# Start main loop
main
