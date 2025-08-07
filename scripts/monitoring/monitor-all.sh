#!/bin/bash
# DangerPrep Unified Monitoring Script
# Runs all monitoring checks and provides comprehensive reporting

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
LOG_FILE="/var/log/dangerprep-monitoring.log"
REPORT_FILE="/tmp/monitoring-report-$(date +%Y%m%d-%H%M%S).txt"

# Show banner
show_banner() {
    echo -e "${PURPLE}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                    DangerPrep Monitoring Suite                              ║
║                   Comprehensive System Monitoring                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Show help
show_help() {
    echo "DangerPrep Unified Monitoring Script"
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  system       Run system monitoring (CPU, memory, disk, network)"
    echo "  hardware     Run hardware monitoring (temperature, SMART)"
    echo "  all          Run all monitoring checks (default)"
    echo "  report       Generate comprehensive monitoring report"
    echo "  continuous   Run continuous monitoring (every 5 minutes)"
    echo "  help         Show this help message"
    echo
    echo "Examples:"
    echo "  $0 all           # Run all monitoring checks"
    echo "  $0 system        # Run only system monitoring"
    echo "  $0 continuous    # Start continuous monitoring"
}

# Run system monitoring
run_system_monitoring() {
    log "Running system monitoring..."
    
    if [[ -f "$SCRIPT_DIR/system-monitor.sh" ]]; then
        bash "$SCRIPT_DIR/system-monitor.sh" report
        success "System monitoring completed"
    else
        warning "System monitor script not found"
    fi
}

# Run hardware monitoring
run_hardware_monitoring() {
    log "Running hardware monitoring..."
    
    if [[ -f "$SCRIPT_DIR/hardware-monitor.sh" ]]; then
        bash "$SCRIPT_DIR/hardware-monitor.sh" report
        success "Hardware monitoring completed"
    else
        warning "Hardware monitor script not found"
    fi
}

# Run all monitoring checks
run_all_monitoring() {
    log "Running comprehensive system monitoring..."
    echo
    
    run_system_monitoring
    echo
    
    run_hardware_monitoring
    echo
    
    success "All monitoring checks completed"
    info "Detailed results available in individual log files"
    info "Comprehensive report available at: $REPORT_FILE"
}

# Generate comprehensive monitoring report
generate_report() {
    log "Generating comprehensive monitoring report..."
    
    {
        echo "DangerPrep System Monitoring Report"
        echo "Generated: $(date)"
        echo "========================================"
        echo
        
        echo "System Overview:"
        echo "  Hostname: $(hostname)"
        echo "  Uptime: $(uptime -p)"
        echo "  Load Average: $(cat /proc/loadavg | cut -d' ' -f1-3)"
        echo "  Users: $(who | wc -l) logged in"
        echo
        
        echo "CPU Information:"
        local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
        echo "  Usage: ${cpu_usage}%"
        echo "  Cores: $(nproc)"
        echo "  Model: $(grep "model name" /proc/cpuinfo | head -1 | cut -d':' -f2 | xargs)"
        echo
        
        echo "Memory Information:"
        local mem_info=$(free -h | grep "Mem:")
        echo "  Total: $(echo $mem_info | awk '{print $2}')"
        echo "  Used: $(echo $mem_info | awk '{print $3}')"
        echo "  Available: $(echo $mem_info | awk '{print $7}')"
        echo "  Usage: $(free | grep Mem | awk '{printf "%.1f%%", $3/$2 * 100.0}')"
        echo
        
        echo "Disk Information:"
        df -h | grep -E "^/dev/" | while read filesystem size used avail percent mount; do
            echo "  $mount: $used/$size ($percent)"
        done
        echo
        
        echo "Network Information:"
        echo "  Interfaces:"
        ip addr show | grep -E "^[0-9]+:" | awk '{print "    " $2}' | sed 's/://'
        echo "  Internet connectivity: $(ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1 && echo "OK" || echo "FAILED")"
        if command -v tailscale >/dev/null 2>&1; then
            echo "  Tailscale: $(tailscale status --json 2>/dev/null | grep -q '"BackendState":"Running"' && echo "Connected" || echo "Disconnected")"
        fi
        echo
        
        echo "Service Status:"
        local services=("ssh" "docker" "fail2ban" "hostapd" "dnsmasq")
        for service in "${services[@]}"; do
            local status=$(systemctl is-active "$service" 2>/dev/null || echo "inactive")
            echo "  $service: $status"
        done
        echo
        
        echo "Docker Information:"
        if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
            echo "  Status: Running"
            echo "  Containers: $(docker ps -q | wc -l) running, $(docker ps -aq | wc -l) total"
            echo "  Images: $(docker images -q | wc -l)"
            echo "  Networks: $(docker network ls -q | wc -l)"
        else
            echo "  Status: Not running or not accessible"
        fi
        echo
        
        echo "Hardware Status:"
        if command -v sensors >/dev/null 2>&1; then
            echo "  Temperature sensors available: Yes"
            local cpu_temp=$(sensors 2>/dev/null | grep -i "core\|cpu" | grep -o '[0-9]\+\.[0-9]\+°C' | head -1 || echo "N/A")
            echo "  CPU Temperature: $cpu_temp"
        else
            echo "  Temperature sensors: Not available"
        fi
        
        if command -v smartctl >/dev/null 2>&1; then
            echo "  SMART monitoring: Available"
            local disk_count=$(ls /dev/sd* /dev/nvme* 2>/dev/null | wc -l)
            echo "  Monitored disks: $disk_count"
        else
            echo "  SMART monitoring: Not available"
        fi
        echo
        
        echo "Recent System Events:"
        echo "  System boots (last 7 days): $(journalctl --since "7 days ago" | grep -c "systemd.*: Startup finished" || echo "0")"
        echo "  Kernel messages (last 24h): $(journalctl --since "24 hours ago" -k | wc -l)"
        echo "  Failed services (last 24h): $(journalctl --since "24 hours ago" --priority=err | wc -l)"
        echo
        
        echo "Storage Health:"
        echo "  Root filesystem: $(df -h / | tail -1 | awk '{print $5}') used"
        if [[ -d "/var/log" ]]; then
            echo "  Log directory size: $(du -sh /var/log 2>/dev/null | cut -f1 || echo "Unknown")"
        fi
        if [[ -d "/tmp" ]]; then
            echo "  Temp directory size: $(du -sh /tmp 2>/dev/null | cut -f1 || echo "Unknown")"
        fi
        echo
        
        echo "For detailed monitoring data, check:"
        echo "  System monitor log: /var/log/dangerprep-monitor.log"
        echo "  Hardware monitor log: /var/log/dangerprep-hardware.log"
        echo "  System journal: journalctl -f"
        
    } | tee "$REPORT_FILE"
    
    success "Monitoring report generated: $REPORT_FILE"
}

# Continuous monitoring mode
run_continuous_monitoring() {
    log "Starting continuous monitoring mode..."
    info "Monitoring will run every 5 minutes. Press Ctrl+C to stop."
    
    while true; do
        echo "$(date): Running monitoring cycle..."
        run_all_monitoring > /dev/null 2>&1
        echo "$(date): Monitoring cycle completed"
        sleep 300  # 5 minutes
    done
}

# Main function
main() {
    case "${1:-all}" in
        system)
            run_system_monitoring
            ;;
        hardware)
            run_hardware_monitoring
            ;;
        all)
            show_banner
            run_all_monitoring
            generate_report
            ;;
        report)
            generate_report
            ;;
        continuous)
            run_continuous_monitoring
            ;;
        help|--help|-h)
            show_help
            exit 0
            ;;
        *)
            error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Setup logging
mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true
touch "$LOG_FILE" 2>/dev/null || true

# Run main function
main "$@"
