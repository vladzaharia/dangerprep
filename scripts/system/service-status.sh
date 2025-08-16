#!/bin/bash
# DangerPrep Service Status Script
# Shows status of all DangerPrep services

set -euo pipefail

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${PROJECT_ROOT}/scripts/shared/functions.sh"

# Load configuration
load_config

# Colors for status display
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

show_service_status() {
    local service=$1
    local name=$2
    
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        printf "  %-20s ${GREEN}●${NC} Running\n" "$name"
    elif systemctl is-enabled --quiet "$service" 2>/dev/null; then
        printf "  %-20s ${RED}●${NC} Stopped (enabled)\n" "$name"
    else
        printf "  %-20s ${YELLOW}●${NC} Disabled\n" "$name"
    fi
}

show_olares_status() {
    echo -e "${BLUE}Olares/K3s Services:${NC}"
    echo "====================="
    
    # K3s status
    show_service_status "k3s" "K3s"
    
    # Check if kubectl is available and working
    if command -v kubectl >/dev/null 2>&1 && kubectl get nodes >/dev/null 2>&1; then
        echo ""
        echo "Kubernetes Cluster:"
        kubectl get nodes 2>/dev/null || echo "  No nodes found"
        
        echo ""
        echo "Running Pods:"
        kubectl get pods --all-namespaces 2>/dev/null | head -10 || echo "  No pods found"
        
        local pod_count
        pod_count=$(kubectl get pods --all-namespaces --no-headers 2>/dev/null | wc -l)
        if [[ $pod_count -gt 10 ]]; then
            echo "  ... and $((pod_count - 10)) more pods"
        fi
    else
        echo "  Kubernetes API not accessible"
    fi
}

show_host_services_status() {
    echo -e "${BLUE}Host Services:${NC}"
    echo "=============="
    
    # Core services
    show_service_status "adguardhome" "AdGuard Home"
    show_service_status "step-ca" "Step-CA"
    
    # Network services
    show_service_status "tailscaled" "Tailscale"
    show_service_status "hostapd" "WiFi Hotspot"
    show_service_status "dnsmasq" "DHCP Server"
    
    # Security services
    show_service_status "fail2ban" "Fail2Ban"
    show_service_status "clamav-daemon" "ClamAV"

}

show_container_health() {
    echo -e "${BLUE}Container Health:${NC}"
    echo "================="

    if ! command -v docker >/dev/null 2>&1; then
        echo "  Docker not available"
        return
    fi

    # Check for unhealthy containers
    local unhealthy_containers=()
    while IFS= read -r container; do
        if [[ -n "$container" ]]; then
            unhealthy_containers+=("$container")
        fi
    done < <(docker ps --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null)

    # Check for stopped containers that should be running
    local stopped_containers=()
    while IFS= read -r container; do
        if [[ -n "$container" ]]; then
            stopped_containers+=("$container")
        fi
    done < <(docker ps -a --filter "status=exited" --filter "restart=unless-stopped" --format "{{.Names}}" 2>/dev/null)

    # Show container status summary
    local running_count
    running_count=$(docker ps --format "{{.Names}}" 2>/dev/null | wc -l)
    echo "  Running Containers: $running_count"

    if [[ ${#unhealthy_containers[@]} -gt 0 ]]; then
        echo "  ${RED}●${NC} Unhealthy: ${unhealthy_containers[*]}"
    fi

    if [[ ${#stopped_containers[@]} -gt 0 ]]; then
        echo "  ${YELLOW}●${NC} Stopped: ${stopped_containers[*]}"
    fi

    if [[ ${#unhealthy_containers[@]} -eq 0 && ${#stopped_containers[@]} -eq 0 ]]; then
        echo "  ${GREEN}●${NC} All containers healthy"
    fi

    # Show top resource-consuming containers
    echo
    echo "Top Resource Usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | head -6 || echo "  Unable to get container stats"
}

show_system_info() {
    echo -e "${BLUE}System Information:${NC}"
    echo "==================="
    
    # System load
    local load
    load=$(uptime | awk -F'load average:' '{print $2}' | xargs)
    echo "  Load Average:      $load"
    
    # Memory usage
    local memory
    memory=$(free -h | awk '/^Mem:/ {printf "%s/%s (%.1f%%)", $3, $2, ($3/$2)*100}')
    echo "  Memory Usage:      $memory"
    
    # Disk usage
    local disk
    disk=$(df -h / | awk 'NR==2 {printf "%s/%s (%s)", $3, $2, $5}')
    echo "  Disk Usage:        $disk"
    
    # Network interfaces
    echo "  Network Interfaces:"
    ip -br addr show | grep -E "(UP|UNKNOWN)" | while read -r line; do
        local iface
        iface=$(echo "$line" | awk '{print $1}')
        local ip
        ip=$(echo "$line" | awk '{print $3}' | cut -d'/' -f1)
        printf "    %-15s %s\n" "$iface" "$ip"
    done
}

show_quick_access() {
    echo -e "${BLUE}Quick Access:${NC}"
    echo "============="
    
    # Get LAN IP
    local lan_ip
    lan_ip=$(ip route get 1.1.1.1 | awk '{print $7; exit}' 2>/dev/null || echo "unknown")
    
    if [[ "$lan_ip" != "unknown" ]]; then
        echo "  AdGuard Home:      http://${lan_ip}:3000"
        echo "  Step-CA:           https://${lan_ip}:9000"
        
        # Check if Olares is accessible
        if systemctl is-active --quiet k3s 2>/dev/null; then
            echo "  Olares Dashboard:  https://${lan_ip}:6443"
        fi
    fi
    
    echo "  SSH Access:        ssh ubuntu@${lan_ip}:2222"
    
    # Tailscale status
    if command -v tailscale >/dev/null 2>&1; then
        local ts_status
        ts_status=$(tailscale status --json 2>/dev/null | jq -r '.BackendState' 2>/dev/null || echo "unknown")
        echo "  Tailscale:         $ts_status"
    fi
}

main() {
    # Display banner
    show_banner "DangerPrep Service Status"
    
    # Show Olares status
    show_olares_status
    echo ""
    
    # Show host services status
    show_host_services_status
    echo ""

    # Show container health
    show_container_health
    echo ""

    # Show system information
    show_system_info
    echo ""
    
    # Show quick access information
    show_quick_access
    
    echo ""
    echo "Use 'just logs' to view recent service logs"
    echo "Use 'just olares' for detailed Olares/K3s status"
}

# Run main function
main "$@"
