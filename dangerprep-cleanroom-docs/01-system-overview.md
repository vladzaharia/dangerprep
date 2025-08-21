# DangerPrep System Overview - Cleanroom Implementation Guide

## Project Purpose

DangerPrep is an emergency router and content hub system designed to provide:
- **WiFi Hotspot**: Secure wireless access point with internet sharing
- **Content Hub**: Offline content delivery (Wikipedia, medical resources, media)
- **Network Services**: DNS filtering, certificate management, sync services
- **Security Platform**: Comprehensive hardening and monitoring
- **Personal Cloud**: Olares (Kubernetes-based) integration for applications

## Core Architecture

### Network Architecture
```
Internet (WAN) → Ethernet Port → Firewall → Internal Services
                                    ↓
WiFi Clients ← WiFi Hotspot ← Internal Network ← Docker Services
                                    ↓
                              Tailscale Network
```

**Network Configuration:**
- **WAN Interface**: Ethernet port with DHCP client
- **WiFi Network**: 192.168.120.0/22 (1022 addresses)
- **DHCP Range**: 192.168.120.100 - 192.168.120.200
- **Gateway**: 192.168.120.1
- **DNS**: Local resolution for .danger domains + upstream DNS
- **WiFi Hotspot**: SSID "DangerPrep", Password "Buff00n!", WPA3/WPA2

### Service Ecosystem

#### Core Network Services
- **hostapd**: WiFi access point management
- **dnsmasq**: DHCP server (minimal config, DNS handled by AdGuard)
- **iptables**: Firewall and NAT routing
- **netplan**: Network interface configuration

#### Application Services
- **AdGuard Home**: DNS filtering and ad blocking (port 3000 internal)
- **Step-CA**: Internal certificate authority with ACME support
- **Kiwix**: Offline Wikipedia and content delivery
- **Olares**: Kubernetes-based personal cloud platform

#### Sync Services
- **Kiwix Sync**: Automatic Wikipedia and medical content updates
- **NFS Sync**: Central NAS integration and content synchronization
- **Offline Sync**: MicroSD card detection and bidirectional sync

#### Security Services
- **fail2ban**: Intrusion prevention system
- **AIDE**: File integrity monitoring with daily checks
- **ClamAV**: Antivirus with weekly system scans
- **rkhunter**: Rootkit detection with weekly scans
- **Lynis**: Monthly comprehensive security audits

## Hardware Support Matrix

### Supported Platforms

#### FriendlyElec Devices (Primary Support)
- **NanoPi M6**: RK3588S SoC, 1x GbE, M.2 WiFi, hardware acceleration
- **NanoPi R6C**: RK3588S SoC, 2.5GbE + GbE, dual ethernet routing
- **NanoPC-T6**: RK3588 SoC, dual GbE, high-performance computing
- **CM3588**: RK3588 compute module, flexible I/O configuration

#### Generic x86_64 (Secondary Support)
- Standard PC hardware with Ubuntu 24.04 LTS
- Minimum requirements: 2GB RAM, 2 CPU cores, 20GB storage

### Hardware Features (FriendlyElec)

#### Performance Optimization
- **CPU Governors**: Automatic performance scaling
- **GPU Optimization**: Mali GPU configuration for hardware acceleration
- **Memory Tuning**: RK3588-specific memory optimizations
- **I/O Scheduling**: NVMe and storage optimization

#### Hardware Acceleration
- **Mali GPU**: Graphics processing acceleration
- **VPU**: Video processing unit for media transcoding
- **NPU**: Neural processing unit for AI workloads
- **Hardware Codecs**: H.264/H.265 encoding/decoding

#### Thermal Management
- **PWM Fan Control**: Intelligent temperature-based fan curves
- **Temperature Monitoring**: Multi-zone thermal monitoring
- **Thermal Throttling**: Automatic performance scaling

#### Hardware Interfaces
- **GPIO Access**: User-space GPIO control with proper permissions
- **PWM Control**: Pulse-width modulation for hardware control
- **I2C/SPI**: Serial communication interfaces
- **Hardware Monitoring**: Voltage, current, and temperature sensors

## System Requirements

### Minimum Requirements
- **Operating System**: Ubuntu 24.04 LTS (required)
- **Memory**: 2GB RAM minimum (4GB recommended)
- **CPU**: 2 cores minimum (4 cores recommended)
- **Storage**: 20GB free space minimum (64GB recommended)
- **Network**: Ethernet interface for WAN connection
- **WiFi**: 802.11n/ac compatible wireless adapter

### Recommended Requirements
- **Memory**: 8GB RAM for optimal Olares performance
- **Storage**: NVMe SSD for Olares (256GB) and content storage
- **Network**: Gigabit ethernet for optimal performance
- **WiFi**: 802.11ac with WPA3 support

### Storage Configuration
- **System Storage**: Root filesystem (minimum 20GB)
- **NVMe Storage** (optional but recommended):
  - **Olares Partition**: 256GB dedicated partition
  - **Content Partition**: Remaining space for media and sync content
- **External Storage**: MicroSD card support for offline sync

## Security Architecture

### 2025 Security Hardening Standards
- **SSH Hardening**: Port 2222, key-only authentication, Ed25519 support
- **Firewall**: Strict iptables rules with DDoS protection
- **Network Security**: Client isolation, WPA3 encryption, DNS security
- **System Hardening**: Kernel parameters, AppArmor enforcement
- **Monitoring**: Comprehensive security event logging and alerting

### Security Services Integration
- **DNS Security**: DNSSEC validation, DNS over HTTPS/TLS
- **Certificate Management**: Automatic HTTPS with Let's Encrypt via Step-CA
- **Intrusion Detection**: Multi-layered monitoring and prevention
- **File Integrity**: Real-time monitoring of critical system files
- **Backup Security**: Encrypted backups with integrity verification

## Installation Philosophy

### Single Setup Approach
- **Comprehensive Setup**: One script configures entire system
- **State Management**: Resume capability from interruptions
- **Error Recovery**: Automatic cleanup on failures
- **Backup System**: Complete configuration backup before changes

### Management Tools Integration
- **Unified Command**: `dangerprep` command for all management tasks
- **Scenario Support**: Multiple network configuration scenarios
- **Service Management**: Integrated start/stop/status/restart commands
- **Monitoring**: Built-in health reporting and system status

### Cleanup and Restoration
- **Complete Reversal**: Cleanup script reverses all setup changes
- **Data Preservation**: Optional data retention during cleanup
- **Safety Mechanisms**: Protection against accidental system damage
- **Backup Restoration**: Automatic restoration of original configurations

## Key Design Principles

1. **Idempotent Operations**: Scripts can be run multiple times safely
2. **Comprehensive Logging**: All operations logged with timestamps
3. **Error Resilience**: Graceful handling of failures with recovery
4. **Security First**: 2025 security standards applied throughout
5. **Hardware Optimization**: Platform-specific optimizations when available
6. **User Experience**: Clear feedback and progress indication
7. **Maintainability**: Modular design with shared utility functions
