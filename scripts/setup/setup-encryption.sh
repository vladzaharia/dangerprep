#!/bin/bash
# DangerPrep Encryption System Setup
# Installs and configures hardware-backed file encryption using YubiKey PIV keys

set -euo pipefail

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/gum-utils.sh"

# Configuration
readonly INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"
readonly CONFIG_DIR="$SCRIPT_DIR/configs"

# Package versions (will be updated by package version checker)
readonly AGE_VERSION="1.2.0"
readonly AGE_PLUGIN_YUBIKEY_VERSION="0.5.0"

# Installation functions
install_age() {
    log_info "Installing age encryption tool..."
    
    # Check if already installed
    if command -v age >/dev/null 2>&1; then
        local current_version
        current_version=$(age --version 2>/dev/null | head -n1 | awk '{print $2}' || echo "unknown")
        log_info "age already installed (version: $current_version)"
        return 0
    fi
    
    # Install via package manager or download binary
    if command -v apt-get >/dev/null 2>&1; then
        # Ubuntu/Debian
        if apt-cache show age >/dev/null 2>&1; then
            apt-get update && apt-get install -y age
        else
            # Install from GitHub releases
            install_age_from_github
        fi
    elif command -v yum >/dev/null 2>&1; then
        # RHEL/CentOS
        install_age_from_github
    elif command -v brew >/dev/null 2>&1; then
        # macOS
        brew install age
    else
        install_age_from_github
    fi
    
    # Verify installation
    if ! command -v age >/dev/null 2>&1; then
        log_error "Failed to install age"
        return 1
    fi
    
    log_success "age installed successfully"
}

install_age_from_github() {
    log_info "Installing age from GitHub releases..."
    
    local arch
    arch=$(uname -m)
    local os
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    
    # Map architecture names
    case "$arch" in
        x86_64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l) arch="arm" ;;
        *) log_error "Unsupported architecture: $arch"; return 1 ;;
    esac
    
    local download_url="https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-${os}-${arch}.tar.gz"
    local temp_dir
    temp_dir=$(mktemp -d)
    
    # Download and extract
    curl -fsSL "$download_url" | tar -xz -C "$temp_dir" || {
        log_error "Failed to download age from: $download_url"
        rm -rf "$temp_dir"
        return 1
    }
    
    # Install binaries
    local age_dir="$temp_dir/age"
    if [[ -d "$age_dir" ]]; then
        cp "$age_dir/age" /usr/local/bin/
        cp "$age_dir/age-keygen" /usr/local/bin/
        chmod +x /usr/local/bin/age /usr/local/bin/age-keygen
    else
        log_error "age directory not found in downloaded archive"
        rm -rf "$temp_dir"
        return 1
    fi
    
    rm -rf "$temp_dir"
    log_debug "age installed from GitHub releases"
}

install_age_plugin_yubikey() {
    log_info "Installing age-plugin-yubikey..."
    
    # Check if already installed
    if command -v age-plugin-yubikey >/dev/null 2>&1; then
        log_info "age-plugin-yubikey already installed"
        return 0
    fi
    
    # Install via package manager or download binary
    if command -v apt-get >/dev/null 2>&1; then
        # Ubuntu/Debian - usually not available in repos
        install_age_plugin_yubikey_from_github
    elif command -v brew >/dev/null 2>&1; then
        # macOS
        brew install age-plugin-yubikey
    else
        install_age_plugin_yubikey_from_github
    fi
    
    # Verify installation
    if ! command -v age-plugin-yubikey >/dev/null 2>&1; then
        log_error "Failed to install age-plugin-yubikey"
        return 1
    fi
    
    log_success "age-plugin-yubikey installed successfully"
}

install_age_plugin_yubikey_from_github() {
    log_info "Installing age-plugin-yubikey from GitHub releases..."

    local arch
    arch=$(uname -m)
    local os
    os=$(uname -s | tr '[:upper:]' '[:lower:]')

    # Map architecture names and construct download URL
    local download_url=""
    case "$arch" in
        x86_64)
            download_url="https://github.com/str4d/age-plugin-yubikey/releases/download/v${AGE_PLUGIN_YUBIKEY_VERSION}/age-plugin-yubikey-v${AGE_PLUGIN_YUBIKEY_VERSION}-x86_64-${os}.tar.gz"
            ;;
        aarch64|arm64)
            if [[ "$os" == "darwin" ]]; then
                download_url="https://github.com/str4d/age-plugin-yubikey/releases/download/v${AGE_PLUGIN_YUBIKEY_VERSION}/age-plugin-yubikey-v${AGE_PLUGIN_YUBIKEY_VERSION}-arm64-darwin.tar.gz"
            else
                # No ARM64 Linux binaries available, fall back to building from source
                log_info "No pre-built ARM64 Linux binary available, building from source..."
                return install_age_plugin_yubikey_from_source
            fi
            ;;
        *)
            log_error "Unsupported architecture for age-plugin-yubikey: $arch"
            return 1
            ;;
    esac

    local temp_dir
    temp_dir=$(mktemp -d)

    # Download and extract
    curl -fsSL "$download_url" | tar -xz -C "$temp_dir" || {
        log_error "Failed to download age-plugin-yubikey from: $download_url"
        log_info "Falling back to building from source..."
        rm -rf "$temp_dir"
        return install_age_plugin_yubikey_from_source
    }

    # Install binary
    if [[ -f "$temp_dir/age-plugin-yubikey" ]]; then
        cp "$temp_dir/age-plugin-yubikey" /usr/local/bin/
        chmod +x /usr/local/bin/age-plugin-yubikey
    else
        log_error "age-plugin-yubikey binary not found in downloaded archive"
        rm -rf "$temp_dir"
        return 1
    fi

    rm -rf "$temp_dir"
    log_debug "age-plugin-yubikey installed from GitHub releases"
}

install_age_plugin_yubikey_from_source() {
    log_info "Building age-plugin-yubikey from source..."

    # Check if Rust is installed
    if ! command -v cargo >/dev/null 2>&1; then
        log_info "Installing Rust toolchain..."
        # Install Rust for the current user
        if [[ $EUID -eq 0 ]]; then
            # Running as root, install system-wide
            export RUSTUP_HOME=/opt/rust
            export CARGO_HOME=/opt/rust
            curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --no-modify-path
            export PATH="/opt/rust/bin:$PATH"
        else
            # Running as regular user
            curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
            # shellcheck source=/dev/null
            source "$HOME/.cargo/env" || {
                log_error "Failed to source Rust environment"
                return 1
            }
        fi

        # Verify Rust installation
        if ! command -v cargo >/dev/null 2>&1; then
            log_error "Rust installation failed"
            return 1
        fi
    fi

    # Install system dependencies for PC/SC support
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update && apt-get install -y libpcsclite-dev pkg-config build-essential
    elif command -v yum >/dev/null 2>&1; then
        yum install -y pcsc-lite-devel pkgconfig gcc
    elif command -v pacman >/dev/null 2>&1; then
        pacman -S --noconfirm pcsclite pkg-config base-devel
    else
        log_warning "Could not install PC/SC dependencies automatically"
        log_info "Please ensure libpcsclite-dev and build-essential (or equivalent) are installed"
    fi

    # Build and install age-plugin-yubikey
    log_info "Building age-plugin-yubikey v${AGE_PLUGIN_YUBIKEY_VERSION}... (this may take several minutes)"
    if cargo install age-plugin-yubikey --version "${AGE_PLUGIN_YUBIKEY_VERSION}" --root /usr/local; then
        log_success "age-plugin-yubikey built and installed successfully"
    else
        log_error "Failed to build age-plugin-yubikey from source"
        log_info "This may be due to missing system dependencies or network issues"
        return 1
    fi
}

install_yubikey_manager() {
    log_info "Installing YubiKey Manager CLI..."
    
    # Check if already installed
    if command -v ykman >/dev/null 2>&1; then
        local current_version
        current_version=$(ykman --version 2>/dev/null || echo "unknown")
        log_info "ykman already installed (version: $current_version)"
        return 0
    fi
    
    # Install via package manager
    if command -v apt-get >/dev/null 2>&1; then
        # Ubuntu/Debian
        apt-get update && apt-get install -y yubikey-manager
    elif command -v yum >/dev/null 2>&1; then
        # RHEL/CentOS
        yum install -y yubikey-manager
    elif command -v brew >/dev/null 2>&1; then
        # macOS
        brew install ykman
    else
        log_error "Unable to install YubiKey Manager - unsupported package manager"
        return 1
    fi
    
    # Verify installation
    if ! command -v ykman >/dev/null 2>&1; then
        log_error "Failed to install YubiKey Manager"
        return 1
    fi
    
    log_success "YubiKey Manager installed successfully"
}

install_dependencies() {
    log_info "Installing additional dependencies..."
    
    # Install yq for YAML processing
    if ! command -v yq >/dev/null 2>&1; then
        if command -v apt-get >/dev/null 2>&1; then
            apt-get update && apt-get install -y yq
        elif command -v brew >/dev/null 2>&1; then
            brew install yq
        else
            # Install from GitHub
            local yq_version="4.44.3"
            local arch
            arch=$(uname -m)
            local os
            os=$(uname -s | tr '[:upper:]' '[:lower:]')
            
            case "$arch" in
                x86_64) arch="amd64" ;;
                aarch64|arm64) arch="arm64" ;;
                *) arch="amd64" ;;
            esac
            
            curl -fsSL "https://github.com/mikefarah/yq/releases/download/v${yq_version}/yq_${os}_${arch}" -o /usr/local/bin/yq
            chmod +x /usr/local/bin/yq
        fi
    fi
    
    # Ensure other required tools are available
    local required_tools=("tar" "gzip" "openssl" "curl")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_error "Required tool not found: $tool"
            return 1
        fi
    done
    
    log_success "All dependencies installed"
}

setup_encryption_config() {
    log_info "Setting up encryption configuration..."
    
    # Create configuration directory
    mkdir -p /etc/dangerprep
    
    # Process and install configuration template
    local config_template="$CONFIG_DIR/security/encryption.yaml.tmpl"
    local config_file="/etc/dangerprep/encryption.yaml"
    
    if [[ -f "$config_template" ]]; then
        # Process template variables
        local current_date
        current_date=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        local username="${SUDO_USER:-root}"
        local hostname
        hostname=$(hostname -f 2>/dev/null || hostname)
        
        sed -e "s/{{CURRENT_DATE}}/$current_date/g" \
            -e "s/{{USERNAME}}/$username/g" \
            -e "s/{{HOSTNAME}}/$hostname/g" \
            "$config_template" > "$config_file"
        
        chmod 600 "$config_file"
        chown root:root "$config_file"
        
        log_success "Configuration file created: $config_file"
    else
        log_error "Configuration template not found: $config_template"
        return 1
    fi
}

install_encryption_scripts() {
    log_info "Installing encryption scripts..."
    
    # Copy main encryption script
    local main_script="$SCRIPT_DIR/../dangerprep-encryption.sh"
    if [[ -f "$main_script" ]]; then
        cp "$main_script" /usr/local/bin/
        chmod +x /usr/local/bin/dangerprep-encryption.sh
    else
        log_error "Main encryption script not found: $main_script"
        return 1
    fi
    
    # Copy command wrappers
    local encrypt_script="$SCRIPT_DIR/../bin/dp-encrypt"
    local decrypt_script="$SCRIPT_DIR/../bin/dp-decrypt"
    
    if [[ -f "$encrypt_script" ]]; then
        cp "$encrypt_script" /usr/local/bin/
        chmod +x /usr/local/bin/dp-encrypt
    else
        log_error "Encrypt command script not found: $encrypt_script"
        return 1
    fi
    
    if [[ -f "$decrypt_script" ]]; then
        cp "$decrypt_script" /usr/local/bin/
        chmod +x /usr/local/bin/dp-decrypt
    else
        log_error "Decrypt command script not found: $decrypt_script"
        return 1
    fi
    
    log_success "Encryption scripts installed"
}

setup_storage_directories() {
    log_info "Setting up storage directories..."
    
    # Create encrypted storage directory
    mkdir -p /data/encrypted
    chmod 700 /data/encrypted
    chown root:root /data/encrypted
    
    # Create backup directory
    mkdir -p /data/backup/pre-encryption
    chmod 700 /data/backup/pre-encryption
    chown root:root /data/backup/pre-encryption
    
    log_success "Storage directories created"
}

# Main setup function
main() {
    log_info "Setting up DangerPrep Encryption System..."
    
    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
    
    # Install all components
    install_age || exit 1
    install_age_plugin_yubikey || exit 1
    install_yubikey_manager || exit 1
    install_dependencies || exit 1
    
    # Setup configuration and scripts
    setup_encryption_config || exit 1
    install_encryption_scripts || exit 1
    setup_storage_directories || exit 1
    
    log_success "DangerPrep Encryption System setup completed!"
    log_info ""
    log_info "Next steps:"
    log_info "1. Insert your YubiKey"
    log_info "2. Run: dp-encrypt init"
    log_info "3. Configure targets in: /etc/dangerprep/encryption.yaml"
    log_info "4. Run: dp-encrypt"
    log_info ""
    log_info "Commands available:"
    log_info "  dp-encrypt        - Encrypt configured files/directories"
    log_info "  dp-decrypt        - Decrypt encrypted bundles"
    log_info "  dp-encrypt status - Show system status"
    log_info "  dp-encrypt init   - Initialize YubiKey PIV keys"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
