# DNS Infrastructure

DNS infrastructure for DangerPrep, including AdGuard Home for ad-blocking and local DNS server for internal domain resolution.

## Components

**AdGuard Home (`adguardhome`):**
- Purpose: Ad-blocking and DNS filtering
- Port: 53 (DNS), 3000 (Web Interface)
- Access: `https://dns.${DOMAIN_NAME}`

**CoreDNS (`coredns`):**
- Purpose: Internal domain resolution
- Port: 5353 (Alternative DNS)
- Configuration: Managed by registrar service

**DNS Registrar (`registrar`):**
- Purpose: Watches Docker labels and updates DNS records
- Function: Automatically registers services with `dns.register` labels

## Quick Start

```bash
# 1. Configure environment
nano compose.dns.env

# 2. Deploy
docker compose up -d

# 3. Setup AdGuard
# Access http://your-server-ip:3000, follow setup wizard
# Set upstream DNS to 172.21.0.4:53
```

## Service Registration

Services automatically register DNS entries using labels:
```yaml
labels:
  - "dns.register=myservice.${DOMAIN_NAME}"
```
Creates DNS record: `myservice.yourdomain.com → service-ip`

## Network Architecture

```
Client Request → AdGuard Home (172.21.0.2:53) → CoreDNS (172.21.0.4:53) → DNS Zone File → DNS Registrar
```

## Troubleshooting

**Check DNS Resolution:**
```bash
nslookup jellyfin.yourdomain.com your-server-ip  # Test local DNS
cat /data/local-dns/db.yourdomain.com            # Check zone file
```

**Check Service Logs:**
```bash
docker logs dns-adguardhome-1
docker logs dns-coredns-1
docker logs dns-registrar-1
```

**Manual DNS Records:**
```bash
# Edit zone file and reload CoreDNS
nano /data/local-dns/db.yourdomain.com
docker exec dns-coredns-1 kill -HUP 1
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DOMAIN_NAME` | Your domain name | `yourdomain.com` |
| `DNS_UPDATE_INTERVAL` | Update frequency (seconds) | `30` |
| `TZ` | Timezone | `America/New_York` |

## Data Persistence

- **AdGuard Config**: `/data/adguard/conf`
- **AdGuard Data**: `/data/adguard/work`
- **DNS Zone Files**: `/data/local-dns`
