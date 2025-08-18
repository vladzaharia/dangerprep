#!/bin/bash
# DangerPrep Just Binary Download Script
# Downloads platform-specific just binaries from GitHub releases

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
GITHUB_REPO="casey/just"
GITHUB_API_URL="https://api.github.com/repos/$GITHUB_REPO"

# Platform detection
detect_platform() {
    local os arch
    
    case "$(uname -s)" in
        Linux*)     os="linux" ;;
        Darwin*)    os="darwin" ;;
        CYGWIN*|MINGW*|MSYS*) os="windows" ;;
        *)          error "Unsupported operating system: $(uname -s)"; exit 1 ;;
    esac
    
    case "$(uname -m)" in
        x86_64|amd64)   arch="x86_64" ;;
        aarch64|arm64)  arch="aarch64" ;;
        armv7l)         arch="armv7" ;;
        arm*)           arch="arm" ;;
        *)              error "Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac
    
    echo "${os}-${arch}"
}

# Get latest version from GitHub
get_latest_version() {
    local latest_url="$GITHUB_API_URL/releases/latest"
    
    if command -v curl > /dev/null 2>&1; then
        curl -s "$latest_url" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
    elif command -v wget > /dev/null 2>&1; then
        wget -qO- "$latest_url" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
    else
        error "Neither curl nor wget found. Cannot download version information."
        exit 1
    fi
}

# Download and extract just binary
download_just() {
    local version="$1"
    local platform="$2"
    local binary_name="just"
    
    # Determine file extension and binary name based on platform
    case "$platform" in
        windows-*)
            local archive_ext="zip"
            binary_name="just.exe"
            ;;
        *)
            local archive_ext="tar.gz"
            ;;
    esac
    
    # Map platform to GitHub release naming convention
    local release_platform
    case "$platform" in
        linux-x86_64)      release_platform="x86_64-unknown-linux-musl" ;;
        linux-aarch64)     release_platform="aarch64-unknown-linux-musl" ;;
        linux-armv7)       release_platform="armv7-unknown-linux-musleabihf" ;;
        linux-arm)         release_platform="arm-unknown-linux-musleabihf" ;;
        darwin-x86_64)     release_platform="x86_64-apple-darwin" ;;
        darwin-aarch64)    release_platform="aarch64-apple-darwin" ;;
        windows-x86_64)    release_platform="x86_64-pc-windows-msvc" ;;
        windows-aarch64)   release_platform="aarch64-pc-windows-msvc" ;;
        *)                 error "Unsupported platform: $platform"; exit 1 ;;
    esac
    
    local archive_name="just-${version}-${release_platform}.${archive_ext}"
    local download_url="https://github.com/$GITHUB_REPO/releases/download/$version/$archive_name"
    local output_name="just-${platform}"
    
    log "Downloading $archive_name..."
    
    # Download archive
    if command -v curl > /dev/null 2>&1; then
        curl -L -o "$SCRIPT_DIR/$archive_name" "$download_url"
    elif command -v wget > /dev/null 2>&1; then
        wget -O "$SCRIPT_DIR/$archive_name" "$download_url"
    else
        error "Neither curl nor wget found. Cannot download binary."
        exit 1
    fi
    
    # Extract binary
    log "Extracting $archive_name..."
    case "$archive_ext" in
        tar.gz)
            tar -xzf "$SCRIPT_DIR/$archive_name" -C "$SCRIPT_DIR" "$binary_name"
            ;;
        zip)
            if command -v unzip > /dev/null 2>&1; then
                unzip -j "$SCRIPT_DIR/$archive_name" "$binary_name" -d "$SCRIPT_DIR"
            else
                error "unzip not found. Cannot extract Windows binary."
                exit 1
            fi
            ;;
    esac
    
    # Rename binary to platform-specific name
    mv "$SCRIPT_DIR/$binary_name" "$SCRIPT_DIR/$output_name"
    chmod +x "$SCRIPT_DIR/$output_name"
    
    # Clean up archive
    rm "$SCRIPT_DIR/$archive_name"
    
    success "Downloaded and extracted $output_name"
}

# Download all supported platforms
download_all_platforms() {
    local version="$1"
    local platforms=(
        "linux-x86_64"
        "linux-aarch64"
        "linux-armv7"
        "linux-arm"
        "darwin-x86_64"
        "darwin-aarch64"
        "windows-x86_64"
        "windows-aarch64"
    )
    
    for platform in "${platforms[@]}"; do
        if [[ -f "$SCRIPT_DIR/just-$platform" ]]; then
            log "Binary for $platform already exists, skipping..."
            continue
        fi
        
        download_just "$version" "$platform" || warning "Failed to download $platform binary"
    done
}

# Main function
main() {
    local force_download=false
    local target_version=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force)
                force_download=true
                shift
                ;;
            -v|--version)
                target_version="$2"
                shift 2
                ;;
            -h|--help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  -f, --force     Force download even if binaries exist"
                echo "  -v, --version   Download specific version (default: latest)"
                echo "  -h, --help      Show this help message"
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Get version to download
    if [[ -z "$target_version" ]]; then
        log "Getting latest version from GitHub..."
        target_version=$(get_latest_version)
        if [[ -z "$target_version" ]]; then
            error "Failed to get latest version"
            exit 1
        fi
    fi
    
    log "Target version: $target_version"
    
    # Download all platform binaries (force download removes existing binaries)
    if [[ "$force_download" == true ]]; then
        log "Force download enabled, removing existing binaries..."
        rm -f "$SCRIPT_DIR"/just-*
    fi

    download_all_platforms "$target_version"

    success "All binaries downloaded for version $target_version"
}

# Run main function
main "$@"
