# DangerPrep Olares Integration Migration Notes

## Services Removed from Docker Infrastructure

The following Docker services have been removed from DangerPrep and should be installed through the Olares marketplace:

### Infrastructure Services
- **Portainer** (`docker/infrastructure/portainer/`)
  - Container management UI
  - **Olares Alternative**: Use Olares Control Hub for container management

- **Traefik** (`docker/infrastructure/traefik/`)
  - Reverse proxy and load balancer
  - **Olares Alternative**: Olares provides built-in reverse proxy functionality

- **Watchtower** (`docker/infrastructure/watchtower/`)
  - Automatic container updates
  - **Olares Alternative**: Olares handles application updates through its marketplace

- **Arcane** (`docker/infrastructure/arcane/`)
  - Docker management interface
  - **Olares Alternative**: Use Olares Control Hub for container management

- **CDN Service** (`docker/infrastructure/cdn/`)
  - Self-hosted CDN for Web Awesome and Font Awesome libraries
  - **Olares Alternative**: Use external CDNs or create custom Olares app if needed

- **DNS Service** (`docker/infrastructure/dns/`)
  - AdGuard Home and CoreDNS containers
  - **System Service**: Now installed as system-level AdGuard Home service

- **Step-CA Service** (`docker/infrastructure/step-ca/`)
  - Certificate Authority containers
  - **System Service**: Now installed as system-level Step-CA service

### Media Services
- **Jellyfin** (`docker/media/jellyfin/`)
  - Media server for streaming movies, TV shows, music
  - **Olares Marketplace**: Available as Jellyfin app

- **Komga** (`docker/media/komga/`)
  - Comic/manga server
  - **Olares Marketplace**: Search for comic/manga server alternatives

- **ROMM** (`docker/media/romm/`)
  - ROM management for retro gaming
  - **Olares Marketplace**: Search for gaming/ROM management apps

### Development/Collaboration Services
- **Docmost** (`docker/services/docmost/`)
  - Documentation and knowledge management
  - **Olares Marketplace**: Search for documentation/wiki alternatives

- **OneDev** (`docker/services/onedev/`)
  - Git server with CI/CD
  - **Olares Marketplace**: Search for Git hosting alternatives or use external services

### Infrastructure Services Kept (System-Level)
All essential infrastructure services have been converted from Docker containers to system-level services for better Olares compatibility:
- **AdGuard Home** - DNS filtering and ad blocking (system service)
- **Step-CA** - Internal certificate authority (system service)
- **hostapd** - WiFi access point functionality (system service)
- **dnsmasq** - DHCP server for WiFi hotspot (system service)

### Sync Services Kept
All sync services remain as they provide essential offline functionality:
- **Kiwix Sync** (`docker/sync/kiwix-sync/`)
- **NFS Sync** (`docker/sync/nfs-sync/`)
- **Offline Sync** (`docker/sync/offline-sync/`)

## System-Level Services Added

### Network Infrastructure
- **AdGuard Home** - DNS filtering and ad blocking
- **hostapd** - WiFi access point functionality
- **dnsmasq** - DHCP server and DNS forwarding
- **iptables** - Firewall and NAT configuration

### Security & PKI
- **Step-CA** - Internal certificate authority (system service)
- **fail2ban** - Intrusion prevention
- **aide** - File integrity monitoring
- **clamav** - Antivirus scanning

### Monitoring & Management
- **System monitoring tools** - Resource usage, network status
- **Hardware detection** - FriendlyElec-specific configurations

## Migration Steps for Users

1. **Before Migration**:
   - Export data from existing Docker services
   - Note current configurations and settings
   - Backup important data

2. **After Olares Installation**:
   - Install equivalent apps from Olares marketplace
   - Import backed up data
   - Reconfigure settings as needed

3. **Networking**:
   - System-level networking (WiFi, DHCP, DNS) continues to work
   - Olares provides internal service networking
   - External access through Olares reverse proxy

## Configuration Changes

### Removed from Setup Script
- Docker installation and configuration
- Tailscale installation (Olares manages networking)
- Container-based service configurations
- Docker Compose file generation

### Added to Setup Script
- AdGuard Home installation and configuration
- System-level Step-CA setup
- Enhanced hostapd/dnsmasq configuration
- Hardware-specific network optimizations

### Cleanup Script Updates
- Uses `olares-cli uninstall --all` when available
- Removes system-level services properly
- Maintains backward compatibility for non-Olares systems
