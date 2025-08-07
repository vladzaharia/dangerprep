#!/bin/bash
# DangerPrep Main Management Script

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

show_banner() {
    echo -e "${PURPLE}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                           DangerPrep Management                             ║
║                    Emergency Router & Content Hub                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

show_help() {
    echo "DangerPrep Management Commands:"
    echo
    echo "System Management:"
    echo "  status          - Show system status"
    echo "  monitor         - Run system monitoring"
    echo "  backup          - Create encrypted backup"
    echo "  restore         - Restore from backup"
    echo
    echo "Network Management:"
    echo "  wifi            - WiFi hotspot management"
    echo "  qos             - QoS traffic shaping"
    echo "  firewall        - Firewall management"
    echo
    echo "Routing Scenarios:"
    echo "  wan-to-wifi     - Ethernet WAN to WiFi hotspot"
    echo "  wifi-repeater   - WiFi repeater mode"
    echo "  local-only      - Local only network (no internet)"
    echo
    echo "Security Management:"
    echo "  security-audit  - Run security audit"
    echo "  aide-check      - File integrity check"
    echo "  antivirus       - Antivirus scan"
    echo "  rootkit-scan    - Rootkit detection"
    echo
    echo "Container Management:"
    echo "  containers      - Container health check"
    echo "  docker-status   - Docker service status"
    echo
    echo "Certificate Management:"
    echo "  certs           - Certificate management"
    echo
    echo "Hardware Management:"
    echo "  hardware        - Hardware monitoring"
    echo "  sensors         - Show sensor readings"
    echo
    echo "Usage: dangerprep <command> [options]"
}

run_command() {
    local command="$1"
    shift
    
    case "$command" in
        status)
            echo -e "${CYAN}System Status:${NC}"
            /usr/local/bin/dangerprep-monitor report
            ;;
        monitor)
            /usr/local/bin/dangerprep-monitor check
            ;;
        backup)
            /usr/local/bin/dangerprep-backup-encrypted "${1:-daily}"
            ;;
        restore)
            /usr/local/bin/dangerprep-restore-backup interactive
            ;;
        wifi)
            echo "WiFi Hotspot Status:"
            systemctl status hostapd
            echo
            echo "Connected clients:"
            iw dev wlan0 station dump 2>/dev/null || echo "No clients connected"
            ;;
        qos)
            /usr/local/bin/dangerprep-qos "${1:-status}"
            ;;
        firewall)
            echo "Firewall Rules:"
            iptables -L -n
            ;;
        security-audit)
            /usr/local/bin/dangerprep-security-audit
            ;;
        aide-check)
            /usr/local/bin/dangerprep-aide-check
            ;;
        antivirus)
            /usr/local/bin/dangerprep-antivirus-scan
            ;;
        rootkit-scan)
            /usr/local/bin/dangerprep-rootkit-scan
            ;;
        containers)
            /usr/local/bin/dangerprep-container-health "${1:-check}"
            ;;
        docker-status)
            echo "Docker Service Status:"
            systemctl status docker
            echo
            echo "Running Containers:"
            docker ps
            ;;
        certs)
            /usr/local/bin/dangerprep-certs "${1:-status}"
            ;;
        hardware)
            /usr/local/bin/dangerprep-hardware-monitor "${1:-check}"
            ;;
        sensors)
            sensors 2>/dev/null || echo "Sensors not available"
            ;;
        wan-to-wifi)
            /usr/local/bin/dangerprep-wan-to-wifi "${1:-status}"
            ;;
        wifi-repeater)
            /usr/local/bin/dangerprep-wifi-repeater "${1:-status}"
            ;;
        emergency-local)
            /usr/local/bin/dangerprep-emergency-local "${1:-status}"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            echo "Use 'dangerprep help' for available commands"
            exit 1
            ;;
    esac
}

# Main execution
if [[ $# -eq 0 ]]; then
    show_banner
    show_help
else
    run_command "$@"
fi
