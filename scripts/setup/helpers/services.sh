#!/usr/bin/env bash
# DangerPrep Service Management Helper Functions
#
# Purpose: Consolidated service installation, configuration, and management functions
# Usage: Source this file to access service management functions
# Dependencies: logging.sh, errors.sh, directories.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices

# Prevent multiple sourcing
if [[ "${SERVICES_HELPER_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SERVICES_HELPER_LOADED="true"

set -euo pipefail

# Get the directory where this script is located
SERVICES_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${SERVICES_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${SERVICES_HELPER_DIR}/../../shared/errors.sh"
fi

if [[ -z "${DIRECTORIES_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./directories.sh
    source "${SERVICES_HELPER_DIR}/directories.sh"
fi

# Mark this file as sourced
export SERVICES_HELPER_SOURCED=true

#
# User and Group Management Functions
#

# Create system user for service
# Usage: create_service_user "username" [home_dir] [shell]
# Returns: 0 if successful, 1 if failed
create_service_user() {
    local username="$1"
    local home_dir="${2:-/var/lib/${username}}"
    local shell="${3:-/usr/sbin/nologin}"
    
    if [[ -z "$username" ]]; then
        error "Username is required for create_service_user"
        return 1
    fi
    
    # Check if user already exists
    if id "$username" >/dev/null 2>&1; then
        debug "User $username already exists"
        return 0
    fi
    
    log "Creating system user: $username"
    
    # Create system user with no login shell
    if useradd --system --home-dir "$home_dir" --shell "$shell" \
               --comment "DangerPrep $username service user" "$username"; then
        success "Created system user: $username"
        return 0
    else
        error "Failed to create system user: $username"
        return 1
    fi
}

# Create system group for service
# Usage: create_service_group "groupname"
# Returns: 0 if successful, 1 if failed
create_service_group() {
    local groupname="$1"
    
    if [[ -z "$groupname" ]]; then
        error "Group name is required for create_service_group"
        return 1
    fi
    
    # Check if group already exists
    if getent group "$groupname" >/dev/null 2>&1; then
        debug "Group $groupname already exists"
        return 0
    fi
    
    log "Creating system group: $groupname"
    
    if groupadd --system "$groupname"; then
        success "Created system group: $groupname"
        return 0
    else
        error "Failed to create system group: $groupname"
        return 1
    fi
}

#
# Service Installation Functions
#

# Download and install binary from GitHub releases
# Usage: install_github_binary "owner/repo" "binary_name" [version] [install_path]
# Returns: 0 if successful, 1 if failed
install_github_binary() {
    local repo="$1"
    local binary_name="$2"
    local version="${3:-latest}"
    local install_path="${4:-/usr/local/bin}"
    
    if [[ -z "$repo" ]] || [[ -z "$binary_name" ]]; then
        error "Repository and binary name are required"
        return 1
    fi
    
    log "Installing $binary_name from $repo..."
    
    # Determine architecture
    local arch="amd64"
    if [[ "$(uname -m)" == "aarch64" ]]; then
        arch="arm64"
    fi
    
    # Get latest version if not specified
    if [[ "$version" == "latest" ]]; then
        version=$(get_latest_github_version "$repo")
        if [[ -z "$version" ]]; then
            error "Failed to get latest version for $repo"
            return 1
        fi
    fi
    
    # Construct download URL (this is a simplified pattern, may need customization)
    local download_url="https://github.com/${repo}/releases/download/v${version}/${binary_name}_linux_${arch}.tar.gz"
    
    # Create temporary directory for download
    local temp_dir
    temp_dir=$(mktemp -d)
    
    # Download and extract
    if curl -fsSL "$download_url" -o "${temp_dir}/${binary_name}.tar.gz"; then
        if tar -xzf "${temp_dir}/${binary_name}.tar.gz" -C "$temp_dir"; then
            # Find the binary and install it
            local binary_file
            binary_file=$(find "$temp_dir" -name "$binary_name" -type f -executable | head -1)
            
            if [[ -n "$binary_file" ]]; then
                cp "$binary_file" "${install_path}/${binary_name}"
                chmod +x "${install_path}/${binary_name}"
                success "Installed $binary_name to $install_path"
                rm -rf "$temp_dir"
                return 0
            else
                error "Binary $binary_name not found in downloaded archive"
                rm -rf "$temp_dir"
                return 1
            fi
        else
            error "Failed to extract $binary_name archive"
            rm -rf "$temp_dir"
            return 1
        fi
    else
        error "Failed to download $binary_name from $download_url"
        rm -rf "$temp_dir"
        return 1
    fi
}

# Get latest version from GitHub API
# Usage: get_latest_github_version "owner/repo"
# Returns: version string without 'v' prefix
get_latest_github_version() {
    local repo="$1"
    
    if [[ -z "$repo" ]]; then
        return 1
    fi
    
    local latest_version
    latest_version=$(curl -s "https://api.github.com/repos/${repo}/releases/latest" | \
                    grep '"tag_name":' | \
                    sed -E 's/.*"([^"]+)".*/\1/' 2>/dev/null)
    
    if [[ -n "$latest_version" && "$latest_version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        # Remove 'v' prefix if present
        echo "${latest_version#v}"
    else
        echo ""
    fi
}

#
# Systemd Service Management Functions
#

# Create systemd service file from template
# Usage: create_systemd_service "service_name" "template_content"
# Returns: 0 if successful, 1 if failed
create_systemd_service() {
    local service_name="$1"
    local template_content="$2"
    
    if [[ -z "$service_name" ]] || [[ -z "$template_content" ]]; then
        error "Service name and template content are required"
        return 1
    fi
    
    local service_file="/etc/systemd/system/${service_name}.service"
    
    log "Creating systemd service: $service_name"
    
    # Write service file
    if echo "$template_content" > "$service_file"; then
        chmod 644 "$service_file"
        
        # Reload systemd daemon
        systemctl daemon-reload
        
        success "Created systemd service: $service_name"
        return 0
    else
        error "Failed to create systemd service file: $service_file"
        return 1
    fi
}

# Enable and start systemd service
# Usage: enable_and_start_service "service_name"
# Returns: 0 if successful, 1 if failed
enable_and_start_service() {
    local service_name="$1"
    
    if [[ -z "$service_name" ]]; then
        error "Service name is required"
        return 1
    fi
    
    log "Enabling and starting service: $service_name"
    
    # Enable service
    if systemctl enable "$service_name"; then
        # Start service
        if systemctl start "$service_name"; then
            # Verify service is running
            if systemctl is-active --quiet "$service_name"; then
                success "Service $service_name is running"
                return 0
            else
                error "Service $service_name failed to start"
                return 1
            fi
        else
            error "Failed to start service: $service_name"
            return 1
        fi
    else
        error "Failed to enable service: $service_name"
        return 1
    fi
}

# Check service status and health
# Usage: check_service_health "service_name" [port]
# Returns: 0 if healthy, 1 if unhealthy
check_service_health() {
    local service_name="$1"
    local port="${2:-}"
    
    if [[ -z "$service_name" ]]; then
        error "Service name is required"
        return 1
    fi
    
    # Check if service is active
    if ! systemctl is-active --quiet "$service_name"; then
        warning "Service $service_name is not active"
        return 1
    fi
    
    # Check if service is enabled
    if ! systemctl is-enabled --quiet "$service_name"; then
        warning "Service $service_name is not enabled"
    fi
    
    # Check port if specified
    if [[ -n "$port" ]]; then
        if command -v ss >/dev/null 2>&1; then
            if ! ss -tuln | grep -q ":${port} "; then
                warning "Service $service_name is not listening on port $port"
                return 1
            fi
        elif command -v netstat >/dev/null 2>&1; then
            if ! netstat -tuln | grep -q ":${port} "; then
                warning "Service $service_name is not listening on port $port"
                return 1
            fi
        fi
    fi
    
    success "Service $service_name is healthy"
    return 0
}

#
# Service Configuration Functions
#

# Apply service configuration from template
# Usage: apply_service_config "service_name" "config_template" "config_path"
# Returns: 0 if successful, 1 if failed
apply_service_config() {
    local service_name="$1"
    local config_template="$2"
    local config_path="$3"
    
    if [[ -z "$service_name" ]] || [[ -z "$config_template" ]] || [[ -z "$config_path" ]]; then
        error "Service name, config template, and config path are required"
        return 1
    fi
    
    log "Applying configuration for service: $service_name"
    
    # Create config directory if it doesn't exist
    local config_dir
    config_dir=$(dirname "$config_path")
    if ! create_secure_directory "$config_dir" "755" "root:root"; then
        return 1
    fi
    
    # Write configuration file
    if echo "$config_template" > "$config_path"; then
        chmod 644 "$config_path"
        success "Applied configuration for $service_name"
        return 0
    else
        error "Failed to write configuration file: $config_path"
        return 1
    fi
}

# Export functions for use in other scripts
export -f create_service_user
export -f create_service_group
export -f install_github_binary
export -f get_latest_github_version
export -f create_systemd_service
export -f enable_and_start_service
export -f check_service_health
export -f apply_service_config
