#!/bin/bash
# DangerPrep Comprehensive Setup Script
# Complete system setup for Ubuntu 24.04 with 2025 security hardening
# Configures WiFi hotspot, routing, Docker services, and security

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# Configuration variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
LOG_FILE="/var/log/dangerprep-setup.log"
BACKUP_DIR="/var/backups/dangerprep-$(date +%Y%m%d-%H%M%S)"

# Network configuration
WIFI_SSID="DangerPrep"
WIFI_PASSWORD="Buff00n!"
LAN_NETWORK="192.168.120.0/22"
LAN_IP="192.168.120.1"
DHCP_START="192.168.120.100"
DHCP_END="192.168.120.200"

# System configuration
SSH_PORT="2222"
FAIL2BAN_BANTIME="3600"
FAIL2BAN_MAXRETRY="3"

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root (use sudo)"
        echo "Usage: sudo $0"
        exit 1
    fi
}

# Create backup directory and log file
setup_logging() {
    mkdir -p "$BACKUP_DIR"
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    chmod 640 "$LOG_FILE"
    
    log "DangerPrep Setup Started"
    log "Backup directory: $BACKUP_DIR"
    log "Install root: $INSTALL_ROOT"
    log "Project root: $PROJECT_ROOT"
}

# Display banner
show_banner() {
    echo -e "${PURPLE}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                           DangerPrep Setup 2025                             ║
║                    Emergency Router & Content Hub                           ║
║                                                                              ║
║  • WiFi Hotspot: DangerPrep (WPA2)                                         ║
║  • Network: 192.168.120.0/22                                               ║
║  • Security: 2025 Hardening Standards                                      ║
║  • Services: Docker + Traefik + Sync                                       ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# System information
show_system_info() {
    log "System Information:"
    echo "  OS: $(lsb_release -d 2>/dev/null | cut -f2 || echo "Unknown")"
    echo "  Kernel: $(uname -r)"
    echo "  Architecture: $(uname -m)"
    echo "  Hostname: $(hostname)"
    echo "  Memory: $(free -h | awk 'NR==2{print $2}')"
    echo "  Storage: $(df -h / | awk 'NR==2{print $2 " total, " $4 " available"}')"
    
    # Detect platform
    local ethernet_count=$(ip link show | grep -c "^[0-9]*: en")
    if [[ $ethernet_count -eq 2 ]]; then
        PLATFORM="R6C"
        info "Detected: NanoPi R6C (dual Ethernet)"
    elif [[ $ethernet_count -eq 1 ]]; then
        PLATFORM="M6"
        info "Detected: NanoPi M6 (single Ethernet)"
    else
        PLATFORM="unknown"
        warning "Unknown platform detected"
    fi
    
    export PLATFORM
}

# Pre-flight checks
pre_flight_checks() {
    log "Running pre-flight checks..."
    
    # Check Ubuntu version
    if ! grep -q "Ubuntu 24.04" /etc/os-release 2>/dev/null; then
        warning "Not running Ubuntu 24.04 - some features may not work correctly"
    fi
    
    # Check available storage
    local available_gb=$(df "$INSTALL_ROOT" 2>/dev/null | awk 'NR==2 {print int($4/1024/1024)}' || echo "0")
    if [[ $available_gb -lt 20 ]]; then
        error "Insufficient storage space. Need at least 20GB, have ${available_gb}GB"
        exit 1
    fi
    
    # Check memory
    local mem_gb=$(free -g | awk 'NR==2{print $2}')
    if [[ $mem_gb -lt 2 ]]; then
        warning "Low memory detected (${mem_gb}GB). Performance may be affected."
    fi
    
    # Check internet connectivity
    if ! ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        warning "No internet connectivity detected. Some features may not work."
    fi
    
    success "Pre-flight checks completed"
}

# Backup original configurations
backup_original_configs() {
    log "Backing up original configurations..."
    
    # System configurations
    [[ -f /etc/ssh/sshd_config ]] && cp /etc/ssh/sshd_config "$BACKUP_DIR/"
    [[ -f /etc/sysctl.conf ]] && cp /etc/sysctl.conf "$BACKUP_DIR/"
    [[ -f /etc/dnsmasq.conf ]] && cp /etc/dnsmasq.conf "$BACKUP_DIR/"
    [[ -f /etc/netplan/01-netcfg.yaml ]] && cp /etc/netplan/01-netcfg.yaml "$BACKUP_DIR/"
    
    # Firewall rules
    iptables-save > "$BACKUP_DIR/iptables.rules" 2>/dev/null || true
    
    success "Original configurations backed up to $BACKUP_DIR"
}

# Update system packages
update_system_packages() {
    log "Updating system packages..."

    # Update package lists
    apt update

    # Upgrade existing packages
    DEBIAN_FRONTEND=noninteractive apt upgrade -y

    success "System packages updated"
}

# Install essential packages
install_essential_packages() {
    log "Installing essential packages..."

    # Essential packages for DangerPrep
    local packages=(
        # Network tools
        "hostapd"                  # WiFi AP functionality
        "dnsmasq"                  # DNS/DHCP server
        "iptables-persistent"      # Firewall rules persistence
        "bridge-utils"             # Network bridging
        "wireless-tools"           # WiFi utilities
        "wpasupplicant"           # WiFi client authentication
        "iw"                      # WiFi configuration
        "rfkill"                  # Radio frequency management

        # Security tools
        "fail2ban"                # Intrusion prevention
        "ufw"                     # Uncomplicated Firewall
        "rkhunter"                # Rootkit hunter
        "chkrootkit"              # Rootkit checker
        "aide"                    # Advanced Intrusion Detection
        "auditd"                  # Audit daemon

        # System utilities
        "curl"                    # HTTP client
        "wget"                    # File downloader
        "rsync"                   # File synchronization
        "htop"                    # Process monitor
        "iotop"                   # I/O monitor
        "nethogs"                 # Network monitor
        "nano"                    # Text editor
        "vim"                     # Advanced text editor
        "bc"                      # Calculator
        "jq"                      # JSON processor
        "tree"                    # Directory tree viewer
        "unzip"                   # Archive extraction
        "git"                     # Version control

        # Container and virtualization
        "docker.io"               # Docker engine
        "docker-compose"          # Docker Compose
        "docker-buildx"           # Docker buildx

        # Storage and filesystem
        "nfs-common"              # NFS client
        "smartmontools"           # Disk monitoring
        "parted"                  # Disk partitioning
        "lvm2"                    # Logical volume management

        # Monitoring and logging
        "logrotate"               # Log rotation
        "rsyslog"                 # System logging
        "systemd-journal-remote"  # Journal management

        # Hardware support
        "linux-firmware"          # Hardware firmware
        "firmware-realtek"        # Realtek WiFi firmware

        # Performance tools
        "sysstat"                 # System statistics
        "iftop"                   # Network bandwidth monitor
        "nload"                   # Network load monitor

        # Security hardening
        "apparmor"                # Application armor
        "apparmor-utils"          # AppArmor utilities
        "libpam-pwquality"        # Password quality
        "libpam-tmpdir"           # Temporary directory isolation

        # Advanced security tools
        "aide"                    # Advanced Intrusion Detection Environment
        "rkhunter"                # Rootkit hunter
        "chkrootkit"              # Rootkit checker
        "clamav"                  # Antivirus scanner
        "clamav-daemon"           # ClamAV daemon
        "lynis"                   # Security auditing tool
        "ossec-hids"              # Host-based intrusion detection (if available)

        # Additional monitoring
        "acct"                    # Process accounting
        "psacct"                  # Process accounting utilities
    )

    # Install packages with error handling
    local failed_packages=()
    for package in "${packages[@]}"; do
        log "Installing $package..."
        if DEBIAN_FRONTEND=noninteractive apt install -y "$package" 2>/dev/null; then
            success "Installed $package"
        else
            warning "Failed to install $package"
            failed_packages+=("$package")
        fi
    done

    # Report failed packages
    if [[ ${#failed_packages[@]} -gt 0 ]]; then
        warning "Failed to install packages: ${failed_packages[*]}"
        log "These packages may not be available in the current repository"
    fi

    # Clean up package cache
    apt autoremove -y
    apt autoclean

    success "Essential packages installation completed"
}

# Configure automatic security updates
setup_automatic_updates() {
    log "Configuring automatic security updates..."

    # Install unattended-upgrades
    DEBIAN_FRONTEND=noninteractive apt install -y unattended-upgrades

    # Configure unattended-upgrades
    cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
// Automatically upgrade packages from these (origin:archive) pairs
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

// Remove unused automatically installed kernel-related packages
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";

// Remove new unused dependencies after the upgrade
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";

// Remove unused dependencies after the upgrade
Unattended-Upgrade::Remove-Unused-Dependencies "true";

// Automatically reboot *WITHOUT CONFIRMATION* if the file /var/run/reboot-required is found after the upgrade
Unattended-Upgrade::Automatic-Reboot "false";

// Automatically reboot even if there are users currently logged in when Unattended-Upgrade::Automatic-Reboot is set to true
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";

// If automatic reboot is enabled and needed, reboot at the specific time instead of immediately
//Unattended-Upgrade::Automatic-Reboot-Time "02:00";

// Enable logging to syslog
Unattended-Upgrade::SyslogEnable "true";
EOF

    # Enable automatic updates
    cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

    # Enable and start the service
    systemctl enable unattended-upgrades
    systemctl start unattended-upgrades

    success "Automatic security updates configured"
}

# Configure SSH hardening
configure_ssh_hardening() {
    log "Configuring SSH hardening..."

    # Backup original SSH config
    cp /etc/ssh/sshd_config "$BACKUP_DIR/sshd_config.original"

    # Create hardened SSH configuration
    cat > /etc/ssh/sshd_config << EOF
# DangerPrep SSH Configuration - Hardened for 2025
# Port changed from default 22 for security
Port $SSH_PORT

# Protocol and encryption
Protocol 2
HostKey /etc/ssh/ssh_host_rsa_key
HostKey /etc/ssh/ssh_host_ecdsa_key
HostKey /etc/ssh/ssh_host_ed25519_key

# Ciphers and algorithms (secure 2025 standards)
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com,hmac-sha2-256,hmac-sha2-512
KexAlgorithms curve25519-sha256@libssh.org,ecdh-sha2-nistp521,ecdh-sha2-nistp384,ecdh-sha2-nistp256,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512

# Authentication
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes

# Connection settings
MaxAuthTries 3
MaxSessions 2
MaxStartups 2:30:10
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2

# Restrictions
AllowUsers ubuntu
DenyUsers root
AllowGroups sudo
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
PermitTunnel no
GatewayPorts no

# Logging
SyslogFacility AUTH
LogLevel VERBOSE

# Banner
Banner /etc/ssh/ssh_banner
EOF

    # Create SSH banner
    cat > /etc/ssh/ssh_banner << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                              DangerPrep System                              ║
║                         Authorized Access Only                              ║
║                                                                              ║
║  This system is for authorized users only. All activities are monitored     ║
║  and logged. Unauthorized access is prohibited and will be prosecuted.      ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF

    # Set proper permissions
    chmod 644 /etc/ssh/sshd_config
    chmod 644 /etc/ssh/ssh_banner

    # Test SSH configuration
    if sshd -t; then
        success "SSH configuration is valid"
        systemctl restart ssh
        success "SSH service restarted on port $SSH_PORT"
    else
        error "SSH configuration is invalid, restoring backup"
        cp "$BACKUP_DIR/sshd_config.original" /etc/ssh/sshd_config
        systemctl restart ssh
        exit 1
    fi

    info "SSH is now configured on port $SSH_PORT with key-only authentication"
}

# Setup fail2ban
setup_fail2ban() {
    log "Setting up fail2ban..."

    # Create fail2ban local configuration
    cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
# Ban settings
bantime = $FAIL2BAN_BANTIME
findtime = 600
maxretry = $FAIL2BAN_MAXRETRY
backend = systemd

# Email notifications (disabled by default)
destemail = root@localhost
sendername = Fail2Ban
mta = sendmail

# Action
action = %(action_mwl)s

[sshd]
enabled = true
port = $SSH_PORT
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 10

[nginx-botsearch]
enabled = true
filter = nginx-botsearch
logpath = /var/log/nginx/access.log
maxretry = 2

[recidive]
enabled = true
filter = recidive
logpath = /var/log/fail2ban.log
action = %(action_mwl)s
bantime = 86400
findtime = 86400
maxretry = 5
EOF

    # Create custom filters
    mkdir -p /etc/fail2ban/filter.d

    # Nginx bot search filter
    cat > /etc/fail2ban/filter.d/nginx-botsearch.conf << 'EOF'
[Definition]
failregex = ^<HOST> -.*"(GET|POST).*/(admin|wp-admin|wp-login|phpmyadmin|mysql|sql|database|config|setup|install|administrator|login|signin|auth).*" (404|403|401) .*$
ignoreregex =
EOF

    # Enable and start fail2ban
    systemctl enable fail2ban
    systemctl start fail2ban

    success "Fail2ban configured and started"
}

# Configure kernel hardening
configure_kernel_hardening() {
    log "Configuring kernel hardening parameters..."

    # Backup original sysctl.conf
    cp /etc/sysctl.conf "$BACKUP_DIR/sysctl.conf.original"

    # Create hardened sysctl configuration
    cat >> /etc/sysctl.conf << 'EOF'

# DangerPrep Kernel Hardening Configuration

# Network Security
net.ipv4.ip_forward = 1
net.ipv4.conf.all.forwarding = 1
net.ipv6.conf.all.forwarding = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

# IP Spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP ping requests
net.ipv4.icmp_echo_ignore_all = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Ignore bogus ICMP errors
net.ipv4.icmp_ignore_bogus_error_responses = 1

# SYN flood protection
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 5

# Log Martians
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# Memory protection
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.yama.ptrace_scope = 1

# File system hardening
fs.suid_dumpable = 0
fs.protected_hardlinks = 1
fs.protected_symlinks = 1

# Process restrictions
kernel.core_uses_pid = 1
kernel.ctrl-alt-del = 0

# Network performance and security
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_window_scaling = 1
net.ipv4.tcp_timestamps = 0
net.ipv4.tcp_sack = 1
net.ipv4.tcp_no_metrics_save = 1
net.ipv4.route.flush = 1
net.ipv6.route.flush = 1
EOF

    # Apply sysctl settings
    sysctl -p

    success "Kernel hardening parameters applied"
}

# Setup file integrity monitoring with AIDE
setup_file_integrity_monitoring() {
    log "Setting up file integrity monitoring with AIDE..."

    # Initialize AIDE database
    log "Initializing AIDE database (this may take several minutes)..."
    aide --init

    # Move the new database to the correct location
    if [[ -f /var/lib/aide/aide.db.new ]]; then
        mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db
    fi

    # Create AIDE configuration for DangerPrep
    cat >> /etc/aide/aide.conf << 'EOF'

# DangerPrep specific monitoring rules
/etc/dangerprep p+i+n+u+g+s+b+m+c+md5+sha1+rmd160
/usr/local/bin/dangerprep* p+i+n+u+g+s+b+m+c+md5+sha1+rmd160
/etc/ssh/sshd_config p+i+n+u+g+s+b+m+c+md5+sha1+rmd160
/etc/hostapd p+i+n+u+g+s+b+m+c+md5+sha1+rmd160
/etc/dnsmasq.conf p+i+n+u+g+s+b+m+c+md5+sha1+rmd160
/etc/cloudflared p+i+n+u+g+s+b+m+c+md5+sha1+rmd160
EOF

    # Create daily AIDE check script
    cat > /usr/local/bin/dangerprep-aide-check << 'EOF'
#!/bin/bash
# DangerPrep AIDE integrity check

LOG_FILE="/var/log/aide-check.log"
AIDE_REPORT="/tmp/aide-report-$(date +%Y%m%d-%H%M%S).txt"

echo "[$(date)] Starting AIDE integrity check..." >> "$LOG_FILE"

if aide --check > "$AIDE_REPORT" 2>&1; then
    echo "[$(date)] AIDE check completed - no changes detected" >> "$LOG_FILE"
else
    echo "[$(date)] AIDE check detected changes:" >> "$LOG_FILE"
    cat "$AIDE_REPORT" >> "$LOG_FILE"

    # Alert about changes (could integrate with monitoring system)
    echo "AIDE detected file system changes on $(hostname)" | \
        logger -t "AIDE-ALERT" -p security.warning
fi

# Clean up old reports (keep last 7 days)
find /tmp -name "aide-report-*.txt" -mtime +7 -delete 2>/dev/null || true
EOF
    chmod +x /usr/local/bin/dangerprep-aide-check

    # Add to cron for daily checks
    cat > /etc/cron.d/aide-check << 'EOF'
# AIDE integrity check - daily at 3 AM
0 3 * * * root /usr/local/bin/dangerprep-aide-check
EOF

    success "File integrity monitoring configured"
}

# Setup advanced security tools
setup_advanced_security_tools() {
    log "Setting up advanced security tools..."

    # Configure ClamAV antivirus
    if command -v clamscan >/dev/null 2>&1; then
        log "Configuring ClamAV antivirus..."

        # Update virus definitions
        freshclam || warning "Failed to update ClamAV definitions"

        # Create daily scan script
        cat > /usr/local/bin/dangerprep-antivirus-scan << 'EOF'
#!/bin/bash
# DangerPrep antivirus scan

SCAN_LOG="/var/log/clamav-scan.log"
SCAN_DIRS="/home /etc /usr/local/bin /opt/dangerprep"

echo "[$(date)] Starting antivirus scan..." >> "$SCAN_LOG"

for dir in $SCAN_DIRS; do
    if [[ -d "$dir" ]]; then
        echo "[$(date)] Scanning $dir..." >> "$SCAN_LOG"
        clamscan -r --infected --log="$SCAN_LOG" "$dir" || true
    fi
done

echo "[$(date)] Antivirus scan completed" >> "$SCAN_LOG"
EOF
        chmod +x /usr/local/bin/dangerprep-antivirus-scan

        # Add to weekly cron
        cat > /etc/cron.d/antivirus-scan << 'EOF'
# ClamAV antivirus scan - weekly on Sunday at 2 AM
0 2 * * 0 root /usr/local/bin/dangerprep-antivirus-scan
EOF

        success "ClamAV configured"
    fi

    # Configure Lynis security auditing
    if command -v lynis >/dev/null 2>&1; then
        log "Configuring Lynis security auditing..."

        # Create monthly security audit script
        cat > /usr/local/bin/dangerprep-security-audit << 'EOF'
#!/bin/bash
# DangerPrep security audit with Lynis

AUDIT_LOG="/var/log/lynis-audit.log"
AUDIT_REPORT="/tmp/lynis-report-$(date +%Y%m%d-%H%M%S).txt"

echo "[$(date)] Starting security audit..." >> "$AUDIT_LOG"

lynis audit system --quick --log-file "$AUDIT_REPORT" >> "$AUDIT_LOG" 2>&1

echo "[$(date)] Security audit completed. Report: $AUDIT_REPORT" >> "$AUDIT_LOG"

# Clean up old reports (keep last 3 months)
find /tmp -name "lynis-report-*.txt" -mtime +90 -delete 2>/dev/null || true
EOF
        chmod +x /usr/local/bin/dangerprep-security-audit

        # Add to monthly cron
        cat > /etc/cron.d/security-audit << 'EOF'
# Lynis security audit - monthly on 1st at 1 AM
0 1 1 * * root /usr/local/bin/dangerprep-security-audit
EOF

        success "Lynis security auditing configured"
    fi

    # Configure rkhunter
    if command -v rkhunter >/dev/null 2>&1; then
        log "Configuring rkhunter..."

        # Update rkhunter database
        rkhunter --update || warning "Failed to update rkhunter database"

        # Initial properties file
        rkhunter --propupd || warning "Failed to update rkhunter properties"

        # Create weekly rootkit scan
        cat > /usr/local/bin/dangerprep-rootkit-scan << 'EOF'
#!/bin/bash
# DangerPrep rootkit scan

SCAN_LOG="/var/log/rkhunter-scan.log"

echo "[$(date)] Starting rootkit scan..." >> "$SCAN_LOG"

rkhunter --check --skip-keypress --report-warnings-only >> "$SCAN_LOG" 2>&1

echo "[$(date)] Rootkit scan completed" >> "$SCAN_LOG"
EOF
        chmod +x /usr/local/bin/dangerprep-rootkit-scan

        # Add to weekly cron
        cat > /etc/cron.d/rootkit-scan << 'EOF'
# Rootkit scan - weekly on Saturday at 1 AM
0 1 * * 6 root /usr/local/bin/dangerprep-rootkit-scan
EOF

        success "Rkhunter configured"
    fi

    success "Advanced security tools configured"
}

# Configure rootless Docker
configure_rootless_docker() {
    log "Configuring rootless Docker..."

    # Check if rootless Docker is already configured
    if [[ -f /home/ubuntu/.config/systemd/user/docker.service ]]; then
        log "Rootless Docker already configured"
        return 0
    fi

    # Install rootless Docker for ubuntu user
    log "Setting up rootless Docker for ubuntu user..."

    # Install uidmap if not present
    if ! command -v newuidmap >/dev/null 2>&1; then
        apt install -y uidmap
    fi

    # Configure subuid and subgid for ubuntu user
    if ! grep -q "^ubuntu:" /etc/subuid; then
        echo "ubuntu:100000:65536" >> /etc/subuid
    fi
    if ! grep -q "^ubuntu:" /etc/subgid; then
        echo "ubuntu:100000:65536" >> /etc/subgid
    fi

    # Install rootless Docker as ubuntu user
    sudo -u ubuntu bash << 'EOF'
# Download and install rootless Docker
curl -fsSL https://get.docker.com/rootless | sh

# Add Docker rootless to PATH
echo 'export PATH=/home/ubuntu/bin:$PATH' >> /home/ubuntu/.bashrc
echo 'export DOCKER_HOST=unix:///run/user/1000/docker.sock' >> /home/ubuntu/.bashrc

# Enable Docker rootless service
systemctl --user enable docker
systemctl --user start docker
EOF

    # Create systemd service for rootless Docker
    sudo -u ubuntu mkdir -p /home/ubuntu/.config/systemd/user

    # Enable lingering for ubuntu user (allows user services to run without login)
    loginctl enable-linger ubuntu

    success "Rootless Docker configured for ubuntu user"
    info "Note: Use 'sudo -u ubuntu docker' commands or switch to ubuntu user for rootless Docker"
}

# Detect network interfaces and platform
detect_network_interfaces() {
    log "Detecting network interfaces..."

    # Create configuration directory
    mkdir -p /etc/dangerprep

    # Detect Ethernet interfaces
    local ethernet_interfaces=($(ip link show | grep -E "^[0-9]+: en" | cut -d: -f2 | tr -d ' '))
    local wifi_interfaces=($(iw dev 2>/dev/null | grep Interface | awk '{print $2}' || echo))

    log "Network Interface Detection:"
    echo "  Ethernet interfaces: ${ethernet_interfaces[*]:-none}"
    echo "  WiFi interfaces: ${wifi_interfaces[*]:-none}"

    # Store interface information
    cat > /etc/dangerprep/interfaces.conf << EOF
# DangerPrep Network Interface Configuration
# Generated on $(date)

# Platform type
PLATFORM="$PLATFORM"

# Ethernet interfaces
ETHERNET_INTERFACES=(${ethernet_interfaces[*]})
ETHERNET_COUNT=${#ethernet_interfaces[@]}

# WiFi interfaces
WIFI_INTERFACES=(${wifi_interfaces[*]})
WIFI_COUNT=${#wifi_interfaces[@]}

# Primary interfaces (first detected)
PRIMARY_ETHERNET="${ethernet_interfaces[0]:-}"
PRIMARY_WIFI="${wifi_interfaces[0]:-wlan0}"
EOF

    # Set WAN interface based on platform
    if [[ ${#ethernet_interfaces[@]} -gt 0 ]]; then
        WAN_INTERFACE="${ethernet_interfaces[0]}"
        echo "WAN_INTERFACE=\"$WAN_INTERFACE\"" >> /etc/dangerprep/interfaces.conf
        info "WAN interface set to: $WAN_INTERFACE"
    else
        error "No Ethernet interfaces detected"
        exit 1
    fi

    # Set WiFi interface for AP
    if [[ ${#wifi_interfaces[@]} -gt 0 ]]; then
        WIFI_INTERFACE="${wifi_interfaces[0]}"
        echo "WIFI_INTERFACE=\"$WIFI_INTERFACE\"" >> /etc/dangerprep/interfaces.conf
        info "WiFi interface set to: $WIFI_INTERFACE"
    else
        error "No WiFi interfaces detected"
        exit 1
    fi

    # Export variables for use in other functions
    export WAN_INTERFACE WIFI_INTERFACE

    success "Network interfaces detected and configured"
}

# Configure WAN interface
configure_wan_interface() {
    log "Configuring WAN interface ($WAN_INTERFACE)..."

    # Backup existing netplan configuration
    [[ -f /etc/netplan/01-netcfg.yaml ]] && cp /etc/netplan/01-netcfg.yaml "$BACKUP_DIR/"

    # Create netplan configuration for WAN
    cat > /etc/netplan/01-dangerprep-wan.yaml << EOF
# DangerPrep WAN Configuration
network:
  version: 2
  renderer: NetworkManager
  ethernets:
    $WAN_INTERFACE:
      dhcp4: true
      dhcp6: false
      optional: true
      dhcp4-overrides:
        use-dns: true
        use-routes: true
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
          - 2606:4700:4700::1111
          - 2001:4860:4860::8888
EOF

    # Apply netplan configuration
    netplan apply

    # Wait for interface to come up
    sleep 5

    # Verify WAN connectivity
    local wan_ip=$(ip addr show "$WAN_INTERFACE" | grep "inet " | awk '{print $2}' | cut -d/ -f1)
    if [[ -n "$wan_ip" ]]; then
        success "WAN interface configured with IP: $wan_ip"
    else
        warning "WAN interface may not have received an IP address"
    fi

    success "WAN interface configuration completed"
}

# Setup network routing and NAT
setup_network_routing() {
    log "Setting up network routing and NAT..."

    # Enable IP forwarding (already set in sysctl.conf)
    echo 1 > /proc/sys/net/ipv4/ip_forward

    # Clear existing iptables rules
    iptables -F
    iptables -t nat -F
    iptables -t mangle -F
    iptables -X

    # Set default policies
    iptables -P INPUT DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT ACCEPT

    # Allow loopback traffic
    iptables -A INPUT -i lo -j ACCEPT
    iptables -A OUTPUT -o lo -j ACCEPT

    # Allow established and related connections
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT

    # Allow SSH on custom port (from any interface for now)
    iptables -A INPUT -p tcp --dport "$SSH_PORT" -j ACCEPT

    # Allow HTTP/HTTPS for services
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT

    # Allow DNS
    iptables -A INPUT -p tcp --dport 53 -j ACCEPT
    iptables -A INPUT -p udp --dport 53 -j ACCEPT

    # Allow DHCP
    iptables -A INPUT -p udp --dport 67 -j ACCEPT
    iptables -A INPUT -p udp --dport 68 -j ACCEPT

    # NAT configuration for internet sharing
    iptables -t nat -A POSTROUTING -o "$WAN_INTERFACE" -j MASQUERADE

    # Forward traffic from WiFi to WAN
    iptables -A FORWARD -i "$WIFI_INTERFACE" -o "$WAN_INTERFACE" -j ACCEPT
    iptables -A FORWARD -i "$WAN_INTERFACE" -o "$WIFI_INTERFACE" -m state --state ESTABLISHED,RELATED -j ACCEPT

    # Save iptables rules
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4

    # Enable iptables-persistent
    systemctl enable netfilter-persistent

    success "Network routing and NAT configured"
}

# Configure WiFi hotspot
configure_wifi_hotspot() {
    log "Configuring WiFi hotspot ($WIFI_INTERFACE)..."

    # Stop NetworkManager management of WiFi interface
    nmcli device set "$WIFI_INTERFACE" managed no

    # Bring up WiFi interface
    ip link set "$WIFI_INTERFACE" up

    # Set static IP for WiFi interface
    ip addr add "$LAN_IP/22" dev "$WIFI_INTERFACE"

    # Detect WiFi capabilities
    local wifi_capabilities=$(iw phy | grep -A 20 "Wiphy" | grep -E "(WPA3|SAE|OWE)" || echo "")
    local supports_wpa3=false

    if [[ -n "$wifi_capabilities" ]]; then
        supports_wpa3=true
        log "WiFi hardware supports WPA3"
    else
        log "WiFi hardware does not support WPA3, using WPA2"
    fi

    # Create hostapd configuration with enhanced security
    cat > /etc/hostapd/hostapd.conf << EOF
# DangerPrep WiFi Hotspot Configuration - Enhanced Security 2025
interface=$WIFI_INTERFACE
driver=nl80211
ssid=$WIFI_SSID
hw_mode=g
channel=7
wmm_enabled=1
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0

# Security configuration - WPA3 if supported, WPA2 fallback
EOF

    if [[ "$supports_wpa3" == "true" ]]; then
        cat >> /etc/hostapd/hostapd.conf << EOF
# WPA3 Configuration (SAE)
wpa=2
wpa_key_mgmt=SAE WPA-PSK
sae_password=$WIFI_PASSWORD
wpa_passphrase=$WIFI_PASSWORD
rsn_pairwise=CCMP
sae_groups=19 20 21
sae_require_mfp=1
ieee80211w=2
EOF
        success "Configured with WPA3 (SAE) security"
    else
        cat >> /etc/hostapd/hostapd.conf << EOF
# WPA2 Configuration (fallback)
wpa=2
wpa_passphrase=$WIFI_PASSWORD
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
ieee80211w=1
EOF
        success "Configured with WPA2 security (WPA3 not supported)"
    fi

    # Add common security settings
    cat >> /etc/hostapd/hostapd.conf << EOF

# Enhanced Security Settings
wpa_group_rekey=3600
wpa_strict_rekey=1
wpa_gmk_rekey=86400
wpa_ptk_rekey=600
wpa_disable_eapol_key_retries=1

# Client isolation for security
ap_isolate=1

# Country code and regulatory
country_code=US
ieee80211d=1
ieee80211h=1

# 802.11n settings
ieee80211n=1
require_ht=1
ht_capab=[HT40+][HT40-][SHORT-GI-20][SHORT-GI-40][DSSS_CCK-40]

# Additional security features
disassoc_low_ack=1
skip_inactivity_poll=0
max_num_sta=50
beacon_int=100
dtim_period=2

# Logging
logger_syslog=-1
logger_syslog_level=2
logger_stdout=-1
logger_stdout_level=2

# Management frame protection
group_mgmt_cipher=AES-128-CMAC
EOF

    # Set hostapd configuration path
    sed -i 's|#DAEMON_CONF=""|DAEMON_CONF="/etc/hostapd/hostapd.conf"|' /etc/default/hostapd

    # Enable and start hostapd
    systemctl unmask hostapd
    systemctl enable hostapd

    success "WiFi hotspot configured: $WIFI_SSID"
}

# Setup DHCP and DNS server
setup_dhcp_dns_server() {
    log "Setting up DHCP and DNS server..."

    # Backup original dnsmasq configuration
    [[ -f /etc/dnsmasq.conf ]] && cp /etc/dnsmasq.conf "$BACKUP_DIR/"

    # Create dnsmasq configuration
    cat > /etc/dnsmasq.conf << EOF
# DangerPrep DNS and DHCP Configuration

# Interface binding
interface=$WIFI_INTERFACE
bind-interfaces
listen-address=$LAN_IP

# DHCP configuration
dhcp-range=$DHCP_START,$DHCP_END,12h
dhcp-option=3,$LAN_IP  # Default gateway
dhcp-option=6,$LAN_IP  # DNS server

# DNS configuration
server=1.1.1.1
server=8.8.8.8
server=2606:4700:4700::1111
server=2001:4860:4860::8888

# Local domain resolution for Docker services
address=/traefik.danger/$LAN_IP
address=/portainer.danger/$LAN_IP
address=/jellyfin.danger/$LAN_IP
address=/komga.danger/$LAN_IP
address=/kiwix.danger/$LAN_IP
address=/portal.danger/$LAN_IP
address=/dns.danger/$LAN_IP

# Local domain
domain=dangerprep.local
expand-hosts

# Cache settings
cache-size=1000
neg-ttl=60

# Logging
log-queries
log-dhcp
log-facility=/var/log/dnsmasq.log

# Security
bogus-priv
domain-needed
stop-dns-rebind
rebind-localhost-ok

# Performance
dns-forward-max=150
EOF

    # Create log file
    touch /var/log/dnsmasq.log
    chown dnsmasq:nogroup /var/log/dnsmasq.log

    # Enable and start dnsmasq
    systemctl enable dnsmasq

    success "DHCP and DNS server configured"
}

# Configure WiFi client routing
configure_wifi_routing() {
    log "Configuring WiFi client routing..."

    # Allow WiFi clients to access internal services
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 443 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 53 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p udp --dport 53 -j ACCEPT
    iptables -A INPUT -i "$WIFI_INTERFACE" -p udp --dport 67 -j ACCEPT

    # Allow WiFi clients to access Docker services
    iptables -A INPUT -i "$WIFI_INTERFACE" -p tcp --dport 8080 -j ACCEPT  # Traefik dashboard

    # Allow ICMP for connectivity testing
    iptables -A INPUT -i "$WIFI_INTERFACE" -p icmp --icmp-type echo-request -j ACCEPT

    # Save updated iptables rules
    iptables-save > /etc/iptables/rules.v4

    success "WiFi client routing configured"
}

# Setup Docker services
setup_docker_services() {
    log "Setting up Docker services..."

    # Add user to docker group
    usermod -aG docker ubuntu 2>/dev/null || true

    # Create Docker daemon configuration for security
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json << 'EOF'
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2",
    "userland-proxy": false,
    "no-new-privileges": true,
    "seccomp-profile": "/etc/docker/seccomp.json",
    "default-ulimits": {
        "nofile": {
            "Name": "nofile",
            "Hard": 64000,
            "Soft": 64000
        }
    }
}
EOF

    # Enable and start Docker
    systemctl enable docker
    systemctl start docker

    # Create Docker networks
    docker network create traefik 2>/dev/null || true

    # Set up directory structure
    mkdir -p "$INSTALL_ROOT"/{docker,data,content,nfs}
    mkdir -p "$INSTALL_ROOT/data"/{traefik,portainer,jellyfin,komga,kiwix,logs,backups}
    mkdir -p "$INSTALL_ROOT/content"/{movies,tv,webtv,music,audiobooks,books,comics,magazines,games/roms,kiwix}

    # Copy Docker configurations if they exist
    if [[ -d "$PROJECT_ROOT/docker" ]]; then
        log "Copying Docker configurations..."
        cp -r "$PROJECT_ROOT"/docker/* "$INSTALL_ROOT"/docker/ 2>/dev/null || true
    fi

    # Set proper permissions
    chown -R 1000:1000 "$INSTALL_ROOT/data"
    chown -R 1000:1000 "$INSTALL_ROOT/content"
    chmod -R 755 "$INSTALL_ROOT"

    success "Docker services configured"
}

# Generate sync service configurations
generate_sync_configs() {
    log "Generating sync service configurations..."

    # Generate kiwix-sync config
    if [[ -d "$INSTALL_ROOT/docker/sync/kiwix-sync" ]]; then
        cat > "$INSTALL_ROOT/docker/sync/kiwix-sync/config.yaml" << 'EOF'
# Kiwix Manager Configuration - Auto-generated
service_name: "kiwix-sync"
version: "1.0.0"
enabled: true
log_level: "info"
data_directory: "/app/data"
temp_directory: "/tmp"
max_concurrent_operations: 2
operation_timeout_minutes: 60
health_check_interval_minutes: 10
enable_notifications: false
enable_progress_tracking: true
enable_auto_recovery: true

kiwix_manager:
  storage:
    zim_directory: "/content/kiwix"
    library_file: "/content/kiwix/library.xml"
    temp_directory: "/tmp/kiwix-downloads"
    max_total_size: "50GB"

  scheduler:
    update_schedule: "0 6 * * *"
    cleanup_schedule: "0 2 * * 0"
    check_interval_minutes: 60
    max_concurrent_downloads: 1
    bandwidth_limit: "10MB/s"

  mirrors:
    preferred: "https://mirrors.dotsrc.org/kiwix/"
    available:
      - "https://mirrors.dotsrc.org/kiwix/"
      - "https://download.kiwix.org/zim/"
    fallback: "https://download.kiwix.org/zim/"

  zim_files:
    - name: "wikipedia_en_top"
      priority: 1
      auto_update: true
    - name: "wikipedia_en_medicine"
      priority: 2
      auto_update: true
    - name: "wiktionary_en_all"
      priority: 3
      auto_update: false
EOF
        success "Generated kiwix-sync configuration"
    fi

    # Generate nfs-sync config
    if [[ -d "$INSTALL_ROOT/docker/sync/nfs-sync" ]]; then
        cat > "$INSTALL_ROOT/docker/sync/nfs-sync/config.yaml" << 'EOF'
# NFS Sync Configuration - Auto-generated
service_name: "nfs-sync"
version: "1.0.0"
enabled: true
log_level: "info"
data_directory: "/app/data"
temp_directory: "/tmp"
max_concurrent_operations: 2
operation_timeout_minutes: 30
health_check_interval_minutes: 10
enable_notifications: false
enable_progress_tracking: true
enable_auto_recovery: true

sync_config:
  central_nas:
    host: "100.65.182.27"
    nfs_shares:
      movies: "/mnt/data/polaris/movies"
      tv: "/mnt/data/polaris/tv"
      webtv: "/mnt/data/polaris/webtv"
      books: "/mnt/data/content/books"
      music: "/mnt/data/content/music"

  local_storage:
    base_path: "/content"
    max_total_size: "1500GB"

  content_types:
    books:
      type: "full_sync"
      schedule: "0 2 * * *"
      local_path: "/content/books"
      nfs_path: "/nfs/books"
      max_size: "10GB"

    movies:
      type: "metadata_filtered"
      schedule: "0 3 * * 0"
      local_path: "/content/movies"
      nfs_path: "/nfs/movies"
      max_size: "800GB"
      filters:
        - type: "year"
          operator: ">="
          value: 2015
        - type: "rating"
          operator: ">="
          value: 7.0
EOF
        success "Generated nfs-sync configuration"
    fi

    # Generate offline-sync config
    if [[ -d "$INSTALL_ROOT/docker/sync/offline-sync" ]]; then
        cat > "$INSTALL_ROOT/docker/sync/offline-sync/config.yaml" << 'EOF'
# Offline Sync Configuration - Auto-generated
service_name: "offline-sync"
version: "1.0.0"
enabled: true
log_level: "info"
data_directory: "/app/data"
temp_directory: "/tmp"
max_concurrent_operations: 2
operation_timeout_minutes: 30
health_check_interval_minutes: 10
enable_notifications: false
enable_progress_tracking: true
enable_auto_recovery: true

offline_sync:
  storage:
    mount_base: "/mnt/cards"
    max_card_size: "2TB"
    temp_directory: "/tmp/offline-sync"

  device_detection:
    scan_interval_seconds: 30
    supported_filesystems: ["exfat", "ntfs", "ext4", "fat32"]
    min_card_size: "1GB"

  content_types:
    movies:
      local_path: "/content/movies"
      card_path: "movies"
      sync_direction: "bidirectional"
      max_size: "800GB"
      file_extensions: [".mp4", ".mkv", ".avi", ".mov"]

    books:
      local_path: "/content/books"
      card_path: "books"
      sync_direction: "bidirectional"
      max_size: "10GB"
      file_extensions: [".epub", ".pdf", ".txt"]

    kiwix:
      local_path: "/content/kiwix"
      card_path: "kiwix"
      sync_direction: "bidirectional"
      max_size: "50GB"
      file_extensions: [".zim"]
EOF
        success "Generated offline-sync configuration"
    fi
}

# Setup Tailscale
setup_tailscale() {
    log "Setting up Tailscale..."

    # Add Tailscale repository
    curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
    curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list

    # Update and install Tailscale
    apt update
    DEBIAN_FRONTEND=noninteractive apt install -y tailscale

    # Enable Tailscale service
    systemctl enable tailscaled
    systemctl start tailscaled

    # Configure firewall for Tailscale
    iptables -A INPUT -p udp --dport 41641 -j ACCEPT
    iptables -A INPUT -i tailscale0 -j ACCEPT
    iptables -A FORWARD -i tailscale0 -j ACCEPT
    iptables -A FORWARD -o tailscale0 -j ACCEPT

    # Save firewall rules
    iptables-save > /etc/iptables/rules.v4

    success "Tailscale installed and configured"
    info "Run 'tailscale up --advertise-routes=$LAN_NETWORK --advertise-exit-node' to connect"
}

# Start all services
start_all_services() {
    log "Starting all services..."

    # Start network services first
    systemctl restart hostapd
    systemctl restart dnsmasq

    # Wait for network services to stabilize
    sleep 5

    # Start Docker services if compose files exist
    if [[ -d "$INSTALL_ROOT/docker" ]]; then
        cd "$INSTALL_ROOT"

        # Start infrastructure services first
        if [[ -f "docker/infrastructure/traefik/compose.yml" ]]; then
            log "Starting Traefik..."
            docker compose -f docker/infrastructure/traefik/compose.yml up -d
        fi

        if [[ -f "docker/infrastructure/dns/compose.yml" ]]; then
            log "Starting DNS services..."
            docker compose -f docker/infrastructure/dns/compose.yml up -d
        fi

        # Start media services
        for service_dir in docker/media/*/; do
            if [[ -f "$service_dir/compose.yml" ]]; then
                service_name=$(basename "$service_dir")
                log "Starting $service_name..."
                docker compose -f "$service_dir/compose.yml" up -d
            fi
        done

        # Start sync services
        for service_dir in docker/sync/*/; do
            if [[ -f "$service_dir/compose.yml" ]]; then
                service_name=$(basename "$service_dir")
                log "Starting $service_name..."
                docker compose -f "$service_dir/compose.yml" up -d
            fi
        done
    fi

    success "All services started"
}

# Verification and testing
verify_setup() {
    log "Verifying setup..."

    # Test network connectivity
    local tests_passed=0
    local tests_total=0

    # Test WiFi interface
    ((tests_total++))
    if ip addr show "$WIFI_INTERFACE" | grep -q "$LAN_IP"; then
        success "WiFi interface has correct IP"
        ((tests_passed++))
    else
        error "WiFi interface IP configuration failed"
    fi

    # Test hostapd
    ((tests_total++))
    if systemctl is-active --quiet hostapd; then
        success "Hostapd is running"
        ((tests_passed++))
    else
        error "Hostapd is not running"
    fi

    # Test dnsmasq
    ((tests_total++))
    if systemctl is-active --quiet dnsmasq; then
        success "Dnsmasq is running"
        ((tests_passed++))
    else
        error "Dnsmasq is not running"
    fi

    # Test Docker
    ((tests_total++))
    if systemctl is-active --quiet docker; then
        success "Docker is running"
        ((tests_passed++))
    else
        error "Docker is not running"
    fi

    # Test internet connectivity
    ((tests_total++))
    if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
        success "Internet connectivity working"
        ((tests_passed++))
    else
        warning "Internet connectivity test failed"
    fi

    # Summary
    log "Verification complete: $tests_passed/$tests_total tests passed"

    if [[ $tests_passed -eq $tests_total ]]; then
        success "All verification tests passed!"
        return 0
    else
        warning "Some verification tests failed"
        return 1
    fi
}

# Show final information
show_final_info() {
    log "Setup completed! Here's your DangerPrep system information:"
    echo
    echo -e "${GREEN}WiFi Hotspot Information:${NC}"
    echo "  SSID: $WIFI_SSID"
    echo "  Password: $WIFI_PASSWORD"
    echo "  Network: $LAN_NETWORK"
    echo "  Gateway: $LAN_IP"
    echo
    echo -e "${GREEN}Network Configuration:${NC}"
    echo "  WAN Interface: $WAN_INTERFACE"
    echo "  WiFi Interface: $WIFI_INTERFACE"
    echo "  Platform: $PLATFORM"
    echo
    echo -e "${GREEN}Services:${NC}"
    echo "  SSH: Port $SSH_PORT (key-only authentication)"
    echo "  Web Services: https://*.danger (via Traefik)"
    echo "  DNS/DHCP: $LAN_IP"
    echo
    echo -e "${GREEN}Security (2025 Enhanced):${NC}"
    echo "  Firewall: Configured with WAN hardening"
    echo "  Fail2ban: Active with intrusion prevention"
    echo "  SSH: Hardened configuration with modern ciphers"
    echo "  WiFi: WPA3 (if supported) or WPA2 with client isolation"
    echo "  DNS: DNSSEC validation with DoH/DoT"
    echo "  File Integrity: AIDE monitoring (daily checks)"
    echo "  Antivirus: ClamAV scanning (weekly)"
    echo "  Rootkit Detection: rkhunter (weekly)"
    echo "  Security Audits: Lynis (monthly)"
    echo "  Backups: Encrypted with AES-256 (daily/weekly/monthly)"
    echo "  Updates: Automatic security updates enabled"
    echo
    echo -e "${GREEN}Next Steps:${NC}"
    echo "  1. Connect Tailscale: tailscale up --advertise-routes=$LAN_NETWORK --advertise-exit-node"
    echo "  2. Connect to WiFi: $WIFI_SSID (password: $WIFI_PASSWORD)"
    echo "  3. Access services: https://portal.danger"
    echo "  4. Configure NFS: edit /etc/dangerprep/nfs-mounts.conf and run 'dangerprep nfs mount'"
    echo "  5. Check system health: dangerprep monitor report"
    echo "  6. Check logs: tail -f $LOG_FILE"
    echo
    echo -e "${YELLOW}Important Files:${NC}"
    echo "  Setup log: $LOG_FILE"
    echo "  Backup: $BACKUP_DIR"
    echo "  Config: /etc/dangerprep/"
    echo "  NFS config: /etc/dangerprep/nfs-mounts.conf"
    echo
    echo -e "${GREEN}Management Commands:${NC}"
    echo "  dangerprep help           - Show all available commands"
    echo "  dangerprep status         - Check service status"
    echo "  dangerprep monitor report - System health report"
    echo "  dangerprep nfs test       - Test NFS connectivity"
    echo "  dangerprep firewall status - Check firewall status"
    echo "  dangerprep-backup-encrypted daily - Create encrypted backup"
    echo "  dangerprep-security-audit - Run comprehensive security audit"
    echo "  dangerprep-aide-check     - Check file integrity"
    echo
}

# Setup advanced DNS with DoH/DoT
setup_advanced_dns() {
    log "Setting up advanced DNS with DoH/DoT..."

    # Install cloudflared for DNS over HTTPS
    log "Installing cloudflared for DoH support..."
    local cloudflared_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
    if [[ "$(uname -m)" == "x86_64" ]]; then
        cloudflared_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    fi

    wget -O /usr/local/bin/cloudflared "$cloudflared_url"
    chmod +x /usr/local/bin/cloudflared

    # Create cloudflared configuration
    mkdir -p /etc/cloudflared
    cat > /etc/cloudflared/config.yml << 'EOF'
proxy-dns: true
proxy-dns-port: 5053
proxy-dns-address: 127.0.0.1
proxy-dns-upstream:
  - https://1.1.1.1/dns-query
  - https://1.0.0.1/dns-query
  - https://8.8.8.8/dns-query
  - https://8.8.4.4/dns-query
EOF

    # Create cloudflared service
    cat > /etc/systemd/system/cloudflared.service << 'EOF'
[Unit]
Description=Cloudflared DNS over HTTPS proxy
After=network.target
Wants=network.target

[Service]
Type=simple
User=nobody
ExecStart=/usr/local/bin/cloudflared --config /etc/cloudflared/config.yml
Restart=on-failure
RestartSec=10
KillMode=mixed

[Install]
WantedBy=multi-user.target
EOF

    # Enable and start cloudflared
    systemctl daemon-reload
    systemctl enable cloudflared
    systemctl start cloudflared

    # Update dnsmasq configuration to use cloudflared
    log "Updating dnsmasq configuration for DoH..."

    # Backup current dnsmasq config
    cp /etc/dnsmasq.conf "$BACKUP_DIR/dnsmasq.conf.advanced" 2>/dev/null || true

    # Install unbound for DNSSEC validation
    log "Installing unbound for DNSSEC validation..."
    apt install -y unbound unbound-anchor

    # Configure unbound for DNSSEC
    cat > /etc/unbound/unbound.conf.d/dangerprep.conf << 'EOF'
# DangerPrep Unbound Configuration with DNSSEC
server:
    # Basic settings
    verbosity: 1
    interface: 127.0.0.1@5054
    port: 5054
    do-ip4: yes
    do-ip6: no
    do-udp: yes
    do-tcp: yes

    # Security settings
    hide-identity: yes
    hide-version: yes
    harden-glue: yes
    harden-dnssec-stripped: yes
    harden-below-nxdomain: yes
    harden-referral-path: yes
    use-caps-for-id: yes

    # DNSSEC validation
    auto-trust-anchor-file: "/var/lib/unbound/root.key"
    val-clean-additional: yes
    val-permissive-mode: no
    val-log-level: 1

    # Performance
    num-threads: 2
    msg-cache-slabs: 4
    rrset-cache-slabs: 4
    infra-cache-slabs: 4
    key-cache-slabs: 4
    rrset-cache-size: 100m
    msg-cache-size: 50m
    so-rcvbuf: 1m

    # Privacy
    qname-minimisation: yes
    aggressive-nsec: yes

    # Access control
    access-control: 127.0.0.0/8 allow
    access-control: 192.168.120.0/22 allow
    access-control: 0.0.0.0/0 refuse

    # Root hints
    root-hints: "/var/lib/unbound/root.hints"

# Forward zones for DoH
forward-zone:
    name: "."
    forward-addr: 127.0.0.1@5053  # cloudflared DoH
    forward-addr: 1.1.1.1@53      # Fallback
    forward-addr: 8.8.8.8@53      # Fallback
EOF

    # Download root hints
    wget -O /var/lib/unbound/root.hints https://www.internic.net/domain/named.cache
    chown unbound:unbound /var/lib/unbound/root.hints

    # Enable and start unbound
    systemctl enable unbound
    systemctl start unbound

    # Enhanced dnsmasq configuration with DNSSEC validation
    cat > /etc/dnsmasq.conf << EOF
# DangerPrep Advanced DNS Configuration with DNSSEC

# Interface binding
interface=$WIFI_INTERFACE
bind-interfaces
listen-address=$LAN_IP

# DHCP configuration
dhcp-range=$DHCP_START,$DHCP_END,12h
dhcp-option=3,$LAN_IP  # Default gateway
dhcp-option=6,$LAN_IP  # DNS server

# DNS configuration - Use unbound for DNSSEC validation
no-resolv
server=127.0.0.1#5054  # unbound with DNSSEC
server=127.0.0.1#5053  # cloudflared DoH (fallback)

# DNSSEC settings
dnssec
trust-anchor=.,20326,8,2,E06D44B80B8F1D39A95C0B0D7C65D08458E880409BBC683457104237C7F8EC8D
dnssec-check-unsigned

# Cache settings
cache-size=2000
neg-ttl=60
dns-forward-max=300

# Local domain resolution (.danger domains)
local=/danger/
domain=danger
expand-hosts

# Service addresses
address=/traefik.danger/$LAN_IP
address=/portainer.danger/$LAN_IP
address=/jellyfin.danger/$LAN_IP
address=/komga.danger/$LAN_IP
address=/kiwix.danger/$LAN_IP
address=/portal.danger/$LAN_IP
address=/dns.danger/$LAN_IP
address=/router.danger/$LAN_IP

# Tailscale DNS integration
server=100.100.100.100  # Tailscale DNS

# Security settings
bogus-priv
domain-needed
stop-dns-rebind
rebind-localhost-ok

# Ad blocking - common ad domains
address=/doubleclick.net/0.0.0.0
address=/googleadservices.com/0.0.0.0
address=/googlesyndication.com/0.0.0.0
address=/facebook.com/0.0.0.0
address=/fbcdn.net/0.0.0.0
address=/google-analytics.com/0.0.0.0
address=/googletagmanager.com/0.0.0.0

# Performance settings
dns-forward-max=150
cache-size=2000

# Logging (disable in production for performance)
log-queries
log-facility=/var/log/dnsmasq.log
EOF

    # Restart dnsmasq with new configuration
    systemctl restart dnsmasq

    # Test DNS resolution
    sleep 3
    if nslookup google.com 127.0.0.1 >/dev/null 2>&1; then
        success "Advanced DNS with DoH configured successfully"
    else
        warning "DNS resolution test failed, but configuration applied"
    fi

    success "Advanced DNS setup completed"
}

# Install management scripts system-wide
install_management_scripts() {
    log "Installing management scripts system-wide..."

    # Create scripts directory if it doesn't exist
    mkdir -p /usr/local/bin

    # Install network management scripts
    if [[ -f "$PROJECT_ROOT/scripts/network/firewall-manager.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/network/firewall-manager.sh" /usr/local/bin/dangerprep-firewall
        chmod +x /usr/local/bin/dangerprep-firewall
        success "Installed firewall manager"
    fi

    if [[ -f "$PROJECT_ROOT/scripts/network/wifi-manager.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/network/wifi-manager.sh" /usr/local/bin/dangerprep-wifi
        chmod +x /usr/local/bin/dangerprep-wifi
        success "Installed WiFi manager"
    fi

    if [[ -f "$PROJECT_ROOT/scripts/network/interface-manager.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/network/interface-manager.sh" /usr/local/bin/dangerprep-interface
        chmod +x /usr/local/bin/dangerprep-interface
        success "Installed interface manager"
    fi

    if [[ -f "$PROJECT_ROOT/scripts/network/route-manager.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/network/route-manager.sh" /usr/local/bin/dangerprep-router
        chmod +x /usr/local/bin/dangerprep-router
        success "Installed route manager"
    fi

    # Install Docker management scripts
    if [[ -f "$PROJECT_ROOT/scripts/docker/start-services.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/docker/start-services.sh" /usr/local/bin/dangerprep-start
        chmod +x /usr/local/bin/dangerprep-start
        success "Installed service start script"
    fi

    if [[ -f "$PROJECT_ROOT/scripts/docker/stop-services.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/docker/stop-services.sh" /usr/local/bin/dangerprep-stop
        chmod +x /usr/local/bin/dangerprep-stop
        success "Installed service stop script"
    fi

    if [[ -f "$PROJECT_ROOT/scripts/docker/service-status.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/docker/service-status.sh" /usr/local/bin/dangerprep-status
        chmod +x /usr/local/bin/dangerprep-status
        success "Installed service status script"
    fi

    success "Management scripts installed"
}

# Create routing scenario scripts
create_routing_scenarios() {
    log "Creating routing scenario scripts..."

    # Create scenario 1: Ethernet WAN → WiFi AP
    cat > /usr/local/bin/dangerprep-scenario1 << 'EOF'
#!/bin/bash
# DangerPrep Scenario 1: Ethernet WAN → WiFi AP
# This is the default scenario configured by the setup script

case "$1" in
    start)
        echo "Starting Scenario 1: Ethernet WAN → WiFi AP"
        echo "This scenario is already configured by the setup script"
        systemctl restart hostapd
        systemctl restart dnsmasq
        echo "Scenario 1 active"
        ;;
    stop)
        echo "Stopping Scenario 1"
        systemctl stop hostapd
        systemctl stop dnsmasq
        ;;
    status)
        echo "Scenario 1 Status:"
        systemctl is-active hostapd
        systemctl is-active dnsmasq
        ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        exit 1
        ;;
esac
EOF
    chmod +x /usr/local/bin/dangerprep-scenario1

    # Create scenario 2: WiFi Client → Ethernet LAN
    cat > /usr/local/bin/dangerprep-scenario2 << 'EOF'
#!/bin/bash
# DangerPrep Scenario 2: WiFi Client → Ethernet LAN

WIFI_SSID="$2"
WIFI_PASSWORD="$3"

case "$1" in
    start)
        if [[ -z "$WIFI_SSID" || -z "$WIFI_PASSWORD" ]]; then
            echo "Usage: $0 start <wifi-ssid> <wifi-password>"
            exit 1
        fi
        echo "Starting Scenario 2: WiFi Client → Ethernet LAN"
        echo "Connecting to WiFi: $WIFI_SSID"

        # Stop hostapd if running
        systemctl stop hostapd

        # Connect to WiFi network
        nmcli device wifi connect "$WIFI_SSID" password "$WIFI_PASSWORD"

        # Configure routing (simplified)
        echo "Configuring routing..."
        echo "Scenario 2 active"
        ;;
    stop)
        echo "Stopping Scenario 2"
        nmcli connection down "$WIFI_SSID" 2>/dev/null || true
        ;;
    status)
        echo "Scenario 2 Status:"
        nmcli connection show --active | grep wifi || echo "No WiFi connection"
        ;;
    *)
        echo "Usage: $0 {start|stop|status} [wifi-ssid] [wifi-password]"
        exit 1
        ;;
esac
EOF
    chmod +x /usr/local/bin/dangerprep-scenario2

    # Create scenario 3: Emergency Local Network
    cat > /usr/local/bin/dangerprep-scenario3 << 'EOF'
#!/bin/bash
# DangerPrep Scenario 3: Emergency Local Network (WiFi only, no WAN)

case "$1" in
    start)
        echo "Starting Scenario 3: Emergency Local Network"
        echo "WiFi hotspot without internet access"

        # Start hostapd and dnsmasq
        systemctl start hostapd
        systemctl start dnsmasq

        # Block WAN access (emergency mode)
        iptables -I FORWARD -o eth0 -j DROP 2>/dev/null || true
        iptables -I FORWARD -o enp1s0 -j DROP 2>/dev/null || true

        echo "Emergency network active - local services only"
        ;;
    stop)
        echo "Stopping Scenario 3"
        # Remove WAN blocking rules
        iptables -D FORWARD -o eth0 -j DROP 2>/dev/null || true
        iptables -D FORWARD -o enp1s0 -j DROP 2>/dev/null || true
        ;;
    status)
        echo "Scenario 3 Status:"
        systemctl is-active hostapd
        systemctl is-active dnsmasq
        echo "WAN blocking rules:"
        iptables -L FORWARD | grep DROP || echo "No blocking rules"
        ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        exit 1
        ;;
esac
EOF
    chmod +x /usr/local/bin/dangerprep-scenario3

    success "Routing scenario scripts created"
}

# Setup system monitoring
setup_system_monitoring() {
    log "Setting up system monitoring..."

    # Install the system monitor script
    if [[ -f "$PROJECT_ROOT/scripts/maintenance/system-monitor.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/maintenance/system-monitor.sh" /usr/local/bin/dangerprep-monitor
        chmod +x /usr/local/bin/dangerprep-monitor
        success "Installed system monitor"
    else
        # Create a basic system monitor if the original doesn't exist
        cat > /usr/local/bin/dangerprep-monitor << 'EOF'
#!/bin/bash
# DangerPrep System Monitor - Basic Version

LOG_FILE="/var/log/dangerprep-monitor.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

case "$1" in
    report)
        log "=== DangerPrep System Health Report ==="
        echo "Date: $(date)"
        echo "Uptime: $(uptime -p)"
        echo "Memory: $(free -h | awk 'NR==2{print $3"/"$2}')"
        echo "Disk: $(df -h / | awk 'NR==2{print $3"/"$2" ("$5" used)"}')"
        echo "Services:"
        systemctl is-active hostapd dnsmasq docker tailscaled 2>/dev/null || true
        echo "Docker containers:"
        docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || echo "Docker not available"
        ;;
    *)
        echo "Usage: $0 {report}"
        ;;
esac
EOF
        chmod +x /usr/local/bin/dangerprep-monitor
        success "Created basic system monitor"
    fi

    # Create a simple monitoring cron job
    cat > /etc/cron.d/dangerprep-monitor << 'EOF'
# DangerPrep System Monitoring
# Run health check every hour
0 * * * * root /usr/local/bin/dangerprep-monitor report >> /var/log/dangerprep-monitor.log 2>&1
EOF

    success "System monitoring configured"
}

# Configure NFS client capabilities
configure_nfs_client() {
    log "Configuring NFS client capabilities..."

    # Create NFS mount points
    mkdir -p "$INSTALL_ROOT/nfs"/{movies,tv,webtv,music,audiobooks,books,comics,magazines}

    # Create NFS configuration file
    cat > /etc/dangerprep/nfs-mounts.conf << 'EOF'
# DangerPrep NFS Mount Configuration
# Format: remote_path:local_path:options
# Example: 100.65.182.27:/mnt/data/polaris/movies:/opt/dangerprep/nfs/movies:rw,soft,intr,rsize=8192,wsize=8192,timeo=14

# Central NAS mounts (adjust IP and paths as needed)
#100.65.182.27:/mnt/data/polaris/movies:/opt/dangerprep/nfs/movies:rw,soft,intr,rsize=8192,wsize=8192,timeo=14
#100.65.182.27:/mnt/data/polaris/tv:/opt/dangerprep/nfs/tv:rw,soft,intr,rsize=8192,wsize=8192,timeo=14
#100.65.182.27:/mnt/data/content/books:/opt/dangerprep/nfs/books:rw,soft,intr,rsize=8192,wsize=8192,timeo=14
#100.65.182.27:/mnt/data/content/music:/opt/dangerprep/nfs/music:rw,soft,intr,rsize=8192,wsize=8192,timeo=14
EOF

    # Create NFS mount script
    cat > /usr/local/bin/dangerprep-nfs << 'EOF'
#!/bin/bash
# DangerPrep NFS Mount Manager

NFS_CONFIG="/etc/dangerprep/nfs-mounts.conf"

mount_nfs() {
    echo "Mounting NFS shares..."

    if [[ ! -f "$NFS_CONFIG" ]]; then
        echo "NFS configuration not found: $NFS_CONFIG"
        exit 1
    fi

    while IFS=':' read -r remote_path local_path options; do
        # Skip comments and empty lines
        [[ "$remote_path" =~ ^#.*$ ]] && continue
        [[ -z "$remote_path" ]] && continue

        echo "Mounting $remote_path to $local_path"
        mkdir -p "$local_path"

        if mount -t nfs -o "$options" "$remote_path" "$local_path"; then
            echo "✓ Mounted $remote_path"
        else
            echo "✗ Failed to mount $remote_path"
        fi
    done < "$NFS_CONFIG"
}

unmount_nfs() {
    echo "Unmounting NFS shares..."

    if [[ ! -f "$NFS_CONFIG" ]]; then
        echo "NFS configuration not found: $NFS_CONFIG"
        exit 1
    fi

    while IFS=':' read -r remote_path local_path options; do
        # Skip comments and empty lines
        [[ "$remote_path" =~ ^#.*$ ]] && continue
        [[ -z "$remote_path" ]] && continue

        if mountpoint -q "$local_path"; then
            echo "Unmounting $local_path"
            if umount "$local_path"; then
                echo "✓ Unmounted $local_path"
            else
                echo "✗ Failed to unmount $local_path"
            fi
        fi
    done < "$NFS_CONFIG"
}

test_nfs() {
    echo "Testing NFS connectivity..."

    # Test NFS server connectivity
    local servers=($(grep -v '^#' "$NFS_CONFIG" | grep -v '^$' | cut -d':' -f1 | cut -d'/' -f1 | sort -u))

    for server in "${servers[@]}"; do
        echo "Testing connectivity to $server..."
        if ping -c 1 -W 2 "$server" >/dev/null 2>&1; then
            echo "✓ $server is reachable"

            # Test NFS service
            if command -v showmount >/dev/null 2>&1; then
                if timeout 10 showmount -e "$server" >/dev/null 2>&1; then
                    echo "✓ NFS service is running on $server"
                else
                    echo "✗ NFS service may not be running on $server"
                fi
            fi
        else
            echo "✗ $server is not reachable"
        fi
    done
}

case "$1" in
    mount)
        mount_nfs
        ;;
    unmount)
        unmount_nfs
        ;;
    test)
        test_nfs
        ;;
    status)
        echo "NFS Mount Status:"
        mount | grep nfs || echo "No NFS mounts found"
        ;;
    *)
        echo "Usage: $0 {mount|unmount|test|status}"
        echo
        echo "Commands:"
        echo "  mount    - Mount all configured NFS shares"
        echo "  unmount  - Unmount all NFS shares"
        echo "  test     - Test NFS server connectivity"
        echo "  status   - Show current NFS mount status"
        exit 1
        ;;
esac
EOF
    chmod +x /usr/local/bin/dangerprep-nfs

    success "NFS client configuration completed"
}

# Install maintenance and validation scripts
install_maintenance_scripts() {
    log "Installing maintenance and validation scripts..."

    # Install system backup script
    if [[ -f "$PROJECT_ROOT/scripts/maintenance/system-backup.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/maintenance/system-backup.sh" /usr/local/bin/dangerprep-backup
        chmod +x /usr/local/bin/dangerprep-backup
        success "Installed system backup script"
    fi

    # Install system update script
    if [[ -f "$PROJECT_ROOT/scripts/maintenance/system-update.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/maintenance/system-update.sh" /usr/local/bin/dangerprep-update
        chmod +x /usr/local/bin/dangerprep-update
        success "Installed system update script"
    fi

    # Install validation scripts
    local validation_scripts=(
        "validate-compose.sh:dangerprep-validate-compose"
        "validate-references.sh:dangerprep-validate-refs"
        "validate-docker-dependencies.sh:dangerprep-validate-docker"
        "test-nfs-mounts.sh:dangerprep-test-nfs"
        "fix-permissions.sh:dangerprep-fix-perms"
        "security-audit.sh:dangerprep-audit"
    )

    for script_mapping in "${validation_scripts[@]}"; do
        local source_script="${script_mapping%:*}"
        local target_script="${script_mapping#*:}"

        if [[ -f "$PROJECT_ROOT/scripts/maintenance/$source_script" ]]; then
            cp "$PROJECT_ROOT/scripts/maintenance/$source_script" "/usr/local/bin/$target_script"
            chmod +x "/usr/local/bin/$target_script"
            success "Installed $target_script"
        fi
    done

    # Create a comprehensive system management script
    cat > /usr/local/bin/dangerprep << 'EOF'
#!/bin/bash
# DangerPrep System Management Script

show_help() {
    echo "DangerPrep System Management"
    echo "Usage: $0 <command> [options]"
    echo
    echo "Network Commands:"
    echo "  firewall <action>     - Manage firewall (status|reset|port-forward)"
    echo "  wifi <action>         - Manage WiFi (scan|connect|ap|status)"
    echo "  interface <action>    - Manage interfaces (enumerate|list|set-wan)"
    echo "  router <action>       - Manage routing (start|stop|status)"
    echo "  scenario1|scenario2|scenario3 <action> - Network scenarios"
    echo
    echo "Service Commands:"
    echo "  start                 - Start all services"
    echo "  stop                  - Stop all services"
    echo "  status                - Show service status"
    echo "  restart               - Restart all services"
    echo
    echo "System Commands:"
    echo "  monitor <action>      - System monitoring (report)"
    echo "  backup                - Create system backup"
    echo "  update                - Update system"
    echo "  nfs <action>          - NFS management (mount|unmount|test|status)"
    echo
    echo "Maintenance Commands:"
    echo "  validate-compose      - Validate Docker Compose files"
    echo "  validate-refs         - Validate file references"
    echo "  test-nfs              - Test NFS connectivity"
    echo "  fix-perms             - Fix file permissions"
    echo "  audit                 - Run security audit"
    echo
}

case "$1" in
    firewall)
        shift
        dangerprep-firewall "$@"
        ;;
    wifi)
        shift
        dangerprep-wifi "$@"
        ;;
    interface)
        shift
        dangerprep-interface "$@"
        ;;
    router)
        shift
        dangerprep-router "$@"
        ;;
    scenario1|scenario2|scenario3)
        shift
        "dangerprep-$1" "$@"
        ;;
    start)
        dangerprep-start
        ;;
    stop)
        dangerprep-stop
        ;;
    status)
        dangerprep-status
        ;;
    restart)
        dangerprep-stop
        sleep 3
        dangerprep-start
        ;;
    monitor)
        shift
        dangerprep-monitor "$@"
        ;;
    backup)
        dangerprep-backup
        ;;
    update)
        dangerprep-update
        ;;
    nfs)
        shift
        dangerprep-nfs "$@"
        ;;
    validate-compose)
        dangerprep-validate-compose
        ;;
    validate-refs)
        dangerprep-validate-refs
        ;;
    test-nfs)
        dangerprep-test-nfs
        ;;
    fix-perms)
        dangerprep-fix-perms
        ;;
    audit)
        dangerprep-audit
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for available commands"
        exit 1
        ;;
esac
EOF
    chmod +x /usr/local/bin/dangerprep

    success "Maintenance scripts installed"
}

# Setup encrypted backups
setup_encrypted_backups() {
    log "Setting up encrypted backup system..."

    # Install backup tools
    apt install -y borgbackup restic gpg

    # Create backup directories
    mkdir -p /var/backups/dangerprep/{daily,weekly,monthly}
    mkdir -p /etc/dangerprep/backup

    # Generate backup encryption key
    if [[ ! -f /etc/dangerprep/backup/backup.key ]]; then
        log "Generating backup encryption key..."
        openssl rand -base64 32 > /etc/dangerprep/backup/backup.key
        chmod 600 /etc/dangerprep/backup/backup.key
        chown root:root /etc/dangerprep/backup/backup.key
    fi

    # Create comprehensive backup script
    cat > /usr/local/bin/dangerprep-backup-encrypted << 'EOF'
#!/bin/bash
# DangerPrep Encrypted Backup System

BACKUP_KEY="/etc/dangerprep/backup/backup.key"
BACKUP_BASE="/var/backups/dangerprep"
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"
LOG_FILE="/var/log/dangerprep-backup.log"

# Backup type: daily, weekly, monthly
BACKUP_TYPE="${1:-daily}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$BACKUP_BASE/$BACKUP_TYPE"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}

# Check if backup key exists
if [[ ! -f "$BACKUP_KEY" ]]; then
    error "Backup encryption key not found: $BACKUP_KEY"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

log "Starting $BACKUP_TYPE backup..."

# Define what to backup based on type
case "$BACKUP_TYPE" in
    daily)
        BACKUP_PATHS=(
            "/etc/dangerprep"
            "/etc/ssh/sshd_config"
            "/etc/hostapd"
            "/etc/dnsmasq.conf"
            "/etc/cloudflared"
            "/etc/unbound"
            "/usr/local/bin/dangerprep*"
            "$INSTALL_ROOT/docker"
        )
        RETENTION_DAYS=7
        ;;
    weekly)
        BACKUP_PATHS=(
            "/etc"
            "/usr/local/bin"
            "$INSTALL_ROOT"
            "/var/log/dangerprep*"
            "/home/ubuntu/.ssh"
        )
        RETENTION_DAYS=30
        ;;
    monthly)
        BACKUP_PATHS=(
            "/"
        )
        EXCLUDE_PATHS=(
            "/proc"
            "/sys"
            "/dev"
            "/tmp"
            "/var/tmp"
            "/run"
            "/mnt"
            "/media"
            "/lost+found"
            "$INSTALL_ROOT/content"
            "$INSTALL_ROOT/nfs"
        )
        RETENTION_DAYS=90
        ;;
esac

# Create encrypted backup
BACKUP_FILE="$BACKUP_DIR/dangerprep-$BACKUP_TYPE-$TIMESTAMP.tar.gz.enc"

log "Creating encrypted backup: $BACKUP_FILE"

# Build tar command
TAR_CMD="tar -czf -"
for path in "${BACKUP_PATHS[@]}"; do
    if [[ -e "$path" ]]; then
        TAR_CMD="$TAR_CMD \"$path\""
    fi
done

# Add exclusions for monthly backup
if [[ "$BACKUP_TYPE" == "monthly" ]]; then
    for exclude in "${EXCLUDE_PATHS[@]}"; do
        TAR_CMD="$TAR_CMD --exclude=\"$exclude\""
    done
fi

# Create encrypted backup
eval "$TAR_CMD" | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -pass file:"$BACKUP_KEY" > "$BACKUP_FILE"

if [[ $? -eq 0 ]]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup completed successfully: $BACKUP_FILE ($BACKUP_SIZE)"

    # Create checksum
    sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"

    # Clean up old backups
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "dangerprep-$BACKUP_TYPE-*.tar.gz.enc" -mtime +$RETENTION_DAYS -delete
    find "$BACKUP_DIR" -name "dangerprep-$BACKUP_TYPE-*.sha256" -mtime +$RETENTION_DAYS -delete

else
    error "Backup failed"
    exit 1
fi

log "$BACKUP_TYPE backup completed"
EOF
    chmod +x /usr/local/bin/dangerprep-backup-encrypted

    # Create backup restore script
    cat > /usr/local/bin/dangerprep-restore-backup << 'EOF'
#!/bin/bash
# DangerPrep Backup Restore Script

BACKUP_KEY="/etc/dangerprep/backup/backup.key"
BACKUP_FILE="$1"
RESTORE_DIR="${2:-/tmp/dangerprep-restore}"

if [[ -z "$BACKUP_FILE" ]]; then
    echo "Usage: $0 <backup-file> [restore-directory]"
    echo "Example: $0 /var/backups/dangerprep/daily/dangerprep-daily-20250101-120000.tar.gz.enc"
    exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

if [[ ! -f "$BACKUP_KEY" ]]; then
    echo "Backup encryption key not found: $BACKUP_KEY"
    exit 1
fi

echo "Restoring backup to: $RESTORE_DIR"
mkdir -p "$RESTORE_DIR"

# Verify checksum if available
if [[ -f "$BACKUP_FILE.sha256" ]]; then
    echo "Verifying backup integrity..."
    if ! sha256sum -c "$BACKUP_FILE.sha256"; then
        echo "Backup integrity check failed!"
        exit 1
    fi
    echo "Backup integrity verified"
fi

# Decrypt and extract
echo "Decrypting and extracting backup..."
openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 -pass file:"$BACKUP_KEY" -in "$BACKUP_FILE" | \
    tar -xzf - -C "$RESTORE_DIR"

if [[ $? -eq 0 ]]; then
    echo "Backup restored successfully to: $RESTORE_DIR"
else
    echo "Backup restore failed"
    exit 1
fi
EOF
    chmod +x /usr/local/bin/dangerprep-restore-backup

    # Set up automated backup schedule
    cat > /etc/cron.d/dangerprep-backups << 'EOF'
# DangerPrep Automated Backup Schedule
# Daily backup at 1 AM
0 1 * * * root /usr/local/bin/dangerprep-backup-encrypted daily

# Weekly backup on Sunday at 2 AM
0 2 * * 0 root /usr/local/bin/dangerprep-backup-encrypted weekly

# Monthly backup on 1st at 3 AM
0 3 1 * * root /usr/local/bin/dangerprep-backup-encrypted monthly
EOF

    success "Encrypted backup system configured"
    info "Backup encryption key stored at: /etc/dangerprep/backup/backup.key"
    info "Manual backup: dangerprep-backup-encrypted [daily|weekly|monthly]"
    info "Restore backup: dangerprep-restore-backup <backup-file> [restore-dir]"
}

# Main function
main() {
    show_banner
    check_root
    setup_logging
    show_system_info
    pre_flight_checks
    backup_original_configs
    update_system_packages
    install_essential_packages
    setup_automatic_updates

    log "System preparation completed. Continuing with security hardening..."
    configure_ssh_hardening
    setup_fail2ban
    configure_kernel_hardening
    setup_file_integrity_monitoring
    setup_advanced_security_tools
    configure_rootless_docker
    detect_network_interfaces
    configure_wan_interface
    setup_network_routing
    configure_wifi_hotspot
    setup_dhcp_dns_server
    configure_wifi_routing
    setup_docker_services
    generate_sync_configs
    setup_tailscale
    setup_advanced_dns
    install_management_scripts
    create_routing_scenarios
    setup_system_monitoring
    configure_nfs_client
    install_maintenance_scripts
    setup_encrypted_backups
    start_all_services
    verify_setup
    show_final_info

    success "DangerPrep setup completed successfully!"
}

# Error handling
cleanup_on_error() {
    error "Setup failed. Cleaning up..."

    # Stop services that might have been started
    systemctl stop hostapd 2>/dev/null || true
    systemctl stop dnsmasq 2>/dev/null || true

    # Restore original configurations if they exist
    if [[ -d "$BACKUP_DIR" ]]; then
        [[ -f "$BACKUP_DIR/sshd_config.original" ]] && cp "$BACKUP_DIR/sshd_config.original" /etc/ssh/sshd_config
        [[ -f "$BACKUP_DIR/sysctl.conf.original" ]] && cp "$BACKUP_DIR/sysctl.conf.original" /etc/sysctl.conf
        [[ -f "$BACKUP_DIR/dnsmasq.conf" ]] && cp "$BACKUP_DIR/dnsmasq.conf" /etc/dnsmasq.conf
        [[ -f "$BACKUP_DIR/iptables.rules" ]] && iptables-restore < "$BACKUP_DIR/iptables.rules"
    fi

    error "Setup failed. Check $LOG_FILE for details."
    error "Original configurations have been restored from $BACKUP_DIR"
    exit 1
}

# Set up error handling
trap cleanup_on_error ERR

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
