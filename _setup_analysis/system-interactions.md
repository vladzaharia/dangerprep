# System Interactions Analysis

## Overview

This document catalogs all system-level changes and interactions performed by the DangerPrep setup system. Every system modification, file creation, service configuration, and external dependency is documented here.

## File System Modifications

### 1. Configuration File Changes

#### SSH Configuration
**Component**: Configuration module
**Modifications**:
```bash
# SSH hardening configuration
Port 2222              # Custom SSH port
PermitRootLogin no          # Disable root login
PasswordAuthentication no      # Key-based auth only
PubkeyAuthentication yes       # Enable public key auth
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3            # Limit auth attempts
ClientAliveInterval 300       # Keep-alive interval
ClientAliveCountMax 2        # Max keep-alive count
UsePAM yes             # Use PAM for authentication
X11Forwarding no           # Disable X11 forwarding
AllowUsers ${NEW_USERNAME}      # Restrict user access
```

**Backup Strategy**: Original file backed up to `$BACKUP_DIR/sshd_config`

#### Kernel Security Parameters
**Component**: Configuration module
**Modifications**:
```bash
# Network security
net.ipv4.ip_forward=1        # Enable IP forwarding
net.ipv4.conf.all.send_redirects=0  # Disable ICMP redirects
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.accept_redirects=0 # Don't accept redirects
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.secure_redirects=0 # Don't accept secure redirects
net.ipv4.conf.default.secure_redirects=0

# TCP hardening
net.ipv4.tcp_syncookies=1      # Enable SYN cookies
net.ipv4.tcp_rfc1337=1        # Protect against time-wait attacks
net.ipv4.tcp_timestamps=0      # Disable TCP timestamps

# Memory protection
kernel.dmesg_restrict=1       # Restrict dmesg access
kernel.kptr_restrict=2        # Hide kernel pointers
kernel.yama.ptrace_scope=1      # Restrict ptrace
```

#### Fail2ban Configuration
**Component**: Configuration module
**Template**: Configuration template module
**Key Settings**:
- SSH jail enabled with custom port
- Ban time: 3600 seconds (configurable)
- Max retry: 3 attempts (configurable)
- Email notifications configured

#### AIDE File Integrity Monitoring
**Component**: Configuration module
**Template**: Configuration template module
**Monitored Paths**:
- `/etc` - System configuration files
- `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin` - System binaries
- `/lib`, `/lib64`, `/usr/lib` - System libraries
- `/boot` - Boot files
- `/root` - Root user directory

### 2. Package Repository Management

#### Docker Repository
**GPG Key**: `/usr/share/keyrings/docker-archive-keyring.gpg`
**Repository File**: `/etc/apt/sources.list.d/docker.list`
**Content**:
```bash
deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable
```

#### Tailscale Repository
**GPG Key**: `/usr/share/keyrings/tailscale-archive-keyring.gpg`
**Repository File**: `/etc/apt/sources.list.d/tailscale.list`
**Content**:
```bash
deb [signed-by=/usr/share/keyrings/tailscale-archive-keyring.gpg] https://pkgs.tailscale.com/stable/ubuntu $(lsb_release -cs) main
```

### 3. Directory Structure Creation

#### Base Installation Directories
```bash
${INSTALL_ROOT}/docker:755:root:root   # Docker configurations
${INSTALL_ROOT}/nfs:755:root:root    # NFS mount points
${INSTALL_ROOT}/secrets:755:root:root  # Secret storage
```

#### Data Directories
**Mount Point**: `/data` (NVMe partition)
```bash
/data/traefik:755:root:root       # Traefik reverse proxy data
/data/komodo:755:root:root        # Komodo management data
/data/komodo-mongo/db:755:root:root   # MongoDB database
/data/komodo-mongo/config:755:root:root # MongoDB configuration
/data/jellyfin/config:755:root:root   # Jellyfin media server config
/data/jellyfin/cache:755:root:root    # Jellyfin cache
/data/komga/config:755:root:root     # Komga book server config
/data/kiwix:755:root:root        # Kiwix offline content
/data/logs:755:root:root         # Centralized logging
/data/backups:755:root:root       # Backup storage
/data/raspap:755:root:root        # RaspAP configuration
/data/step-ca:755:root:root       # Certificate authority
/data/adguard/work:755:root:root     # AdGuard Home working dir
/data/adguard/conf:755:root:root     # AdGuard Home config
```

#### Content Directories
**Mount Point**: `/content` (NVMe partition)
```bash
/content/movies:755:root:root      # Movie files
/content/tv:755:root:root        # TV show files
/content/music:755:root:root       # Music files
/content/audiobooks:755:root:root    # Audiobook files
/content/books:755:root:root       # eBook files
/content/comics:755:root:root      # Comic files
/content/magazines:755:root:root     # Magazine files
/content/games/roms:755:root:root    # Game ROM files
/content/kiwix:755:root:root       # Kiwix content files
```

## Package Installation

### 1. Core System Packages 
**Always Installed**:
```bash
curl, wget, git, bc, unzip, software-properties-common, 
apt-transport-https, ca-certificates, gnupg, lsb-release, 
iptables, iptables-persistent
```

### 2. Optional Package Categories

#### Convenience Packages
```bash
vim, nano, htop, tree, zip, jq, rsync, screen, tmux, fastfetch
```

#### Network Packages
```bash
netplan.io, iproute2, wondershaper, iperf3, tailscale
```

#### Security Packages
```bash
fail2ban, aide, rkhunter, chkrootkit, clamav, clamav-daemon, 
lynis, suricata, apparmor, apparmor-utils, libpam-pwquality, 
libpam-tmpdir, acct
```

#### Monitoring Packages
```bash
lm-sensors, fancontrol, sensors-applet, collectd, collectd-utils, 
logwatch, rsyslog-gnutls, smartmontools
```

#### Backup Packages
```bash
borgbackup, restic
```

#### Docker Packages
```bash
docker-ce, docker-ce-cli, containerd.io, docker-buildx-plugin, 
docker-compose-plugin
```

### 3. FriendlyElec Hardware Packages

#### Hardware Acceleration Packages (RK3588/RK3588S)
```bash
mesa-utils, glmark2-es2, v4l-utils, gstreamer1.0-tools, 
gstreamer1.0-plugins-bad, gstreamer1.0-rockchip1
```

#### Development Packages
```bash
build-essential, linux-headers-generic
```

#### Media Packages
```bash
ffmpeg, libavcodec-extra
```

#### GPIO/PWM Packages
```bash
python3-rpi.gpio, python3-gpiozero, wiringpi
```

## Service Management

### 1. Systemd Services Created

#### Docker Service
**Operations**:
- Enable Docker service: `systemctl enable docker`
- Start Docker service: `systemctl start docker`
- Wait for daemon readiness (30-second timeout)

#### Fail2ban Service
**Operations**:
- Enable fail2ban service: `systemctl enable fail2ban`
- Start fail2ban service: `systemctl start fail2ban`

#### Unattended Upgrades
**Operations**:
- Enable unattended-upgrades: `systemctl enable unattended-upgrades`
- Configure automatic security updates

### 2. Custom Services Created

#### Pi User Cleanup Service
**Service File**: `/etc/systemd/system/dangerprep-finalize.service`
**Purpose**: Remove pi user after reboot
**Configuration**:
```ini
[Unit]
Description=DangerPrep Post-Reboot Finalization
After=multi-user.target
Wants=multi-user.target

[Service]
Type=oneshot
ExecStart=/dangerprep/configuration module
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

#### Emergency Recovery Service
**Service File**: `/etc/systemd/system/dangerprep-emergency-recovery.service`
**Purpose**: Prevent boot hangs and provide recovery
**Configuration**:
```ini
[Unit]
Description=DangerPrep Emergency Recovery
DefaultDependencies=no
After=sysinit.target
Before=basic.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/dangerprep-emergency-recovery
RemainAfterExit=yes
TimeoutStartSec=30

[Install]
WantedBy=basic.target
```

## Network Configuration

### 1. Docker Networks
**Network Created**: `traefik`
**Command**: `docker network create traefik`
**Purpose**: Container communication for reverse proxy

### 2. Interface Detection
**Process**:
1. Enumerate all network interfaces
2. Categorize as ethernet or WiFi
3. Detect interface capabilities (speed, duplex)
4. Select appropriate interfaces for WAN/LAN

### 3. RaspAP Integration
**Configuration Files**:
- `/etc/hostapd/hostapd.conf` - WiFi AP configuration
- `/etc/dnsmasq.conf` - DHCP/DNS configuration
- `/etc/dhcpcd.conf` - Network interface configuration

## Storage Management

### 1. NVMe Storage Detection
**Process**:
1. Detect NVMe devices: `lsblk -d -n -o NAME | grep '^nvme'`
2. Check existing partitions
3. Prompt for partitioning confirmation
4. Create partition table if confirmed

### 2. Partition Creation
**Partition Scheme**:
- Partition 1: 256GB `/data` (ext4)
- Partition 2: Remaining space `/content` (ext4)

**Commands**:
```bash
parted ${nvme_device} mklabel gpt
parted ${nvme_device} mkpart primary ext4 0% 256GB
parted ${nvme_device} mkpart primary ext4 256GB 100%
mkfs.ext4 -F ${nvme_device}p1
mkfs.ext4 -F ${nvme_device}p2
```

### 3. Mount Configuration
**fstab Entries**:
```bash
${nvme_device}p1 /data ext4 defaults,noatime 0 2
${nvme_device}p2 /content ext4 defaults,noatime 0 2
```

## User Management

### 1. Docker System Account
**Account Creation**:
```bash
groupadd --gid 1337 dockerapp
useradd --system --uid 1337 --gid 1337 --no-create-home --shell /usr/sbin/nologin dockerapp
```

### 2. New User Account
**Process**:
1. Create user with specified username
2. Set password (if provided)
3. Add to required groups: `sudo`, `docker`, `adm`, `dialout`, `plugdev`
4. Configure home directory
5. Import SSH keys (from pi user or GitHub)

### 3. Pi User Removal
**Deferred Process** (via reboot service):
1. Kill all pi user processes
2. Backup pi user data
3. Remove pi user account: `userdel -r pi`
4. Update configuration files
5. Remove pi user references

## Security Hardening

### 1. File Permissions
**Sensitive Files**:
- Configuration files: `600` (owner read/write only)
- SSH keys: `600` (owner read/write only)
- Service files: `644` (owner read/write, group/other read)
- Directories: `755` (owner full, group/other read/execute)

### 2. AppArmor Configuration
**Status**: Enabled and enforced
**Profiles**: Default Ubuntu profiles plus container security

### 3. Firewall Configuration
**iptables Rules**:
- Default DROP policy for INPUT/FORWARD
- Allow established/related connections
- Allow SSH on custom port
- Allow HTTP/HTTPS for services
- Allow DHCP and DNS for AP functionality

## External Dependencies

### 1. Network Dependencies
**Required Connectivity**:
- GitHub API: `api.github.com` (SSH key import)
- Docker Hub: `registry-1.docker.io` (container images)
- Ubuntu repositories: `archive.ubuntu.com`
- Docker repository: `download.docker.com`
- Tailscale repository: `pkgs.tailscale.com`

### 2. Hardware Dependencies
**FriendlyElec Platforms**:
- GPIO/PWM interfaces
- Hardware acceleration (RK3588/RK3588S)
- Thermal sensors and fan control
- NVMe storage interfaces

### 3. Software Dependencies
**External Tools**:
- `gum` - Enhanced user interface (optional)
- `fastfetch` - System information display
- `docker` - Container runtime
- `tailscale` - VPN mesh networking

## Logging and Monitoring

### 1. Log Files Created
**Primary Log**: `/var/log/dangerprep-setup.log`
**Backup Logs**: `/var/backups/dangerprep-setup-*`
**Service Logs**: Available via `journalctl`

### 2. State Files
**Configuration State**: `/etc/dangerprep/setup-config.conf`
**Installation State**: `/etc/dangerprep/install-state.conf`
**Lock File**: `/var/lock/dangerprep-setup.lock`

### 3. Monitoring Integration
**AIDE Database**: `/var/lib/aide/aide.db`
**Fail2ban Logs**: `/var/log/fail2ban.log`
**Docker Logs**: Via Docker logging driver

## Backup and Recovery

### 1. Configuration Backups
**Backup Directory**: `/var/backups/dangerprep-setup-$(date +%Y%m%d-%H%M%S)`
**Files Backed Up**:
- `/etc/ssh/sshd_config`
- `/etc/sysctl.conf`
- `/etc/fail2ban/jail.conf`
- `/etc/aide/aide.conf`
- `/etc/sensors3.conf`
- `/etc/netplan/*`

### 2. Recovery Mechanisms
**Emergency Recovery Service**: Automatic boot hang prevention
**Manual Recovery**: Cleanup script available
**State Restoration**: Configuration and installation state preserved

---

*This system interactions analysis documents all system-level changes made by the setup script. Each modification is traceable to specific code sections and includes the rationale for the change.*
