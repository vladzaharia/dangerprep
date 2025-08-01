# DNS Infrastructure

This directory contains the DNS infrastructure for DangerPrep, including AdGuard Home for ad-blocking and a local DNS server for internal domain resolution.

## Components

### AdGuard Home (`adguardhome` service)

- **Purpose**: Ad-blocking and DNS filtering
- **Port**: 53 (DNS), 3000 (Web Interface)
- **Access**: `https://dns.${DOMAIN_NAME}`

### CoreDNS (`coredns` service)

- **Purpose**: Internal domain resolution
- **Port**: 5353 (Alternative DNS)
- **Configuration**: Managed by registrar service

### DNS Registrar (`registrar` service)

- **Purpose**: Watches Docker labels and updates DNS records
- **Function**: Automatically registers services with `dns.register` labels

## Quick Start

1. **Configure Environment**:
   ```bash
   # Edit compose.dns.env with your values
   nano compose.dns.env
   ```

2. **Deploy**:
   ```bash
   docker compose up -d
   ```

3. **Setup AdGuard**:
   - Access `http://your-server-ip:3000`
   - Follow setup wizard
   - Set upstream DNS to `172.20.0.4:53`

## Service Registration

Services automatically register DNS entries using labels:

```yaml
labels:
  - "dns.register=myservice.${DOMAIN_NAME}"
```

This creates a DNS record: `myservice.yourdomain.com → service-ip`

## Network Architecture

```
Client Request
    ↓
AdGuard Home (172.20.0.2:53)
    ↓ (for local domains)
CoreDNS (172.20.0.4:53)
    ↓ (reads zone file)
DNS Zone File (/data/local-dns/db.yourdomain.com)
    ↓ (managed by)
DNS Registrar (watches Docker labels)
```

## Configuration Files

- **Corefile**: CoreDNS configuration
- **scripts/dns-registrar.sh**: DNS registration logic
- **compose.yml**: Service definitions
- **compose.dns.env**: Environment variables

## Troubleshooting

### Check DNS Resolution
```bash
# Test local DNS
nslookup jellyfin.yourdomain.com your-server-ip

# Check zone file
cat /data/local-dns/db.yourdomain.com
```

### Check Service Logs
```bash
docker logs dns-adguardhome-1
docker logs dns-coredns-1
docker logs dns-registrar-1
```

### Manual DNS Records
Edit `/data/local-dns/db.yourdomain.com` and reload CoreDNS:
```bash
# Find the CoreDNS container name
docker ps --format "{{.Names}}" | grep coredns
# Reload configuration
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
