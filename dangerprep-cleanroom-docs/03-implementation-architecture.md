# DangerPrep Implementation Architecture - Cleanroom Implementation

## Script Architecture Overview

### Main Scripts Structure
```
scripts/setup/
├── setup.sh                 # Main setup orchestrator
├── cleanup.sh               # Complete system cleanup
├── README.md                # Documentation
├── helpers/                 # Modular helper functions
├── configs/                 # Configuration templates
└── shared/                  # Shared utility libraries
```

### Helper Function Organization
```
scripts/setup/helpers/
├── validation.sh            # Input validation and checks
├── hardware.sh              # FriendlyElec platform detection
├── network.sh               # Network interface management
├── packages.sh              # Package installation management
├── services.sh              # Service management functions
├── olares.sh                # Olares installation and integration
├── adguard.sh               # AdGuard Home setup
├── stepca.sh                # Step-CA certificate authority
├── storage.sh               # NVMe storage management
├── directories.sh           # Directory structure creation
├── configure.sh             # Configuration file generation
├── preflight.sh             # Pre-installation validation
├── monitoring.sh            # System monitoring setup
├── verification.sh          # Post-installation verification
└── setup.sh                 # Setup utility functions
```

### Shared Utility Libraries
```
scripts/shared/
├── logging.sh               # Standardized logging system
├── errors.sh                # Error handling and context
├── functions.sh             # Common utility functions
├── validation.sh            # System validation functions
├── network.sh               # Network utility functions
├── banner.sh                # Banner display functions
├── hardware.sh              # Hardware detection utilities
├── security.sh              # Security utility functions
└── system.sh                # System utility functions
```

## State Management System

### State Tracking Implementation
```bash
# State file location
STATE_FILE="/var/lib/dangerprep/setup-state.json"

# State structure
{
  "setup_started": "2024-01-01T12:00:00Z",
  "last_updated": "2024-01-01T12:30:00Z",
  "current_phase": "NETWORK_CONFIG",
  "completed_steps": [
    "SYSTEM_UPDATE",
    "SECURITY_HARDENING"
  ],
  "failed_steps": [],
  "configuration": {
    "platform": "NanoPi-M6",
    "interfaces": {
      "wan": "eth0",
      "wifi": "wlan0"
    }
  }
}
```

### Setup Phases
1. **SYSTEM_UPDATE**: Package updates and essential packages
2. **SECURITY_HARDENING**: Security services and hardening
3. **NETWORK_CONFIG**: Storage, directories, network configuration
4. **OLARES_SETUP**: Olares installation and FriendlyElec optimization
5. **SERVICES_CONFIG**: DNS services and certificate management
6. **FINAL_SETUP**: Monitoring, backups, verification

### State Management Functions
```bash
# Initialize state tracking
init_state_tracking() {
    mkdir -p "$(dirname "$STATE_FILE")"
    echo '{"setup_started":"'$(date -Iseconds)'","completed_steps":[]}' > "$STATE_FILE"
}

# Check if step is completed
is_step_completed() {
    local step="$1"
    jq -r ".completed_steps[]" "$STATE_FILE" | grep -q "^$step$"
}

# Set step state
set_step_state() {
    local step="$1"
    local state="$2"
    # Update JSON state file
}

# Get last completed step
get_last_completed_step() {
    jq -r ".completed_steps[-1]" "$STATE_FILE" 2>/dev/null || echo ""
}
```

## Error Handling Framework

### Error Context System
```bash
# Error context stack
ERROR_CONTEXT_STACK=()

# Set error context
set_error_context() {
    local context="$1"
    ERROR_CONTEXT_STACK+=("$context")
}

# Clear error context
clear_error_context() {
    if [[ ${#ERROR_CONTEXT_STACK[@]} -gt 0 ]]; then
        unset 'ERROR_CONTEXT_STACK[-1]'
    fi
}

# Get current error context
get_error_context() {
    if [[ ${#ERROR_CONTEXT_STACK[@]} -gt 0 ]]; then
        echo "${ERROR_CONTEXT_STACK[-1]}"
    fi
}
```

### Cleanup on Error
```bash
cleanup_on_error() {
    local exit_code=$?
    
    # Clear running flag
    export DANGERPREP_SETUP_RUNNING=false
    
    # Mark current step as failed
    if [[ -n "${CURRENT_STEP:-}" ]]; then
        set_step_state "$CURRENT_STEP" "FAILED"
    fi
    
    # Stop services that might have been started
    local services_to_stop=(
        "hostapd" "dnsmasq" "adguardhome" "step-ca"
        "fail2ban" "rk3588-fan-control"
    )
    
    for service in "${services_to_stop[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            systemctl stop "$service" 2>/dev/null || true
        fi
    done
    
    # Clean up temporary files
    if [[ -n "${TEMP_DIR:-}" && -d "${TEMP_DIR}" ]]; then
        rm -rf "${TEMP_DIR}"
    fi
    
    exit "${exit_code}"
}

# Set error trap
trap cleanup_on_error ERR
```

## Logging System Architecture

### Log Levels and Configuration
```bash
# Log levels (numeric for comparison)
declare -r LOG_LEVEL_DEBUG=0
declare -r LOG_LEVEL_INFO=1
declare -r LOG_LEVEL_WARNING=2
declare -r LOG_LEVEL_ERROR=3
declare -r LOG_LEVEL_CRITICAL=4

# Configuration
LOG_FILE="${LOG_FILE:-/var/log/dangerprep-setup.log}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"
LOG_TIMESTAMP_FORMAT="${LOG_TIMESTAMP_FORMAT:-%Y-%m-%d %H:%M:%S}"
LOG_ENABLE_COLOR="${LOG_ENABLE_COLOR:-true}"
```

### Logging Functions
```bash
# Core logging function
_log_message() {
    local level="$1"
    local color="$2"
    local message="$3"
    local timestamp
    local formatted_message
    
    timestamp=$(date +"${LOG_TIMESTAMP_FORMAT}")
    
    # Console output with color
    if supports_color; then
        echo -e "${color}[${timestamp}] ${level}: ${message}${LOG_NC}"
    else
        echo "[${timestamp}] ${level}: ${message}"
    fi
    
    # File output without color
    if [[ -n "${LOG_FILE}" ]]; then
        echo "[${timestamp}] ${level}: ${message}" >> "${LOG_FILE}"
    fi
}

# Specific log level functions
debug() { _log_message "DEBUG" "${LOG_GRAY}" "$1"; }
info() { _log_message "INFO" "${LOG_BLUE}" "$1"; }
log() { info "$1"; }  # Alias for info
warning() { _log_message "WARNING" "${LOG_YELLOW}" "$1"; }
error() { _log_message "ERROR" "${LOG_RED}" "$1"; }
success() { _log_message "SUCCESS" "${LOG_GREEN}" "$1"; }
```

### Structured Logging
```bash
# Section logging
log_section() {
    local section="$1"
    echo
    echo -e "${LOG_CYAN}╔══════════════════════════════════════════════════════════════════════════════╗${LOG_NC}"
    echo -e "${LOG_CYAN}║ ${section}${LOG_NC}"
    echo -e "${LOG_CYAN}╚══════════════════════════════════════════════════════════════════════════════╝${LOG_NC}"
    echo
    _log_message "SECTION" "${LOG_CYAN}" "$section"
}

# Subsection logging
log_subsection() {
    local subsection="$1"
    echo
    echo -e "${LOG_PURPLE}── ${subsection} ──${LOG_NC}"
    _log_message "SUBSECTION" "${LOG_PURPLE}" "$subsection"
}
```

## Configuration Template System

### Template Processing
```bash
# Process template file
process_template() {
    local template_file="$1"
    local output_file="$2"
    local temp_file
    
    temp_file=$(mktemp)
    
    # Copy template to temp file
    cp "$template_file" "$temp_file"
    
    # Replace all template variables
    for var in "${TEMPLATE_VARS[@]}"; do
        local value="${!var}"
        sed -i "s|{{${var}}}|${value}|g" "$temp_file"
    done
    
    # Move to final location
    mv "$temp_file" "$output_file"
}

# Template variables
TEMPLATE_VARS=(
    "WIFI_INTERFACE" "WIFI_SSID" "WIFI_PASSWORD"
    "LAN_NETWORK" "LAN_IP" "DHCP_START" "DHCP_END"
    "SSH_PORT" "FAIL2BAN_BANTIME" "FAIL2BAN_MAXRETRY"
)
```

### Configuration File Structure
```
scripts/setup/configs/
├── network/
│   ├── hostapd.conf.tmpl
│   ├── dnsmasq.conf.tmpl
│   └── netplan_wan.yaml.tmpl
├── security/
│   ├── sshd_config.tmpl
│   ├── jail.local.tmpl
│   └── sysctl_hardening.conf.tmpl
├── dns/
│   ├── adguard-home.yaml.tmpl
│   └── systemd-resolved-adguard.conf.tmpl
├── friendlyelec/
│   ├── rk3588-performance.conf.tmpl
│   ├── rk3588-fan-control.conf.tmpl
│   └── mali-gpu.conf.tmpl
└── system/
    ├── 50unattended-upgrades.tmpl
    └── dangerprep-backups.cron.tmpl
```

## Validation Framework

### Input Validation Functions
```bash
# Validate IPv4 address
validate_ip() {
    local ip="$1"
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        local IFS='.'
        local -a octets
        read -ra octets <<< "$ip"
        for octet in "${octets[@]}"; do
            [[ $octet -le 255 ]] || return 1
        done
        return 0
    fi
    return 1
}

# Validate network interface
validate_interface_name() {
    local interface="$1"
    [[ $interface =~ ^[a-zA-Z0-9_-]+$ && ${#interface} -le 15 ]]
}

# Validate port number
validate_port() {
    local port="$1"
    [[ "$port" =~ ^[0-9]+$ && "$port" -ge 1 && "$port" -le 65535 ]]
}

# Validate CIDR notation
validate_cidr() {
    local cidr="$1"
    local ip="${cidr%/*}"
    local prefix="${cidr#*/}"
    validate_ip "$ip" && [[ "$prefix" -ge 0 && "$prefix" -le 32 ]]
}
```

### System Validation
```bash
# Validate system requirements
validate_system_requirements() {
    local requirements_met=true
    
    # Check OS version
    if ! grep -q "Ubuntu 24.04" /etc/os-release; then
        error "Ubuntu 24.04 LTS is required"
        requirements_met=false
    fi
    
    # Check memory
    local total_memory
    total_memory=$(free -m | awk '/^Mem:/{print $2}')
    if [[ ${total_memory} -lt 2048 ]]; then
        error "Insufficient memory: ${total_memory}MB available, 2GB required"
        requirements_met=false
    fi
    
    # Check CPU cores
    local cpu_cores
    cpu_cores=$(nproc)
    if [[ ${cpu_cores} -lt 2 ]]; then
        error "Insufficient CPU cores: ${cpu_cores} available, 2 required"
        requirements_met=false
    fi
    
    # Check disk space
    local available_disk
    available_disk=$(df / | awk 'NR==2{print int($4/1024/1024)}')
    if [[ ${available_disk} -lt 20 ]]; then
        error "Insufficient disk space: ${available_disk}GB available, 20GB required"
        requirements_met=false
    fi
    
    [[ "$requirements_met" == true ]]
}
```

## Dry-Run Mode Implementation

### Dry-Run State Management
```bash
DRY_RUN=false

enable_dry_run() {
    DRY_RUN=true
    export DRY_RUN
}

is_dry_run() {
    [[ "${DRY_RUN}" == "true" ]]
}
```

### Safe Execution Wrapper
```bash
# Safe command execution with dry-run support
safe_execute() {
    local success_code="$1"
    local failure_code="$2"
    shift 2
    local command=("$@")
    
    if is_dry_run; then
        info "[DRY RUN] Would execute: ${command[*]}"
        return "$success_code"
    fi
    
    if "${command[@]}"; then
        return "$success_code"
    else
        return "$failure_code"
    fi
}
```

## Lock File Management

### Concurrent Execution Prevention
```bash
LOCKFILE="/tmp/dangerprep-setup.lock"

# Check for existing lock
if [[ -f "$LOCKFILE" ]]; then
    LOCK_PID=$(cat "$LOCKFILE" 2>/dev/null || echo "")
    if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
        error "Setup script is already running (PID: $LOCK_PID)"
        exit 1
    else
        warning "Stale lock file found, removing it"
        rm -f "$LOCKFILE"
    fi
fi

# Create lock file
echo $$ > "$LOCKFILE"

# Cleanup lock file on exit
cleanup_lock() {
    rm -f "$LOCKFILE" 2>/dev/null || true
}
trap cleanup_lock EXIT
```

## Backup System Architecture

### Backup Creation
```bash
# Create comprehensive backup
backup_original_configs() {
    local backup_dir="/var/backups/dangerprep-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup critical configuration files
    local files_to_backup=(
        "/etc/ssh/sshd_config"
        "/etc/sysctl.conf"
        "/etc/dnsmasq.conf"
        "/etc/hostapd/hostapd.conf"
        "/etc/fail2ban/jail.local"
    )
    
    for file in "${files_to_backup[@]}"; do
        if [[ -f "$file" ]]; then
            cp "$file" "$backup_dir/$(basename "$file").original"
        fi
    done
    
    # Save iptables rules
    iptables-save > "$backup_dir/iptables.rules"
    
    success "Configuration backup created: $backup_dir"
}
```
