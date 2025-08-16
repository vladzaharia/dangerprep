# DangerPrep Justfile
# Convenient commands for managing the DangerPrep system

# Show available commands
default:
    @just --list

# Show detailed help
help:
    @echo "DangerPrep Emergency Router & Content Hub"
    @echo "========================================="
    @echo ""
    @echo "🚨 EMERGENCY QUICK SETUP (Priority 1):"
    @echo "  emergency-router     - Quick setup: ethernet → WiFi hotspot"
    @echo "  emergency-repeater   - Quick setup: WiFi repeater mode"
    @echo "  emergency-local      - Quick setup: local network (no internet)"
    @echo "  emergency-health     - Quick system health check"
    @echo "  status               - Show system status (services, network, hardware)"
    @echo "  net-diag             - Run network diagnostics"
    @echo ""
    @echo "🌐 NETWORK MANAGEMENT:"
    @echo "  wan-list             - List available network interfaces"
    @echo "  wan-set <interface>  - Set WAN interface (others become LAN)"
    @echo "  wan-status           - Show WAN/LAN configuration"
    @echo "  wifi-scan            - Scan for WiFi networks"
    @echo "  wifi-connect <ssid> <pass> - Connect to WiFi"
    @echo "  wifi-ap <ssid> <pass> - Create WiFi access point"
    @echo "  net-connectivity     - Test internet connectivity"
    @echo "  net-wifi             - WiFi diagnostics"
    @echo ""
    @echo "🔧 SYSTEM CONTROL:"
    @echo "  start                - Start all services"
    @echo "  stop                 - Stop all services"
    @echo "  restart              - Restart all services"
    @echo "  route-start          - Start routing services"
    @echo "  route-stop           - Stop routing services"
    @echo "  fw-status            - Show firewall status"
    @echo "  fw-reset             - Reset firewall rules"
    @echo ""
    @echo "💾 MAINTENANCE & BACKUP:"
    @echo "  backup               - Create basic backup"
    @echo "  backup-encrypted     - Create encrypted backup"
    @echo "  backup-list          - List available backups"
    @echo "  system-maintenance   - Run system maintenance"
    @echo "  system-health        - Quick system health check"
    @echo "  clean                - Clean up system resources"
    @echo "  logs                 - Show recent service logs"
    @echo ""
    @echo "🔒 SECURITY & MONITORING:"
    @echo "  security-audit-all   - Run all security checks"
    @echo "  security-cron        - Run security checks (cron mode)"
    @echo "  hardware-monitor     - Monitor hardware health"
    @echo "  fan-status           - Check cooling fan status"
    @echo ""
    @echo "⚙️  ADVANCED SETUP:"
    @echo "  deploy               - Deploy/install entire system"
    @echo "  update               - Update from repository"
    @echo "  cleanup              - Uninstall system"
    @echo ""

# Emergency Quick Setup Commands
# Quick emergency router setup (WAN ethernet → WiFi hotspot)
emergency-router:
    @echo "🚨 Setting up emergency router (ethernet → WiFi)..."
    @just start
    @just wan-to-wifi
    @just status

# Quick emergency WiFi repeater setup
emergency-repeater:
    @echo "🚨 Setting up emergency WiFi repeater..."
    @just start
    @just wifi-repeater
    @just status

# Emergency local network (no internet)
emergency-local:
    @echo "🚨 Setting up emergency local network..."
    @just start
    @just local-only
    @just status

# Quick system health check for emergency scenarios
emergency-health:
    @echo "🚨 Emergency system health check..."
    @just status
    @echo ""
    @just net-connectivity
    @echo ""
    @just hardware-monitor

# System Management
deploy:
    @echo "Deploying DangerPrep system..."
    @sudo ./scripts/setup/setup-dangerprep.sh

cleanup:
    @echo "Cleaning up DangerPrep system..."
    @sudo ./scripts/setup/cleanup-dangerprep.sh

update:
    @./scripts/system/system-update.sh

uninstall:
    @./scripts/setup/cleanup-dangerprep.sh --force

# Service management
start:
    @./scripts/system/start-services.sh

stop:
    @./scripts/system/stop-services.sh

restart:
    @echo "Restarting DangerPrep services..."
    @just stop
    @sleep 5
    @just start

status:
    @./scripts/system/service-status.sh

olares:
    @echo "Olares/K3s Status:"
    @echo "=================="
    @kubectl get nodes 2>/dev/null || echo "K3s not running"
    @echo ""
    @kubectl get pods --all-namespaces 2>/dev/null || echo "No pods found"

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

# Network Diagnostics
# Run comprehensive network diagnostics
net-diag:
    @./scripts/network/network-diagnostics.sh all

# Test network connectivity
net-connectivity:
    @./scripts/network/network-diagnostics.sh connectivity

# Show network interface status
net-interfaces:
    @./scripts/network/network-diagnostics.sh interfaces

# Test DNS resolution
net-dns:
    @./scripts/network/network-diagnostics.sh dns

# WiFi diagnostics and scanning
net-wifi:
    @./scripts/network/network-diagnostics.sh wifi

# Basic network speed test
net-speed:
    @./scripts/network/network-diagnostics.sh speed

# System Maintenance
clean:
    @echo "Cleaning up system resources..."
    @sudo systemctl restart k3s 2>/dev/null || echo "K3s not running"
    @sudo journalctl --vacuum-time=7d
    @sudo apt autoremove -y
    @sudo apt autoclean

backup:
    @./scripts/backup/backup-manager.sh create basic

logs:
    #!/usr/bin/env bash
    echo "Recent service logs:"
    echo "==================="
    echo "K3s logs:"
    sudo journalctl -u k3s --no-pager -n 20 2>/dev/null || echo "K3s not running"
    echo ""
    echo "AdGuard Home logs:"
    sudo journalctl -u adguardhome --no-pager -n 20 2>/dev/null || echo "AdGuard Home not running"
    echo ""
    echo "Step-CA logs:"
    sudo journalctl -u step-ca --no-pager -n 20 2>/dev/null || echo "Step-CA not running"
    echo ""
    echo "Tailscale logs:"
    sudo journalctl -u tailscaled --no-pager -n 20 2>/dev/null || echo "Tailscale not running"





# Certificate Management
# Show certificate status for Traefik and Step-CA
certs-status:
    @./scripts/system/certs.sh status

# Setup Traefik ACME certificates
certs-traefik:
    @./scripts/system/certs.sh traefik

# Setup Step-CA internal certificates
certs-step-ca:
    @./scripts/system/certs.sh step-ca

# Security and Monitoring (Unified Commands)
# Run all security checks
security-audit-all:
    @./scripts/security/security-audit-all.sh all

# Run security checks in cron-friendly mode (quiet, logs to file)
security-cron:
    @./scripts/security/security-audit-all.sh cron

# Run specific security checks
aide-check:
    @./scripts/security/security-audit-all.sh aide

antivirus-scan:
    @./scripts/security/security-audit-all.sh antivirus

security-audit:
    @./scripts/security/security-audit-all.sh audit

rootkit-scan:
    @./scripts/security/security-audit-all.sh rootkit



# Run all monitoring checks
monitor-all:
    @./scripts/monitoring/monitor-all.sh all

# Run specific monitoring checks
system-monitor:
    @./scripts/monitoring/monitor-all.sh system

hardware-monitor:
    @./scripts/monitoring/monitor-all.sh hardware

monitor-continuous:
    @./scripts/monitoring/monitor-all.sh continuous

# System Maintenance (Consolidated)
# Run all system maintenance tasks
system-maintenance:
    @./scripts/system/system-maintenance.sh all

# Validate system configuration and dependencies
system-validate:
    @./scripts/system/system-maintenance.sh validate

# Quick system health check
system-health:
    @./scripts/system/system-maintenance.sh health



# Hardware Management
# Monitor hardware temperature and health
hardware-monitor:
    @./scripts/monitoring/hardware-monitor.sh check

# Generate comprehensive hardware report
hardware-report:
    @./scripts/monitoring/hardware-monitor.sh report

# FriendlyElec-specific hardware monitoring
hardware-friendlyelec:
    @./scripts/monitoring/hardware-monitor.sh friendlyelec

# RK3588 fan control commands
fan-start:
    @./scripts/monitoring/rk3588-fan-control.sh start

fan-stop:
    @./scripts/monitoring/rk3588-fan-control.sh stop

fan-status:
    @./scripts/monitoring/rk3588-fan-control.sh status

fan-test:
    @./scripts/monitoring/rk3588-fan-control.sh test

# System utilities
fix-permissions:
    @./scripts/system/system-maintenance.sh permissions

# Backup Management
# Create encrypted backup (recommended for production)
backup-encrypted:
    @./scripts/backup/backup-manager.sh create encrypted

# Create full system backup (includes all data)
backup-full:
    @./scripts/backup/backup-manager.sh create full

# Backup management commands
backup-list:
    @./scripts/backup/backup-manager.sh list

backup-restore backup:
    @./scripts/backup/backup-manager.sh restore {{backup}}

backup-cleanup days="30":
    @./scripts/backup/backup-manager.sh cleanup {{days}}

backup-verify backup:
    @./scripts/backup/backup-manager.sh verify {{backup}}

# Cron-compatible backup commands (used by automated backups)
backup-daily:
    @./scripts/backup/backup-manager.sh create encrypted

backup-weekly:
    @./scripts/backup/backup-manager.sh create full

backup-monthly:
    @./scripts/backup/backup-manager.sh create full

# Network Routing
# Setup WAN-to-WiFi routing
wan-to-wifi:
    @./scripts/network/wan-to-wifi.sh setup

# Setup WiFi repeater mode
wifi-repeater:
    @./scripts/network/wifi-repeater.sh setup

# Setup local only network
local-only:
    @./scripts/network/emergency-local.sh setup

# Setup QoS traffic shaping
qos-setup:
    @./scripts/network/qos.sh setup

# Show QoS status
qos-status:
    @./scripts/network/qos.sh status

# Quick access to common tasks
alias install := deploy
alias up := start
alias down := stop
alias ps := status
