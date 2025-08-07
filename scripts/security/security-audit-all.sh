#!/bin/bash
# DangerPrep Unified Security Audit Script
# Runs all security checks and provides comprehensive reporting

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
LOG_FILE="/var/log/dangerprep-security-audit.log"
REPORT_FILE="/tmp/security-audit-$(date +%Y%m%d-%H%M%S).txt"

# Show banner
show_banner() {
    echo -e "${PURPLE}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                    DangerPrep Security Audit Suite                          ║
║                     Comprehensive Security Assessment                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Show help
show_help() {
    echo "DangerPrep Unified Security Audit Script"
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  aide         Run AIDE integrity check"
    echo "  antivirus    Run ClamAV antivirus scan"
    echo "  lynis        Run Lynis security audit"
    echo "  rootkit      Run rootkit detection scan"
    echo "  audit        Run general security audit"
    echo "  suricata     Check Suricata IDS status"
    echo "  all          Run all security checks (default)"
    echo "  report       Generate comprehensive security report"
    echo "  help         Show this help message"
    echo
    echo "Examples:"
    echo "  $0 all       # Run all security checks"
    echo "  $0 aide      # Run only AIDE integrity check"
    echo "  $0 report    # Generate security report"
}

# Run AIDE integrity check
run_aide_check() {
    log "Running AIDE integrity check..."
    
    if command -v aide >/dev/null 2>&1; then
        if [[ -f "$SCRIPT_DIR/aide-check.sh" ]]; then
            bash "$SCRIPT_DIR/aide-check.sh"
            success "AIDE check completed"
        else
            warning "AIDE check script not found"
        fi
    else
        warning "AIDE not installed"
    fi
}

# Run antivirus scan
run_antivirus_scan() {
    log "Running ClamAV antivirus scan..."
    
    if command -v clamscan >/dev/null 2>&1; then
        if [[ -f "$SCRIPT_DIR/antivirus-scan.sh" ]]; then
            bash "$SCRIPT_DIR/antivirus-scan.sh"
            success "Antivirus scan completed"
        else
            warning "Antivirus scan script not found"
        fi
    else
        warning "ClamAV not installed"
    fi
}

# Run Lynis audit
run_lynis_audit() {
    log "Running Lynis security audit..."
    
    if command -v lynis >/dev/null 2>&1; then
        if [[ -f "$SCRIPT_DIR/lynis-audit.sh" ]]; then
            bash "$SCRIPT_DIR/lynis-audit.sh"
            success "Lynis audit completed"
        else
            warning "Lynis audit script not found"
        fi
    else
        warning "Lynis not installed"
    fi
}

# Run rootkit scan
run_rootkit_scan() {
    log "Running rootkit detection scan..."
    
    if command -v rkhunter >/dev/null 2>&1 || command -v chkrootkit >/dev/null 2>&1; then
        if [[ -f "$SCRIPT_DIR/rootkit-scan.sh" ]]; then
            bash "$SCRIPT_DIR/rootkit-scan.sh"
            success "Rootkit scan completed"
        else
            warning "Rootkit scan script not found"
        fi
    else
        warning "Rootkit detection tools not installed"
    fi
}

# Run general security audit
run_security_audit() {
    log "Running general security audit..."
    
    if [[ -f "$SCRIPT_DIR/security-audit.sh" ]]; then
        bash "$SCRIPT_DIR/security-audit.sh"
        success "Security audit completed"
    else
        warning "Security audit script not found"
    fi
}

# Check Suricata IDS
check_suricata() {
    log "Checking Suricata IDS status..."
    
    if command -v suricata >/dev/null 2>&1; then
        if [[ -f "$SCRIPT_DIR/suricata-monitor.sh" ]]; then
            bash "$SCRIPT_DIR/suricata-monitor.sh"
            success "Suricata check completed"
        else
            warning "Suricata monitor script not found"
        fi
    else
        warning "Suricata not installed"
    fi
}

# Run all security checks
run_all_checks() {
    log "Running comprehensive security audit..."
    echo
    
    run_aide_check
    echo
    
    run_antivirus_scan
    echo
    
    run_lynis_audit
    echo
    
    run_rootkit_scan
    echo
    
    run_security_audit
    echo
    
    check_suricata
    echo
    
    success "All security checks completed"
    info "Check individual log files for detailed results"
    info "Comprehensive report available at: $REPORT_FILE"
}

# Generate comprehensive security report
generate_report() {
    log "Generating comprehensive security report..."
    
    {
        echo "DangerPrep Security Audit Report"
        echo "Generated: $(date)"
        echo "========================================"
        echo
        
        echo "System Information:"
        echo "  Hostname: $(hostname)"
        echo "  OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo "Unknown")"
        echo "  Kernel: $(uname -r)"
        echo "  Uptime: $(uptime -p)"
        echo
        
        echo "Security Tools Status:"
        echo "  AIDE: $(command -v aide >/dev/null 2>&1 && echo "Installed" || echo "Not installed")"
        echo "  ClamAV: $(command -v clamscan >/dev/null 2>&1 && echo "Installed" || echo "Not installed")"
        echo "  Lynis: $(command -v lynis >/dev/null 2>&1 && echo "Installed" || echo "Not installed")"
        echo "  RKHunter: $(command -v rkhunter >/dev/null 2>&1 && echo "Installed" || echo "Not installed")"
        echo "  Suricata: $(command -v suricata >/dev/null 2>&1 && echo "Installed" || echo "Not installed")"
        echo "  Fail2ban: $(systemctl is-active fail2ban 2>/dev/null || echo "Not active")"
        echo
        
        echo "Recent Security Events:"
        echo "  Failed SSH attempts (last 24h): $(journalctl --since "24 hours ago" | grep -c "Failed password" || echo "0")"
        echo "  Fail2ban bans (last 24h): $(journalctl --since "24 hours ago" -u fail2ban | grep -c "Ban " || echo "0")"
        echo
        
        echo "File System Security:"
        echo "  Root filesystem permissions: $(ls -ld / | awk '{print $1}')"
        echo "  /etc permissions: $(ls -ld /etc | awk '{print $1}')"
        echo "  /var/log permissions: $(ls -ld /var/log | awk '{print $1}')"
        echo
        
        echo "Network Security:"
        echo "  Open ports: $(ss -tuln | grep LISTEN | wc -l)"
        echo "  Firewall status: $(ufw status 2>/dev/null | head -1 || echo "UFW not configured")"
        echo
        
        echo "For detailed results, check individual log files:"
        echo "  AIDE: /var/log/aide-check.log"
        echo "  ClamAV: /var/log/clamav-scan.log"
        echo "  Lynis: /var/log/lynis-audit.log"
        echo "  RKHunter: /var/log/rkhunter-scan.log"
        echo "  General audit: Check security-audit.sh output"
        
    } | tee "$REPORT_FILE"
    
    success "Security report generated: $REPORT_FILE"
}

# Main function
main() {
    case "${1:-all}" in
        aide)
            run_aide_check
            ;;
        antivirus)
            run_antivirus_scan
            ;;
        lynis)
            run_lynis_audit
            ;;
        rootkit)
            run_rootkit_scan
            ;;
        audit)
            run_security_audit
            ;;
        suricata)
            check_suricata
            ;;
        all)
            show_banner
            run_all_checks
            generate_report
            ;;
        report)
            generate_report
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
