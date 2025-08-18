#!/bin/bash
# DangerPrep Bootstrap Script
# Downloads the latest release and prompts for installation

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

# Show banner using the same format as the project
show_banner() {
    # Use the same banner as scripts/shared/banner.sh but simplified for bootstrap
    echo -e "${PURPLE}.·:'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''':·.${NC}"
    echo -e "${BLUE}: :                                                                        : :${NC}"
    echo -e "${BLUE}: :                                                                        : :${NC}"
    echo -e "${BLUE}: :     ${CYAN}______                                _______                      ${BLUE}: :${NC}"
    echo -e "${BLUE}: :    ${CYAN}|   _  \ .---.-.-----.-----.-----.----|   _   |----.-----.-----.    ${BLUE}: :${NC}"
    echo -e "${BLUE}: :    ${CYAN}|.  |   \|  _  |     |  _  |  -__|   _${PURPLE}|.  1   |   _|  -__|  _  |    ${BLUE}: :${NC}"
    echo -e "${BLUE}: :    ${CYAN}|.  |    |___._|__|__|___  |_____|__| ${PURPLE}|.  ____|__| |_____|   __|    ${BLUE}: :${NC}"
    echo -e "${BLUE}: :    ${CYAN}|:  1    /           |_____|          ${PURPLE}|:  |              |__|       ${BLUE}: :${NC}"
    echo -e "${BLUE}: :    ${CYAN}|::.. . /                             ${PURPLE}|::.|                         ${BLUE}: :${NC}"
    echo -e "${BLUE}: :    ${CYAN}\`------'                              ${PURPLE}\`---'                         ${BLUE}: :${NC}"
    echo -e "${BLUE}: :                                                                        : :${NC}"
    echo -e "${BLUE}: :${YELLOW}                     Bootstrap Installation Script                      ${BLUE}: :${NC}"
    echo -e "${BLUE}: :                                                                        : :${NC}"
    echo -e "${PURPLE}'·:........................................................................:·'${NC}"
    echo ""
}

# Configuration
GITHUB_REPO="vladzaharia/dangerprep"
GITHUB_API_URL="https://api.github.com/repos/$GITHUB_REPO"
TEMP_DIR="/tmp/dangerprep-bootstrap-$$"
INSTALL_DIR="/dangerprep"

# Check if we're already in a DangerPrep directory
check_existing_installation() {
    if [[ -f "scripts/setup/setup-dangerprep.sh" ]]; then
        info "Already in a DangerPrep directory"
        return 0
    fi
    return 1
}

# Get latest release information
get_latest_release() {
    log "Getting latest release information..."
    
    if command -v curl > /dev/null 2>&1; then
        curl -s "$GITHUB_API_URL/releases/latest"
    elif command -v wget > /dev/null 2>&1; then
        wget -qO- "$GITHUB_API_URL/releases/latest"
    else
        error "Neither curl nor wget found. Cannot download release information."
        exit 1
    fi
}

# Download and extract release
download_release() {
    local download_url="$1"
    local filename="$2"
    
    log "Downloading $filename..."
    
    # Create temp directory
    mkdir -p "$TEMP_DIR"
    cd "$TEMP_DIR"
    
    # Download the release
    if command -v curl > /dev/null 2>&1; then
        curl -L -o "$filename" "$download_url"
    elif command -v wget > /dev/null 2>&1; then
        wget -O "$filename" "$download_url"
    else
        error "Neither curl nor wget found. Cannot download release."
        exit 1
    fi
    
    # Extract the release
    log "Extracting $filename..."
    tar -xzf "$filename"
    
    success "Downloaded and extracted release"
}

# Prompt for installation
prompt_installation() {
    local extract_dir="$1"

    echo ""
    info "DangerPrep has been downloaded to: $TEMP_DIR/$extract_dir"
    echo ""
    echo -e "${YELLOW}Installation Options:${NC}"
    echo "1. Install to $INSTALL_DIR and run setup (recommended)"
    echo "2. Install to current directory"
    echo "3. Exit without installing"
    echo ""
    echo -e "${CYAN}Note: DangerPrep setup requires root privileges and will:${NC}"
    echo "• Install system-level network services (hostapd, dnsmasq)"
    echo "• Configure security tools (AIDE, fail2ban, ClamAV)"
    echo "• Set up hardware monitoring and optimization"
    echo "• Apply comprehensive security hardening"
    echo "• Requires Ubuntu 24.04 LTS on supported hardware"
    echo ""

    while true; do
        read -p "Choose an option (1-3): " -r choice
        case $choice in
            1)
                install_to_directory "$extract_dir" "$INSTALL_DIR"
                break
                ;;
            2)
                install_to_directory "$extract_dir" "$(pwd)/dangerprep"
                break
                ;;
            3)
                info "Exiting without installing"
                cleanup
                exit 0
                ;;
            *)
                warning "Invalid choice. Please enter 1, 2, or 3."
                ;;
        esac
    done
}

# Install to specific directory
install_to_directory() {
    local extract_dir="$1"
    local target_dir="$2"

    log "Installing DangerPrep to $target_dir..."

    # Check if we need root for the target directory
    local need_root=false
    if [[ "$target_dir" == "/dangerprep" ]] || [[ "$target_dir" =~ ^/[^/]*$ ]]; then
        need_root=true
    fi

    # Create target directory with appropriate permissions
    if [[ "$need_root" == true ]]; then
        if [[ $EUID -ne 0 ]]; then
            warning "Root privileges required to install to $target_dir"
            info "Attempting to use sudo..."
            sudo mkdir -p "$target_dir" || {
                error "Failed to create directory $target_dir"
                exit 1
            }
        else
            mkdir -p "$target_dir"
        fi
    else
        mkdir -p "$(dirname "$target_dir")"
    fi

    # Copy files
    if [[ -d "$target_dir" ]] && [[ -n "$(ls -A "$target_dir" 2>/dev/null)" ]]; then
        warning "Directory $target_dir already exists and is not empty"
        read -p "Overwrite existing installation? (y/N): " -r overwrite
        if [[ ! $overwrite =~ ^[Yy]$ ]]; then
            info "Installation cancelled"
            cleanup
            exit 0
        fi
        if [[ "$need_root" == true ]] && [[ $EUID -ne 0 ]]; then
            sudo rm -rf "$target_dir"/*
        else
            rm -rf "$target_dir"/*
        fi
    fi

    # Copy files with appropriate permissions
    if [[ "$need_root" == true ]] && [[ $EUID -ne 0 ]]; then
        sudo cp -r "$TEMP_DIR/$extract_dir"/* "$target_dir/"
        sudo chown -R root:root "$target_dir"
        sudo chmod +x "$target_dir"/scripts/setup/setup-dangerprep.sh
        sudo chmod +x "$target_dir"/bootstrap.sh
    else
        cp -r "$TEMP_DIR/$extract_dir"/* "$target_dir/"
        chmod +x "$target_dir"/scripts/setup/setup-dangerprep.sh
        chmod +x "$target_dir"/bootstrap.sh 2>/dev/null || true
    fi

    success "DangerPrep installed to $target_dir"

    # Prompt to run setup
    echo ""
    echo -e "${YELLOW}Ready to run DangerPrep setup!${NC}"
    echo ""
    echo -e "${CYAN}Setup will configure:${NC}"
    echo "• Emergency router and content hub system"
    echo "• Network services (WiFi hotspot, DNS, DHCP)"
    echo "• Security hardening and monitoring"
    echo "• Hardware optimization for NanoPi devices"
    echo ""

    read -p "Run DangerPrep setup now? (Y/n): " -r run_setup
    if [[ ! $run_setup =~ ^[Nn]$ ]]; then
        cd "$target_dir"
        if [[ "$need_root" == true ]] || [[ $EUID -ne 0 ]]; then
            sudo ./scripts/setup/setup-dangerprep.sh
        else
            ./scripts/setup/setup-dangerprep.sh
        fi
    else
        info "To run setup later, execute:"
        info "cd $target_dir && sudo ./scripts/setup/setup-dangerprep.sh"
    fi
}



# Cleanup temporary files
cleanup() {
    if [[ -d "$TEMP_DIR" ]]; then
        log "Cleaning up temporary files..."
        rm -rf "$TEMP_DIR"
    fi
}

# Main function
main() {
    show_banner
    
    # Check if already in DangerPrep directory
    if check_existing_installation; then
        read -p "Run setup from current directory? (Y/n): " -r run_current
        if [[ ! $run_current =~ ^[Nn]$ ]]; then
            ./scripts/setup/setup-dangerprep.sh
            exit 0
        fi
    fi
    
    # Get latest release
    log "Fetching latest DangerPrep release..."
    release_info=$(get_latest_release)
    
    if [[ -z "$release_info" ]]; then
        error "Failed to get release information"
        exit 1
    fi
    
    # Parse release information
    tag_name=$(echo "$release_info" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    download_url=$(echo "$release_info" | grep '"browser_download_url":.*dangerprep-package.*\.tar\.gz"' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')

    if [[ -z "$tag_name" || -z "$download_url" ]]; then
        error "Failed to parse release information"
        error "Tag: $tag_name"
        error "URL: $download_url"
        exit 1
    fi
    
    info "Latest release: $tag_name"
    
    # Download and extract
    filename=$(basename "$download_url")
    download_release "$download_url" "$filename"
    
    # Find extracted directory
    extract_dir=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "dangerprep-*" | head -1 | xargs basename)
    
    if [[ -z "$extract_dir" ]]; then
        error "Failed to find extracted directory"
        cleanup
        exit 1
    fi
    
    # Prompt for installation
    prompt_installation "$extract_dir"
    
    # Cleanup
    cleanup
    
    success "DangerPrep bootstrap complete!"
}

# Trap cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"
