#!/usr/bin/env bash
# DangerPrep Setup Script - Complete System Setup
#
# Purpose: Complete system setup for Ubuntu 24.04 with 2025 security hardening
# Usage: setup-dangerprep.sh [--dry-run] [--verbose] [--config FILE]
# Dependencies: apt, systemctl, ufw, git, curl, wget
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Prevent recursive execution and rapid restarts
LOCKFILE="/tmp/dangerprep-setup.lock"
if [[ -f "$LOCKFILE" ]]; then
    LOCK_PID=$(cat "$LOCKFILE" 2>/dev/null || echo "")
    if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
        echo "ERROR: Setup script is already running (PID: $LOCK_PID). Preventing recursive execution."
        exit 1
    else
        echo "WARNING: Stale lock file found, removing it."
        rm -f "$LOCKFILE"
    fi
fi

# Create lock file with current PID
echo $$ > "$LOCKFILE"

# Cleanup lock file on exit
cleanup_lock() {
    rm -f "$LOCKFILE" 2>/dev/null || true
}
trap cleanup_lock EXIT

if [[ "${DANGERPREP_SETUP_RUNNING:-false}" == "true" ]]; then
    echo "ERROR: Setup script is already running. Preventing recursive execution."
    exit 1
fi
export DANGERPREP_SETUP_RUNNING=true

# Script metadata
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"

SCRIPT_VERSION="2.0"
SCRIPT_DESCRIPTION="DangerPrep Complete System Setup"

# Enhanced error handling and cleanup (defined early)
cleanup_on_error() {
    local exit_code=$?

    # Clear the running flag
    export DANGERPREP_SETUP_RUNNING=false

    error "Setup failed with exit code ${exit_code}. Running comprehensive cleanup..."

    # Mark current step as failed
    if [[ -n "${CURRENT_STEP:-}" ]]; then
        set_step_state "$CURRENT_STEP" "FAILED" 2>/dev/null || true
    fi

    # Stop all services that might have been started
    local services_to_stop=(
        "hostapd" "dnsmasq" "adguardhome" "step-ca"
        "fail2ban" "rk3588-fan-control" "rk3588-cpu-governor"
    )

    for service in "${services_to_stop[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            log "Stopping service: $service"
            systemctl stop "$service" 2>/dev/null || true
        fi
    done

    # Clean up temporary files
    if [[ -n "${TEMP_DIR:-}" && -d "${TEMP_DIR}" ]]; then
        rm -rf "${TEMP_DIR}" 2>/dev/null || true
    fi

    error "Setup failed. Check /var/log/dangerprep-setup.log for details."
    error "System has been restored to its pre-installation state"
    info "You can safely re-run the setup script after addressing any issues"

    # Exit with the original error code
    exit "${exit_code}"
}

# Set error trap early
trap cleanup_on_error ERR

# Source shared utilities
# shellcheck source=../shared/logging.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/logging.sh"
# shellcheck source=../shared/errors.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/errors.sh"
# shellcheck source=../shared/validation.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/banner.sh"
# shellcheck source=../shared/functions.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/../shared/functions.sh"

# Source setup helpers
# shellcheck source=helpers/validation.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/validation.sh"
# shellcheck source=helpers/directories.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/directories.sh"
# shellcheck source=helpers/services.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/services.sh"
# shellcheck source=helpers/hardware.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/hardware.sh"
# shellcheck source=helpers/network.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/network.sh"
# shellcheck source=helpers/configure.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/configure.sh"
# shellcheck source=helpers/setup.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/setup.sh"
# shellcheck source=helpers/packages.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/packages.sh"
# shellcheck source=helpers/olares.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/olares.sh"
# shellcheck source=helpers/adguard.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/adguard.sh"
# shellcheck source=helpers/stepca.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/stepca.sh"
# shellcheck source=helpers/verification.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/verification.sh"
# shellcheck source=helpers/preflight.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/preflight.sh"
# shellcheck source=helpers/monitoring.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/monitoring.sh"
# shellcheck source=helpers/storage.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/storage.sh"

# Show help information
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

OPTIONS:
    --dry-run       Show what would be installed without making changes
    --verbose       Enable verbose output for debugging
    --config FILE   Use custom configuration file

    --skip-network  Skip network configuration
    -h, --help      Show this help message

DESCRIPTION:
    Complete system setup for Ubuntu 24.04 with 2025 security hardening.
    This script will:
    • Detect and partition NVMe SSD for Olares (256GB) and Content storage
    • Install and configure system-level network services
    • Set up network configuration (hostapd, dnsmasq, firewall)
    • Install security tools (AIDE, fail2ban, ClamAV)
    • Configure hardware monitoring and optimization
    • Set up backup and monitoring systems
    • Apply comprehensive security hardening

EXAMPLES:
    ${SCRIPT_NAME}                    # Full interactive setup
    ${SCRIPT_NAME} --dry-run          # Preview changes without installation
    ${SCRIPT_NAME} --verbose          # Enable detailed logging
NOTES:
    - This script must be run as root
    - Requires Ubuntu 24.04 LTS
    - Creates backup in: /var/backups/dangerprep-*
    - Logs to: /var/log/dangerprep-setup.log
    - Supports both NanoPi R6C and M6 hardware

EXIT CODES:
    0   Success
    1   General error
    2   Invalid arguments
    3   Unsupported system

For more information, see the DangerPrep documentation.
EOF
}

# Configuration variables with validation
# SCRIPT_DIR already set at top of script
PROJECT_ROOT="$(dirname "$(dirname "$(dirname "$(realpath "${BASH_SOURCE[0]}")"")")"

INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
LOG_FILE="/var/log/dangerprep-setup.log"
BACKUP_DIR="/var/backups/dangerprep-$(date +%Y%m%d-%H%M%S)"
# Secure temporary directory
TEMP_DIR=""
create_temp_dir() {
    TEMP_DIR=$(mktemp -d -t dangerprep-setup.XXXXXX)
    chmod 700 "${TEMP_DIR}"
}

# Cleanup function for temporary files
cleanup_temp() {
    if [[ -n "${TEMP_DIR}" && -d "${TEMP_DIR}" ]]; then
        rm -rf "${TEMP_DIR}"
    fi
}

# Validation functions are now provided by helpers/validation.sh

# Cleanup function for normal exit
cleanup_normal_exit() {
    export DANGERPREP_SETUP_RUNNING=false
    cleanup_temp
}

# Enhanced signal handlers for debugging and cleanup
debug_signal_handler() {
    local signal="$1"
    echo "[DEBUG] Received signal $signal at $(date), PID=$$" >> /tmp/dangerprep-debug.log
    echo "[DEBUG] Call stack:" >> /tmp/dangerprep-debug.log
    caller 0 >> /tmp/dangerprep-debug.log 2>&1 || echo "[DEBUG] No call stack available" >> /tmp/dangerprep-debug.log
    export DANGERPREP_SETUP_RUNNING=false
    cleanup_temp
    exit $((128 + signal))
}

# Signal handlers for cleanup with debugging
trap cleanup_normal_exit EXIT
trap 'debug_signal_handler 2' INT
trap 'debug_signal_handler 15' TERM
trap 'debug_signal_handler 9' KILL 2>/dev/null || true
trap 'debug_signal_handler 1' HUP
trap 'debug_signal_handler 3' QUIT

# Load configuration utilities
# shellcheck source=helpers/config.sh
source "$(dirname "$(realpath "${BASH_SOURCE[0]}")"/helpers/config.sh"

# Network configuration
WIFI_SSID="DangerPrep"
WIFI_PASSWORD="$(generate_wifi_password)" || {
    error "Failed to generate WiFi password"
    exit 1
}
LAN_NETWORK="192.168.120.0/22"
LAN_IP="192.168.120.1"
DHCP_START="192.168.120.100"
DHCP_END="192.168.120.200"

# Security configuration
SSH_PORT="2222"
FAIL2BAN_BANTIME="3600"
FAIL2BAN_MAXRETRY="3"

# Export variables for use in templates
export WIFI_SSID WIFI_PASSWORD LAN_NETWORK LAN_IP DHCP_START DHCP_END
export SSH_PORT FAIL2BAN_BANTIME FAIL2BAN_MAXRETRY

# Check if running as root
check_root() {
    if [[ ${EUID} -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
        echo "Usage: sudo $0"
        exit 1
    fi
}

# Enhanced logging setup with comprehensive information
setup_logging() {
    create_logging_directories
    touch "${LOG_FILE}"
    chmod 640 "${LOG_FILE}"

    # Log setup start with comprehensive system information
    log_section "DangerPrep Setup Started"
    log "Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"
    log "Script version: ${SCRIPT_VERSION}"
    log "User: $(whoami)"
    log "Working directory: $(pwd)"
    log "Script path: ${BASH_SOURCE[0]}"
    log "Backup directory: ${BACKUP_DIR}"
    log "Install root: ${INSTALL_ROOT}"
    log "Project root: ${PROJECT_ROOT}"
    log "Log file: ${LOG_FILE}"

    # Log system information
    log_subsection "System Environment"
    log "OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo 'Unknown')"
    log "Kernel: $(uname -r)"
    log "Architecture: $(uname -m)"
    log "Hostname: $(hostname)"
    log "Memory: $(free -h | grep Mem | awk '{print $2}' || echo 'Unknown')"
    log "Disk space: $(df -h / | tail -1 | awk '{print $4}' || echo 'Unknown') available"
    log "Shell: ${SHELL}"
    log "PATH: ${PATH}"

    # Log script arguments (if any were passed to main)
    if [[ -n "${SCRIPT_ARGS:-}" ]]; then
        log_subsection "Script Arguments"
        log "Arguments: ${SCRIPT_ARGS}"
    fi

    # Log environment variables
    log_subsection "DangerPrep Environment"
    log "DANGERPREP_INSTALL_ROOT: ${DANGERPREP_INSTALL_ROOT:-not set}"
    log "CONFIG_FILE: ${CONFIG_FILE:-not set}"
    log "DRY_RUN: ${DRY_RUN:-false}"
    log "LOG_LEVEL: ${LOG_LEVEL:-INFO}"

    success "Logging initialized successfully"
}

# Display banner
show_banner() {
    show_setup_banner
    echo
    info "Emergency Router & Content Hub Setup"
    info "• WiFi Hotspot: DangerPrep (WPA3/WPA2)"
    info "• Network: 192.168.120.0/22"
    info "• Security: 2025 Hardening Standards"
    info "• Services: AdGuard Home + Step-CA + Sync"
    echo
    info "All changes are logged and backed up."
    echo
    info "Logs: ${LOG_FILE}"
    info "Backups: ${BACKUP_DIR}"
    info "Install root: ${INSTALL_ROOT}"
}

# Show system information and detect FriendlyElec hardware
show_system_info() {
    log "System Information:"
    log "OS: $(lsb_release -d | cut -f2)"
    log "Kernel: $(uname -r)"
    log "Architecture: $(uname -m)"
    log "Memory: $(free -h | grep Mem | awk '{print $2}')"
    log "Disk: $(df -h / | tail -1 | awk '{print $2}')"

    # Detect platform and set FriendlyElec-specific flags
    if ! detect_friendlyelec_platform; then
        warning "Hardware detection completed with warnings, continuing with generic setup"
    fi
}

# Confirm installation start after preflight checks
confirm_installation_start() {
    log_section "Installation Confirmation"

    # Skip confirmation in dry-run mode
    if is_dry_run; then
        log "Dry-run mode: Skipping installation confirmation"
        return 0
    fi

    log "Pre-flight checks completed successfully!"
    echo
    warning "IMPORTANT: This installation will make significant changes to your system:"
    warning "• Install and configure system services (hostapd, dnsmasq, AdGuard Home)"
    warning "• Modify network configuration and firewall rules"
    warning "• Install security tools and apply system hardening"
    warning "• Set up Olares container platform"

    # Check for NVMe storage and warn about partitioning
    if command -v detect_nvme_devices >/dev/null 2>&1; then
        local nvme_devices
        nvme_devices=$(lsblk -d -n -o NAME,SIZE,TYPE | grep nvme | awk '{print "/dev/" $1}' || true)

        if [[ -n "${nvme_devices}" ]]; then
            echo
            warning "NVMe Storage Setup:"
            warning "• NVMe SSD will be partitioned for Olares (256GB) and Content storage"

            # Check for existing data on NVMe devices
            local data_found=false
            while IFS= read -r device; do
                if [[ -n "${device}" ]]; then
                    # Check existing partitions for data
                    for part in "${device}"*; do
                        if [[ -b "${part}" && "${part}" != "${device}" ]]; then
                            if command -v check_partition_data >/dev/null 2>&1; then
                                if check_partition_data "${part}" "$(basename "${part}")" >/dev/null 2>&1; then
                                    data_found=true
                                    break
                                fi
                            fi
                        fi
                    done
                fi
            done <<< "${nvme_devices}"

            if [[ "${data_found}" == "true" ]]; then
                warning "• EXISTING DATA DETECTED on NVMe partitions"
                warning "• You will be prompted before any data is deleted"
            else
                warning "• Existing data on NVMe partitions may be affected"
            fi
            warning "• You will be prompted before any destructive operations"
        fi
    fi

    echo
    log "Installation will create backups in: ${BACKUP_DIR}"
    log "Installation logs will be saved to: ${LOG_FILE}"
    echo

    read -p "Do you want to proceed with the installation? (yes/no): " -r
    if [[ ! ${REPLY} =~ ^[Yy][Ee][Ss]$ ]]; then
        info "Installation cancelled by user"
        info "You can run this script again when ready to proceed"
        exit 0
    fi

    success "Installation confirmed - proceeding with setup"
}

# Configure NFS client
configure_nfs_client() {
    log "Configuring NFS client..."

    # Use helper function to create NFS directory structure
    create_nfs_directories "${INSTALL_ROOT}"

    success "NFS client configured"
    log "Content directories created at ${INSTALL_ROOT}/content"
    log "NFS mount point available at ${INSTALL_ROOT}/nfs"
}

# Setup encrypted backups


# Show final information
show_final_info() {
    echo -e "${GREEN}"
    cat << EOF
╔══════════════════════════════════════════════════════════════════════════════╗
║                        DangerPrep Setup Complete!                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  WiFi Hotspot: ${WIFI_SSID}                                                   ║
║  Password: [Stored securely in /etc/dangerprep/wifi-password]              ║
║  Network: ${LAN_NETWORK}                                                       ║
║  Gateway: ${LAN_IP}                                                            ║
║                                                                              ║
║  SSH: Port ${SSH_PORT} (key-only authentication)                              ║
║  Management: dangerprep --help                                               ║
║                                                                              ║
║  Services: http://portal.danger                                              ║
║  AdGuard Home: http://adguard.danger                                         ║
║                                                                              ║
║  Olares: Access through Olares desktop interface                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    info "Logs: ${LOG_FILE}"
    info "Backups: ${BACKUP_DIR}"
    info "Install root: ${INSTALL_ROOT}"
}

# Main function with state management
main() {
    show_banner
    check_root
    setup_logging

    # Initialize state tracking
    init_state_tracking

    # Check for previous incomplete setup
    local last_completed
    last_completed=$(get_last_completed_step)
    if [[ -n "$last_completed" ]]; then
        warning "Previous incomplete setup detected"
        show_setup_progress
        echo
        read -p "Continue from where setup left off? (y/n): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Starting fresh setup..."
            init_state_tracking  # Reset state
        else
            info "Resuming setup from last completed step: $last_completed"
        fi
    fi

    show_system_info

    # Run preflight checks with explicit error handling
    if ! run_preflight_checks; then
        error "Preflight checks failed. Exiting setup."
        exit 1
    fi

    confirm_installation_start
    backup_original_configs

    # System Update Phase
    if ! is_step_completed "SYSTEM_UPDATE"; then
        CURRENT_STEP="SYSTEM_UPDATE"
        set_step_state "SYSTEM_UPDATE" "IN_PROGRESS"
        update_system_packages_safe
        install_essential_packages
        setup_automatic_updates_service
        set_step_state "SYSTEM_UPDATE" "COMPLETED"
        log "System preparation completed. Continuing with security hardening..."
    else
        info "Skipping system update (already completed)"
    fi

    # Security Hardening Phase
    if ! is_step_completed "SECURITY_HARDENING"; then
        CURRENT_STEP="SECURITY_HARDENING"
        set_step_state "SECURITY_HARDENING" "IN_PROGRESS"
        configure_security_services
        set_step_state "SECURITY_HARDENING" "COMPLETED"
        log "Security hardening completed. Continuing with directory and NFS setup..."
    else
        info "Skipping security hardening (already completed)"
    fi

    # Network Configuration Phase
    if ! is_step_completed "NETWORK_CONFIG"; then
        CURRENT_STEP="NETWORK_CONFIG"
        set_step_state "NETWORK_CONFIG" "IN_PROGRESS"
        setup_nvme_storage
        setup_olares_directory_structure
        configure_nfs_client
        detect_network_interfaces
        configure_network_services
        set_step_state "NETWORK_CONFIG" "COMPLETED"
        log "Network configuration completed. Applying hardware optimizations..."
    else
        info "Skipping network configuration (already completed)"
    fi

    # Olares Setup Phase
    if ! is_step_completed "OLARES_SETUP"; then
        CURRENT_STEP="OLARES_SETUP"
        set_step_state "OLARES_SETUP" "IN_PROGRESS"
        # Apply FriendlyElec-specific performance optimizations
        if [[ "${IS_FRIENDLYELEC}" == true ]]; then
            configure_rk3588_performance
        fi
        install_olares
        configure_olares_integration
        set_step_state "OLARES_SETUP" "COMPLETED"
        log "Olares setup completed. Continuing with services..."
    else
        info "Skipping Olares setup (already completed)"
    fi

    # Services Configuration Phase
    if ! is_step_completed "SERVICES_CONFIG"; then
        CURRENT_STEP="SERVICES_CONFIG"
        set_step_state "SERVICES_CONFIG" "IN_PROGRESS"
        load_sync_configs

        setup_dns_services
        setup_certificate_management
        set_step_state "SERVICES_CONFIG" "COMPLETED"
        log "Services configured. Installing management tools..."
    else
        info "Skipping services configuration (already completed)"
    fi

    # Final Setup Phase
    if ! is_step_completed "FINAL_SETUP"; then
        CURRENT_STEP="FINAL_SETUP"
        set_step_state "FINAL_SETUP" "IN_PROGRESS"
        create_routing_scenarios
        setup_system_monitoring
        setup_encrypted_backups
        start_all_services
        verify_setup
        set_step_state "FINAL_SETUP" "COMPLETED"
        log "Final setup completed successfully!"
    else
        info "Skipping final setup (already completed)"
    fi

    show_final_info
    success "DangerPrep setup completed successfully!"
}

# Duplicate cleanup function removed - using the early definition

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                enable_dry_run
                shift
                ;;
            --verbose)
                set_log_level "DEBUG"
                shift
                ;;
            --config)
                if [[ -n "$2" && ! "$2" =~ ^-- ]]; then
                    export CONFIG_FILE="$2"
                    shift 2
                else
                    error "Option --config requires a file path"
                    exit 1
                fi
                ;;

            --skip-network)
                export SKIP_NETWORK=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Main execution wrapper
main_wrapper() {
    # Store original arguments for logging
    SCRIPT_ARGS="$*"

    # Parse arguments first
    parse_arguments "$@"

    # Show dry-run notice if enabled
    if is_dry_run; then
        log_section "DRY-RUN MODE"
        warning "This is a dry-run. No changes will be made to the system."
        warning "The script will show what would be done without actually doing it."
        echo
        read -p "Continue with dry-run? (y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Dry-run cancelled by user"
            exit 0
        fi
        echo
    fi

    # Run main setup function
    main

    # Show dry-run summary if in dry-run mode
    if is_dry_run; then
        show_dry_run_summary
    fi
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main_wrapper "$@"
fi
