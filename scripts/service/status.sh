#!/usr/bin/env bash
# DangerPrep Service Status Script
# Shows status of all DangerPrep services

# Modern shell script best practices
set -euo pipefail

# Script metadata


# Source shared utilities
# shellcheck source=../shared/logging.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/logging.sh"
# shellcheck source=../shared/errors.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/errors.sh"
# shellcheck source=../shared/validation.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/banner.sh"
# shellcheck source=../shared/state/system.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/state/system.sh"
# shellcheck source=../shared/system.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/system.sh"

# Configuration variables
readonly DEFAULT_LOG_FILE="/var/log/dangerprep-service-status.log"

# Colors for status display (keeping for visual output)
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "Service status check failed with exit code ${exit_code}"

    # No specific cleanup needed for status checking

    error "Cleanup completed"
    exit "${exit_code}"
}

# Initialize script
init_script() {
    set_error_context "Script initialization"
    set_log_file "${DEFAULT_LOG_FILE}"

    # Set up error handling
    trap cleanup_on_error ERR

    # Validate required commands
    require_commands systemctl kubectl

    debug "Service status checker initialized"
    clear_error_context
}

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

show_package_health() {
    echo -e "${BLUE}Package Health:${NC}"
    echo "==============="

    # Package statistics
    local package_count
    package_count=$(get_package_count)
    echo "  Installed Packages: ${package_count}"

    local upgradable_count
    upgradable_count=$(get_upgradable_packages)
    if [[ ${upgradable_count} -gt 0 ]]; then
        if [[ ${upgradable_count} -gt 20 ]]; then
            echo "  ${RED}●${NC} Updates Available: ${upgradable_count} (many)"
        elif [[ ${upgradable_count} -gt 5 ]]; then
            echo "  ${YELLOW}●${NC} Updates Available: ${upgradable_count} (some)"
        else
            echo "  ${GREEN}●${NC} Updates Available: ${upgradable_count} (few)"
        fi
    else
        echo "  ${GREEN}●${NC} All packages up to date"
    fi

    # Package manager status
    echo
    echo "Package Manager:"
    if command -v apt >/dev/null 2>&1; then
        echo "  Type: APT (Debian/Ubuntu)"
        local last_update
        if [[ -f /var/lib/apt/periodic/update-success-stamp ]]; then
            last_update=$(stat -c %Y /var/lib/apt/periodic/update-success-stamp 2>/dev/null)
            if [[ -n "${last_update}" ]]; then
                local update_date
                update_date=$(date -d "@${last_update}" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "unknown")
                echo "  Last Update: ${update_date}"
            fi
        fi
    elif command -v yum >/dev/null 2>&1; then
        echo "  Type: YUM (Red Hat/CentOS)"
    else
        echo "  Type: Unknown"
    fi
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

# Update system state with current service status
update_service_states() {
    # Update Olares status
    if is_k3s_running; then
        set_service_status "olares" "running"
    else
        set_service_status "olares" "stopped"
    fi

    # Update host services status
    local host_services=("adguardhome" "step-ca" "tailscaled")
    local running_count=0
    local total_count=${#host_services[@]}

    for service in "${host_services[@]}"; do
        if is_service_running "${service}"; then
            ((running_count++))
        fi
    done

    if [[ ${running_count} -eq ${total_count} ]]; then
        set_service_status "host_services" "running"
    elif [[ ${running_count} -gt 0 ]]; then
        set_service_status "host_services" "partial"
    else
        set_service_status "host_services" "stopped"
    fi

    # Update system health score
    local health_score
    health_score=$(calculate_system_health_score)
    set_system_health_score "${health_score}"
}

# Show system health overview
show_system_health_overview() {
    echo -e "${BLUE}System Health Overview:${NC}"
    echo "======================="

    local health_score
    health_score=$(get_system_health_score)
    local health_status
    health_status=$(get_system_health_status)

    echo "  Overall Health:    ${health_score}/100 (${health_status})"
    echo "  System Mode:       $(get_system_mode)"
    echo "  Auto Management:   $(is_system_auto_mode_enabled && echo "Enabled" || echo "Disabled")"

    # Show critical issues if any
    if [[ ${health_score} -lt 60 ]]; then
        echo "  Critical Issues:"
        get_system_recommendations | head -3 | while IFS= read -r recommendation; do
            echo "    ⚠ ${recommendation}"
        done
    fi
}

show_quick_access() {
    echo -e "${BLUE}Quick Access:${NC}"
    echo "============="

    # Get LAN IP
    local lan_ip
    lan_ip=$(get_primary_ip)

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
    local ts_status
    ts_status=$(get_tailscale_status)
    echo "  Tailscale:         $ts_status"
}

main() {
    # Initialize script
    init_script

    # Display banner
    show_banner_with_title "Service Status" "system"

    # Update system state with current service status
    update_service_states

    # Show system health overview
    show_system_health_overview
    echo ""

    # Show Olares status
    show_olares_status
    echo ""

    # Show host services status
    show_host_services_status
    echo ""

    # Show package health
    show_package_health
    echo ""

    # Show system information
    show_system_info
    echo ""

    # Show quick access information
    show_quick_access

    echo ""
    echo "Use 'just logs' to view recent service logs"
    echo "Use 'just olares' for detailed Olares/K3s status"
    echo "Use 'just system-diagnostics' for comprehensive analysis"
}

# Run main function
main "$@"
