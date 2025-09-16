# AdGuard Home Configuration for NextDNS Upstream

## Overview

AdGuard Home should be configured to use NextDNS servers as upstream DNS servers to complete the DNS chain:
`client -> CoreDNS -> AdGuard Home -> NextDNS`

## NextDNS Upstream Servers

Configure the following upstream DNS servers in AdGuard Home:

### DNS-over-HTTPS (Preferred)
```
https://dns.nextdns.io/3ca9ab
```

### DNS-over-TLS/QUIC
```
3ca9ab.dns.nextdns.io
```

### Plain DNS (Fallback)
```
45.90.28.145
45.90.30.145
```

### IPv6 (Optional)
```
2a07:a8c0::3c:a9ab
2a07:a8c1::3c:a9ab
```

## Configuration Steps

1. Access AdGuard Home web interface at `https://dns.danger`
2. Navigate to Settings → DNS settings
3. In the "Upstream DNS servers" section, add the following servers in order:

```
https://dns.nextdns.io/3ca9ab
3ca9ab.dns.nextdns.io
45.90.28.145
45.90.30.145
2a07:a8c0::3c:a9ab
2a07:a8c1::3c:a9ab
```

4. Enable "Use DNS-over-HTTPS for upstream servers when possible"
5. Set "Bootstrap DNS servers" to:
```
1.1.1.1
8.8.8.8
```

6. Configure "DNS cache settings":
   - Cache size: 4MB
   - Cache TTL override: 300 seconds (5 minutes)

7. Enable "Enable DNSSEC"

## Network Configuration

### With RaspAP Integration
- RaspAP dnsmasq listens on: `host:53` (primary DNS for clients)
- CoreDNS listens on: `host:5353` (for .danger domain resolution)
- AdGuard Home listens on: `172.21.0.2:53` (DNS network, for ad-blocking)
- DNS chain: `RaspAP (host:53) -> CoreDNS (host:5353) -> AdGuard (172.21.0.2:53) -> NextDNS`

### Legacy Configuration (without RaspAP)
- AdGuard Home listens on: `172.21.0.2:53` (DNS network)
- CoreDNS forwards to: `172.21.0.2:53`
- Clients should use: CoreDNS at port 53 (advertised by system DHCP)

## Testing

Test the DNS chain with:

```bash
# Test local domain resolution (should go through CoreDNS)
nslookup jellyfin.danger

# Test external domain resolution (should go through AdGuard -> NextDNS)
nslookup google.com

# Test DNS-over-HTTPS functionality
dig @127.0.0.1 google.com
```

## Troubleshooting

- Check AdGuard Home logs for upstream connection issues
- Verify NextDNS configuration ID (3ca9ab) is correct
- Ensure DNS network connectivity between containers
- Test individual upstream servers if issues occur
