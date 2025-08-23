#!/bin/bash
# DangerPrep Gum Binary Download Script
# Downloads platform-specific gum binaries from GitHub releases

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
GITHUB_REPO="charmbracelet/gum"
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

# Download and extract gum binary
download_gum() {
    local version="$1"
    local platform="$2"
    local binary_name="gum"

    # Determine file extension and binary name based on platform
    case "$platform" in
        windows-*)
            local archive_ext="zip"
            binary_name="gum.exe"
            ;;
        *)
            local archive_ext="tar.gz"
            ;;
    esac

    # Map platform to GitHub release naming convention
    local release_platform
    case "$platform" in
        linux-x86_64)   release_platform="Linux_x86_64" ;;
        linux-aarch64)  release_platform="Linux_arm64" ;;
        linux-armv7)    release_platform="Linux_armv7" ;;
        linux-arm)      release_platform="Linux_armv6" ;;
        darwin-x86_64)  release_platform="Darwin_x86_64" ;;
        darwin-aarch64) release_platform="Darwin_arm64" ;;
        windows-x86_64) release_platform="Windows_x86_64" ;;
        *)              error "Unsupported platform: $platform"; exit 1 ;;
    esac

    local archive_name="gum_${version#v}_${release_platform}.${archive_ext}"
    local download_url="https://github.com/$GITHUB_REPO/releases/download/$version/$archive_name"
    local output_name="gum-${platform}"

    log "Downloading $archive_name..."

    # Download archive
    local script_dir
    script_dir="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"

    if command -v curl > /dev/null 2>&1; then
        curl -L -o "${script_dir}/${archive_name}" "$download_url"
    elif command -v wget > /dev/null 2>&1; then
        wget -O "${script_dir}/${archive_name}" "$download_url"
    else
        error "Neither curl nor wget found. Cannot download binary."
        exit 1
    fi
    
    # Extract binary
    log "Extracting $archive_name..."
    local script_dir
    script_dir="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"

    case "$archive_ext" in
        tar.gz)
            # Extract the entire archive and find the binary
            tar -xzf "${script_dir}/${archive_name}" -C "${script_dir}"
            # Find the binary in the extracted directory
            local extracted_dir="${script_dir}/gum_${version#v}_${release_platform}"
            if [[ -f "$extracted_dir/$binary_name" ]]; then
                mv "$extracted_dir/$binary_name" "${script_dir}/${binary_name}"
                rm -rf "$extracted_dir"
            else
                error "Binary not found in extracted archive"
                return 1
            fi
            ;;
        zip)
            if command -v unzip > /dev/null 2>&1; then
                # Extract and find binary
                local temp_dir="${script_dir}/temp_extract"
                mkdir -p "$temp_dir"
                unzip "${script_dir}/${archive_name}" -d "$temp_dir"
                local binary_path
                binary_path=$(find "$temp_dir" -name "$binary_name" -type f | head -1)
                if [[ -n "$binary_path" ]]; then
                    mv "$binary_path" "${script_dir}/${binary_name}"
                    rm -rf "$temp_dir"
                else
                    error "Binary not found in extracted archive"
                    rm -rf "$temp_dir"
                    return 1
                fi
            else
                error "unzip not found. Cannot extract Windows binary."
                exit 1
            fi
            ;;
    esac

    # Rename binary to platform-specific name
    mv "${script_dir}/${binary_name}" "${script_dir}/${output_name}"
    chmod +x "${script_dir}/${output_name}"

    # Clean up archive
    rm "${script_dir}/${archive_name}"

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
    )

    for platform in "${platforms[@]}"; do
        local script_dir
        script_dir="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"

        if [[ -f "${script_dir}/gum-${platform}" ]]; then
            log "Binary for $platform already exists, skipping..."
            continue
        fi

        download_gum "$version" "$platform" || warning "Failed to download $platform binary"
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
        local script_dir
        script_dir="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"
        rm -f "${script_dir}"/gum-*
    fi

    download_all_platforms "$target_version"

    success "All binaries downloaded for version $target_version"
}

# Run main function
main "$@"
