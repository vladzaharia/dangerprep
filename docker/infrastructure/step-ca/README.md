# DangerPrep Private Certificate Authority (step-ca)

Private Certificate Authority using Smallstep's step-ca, integrated with Traefik for automatic HTTPS certificate issuance.

## Services

**step-ca:**
- **Image**: `smallstep/step-ca:latest`
- **Port**: 9000 (HTTPS API)
- **URL**: https://ca.danger:9000
- **ACME Directory**: https://ca.danger:9000/acme/acme/directory

**ca-download:**
- **Custom Node.js service** for certificate distribution
- **Port**: 8080 (HTTP only)
- **URL**: http://root.danger
- **Purpose**: Root CA certificate downloads and MDM profiles

## Setup

```bash
# 1. Configure environment
# Edit compose.env and set:
STEP_CA_PASSWORD=your-secure-ca-password-here
STEP_CA_NAME=DangerPrep Internal CA

# 2. Start services
docker compose -f docker/infrastructure/step-ca/compose.yml up -d

# 3. Configure trust
chmod +x docker/infrastructure/step-ca/setup-ca-trust.sh
./docker/infrastructure/step-ca/setup-ca-trust.sh

# 4. Update service labels to use step-ca resolver
# 5. Restart Traefik
docker compose -f docker/infrastructure/traefik/compose.yml restart
```

## Certificate Installation

**Access Download Page:** Visit http://root.danger for root certificate downloads and MDM profiles.

**Manual Installation:**
- **iOS/iPadOS**: Download `.mobileconfig` profile, install via Settings → General → VPN & Device Management
- **macOS**: Download certificate, add to Keychain Access (System keychain), set trust to "Always Trust"
- **Linux**: `wget -O dangerprep-ca.crt http://root.danger/root.crt && sudo cp dangerprep-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`

## ACME Integration

**Traefik Configuration:**
```yaml
certificatesResolvers:
  step-ca:
    acme:
      caServer: https://ca.danger:9000/acme/acme/directory
      storage: /data/step-ca-acme.json
```

**Other ACME Clients:** Use server URL `https://ca.danger:9000/acme/acme/directory`

## Troubleshooting

```bash
# Check step-ca status
docker compose -f docker/infrastructure/step-ca/compose.yml logs step-ca

# Verify ACME provisioner
docker exec -it step-ca_step-ca_1 step ca provisioner list

# Check Traefik logs
docker compose -f docker/infrastructure/traefik/compose.yml logs traefik
```

## Security

- CA private key protected by `STEP_CA_PASSWORD`
- Network isolation via Docker networks
- HTTPS-only CA API access
- ACME challenge validation before issuance
