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
    @echo "  verify     - Verify deployment status"
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
    @echo "  wan-clear         - Clear WAN (emergency/offline mode)"
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
    @echo "  backup     - Create system backup"
    @echo "  logs       - Show recent service logs"
    @echo ""

# System Management
deploy:
    @echo "Deploying DangerPrep system..."
    @sudo ./scripts/setup/deploy-dangerprep.sh

verify:
    @echo "Verifying deployment..."
    @sudo ./scripts/setup/deploy-dangerprep.sh verify

update:
    @./scripts/maintenance/system-update.sh

uninstall:
    @./scripts/maintenance/system-uninstall.sh

# Service management
start:
    @./scripts/docker/start-services.sh

stop:
    @./scripts/docker/stop-services.sh

restart:
    @echo "Restarting DangerPrep services..."
    @just stop
    @sleep 5
    @just start

status:
    @./scripts/docker/service-status.sh

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
    @./scripts/maintenance/system-backup.sh

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





# Quick access to common tasks
alias install := deploy
alias up := start
alias down := stop
alias ps := status
