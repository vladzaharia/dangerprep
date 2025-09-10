#!/bin/bash
# DangerPrep Bootstrap Script
# Downloads the latest release or clones the repository and runs setup
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash
#   wget -qO- https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash
#
# Options:
#   --clone     Force git clone instead of release download
#   --dry-run   Show what would be done without executing
#   --help      Show this help message

set -euo pipefail

# Configuration
REPO_OWNER="vladzaharia"
REPO_NAME="dangerprep"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
API_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}"
INSTALL_DIR="/dangerprep"
FORCE_CLONE=false
DRY_RUN=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show usage information
show_help() {
    cat << EOF
DangerPrep Bootstrap

This script downloads the latest DangerPrep release (if available) or clones
the repository, then runs the complete setup process.

Usage:
  $0 [OPTIONS]

Options:
  --clone     Force git clone instead of release download
  --dry-run   Show what would be done without executing
  --help      Show this help message

Examples:
  # Download and run directly (recommended):
  curl -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash

  # Or with wget:
  wget -qO- https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash

  # Force git clone:
  curl -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash -s -- --clone

  # Dry run (show what would be done):
  curl -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | bash -s -- --dry-run

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --clone)
                FORCE_CLONE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Check for required dependencies
check_dependencies() {
    local missing_deps=()

    # Check for download tools
    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        missing_deps+=("curl or wget")
    fi

    # Check for git (needed for clone fallback)
    if ! command -v git >/dev/null 2>&1; then
        missing_deps+=("git")
    fi

    # Check for tar (needed for release extraction)
    if ! command -v tar >/dev/null 2>&1; then
        missing_deps+=("tar")
    fi

    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Please install the missing dependencies and try again"
        exit 1
    fi
}

# Get the latest release information from GitHub API
get_latest_release() {
    local api_url="${API_URL}/releases/latest"
    local response

    log_info "Checking for latest release..."

    if command -v curl >/dev/null 2>&1; then
        response=$(curl -s "$api_url" 2>/dev/null || echo "")
    elif command -v wget >/dev/null 2>&1; then
        response=$(wget -qO- "$api_url" 2>/dev/null || echo "")
    fi

    # Check if we got a valid response
    if [[ -z "$response" ]] || echo "$response" | grep -q '"message": "Not Found"'; then
        return 1
    fi

    # Extract tag name and tarball URL
    local tag_name
    local tarball_url

    tag_name=$(echo "$response" | grep '"tag_name":' | sed -E 's/.*"tag_name": "([^"]+)".*/\1/' | head -1)
    tarball_url=$(echo "$response" | grep '"tarball_url":' | sed -E 's/.*"tarball_url": "([^"]+)".*/\1/' | head -1)

    if [[ -n "$tag_name" && -n "$tarball_url" ]]; then
        echo "$tag_name|$tarball_url"
        return 0
    fi

    return 1
}

# Download and extract the latest release
download_release() {
    local release_info="$1"
    local tag_name="${release_info%|*}"
    local tarball_url="${release_info#*|}"

    log_info "Downloading release $tag_name..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would download: $tarball_url"
        log_info "[DRY RUN] Would extract to: $INSTALL_DIR"
        log_success "[DRY RUN] Release $tag_name would be downloaded and extracted"
        return
    fi

    local temp_dir
    temp_dir=$(mktemp -d)
    local tarball_path="$temp_dir/dangerprep-${tag_name}.tar.gz"

    # Download the tarball
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "$tarball_path" "$tarball_url"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$tarball_path" "$tarball_url"
    fi

    # Extract to install directory
    log_info "Extracting release to $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
    tar -xzf "$tarball_path" -C "$INSTALL_DIR" --strip-components=1

    # Cleanup
    rm -rf "$temp_dir"

    log_success "Release $tag_name downloaded and extracted"
}

# Clone the repository as fallback
clone_repository() {
    log_info "Cloning repository from $REPO_URL..."

    if [[ "$DRY_RUN" == "true" ]]; then
        if [[ -d "$INSTALL_DIR/.git" ]]; then
            log_info "[DRY RUN] Would update existing repository at $INSTALL_DIR"
        else
            log_info "[DRY RUN] Would clone: git clone $REPO_URL $INSTALL_DIR"
        fi
        log_success "[DRY RUN] Repository would be cloned successfully"
        return
    fi

    if [[ -d "$INSTALL_DIR/.git" ]]; then
        log_info "Repository already exists, updating..."
        cd "$INSTALL_DIR"
        git pull origin main
    else
        git clone "$REPO_URL" "$INSTALL_DIR"
    fi

    log_success "Repository cloned successfully"
}

# Run the setup process
run_setup() {
    log_info "Starting DangerPrep setup process..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would change to directory: $INSTALL_DIR"
        log_info "[DRY RUN] Would set permissions: chmod -R 755 $INSTALL_DIR"
        log_info "[DRY RUN] Would run: bash lib/gum/download.sh"
        log_info "[DRY RUN] Would run: bash lib/just/download.sh"
        log_info "[DRY RUN] Would run: bash scripts/setup/setup-dangerprep.sh"
        log_success "[DRY RUN] Setup process would complete here"
        return
    fi

    cd "$INSTALL_DIR"

    # Ensure proper permissions
    chmod -R 755 "$INSTALL_DIR"

    # Download required tools
    log_info "Downloading gum..."
    bash lib/gum/download.sh

    log_info "Downloading just..."
    bash lib/just/download.sh

    # Run the main setup script
    log_info "Running main setup script..."
    bash scripts/setup/setup-dangerprep.sh

    log_success "DangerPrep setup completed successfully!"
}

# Cleanup function for error handling
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log_error "Bootstrap process failed with exit code $exit_code"
        log_info "You may need to manually clean up $INSTALL_DIR"
    fi
    exit $exit_code
}

# Main function
main() {
    # Set up error handling
    trap cleanup EXIT

    log_info " DangerPrep Bootstrap"
    log_info "======================"

    # Parse arguments
    parse_args "$@"

    # Check dependencies
    check_dependencies

    # Check if install directory already exists
    if [[ -d "$INSTALL_DIR" ]]; then
        log_warn "Directory $INSTALL_DIR already exists"
        log_info "Continuing with existing directory..."
    fi

    # Determine installation method
    if [[ "$FORCE_CLONE" == "true" ]]; then
        log_info "Forcing git clone (--clone flag specified)"
        clone_repository
    else
        # Try to get latest release
        local release_info
        if release_info=$(get_latest_release); then
            log_success "Found latest release, downloading..."
            download_release "$release_info"
        else
            log_warn "No releases found, falling back to git clone"
            clone_repository
        fi
    fi

    # Run the setup process
    run_setup

    log_success "DangerPrep bootstrap completed!"
    log_info "System is ready for use. Check the documentation for next steps."
}

# Run main function with all arguments
main "$@"