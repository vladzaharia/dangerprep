# Komodo Docker Management Platform

Komodo is a comprehensive Docker management platform that provides a web-based interface for managing Docker containers, images, and services. This setup replaces the previous Arcane dashboard and includes MongoDB as the backend database.

## 🚀 Features

- **Container Management**: Start, stop, restart, and monitor Docker containers
- **Image Management**: Pull, build, and manage Docker images
- **Service Orchestration**: Deploy and manage multi-container applications
- **Resource Monitoring**: Monitor system resources and container metrics
- **User Management**: Multi-user support with role-based access control
- **API Access**: RESTful API for automation and integration
- **Webhook Support**: Automated deployments via webhooks

## 🏗️ Architecture

This setup includes three main components:

### MongoDB (`mongo`)
- **Image**: `mongo:6.0`
- **Purpose**: Database backend for Komodo Core
- **Data**: Stored in `/data/komodo-mongo/`
- **Network**: Internal `komodo` network only

### Komodo Core (`core`)
- **Image**: `ghcr.io/moghtech/komodo-core:latest`
- **Purpose**: Main API server and web interface
- **Access**: https://docker.danger (via Traefik)
- **Port**: 9120 (internal)
- **Data**: Backups in `/data/komodo/backups/`, syncs in `/data/komodo/syncs/`

### Komodo Periphery (`periphery`)
- **Image**: `ghcr.io/moghtech/komodo-periphery:latest`
- **Purpose**: Agent for executing Docker operations
- **Access**: Internal communication with Core
- **Port**: 8120 (internal)
- **Privileges**: Access to Docker socket and host processes

## 🔧 Configuration

### Environment Variables

Key configuration options in `compose.env`:

```bash
# Database credentials (auto-generated)
KOMODO_DB_USERNAME=komodo_admin
KOMODO_DB_PASSWORD=<generated>

# Security secrets (auto-generated)
KOMODO_PASSKEY=<generated>
KOMODO_WEBHOOK_SECRET=<generated>
KOMODO_JWT_SECRET=<generated>

# Access configuration
KOMODO_HOST=https://docker.danger
KOMODO_INIT_ADMIN_USERNAME=admin
KOMODO_INIT_ADMIN_PASSWORD=<prompted>

# Monitoring intervals
KOMODO_MONITORING_INTERVAL=15-sec
KOMODO_RESOURCE_POLL_INTERVAL=1-hr
```

### Secrets

Secrets are stored in `/opt/dangerprep/secrets/komodo/`:
- `db_username` - MongoDB username
- `db_password` - MongoDB password
- `passkey` - Core/Periphery authentication
- `webhook_secret` - Webhook authentication
- `jwt_secret` - JWT token generation
- `admin_password` - Initial admin password

## 🌐 Access

- **Web Interface**: https://docker.danger
- **Default Login**: admin / (configured during setup)
- **API Endpoint**: https://docker.danger/api

## 📊 Monitoring

### Health Checks
- **MongoDB**: `mongosh --eval "db.adminCommand('ping')"`
- **Core**: `wget http://localhost:9120/health`
- **Periphery**: `wget http://localhost:8120/health`

### Resource Limits
- **MongoDB**: 1GB limit, 256MB reserved
- **Core**: 2GB limit, 512MB reserved  
- **Periphery**: 1GB limit, 256MB reserved

## 🔒 Security

- All services run as user `1337:1337`
- MongoDB is isolated on internal network
- Secrets are stored as separate files
- TLS termination handled by Traefik
- JWT-based authentication with configurable TTL

## 🔄 Backup

Database backups are automatically stored in `/data/komodo/backups/` with configurable retention (default: 30 backups).

## 📚 Documentation

- **Official Docs**: https://komo.do/docs/
- **MongoDB Setup**: https://komo.do/docs/setup/mongo
- **API Reference**: https://komo.do/docs/api/

## 🔄 Migration from Arcane

This setup replaces the previous Arcane dashboard. Key changes:
- MongoDB backend instead of file-based storage
- Enhanced container management capabilities
- Multi-user support with RBAC
- API-first architecture
- Webhook integration support

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check MongoDB container status
   - Verify database credentials in environment

2. **Periphery Not Connecting**
   - Ensure `KOMODO_PASSKEY` matches between Core and Periphery
   - Check internal network connectivity

3. **Web Interface Not Loading**
   - Verify Traefik configuration
   - Check Core container health status
   - Ensure DNS resolution for `docker.danger`

### Logs

```bash
# View all service logs
docker compose -f docker/infrastructure/komodo/compose.yml logs -f

# View specific service logs
docker compose -f docker/infrastructure/komodo/compose.yml logs -f core
docker compose -f docker/infrastructure/komodo/compose.yml logs -f mongo
docker compose -f docker/infrastructure/komodo/compose.yml logs -f periphery
```
