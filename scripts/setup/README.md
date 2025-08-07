# DangerPrep Setup Scripts

This directory contains the comprehensive setup and cleanup scripts for the DangerPrep emergency router and content hub system, with full support for FriendlyElec hardware including NanoPi M6, R6C, NanoPC-T6, and CM3588 boards.

## Overview

The DangerPrep setup script provides a complete, automated installation of:

### Core Features
- **WiFi Hotspot**: "DangerPrep" with WPA2 security
- **Network Routing**: LAN port as WAN, WiFi clients with full internet access
- **Security Hardening**: 2025 best practices for Ubuntu 24.04
- **Docker Services**: Complete media and sync service stack
- **Tailscale Integration**: Secure remote access and subnet routing
- **Advanced DNS**: DNS over HTTPS/TLS with cloudflared and ad blocking
- **System Management**: Comprehensive management scripts and monitoring
- **NFS Client**: Central NAS integration and mount management
- **Routing Scenarios**: Multiple network configuration scenarios

### FriendlyElec Hardware Support

**Supported Devices:**
- **NanoPi M6** - RK3588S SoC with 1x GbE, M.2 WiFi, hardware acceleration
- **NanoPi R6C** - RK3588S SoC with 2.5GbE + GbE, dual ethernet routing
- **NanoPC-T6** - RK3588 SoC with dual GbE, high-performance computing
- **CM3588** - RK3588 compute module with flexible I/O

**Hardware Features:**
- **Automatic Platform Detection** - Detects FriendlyElec hardware and configures optimizations
- **RK3588/RK3588S Performance Tuning** - CPU governors, GPU optimization, memory tuning
- **Hardware Acceleration** - Mali GPU, VPU video processing, NPU neural processing
- **Thermal Management** - PWM fan control with intelligent temperature curves
- **GPIO/PWM/I2C/SPI Access** - Configured hardware interfaces with proper permissions
- **Multi-Ethernet Support** - Advanced routing for dual ethernet devices
- **Hardware Monitoring** - RK3588-specific temperature, power, and performance monitoring

## Quick Start

### Prerequisites
- Ubuntu 24.04 LTS on supported hardware (NanoPi M6/R6C/NanoPC-T6/CM3588 or generic x86_64)
- Root access (sudo)
- Internet connection for initial setup
- At least 20GB free storage space
- For FriendlyElec hardware: Latest Ubuntu Noble Desktop image recommended

### Installation

```bash
# Clone the repository
git clone https://github.com/vladzaharia/dangerprep.git
cd dangerprep

# Run the setup script
sudo ./scripts/setup/setup-dangerprep.sh
```

### Cleanup (if needed)

```bash
# Remove all DangerPrep configuration (preserves data)
sudo ./scripts/setup/cleanup-dangerprep.sh --preserve-data

# Complete removal (removes all data)
sudo ./scripts/setup/cleanup-dangerprep.sh
```

## What Gets Configured

### System Hardening (2025 Enhanced)
- **SSH**: Port 2222, key-only authentication, modern ciphers (Ed25519 support)
- **Firewall**: Strict iptables rules with WAN port hardening and DDoS protection
- **Fail2ban**: Intrusion prevention for SSH and web services
- **Kernel**: Security parameters and network hardening
- **File Integrity**: AIDE monitoring with daily integrity checks
- **Antivirus**: ClamAV with weekly system scans
- **Rootkit Detection**: rkhunter with weekly scans
- **Security Audits**: Lynis monthly comprehensive audits
- **Updates**: Automatic security updates enabled

### Network Configuration (Enhanced Security)
- **WAN Interface**: Ethernet port configured for internet access
- **WiFi Hotspot**:
  - SSID: `DangerPrep`
  - Password: `EXAMPLE_PASSWORD`
  - Security: WPA3 (if supported) or WPA2 with client isolation
  - Network: `192.168.120.0/22`
  - Gateway: `192.168.120.1`
- **DNS Security**: DNSSEC validation, DNS over HTTPS/TLS, ad blocking
- **DHCP/DNS**: Automatic client configuration with .danger domain resolution
- **Routing**: Full internet access for WiFi clients with internal service access

### Services Deployed
- **Traefik**: Reverse proxy with automatic HTTPS
- **Jellyfin**: Media server
- **Komga**: Book/comic server
- **Kiwix**: Offline Wikipedia and content
- **Portainer**: Docker management
- **Sync Services**: NFS, Kiwix, and offline sync capabilities

### Security Features
- **WAN Hardening**: Minimal service exposure, strict firewall rules
- **Network Segmentation**: Isolated networks with controlled routing
- **Rate Limiting**: DDoS protection and connection limits
- **Monitoring**: Security event logging and alerting
- **Encryption**: All web services use HTTPS with Let's Encrypt

## Network Architecture

```
Internet (WAN) → Ethernet Port → Firewall → Internal Services
                                    ↓
WiFi Clients ← WiFi Hotspot ← Internal Network ← Docker Services
                                    ↓
                              Tailscale Network
```

### Network Details
- **WAN Interface**: Ethernet port with DHCP client
- **WiFi Network**: 192.168.120.0/22 (1022 addresses)
- **DHCP Range**: 192.168.120.100 - 192.168.120.200
- **DNS**: Local resolution for .danger domains + upstream DNS
- **Tailscale**: Subnet routing for 192.168.120.0/22

## Configuration Files Generated

The setup script automatically creates sensible configuration files for all sync services:

### Kiwix Sync (`docker/sync/kiwix-sync/config.yaml`)
- Essential Wikipedia and medical content
- Automatic updates and cleanup
- Bandwidth limiting and retry logic

### NFS Sync (`docker/sync/nfs-sync/config.yaml`)
- Central NAS connection (100.65.182.27)
- Content type mappings for movies, TV, books
- Metadata filtering and priority rules

### Offline Sync (`docker/sync/offline-sync/config.yaml`)
- MicroSD card detection and mounting
- Bidirectional sync for all content types
- File extension filtering and size limits

## Post-Installation Steps

1. **Connect Tailscale**:
   ```bash
   sudo tailscale up --advertise-routes=192.168.120.0/22 --advertise-exit-node
   ```

2. **Connect to WiFi**:
   - SSID: `DangerPrep`
   - Password: `EXAMPLE_PASSWORD`

3. **Access Services**:
   - Management Portal: https://portal.danger
   - Jellyfin Media: https://jellyfin.danger
   - Books: https://komga.danger
   - Offline Content: https://kiwix.danger
   - Docker Management: https://portainer.danger

4. **Configure NFS** (if using central NAS):
   - Edit /etc/dangerprep/nfs-mounts.conf
   - Run: `dangerprep nfs mount`
   - Test connectivity: `dangerprep nfs test`

## System Management

The setup script installs a comprehensive management system accessible via the `dangerprep` command:

### Network Management
```bash
dangerprep firewall status          # Check firewall status
dangerprep firewall port-forward 8080 192.168.120.100:80  # Add port forwarding
dangerprep wifi scan                # Scan for WiFi networks
dangerprep wifi connect "SSID" "password"  # Connect to WiFi
dangerprep interface enumerate      # Detect network interfaces
dangerprep router start             # Start routing
```

### Service Management
```bash
dangerprep start                    # Start all services
dangerprep stop                     # Stop all services
dangerprep status                   # Show service status
dangerprep restart                  # Restart all services
```

### System Monitoring
```bash
dangerprep monitor report           # Generate health report
dangerprep backup                   # Create system backup
dangerprep update                   # Update system
```

### Network Scenarios
```bash
dangerprep scenario1 start          # Ethernet WAN → WiFi AP (default)
dangerprep scenario2 start "SSID" "pass"  # WiFi Client → Ethernet LAN
dangerprep scenario3 start          # Emergency local network only
```

### NFS Management
```bash
dangerprep nfs mount                # Mount all NFS shares
dangerprep nfs unmount              # Unmount all NFS shares
dangerprep nfs test                 # Test NFS connectivity
dangerprep nfs status               # Show mount status
```

### Maintenance
```bash
dangerprep validate-compose         # Validate Docker Compose files
dangerprep test-nfs                 # Test NFS configuration
dangerprep fix-perms                # Fix file permissions
dangerprep audit                    # Run security audit
```

## Enhanced Security Features (2025)

### File Integrity Monitoring
- **AIDE**: Daily file integrity checks
- **Monitoring**: Critical system files and configurations
- **Alerting**: Automatic detection of unauthorized changes
- **Logging**: Comprehensive change tracking

### Advanced Threat Detection
- **ClamAV**: Weekly antivirus scans
- **rkhunter**: Weekly rootkit detection
- **Lynis**: Monthly comprehensive security audits
- **OSSEC**: Host-based intrusion detection (if available)

### DNS Security
- **DNSSEC**: Full validation of DNS responses
- **DoH/DoT**: Encrypted DNS queries via cloudflared and unbound
- **Ad Blocking**: Built-in malicious domain filtering
- **Cache Protection**: DNS cache poisoning prevention

### Backup Security
- **Encryption**: AES-256 encrypted backups with PBKDF2
- **Scheduling**: Automated daily/weekly/monthly backups
- **Verification**: Checksum validation and integrity testing
- **Retention**: Configurable retention policies

### WiFi Security Enhancements
- **WPA3**: Automatic upgrade if hardware supports
- **Client Isolation**: Prevents client-to-client communication
- **Management Frame Protection**: Enhanced 802.11w security
- **Key Rotation**: Automatic security key rotation

## Security Considerations

### WAN Port Protection
- Default DENY policy for all incoming connections
- Only essential services allowed (SSH via Tailscale recommended)
- Rate limiting and DDoS protection
- Geographic IP blocking capabilities

### WiFi Security
- WPA2 encryption with strong password
- Client isolation options available
- Network segmentation from WAN
- DNS filtering and ad blocking

### Container Security
- Non-root container execution where possible
- Resource limits and security contexts
- Network isolation between services
- Regular image updates via Watchtower

## Troubleshooting

### FriendlyElec Hardware Issues

**Hardware Not Detected:**
```bash
# Check platform detection
cat /proc/device-tree/model

# Validate FriendlyElec features
sudo bash scripts/validation/validate-system.sh friendlyelec

# Test hardware validation
sudo bash scripts/validation/hardware-validation.sh
```

**GPU/VPU/NPU Issues:**
```bash
# Check hardware acceleration
ls -la /dev/mpp_service /dev/dri/
glmark2-es2 --off-screen  # Test GPU
gst-inspect-1.0 mppvideodec  # Test VPU

# Check device permissions
groups $USER  # Should include video, render groups
```

**Fan Control Issues:**
```bash
# Check PWM availability
ls -la /sys/class/pwm/

# Test fan control
sudo bash scripts/monitoring/rk3588-fan-control.sh test

# Check fan service
sudo systemctl status rk3588-fan-control.service
```

**GPIO/PWM Access Issues:**
```bash
# Test hardware interfaces
sudo bash scripts/setup/setup-gpio.sh test

# Check user groups
groups $USER  # Should include gpio, pwm, i2c groups

# Reload udev rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### Common Issues

1. **WiFi Hotspot Not Working**:
   ```bash
   sudo systemctl status hostapd
   sudo journalctl -u hostapd -f
   ```

2. **No Internet Access**:
   ```bash
   # Check WAN interface
   ip addr show
   # Check routing
   ip route show
   # Check DNS
   nslookup google.com
   ```

3. **Services Not Starting**:
   ```bash
   # Check Docker status
   sudo docker ps -a
   # Check service logs
   sudo docker logs <container_name>
   ```

### Log Files
- Setup log: `/var/log/dangerprep-setup.log`
- System logs: `journalctl -f`
- Service logs: `sudo docker logs <service>`

### Recovery
If something goes wrong, use the cleanup script to restore the original system state:

```bash
sudo ./scripts/setup/cleanup-dangerprep.sh --preserve-data
```

## Advanced Configuration

### Custom WiFi Settings
Edit `/etc/hostapd/hostapd.conf` to modify:
- Channel selection
- Country code
- Security settings
- Power levels

### Firewall Customization
Use the existing firewall management script:
```bash
sudo ./scripts/network/firewall-manager.sh status
sudo ./scripts/network/firewall-manager.sh port-forward 8080 192.168.120.100:80
```

### Sync Service Tuning
Modify the generated config files in `docker/sync/*/config.yaml` to adjust:
- Sync schedules
- Bandwidth limits
- Content filters
- Storage limits

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review log files for error messages
3. Use the cleanup script to reset if needed
4. Consult the main project documentation

## Directory Structure

After cleanup, the scripts directory now contains only the essential components:

### `/scripts/setup/` (Core Setup)
- `setup-dangerprep.sh`: **Main comprehensive setup script**
- `cleanup-dangerprep.sh`: **System cleanup and restoration script**
- `README.md`: This documentation file

### `/scripts/network/` (Management Tools)
- `firewall-manager.sh`: Firewall and iptables management
- `wifi-manager.sh`: WiFi scanning, connection, and AP management
- `interface-manager.sh`: Network interface enumeration and configuration
- `route-manager.sh`: Network routing management

### `/scripts/docker/` (Service Management)
- `service-status.sh`: Docker service status checking
- `start-services.sh`: Start all Docker services
- `stop-services.sh`: Stop all Docker services

### `/scripts/` (System Scripts)
- `system-monitor.sh`: System health monitoring
- `system-backup.sh`: System backup utilities
- `system-update.sh`: System update management
- `validate-compose.sh`: Docker Compose validation
- `validate-references.sh`: File reference validation
- `validate-docker-dependencies.sh`: Docker dependency validation
- `test-nfs-mounts.sh`: NFS connectivity testing
- `fix-permissions.sh`: File permission repair
- `security-audit.sh`: Security auditing
- `audit-shell-scripts.sh`: Shell script auditing
- `system-uninstall.sh`: System uninstallation

## Removed Scripts

The following redundant scripts have been removed as their functionality is now integrated into `setup-dangerprep.sh`:

- ~~`setup-ubuntu.sh`~~ - Basic Ubuntu setup (integrated)
- ~~`setup-dns.sh`~~ - DNS configuration (enhanced and integrated)
- ~~`setup-dns-ssl.sh`~~ - DNS SSL setup (integrated)
- ~~`setup-tailscale.sh`~~ - Tailscale setup (integrated)
- ~~`deploy-dangerprep.sh`~~ - OpenWRT deployment (not needed for Ubuntu)

## Usage Philosophy

**Single Setup Approach**: Run the comprehensive setup script once to get a fully configured system:
```bash
sudo ./scripts/setup/setup-dangerprep.sh
```

**Management Tools**: The remaining scripts in `/network/`, `/docker/`, and `/maintenance/` are automatically installed as system-wide management tools by the setup script and can be accessed via the unified `dangerprep` command.

The setup script is designed to be idempotent - you can run it multiple times safely.
