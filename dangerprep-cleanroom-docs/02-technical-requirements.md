# DangerPrep Technical Requirements - Cleanroom Implementation

## System Requirements

### Operating System Requirements
- **Required OS**: Ubuntu 24.04 LTS (Noble Numbat)
- **Architecture**: aarch64/arm64 (FriendlyElec) or x86_64 (generic)
- **Kernel**: Linux 6.8+ with systemd support
- **Root Access**: Required for system configuration
- **Internet Access**: Required for initial setup and package installation

### Hardware Requirements

#### Minimum Requirements
- **CPU**: 2 cores minimum
- **Memory**: 2GB RAM minimum
- **Storage**: 20GB free space minimum
- **Network**: 1x Ethernet interface
- **WiFi**: 802.11n compatible wireless adapter

#### Recommended Requirements
- **CPU**: 4+ cores (ARM Cortex-A76/A55 or x86_64)
- **Memory**: 8GB RAM for optimal Olares performance
- **Storage**: 64GB+ with NVMe SSD support
- **Network**: Gigabit Ethernet
- **WiFi**: 802.11ac with WPA3 support

#### FriendlyElec Specific Requirements
- **SoC**: RK3588 or RK3588S
- **GPU**: Mali-G610 MP4 (for hardware acceleration)
- **VPU**: RK3588 video processing unit
- **NPU**: RK3588 neural processing unit (6 TOPS)
- **Storage**: NVMe M.2 SSD recommended for Olares

## Package Requirements

### Essential System Packages
```bash
# Core system utilities
apt-transport-https
ca-certificates
curl
wget
gnupg
lsb-release
software-properties-common

# Network management
netplan.io
iproute2
iptables
iptables-persistent
bridge-utils

# WiFi and wireless
hostapd
wpasupplicant
wireless-tools
iw
rfkill

# DHCP and DNS
dnsmasq

# System monitoring
systemd
rsyslog
logrotate
cron
```

### Security Packages
```bash
# Intrusion prevention
fail2ban

# File integrity monitoring
aide

# Antivirus and malware detection
clamav
clamav-daemon
clamav-freshclam

# Rootkit detection
rkhunter
chkrootkit

# Security auditing
lynis

# System hardening
apparmor
apparmor-utils
libpam-pwquality
libpam-tmpdir

# Process accounting
acct
psacct

# Web utilities
apache2-utils
```

### Hardware Monitoring Packages
```bash
# Temperature and sensor monitoring
lm-sensors
hddtemp
fancontrol
sensors-applet

# Storage monitoring
smartmontools

# System monitoring
collectd
collectd-utils

# Log analysis
logwatch
rsyslog-gnutls
```

### Network and Storage Packages
```bash
# NFS client support
nfs-common

# Backup tools
borgbackup
restic

# Network performance tools
iperf3
tc
wondershaper

# Automatic updates
unattended-upgrades
```

### FriendlyElec Specific Packages
```bash
# Hardware acceleration (if available)
mesa-utils
vainfo
gstreamer1.0-plugins-bad
gstreamer1.0-vaapi

# Development tools for hardware access
build-essential
device-tree-compiler
```

## Network Configuration Requirements

### Interface Requirements
- **WAN Interface**: Ethernet interface for internet connection
- **WiFi Interface**: 802.11n/ac compatible adapter
- **Multiple Interfaces**: Support for dual ethernet on R6C

### Network Address Allocation
```
Network: 192.168.120.0/22
Subnet Mask: 255.255.252.0
Gateway: 192.168.120.1
DHCP Range: 192.168.120.100 - 192.168.120.200
DNS Servers: 192.168.120.1 (local), upstream via AdGuard
```

### Port Allocations
```
SSH: 2222 (hardened)
AdGuard Home: 3000 (internal)
Step-CA: 9000 (internal)
Kiwix: 8080 (internal)
Olares: Various (managed by K3s)
```

### Firewall Requirements
- **Default Policy**: DROP for INPUT and FORWARD
- **WAN Hardening**: Minimal service exposure
- **NAT**: Masquerading for WiFi clients
- **Port Forwarding**: Configurable rules
- **DDoS Protection**: Rate limiting and connection tracking

## Storage Requirements

### System Storage Layout
```
/ (root)           - 20GB minimum
/var/log          - 2GB minimum (log retention)
/var/lib          - 5GB minimum (service data)
/tmp              - 1GB minimum (temporary files)
```

### NVMe Storage Layout (Optional)
```
/dev/nvme0n1p1    - 256GB (Olares partition, ext4)
/dev/nvme0n1p2    - Remaining space (Content partition, ext4)
```

### Mount Points
```
/olares           - Olares data partition
/content          - Content storage partition
/nfs              - NFS mount points
```

### File System Requirements
- **Root FS**: ext4 with journal
- **Olares FS**: ext4 optimized for containers
- **Content FS**: ext4 with large file support
- **Backup**: Support for encrypted archives

## Service Requirements

### Systemd Services
```bash
# Network services
hostapd.service
dnsmasq.service

# Security services
fail2ban.service
clamav-daemon.service
clamav-freshclam.service

# Application services
adguardhome.service
step-ca.service

# Olares services
k3s.service (installed by Olares)

# FriendlyElec services (if applicable)
rk3588-fan-control.service
rk3588-cpu-governor.service
```

### Cron Jobs
```bash
# Security monitoring
0 2 * * * /usr/local/bin/aide-check
0 3 * * 0 /usr/local/bin/clamav-scan
0 4 * * 0 /usr/local/bin/rkhunter-scan
0 5 1 * * /usr/local/bin/lynis-audit

# System maintenance
0 1 * * * /usr/local/bin/dangerprep-backup
0 6 * * * /usr/local/bin/dangerprep-monitor

# Hardware monitoring (FriendlyElec)
*/5 * * * * /usr/local/bin/hardware-monitor
```

## Security Requirements

### SSH Configuration
```
Port 2222
Protocol 2
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
HostKey /etc/ssh/ssh_host_ed25519_key
KexAlgorithms curve25519-sha256@libssh.org
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com
```

### Kernel Security Parameters
```
# Network security
net.ipv4.ip_forward=1
net.ipv4.conf.all.rp_filter=1
net.ipv4.conf.default.rp_filter=1
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.send_redirects=0
net.ipv4.conf.all.accept_source_route=0
net.ipv4.conf.default.accept_source_route=0
net.ipv4.conf.all.log_martians=1
net.ipv4.conf.default.log_martians=1
net.ipv4.icmp_echo_ignore_broadcasts=1
net.ipv4.icmp_ignore_bogus_error_responses=1
net.ipv4.tcp_syncookies=1

# Memory protection
kernel.dmesg_restrict=1
kernel.kptr_restrict=2
kernel.yama.ptrace_scope=1
```

### File Permissions
```
/etc/dangerprep/           - 755 root:root
/etc/dangerprep/wifi-password - 600 root:root
/var/lib/dangerprep/       - 755 root:root
/var/log/dangerprep*.log   - 640 root:adm
```

## Validation Requirements

### Pre-flight Checks
- System compatibility (Ubuntu 24.04)
- Hardware requirements (CPU, RAM, storage)
- Network interface availability
- Package manager functionality
- Internet connectivity
- Conflicting service detection

### Runtime Validation
- Template variable validation
- Network configuration validation
- Service port conflict detection
- File system permissions
- Service health checks

### Post-installation Verification
- Network connectivity tests
- Service functionality tests
- Security configuration validation
- Hardware optimization verification
- Backup system validation

## Environment Variables

### Required Variables
```bash
WIFI_SSID="DangerPrep"
WIFI_PASSWORD="Buff00n!"  # Or generated secure password
LAN_NETWORK="192.168.120.0/22"
LAN_IP="192.168.120.1"
DHCP_START="192.168.120.100"
DHCP_END="192.168.120.200"
SSH_PORT="2222"
FAIL2BAN_BANTIME="3600"
FAIL2BAN_MAXRETRY="3"
```

### Optional Variables
```bash
DANGERPREP_INSTALL_ROOT="/opt/dangerprep"
LOG_LEVEL="INFO"
CONFIG_FILE="/etc/dangerprep/config.yaml"
BACKUP_ENCRYPTION_KEY="/etc/dangerprep/backup/key"
```

### Platform Detection Variables
```bash
PLATFORM="NanoPi M6"  # From /proc/device-tree/model
IS_FRIENDLYELEC=true
IS_RK3588=false
IS_RK3588S=true
FRIENDLYELEC_MODEL="NanoPi-M6"
SOC_TYPE="RK3588S"
IS_ARM64=true
```

## Dependency Requirements

### Build Dependencies
- bash 4.4+
- systemd 245+
- iptables 1.8+
- hostapd 2.9+
- dnsmasq 2.80+

### Runtime Dependencies
- Docker 20.10+ (installed by Olares)
- Kubernetes via K3s (installed by Olares)
- AdGuard Home binary
- Step-CA binary
- Cloudflared binary (for DNS over HTTPS)

### Optional Dependencies
- Tailscale (for remote access)
- Gum (for enhanced user interface)
- Just (for build automation)
