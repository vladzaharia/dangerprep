#!/bin/bash
# DangerPrep Bootstrap Script
# Downloads the latest release or clones the repository and runs setup
#
# Usage:
#   curl -4 -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash
#   wget -4 -qO- https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash
#
# Options:
#   --clone     Force git clone instead of release download
#   --update    Force update of existing installation
#   --dry-run   Show what would be done without executing
#   --help      Show this help message

set -euo pipefail

# Configuration
REPO_OWNER="vladzaharia"
REPO_NAME="dangerprep"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
API_URL="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}"
INSTALL_DIR="${INSTALL_DIR:-/dangerprep}"
FORCE_CLONE=false
FORCE_UPDATE=false
DRY_RUN=false
NON_INTERACTIVE=false

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
  --clone              Force git clone instead of release download
  --update             Force update of existing installation
  --dry-run            Show what would be done without executing
  --non-interactive    Skip interactive configuration (use defaults)
  --help               Show this help message

Examples:
  # Download and run directly (recommended):
  curl -4 -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash

  # Or with wget:
  wget -4 -qO- https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash

  # Force git clone:
  curl -4 -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash -s -- --clone

  # Force update existing installation:
  curl -4 -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash -s -- --update

  # Skip interactive configuration (use defaults):
  curl -4 -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | sudo bash -s -- --non-interactive

  # Dry run (show what would be done):
  curl -4 -fsSL https://raw.githubusercontent.com/vladzaharia/dangerprep/main/bootstrap.sh | bash -s -- --dry-run

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
            --update)
                FORCE_UPDATE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --non-interactive)
                NON_INTERACTIVE=true
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
        response=$(curl -4 -s "$api_url" 2>/dev/null || echo "")
    elif command -v wget >/dev/null 2>&1; then
        response=$(wget -4 -qO- "$api_url" 2>/dev/null || echo "")
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
        curl -4 -L -o "$tarball_path" "$tarball_url"
    elif command -v wget >/dev/null 2>&1; then
        wget -4 -O "$tarball_path" "$tarball_url"
    fi

    # Extract to install directory
    log_info "Extracting release to $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
    tar -xzf "$tarball_path" -C "$INSTALL_DIR" --strip-components=1

    # Save version info for future updates
    echo "$tag_name" > "$INSTALL_DIR/.dangerprep-version"

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

# Check if an update is needed for release-based installation
check_release_update_needed() {
    local current_version="$1"
    local latest_version="$2"

    # If no current version file, update is needed
    if [[ -z "$current_version" ]]; then
        return 0
    fi

    # If versions differ, update is needed
    if [[ "$current_version" != "$latest_version" ]]; then
        return 0
    fi

    # No update needed
    return 1
}

# Handle existing installation and determine if update is needed
handle_existing_installation() {
    # Check if installation directory exists
    if [[ ! -d "$INSTALL_DIR" ]]; then
        log_info "No existing installation found"
        return 0
    fi

    log_info "Existing installation detected at $INSTALL_DIR"

    # Check if it's a git-based installation
    if [[ -d "$INSTALL_DIR/.git" ]]; then
        log_info "Git-based installation detected"

        if [[ "$DRY_RUN" == "true" ]]; then
            if [[ "$FORCE_UPDATE" == "true" ]]; then
                log_info "[DRY RUN] Would force update git repository"
            else
                log_info "[DRY RUN] Would update git repository"
            fi
            log_info "[DRY RUN] Would run: cd $INSTALL_DIR && git pull origin main"
            log_success "[DRY RUN] Git repository would be updated"
            return 0
        fi

        if [[ "$FORCE_UPDATE" == "true" ]]; then
            log_info "Force updating git repository..."
        else
            log_info "Updating git repository..."
        fi
        cd "$INSTALL_DIR"

        # Check if we have uncommitted changes
        if ! git diff-index --quiet HEAD --; then
            log_warn "Uncommitted changes detected in $INSTALL_DIR"
            log_warn "Stashing changes before update..."
            git stash push -m "Bootstrap script auto-stash $(date)"
        fi

        # Pull latest changes
        if git pull origin main; then
            log_success "Git repository updated successfully"
        else
            log_error "Failed to update git repository"
            return 1
        fi

        return 0
    fi

    # Check if it's a release-based installation
    if [[ -f "$INSTALL_DIR/.dangerprep-version" ]]; then
        local current_version
        current_version=$(cat "$INSTALL_DIR/.dangerprep-version" 2>/dev/null || echo "")

        log_info "Release-based installation detected (version: ${current_version:-unknown})"

        # Get latest release info
        local release_info
        if ! release_info=$(get_latest_release); then
            log_warn "Could not check for updates (no releases found)"
            return 0
        fi

        local latest_version="${release_info%|*}"

        if check_release_update_needed "$current_version" "$latest_version" || [[ "$FORCE_UPDATE" == "true" ]]; then
            if [[ "$FORCE_UPDATE" == "true" ]]; then
                log_info "Forcing update: $current_version → $latest_version"
            else
                log_info "Update available: $current_version → $latest_version"
            fi

            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY RUN] Would backup current installation"
                log_info "[DRY RUN] Would download and extract: $latest_version"
                log_info "[DRY RUN] Would update version file"
                log_success "[DRY RUN] Release would be updated"
                return 0
            fi

            # Create backup of current installation
            local backup_dir="${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
            log_info "Creating backup at $backup_dir..."
            cp -r "$INSTALL_DIR" "$backup_dir"

            # Download and extract new release
            log_info "Downloading and installing update..."
            download_release "$release_info"

            log_success "Installation updated from $current_version to $latest_version"
            log_info "Backup available at: $backup_dir"
        else
            log_success "Installation is up to date (version: $current_version)"
        fi

        return 0
    fi

    # Unknown installation type
    log_warn "Existing installation found but type could not be determined"
    log_warn "Directory exists but no .git or .dangerprep-version found"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would proceed with installation (may overwrite existing files)"
        return 0
    fi

    # Let the main function handle this case
    return 0
}

# Run the setup process
run_setup() {
    log_info "Starting DangerPrep setup process..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would change to directory: $INSTALL_DIR"
        log_info "[DRY RUN] Would set permissions: chmod -R 755 $INSTALL_DIR"
        log_info "[DRY RUN] Would run: bash lib/gum/download.sh"
        local setup_args=""
        if [[ "$NON_INTERACTIVE" == "true" ]]; then
            setup_args="--non-interactive"
        else
            setup_args="--force-interactive"
        fi
        log_info "[DRY RUN] Would run: bash scripts/setup.sh $setup_args"
        log_success "[DRY RUN] Setup process would complete here"
        return
    fi

    cd "$INSTALL_DIR"

    # Ensure proper permissions
    chmod -R 755 "$INSTALL_DIR"

    # Download required tools
    log_info "Downloading gum..."
    bash lib/gum/download.sh

    # Run the main setup script with appropriate flags
    log_info "Running main setup script..."
    local setup_args=()

    # Bootstrap is designed for interactive configuration by default
    if [[ "$NON_INTERACTIVE" == "true" ]]; then
        log_info "Using non-interactive mode (defaults only)"
        setup_args+=("--non-interactive")
    else
        log_info "Using interactive mode for configuration (bootstrap default)"
        setup_args+=("--force-interactive")
    fi

    bash scripts/setup.sh "${setup_args[@]}"

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

    # Handle existing installation (update if needed)
    local installation_exists=false
    if [[ -d "$INSTALL_DIR" ]]; then
        installation_exists=true
        handle_existing_installation
    fi

    # Only proceed with fresh installation if no existing installation
    if [[ "$installation_exists" == "false" ]]; then
        log_info "Performing fresh installation..."

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
    else
        log_info "Using existing/updated installation"
    fi

    # Run the setup process
    run_setup

    log_success "DangerPrep bootstrap completed!"
    log_info "System is ready for use. Check the documentation for next steps."
}

# Run main function with all arguments
main "$@"
