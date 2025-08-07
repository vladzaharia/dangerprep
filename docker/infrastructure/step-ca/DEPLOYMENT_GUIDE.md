# DangerPrep Private CA Deployment Guide

This guide walks you through setting up a complete private Certificate Authority (CA) infrastructure using Smallstep's step-ca, integrated with Traefik for automatic HTTPS certificate issuance.

## 🎯 What This Setup Provides

- **Private Certificate Authority**: Issues certificates for internal services
- **ACME Server**: Automatic certificate issuance and renewal via ACME protocol
- **Traefik Integration**: Seamless HTTPS for all services
- **Certificate Download Service**: Modern Web Awesome UI for root CA distribution
- **MDM Profile Support**: Automatic certificate installation for iOS/macOS devices
- **Cross-Platform Support**: Installation instructions for all major platforms
- **Professional UI**: Responsive design with Web Awesome components

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   step-ca       │    │    Traefik      │    │  Your Services  │
│  (Port 9000)    │◄───┤  (Ports 80/443) │◄───┤                 │
│                 │    │                 │    │                 │
│ • Root CA       │    │ • ACME Client   │    │ • Auto HTTPS    │
│ • ACME Server   │    │ • Cert Resolver │    │ • step-ca certs │
│ • Certificate   │    │ • Load Balancer │    │                 │
│   Issuance      │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐
│  ca-download    │
│  (Port 8080)    │
│                 │
│ • Root CA DL    │
│ • MDM Profiles  │
│ • Instructions  │
└─────────────────┘
```

## 🚀 Quick Start

### 1. Configure Environment
```bash
cd docker/infrastructure/step-ca
cp compose.env.example compose.env  # If you have an example file
```

Edit `compose.env`:
```bash
STEP_CA_PASSWORD=your-very-secure-password-here
STEP_CA_NAME=DangerPrep Internal CA
STEP_CA_DNS_NAMES=ca.danger,step-ca.danger,localhost,127.0.0.1
```

### 2. Deploy CDN and CA
```bash
# Start the self-hosted CDN first
docker compose -f docker/infrastructure/cdn/compose.yml up -d

# Deploy the private CA
chmod +x docker/infrastructure/step-ca/deploy-private-ca.sh
./docker/infrastructure/step-ca/deploy-private-ca.sh
```

### 3. Verify the Setup
```bash
# Check that services are running
docker compose -f docker/infrastructure/cdn/compose.yml ps
docker compose -f docker/infrastructure/step-ca/compose.yml ps

# Test CDN access
curl -I https://cdn.danger/webawesome/dist/styles/webawesome.css

# Test CA download page
curl -I http://root.danger
```

## 📋 Manual Deployment Steps

If you prefer to deploy manually:

### Step 1: Create Networks
```bash
docker network create traefik
```

### Step 2: Start step-ca
```bash
docker compose -f docker/infrastructure/step-ca/compose.yml up -d
```

### Step 3: Configure Trust
```bash
./docker/infrastructure/step-ca/setup-ca-trust.sh
```

### Step 4: Restart Traefik
```bash
docker compose -f docker/infrastructure/traefik/compose.yml restart
```

## 🔐 Certificate Installation

### Access the Download Page
Visit: `http://root.danger`

The page provides:
- Root certificate downloads (.crt, .pem formats)
- iOS/macOS MDM configuration profiles
- Platform-specific installation instructions
- Technical information for ACME clients

### Platform-Specific Installation

#### iOS/iPadOS
1. Download the `.mobileconfig` profile from the download page
2. Install via Settings → General → VPN & Device Management
3. Enable full trust in Certificate Trust Settings

#### macOS
1. Download certificate file
2. Add to Keychain Access (System keychain)
3. Set trust to "Always Trust"

#### Windows
1. Download certificate file
2. Install to "Trusted Root Certification Authorities"

#### Linux
```bash
sudo cp root-ca.crt /usr/local/share/ca-certificates/dangerprep-ca.crt
sudo update-ca-certificates
```

## 🔧 Service Configuration

### Pre-configured Services
All DangerPrep services are already configured to use the step-ca certificate resolver:
```yaml
- "traefik.http.routers.service.tls.certresolver=step-ca"
```

### New Service Example
```yaml
services:
  myservice:
    image: nginx:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myservice.rule=Host(`myservice.danger`)"
      - "traefik.http.routers.myservice.entrypoints=websecure"
      - "traefik.http.routers.myservice.tls.certresolver=step-ca"
      - "dns.register=myservice.danger"
    networks:
      - traefik
```

## 🛠️ ACME Client Configuration

### Traefik (Built-in)
Already configured via the step-ca certificate resolver.

### Certbot
```bash
REQUESTS_CA_BUNDLE=/path/to/root_ca.crt \
certbot certonly -n --standalone -d example.danger \
  --server https://ca.danger:9000/acme/acme/directory
```

### Other ACME Clients
- **Server URL**: `https://ca.danger:9000/acme/acme/directory`
- **Root Certificate**: Download from ca-download service
- **Challenge Type**: HTTP-01 (recommended for internal services)

## 📊 Monitoring and Maintenance

### Check Service Status
```bash
# step-ca logs
docker compose -f docker/infrastructure/step-ca/compose.yml logs -f step-ca

# Download service logs
docker compose -f docker/infrastructure/step-ca/compose.yml logs -f ca-download

# Traefik logs
docker compose -f docker/infrastructure/traefik/compose.yml logs -f traefik
```

### Verify ACME Provisioner
```bash
docker exec step-ca_step-ca_1 step ca provisioner list
```

### Test Certificate Issuance
```bash
step ca certificate test.danger test.crt test.key --provisioner acme
```

## 🔒 Security Considerations

1. **Password Protection**: CA private key is encrypted with `STEP_CA_PASSWORD`
2. **Network Isolation**: step-ca runs in isolated Docker network
3. **HTTPS Only**: CA API only accessible via HTTPS
4. **Certificate Validation**: All ACME challenges validated before issuance
5. **Root Certificate Trust**: Only install on trusted devices

## 🗂️ File Structure

```
docker/infrastructure/step-ca/
├── compose.yml                 # Main Docker Compose configuration
├── compose.env                 # Environment variables
├── Dockerfile                  # CA download service image
├── package.json               # Node.js dependencies
├── init-ca.sh                 # step-ca initialization script
├── setup-ca-trust.sh          # Trust configuration script

├── deploy-private-ca.sh       # Complete deployment script

├── src/
│   └── server.js             # CA download service
├── README.md                 # Basic documentation
├── DEPLOYMENT_GUIDE.md       # This file
└── TROUBLESHOOTING.md        # Troubleshooting guide
```

## 💾 Data Persistence

### step-ca Data
Location: `${INSTALL_ROOT}/data/step-ca/`
- `certs/root_ca.crt` - Root certificate (public)
- `certs/intermediate_ca.crt` - Intermediate certificate (public)
- `secrets/` - Private keys (encrypted)
- `config/` - CA configuration

### Traefik ACME Data
Location: `${INSTALL_ROOT}/data/traefik/step-ca-acme.json`
- Contains issued certificates and account information

## 🔄 Backup and Recovery

### Backup
```bash
# Backup entire CA data
tar -czf step-ca-backup-$(date +%Y%m%d).tar.gz data/step-ca/

# Backup just the essentials
cp data/step-ca/certs/root_ca.crt backups/
cp data/step-ca/secrets/root_ca_key backups/
cp docker/infrastructure/step-ca/compose.env backups/
```

### Recovery
1. Restore CA data directory
2. Restore environment configuration
3. Restart services
4. Re-run trust configuration

## 🆘 Troubleshooting

See `TROUBLESHOOTING.md` for detailed troubleshooting steps.

Common issues:
- DNS resolution for ca.danger domains
- Certificate trust configuration
- ACME challenge failures
- Network connectivity between containers

## 📚 Additional Resources

- [Smallstep step-ca Documentation](https://smallstep.com/docs/step-ca/)
- [ACME Protocol RFC](https://tools.ietf.org/html/rfc8555)
- [Traefik ACME Documentation](https://doc.traefik.io/traefik/https/acme/)
- [DangerPrep Project Documentation](../../../README.md)
