# DangerPrep - Emergency Router & Content Hub

Emergency router and content hub system built as a TypeScript monorepo with Docker services for travel and emergency scenarios. Supports FriendlyElec hardware platforms on Ubuntu 24.04 LTS.

## 🚀 Quick Start

### Prerequisites

- **Hardware**: FriendlyElec NanoPi M6/R6C/NanoPC-T6/CM3588 or generic x86_64
- **OS**: Ubuntu 24.04 LTS
- **Storage**: 2TB NVMe SSD recommended
- **Access**: Root/sudo access

### One-Command Deployment

```bash
# Download and run bootstrap script
wget -4 -qO- https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash

# Or manual installation
git clone https://github.com/vladzaharia/dangerprep.git /dangerprep
cd /dangerprep && sudo scripts/setup.sh
```

## 📋 System Overview

### Core Services

**Infrastructure:**
- **Traefik**: Reverse proxy with ACME/Let's Encrypt
- **Step-CA**: Internal certificate authority
- **CDN**: Self-hosted CDN for Web Awesome and Font Awesome
- **DNS**: CoreDNS + AdGuard Home + NextDNS chain
- **Watchtower**: Automatic container updates

**Media:**
- **Jellyfin**: Media streaming with hardware transcoding
- **Komga**: eBook and comic management
- **RomM**: Game ROM management

**Sync Services:**
- **Kiwix Sync**: Offline Wikipedia/educational content
- **NFS Sync**: Content synchronization from NAS
- **Offline Sync**: MicroSD card synchronization

### Network Configuration

- **Network**: 192.168.120.0/22 with Tailscale routing
- **Domain**: .danger (local DNS resolution)
- **WiFi**: "DangerPrep" hotspot
- **DNS Chain**: Client → CoreDNS → AdGuard → NextDNS

## 🌐 Service Access

| Service | URL | Description |
|---------|-----|-------------|
| Docker | https://docker.danger | Docker management |
| Jellyfin | https://jellyfin.danger | Media streaming |
| Komga | https://komga.danger | eBook management |
| RomM | https://romm.danger | Game ROM management |
| Kiwix | https://kiwix.danger | Offline content |
| Traefik | https://traefik.danger | Proxy dashboard |
| DNS | https://dns.danger | DNS management |
| CDN | https://cdn.danger | Asset delivery |
| CA | https://ca.danger | Certificate authority |

## 🛠️ Management Commands

```bash
# System Management
./scripts/setup.sh             # Deploy/install system
./scripts/cleanup.sh           # Remove system completely

# Service Management
docker compose up -d           # Start services
docker compose down            # Stop services
docker compose restart        # Restart services
docker compose ps             # Check status

# Monitoring
docker logs <service>          # View service logs
docker system df              # Check disk usage
docker system prune -f        # Clean up unused resources
```

## 📁 Directory Structure

```
dangerprep/
├── packages/               # TypeScript packages
├── docker/                 # Docker services
│   ├── infrastructure/     # Core services (traefik, dns, cdn, step-ca)
│   ├── media/             # Media services (jellyfin, komga, romm)
│   └── sync/              # Sync services (nfs, kiwix, offline)
├── scripts/               # Setup and management scripts
├── content/               # Media content storage
└── data/                  # Service data and configs
```

## 🔧 Configuration

### Development

```bash
yarn install && yarn build    # Install and build
yarn dev                      # Development mode
yarn lint && yarn format     # Code quality
```

### Sync Services

Configure sync services via YAML files in `/data/`:
- **NFS Sync**: Schedule and server configuration
- **Kiwix Sync**: Mirror URLs and language preferences
- **Offline Sync**: Auto-detection and directory mapping

### Tailscale Setup

1. Get auth key from Tailscale admin console
2. `export TAILSCALE_AUTH_KEY="key" && ./scripts/setup.sh`
3. Approve subnet routes in admin console

## 📊 Monitoring

- **Logs**: `docker logs <service>`
- **Health**: Automated monitoring every 5-10 minutes
- **System**: `/var/log/dangerprep/` for system logs

## 🔒 Security

- Firewall with minimal attack surface
- SSH access via Tailscale recommended
- DNS filtering and ad blocking
- Automatic security updates

## 🚨 Troubleshooting

```bash
# Services not starting
systemctl status docker
docker logs <service-name>
docker compose restart

# DNS issues
nslookup portal.danger 192.168.120.1
# Check DNS configuration in docker/infrastructure/dns/

# Tailscale issues
tailscale status
# Re-run setup if needed: ./scripts/setup.sh

# System issues
./scripts/cleanup.sh && ./scripts/setup.sh
```

**Getting Help**: `./scripts/setup.sh --help`, `docker logs <service>`

## 📚 Documentation

Each service directory contains detailed README files. Key TypeScript packages:
- **@dangerprep/service** - Base service class
- **@dangerprep/configuration** - Configuration management
- **@dangerprep/logging** - Structured logging
- **@dangerprep/sync** - Sync utilities

---

**⚠️ Emergency Use Only**: Designed for emergency and travel scenarios. Ensure proper backups.
