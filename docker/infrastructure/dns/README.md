# DNS Infrastructure

DNS infrastructure for DangerPrep, using CoreDNS with NextDNS for secure DNS resolution and local domain resolution.

## Components

**CoreDNS (`coredns`):**
- Purpose: Internal domain resolution and secure DNS forwarding
- Port: 5353 (Alternative DNS)
- Configuration: Managed by registrar service
- Upstream: NextDNS (3ca9ab.dns.nextdns.io) for secure DNS-over-TLS

**AdGuard Home (`adguardhome`):** ⚠️ **DISABLED**
- Status: Commented out in favor of NextDNS direct integration
- Reason: Simplified DNS chain with NextDNS providing built-in filtering

**DNS Registrar (`registrar`):**
- Purpose: Watches Docker labels and updates DNS records
- Function: Automatically registers services with `dns.register` labels

## Quick Start

```bash
# 1. Configure environment
nano compose.dns.env

# 2. Deploy
docker compose up -d

# 3. Test DNS resolution
dig @your-server-ip google.com

# 4. Test local domain resolution
dig @your-server-ip jellyfin.danger
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
Client Request → CoreDNS (172.21.0.4:5353) → NextDNS (3ca9ab.dns.nextdns.io) via DNS-over-TLS
                     ↓
               Local DNS Zone Files (.danger/.danger.diy domains)
                     ↓
               DNS Registrar (Auto-registration from Docker labels)
```

## Troubleshooting

**Check DNS Resolution:**
```bash
nslookup jellyfin.yourdomain.com your-server-ip  # Test local DNS
cat /data/local-dns/db.yourdomain.com            # Check zone file
```

**Check Service Logs:**
```bash
# docker logs dns-adguardhome-1  # AdGuard Home disabled
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
