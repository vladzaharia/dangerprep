# DangerPrep Private Certificate Authority (step-ca)

This directory contains the configuration for a private Certificate Authority using Smallstep's step-ca, integrated with Traefik for automatic HTTPS certificate issuance.

## Services

### step-ca
- **Image**: `smallstep/step-ca:latest`
- **Port**: 9000 (HTTPS API)
- **URL**: https://ca.danger:9000
- **ACME Directory**: https://ca.danger:9000/acme/acme/directory

### ca-download
- **Custom Node.js service** for certificate distribution
- **Port**: 8080 (HTTP only)
- **URL**: http://root.danger
- **Purpose**: Provides root CA certificate downloads and MDM profiles
- **UI**: Modern Web Awesome components with responsive design

## Setup Instructions

### 1. Configure Environment
Edit `compose.env` and set:
```bash
STEP_CA_PASSWORD=your-secure-ca-password-here
STEP_CA_NAME=DangerPrep Internal CA
```

### 2. Start Services
```bash
# From the project root
docker compose -f docker/infrastructure/step-ca/compose.yml up -d
```

### 3. Configure Trust
Run the setup script to configure Traefik trust:
```bash
chmod +x docker/infrastructure/step-ca/setup-ca-trust.sh
./docker/infrastructure/step-ca/setup-ca-trust.sh
```

### 4. Update Service Labels
Update existing services to use the step-ca certificate resolver:
```yaml
labels:
  - "traefik.http.routers.service.tls.certresolver=step-ca"  # Changed from cloudflare
```

### 5. Restart Traefik
```bash
docker compose -f docker/infrastructure/traefik/compose.yml restart
```

## Certificate Installation

### Access the Download Page
Visit http://root.danger for:
- Root certificate downloads (.crt, .pem)
- iOS/macOS MDM profiles
- Platform-specific installation instructions

### Manual Installation

#### iOS/iPadOS
1. Download the `.mobileconfig` profile
2. Install via Settings → General → VPN & Device Management
3. Enable trust in Certificate Trust Settings

#### macOS
1. Download the certificate file
2. Add to Keychain Access (System keychain)
3. Set trust to "Always Trust"

#### Windows
1. Download the certificate file
2. Install to "Trusted Root Certification Authorities"

#### Linux
```bash
sudo cp root-ca.crt /usr/local/share/ca-certificates/dangerprep-ca.crt
sudo update-ca-certificates
```

## ACME Integration

### Traefik Configuration
The step-ca certificate resolver is configured in `traefik.yml`:
```yaml
certificatesResolvers:
  step-ca:
    acme:
      email: ${ACME_EMAIL}
      storage: /data/step-ca-acme.json
      caServer: https://ca.danger:9000/acme/acme/directory
      httpChallenge:
        entryPoint: web
```

### Other ACME Clients
Configure with:
- **Server URL**: https://ca.danger:9000/acme/acme/directory
- **Root Certificate**: Download from ca-download service
- **Challenge Type**: HTTP-01 (recommended for internal services)

## Security Considerations

1. **Password Protection**: The CA private key is protected by the password in `STEP_CA_PASSWORD`
2. **Network Isolation**: step-ca runs in its own Docker network
3. **HTTPS Only**: The CA API is only accessible via HTTPS
4. **Certificate Validation**: All ACME challenges are validated before issuance

## Troubleshooting

### Check step-ca Status
```bash
docker compose -f docker/infrastructure/step-ca/compose.yml logs step-ca
```

### Verify ACME Provisioner
```bash
docker exec -it step-ca_step-ca_1 step ca provisioner list
```

### Test Certificate Issuance
```bash
# Using step CLI
step ca certificate test.danger test.crt test.key --provisioner acme
```

### Check Traefik Logs
```bash
docker compose -f docker/infrastructure/traefik/compose.yml logs traefik
```

## File Structure
```
docker/infrastructure/step-ca/
├── compose.yml              # Docker Compose configuration
├── compose.env              # Environment variables
├── Dockerfile               # CA download service image
├── package.json             # Node.js dependencies
├── init-ca.sh              # step-ca initialization script
├── setup-ca-trust.sh       # Trust configuration script
├── src/
│   └── server.js           # CA download service
└── README.md               # This file
```

## Data Persistence

- **step-ca data**: `${INSTALL_ROOT}/data/step-ca/`
  - `certs/root_ca.crt` - Root certificate
  - `certs/intermediate_ca.crt` - Intermediate certificate
  - `secrets/` - Private keys (encrypted)
  - `config/` - CA configuration

- **Traefik ACME data**: `${INSTALL_ROOT}/data/traefik/step-ca-acme.json`
