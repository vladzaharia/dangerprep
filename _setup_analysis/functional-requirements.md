# Functional Requirements Analysis

## Overview

The DangerPrep setup system implements a comprehensive system setup solution for the DangerPrep emergency router and content hub project. This document analyzes the functional requirements derived from the implementation.

## Primary Use Cases

### 1. Emergency Router Setup
**Requirement**: Transform Ubuntu 24.04 systems into emergency routers and content hubs
- **Target Hardware**: FriendlyElec devices (NanoPi R6C, NanoPi M6, NanoPC-T6) and generic ARM64/x86_64
- **Network Capabilities**: WiFi AP, routing, VPN (Tailscale), DNS management
- **Content Serving**: Media (Jellyfin), eBooks (Komga), offline content (Kiwix)

### 2. Disaster Recovery Platform
**Requirement**: Provide offline-capable content and communication hub
- **Offline Operation**: Function without internet connectivity
- **Content Synchronization**: Sync with central NAS when internet available
- **Emergency Services**: Local WiFi hotspot, content repository, communication tools

### 3. Travel Router
**Requirement**: Portable networking solution for travel scenarios
- **WiFi Repeater**: Extend existing WiFi networks
- **VPN Gateway**: Secure internet access through Tailscale
- **Content Hub**: Portable media and document server

## Core Functional Areas

### 1. System Foundation

#### 1.1 Script Security and Error Handling
```bash
# Modern shell script security
set -euo pipefail
IFS=$'\n\t'
```
**Requirements**:
- Fail fast on any error (`-e`)
- Fail on undefined variables (`-u`)
- Fail on pipe errors (`-o pipefail`)
- Secure IFS to prevent word splitting attacks

#### 1.2 Metadata and Version Management
```bash
# Script metadata
declare SCRIPT_NAME
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
readonly SCRIPT_NAME
readonly SCRIPT_VERSION="2.0.0"
readonly REQUIRED_BASH_VERSION="4.0"
```
**Requirements**:
- Version tracking for compatibility and updates
- Bash version validation (minimum 4.0)
- Immutable script metadata

#### 1.3 Debug Mode Support
```bash
# Debug mode activation
if [[ "${DEBUG:-}" == "true" ]]; then
  set -x
fi
```
**Requirements**:
- Optional debug tracing via environment variable
- Non-intrusive debugging capability

#### 1.4 Global State Management
```bash
# Global state variables
CLEANUP_PERFORMED=false
LOCK_ACQUIRED=false
TEMP_DIR=""
CLEANUP_TASKS=()
```
**Requirements**:
- Track cleanup state to prevent double-cleanup
- Lock file management for concurrent execution prevention
- Temporary directory management
- Cleanup task queue for proper resource management

### 2. Standardized Helper Functions

#### 2.1 Package Installation Framework
**Function**: `install_packages_with_selection()`
**Requirements**:
- Interactive package category selection
- Support for multiple package categories
- Pre-configuration support for non-interactive mode
- Consistent error handling and logging
- Package count display for user awareness

#### 2.2 Installation Step Management
**Function**: `standard_installer_step()`
**Requirements**:
- Standardized step execution with progress tracking
- Error handling with context preservation
- Step numbering and progress indication
- Consistent logging format

#### 2.3 Secure File Operations
**Function**: `standard_secure_copy()`
**Requirements**:
- Secure file copying with permission setting
- Ownership management
- Backup creation before modification
- Atomic operations where possible

#### 2.4 Directory Management
**Function**: `standard_create_directory()`
**Requirements**:
- Secure directory creation with proper permissions
- Parent directory creation support
- Ownership and group management
- Idempotent operations

#### 2.5 Permission Management
**Function**: `standard_set_permissions()`
**Requirements**:
- Comprehensive permission setting (mode, owner, group)
- Recursive permission support
- Validation of permission changes
- Security-focused defaults

#### 2.6 Service Management
**Function**: `standard_service_operation()`
**Requirements**:
- Standardized systemd service operations
- Timeout handling for service operations
- Status verification
- Error recovery mechanisms

#### 2.7 Systemd Service Creation
**Function**: `standard_create_service_file()`
**Requirements**:
- Dynamic systemd service file creation
- Service enabling and starting
- Service validation
- Template-based service configuration

#### 2.8 Cron Job Management
**Functions**: `standard_create_cron_job()`, `standard_remove_cron_job()`
**Requirements**:
- Secure cron job creation in `/etc/cron.d/`
- Job description and metadata
- User-specific cron jobs
- Cleanup and removal capabilities

#### 2.9 Environment File Management
**Function**: `standard_create_env_file()`
**Requirements**:
- Secure environment file creation
- Restrictive permissions (600) by default
- Content validation
- Ownership management

#### 2.10 Template Processing
**Function**: `standard_process_template()`
**Requirements**:
- Variable substitution in template files
- Environment variable expansion
- Secure template processing
- Output file management

### 3. Advanced Utility Functions

#### 3.1 Directory Hierarchy Management
**Function**: `standard_create_directory_hierarchy()`
**Requirements**:
- Complex directory structure creation
- Per-directory permission and ownership specification
- Validation of created structures
- Rollback capability on failure

#### 3.2 Directory Structure Validation
**Function**: `standard_validate_directory_structure()`
**Requirements**:
- Verify required directory structures exist
- Permission and ownership validation
- Comprehensive structure checking
- Detailed error reporting

#### 3.3 Backup and Restore System
**Functions**: `standard_create_backup()`, `standard_restore_backup()`
**Requirements**:
- Timestamped backup creation
- Compressed backup storage
- Backup verification
- Restore with validation
- Backup cleanup and rotation

#### 3.4 SSH Key Management
**Function**: `import_github_ssh_keys()`
**Requirements**:
- GitHub SSH key import
- Key validation and formatting
- User-specific key installation
- Duplicate key prevention
- Error handling for network issues

### 4. System Validation and Requirements

#### 4.1 Bash Version Validation
**Function**: `check_bash_version()`
**Requirements**:
- Minimum Bash version enforcement (4.0+)
- Version comparison logic
- Clear error messaging for incompatible versions

#### 4.2 Retry Mechanism
**Function**: `retry_with_backoff()`
**Requirements**:
- Exponential backoff retry logic
- Configurable maximum attempts
- Delay management with maximum limits
- Command execution with retry

#### 4.3 Input Validation Framework
**Functions**: Multiple validation functions
**Requirements**:
- IP address validation (IPv4)
- Network interface name validation
- Path safety validation (prevent traversal attacks)
- Port number validation (1-65535)
- Comprehensive input sanitization

## Configuration Management Requirements

### 1. Interactive Configuration Collection
**Requirement**: Collect all configuration upfront before installation begins
- **User Experience**: Single configuration phase, then automated execution
- **Resumability**: Save configuration state for interrupted installations
- **Validation**: Comprehensive input validation and confirmation
- **Non-Interactive Mode**: Support for automated deployments

### 2. Template-Based Configuration
**Requirement**: Use external templates for all configuration files
- **Maintainability**: Separate configuration from code
- **Customization**: Easy modification without code changes
- **Version Control**: Track configuration changes separately
- **Validation**: Template syntax and variable validation

### 3. Environment Variable Processing
**Requirement**: Advanced environment variable handling with PROMPT/GENERATE directives
- **PROMPT Directive**: Interactive user input with type validation
- **GENERATE Directive**: Automatic secure value generation
- **Type Support**: Email, password, base64, hex, bcrypt generation
- **Optional Fields**: Support for optional configuration values

## Security Requirements

### 1. System Hardening
**Requirement**: Comprehensive security hardening of Ubuntu 24.04
- **SSH Hardening**: Secure SSH configuration with key-based auth
- **Kernel Hardening**: Security-focused kernel parameters
- **Network Security**: Firewall configuration and intrusion prevention
- **File Integrity**: AIDE-based file integrity monitoring

### 2. Container Security
**Requirement**: Secure Docker container deployment
- **Rootless Docker**: Non-privileged container execution
- **Secret Management**: Secure handling of sensitive data
- **Network Isolation**: Container network security
- **Health Monitoring**: Container health and security monitoring

### 3. User Management Security
**Requirement**: Secure user account management
- **Default User Replacement**: Remove default 'pi' user
- **SSH Key Management**: Secure SSH key deployment
- **Permission Management**: Principle of least privilege
- **Account Lockdown**: Disable unnecessary accounts

## Hardware Support Requirements

### 1. FriendlyElec Platform Support
**Requirement**: Optimized support for FriendlyElec hardware
- **Platform Detection**: Automatic hardware detection
- **Performance Optimization**: Hardware-specific tuning
- **GPIO/PWM Support**: Hardware interface configuration
- **Thermal Management**: Temperature monitoring and fan control

### 2. Generic Hardware Support
**Requirement**: Support for standard ARM64 and x86_64 systems
- **Fallback Configuration**: Generic hardware configuration
- **Feature Detection**: Capability-based feature enabling
- **Performance Tuning**: Generic optimization strategies

## Network Configuration Requirements

### 1. Interface Management
**Requirement**: Automatic network interface detection and configuration
- **Multi-Interface Support**: Handle multiple ethernet and WiFi interfaces
- **Interface Selection**: Interactive or automatic interface selection
- **Bonding Support**: Network interface bonding for redundancy

### 2. WiFi Access Point
**Requirement**: WiFi hotspot functionality via RaspAP
- **AP Configuration**: Automated access point setup
- **DHCP Management**: Dynamic IP address assignment
- **DNS Services**: Local DNS resolution
- **Captive Portal**: Optional captive portal functionality

### 3. VPN Integration
**Requirement**: Tailscale VPN integration
- **Automatic Setup**: Streamlined Tailscale configuration
- **Mesh Networking**: Integration with Tailscale mesh
- **Split Tunneling**: Selective traffic routing
- **DNS Integration**: Tailscale DNS configuration

## Service Deployment Requirements

### 1. Docker Service Management
**Requirement**: Comprehensive Docker service deployment
- **Service Selection**: Interactive service selection
- **Environment Configuration**: Automated environment setup
- **Health Monitoring**: Service health checking
- **Update Management**: Automated service updates

### 2. Core Services
**Requirement**: Essential service deployment
- **Reverse Proxy**: Traefik for service routing
- **Media Server**: Jellyfin for media content
- **Document Server**: Komga for books and comics
- **Management Interface**: Komodo for Docker management

### 3. Optional Services
**Requirement**: Selectable additional services
- **DNS Filtering**: AdGuard Home for DNS filtering
- **Monitoring**: System and service monitoring
- **Backup Services**: Automated backup solutions
- **Sync Services**: Content synchronization tools

## Installation and Deployment Requirements

### 1. Phase-Based Installation
**Requirement**: Sequential installation phases with progress tracking
- **33 Installation Phases**: Comprehensive system setup
- **Progress Tracking**: Visual progress indication
- **Resume Capability**: Resume from failed or interrupted installations
- **Rollback Support**: Ability to undo changes on failure

### 2. Error Handling and Recovery
**Requirement**: Comprehensive error handling and recovery
- **Graceful Failure**: Clean failure handling with informative messages
- **Automatic Cleanup**: Resource cleanup on failure
- **Recovery Procedures**: Documented recovery steps
- **Emergency Recovery**: Emergency recovery service for boot issues

### 3. Verification and Testing
**Requirement**: Post-installation verification
- **Service Verification**: Confirm all services are running
- **Network Testing**: Validate network configuration
- **Security Validation**: Confirm security measures are active
- **Performance Testing**: Basic performance validation

## Maintenance and Operations Requirements

### 1. Logging and Monitoring
**Requirement**: Comprehensive logging and monitoring
- **Structured Logging**: Consistent log format and levels
- **Log Rotation**: Automatic log management
- **Performance Metrics**: Installation timing and metrics
- **Error Tracking**: Detailed error logging and context

### 2. Update and Maintenance
**Requirement**: System update and maintenance capabilities
- **Automatic Updates**: Unattended security updates
- **Service Updates**: Docker service update management
- **Configuration Updates**: Template and configuration updates
- **Backup Management**: Automated backup creation and rotation

### 3. Documentation and Support
**Requirement**: Comprehensive documentation and support
- **Installation Logs**: Detailed installation logging
- **Configuration Documentation**: Generated configuration documentation
- **Troubleshooting Guides**: Automated troubleshooting information
- **Recovery Procedures**: Emergency recovery documentation

---

*This functional requirements analysis covers the primary use cases and requirements derived from the DangerPrep setup system implementation. Each requirement is traceable to specific implementation details and functional areas.*
