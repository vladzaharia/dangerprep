#!/bin/bash
# DangerPrep Master Deployment Script
# Comprehensive deployment and setup for the DangerPrep system

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Determine installation root - use current directory if not specified
INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-$(pwd)}"
DOCKER_ROOT="$INSTALL_ROOT/docker"
DATA_ROOT="$INSTALL_ROOT/data"
CONTENT_ROOT="$INSTALL_ROOT/content"
NFS_ROOT="$INSTALL_ROOT/nfs"

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
        exit 1
    fi
}

# Display banner
show_banner() {
    echo -e "${BLUE}"
    cat << 'EOF'
    ____                                 ____                  
   / __ \____ _____  ____ ____  _____   / __ \________  ____  
  / / / / __ `/ __ \/ __ `/ _ \/ ___/  / /_/ / ___/ _ \/ __ \ 
 / /_/ / /_/ / / / / /_/ /  __/ /     / ____/ /  /  __/ /_/ / 
/_____/\__,_/_/ /_/\__, /\___/_/     /_/   /_/   \___/ .___/  
                 /____/                             /_/       

Emergency Router & Content Hub Deployment
EOF
    echo -e "${NC}"
}

# Pre-deployment checks
pre_deployment_checks() {
    log "Running pre-deployment checks..."
    
    # Check system requirements
    if ! grep -q "FriendlyWrt" /etc/os-release 2>/dev/null; then
        warning "Not running on FriendlyWrt - some features may not work correctly"
    fi
    
    # Check available storage
    local available_gb=$(df "$INSTALL_ROOT" 2>/dev/null | awk 'NR==2 {print int($4/1024/1024)}' || echo "0")
    if [[ $available_gb -lt 50 ]]; then
        error "Insufficient storage space. Need at least 50GB, have ${available_gb}GB"
        exit 1
    fi
    
    # Check memory
    local mem_gb=$(free -g | awk 'NR==2{print $2}')
    if [[ $mem_gb -lt 3 ]]; then
        warning "Low memory detected (${mem_gb}GB). Performance may be affected."
    fi
    
    # Check Docker
    if ! command -v docker > /dev/null 2>&1; then
        error "Docker not found. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! docker compose version > /dev/null 2>&1; then
        error "Docker Compose not found. Please install Docker Compose first."
        exit 1
    fi
    
    success "Pre-deployment checks passed"
}

# Install system packages
install_system_packages() {
    log "Installing system packages..."

    # Detect package manager and install accordingly
    if command -v apt > /dev/null 2>&1; then
        # Ubuntu/Debian system
        log "Using apt package manager (Ubuntu/Debian)"

        # Update package list
        apt update

        # Essential packages
        local packages=(
            "curl"
            "wget"
            "rsync"
            "nfs-common"        # Ubuntu equivalent of nfs-utils
            "smartmontools"
            "htop"
            "nano"
            "bc"
            "jq"
            "docker.io"
            "docker-compose"
        )

        for package in "${packages[@]}"; do
            if ! dpkg -l | grep -q "^ii.*$package"; then
                log "Installing $package..."
                apt install -y "$package" || warning "Failed to install $package"
            fi
        done

    elif command -v opkg > /dev/null 2>&1; then
        # OpenWrt system
        log "Using opkg package manager (OpenWrt)"

        # Update package list
        opkg update

        # Essential packages
        local packages=(
            "curl"
            "wget"
            "rsync"
            "nfs-utils"
            "smartmontools"
            "htop"
            "nano"
            "bc"
            "jq"
        )

        for package in "${packages[@]}"; do
            if ! opkg list-installed | grep -q "^$package "; then
                log "Installing $package..."
                opkg install "$package" || warning "Failed to install $package"
            fi
        done
    else
        error "No supported package manager found (apt or opkg)"
        exit 1
    fi

    success "System packages installed"
}

# Setup directory structure
setup_directories() {
    log "Setting up directory structure..."

    # Create base Docker directories
    mkdir -p "$DOCKER_ROOT"/{infrastructure,media,services}

    # Create base data directories (container data only)
    mkdir -p "$DATA_ROOT"/{backups,logs}

    # Create content directories
    mkdir -p "$CONTENT_ROOT"/{movies,tv,webtv,music,audiobooks,books,comics,magazines,games/roms}

    # Create NFS mount points
    mkdir -p "$NFS_ROOT"
    
    # Copy Docker configurations
    if [[ -d "$PROJECT_ROOT/docker" ]]; then
        log "Copying Docker configurations..."
        cp -r "$PROJECT_ROOT"/docker/* "$DOCKER_ROOT"/
    else
        error "Docker configurations not found in $PROJECT_ROOT/docker"
        exit 1
    fi
    
    # Set permissions
    chown -R root:root "$DOCKER_ROOT"
    chown -R 1000:1000 "$DATA_ROOT"
    chown -R 1000:1000 "$CONTENT_ROOT"
    chown -R 1000:1000 "$NFS_ROOT"
    
    # Make scripts executable
    find "$DOCKER_ROOT" -name "*.sh" -exec chmod +x {} \;
    
    success "Directory structure created"
}

# Configure Docker
configure_docker() {
    log "Configuring Docker..."
    
    # Copy Docker daemon configuration
    if [[ -f "$PROJECT_ROOT/config/docker/daemon.json" ]]; then
        mkdir -p /etc/docker
        cp "$PROJECT_ROOT/config/docker/daemon.json" /etc/docker/daemon.json
        
        # Restart Docker to apply configuration
        /etc/init.d/docker restart
        sleep 5
    fi
    
    # Create Docker networks
    if ! docker network ls | grep -q "traefik"; then
        docker network create traefik
        success "Traefik network created"
    fi
    
    success "Docker configured"
}

# Setup NFS mounts
setup_nfs_mounts() {
    log "Setting up NFS mounts..."

    # Check if NFS utilities are available
    if ! command -v mount.nfs > /dev/null 2>&1; then
        warning "NFS utilities not found. Installing..."
        opkg install nfs-utils || warning "Failed to install NFS utilities"
    fi

    # Create NFS mount configuration
    cat > "$INSTALL_ROOT/nfs-mounts.conf" << EOF
# DangerPrep NFS Mount Configuration
# Format: remote_path:local_path:options
# Example: 100.65.182.27:/mnt/data/polaris/movies:$INSTALL_ROOT/nfs/movies:ro,soft,intr

# Central NAS mounts (configure these based on your setup)
#100.65.182.27:/mnt/data/polaris/movies:$INSTALL_ROOT/nfs/movies:ro,soft,intr
#100.65.182.27:/mnt/data/polaris/tv:$INSTALL_ROOT/nfs/tv:ro,soft,intr
#100.65.182.27:/mnt/data/polaris/webtv:$INSTALL_ROOT/nfs/webtv:ro,soft,intr
#100.65.182.27:/mnt/data/content/books:$INSTALL_ROOT/nfs/books:ro,soft,intr
#100.65.182.27:/mnt/data/content/games:$INSTALL_ROOT/nfs/games:ro,soft,intr
EOF

    # Create NFS mount script
    cat > "$INSTALL_ROOT/mount-nfs.sh" << 'EOF'
#!/bin/bash
# DangerPrep NFS Mount Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NFS_CONFIG="$SCRIPT_DIR/nfs-mounts.conf"

mount_nfs() {
    if [[ ! -f "$NFS_CONFIG" ]]; then
        echo "NFS configuration file not found: $NFS_CONFIG"
        exit 1
    fi

    while IFS=':' read -r remote_path local_path options; do
        # Skip comments and empty lines
        [[ "$remote_path" =~ ^#.*$ ]] && continue
        [[ -z "$remote_path" ]] && continue

        echo "Mounting $remote_path to $local_path..."
        mkdir -p "$local_path"

        if mount -t nfs -o "$options" "$remote_path" "$local_path"; then
            echo "Successfully mounted $remote_path"
        else
            echo "Failed to mount $remote_path"
        fi
    done < "$NFS_CONFIG"
}

unmount_nfs() {
    if [[ ! -f "$NFS_CONFIG" ]]; then
        echo "NFS configuration file not found: $NFS_CONFIG"
        exit 1
    fi

    while IFS=':' read -r remote_path local_path options; do
        # Skip comments and empty lines
        [[ "$remote_path" =~ ^#.*$ ]] && continue
        [[ -z "$remote_path" ]] && continue

        if mountpoint -q "$local_path"; then
            echo "Unmounting $local_path..."
            umount "$local_path" || echo "Failed to unmount $local_path"
        fi
    done < "$NFS_CONFIG"
}

case "$1" in
    mount)
        mount_nfs
        ;;
    unmount)
        unmount_nfs
        ;;
    *)
        echo "Usage: $0 {mount|unmount}"
        exit 1
        ;;
esac
EOF

    chmod +x "$INSTALL_ROOT/mount-nfs.sh"

    success "NFS mount configuration created"
}

# Install just command runner system-wide
install_just() {
    log "Installing just command runner..."

    # Download just binaries if not present
    if [[ ! -f "$PROJECT_ROOT/lib/just/just" ]]; then
        log "Downloading just binaries..."
        cd "$PROJECT_ROOT/lib/just"
        ./download.sh --force
        cd - > /dev/null
    fi

    # Install system-wide
    local platform
    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="darwin" ;;
        *)          warning "Unsupported OS for just installation"; return ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)   arch="x86_64" ;;
        aarch64|arm64)  arch="aarch64" ;;
        armv7l)         arch="armv7" ;;
        arm*)           arch="arm" ;;
        *)              warning "Unsupported architecture for just installation"; return ;;
    esac

    platform="${os}-${arch}"
    local just_binary="$PROJECT_ROOT/lib/just/just-$platform"

    if [[ -f "$just_binary" ]]; then
        cp "$just_binary" /usr/local/bin/just
        chmod +x /usr/local/bin/just
        success "Just installed system-wide"
    else
        warning "Just binary for $platform not found, using bundled version"
    fi
}

# Deploy services
deploy_services() {
    log "Deploying DangerPrep services..."

    # Use just to start services in proper order
    cd "$INSTALL_ROOT"
    if [[ -f "$INSTALL_ROOT/lib/just/just" ]]; then
        "$INSTALL_ROOT/lib/just/just" start
    else
        error "Just wrapper not found"
        return 1
    fi

    success "Services deployed"
}

# Install management scripts
install_scripts() {
    log "Installing management scripts..."

    # Copy scripts to system location
    mkdir -p /usr/local/bin

    if [[ -f "$PROJECT_ROOT/scripts/system-monitor.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/system-monitor.sh" /usr/local/bin/dangerprep-monitor
        chmod +x /usr/local/bin/dangerprep-monitor
    fi

    if [[ -f "$PROJECT_ROOT/scripts/setup-tailscale.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/setup-tailscale.sh" /usr/local/bin/dangerprep-tailscale
        chmod +x /usr/local/bin/dangerprep-tailscale
    fi
    
    if [[ -f "$PROJECT_ROOT/scripts/setup-dns.sh" ]]; then
        cp "$PROJECT_ROOT/scripts/setup-dns.sh" /usr/local/bin/dangerprep-dns
        chmod +x /usr/local/bin/dangerprep-dns
    fi
    
    success "Management scripts installed"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up system monitoring..."
    
    # Create log directory
    mkdir -p /var/log/dangerprep
    
    # Setup log rotation
    cat > /etc/logrotate.d/dangerprep << EOF
/var/log/dangerprep/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
EOF
    
    # Add monitoring to crontab
    (crontab -l 2>/dev/null; echo "*/10 * * * * /usr/local/bin/dangerprep-monitor report > /dev/null 2>&1") | crontab -
    
    success "Monitoring configured"
}

# Enumerate network interfaces
enumerate_network_interfaces() {
    log "Enumerating network interfaces..."

    # Run interface enumeration
    if [ -f "$PROJECT_ROOT/scripts/network/interface-manager.sh" ]; then
        "$PROJECT_ROOT/scripts/network/interface-manager.sh" enumerate
        success "Network interfaces enumerated"
    else
        warning "Interface manager not found, skipping enumeration"
    fi
}

# Verify deployment
verify_deployment() {
    log "Verifying deployment..."
    
    # Wait for services to start
    sleep 30
    
    # Check service status using dynamic discovery
    local running_services=($(docker ps --format "{{.Names}}" | sort))
    local failed_services=()

    if [ ${#running_services[@]} -eq 0 ]; then
        error "No services are running"
        return 1
    fi

    for service in "${running_services[@]}"; do
        local state=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "unknown")
        if [[ "$state" == "running" ]]; then
            success "$service: Running"
        else
            error "$service: $state"
            failed_services+=("$service")
        fi
    done
    
    # Check web interfaces
    local interfaces=(
        "https://traefik.danger"    # Traefik dashboard
        "https://portainer.danger"  # Portainer
        "https://jellyfin.danger"   # Jellyfin
        "https://portal.danger"     # Portal
    )
    
    for interface in "${interfaces[@]}"; do
        if curl -s --max-time 5 "$interface" > /dev/null; then
            success "Web interface accessible: $interface"
        else
            warning "Web interface not accessible: $interface"
        fi
    done
    
    if [[ ${#failed_services[@]} -eq 0 ]]; then
        success "All services deployed successfully!"
    else
        error "Some services failed to deploy: ${failed_services[*]}"
        return 1
    fi
}

# Show post-deployment information
show_post_deployment_info() {
    log "Deployment completed! Here's what you can do next:"
    echo
    echo -e "${GREEN}Web Interfaces:${NC}"
    echo "  • Management Portal: https://portal.danger"
    echo "  • Jellyfin Media: https://jellyfin.danger"
    echo "  • Komga Books: https://komga.danger"
    echo "  • Kiwix Offline: https://kiwix.danger"
    echo "  • Portainer: https://portainer.danger"
    echo "  • Traefik Dashboard: https://traefik.danger"
    echo "  • DNS Management: https://dns.danger"
    echo
    echo -e "${GREEN}Management Commands:${NC}"
    echo "  • Service management: dangerprep-services {start|stop|restart|status}"
    echo "  • System monitoring: dangerprep-monitor {report|monitor}"
    echo "  • Tailscale setup: dangerprep-tailscale {install|configure|status}"
    echo "  • DNS setup: dangerprep-dns {install|configure|test|status}"
    echo
    echo -e "${GREEN}Next Steps:${NC}"
    echo "  1. Configure NFS mounts: Edit $INSTALL_ROOT/nfs-mounts.conf and run $INSTALL_ROOT/mount-nfs.sh mount"
    echo "  2. Configure Tailscale: dangerprep-tailscale install"
    echo "  3. Setup DNS: dangerprep-dns install"
    echo "  4. Access the management portal to configure services"
    echo "  5. Add content to $CONTENT_ROOT/ directories"
    echo
    echo -e "${YELLOW}Important Notes:${NC}"
    echo "  • Installation root: $INSTALL_ROOT"
    echo "  • Default network: 192.168.120.0/22"
    echo "  • Router IP: 192.168.120.1"
    echo "  • All services use .danger domains"
    echo "  • Logs are in /var/log/dangerprep/"
    echo "  • NFS mounts: $NFS_ROOT/"
    echo "  • Content storage: $CONTENT_ROOT/"
    echo
}

# Cleanup function
cleanup() {
    if [[ $? -ne 0 ]]; then
        error "Deployment failed. Check logs for details."
        echo "You can retry deployment or check individual components."
    fi
}

# Show help
show_help() {
    echo "DangerPrep Deployment Script"
    echo "Usage: $0 {deploy|verify|help}"
    echo
    echo "Commands:"
    echo "  deploy   - Full system deployment"
    echo "  verify   - Verify existing deployment"
    echo "  help     - Show this help message"
}

# Set trap for cleanup
trap cleanup EXIT

# Main script logic
case "$1" in
    deploy)
        show_banner
        check_root
        pre_deployment_checks
        install_system_packages
        setup_directories
        configure_docker
        setup_nfs_mounts
        install_just
        deploy_services
        install_scripts
        setup_monitoring
        verify_deployment
        show_post_deployment_info
        ;;
    verify)
        check_root
        verify_deployment
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        show_banner
        check_root
        pre_deployment_checks
        install_system_packages
        setup_directories
        configure_docker
        setup_nfs_mounts
        install_just
        deploy_services
        install_scripts
        setup_monitoring
        enumerate_network_interfaces
        verify_deployment
        show_post_deployment_info
        ;;
esac
