# RaspAP Docker Integration for DangerPrep

## Overview

RaspAP provides comprehensive WiFi management, DHCP, DNS forwarding, firewall, and VPN integration for DangerPrep. This replaces the custom hostapd/dnsmasq setup with a professional web-based management interface.

## RaspAP Insiders Setup

### GitHub Personal Access Token

To enable RaspAP Insiders features, you need a GitHub Personal Access Token:

1. **Create GitHub Personal Access Token**
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Set expiration as needed
   - Select scope: "Full control of private repositories" (repo)
   - Generate and copy the token

2. **Configure Environment Variables**
   ```bash
   # Copy the example environment file
   cp docker/infrastructure/raspap/compose.env.example docker/infrastructure/raspap/compose.env

   # Edit the environment file
   nano docker/infrastructure/raspap/compose.env

   # Update these variables with your GitHub credentials:
   GITHUB_USERNAME=your_actual_github_username
   GITHUB_TOKEN=your_actual_github_token
   ```

### Insiders Features Available

- **Tailscale VPN Integration**: Native Tailscale support with exit node capabilities
- **Advanced Firewall**: Web-based firewall configuration and management
- **Network Diagnostics**: Built-in network troubleshooting tools
- **WPA3 Security**: Enhanced WiFi security protocols
- **Multiple VPN Configs**: Support for multiple VPN configurations
- **QoS Traffic Shaping**: Bandwidth management and prioritization

## DNS Integration

RaspAP integrates with existing DangerPrep DNS services:

```
WiFi Clients → RaspAP dnsmasq (port 53) → CoreDNS (port 5353, .danger domains) → AdGuard → Upstream DNS
```

**Configuration via RaspAP Web Interface:**
1. Access `http://wifi.danger` or `http://192.168.120.1`
2. Go to "DHCP Server" → "Advanced"
3. Add DNS forwarding rules:
   ```
   # Forward .danger domains to CoreDNS
   server=/danger/127.0.0.1#5353

   # Forward other domains to AdGuard
   server=127.0.0.1#3000
   ```

## Network Configuration

**DangerPrep Compatible Settings:**
- SSID: `DangerPrep`
- Password: `Buff00n!`
- IP Range: `192.168.120.1/22`
- DHCP Range: `192.168.120.100-200`

## Deployment

```bash
# Navigate to RaspAP directory
cd docker/infrastructure/raspap

# Ensure environment file is configured
cp compose.env.example compose.env
# Edit compose.env with your GitHub credentials

# Start RaspAP container
docker compose up -d

# Check container status
docker compose logs -f raspap
```

## Web Interface Access

- **URL**: `http://wifi.danger` or `http://192.168.120.1`
- **Username**: `admin` (configurable)
- **Password**: `secret` (configurable)

## Tailscale Integration

With RaspAP Insiders:

1. **Enable Tailscale**
   - Go to "VPN" → "Tailscale" in web interface
   - Enable Tailscale service
   - Follow authentication flow

2. **Configure as Exit Node** (Optional)
   - Enable "Advertise as exit node"
   - Configure subnet routes for DangerPrep network

## Security Notes

1. **Change Default Credentials**
   - Update `RASPAP_WEBGUI_USER` and `RASPAP_WEBGUI_PASS` in compose.env

2. **GitHub Token Security**
   - Use minimal required permissions
   - Store securely (not in version control)
   - Rotate tokens regularly

3. **Network Security**
   - Enable WPA3 if hardware supports it
   - Configure firewall rules appropriately