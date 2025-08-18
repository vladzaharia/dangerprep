# DangerPrep - Emergency Router & Content Hub

A comprehensive emergency router and content hub system built as a TypeScript monorepo with Docker services, designed for travel and emergency scenarios. Supports multiple FriendlyElec hardware platforms running Ubuntu 24.04 LTS.

## 🚀 Quick Installation

### Option 1: Latest Release (Recommended)

```bash
# One-liner installation (downloads latest stable release)
curl -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | bash
```

### Option 2: Latest Development (Main Branch)

```bash
# Clone and install from main branch
git clone https://github.com/vladzaharia/dangerprep.git
cd dangerprep
sudo ./scripts/setup/setup-dangerprep.sh
```

### Prerequisites

- **Hardware**: FriendlyElec NanoPi M6, R6C, NanoPC-T6, or CM3588 (or generic x86_64)
- **OS**: Ubuntu 24.04 LTS (Ubuntu Noble Desktop recommended for FriendlyElec hardware)
- **Storage**: 2TB NVMe SSD (portable installation - can be deployed anywhere)
- **Access**: Root access (sudo) required for system-level installation
- **Network**: Internet connection for initial setup and package downloads

### What Gets Installed

The installation process will:

- Install to `/dangerprep` by default (requires root)
- Set up emergency router and content hub system
- Configure network services (WiFi hotspot, DNS, DHCP)
- Apply comprehensive security hardening
- Install hardware optimization for supported devices
- Download and configure all required dependencies

### After Installation

Once installed, you can manage the system using the bundled `just` command runner:

```bash
# Navigate to installation directory
cd /dangerprep

# Deploy all services
just deploy

# Check system status
just status

# View all available commands
just --list
```

### Development Requirements

For TypeScript development and customization:

- **Node.js**: 22+ (for TypeScript monorepo development)
- **Yarn**: 4.5.3+ (package manager)
- **Just Command Runner**: Bundled in `lib/just/` (auto-downloaded)

## 📋 System Overview

### Supported Hardware

**FriendlyElec Devices:**
- **NanoPi M6** - RK3588S SoC with 1x GbE, M.2 WiFi, hardware acceleration
- **NanoPi R6C** - RK3588S SoC with 2.5GbE + GbE, dual ethernet routing
- **NanoPC-T6** - RK3588 SoC with dual GbE, high-performance computing
- **CM3588** - RK3588 compute module with flexible I/O

**Hardware Features:**
- **Automatic Platform Detection** - Detects FriendlyElec hardware and configures optimizations
- **RK3588/RK3588S Performance Tuning** - CPU governors, GPU optimization, memory tuning
- **Hardware Acceleration** - Mali GPU, VPU video processing, 6TOPS NPU neural processing
- **Thermal Management** - PWM fan control with intelligent temperature curves
- **Multi-Ethernet Support** - Advanced routing for dual ethernet devices

### Core Services

**Infrastructure Services:**
- **🌐 Traefik**: Reverse proxy and load balancer with ACME/Let's Encrypt
- **🔒 Step-CA**: Internal certificate authority with ACME support
- **📡 CDN**: High-performance self-hosted CDN for Web Awesome and Font Awesome
- **🌐 DNS**: CoreDNS + AdGuard Home + NextDNS chain with DoH/DoT
- **👁️ Watchtower**: Automatic container updates

**Media Services:**
- **�📺 Jellyfin**: Media streaming with hardware transcoding
- **📚 Komga**: eBook and comic management
- **🎮 RomM**: Game ROM management and emulation

**Sync Services (TypeScript):**
- **🌍 Kiwix Sync**: Offline Wikipedia/educational content synchronization
- **🔄 NFS Sync**: Content synchronization from central NAS
- **� Offline Sync**: MicroSD card synchronization with auto-detection

### Network Configuration

- **LAN Network**: 192.168.120.0/22 (Tailscale site-to-site routing)
- **Router IP**: 192.168.120.1
- **Domain**: .danger (local resolution via DNS)
- **WiFi Hotspot**: "DangerPrep" with WPA2 password "Buff00n!"
- **Routing Scenarios**: WAN-to-WiFi, WiFi repeater, emergency local network
- **Traefik**: Reverse proxy with Docker label-based routing and ACME/Let's Encrypt
- **Tailscale**: VPN with subnet routing for secure remote access
- **DNS Chain**: Client → CoreDNS → AdGuard Home → NextDNS (DoH/DoT)

## 🌐 Service Access

### Web Interfaces
| Service | .danger Domain (HTTPS) | Description |
|---------|------------------------|-------------|
| Management Portal | <https://portal.danger> | Web-based system management |
| Jellyfin Media | <https://jellyfin.danger> | Video streaming with hardware transcoding |
| Komga Books | <https://komga.danger> | eBook and comic management |
| RomM Game ROMs | <https://romm.danger> | Game ROM management and emulation |
| Kiwix Offline Content | <https://kiwix.danger> | Offline Wikipedia and educational content |
| Traefik Dashboard | <https://traefik.danger> | Reverse proxy dashboard |
| DNS Management | <https://dns.danger> | AdGuard Home DNS management |
| CDN Assets | <https://cdn.danger> | Self-hosted CDN for libraries |
| Step-CA | <https://ca.danger> | Internal certificate authority |

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
dangerprep/                   # Project root (TypeScript monorepo)
├── packages/                 # TypeScript packages (Turborepo workspace)
│   ├── _development/        # Development configuration packages
│   │   ├── eslint/          # Shared ESLint configuration
│   │   ├── prettier/        # Shared Prettier configuration
│   │   └── typescript/      # Shared TypeScript configuration
│   ├── common/              # Common utilities and helpers
│   ├── configuration/       # Configuration management
│   ├── errors/              # Error handling and types
│   ├── files/               # File system operations
│   ├── health/              # Health checking utilities
│   ├── logging/             # Structured logging
│   ├── notifications/       # Notification system
│   ├── progress/            # Progress tracking
│   ├── resilience/          # Retry and circuit breaker patterns
│   ├── scheduling/          # Task scheduling
│   ├── service/             # Base service class
│   ├── sync/                # Sync utilities
│   └── types/               # Shared TypeScript types
├── docker/                  # Docker Compose configurations
│   ├── infrastructure/      # Core infrastructure services
│   │   ├── traefik/        # Reverse proxy
│   │   ├── dns/            # DNS services (CoreDNS + AdGuard)
│   │   ├── watchtower/     # Auto-updates
│   │   ├── step-ca/        # Internal certificate authority
│   │   └── cdn/            # Self-hosted CDN (TypeScript)
│   ├── media/              # Media services
│   │   ├── jellyfin/       # Video streaming
│   │   ├── komga/          # eBook management
│   │   └── romm/           # Game ROM management
│   ├── services/           # Utility services
│   │   └── portal/         # Management interface
│   └── sync/               # Content synchronization services (TypeScript)
│       ├── nfs-sync/       # NFS content synchronization
│       ├── kiwix-sync/     # Kiwix offline content sync
│       └── offline-sync/   # MicroSD card synchronization
├── scripts/                # Management scripts (organized by category)
│   ├── setup/              # Installation and cleanup scripts
│   ├── docker/             # Docker service management
│   ├── network/            # Network routing and management
│   ├── backup/             # Backup and restore operations
│   ├── monitoring/         # System and hardware monitoring
│   ├── security/           # Security auditing and monitoring
│   ├── system/             # System management and utilities
│   ├── validation/         # System validation and testing
│   └── shared/             # Shared utilities and templates
├── lib/                    # External libraries and tools
│   ├── just/               # Bundled just command runner
│   └── webawesome/         # Web Awesome icon library
├── data/                   # Service data (container configs)
├── content/                # Media content storage
│   ├── movies/             # Movie files
│   ├── tv/                 # TV show files
│   ├── books/              # eBook files
│   ├── games/roms/         # Game ROM files
│   └── kiwix/              # Offline content (ZIM files)
├── nfs/                    # NFS mount points
├── package.json            # Root package.json (Turborepo workspace)
├── turbo.json              # Turborepo configuration
├── tsconfig.base.json      # Base TypeScript configuration
├── eslint.config.js        # ESLint configuration
├── prettier.config.js      # Prettier configuration
└── justfile                # Just command definitions
```

## 🔧 Configuration

### TypeScript Development

The project uses a Turborepo monorepo with shared configurations:

```bash
# Install dependencies
yarn install

# Build all packages
yarn build

# Run development mode
yarn dev

# Lint and format
yarn lint
yarn format

# Type checking
yarn typecheck
```

### Content Synchronization

Each sync service has its own YAML configuration:

**NFS Sync** (`/data/nfs-sync/config.yaml`):
```yaml
sync_schedule: '0 2 * * *'  # Daily at 2 AM
nfs_servers:
  - host: "192.168.1.100"
    path: "/mnt/media"
content_types:
  movies:
    enabled: true
    filters:
      min_rating: 6.0
      max_size_gb: 10
```

**Kiwix Sync** (`/data/kiwix-sync/config.yaml`):
```yaml
sync_schedule: '0 3 * * *'  # Daily at 3 AM
mirrors:
  - "https://download.kiwix.org/zim/"
languages: ["en", "es", "fr"]
```

**Offline Sync** (`/data/offline-sync/config.yaml`):
```yaml
auto_detect: true
sync_directories:
  - source: "/content/movies"
    target: "Movies"
  - source: "/content/books"
    target: "Books"
```

### Tailscale Setup

1. Get an auth key from Tailscale admin console
2. Set environment variable: `export TAILSCALE_AUTH_KEY="your-key"`
3. Run: `just deploy` (Tailscale setup is included)
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
2. Run system health check: `just monitor-all`
3. Run system validation: `just validate-all`
4. Check hardware status: `just hardware-monitor`
5. View all available commands: `just --list`

## 📚 Documentation

### TypeScript Packages

Each package in the monorepo has its own purpose:

- **@dangerprep/service** - Base service class for standardized lifecycle management
- **@dangerprep/configuration** - Configuration management with validation
- **@dangerprep/logging** - Structured logging with rotation and multiple outputs
- **@dangerprep/health** - Health checking utilities for services
- **@dangerprep/scheduling** - Task scheduling and cron management
- **@dangerprep/sync** - Sync utilities and base classes
- **@dangerprep/progress** - Progress tracking for long-running operations
- **@dangerprep/resilience** - Retry patterns and circuit breakers
- **@dangerprep/notifications** - Notification system for alerts

### Service Documentation

- **Docker Services**: Each service directory contains README.md and deployment guides
- **Scripts**: `scripts/README.md` contains comprehensive script documentation
- **Setup**: `scripts/setup/README.md` covers installation and hardware support

## 🤝 Contributing

This is a personal emergency preparedness project. Feel free to adapt it for your own needs.

## 📄 License

This project is provided as-is for emergency preparedness purposes.

---

**⚠️ Emergency Use Only**: This system is designed for emergency and travel scenarios. Always ensure you have proper backups and alternative communication methods.
