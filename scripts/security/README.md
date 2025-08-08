# DangerPrep Secret Management System

This directory contains the secret management system for DangerPrep Docker services. All passwords, API keys, and sensitive configuration values are automatically generated with strong randomness and stored securely.

## Overview

The secret management system provides:

- **Automatic secret generation** for all Docker services
- **Secure file-based storage** with proper permissions (600)
- **Docker secrets integration** where supported
- **Environment file updates** with generated secrets
- **Backup and validation** of secret configurations

## Scripts

### `generate-secrets.sh`
Generates random passwords and secrets for all Docker services.

```bash
# Generate all missing secrets
./generate-secrets.sh

# Regenerate all secrets (overwrite existing)
./generate-secrets.sh --force

# Generate secrets for specific service only
./generate-secrets.sh --service romm
```

### `update-env-secrets.sh`
Updates Docker compose.env files with generated secrets.

```bash
# Update all environment files
./update-env-secrets.sh

# Preview changes without applying
./update-env-secrets.sh --dry-run

# Update specific service only
./update-env-secrets.sh --service traefik
```

### `setup-secrets.sh`
Complete secret management setup (combines generation and updates).

```bash
# Set up all secrets (recommended)
./setup-secrets.sh

# Force regenerate all secrets
./setup-secrets.sh --force

# Preview what would be done
./setup-secrets.sh --dry-run
```

## Generated Secrets

### ROMM Service
- `ROMM_AUTH_SECRET_KEY` - 32-byte hex authentication key
- `DB_PASSWD` - Database password (24 chars, alphanumeric)
- `REDIS_PASSWORD` - Redis password (20 chars, alphanumeric)

### Step-CA Service
- `DOCKER_STEPCA_INIT_PASSWORD` - Root CA password (32 chars, strong)

### Portainer Service
- `PORTAINER_ADMIN_PASSWORD` - Initial admin password (20 chars, strong)

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
├── portainer/
│   └── admin_password
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
