# DangerPrep - Emergency Router & Content Hub

A comprehensive emergency router and content hub system built on FriendlyWRT with Docker services, designed for travel and emergency scenarios.

## 🚀 Quick Start

### Prerequisites
- FriendlyElec NanoPi R6C with FriendlyWRT 24.10
- 2TB NVMe SSD (portable installation - can be deployed anywhere)
- Docker and Docker Compose installed
- Root access to the system

### One-Command Deployment
```bash
# Clone the repository
git clone <repository-url> dangerprep
cd dangerprep

# Deploy the entire system using bundled just
./lib/just/just deploy
```

### System Requirements
- **Just Command Runner**: Bundled in `lib/just/` (auto-downloaded)
- **Installation Location**: Can be deployed anywhere (not tied to /opt)
- **Environment Variable**: Set `DANGERPREP_INSTALL_ROOT` to customize installation directory

## 📋 System Overview

### Hardware
- **Device**: FriendlyElec NanoPi R6C
- **CPU**: Rockchip RK3588S (ARM64)
- **Storage**: 2TB NVMe SSD
- **WiFi**: RTL8822CE module
- **Network**: 2.5G + 1G Ethernet ports

### Core Services
- **🌐 Traefik**: Reverse proxy and load balancer
- **📺 Jellyfin**: Media streaming with hardware transcoding
- **📚 Komga**: eBook and comic management
- **🎮 RomM**: Game ROM management and emulation
- **🌍 Kiwix**: Offline Wikipedia and educational content (TypeScript/Next.js manager)
- **🎛️ Portal**: Web-based management interface (TypeScript/Next.js)
- **🔄 NFS Sync**: Content synchronization from central NAS
- **📦 Kiwix Sync**: Offline content synchronization with mirror support
- **🐳 Portainer**: Docker container management

### Network Configuration
- **LAN Network**: 192.168.120.0/22
- **Router IP**: 192.168.120.1
- **Domain**: .danger (local resolution via DNS)
- **Traefik**: Reverse proxy with Docker label-based routing
- **Tailscale**: VPN with subnet routing
- **DNS**: Split-tunnel with DoH/DoT

## 🌐 Service Access

### Web Interfaces
| Service | .danger Domain (HTTPS) |
|---------|------------------------|
| Management Portal | https://portal.danger |
| Jellyfin Media | https://jellyfin.danger |
| Komga Books | https://komga.danger |
| RomM Game ROMs | https://romm.danger |
| Kiwix Offline Content | https://kiwix.danger |
| Portainer Docker UI | https://portainer.danger |
| Traefik Dashboard | https://traefik.danger |
| DNS Management | https://dns.danger |

## 🛠️ Management Commands

### Service Management
```bash
# Start all services
just start

# Stop all services
just stop

# Restart all services
just restart

# Check service status
just status

# Update entire system
just update

# Uninstall system (preserves data)
just uninstall
```

### System Monitoring
```bash
# Generate health report
just monitor

# View recent service logs
just logs

# Create system backup
just backup

# Clean up Docker resources
just clean
```

### Network Configuration
```bash
# Setup Tailscale (requires auth key)
export TAILSCALE_AUTH_KEY="your-auth-key"
just tailscale

# Setup DNS with DoH/DoT
just setup-dns

# Validate DNS and SSL configuration
just validate-dns

# Generate Traefik authentication hash
just generate-auth
```

## 📁 Directory Structure

```
dangerprep/                   # Project root (portable installation)
├── docker/                   # Docker Compose configurations
│   ├── infrastructure/       # Core infrastructure services
│   │   ├── traefik/         # Reverse proxy
│   │   ├── portainer/       # Container management
│   │   ├── dns/             # DNS services
│   │   └── watchtower/      # Auto-updates
│   ├── media/               # Media services
│   │   ├── jellyfin/        # Video streaming
│   │   ├── komga/           # eBook management
│   │   └── romm/            # Game ROM management
│   ├── services/            # Utility services
│   │   └── portal/          # Management interface
│   └── sync/                # Content synchronization services
│       ├── nfs-sync/        # NFS content synchronization
│       └── kiwix-sync/      # Kiwix offline content sync
├── data/                    # Service data (container configs)
├── content/                 # Media content storage
│   ├── movies/              # Movie files
│   ├── tv/                  # TV show files
│   ├── books/               # eBook files
│   ├── games/roms/          # Game ROM files
│   └── kiwix/               # Offline content (ZIM files)
├── nfs/                     # NFS mount points
├── lib/just/                # Bundled just command runner
│   ├── just                 # Portable wrapper script
│   ├── download.sh          # Binary download script
│   ├── VERSION              # Current version tracking
│   └── just-*               # Platform-specific binaries
├── scripts/                 # Management scripts
├── _plans/                  # Documentation
└── justfile                 # Just command definitions
```

## 🔧 Configuration

### Content Synchronization
Edit `/data/sync/sync-config.yaml` to configure content sync:

```yaml
sync_schedule: '0 2 * * *'  # Daily at 2 AM
content_types:
  movies:
    enabled: true
    filters:
      min_rating: 6.0
      max_size_gb: 10
      genres_exclude: ['Horror']
  tv:
    enabled: true
    filters:
      min_rating: 7.0
      max_episodes_per_season: 50
```

### Tailscale Setup
1. Get an auth key from Tailscale admin console
2. Set environment variable: `export TAILSCALE_AUTH_KEY="your-key"`
3. Run: `dangerprep-tailscale install`
4. Approve subnet routes in Tailscale admin console

### DNS Configuration
The system uses a DNS chain for resolution:
- Client → CoreDNS (local .danger domains)
- CoreDNS → AdGuard Home (ad-blocking)
- AdGuard Home → NextDNS (external domains via DoH)
- Network: 192.168.120.0/22 with site-to-site Tailscale

## 📊 Monitoring & Logs

### Log Locations
- System logs: `/var/log/dangerprep/`
- Service logs: `docker logs <service-name>`
- DNS logs: `/var/log/dnsmasq.log`
- Sync logs: `${INSTALL_ROOT}/data/sync/sync.log`

### Health Monitoring
The system includes automated health monitoring:
- Service status checks every 10 minutes
- DNS resolution monitoring every 5 minutes
- Tailscale connectivity monitoring every 5 minutes
- Storage and temperature monitoring

## 🔒 Security Features

### Network Security
- Firewall configured for minimal attack surface
- SSH access via Tailscale only (recommended)
- DNS filtering and ad blocking
- Automatic security updates via Watchtower

### Emergency Procedures
```bash
# Emergency lockdown (blocks all external access)
/usr/local/bin/emergency-lockdown.sh

# Emergency recovery
/usr/local/bin/emergency-recovery.sh
```

## 🚨 Troubleshooting

### Common Issues

**Services not starting:**
```bash
# Check Docker status
systemctl status docker

# Check service logs
docker logs <service-name>

# Restart all services
just restart
```

**DNS not working:**
```bash
# Test DNS resolution
nslookup google.com 192.168.120.1
nslookup portal.danger 192.168.120.1

# Validate DNS configuration
just validate-dns
```

**Tailscale connectivity issues:**
```bash
# Check Tailscale status
tailscale status

# Setup Tailscale
export TAILSCALE_AUTH_KEY="your-key"
just tailscale
```

**Update issues:**
```bash
# Force update just binaries
./lib/just/download.sh --force

# Update entire system
just update
```

### Getting Help
1. Check service logs: `docker logs <service-name>` or `just logs`
2. Run system health check: `just monitor`
3. Check the troubleshooting guide: `_plans/troubleshooting.md`
4. View all available commands: `just --list`

## 📚 Documentation

Comprehensive documentation is available in the `_plans/` directory:
- `architecture.md` - System architecture details
- `implementation-phases.md` - Implementation timeline
- `services.md` - Service configurations
- `networking.md` - Network setup details
- `security.md` - Security considerations
- `troubleshooting.md` - Troubleshooting guide

## 🤝 Contributing

This is a personal emergency preparedness project. Feel free to adapt it for your own needs.

## 📄 License

This project is provided as-is for emergency preparedness purposes.

---

**⚠️ Emergency Use Only**: This system is designed for emergency and travel scenarios. Always ensure you have proper backups and alternative communication methods.
