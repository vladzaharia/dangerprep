# Configuration Reference

## Overview

This document provides a comprehensive reference for all configuration options, defaults, validation rules, and environment variable processing in the DangerPrep setup system.

## Configuration System Architecture

### 1. Configuration Sources 

#### Primary Configuration Loader
**Component**: Configuration loader module
**Purpose**: Load external configuration templates and utilities
**Fallback Behavior**: Provides stub functions when unavailable

#### Configuration State Persistence
**Component**: Configuration module
**Purpose**: Store user configuration choices for resumable installations
**Format**: Shell variable assignments with comments

#### Installation State Tracking
**Component**: Configuration module
**Purpose**: Track completion status of installation phases
**Format**: `phase_name=status` pairs

### 2. Environment Variable Processing System

#### PROMPT Directive System
**Format**: `# PROMPT[type,OPTIONAL]: description`
**Supported Types**:
- `email` - Email address with validation
- `pw`/`password` - Hidden password input
- `text` (default) - Plain text input

**Example**:
```bash
# PROMPT[email]: Administrator email address
ADMIN_EMAIL=admin@example.com

# PROMPT[password]: Database password
DB_PASSWORD=secure_password

# PROMPT[text,OPTIONAL]: Optional description
DESCRIPTION=
```

#### GENERATE Directive System
**Format**: `# GENERATE[type,size,OPTIONAL]: description`
**Supported Types**:
- `b64`/`base64` - Base64 encoded random data
- `hex` - Hexadecimal random data
- `bcrypt` - Bcrypt password hash
- `pw`/`password` - Random password
- Default: Random alphanumeric string

**Example**:
```bash
# GENERATE[base64,32]: JWT secret key
JWT_SECRET=

# GENERATE[password,16]: Random database password
DB_PASSWORD=

# GENERATE[hex,64]: Encryption key
ENCRYPTION_KEY=
```

## Default Configuration Values

### 1. Network Configuration 
```bash
WIFI_SSID="DangerPrep"          # Default WiFi network name
WIFI_PASSWORD="EXAMPLE_PASSWORD"     # Default WiFi password (must be changed)
LAN_NETWORK="192.168.120.0/22"      # LAN network range (1024 addresses)
LAN_IP="192.168.120.1"          # Gateway IP address
DHCP_START="192.168.120.100"       # DHCP range start
DHCP_END="192.168.120.200"        # DHCP range end (100 addresses)
```

**Validation Rules**:
- WIFI_SSID: 1-32 characters, no special characters
- WIFI_PASSWORD: 8-63 characters for WPA2
- LAN_NETWORK: Valid CIDR notation
- IP addresses: Valid IPv4 format within network range

### 2. Security Configuration 
```bash
SSH_PORT="2222"              # Custom SSH port (avoid 22)
FAIL2BAN_BANTIME="3600"          # Ban duration in seconds (1 hour)
FAIL2BAN_MAXRETRY="3"           # Maximum failed attempts
```

**Validation Rules**:
- SSH_PORT: 1024-65535 (unprivileged ports)
- FAIL2BAN_BANTIME: 300-86400 seconds (5 minutes to 24 hours)
- FAIL2BAN_MAXRETRY: 1-10 attempts

### 3. User Account Configuration 
```bash
NEW_USERNAME="dangerprep"         # Default new user name
NEW_USER_FULLNAME="DangerPrep User"    # Default full name
TRANSFER_SSH_KEYS="yes"          # Transfer SSH keys from pi user
IMPORT_GITHUB_KEYS="no"          # Import SSH keys from GitHub
GITHUB_USERNAME=""            # GitHub username for key import
```

**Validation Rules**:
- NEW_USERNAME: 3-32 characters, alphanumeric + underscore, no spaces
- NEW_USER_FULLNAME: 1-64 characters, printable characters
- TRANSFER_SSH_KEYS: "yes" or "no"
- IMPORT_GITHUB_KEYS: "yes" or "no"
- GITHUB_USERNAME: Valid GitHub username format

### 4. Package Selection Configuration 
```bash
SELECTED_PACKAGE_CATEGORIES="Convenience packages (vim, nano, htop, etc.)
Network packages (netplan, tc, iperf3, tailscale, etc.)
Security packages (fail2ban, aide, clamav, etc.)
Monitoring packages (sensors, collectd, etc.)
Backup packages (borgbackup, restic)
Automatic update packages"
```

**Available Categories**:
- **Convenience**: Development and system administration tools
- **Network**: Networking tools and VPN software
- **Security**: Security monitoring and hardening tools
- **Monitoring**: System monitoring and logging tools
- **Backup**: Backup and archival software
- **Automatic Updates**: Unattended security updates
- **Docker**: Docker container runtime and tools

### 5. Docker Services Configuration 
```bash
SELECTED_DOCKER_SERVICES="traefik:Traefik (Reverse Proxy)
komodo:Komodo (Docker Management)
jellyfin:Jellyfin (Media Server)
komga:Komga (Comic/Book Server)"
```

**Available Services**:
- **traefik**: Reverse proxy and load balancer
- **komodo**: Docker container management interface
- **jellyfin**: Media server for movies, TV, music
- **komga**: Comic and book server
- **kiwix**: Offline content server
- **dns**: AdGuard Home DNS filtering
- **portainer**: Alternative Docker management
- **romm**: ROM management for gaming
- **docmost**: Documentation platform
- **onedev**: Git server and CI/CD

### 6. FriendlyElec Hardware Configuration 
```bash
FRIENDLYELEC_INSTALL_PACKAGES="Hardware acceleration packages (Mesa, GStreamer)
Development packages (kernel headers, build tools)"

FRIENDLYELEC_ENABLE_FEATURES="Hardware acceleration
GPIO/PWM access"
```

**Hardware Package Categories**:
- **Hardware Acceleration**: Mesa, GStreamer, V4L2 utilities
- **Development**: Build tools, kernel headers
- **Media**: FFmpeg, codec libraries
- **GPIO/PWM**: Python GPIO libraries, WiringPi

**Hardware Features**:
- **Hardware Acceleration**: GPU and VPU acceleration
- **GPIO/PWM Access**: Hardware interface access
- **Thermal Management**: Fan control and monitoring
- **Performance Tuning**: CPU/GPU governor optimization

## Configuration Templates

### 1. SSH Configuration Template
**Component**: Configuration module module
**Variables**:
- `${SSH_PORT}` - Custom SSH port
- `${NEW_USERNAME}` - Allowed user account

### 2. Fail2ban Configuration Template
**Component**: Configuration module module
**Variables**:
- `${SSH_PORT}` - SSH port to monitor
- `${FAIL2BAN_BANTIME}` - Ban duration
- `${FAIL2BAN_MAXRETRY}` - Maximum retry attempts

### 3. Network Configuration Templates
**Files**:
- configuration module
- configuration module
- configuration module

**Variables**:
- `${WIFI_SSID}` - WiFi network name
- `${WIFI_PASSWORD}` - WiFi password
- `${LAN_NETWORK}` - LAN network range
- `${LAN_IP}` - Gateway IP address
- `${DHCP_START}` - DHCP range start
- `${DHCP_END}` - DHCP range end

### 4. Docker Configuration Templates
**Files**:
- configuration module
- configuration module

**Variables**:
- Docker daemon configuration
- Container update scheduling
- Logging configuration

## Validation System

### 1. Input Validation Functions 

#### IP Address Validation
```bash
validate_ip_address() {
  local ip="$1"
  local ip_regex='^([0-9]{1,3}\.){3}[0-9]{1,3}$'
  
  if [[ $ip =~ $ip_regex ]]; then
    # Validate each octet is 0-255
    local IFS='.'
    local octets=($ip)
    for octet in "${octets[@]}"; do
      if [[ $octet -lt 0 || $octet -gt 255 ]]; then
        return 1
      fi
    done
    return 0
  fi
  return 1
}
```

#### Port Number Validation
```bash
validate_port_number() {
  local port="$1"
  if [[ $port =~ ^[0-9]+$ ]] && [[ $port -ge 1 ]] && [[ $port -le 65535 ]]; then
    return 0
  fi
  return 1
}
```

#### Interface Name Validation
```bash
validate_interface_name() {
  local interface="$1"
  local interface_regex='^[a-zA-Z0-9_-]{1,15}$'
  [[ $interface =~ $interface_regex ]]
}
```

#### Path Safety Validation
```bash
validate_path_safe() {
  local path="$1"
  # Prevent path traversal attacks
  if [[ "$path" =~ \.\./|\.\.\\ ]] || [[ "$path" =~ ^[[:space:]]*$ ]]; then
    return 1
  fi
  return 0
}
```

### 2. Email Validation
```bash
validate_email() {
  local email="$1"
  local email_regex='^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
  [[ $email =~ $email_regex ]]
}
```

## Configuration File Processing

### 1. Template Processing 
```bash
standard_process_template() {
  local template_file="$1"
  local output_file="$2"
  shift 2
  
  # Additional variables can be passed as arguments
  local additional_vars=("$@")
  
  # Process template with environment variable substitution
  envsubst < "$template_file" > "$output_file.tmp"
  
  # Atomic move to final location
  mv "$output_file.tmp" "$output_file"
}
```

### 2. Environment File Creation 
```bash
standard_create_env_file() {
  local file_path="$1"
  local content="$2"
  local mode="${3:-600}" # Secure by default
  local owner="${4:-root}"
  local group="${5:-root}"
  
  # Create file with secure permissions
  echo "$content" > "$file_path.tmp"
  chmod "$mode" "$file_path.tmp"
  chown "$owner:$group" "$file_path.tmp"
  mv "$file_path.tmp" "$file_path"
}
```

## Configuration State Management

### 1. Configuration Persistence 
**Process**:
1. Collect all configuration variables
2. Generate configuration file with comments
3. Set secure permissions (600)
4. Store in `/etc/dangerprep/setup-config.conf`

### 2. Configuration Loading 
**Process**:
1. Check if configuration file exists
2. Source configuration file to restore variables
3. Validate loaded configuration
4. Apply configuration to current session

### 3. Installation State Tracking 
**Process**:
1. Track each installation phase status
2. Support resume from last completed phase
3. Handle failed phases with recovery options
4. Provide installation progress visibility

## Environment Variable Processing

### 1. Docker Environment Configuration
**Component**: Configuration module module
**Process**:
1. Scan selected Docker services
2. Find corresponding environment files
3. Process PROMPT and GENERATE directives
4. Create service-specific environment files

### 2. Directive Processing Pipeline
1. **Parse**: Extract directive type and parameters
2. **Validate**: Check parameter syntax and types
3. **Process**: Execute PROMPT or GENERATE action
4. **Store**: Save processed values to environment files

### 3. Error Handling and Recovery
**Component**: Configuration module module
**Features**:
- Comprehensive error tracking
- Recovery mechanisms for failed operations
- Validation of processed values
- Rollback capabilities for failed configurations

---

*This configuration reference provides complete documentation of all configuration options, validation rules, and processing mechanisms in the setup system. Each configuration option includes its purpose, default value, validation rules, and usage context.*
