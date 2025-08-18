# DangerPrep Security Management System

This directory contains the comprehensive security management system for DangerPrep.
It provides intelligent security management with automatic threat detection, certificate
management, secret handling, and comprehensive security auditing.

## Architecture Overview

The security system follows the same intelligent, event-driven architecture as the network
scripts, with:

- **`security-manager.sh`** - Main intelligent controller (single entry point)
- **Specialized security tools** - Domain-specific functionality
- **Shared security utilities** - Common security functions and state management
- **Comprehensive auditing** - Multiple security scanning tools
- **Certificate management** - Step-CA integration and SSL/TLS handling
- **Secret management** - Secure generation and storage of credentials

## Core Components

### Main Controller
- **`security-manager.sh`** - Central entry point for all security operations

### Security Auditing
- **`security-audit-all.sh`** - Unified security audit orchestrator
- **`aide-check.sh`** - File integrity monitoring using AIDE
- **`antivirus-scan.sh`** - Malware scanning using ClamAV
- **`lynis-audit.sh`** - System security audit using Lynis
- **`rootkit-scan.sh`** - Rootkit detection using rkhunter/chkrootkit
- **`security-audit.sh`** - General security configuration checks

### Certificate Management
- **`certificate-manager.sh`** - SSL/TLS certificate management and Step-CA integration

### Secret Management
- **`setup-secrets.sh`** - Complete secret management setup
- **`update-env-secrets.sh`** - Environment file secret updates

### Monitoring & Diagnostics
- **`suricata-monitor.sh`** - IDS monitoring and alerting
- **`security-diagnostics.sh`** - Security validation and status reporting

### Shared Utilities
- **`security-functions.sh`** - Common security utilities and functions
- **`security-state.sh`** - Centralized security state management

## Usage

### Main Security Manager Commands

The security manager provides a unified interface for all security operations:

```bash
# Show comprehensive security status
just security-status

# Run complete security audit
just security-audit-all

# Set up secret management
just secrets-setup

# Check certificate status
just certs-status

# Run security diagnostics
just security-diagnostics
```

### Direct Script Usage

You can also run scripts directly for specific operations:

```bash
# Security auditing
./scripts/security/aide-check.sh check
./scripts/security/antivirus-scan.sh quick
./scripts/security/lynis-audit.sh audit
./scripts/security/rootkit-scan.sh scan

# Certificate management
./scripts/security/certificate-manager.sh status
./scripts/security/certificate-manager.sh generate

# Secret management
./scripts/security/setup-secrets.sh
./scripts/security/update-env-secrets.sh

# Security diagnostics
./scripts/security/security-diagnostics.sh validate
```

## Generated Secrets

### ROMM Service
- `ROMM_AUTH_SECRET_KEY` - 32-byte hex authentication key
- `DB_PASSWD` - Database password (24 chars, alphanumeric)
- `REDIS_PASSWORD` - Redis password (20 chars, alphanumeric)

### Step-CA Service
- `DOCKER_STEPCA_INIT_PASSWORD` - Root CA password (32 chars, strong)


### Traefik Service
- `TRAEFIK_AUTH_USERS` - Basic auth hash for admin user (dashboard access)
- `auth_password` - Plain text password for reference
- Uses Step-CA only for SSL certificates (no external dependencies)

### Watchtower Service
- `WATCHTOWER_HTTP_API_TOKEN` - API access token (64 chars)
- `email_password` - Email notification password (placeholder)
- `gotify_token` - Gotify notification token (placeholder)

### Komga Service
- `SERVER_SSL_KEYSTOREPASSWORD` - SSL keystore password (16 chars)

### Jellyfin Service
- `JELLYFIN_CertificatePassword` - Certificate password (16 chars)

### Shared Secrets
- `mariadb_root_password` - MariaDB root password (24 chars)
- `redis_auth_password` - Redis AUTH password (20 chars)

## Security Features

### File-Based Secrets
Services that support it use file-based secrets mounted as read-only volumes:

```yaml
volumes:
  - ${INSTALL_ROOT}/secrets/romm/auth_secret_key:/run/secrets/romm_auth_secret_key:ro
environment:
  - ROMM_AUTH_SECRET_KEY_FILE=/run/secrets/romm_auth_secret_key
```

### Secure Permissions
- Secrets directory: `700` (owner only)
- Secret files: `600` (owner read/write only)
- Environment files: `600` (owner read/write only)

### Automatic Backup
Environment files are automatically backed up before updates to:
```
/opt/dangerprep/backups/env-YYYYMMDD-HHMMSS/
```

## Directory Structure

```
secrets/
├── romm/
│   ├── auth_secret_key
│   ├── db_password
│   └── redis_password
├── step-ca/
│   └── ca_password

├── traefik/
│   ├── auth_password
│   └── auth_users
├── watchtower/
│   ├── api_token
│   ├── email_password
│   └── gotify_token
├── komga/
│   └── keystore_password
├── jellyfin/
│   └── certificate_password
└── shared/
    ├── mariadb_root_password
    └── redis_auth_password
```

## Integration

The secret management system is automatically integrated into:

1. **Setup Script** - `scripts/setup/setup-dangerprep.sh` calls `setup-secrets.sh`
2. **Docker Compose** - Services mount secrets as files where supported
3. **Environment Files** - Updated with generated secrets automatically

## Manual Usage

If you need to manually manage secrets:

```bash
# Generate new secrets
cd /opt/dangerprep
./scripts/security/generate-secrets.sh

# Update environment files
./scripts/security/update-env-secrets.sh

# Or do both at once
./scripts/security/setup-secrets.sh
```

## Security Best Practices

1. **Never commit secrets to version control**
2. **Keep the secrets directory secure** (700 permissions)
3. **Backup secrets before making changes**
4. **Replace placeholder API keys** with real ones after setup
5. **Monitor secret file permissions** regularly

## Placeholder Secrets

Some secrets are generated as placeholders and should be replaced with real values:

- **Email passwords** for Watchtower notifications
- **External service API keys** (IGDB, SteamGridDB, etc.) for ROMM

Check the environment files after setup and replace these with your actual credentials.

**Note**: Traefik uses only Step-CA for SSL certificates - no external API keys required!

## Troubleshooting

### Permission Denied Errors
```bash
# Fix permissions
sudo chown -R $(whoami):$(whoami) /opt/dangerprep/secrets
chmod -R 700 /opt/dangerprep/secrets
```

### Missing Secrets
```bash
# Regenerate missing secrets
./scripts/security/generate-secrets.sh
```

### Validation Errors
```bash
# Validate all secrets
./scripts/security/setup-secrets.sh --dry-run
```

## Support

For issues with the secret management system:

1. Check file permissions on secrets directory
2. Verify all required tools are installed (openssl, htpasswd)
3. Run validation with `--dry-run` flag
4. Check logs in `/opt/dangerprep/data/logs/`
