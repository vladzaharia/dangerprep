# RaspAP Docker Integration for DangerPrep

Comprehensive WiFi management, DHCP, DNS forwarding, firewall, and VPN integration for DangerPrep with professional web-based management interface.

## RaspAP Insiders Setup

**GitHub Personal Access Token Required:**
1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with "Full control of private repositories" scope
3. Configure environment variables:
   ```bash
   cp docker/infrastructure/raspap/compose.env.example docker/infrastructure/raspap/compose.env
   # Edit compose.env with your GitHub credentials:
   GITHUB_USERNAME=your_actual_github_username
   GITHUB_TOKEN=your_actual_github_token
   ```

**Insiders Features:**
- Tailscale VPN Integration with exit node capabilities
- Advanced Firewall with web-based configuration
- Network Diagnostics and troubleshooting tools
- WPA3 Security and enhanced protocols
- QoS Traffic Shaping and bandwidth management

## DNS Integration

```
WiFi Clients → RaspAP dnsmasq (port 53) → CoreDNS (port 5353, .danger domains) → AdGuard → Upstream DNS
```

**Configuration:**
1. Access `http://wifi.danger` or `http://192.168.120.1`
2. Go to "DHCP Server" → "Advanced"
3. Add DNS forwarding rules:
   ```
   server=/danger/127.0.0.1#5353    # Forward .danger domains to CoreDNS
   server=127.0.0.1#3000            # Forward other domains to AdGuard
   ```

## Network Configuration

**DangerPrep Compatible Settings:**
- SSID: `DangerPrep`
- Password: `EXAMPLE_PASSWORD`
- IP Range: `192.168.120.1/22`
- DHCP Range: `192.168.120.100-200`

## Deployment

```bash
cd docker/infrastructure/raspap
cp compose.env.example compose.env  # Edit with GitHub credentials
docker compose up -d
docker compose logs -f raspap
```

## Web Interface

- **URL**: `http://wifi.danger` or `http://192.168.120.1`
- **Default Credentials**: admin/secret (change immediately)

## Tailscale Integration

**With RaspAP Insiders:**
1. Go to "VPN" → "Tailscale" in web interface
2. Enable Tailscale service and follow authentication flow
3. Optionally enable "Advertise as exit node"

## Security

1. **Change Default Credentials** - Update `RASPAP_WEBGUI_USER` and `RASPAP_WEBGUI_PASS`
2. **GitHub Token Security** - Use minimal permissions, store securely, rotate regularly
3. **Network Security** - Enable WPA3 if supported, configure firewall rules