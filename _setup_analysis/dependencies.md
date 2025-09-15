# Dependencies Analysis

## Overview

This document provides a comprehensive analysis of all dependencies, prerequisites, and external requirements for the DangerPrep setup system. Every dependency is categorized by type, criticality, and installation method.

## System Prerequisites

### 1. Operating System Requirements 

#### Primary Target
- **Ubuntu 24.04 LTS** - Primary supported distribution
- **Architecture**: ARM64 (aarch64) and x86_64 (amd64)
- **Kernel**: Linux 6.8+ (Ubuntu 24.04 default)

#### Compatibility
- **Other Ubuntu Versions**: May work with warnings
- **Debian-based**: Likely compatible but untested
- **Other Distributions**: Not supported

#### Hardware Requirements 
- **Minimum Disk Space**: 10GB free space on root filesystem
- **Minimum RAM**: 2GB system memory
- **Recommended**: 4GB+ RAM, 20GB+ disk space for full functionality

### 2. Essential System Commands 

#### Core System Utilities (Pre-installed on Ubuntu 24.04)
```bash
systemctl:systemd     # Service management
apt:apt           # Package manager
ip:iproute2         # Network configuration
lsb_release:lsb-release   # OS identification
ping:iputils-ping      # Network connectivity testing
df:coreutils        # Disk usage checking
free:procps         # Memory usage checking
```

#### Shell Requirements 
- **Bash Version**: 4.0+ required
- **Shell Features**: Associative arrays, parameter expansion, regex matching
- **Current Check**: `the setup system | grep -oE '[0-9]+\.[0-9]+' | head -n1`

### 3. Privilege Requirements
- **Root Access**: Must run with `sudo` or as root user
- **Sudo Configuration**: Standard Ubuntu sudo configuration
- **User Context**: Preserves original user context via `$SUDO_USER`

## Network Dependencies

### 1. Internet Connectivity Requirements 

#### Connectivity Check
```bash
check_network_connectivity() {
  local host="${1:-8.8.8.8}"
  local timeout="${2:-5}"
  timeout "$timeout" ping -c 1 "$host" >/dev/null 2>&1
}
```

#### Required Network Access
- **DNS Resolution**: Must resolve external hostnames
- **HTTP/HTTPS**: Port 80/443 for package downloads
- **Package Repositories**: Access to Ubuntu and third-party repos

### 2. External Repository Dependencies

#### Docker Repository 
- **GPG Key**: `https://download.docker.com/linux/ubuntu/gpg`
- **Repository**: `https://download.docker.com/linux/ubuntu`
- **Purpose**: Docker CE packages installation

#### Tailscale Repository 
- **GPG Key**: `https://pkgs.tailscale.com/stable/ubuntu/$(lsb_release -cs).noarmor.gpg`
- **Repository**: `https://pkgs.tailscale.com/stable/ubuntu`
- **Purpose**: Tailscale VPN client installation

#### GitHub API Access 
- **Endpoint**: `https://api.github.com/users/{username}/keys`
- **Purpose**: SSH key import functionality
- **Authentication**: Public API, no authentication required
- **Rate Limits**: GitHub API rate limits apply

### 3. Container Registry Access
- **Docker Hub**: `registry-1.docker.io` for container images
- **GitHub Container Registry**: `ghcr.io` for some services
- **Bandwidth**: Significant bandwidth required for image downloads

## Package Dependencies

### 1. Core System Packages 
**Always Installed**:
```bash
curl          # HTTP client for downloads
wget          # Alternative HTTP client
git           # Version control system
bc           # Basic calculator for shell operations
unzip          # Archive extraction
software-properties-common # Repository management
apt-transport-https   # HTTPS repository support
ca-certificates     # SSL certificate validation
gnupg          # GPG key management
lsb-release      # OS version detection
iptables        # Firewall management
iptables-persistent  # Firewall persistence
```

### 2. Optional Package Categories

#### Convenience Packages 
```bash
vim, nano       # Text editors
htop, tree       # System monitoring and file browsing
zip, jq        # Archive and JSON processing
rsync, screen, tmux  # File sync and terminal multiplexing
fastfetch       # System information display
```

#### Network Packages 
```bash
netplan.io       # Network configuration
iproute2        # Advanced networking tools
wondershaper      # Bandwidth shaping
iperf3         # Network performance testing
tailscale       # VPN mesh networking
```

#### Security Packages 
```bash
fail2ban        # Intrusion prevention
aide          # File integrity monitoring
rkhunter, chkrootkit  # Rootkit detection
clamav, clamav-daemon # Antivirus scanning
lynis         # Security auditing
suricata        # Network intrusion detection
apparmor, apparmor-utils # Mandatory access control
libpam-pwquality    # Password quality enforcement
libpam-tmpdir     # Temporary directory isolation
acct          # Process accounting
```

#### Monitoring Packages 
```bash
lm-sensors       # Hardware sensor monitoring
fancontrol       # Fan speed control
sensors-applet     # Sensor GUI (if desktop)
collectd, collectd-utils # System metrics collection
logwatch        # Log analysis and reporting
rsyslog-gnutls     # Secure log transmission
smartmontools     # Disk health monitoring
```

#### Backup Packages 
```bash
borgbackup       # Deduplicating backup tool
restic         # Modern backup program
```

#### Docker Packages 
```bash
docker-ce       # Docker Community Edition
docker-ce-cli     # Docker command-line interface
containerd.io     # Container runtime
docker-buildx-plugin  # Extended build capabilities
docker-compose-plugin # Multi-container applications
```

### 3. FriendlyElec Hardware Packages 

#### Hardware Acceleration (RK3588/RK3588S)
```bash
mesa-utils       # OpenGL utilities
glmark2-es2      # OpenGL ES benchmarking
v4l-utils       # Video4Linux utilities
gstreamer1.0-tools   # GStreamer multimedia framework
gstreamer1.0-plugins-bad # GStreamer plugins
gstreamer1.0-rockchip1 # Rockchip-specific plugins
```

#### Development Packages
```bash
build-essential    # Compilation tools (gcc, make, etc.)
linux-headers-generic # Kernel headers for module compilation
```

#### Media Packages
```bash
ffmpeg         # Multimedia processing
libavcodec-extra    # Additional codec support
```

#### GPIO/PWM Packages
```bash
python3-rpi.gpio    # GPIO control library
python3-gpiozero    # GPIO zero library
wiringpi        # GPIO access library
```

## External Tool Dependencies

### 1. Gum UI Framework (Optional)
**Source**: Shared utilities module
**Purpose**: Enhanced user interface and interaction
**Fallback**: Basic shell prompts if unavailable
**Installation**: Not managed by setup script

### 2. Fastfetch System Information 
**Primary Source**: Ubuntu repository (`apt install fastfetch`)
**Fallback Source**: GitHub releases
**Architecture Support**: amd64, aarch64, armv7l, armv6l
**Download URL**: `https://api.github.com/repos/fastfetch-cli/fastfetch/releases/latest`

### 3. Configuration Templates
**Location**: Configuration templates directory
**Categories**:
- DNS configuration templates
- Docker configuration templates
- FriendlyElec hardware templates
- Monitoring configuration templates
- Network configuration templates
- Security configuration templates
- Sync configuration templates
- System configuration templates

## Hardware Dependencies

### 1. FriendlyElec Platform Detection 

#### Supported Platforms
- **NanoPi R6C**: Dual Ethernet (2.5GbE + GbE), RK3588S
- **NanoPi M6**: Single Ethernet, LCD support, RK3588S
- **NanoPC-T6**: Dual Gigabit Ethernet, RK3588

#### Hardware Features
- **RK3588/RK3588S SoC**: ARM Cortex-A76/A55 CPU clusters
- **Mali-G610 MP4 GPU**: Hardware graphics acceleration
- **NPU**: Neural processing unit (6 TOPS)
- **VPU**: Video processing unit with codec support
- **GPIO/PWM**: Hardware interface support

#### Detection Method
```bash
# Device tree detection
if [[ -f /proc/device-tree/model ]]; then
  local model
  model=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0')
  case "$model" in
    *"NanoPi R6C"*) PLATFORM="NanoPi R6C" ;;
    *"NanoPi M6"*) PLATFORM="NanoPi M6" ;;
    *"NanoPC-T6"*) PLATFORM="NanoPC-T6" ;;
  esac
fi
```

### 2. Storage Requirements

#### NVMe Storage 
- **Detection**: `lsblk -d -n -o NAME | grep '^nvme'`
- **Partitioning**: GPT partition table
- **Filesystems**: ext4 for both data and content partitions
- **Mount Points**: `/data` (256GB), `/content` (remaining space)

#### Fallback Storage
- **Root Filesystem**: Minimum 10GB free space
- **Fallback Directories**: `${INSTALL_ROOT}/data`, `${INSTALL_ROOT}/content`

### 3. Network Interface Requirements

#### Interface Detection 
```bash
# Ethernet interfaces
ethernet_interfaces=($(ip link show | grep -E '^[0-9]+: (eth|enp|eno|ens)' | cut -d: -f2 | tr -d ' '))

# WiFi interfaces 
wifi_interfaces=($(ip link show | grep -E '^[0-9]+: (wlan|wlp|wlo|wls)' | cut -d: -f2 | tr -d ' '))
```

#### Interface Requirements
- **Minimum**: One network interface (ethernet or WiFi)
- **Optimal**: Separate WAN and LAN interfaces
- **FriendlyElec**: Hardware-specific interface optimization

## Service Dependencies

### 1. Systemd Services
**Required Services**:
- `systemd` - Service management
- `systemd-resolved` - DNS resolution
- `systemd-networkd` - Network management (optional)

**Created Services**:
- `docker` - Container runtime
- `fail2ban` - Intrusion prevention
- `unattended-upgrades` - Automatic updates
- `dangerprep-finalize` - Post-reboot cleanup
- `dangerprep-emergency-recovery` - Boot safety

### 2. Docker Runtime Dependencies
- **containerd**: Container runtime
- **runc**: Container execution
- **Docker networks**: Bridge networking support
- **cgroups**: Resource management
- **Namespace support**: Container isolation

## File System Dependencies

### 1. Required Directories
```bash
/etc/dangerprep/      # Configuration storage
/var/log/         # Log file storage
/var/backups/       # Backup storage
/var/lock/         # Lock file storage
/usr/share/keyrings/    # GPG key storage
/etc/apt/sources.list.d/  # Repository configuration
```

### 2. Mount Point Requirements
```bash
/data           # NVMe data partition (optional)
/content          # NVMe content partition (optional)
/tmp            # Temporary file storage
```

### 3. Configuration File Dependencies
- `/etc/ssh/sshd_config` - SSH daemon configuration
- `/etc/sysctl.conf` - Kernel parameters
- `/etc/fail2ban/jail.local` - Intrusion prevention
- `/etc/aide/aide.conf` - File integrity monitoring
- `/etc/fstab` - Filesystem mount configuration

## Security Dependencies

### 1. Cryptographic Requirements
- **GPG**: Package signature verification
- **SSL/TLS**: HTTPS repository access
- **SSH**: Secure remote access
- **Random Number Generation**: `/dev/urandom` for secrets

### 2. User and Group Management
- **sudo**: Privilege escalation
- **User creation**: `useradd`, `usermod`, `userdel`
- **Group management**: `groupadd`, `groupmod`
- **Permission management**: `chmod`, `chown`

### 3. Firewall and Network Security
- **iptables**: Packet filtering
- **iptables-persistent**: Rule persistence
- **fail2ban**: Intrusion prevention
- **AppArmor**: Mandatory access control

## Development and Build Dependencies

### 1. Compilation Tools (Optional)
```bash
build-essential      # GCC, make, libc-dev
linux-headers-generic   # Kernel headers
```

### 2. Kernel Module Support
- **DKMS**: Dynamic kernel module support
- **Module loading**: `modprobe`, `insmod`
- **Module configuration**: `/etc/modules`

---

*This dependencies analysis provides a complete catalog of all system requirements, external dependencies, and prerequisites for the setup script. Each dependency includes its purpose, installation method, and criticality level.*
