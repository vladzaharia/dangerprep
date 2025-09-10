# DangerPrep Architecture

This document provides a comprehensive overview of the DangerPrep system architecture, including the TypeScript monorepo structure, service organization, and deployment patterns.

## System Overview

DangerPrep is an emergency router and content hub system designed for travel and emergency scenarios. It's built as a TypeScript monorepo using Turborepo, with Docker services for infrastructure and content management.

### Key Design Principles

- **TypeScript-First**: All services use strict TypeScript with comprehensive type safety
- **Monorepo Architecture**: Shared packages reduce duplication and ensure consistency
- **Service-Oriented**: Modular services with standardized interfaces and lifecycle management
- **Hardware Agnostic**: Supports multiple FriendlyElec platforms and generic x86_64 systems
- **Emergency Ready**: Designed for offline operation and rapid deployment

## Architecture Layers

### 1. Hardware Layer

**Supported Platforms:**
- **NanoPi M6** - RK3588S SoC with 1x GbE, M.2 WiFi, hardware acceleration
- **NanoPi R6C** - RK3588S SoC with 2.5GbE + GbE, dual ethernet routing
- **NanoPC-T6** - RK3588 SoC with dual GbE, high-performance computing
- **CM3588** - RK3588 compute module with flexible I/O
- **Generic x86_64** - Standard PC hardware

**Hardware Features:**
- Automatic platform detection and optimization
- RK3588/RK3588S performance tuning (CPU governors, GPU, NPU)
- Hardware acceleration (Mali GPU, VPU video processing, 6TOPS NPU)
- Thermal management with PWM fan control
- Multi-ethernet support for advanced routing scenarios

### 2. Operating System Layer

**Base System:**
- **Ubuntu 24.04 LTS** - Primary operating system
- **Ubuntu Noble Desktop** - Recommended for FriendlyElec hardware
- **Kernel Optimizations** - Hardware-specific optimizations for RK3588/RK3588S

**System Services:**
- **Docker Engine** - Container runtime
- **Tailscale** - VPN and subnet routing
- **Network Management** - Dynamic interface management and routing scenarios
- **Security Hardening** - best practices implementation

### 3. Infrastructure Layer

**Core Infrastructure Services:**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Traefik     │    │     Step-CA     │    │      CDN        │
│  (Reverse Proxy)│◄───┤ (Internal CA)   │    │ (Asset Delivery)│
│                 │    │                 │    │                 │
│ • Load Balancer │    │ • ACME Server   │    │ • Web Awesome   │
│ • HTTPS/TLS     │    │ • Cert Issuance │    │ • Font Awesome  │
│ • Auto Certs    │    │ • MDM Profiles  │    │ • Performance   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   DNS Chain     │    │   Watchtower    │
│                 │    │ (Auto Updates)  │
│ CoreDNS ──────► │    │                 │
│ AdGuard ──────► │    │ • Image Updates │
│ NextDNS         │    │ • Notifications │
└─────────────────┘    └─────────────────┘
```

### 4. Application Layer

**TypeScript Monorepo Structure:**

```
packages/
├── _development/          # Development configuration packages
│   ├── eslint/           # Shared ESLint configuration
│   ├── prettier/         # Shared Prettier configuration
│   └── typescript/       # Shared TypeScript configuration
├── common/               # Common utilities and helpers
├── configuration/        # Configuration management with Zod validation
├── errors/               # Error handling and types
├── files/                # File system operations
├── health/               # Health checking utilities
├── logging/              # Structured logging with rotation
├── notifications/        # Notification system
├── progress/             # Progress tracking with phases
├── resilience/           # Retry and circuit breaker patterns
├── scheduling/           # Task scheduling and cron management
├── service/              # Base service class with lifecycle management
├── sync/                 # Sync utilities and base classes
└── types/                # Shared TypeScript types and interfaces
```

**Service Architecture Pattern:**

All services extend `BaseService` or `StandardizedSyncService` and implement:

- **Unified Configuration** - Zod schemas with type safety
- **Lifecycle Management** - Standardized initialization, startup, shutdown
- **Health Monitoring** - Built-in health checks and component monitoring
- **Progress Tracking** - Real-time operation progress with phases
- **Error Handling** - Comprehensive error patterns and recovery
- **CLI Interface** - Standardized command-line interface
- **Logging** - Structured logging with rotation and multiple outputs

### 5. Service Layer

**Media Services:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Jellyfin     │    │     Komga       │    │      RomM       │
│ (Video Stream)  │    │ (eBook/Comics)  │    │ (Game ROMs)     │
│                 │    │                 │    │                 │
│ • Hardware      │    │ • Library Mgmt  │    │ • ROM Library   │
│   Transcoding   │    │ • Reading UI    │    │ • Emulation     │
│ • Multi-format  │    │ • Metadata      │    │ • Metadata      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Sync Services (TypeScript):**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Kiwix Sync    │    │    NFS Sync     │    │  Offline Sync   │
│ (Wikipedia/Edu) │    │ (Central NAS)   │    │ (MicroSD Cards) │
│                 │    │                 │    │                 │
│ • ZIM Files     │    │ • Content Types │    │ • Auto-detect   │
│ • Mirror Support│    │ • Plex Sync     │    │ • Bidirectional │
│ • Auto Updates  │    │ • Resume        │    │ • Resume        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 6. Network Layer

**Network Architecture:**

```
Internet ──► WAN Interface ──► Router/Firewall ──► LAN Network
                                      │
                                      ├──► WiFi Hotspot "DangerPrep"
                                      ├──► Ethernet LAN
                                      └──► Tailscale VPN
```

**Routing Scenarios:**
1. **WAN-to-WiFi** - Ethernet WAN, WiFi clients with internet access
2. **WiFi Repeater** - Extend existing WiFi network
3. **Emergency Local** - Local-only network without internet

**DNS Chain:**
```
Client ──► CoreDNS ──► AdGuard Home ──► NextDNS
           (Local)     (Ad-blocking)    (External)
```

**Network Configuration:**
- **LAN Network**: 192.168.120.0/22 (Tailscale site-to-site routing)
- **WiFi Hotspot**: "DangerPrep" with WPA2 password "EXAMPLE_PASSWORD"
- **Domain**: .danger (local resolution via DNS)
- **Tailscale**: VPN with subnet routing for secure remote access

## Data Flow Architecture

### Content Synchronization Flow

```
Central NAS ──► NFS Sync ──► Local Storage ──► Media Services
                                   │
Internet ──► Kiwix Sync ──────────┘
                                   │
MicroSD ◄──► Offline Sync ◄───────┘
```

### Service Communication

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Service A     │    │   Service B     │    │   Service C     │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ BaseService │ │    │ │ BaseService │ │    │ │ BaseService │ │
│ │             │ │    │ │             │ │    │ │             │ │
│ │ • Config    │ │    │ │ • Config    │ │    │ │ • Config    │ │
│ │ • Health    │ │    │ │ • Health    │ │    │ │ • Health    │ │
│ │ • Logging   │ │    │ │ • Logging   │ │    │ │ • Logging   │ │
│ │ • Progress  │ │    │ │ • Progress  │ │    │ │ • Progress  │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   Shared Packages       │
                    │                         │
                    │ • @dangerprep/logging   │
                    │ • @dangerprep/health    │
                    │ • @dangerprep/config    │
                    │ • @dangerprep/progress  │
                    │ • @dangerprep/types     │
                    └─────────────────────────┘
```

## Deployment Architecture

### Container Organization

```
docker/
├── infrastructure/        # Core infrastructure services
│   ├── traefik/          # Reverse proxy with ACME
│   ├── step-ca/          # Internal certificate authority
│   ├── cdn/              # Self-hosted CDN (TypeScript)
│   ├── dns/              # DNS services (CoreDNS + AdGuard)

│   └── watchtower/       # Auto-updates
├── media/                # Media services
│   ├── jellyfin/         # Video streaming
│   ├── komga/            # eBook management
│   └── romm/             # Game ROM management
├── services/             # Utility services
│   └── portal/           # Management interface
└── sync/                 # Sync services (TypeScript)
    ├── kiwix-sync/       # Offline content sync
    ├── nfs-sync/         # NAS content sync
    └── offline-sync/     # MicroSD card sync
```

### Build and Deployment Pipeline

```
Source Code ──► Turborepo Build ──► Docker Images ──► Container Deployment
     │                   │                │                    │
     ├─ TypeScript       ├─ Shared Deps   ├─ Multi-stage      ├─ Health Checks
     ├─ Zod Schemas      ├─ Tree Shaking  ├─ Optimization     ├─ Auto-restart
     ├─ ESLint/Prettier  ├─ Caching       ├─ Security         └─ Monitoring
     └─ Type Checking    └─ Parallelism   └─ Compression
```

## Security Architecture

### Security Layers

1. **Network Security**
   - Firewall with minimal attack surface
   - VPN-only SSH access (Tailscale recommended)
   - Network segmentation and isolation

2. **Container Security**
   - Non-root container execution
   - Resource limits and security contexts
   - Network isolation between services
   - Regular image updates via Watchtower

3. **Certificate Management**
   - Internal CA with step-ca
   - Automatic certificate issuance and renewal
   - HTTPS for all web services
   - MDM profile support for device trust

4. **Application Security**
   - Input validation with Zod schemas
   - Structured error handling
   - Comprehensive logging and monitoring
   - Security auditing and scanning

## Monitoring and Observability

### Health Monitoring

```
Service Level ──► Component Level ──► System Level ──► Alerts
     │                   │                │              │
     ├─ Service Health   ├─ DB Health     ├─ CPU/Memory  ├─ Notifications
     ├─ API Endpoints    ├─ File System  ├─ Disk Space  ├─ Logging
     ├─ Dependencies     ├─ Network      ├─ Temperature ├─ Metrics
     └─ Performance      └─ External     └─ Hardware    └─ Dashboards
```

### Logging Architecture

- **Structured Logging** - JSON format with consistent fields
- **Log Rotation** - Automatic rotation with size and time limits
- **Multiple Outputs** - Console and file transports
- **Centralized** - Aggregated logging across all services
- **Searchable** - Structured data for easy searching and analysis

## Development Architecture

### Monorepo Benefits

- **Shared Dependencies** - Consistent versions across packages
- **Type Safety** - Shared types ensure API compatibility
- **Code Reuse** - Common utilities and patterns
- **Atomic Changes** - Cross-package changes in single commits
- **Unified Tooling** - Consistent linting, formatting, and building

### Development Workflow

```
Feature Branch ──► Local Development ──► Testing ──► PR Review ──► Merge
       │                   │              │           │           │
       ├─ Package Changes  ├─ Type Check  ├─ Unit     ├─ Code     ├─ Deploy
       ├─ Shared Updates   ├─ Lint/Format ├─ Integration ├─ Security ├─ Monitor
       └─ Documentation    └─ Build       └─ E2E       └─ Review   └─ Validate
```

## Scalability and Performance

### Performance Optimizations

- **Hardware Acceleration** - GPU/VPU/NPU utilization on RK3588
- **Caching Strategies** - Multi-level caching for content delivery
- **Compression** - Gzip/Brotli for web assets
- **Connection Pooling** - Efficient resource utilization
- **Lazy Loading** - On-demand resource loading

### Scalability Considerations

- **Horizontal Scaling** - Multiple device deployment
- **Load Balancing** - Traefik for service distribution
- **Resource Management** - Container resource limits
- **Storage Optimization** - Efficient content organization
- **Network Optimization** - QoS and traffic shaping

## Configuration Management

### Configuration Architecture

```
Environment Variables ──► YAML Configuration ──► Zod Validation ──► Type-Safe Config
         │                        │                    │                    │
         ├─ Secrets              ├─ Service Config    ├─ Schema Validation ├─ Runtime Safety
         ├─ Paths                ├─ Feature Flags     ├─ Default Values    ├─ Auto-completion
         └─ Overrides            └─ Environment       └─ Error Reporting   └─ Documentation
```

### Configuration Hierarchy

1. **Default Values** - Sensible defaults in Zod schemas
2. **Configuration Files** - YAML files with environment substitution
3. **Environment Variables** - Runtime overrides and secrets
4. **Command Line Arguments** - Service-specific overrides

## Error Handling and Recovery

### Error Handling Strategy

```
Error Occurrence ──► Classification ──► Recovery Strategy ──► Notification
        │                   │                │                   │
        ├─ Network         ├─ Retryable     ├─ Automatic       ├─ Logging
        ├─ File System     ├─ User Error    ├─ Manual          ├─ Alerts
        ├─ Configuration   ├─ System Error  ├─ Graceful Fail   ├─ Metrics
        └─ Service         └─ Critical      └─ Circuit Breaker └─ Dashboard
```

### Recovery Mechanisms

- **Automatic Retry** - Exponential backoff for transient failures
- **Circuit Breakers** - Prevent cascade failures
- **Graceful Degradation** - Reduced functionality during issues
- **Health Checks** - Continuous monitoring and recovery
- **Rollback Capability** - Revert to previous working state

## Future Architecture Considerations

### Planned Enhancements

1. **Multi-Node Support** - Distributed deployment across multiple devices
2. **Edge Computing** - Enhanced local processing capabilities
3. **AI/ML Integration** - Leverage NPU for intelligent content management
4. **Mesh Networking** - Device-to-device communication
5. **Enhanced Security** - Zero-trust architecture implementation

### Technology Evolution

- **Container Orchestration** - Potential Kubernetes adoption
- **Service Mesh** - Enhanced service-to-service communication
- **Event-Driven Architecture** - Reactive system patterns
- **Microservices** - Further service decomposition
- **Cloud Integration** - Hybrid cloud capabilities

This architecture provides a robust, scalable, and maintainable foundation for the DangerPrep emergency router and content hub system, designed to evolve with changing requirements and technology advances.
