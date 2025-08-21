# DangerPrep Service Integration Specifications - Cleanroom Implementation

## Network Services Integration

### hostapd (WiFi Access Point)

#### Configuration Template
```bash
# /etc/hostapd/hostapd.conf
interface={{WIFI_INTERFACE}}
driver=nl80211
ssid={{WIFI_SSID}}
hw_mode=g
channel=6
country_code=US

# Security settings
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK WPA-PSK-SHA256 SAE
wpa_passphrase={{WIFI_PASSWORD}}
rsn_pairwise=CCMP

# WPA3 support
ieee80211w=2
sae_require_mfp=1

# Performance
wmm_enabled=1
ht_capab=[HT40][SHORT-GI-20][SHORT-GI-40]
ieee80211n=1

# Security
ap_isolate=1
ignore_broadcast_ssid=0
macaddr_acl=0
```

#### Service Management
```bash
# Enable and configure hostapd
systemctl stop hostapd
systemctl disable hostapd

# Configure default file
echo 'DAEMON_CONF="/etc/hostapd/hostapd.conf"' > /etc/default/hostapd

# Enable and start
systemctl enable hostapd
systemctl start hostapd
```

### dnsmasq (DHCP Server)

#### Minimal Configuration Template
```bash
# /etc/dnsmasq.conf - Minimal config for WiFi hotspot DHCP only
# DNS is handled by AdGuard Home

# Interface binding
interface={{WIFI_INTERFACE}}
bind-interfaces

# DHCP configuration
dhcp-range={{DHCP_START}},{{DHCP_END}},255.255.252.0,24h
dhcp-option=option:router,{{LAN_IP}}
dhcp-option=option:dns-server,{{LAN_IP}}

# Disable DNS server (AdGuard handles DNS)
port=0

# Logging
log-dhcp
log-facility=/var/log/dnsmasq.log
```

#### Service Integration
```bash
# Configure dnsmasq
systemctl stop dnsmasq
systemctl disable dnsmasq

# Apply configuration
systemctl enable dnsmasq
systemctl start dnsmasq
```

### Network Interface Configuration

#### Netplan Configuration Template
```yaml
# /etc/netplan/01-dangerprep-wan.yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    {{WAN_INTERFACE}}:
      dhcp4: true
      dhcp4-overrides:
        use-dns: false
      nameservers:
        addresses: [127.0.0.1]
  wifis:
    {{WIFI_INTERFACE}}:
      access-points: {}
      addresses: [{{LAN_IP}}/22]
```

#### Interface Management Functions
```bash
# Detect network interfaces
detect_network_interfaces() {
    # Detect ethernet interfaces
    local ethernet_interfaces=()
    while IFS= read -r interface; do
        ethernet_interfaces+=("$interface")
    done < <(ip link show | grep -E "^[0-9]+: (eth|enp|ens|enx)" | cut -d: -f2 | tr -d ' ')
    
    # Detect WiFi interfaces
    local wifi_interfaces=()
    while IFS= read -r interface; do
        wifi_interfaces+=("$interface")
    done < <(iw dev 2>/dev/null | grep Interface | awk '{print $2}')
    
    # Set global variables
    WAN_INTERFACE="${ethernet_interfaces[0]:-eth0}"
    WIFI_INTERFACE="${wifi_interfaces[0]:-wlan0}"
}

# Configure network interfaces
configure_network_services() {
    # Stop NetworkManager management of WiFi
    if command -v nmcli >/dev/null 2>&1; then
        nmcli device set "$WIFI_INTERFACE" managed no
    fi
    
    # Apply netplan configuration
    netplan apply
    
    # Configure IP forwarding
    echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
    sysctl -p
}
```

## DNS Services Integration

### AdGuard Home

#### Installation Process
```bash
install_adguard_home() {
    local adguard_version="v0.107.43"
    local adguard_url="https://github.com/AdguardTeam/AdGuardHome/releases/download/${adguard_version}/AdGuardHome_linux_arm64.tar.gz"
    
    # Download and install
    wget -O /tmp/adguard.tar.gz "$adguard_url"
    tar -xzf /tmp/adguard.tar.gz -C /tmp
    mv /tmp/AdGuardHome/AdGuardHome /usr/local/bin/
    chmod +x /usr/local/bin/AdGuardHome
    
    # Create user and directories
    useradd --system --home-dir /var/lib/adguardhome --shell /usr/sbin/nologin adguardhome
    mkdir -p /etc/adguardhome /var/lib/adguardhome
    chown adguardhome:adguardhome /etc/adguardhome /var/lib/adguardhome
}
```

#### Configuration Template
```yaml
# /etc/adguardhome/AdGuardHome.yaml
bind_host: 127.0.0.1
bind_port: 3000
users:
  - name: admin
    password: $2a$10$...  # bcrypt hash
auth_attempts: 5
block_auth_min: 15

http:
  pprof:
    port: 6060
    enabled: false
  address: 127.0.0.1:3000
  session_ttl: 720h

dns:
  bind_hosts:
    - 0.0.0.0
  port: 53
  statistics_interval: 90
  querylog_enabled: true
  querylog_file_enabled: true
  querylog_interval: 2160h
  querylog_size_memory: 1000
  anonymize_client_ip: false
  protection_enabled: true
  blocking_mode: default
  blocked_response_ttl: 10
  parental_block_host: family-block.dns.adguard.com
  safebrowsing_block_host: standard-block.dns.adguard.com
  rewrites: []
  blocked_services: []
  upstream_dns:
    - https://dns.nextdns.io/abc123
    - https://cloudflare-dns.com/dns-query
    - tls://1.1.1.1
  upstream_dns_file: ""
  bootstrap_dns:
    - 9.9.9.10
    - 149.112.112.10
    - 2620:fe::10
    - 2620:fe::fe:10
  all_servers: false
  fastest_addr: false
  fastest_timeout: 1s
  allowed_clients: []
  disallowed_clients: []
  blocked_hosts:
    - version.bind
    - id.server
    - hostname.bind
  cache_size: 4194304
  cache_ttl_min: 0
  cache_ttl_max: 0
  cache_optimistic: false
  bogus_nxdomain: []
  aaaa_disabled: false
  enable_dnssec: true
  edns_client_subnet:
    custom_ip: ""
    enabled: false
    use_custom: false
  max_goroutines: 300
  handle_ddr: true
  ipset: []
  ipset_file: ""
  filtering_enabled: true
  filters_update_interval: 24
  parental_enabled: false
  safesearch_enabled: false
  safebrowsing_enabled: false
  safebrowsing_cache_size: 1048576
  safesearch_cache_size: 1048576
  parental_cache_size: 1048576
  cache_time: 30
  safe_search:
    enabled: false
    bing: true
    duckduckgo: true
    google: true
    pixabay: true
    yandex: true
    youtube: true
  rewrites: []
  blocked_services: []
  upstream_timeout: 10s
  private_networks: []
  use_private_ptr_resolvers: true
  local_ptr_upstreams: []
  use_dns64: false
  dns64_prefixes: []
  serve_http3: false
  use_http3_upstreams: false

tls:
  enabled: false
  server_name: ""
  force_https: false
  port_https: 443
  port_dns_over_tls: 853
  port_dns_over_quic: 853
  port_dnscrypt: 0
  dnscrypt_config_file: ""
  allow_unencrypted_doh: false
  certificate_chain: ""
  private_key: ""
  certificate_path: ""
  private_key_path: ""
  strict_sni_check: false

filters:
  - enabled: true
    url: https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt
    name: AdGuard DNS filter
    id: 1
  - enabled: true
    url: https://adaway.org/hosts.txt
    name: AdAway Default Blocklist
    id: 2

whitelist_filters: []

user_rules: []

dhcp:
  enabled: false

clients:
  runtime_sources:
    whois: true
    arp: true
    rdns: true
    dhcp: true
    hosts: true
  persistent: []

log_file: ""
log_max_backups: 0
log_max_size: 100
log_max_age: 3
log_compress: false
log_localtime: false
verbose: false
os:
  group: ""
  user: ""
  rlimit_nofile: 0
schema_version: 20
```

#### Systemd Service Template
```ini
# /etc/systemd/system/adguardhome.service
[Unit]
Description=AdGuard Home: Network-level blocker
After=network.target
StartLimitIntervalSec=5
StartLimitBurst=10

[Service]
Type=simple
User=adguardhome
Group=adguardhome
WorkingDirectory=/var/lib/adguardhome
ExecStart=/usr/local/bin/AdGuardHome --config /etc/adguardhome/AdGuardHome.yaml --work-dir /var/lib/adguardhome
Restart=always
RestartSec=10

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/adguardhome /etc/adguardhome
CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_NET_RAW
AmbientCapabilities=CAP_NET_BIND_SERVICE CAP_NET_RAW

[Install]
WantedBy=multi-user.target
```

### systemd-resolved Integration

#### Configuration Template
```ini
# /etc/systemd/resolved.conf.d/adguard.conf
[Resolve]
DNS=127.0.0.1
DNSStubListener=no
Cache=no
```

#### Integration Process
```bash
configure_systemd_resolved() {
    # Configure systemd-resolved to use AdGuard
    mkdir -p /etc/systemd/resolved.conf.d
    process_template "$CONFIG_DIR/dns/systemd-resolved-adguard.conf.tmpl" \
                    "/etc/systemd/resolved.conf.d/adguard.conf"
    
    # Restart systemd-resolved
    systemctl restart systemd-resolved
    
    # Update /etc/resolv.conf
    ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
}
```

## Certificate Management Integration

### Step-CA (Certificate Authority)

#### Installation Process
```bash
install_step_ca() {
    local step_version="0.25.2"
    local step_ca_version="0.25.2"
    
    # Download step CLI
    wget -O /tmp/step.tar.gz \
        "https://github.com/smallstep/cli/releases/download/v${step_version}/step_linux_${step_version}_arm64.tar.gz"
    tar -xzf /tmp/step.tar.gz -C /tmp
    mv "/tmp/step_${step_version}/bin/step" /usr/local/bin/
    
    # Download step-ca
    wget -O /tmp/step-ca.tar.gz \
        "https://github.com/smallstep/certificates/releases/download/v${step_ca_version}/step-ca_linux_${step_ca_version}_arm64.tar.gz"
    tar -xzf /tmp/step-ca.tar.gz -C /tmp
    mv "/tmp/step-ca_${step_ca_version}/bin/step-ca" /usr/local/bin/
    
    # Set permissions
    chmod +x /usr/local/bin/step /usr/local/bin/step-ca
}
```

#### CA Initialization
```bash
initialize_step_ca() {
    # Create step user
    useradd --system --home-dir /var/lib/step --shell /usr/sbin/nologin step
    
    # Initialize CA
    sudo -u step step ca init \
        --name "DangerPrep CA" \
        --dns "step-ca.danger" \
        --address ":9000" \
        --provisioner "admin" \
        --password-file /dev/stdin <<< "$(generate_ca_password)"
    
    # Configure ACME provisioner
    sudo -u step step ca provisioner add acme --type ACME
}
```

#### Systemd Service Template
```ini
# /etc/systemd/system/step-ca.service
[Unit]
Description=Step-CA Certificate Authority
Documentation=https://smallstep.com/docs/step-ca
Documentation=https://smallstep.com/docs/step-ca/certificate-authority-server-production
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=30
StartLimitBurst=3
ConditionFileNotEmpty=/var/lib/step/config/ca.json

[Service]
Type=simple
User=step
Group=step
Environment=STEPPATH=/var/lib/step
WorkingDirectory=/var/lib/step
ExecStart=/usr/local/bin/step-ca config/ca.json --password-file config/password.txt
ExecReload=/bin/kill -USR1 $MAINPID
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
StartLimitInterval=30
StartLimitBurst=3

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/step
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```

## Olares Integration

### System Requirements Check
```bash
check_olares_requirements() {
    local requirements_met=true
    
    # Check memory (2GB minimum)
    local total_memory
    total_memory=$(free -m | awk '/^Mem:/{print $2}')
    if [[ ${total_memory} -lt 2048 ]]; then
        error "Insufficient memory for Olares: ${total_memory}MB available, 2GB required"
        requirements_met=false
    fi
    
    # Check CPU cores (2 minimum)
    local cpu_cores
    cpu_cores=$(nproc)
    if [[ ${cpu_cores} -lt 2 ]]; then
        error "Insufficient CPU cores for Olares: ${cpu_cores} available, 2 required"
        requirements_met=false
    fi
    
    # Check disk space (20GB minimum)
    local available_disk
    available_disk=$(df / | awk 'NR==2{print int($4/1024/1024)}')
    if [[ ${available_disk} -lt 20 ]]; then
        error "Insufficient disk space for Olares: ${available_disk}GB available, 20GB required"
        requirements_met=false
    fi
    
    [[ "$requirements_met" == true ]]
}
```

### Olares Installation Process
```bash
install_olares() {
    log "Installing Olares..."
    
    # Download Olares installer
    curl -fsSL https://olares.sh | bash -s -- --version latest
    
    # Wait for installation to complete
    while ! command -v olares-cli >/dev/null 2>&1; do
        sleep 5
    done
    
    # Configure Olares integration with DangerPrep
    configure_olares_integration
}

configure_olares_integration() {
    # Configure Olares to use DangerPrep network
    # This involves configuring K3s networking to work with our setup
    
    # Ensure Olares uses our DNS configuration
    if [[ -f /etc/rancher/k3s/k3s.yaml ]]; then
        # Configure K3s to use our DNS
        echo "cluster-dns: 192.168.120.1" >> /etc/rancher/k3s/k3s.yaml
    fi
}
```

## Service Startup Sequence

### Service Dependencies
```bash
# Service startup order
SERVICE_STARTUP_ORDER=(
    "systemd-resolved"
    "adguardhome"
    "step-ca"
    "hostapd"
    "dnsmasq"
    "fail2ban"
    "k3s"  # Olares
)

# Start all services in order
start_all_services() {
    for service in "${SERVICE_STARTUP_ORDER[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            log "Starting $service..."
            if systemctl start "$service"; then
                success "Started $service"
            else
                error "Failed to start $service"
                return 1
            fi
        fi
    done
}
```

### Service Health Checks
```bash
# Verify service functionality
verify_services() {
    # Check AdGuard Home
    if ! curl -s http://127.0.0.1:3000/control/status >/dev/null; then
        error "AdGuard Home is not responding"
        return 1
    fi
    
    # Check Step-CA
    if ! curl -s https://127.0.0.1:9000/health >/dev/null; then
        error "Step-CA is not responding"
        return 1
    fi
    
    # Check hostapd
    if ! systemctl is-active --quiet hostapd; then
        error "hostapd is not running"
        return 1
    fi
    
    # Check dnsmasq
    if ! systemctl is-active --quiet dnsmasq; then
        error "dnsmasq is not running"
        return 1
    fi
    
    success "All services are running correctly"
}
```
