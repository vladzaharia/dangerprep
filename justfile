# DangerPrep Justfile
# Convenient commands for managing the DangerPrep system

# Show available commands
default:
    @just --list

# Show detailed help
help:
    @echo "DangerPrep Management Commands"
    @echo "=============================="
    @echo ""
    @echo "System Management:"
    @echo "  deploy     - Deploy/install the entire DangerPrep system"
    @echo "  cleanup    - Clean up/uninstall DangerPrep system"
    @echo "  update     - Update system from repository"
    @echo "  uninstall  - Uninstall system (preserves data)"
    @echo ""
    @echo "Service Management:"
    @echo "  start      - Start all Docker services"
    @echo "  stop       - Stop all Docker services"
    @echo "  restart    - Restart all Docker services"
    @echo "  status     - Show service status"
    @echo ""
    @echo "WAN Management:"
    @echo "  wan-list          - List all available interfaces"
    @echo "  wan-set <if>      - Set interface as WAN (others become LAN)"
    @echo "  wan-clear         - Clear WAN (local only mode)"
    @echo "  wan-status        - Show current WAN/LAN configuration"
    @echo ""
    @echo "Routing:"
    @echo "  route-start [ssid] [pass] - Start routing with current WAN config"
    @echo "  route-stop        - Stop routing"
    @echo "  route-status      - Show routing status"
    @echo "  route-restart     - Restart routing"
    @echo ""
    @echo "WiFi Management:"
    @echo "  wifi-scan         - Scan for available WiFi networks"
    @echo "  wifi-connect <ssid> <pass> - Connect to WiFi network"
    @echo "  wifi-ap <ssid> <pass>      - Create WiFi access point"
    @echo "  wifi-status       - Show WiFi interface status"
    @echo ""
    @echo "Firewall Management:"
    @echo "  fw-status         - Show firewall rules and status"
    @echo "  fw-reset          - Reset firewall to default rules"
    @echo "  fw-port-forward <port> <target> - Add port forwarding rule"
    @echo ""
    @echo "System Maintenance:"
    @echo "  clean      - Clean up unused Docker resources"
    @echo "  backup-create-basic    - Create basic backup"
    @echo "  backup-create-encrypted - Create encrypted backup"
    @echo "  backup-list            - List available backups"
    @echo "  logs       - Show recent service logs"
    @echo ""
    @echo "Security & Monitoring:"
    @echo "  security-audit-all     - Run all security checks"
    @echo "  monitor-all           - Run all monitoring checks"
    @echo "  validate-all          - Run all validation checks"
    @echo "  aide-check            - Run AIDE integrity check"
    @echo "  antivirus-scan        - Run antivirus scan"
    @echo ""
    @echo "Network Routing:"
    @echo "  wan-to-wifi           - Setup WAN-to-WiFi routing"
    @echo "  wifi-repeater         - Setup WiFi repeater mode"
    @echo "  local-only            - Setup local only network"
    @echo "  qos-setup             - Setup QoS traffic shaping"
    @echo ""

# System Management
deploy:
    @echo "Deploying DangerPrep system..."
    @sudo ./scripts/setup.sh

cleanup:
    @echo "Cleaning up DangerPrep system..."
    @sudo ./scripts/cleanup.sh

update:
    @echo "Update functionality not yet implemented in new structure"
    # @./scripts/system/system-update.sh

uninstall:
    @echo "Uninstall functionality not yet implemented in new structure"
    # @./scripts/system/system-uninstall.sh

# Service management
start:
    @echo "Service start functionality not yet implemented in new structure"
    # @./scripts/docker/start-services.sh

stop:
    @echo "Service stop functionality not yet implemented in new structure"
    # @./scripts/docker/stop-services.sh

restart:
    @echo "Restarting DangerPrep services..."
    @just stop
    @sleep 5
    @just start

status:
    @echo "Service status functionality not yet implemented in new structure"
    # @./scripts/docker/service-status.sh

# NOTE: The following commands reference scripts that were removed during cleanup
# These commands are preserved for reference but will not work until the scripts are reimplemented
# Only setup.sh and cleanup.sh are currently functional

# WAN Management
wan-list:
    @echo "Listing available interfaces..."
    @./scripts/network/interface-manager.sh list

wan-set interface:
    @echo "Setting {{interface}} as WAN interface..."
    @sudo ./scripts/network/interface-manager.sh set-wan {{interface}}

wan-clear:
    @echo "Clearing WAN interface designation..."
    @sudo ./scripts/network/interface-manager.sh clear-wan

wan-status:
    @echo "Current WAN/LAN configuration..."
    @./scripts/network/interface-manager.sh config



# Routing Management
route-start *args:
    @echo "Starting dynamic routing..."
    @sudo ./scripts/network/route-manager.sh start {{args}}

route-stop:
    @echo "Stopping routing..."
    @sudo ./scripts/network/route-manager.sh stop

route-status:
    @echo "Checking routing status..."
    @./scripts/network/route-manager.sh status

route-restart *args:
    @echo "Restarting routing..."
    @sudo ./scripts/network/route-manager.sh restart {{args}}

# WiFi Management
wifi-scan:
    @echo "Scanning for WiFi networks..."
    @./scripts/network/wifi-manager.sh scan

wifi-connect ssid password:
    @echo "Connecting to WiFi network {{ssid}}..."
    @sudo ./scripts/network/wifi-manager.sh connect "{{ssid}}" "{{password}}"

wifi-ap ssid password:
    @echo "Creating WiFi access point {{ssid}}..."
    @sudo ./scripts/network/wifi-manager.sh ap "{{ssid}}" "{{password}}"

wifi-status:
    @echo "WiFi interface status..."
    @./scripts/network/wifi-manager.sh status

# Firewall Management
fw-status:
    @echo "Firewall status..."
    @./scripts/network/firewall-manager.sh status

fw-reset:
    @echo "Resetting firewall to defaults..."
    @sudo ./scripts/network/firewall-manager.sh reset

fw-port-forward port target:
    @echo "Adding port forwarding {{port}} → {{target}}..."
    @sudo ./scripts/network/firewall-manager.sh port-forward {{port}} {{target}}

# System Maintenance
clean:
    @echo "Cleaning up Docker resources..."
    @sudo docker system prune -f
    @sudo docker volume prune -f
    @sudo docker network prune -f

backup:
    @./scripts/backup/backup-manager.sh create basic

logs:
    #!/usr/bin/env bash
    echo "Recent service logs:"
    echo "==================="
    echo "Traefik logs:"
    sudo docker logs --tail=20 traefik 2>/dev/null || echo "Traefik not running"
    echo ""
    echo "Jellyfin logs:"
    sudo docker logs --tail=20 jellyfin 2>/dev/null || echo "Jellyfin not running"
    echo ""
    echo "Portal logs:"
    sudo docker logs --tail=20 portal 2>/dev/null || echo "Portal not running"





# Certificate Management
# Show certificate status for Traefik and Step-CA
certs-status:
    @scripts/system/certs.sh status

# Setup Traefik ACME certificates
certs-traefik:
    @scripts/system/certs.sh traefik

# Setup Step-CA internal certificates
certs-step-ca:
    @scripts/system/certs.sh step-ca

# Security and Monitoring (Unified Commands)
# Run all security checks
security-audit-all:
    @scripts/security/security-audit-all.sh all

# Run specific security checks
aide-check:
    @scripts/security/security-audit-all.sh aide

antivirus-scan:
    @scripts/security/security-audit-all.sh antivirus

security-audit:
    @scripts/security/security-audit-all.sh audit

rootkit-scan:
    @scripts/security/security-audit-all.sh rootkit

suricata-monitor:
    @scripts/security/security-audit-all.sh suricata

# Run all monitoring checks
monitor-all:
    @scripts/monitoring/monitor-all.sh all

# Run specific monitoring checks
system-monitor:
    @scripts/monitoring/monitor-all.sh system

hardware-monitor:
    @scripts/monitoring/monitor-all.sh hardware

monitor-continuous:
    @scripts/monitoring/monitor-all.sh continuous

# Validation Commands (Unified)
validate-all:
    @scripts/validation/validate-system.sh all

validate-compose:
    @scripts/validation/validate-system.sh compose

validate-references:
    @scripts/validation/validate-system.sh references

validate-docker:
    @scripts/validation/validate-system.sh docker

validate-nfs:
    @scripts/validation/validate-system.sh nfs

# Check container health
container-health:
    @scripts/docker/container-health.sh check

# System utilities
fix-permissions:
    @scripts/system/fix-permissions.sh

audit-shell-scripts:
    @scripts/system/audit-shell-scripts.sh

# Backup Management (Unified)
# Create different types of backups
backup-create-basic:
    @scripts/backup/backup-manager.sh create basic

backup-create-encrypted:
    @scripts/backup/backup-manager.sh create encrypted

backup-create-full:
    @scripts/backup/backup-manager.sh create full

# Backup management
backup-list:
    @scripts/backup/backup-manager.sh list

backup-restore backup:
    @scripts/backup/backup-manager.sh restore {{backup}}

backup-cleanup days="30":
    @scripts/backup/backup-manager.sh cleanup {{days}}

backup-verify backup:
    @scripts/backup/backup-manager.sh verify {{backup}}

# Legacy backup commands (for cron compatibility)
backup-daily:
    @scripts/backup/backup-manager.sh create encrypted

backup-weekly:
    @scripts/backup/backup-manager.sh create full

backup-monthly:
    @scripts/backup/backup-manager.sh create full

# Network Routing
# Setup WAN-to-WiFi routing
wan-to-wifi:
    @scripts/network/wan-to-wifi.sh setup

# Setup WiFi repeater mode
wifi-repeater:
    @scripts/network/wifi-repeater.sh setup

# Setup local only network
local-only:
    @scripts/network/emergency-local.sh setup

# Setup QoS traffic shaping
qos-setup:
    @scripts/network/qos.sh setup

# Show QoS status
qos-status:
    @scripts/network/qos.sh status

# Quick access to common tasks
alias install := deploy
alias up := start
alias down := stop
alias ps := status
