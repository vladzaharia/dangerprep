#!/bin/bash
# DangerPrep System Maintenance Script
# Consolidated validation, permission fixes, and system health checks

set -e

# Source shared functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../shared/functions.sh"

# Initialize environment
init_environment

# Show help
show_help() {
    echo "DangerPrep System Maintenance Script"
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  validate     Validate system configuration and dependencies"
    echo "  permissions  Fix file permissions for security"
    echo "  health       Quick system health check"
    echo "  all          Run all maintenance tasks (default)"
    echo "  help         Show this help message"
    echo
    echo "Examples:"
    echo "  $0 all           # Run all maintenance tasks"
    echo "  $0 validate      # Only validate system configuration"
    echo "  $0 permissions   # Only fix file permissions"
}

# Validate system configuration
validate_system() {
    log "Validating system configuration..."
    
    local issues=0
    
    # Check Docker Compose files
    if [[ -d "${DANGERPREP_ROOT}/docker" ]]; then
        log "Checking Docker Compose files..."
        while IFS= read -r -d '' compose_file; do
            if ! docker-compose -f "$compose_file" config >/dev/null 2>&1; then
                error "Invalid compose file: $compose_file"
                ((issues++))
            fi
        done < <(find "${DANGERPREP_ROOT}/docker" -name "compose.yml" -print0 2>/dev/null)
    fi
    
    # Check critical services
    log "Checking critical services..."
    local critical_services=("docker" "systemd-resolved")
    for service in "${critical_services[@]}"; do
        if ! systemctl is-active --quiet "$service" 2>/dev/null; then
            warning "Critical service not running: $service"
            ((issues++))
        fi
    done
    
    # Check disk space
    log "Checking disk space..."
    local disk_usage
    disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 90 ]]; then
        error "Disk usage critical: ${disk_usage}%"
        ((issues++))
    elif [[ $disk_usage -gt 80 ]]; then
        warning "Disk usage high: ${disk_usage}%"
    fi
    
    # Check memory usage
    log "Checking memory usage..."
    local mem_usage
    mem_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [[ $mem_usage -gt 90 ]]; then
        error "Memory usage critical: ${mem_usage}%"
        ((issues++))
    elif [[ $mem_usage -gt 80 ]]; then
        warning "Memory usage high: ${mem_usage}%"
    fi
    
    if [[ $issues -eq 0 ]]; then
        success "System validation completed - no issues found"
    else
        error "System validation found $issues issues"
        return 1
    fi
}

# Fix file permissions
fix_permissions() {
    log "Fixing file permissions..."
    
    local fixed_count=0
    
    # Fix environment file permissions
    if [[ -d "${DANGERPREP_ROOT}/docker" ]]; then
        while IFS= read -r -d '' env_file; do
            chmod 600 "$env_file"
            ((fixed_count++))
        done < <(find "${DANGERPREP_ROOT}/docker" -name "compose.env" -print0 2>/dev/null)
    fi
    
    # Fix script permissions
    if [[ -d "${DANGERPREP_ROOT}/scripts" ]]; then
        while IFS= read -r -d '' script_file; do
            chmod 755 "$script_file"
            ((fixed_count++))
        done < <(find "${DANGERPREP_ROOT}/scripts" -name "*.sh" -print0 2>/dev/null)
    fi
    
    # Fix data directory permissions
    if [[ -d "${DANGERPREP_DATA_DIR}" ]]; then
        chmod 755 "${DANGERPREP_DATA_DIR}"
        find "${DANGERPREP_DATA_DIR}" -type d -exec chmod 755 {} \; 2>/dev/null || true
        find "${DANGERPREP_DATA_DIR}" -type f -exec chmod 644 {} \; 2>/dev/null || true
    fi
    
    success "Fixed permissions for $fixed_count files"
}

# Quick system health check
system_health() {
    log "Performing system health check..."
    
    echo "System Overview:"
    get_system_info
    echo
    
    # Check service status
    echo "Critical Services:"
    local services=("docker" "systemd-resolved" "ssh")
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            echo "  $service: ✓ Running"
        else
            echo "  $service: ✗ Not running"
        fi
    done
    echo
    
    # Check network connectivity
    echo "Network Connectivity:"
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        echo "  Internet: ✓ Connected"
    else
        echo "  Internet: ✗ No connection"
    fi
    
    if command -v tailscale >/dev/null 2>&1; then
        local ts_status
        ts_status=$(tailscale status --json 2>/dev/null | jq -r '.BackendState' 2>/dev/null || echo "unknown")
        echo "  Tailscale: $ts_status"
    fi
    echo
    
    # Check container status if Docker is available
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        echo "Container Status:"
        local running_containers
        running_containers=$(docker ps --format "{{.Names}}" 2>/dev/null | wc -l)
        echo "  Running containers: $running_containers"
        
        local unhealthy_containers
        unhealthy_containers=$(docker ps --filter "health=unhealthy" --format "{{.Names}}" 2>/dev/null | wc -l)
        if [[ $unhealthy_containers -gt 0 ]]; then
            echo "  Unhealthy containers: $unhealthy_containers"
        fi
    fi
}

# Run all maintenance tasks
run_all() {
    log "Running all system maintenance tasks..."
    echo
    
    validate_system
    echo
    
    fix_permissions
    echo
    
    system_health
    echo
    
    success "All maintenance tasks completed"
}

# Main function
main() {
    case "${1:-all}" in
        validate)
            validate_system
            ;;
        permissions)
            fix_permissions
            ;;
        health)
            system_health
            ;;
        all)
            show_banner "DangerPrep System Maintenance"
            run_all
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

# Run main function
main "$@"
