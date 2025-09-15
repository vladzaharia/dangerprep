#!/bin/sh

# DNS Registrar Service
# Watches Docker containers for dns.register labels and updates local DNS records

set -e

# Configuration
DOMAIN_NAME="${DOMAIN_NAME:-danger}"
EXTERNAL_DOMAIN_NAME="${EXTERNAL_DOMAIN_NAME:-danger.diy}"
DNS_CONFIG_DIR="/dns-config"
DNS_DB_FILE="${DNS_CONFIG_DIR}/db.${DOMAIN_NAME}"
EXTERNAL_DNS_DB_FILE="${DNS_CONFIG_DIR}/db.${EXTERNAL_DOMAIN_NAME}"
UPDATE_INTERVAL="${DNS_UPDATE_INTERVAL:-30}"
TRAEFIK_IP="172.20.0.3"  # Traefik container IP in dns network

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
            container_ip=$(docker inspect "$name" --format '{{range .NetworkSettings.Networks}}{{if eq .NetworkID "traefik"}}{{.IPAddress}}{{end}}{{end}}' 2>/dev/null || echo "")
            
            # If no traefik network IP, use traefik IP (for services behind traefik)
            if [ -z "$container_ip" ]; then
                container_ip="$TRAEFIK_IP"
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
ns1     IN      A       172.20.0.4

; Default records
@       IN      A       ${TRAEFIK_IP}
*       IN      A       ${TRAEFIK_IP}

EOF

    # Add container-specific records
    get_dns_registrations | while read -r domain ip; do
        if [ -n "$domain" ] && [ -n "$ip" ]; then
            # Remove .danger suffix if present to get base hostname
            hostname=$(echo "$domain" | sed "s/\.${DOMAIN_NAME}$//")

            # For .danger domain, use hostname as-is
            if [ "$domain_name" = "$DOMAIN_NAME" ]; then
                echo "${hostname}    IN      A       ${ip}" >> "$temp_file"
                log "Registered: ${hostname}.${domain_name} -> ${ip}"
            # For .danger.diy domain, use same hostname
            elif [ "$domain_name" = "$EXTERNAL_DOMAIN_NAME" ]; then
                echo "${hostname}    IN      A       ${ip}" >> "$temp_file"
                log "Registered: ${hostname}.${domain_name} -> ${ip}"
            fi
        fi
    done

    # Atomic update
    mv "$temp_file" "$zone_file"
}

# Generate both DNS zone files
generate_dns_zones() {
    log "Generating DNS zones for both domains..."
    generate_dns_zone_for_domain "$DNS_DB_FILE" "$DOMAIN_NAME"
    generate_dns_zone_for_domain "$EXTERNAL_DNS_DB_FILE" "$EXTERNAL_DOMAIN_NAME"
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
    log "Update interval: ${UPDATE_INTERVAL}s"

    while true; do
        log "Updating DNS registrations..."

        # Generate new zone files for both domains
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
