# DangerPrep Justfile - Modern Modular Architecture
# Emergency Router & Content Hub System
# Version: 2.0 - Modernized with Just 2025 best practices

# Global settings
set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load := true

# Global variables
scripts_dir := "scripts"
install_root := env_var_or_default("DANGERPREP_INSTALL_ROOT", "/opt/dangerprep")
log_dir := "/var/log"

# Import all modules from justfiles directory
mod scenarios 'justfiles/scenarios.just'
mod services 'justfiles/services.just'
mod network 'justfiles/network.just'
mod wifi 'justfiles/wifi.just'
mod wan 'justfiles/wan.just'
mod diagnostics 'justfiles/diagnostics.just'
mod system 'justfiles/system.just'
mod deployment 'justfiles/deployment.just'
mod hardware 'justfiles/hardware.just'
mod security 'justfiles/security.just'
mod auditing 'justfiles/auditing.just'
mod certificates 'justfiles/certificates.just'
mod backup 'justfiles/backup.just'
mod monitoring 'justfiles/monitoring.just'

# Default recipe - show organized help
default:
    @just --list --list-heading $'DangerPrep Emergency Router & Content Hub\n========================================\n\nCOMMANDS:\n'
    @echo ""
    @just scenarios::help
    @echo ""
    @echo "📋 MANAGEMENT MODULES:"
    @echo "  services    - Service lifecycle management"
    @echo "  network     - Core network management"
    @echo "  wifi        - WiFi management and configuration"
    @echo "  wan         - WAN interface management"
    @echo "  diagnostics - Network diagnostics and testing"
    @echo "  system      - System control and maintenance"
    @echo "  deployment  - System deployment and installation"
    @echo "  hardware    - Hardware monitoring and fan control"
    @echo "  security    - Core security management"
    @echo "  auditing    - Security auditing and scanning"
    @echo "  certificates - SSL/TLS certificate management"
    @echo "  backup      - Backup and restore operations"
    @echo "  monitoring  - System and hardware monitoring"
    @echo ""
    @echo "💡 USAGE:"
    @echo "  just <module>::<command>  - Run module command"
    @echo "  just <module> <command>   - Alternative syntax"
    @echo "  just --list <module>      - List module commands"
    @echo ""
    @echo "🔗 QUICK ALIASES:"
    @echo "  just up      - Start all services"
    @echo "  just down    - Stop all services"
    @echo "  just status  - Show system status"
    @echo "  just deploy  - Deploy/install system"

# No core commands - all commands are organized into modules

# Common aliases for backward compatibility and convenience
alias install := deployment::deploy
alias ps := services::status
alias uninstall := deployment::cleanup
alias up := services::start
alias down := services::stop
alias start := services::start
alias stop := services::stop
alias restart := services::restart
alias status := services::status
alias deploy := deployment::deploy
alias cleanup := deployment::cleanup
alias update := deployment::update
alias logs := monitoring::logs
alias olares := monitoring::olares
alias clean := system::clean

# Scenario aliases (most critical)
alias emergency-router := scenarios::router
alias emergency-repeater := scenarios::repeater
alias emergency-local := scenarios::local

# Network aliases (commonly used)
alias wan-list := wan::list
alias wan-set := wan::set
alias wan-status := wan::status
alias wifi-scan := wifi::scan
alias wifi-connect := wifi::connect
alias net-diag := diagnostics::all

# System aliases
alias system-status := system::status
alias hardware-monitor := hardware::monitor
alias health := monitoring::health

# Security aliases
alias security-status := security::status
alias security-audit := auditing::all
alias certs-status := certificates::status

# Backup aliases
alias backup-create := backup::create
alias backup-list := backup::list
