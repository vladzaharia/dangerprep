# Modularization Plan

## Overview

This document outlines a comprehensive plan for modularizing the monolithic 7,796-line the DangerPrep setup system into a maintainable, testable, and extensible architecture. The plan preserves all existing functionality while improving code organization, reusability, and maintainability.

## Current Architecture Analysis

### Monolithic Structure Issues
- **Single File**: 7,796 lines in one file
- **152 Functions**: All functions in global namespace
- **Mixed Concerns**: Configuration, installation, validation, and utilities mixed
- **Testing Challenges**: Difficult to unit test individual components
- **Maintenance Burden**: Changes require understanding entire codebase
- **Code Reuse**: Limited reusability across different contexts

### Existing Modular Elements (Strengths to Preserve)
- **External Templates**: Configuration templates in configuration module
- **Helper Scripts**: Environment processing in configuration module
- **Shared Utilities**: Gum utilities and banner modules
- **Standardized Functions**: Consistent patterns for common operations
- **Phase-Based Execution**: Clear installation phase structure

## Proposed Modular Architecture

### 1. Core Framework Module

#### `lib/dangerprep/core`
**Purpose**: Core framework and execution engine
**Functions**:
```bash
# Core execution framework
main()             # Main entry point
execute_installation_phases()  # Phase execution engine
handle_resume_logic()     # Resume capability
show_final_info()       # Completion reporting

# Error handling and cleanup
handle_error()         # Error handler
handle_interrupt()       # Signal handlers
cleanup_resources()      # Resource cleanup
acquire_lock()         # Lock management
release_lock()
```

#### `lib/dangerprep/logging`
**Purpose**: Logging and progress tracking
**Functions**:
```bash
setup_logging()        # Initialize logging
log_debug(), log_info(), etc. # Logging functions
show_progress()        # Progress indicators
enhanced_section()       # Section headers
enhanced_status_indicator()  # Status display
```

### 2. Configuration Management Module

#### `lib/dangerprep/config`
**Purpose**: Configuration collection and management
**Functions**:
```bash
collect_configuration()    # Main config collection
set_default_configuration_values() # Default values
save_configuration()      # Persistence
load_saved_configuration()   # State restoration
validate_configuration()    # Input validation
```

#### `lib/dangerprep/config/`
**Submodules**:
- `network` - Network configuration
- `security` - Security settings
- `users` - User account configuration
- `packages` - Package selection
- `docker` - Docker services configuration
- `hardware` - Hardware-specific configuration

### 3. System Operations Module

#### `lib/dangerprep/system`
**Purpose**: Core system operations
**Functions**:
```bash
check_system_requirements()  # System validation
check_root_privileges()    # Privilege checking
check_network_connectivity()  # Network testing
backup_original_configs()   # Configuration backup
update_system_packages()    # Package updates
```

#### `lib/dangerprep/system/`
**Submodules**:
- `validation` - Input validation functions
- `requirements` - System requirement checking
- `backup` - Backup and restore operations
- `permissions` - File and directory permissions

### 4. Package Management Module

#### `lib/dangerprep/packages`
**Purpose**: Package installation and repository management
**Functions**:
```bash
setup_package_repositories()  # Repository configuration
install_essential_packages()  # Core package installation
install_packages_with_selection() # Interactive installation
install_friendlyelec_packages() # Hardware-specific packages
```

#### `lib/dangerprep/packages/`
**Submodules**:
- `repositories` - Repository management
- `selection` - Package selection logic
- `installation` - Installation procedures
- `validation` - Package validation

### 5. Docker Services Module

#### `lib/dangerprep/docker`
**Purpose**: Docker and container management
**Functions**:
```bash
configure_rootless_docker()  # Docker installation
setup_docker_services()    # Service configuration
deploy_selected_docker_services() # Service deployment
setup_docker_secrets()    # Secret management
```

#### `lib/dangerprep/docker/`
**Submodules**:
- `installation` - Docker installation
- `services` - Service management
- `networks` - Network configuration
- `secrets` - Secret management
- `health` - Health monitoring

### 6. Network Configuration Module

#### `lib/dangerprep/network`
**Purpose**: Network interface and service configuration
**Functions**:
```bash
detect_network_interfaces()  # Interface detection
setup_raspap()        # WiFi AP configuration
setup_tailscale()       # VPN configuration
setup_advanced_dns()     # DNS services
```

#### `lib/dangerprep/network/`
**Submodules**:
- `interfaces` - Interface management
- `wifi` - WiFi and AP configuration
- `vpn` - VPN services
- `dns` - DNS configuration
- `firewall` - Firewall management

### 7. Security Hardening Module

#### `lib/dangerprep/security`
**Purpose**: System security configuration
**Functions**:
```bash
configure_ssh_hardening()   # SSH security
setup_fail2ban()       # Intrusion prevention
configure_kernel_hardening()  # Kernel security
setup_file_integrity_monitoring() # AIDE configuration
setup_advanced_security_tools()  # Additional tools
```

#### `lib/dangerprep/security/`
**Submodules**:
- `ssh` - SSH hardening
- `firewall` - Firewall configuration
- `monitoring` - Security monitoring
- `hardening` - System hardening
- `tools` - Security tool configuration

### 8. Hardware Support Module

#### `lib/dangerprep/hardware`
**Purpose**: Hardware detection and optimization
**Functions**:
```bash
detect_friendlyelec_platform() # Platform detection
configure_friendlyelec_hardware() # Hardware config
configure_rk3588_performance()   # Performance tuning
setup_hardware_monitoring()    # Sensor monitoring
```

#### `lib/dangerprep/hardware/`
**Submodules**:
- `detection` - Platform detection
- `friendlyelec` - FriendlyElec support
- `performance` - Performance optimization
- `sensors` - Hardware monitoring
- `gpio` - GPIO/PWM configuration

### 9. User Management Module

#### `lib/dangerprep/users`
**Purpose**: User account management
**Functions**:
```bash
configure_user_accounts()   # User configuration
create_new_user()       # User creation
import_github_ssh_keys()   # SSH key import
create_reboot_finalization_script() # Pi user cleanup
```

#### `lib/dangerprep/users/`
**Submodules**:
- `creation` - User creation
- `migration` - User migration (pi -> new user)
- `ssh_keys` - SSH key management
- `permissions` - User permissions

### 10. Storage Management Module

#### `lib/dangerprep/storage`
**Purpose**: Storage detection and configuration
**Functions**:
```bash
detect_and_configure_nvme_storage() # NVMe detection
create_nvme_partitions()       # Partitioning
mount_existing_nvme_partitions()   # Mount management
```

#### `lib/dangerprep/storage/`
**Submodules**:
- `detection` - Storage detection
- `partitioning` - Disk partitioning
- `mounting` - Mount management
- `backup` - Storage backup

### 11. Utility Libraries

#### `lib/dangerprep/utils/`
**Shared Utilities**:
- `file_operations` - File manipulation utilities
- `template_processing` - Template processing
- `validation` - Input validation
- `retry` - Retry mechanisms
- `progress` - Progress indicators

## Migration Strategy

### Phase 1: Extract Utility Functions (Week 1)
1. **Create Library Structure**
  ```bash
  mkdir -p lib/dangerprep/{config,system,packages,docker,network,security,hardware,users,storage,utils}
  ```

2. **Extract Core Utilities**
  - Move standardized helper functions to `lib/dangerprep/utils/`
  - Extract validation functions to `lib/dangerprep/utils/validation`
  - Move file operations to `lib/dangerprep/utils/file_operations`

3. **Update Main Script**
  - Add library loading mechanism
  - Replace function calls with library imports
  - Test basic functionality

### Phase 2: Configuration Module (Week 2)
1. **Extract Configuration Functions**
  - Move configuration collection to `lib/dangerprep/config`
  - Create specialized config modules
  - Implement configuration validation

2. **Template Integration**
  - Move template processing to utilities
  - Standardize template variable handling
  - Create template validation

### Phase 3: System Operations (Week 3)
1. **System Module Creation**
  - Extract system requirement checking
  - Move package management functions
  - Create backup and restore utilities

2. **Error Handling Standardization**
  - Centralize error handling
  - Standardize return codes
  - Implement comprehensive logging

### Phase 4: Service Modules (Week 4-5)
1. **Docker Module**
  - Extract Docker installation and configuration
  - Create service deployment framework
  - Implement health monitoring

2. **Network Module**
  - Extract network configuration
  - Create interface management
  - Implement service configuration

### Phase 5: Security and Hardware (Week 6)
1. **Security Module**
  - Extract security hardening functions
  - Create monitoring configuration
  - Implement security validation

2. **Hardware Module**
  - Extract hardware detection
  - Create platform-specific modules
  - Implement performance optimization

### Phase 6: Integration and Testing (Week 7-8)
1. **Integration Testing**
  - Test modular architecture
  - Validate all functionality
  - Performance testing

2. **Documentation Updates**
  - Update function documentation
  - Create module usage guides
  - Update installation procedures

## Module Interface Design

### Standard Module Structure
```bash
#!/bin/bash
# Module: lib/dangerprep/module_name
# Purpose: Module description
# Dependencies: List of required modules

# Module metadata
readonly MODULE_NAME="module_name"
readonly MODULE_VERSION="1.0.0"

# Module initialization
init_module_name() {
  # Module-specific initialization
  log_debug "Initializing $MODULE_NAME module"
}

# Public functions
public_function() {
  # Function implementation
}

# Private functions (prefixed with _)
_private_function() {
  # Internal function implementation
}

# Module cleanup
cleanup_module_name() {
  # Module-specific cleanup
  log_debug "Cleaning up $MODULE_NAME module"
}
```

### Module Loading System
```bash
# lib/dangerprep/loader
load_module() {
  local module_name="$1"
  local module_path="$LIB_DIR/dangerprep/${module_name}"
  
  if [[ -f "$module_path" ]]; then
    source "$module_path"
    if declare -f "init_${module_name}" >/dev/null; then
      "init_${module_name}"
    fi
  else
    log_error "Module not found: $module_name"
    return 1
  fi
}
```

## Testing Strategy Integration

### Unit Testing Framework
```bash
# tests/unit/test_module_name
#!/bin/bash
source "$(dirname "$0")/test_framework"
source "$(dirname "$0")/../../lib/dangerprep/module_name"

test_function_name() {
  # Test implementation
  assert_equals "expected" "$(function_call)"
}

run_tests() {
  test_function_name
  # Additional tests
}
```

### Integration Testing
- **Module Integration**: Test module interactions
- **End-to-End Testing**: Full installation testing
- **Platform Testing**: Test on different hardware
- **Regression Testing**: Ensure no functionality loss

## Benefits of Modular Architecture

### 1. Maintainability
- **Focused Modules**: Each module has single responsibility
- **Clear Interfaces**: Well-defined module boundaries
- **Easier Debugging**: Isolated functionality for troubleshooting
- **Code Reuse**: Modules can be used in different contexts

### 2. Testability
- **Unit Testing**: Individual functions can be tested in isolation
- **Mock Dependencies**: External dependencies can be mocked
- **Regression Testing**: Changes can be tested systematically
- **Continuous Integration**: Automated testing pipeline

### 3. Extensibility
- **Plugin Architecture**: New modules can be added easily
- **Platform Support**: Hardware-specific modules
- **Service Integration**: New services can be added modularly
- **Configuration Options**: Flexible configuration system

### 4. Performance
- **Lazy Loading**: Load only required modules
- **Parallel Execution**: Independent modules can run in parallel
- **Resource Management**: Better resource utilization
- **Caching**: Module-level caching capabilities

## Migration Timeline

| Week | Phase | Deliverables |
|------|-------|-------------|
| 1 | Utility Extraction | Core utilities, validation, file operations |
| 2 | Configuration Module | Config collection, validation, persistence |
| 3 | System Operations | Requirements, packages, backup |
| 4 | Docker Module | Installation, services, networking |
| 5 | Network Module | Interfaces, WiFi, VPN, DNS |
| 6 | Security & Hardware | Hardening, monitoring, optimization |
| 7 | Integration | Module integration, testing |
| 8 | Documentation | Complete documentation, guides |

## Risk Mitigation

### 1. Functionality Preservation
- **Comprehensive Testing**: Test all existing functionality
- **Gradual Migration**: Migrate modules incrementally
- **Rollback Plan**: Maintain original script as backup
- **Validation Testing**: Verify identical behavior

### 2. Performance Impact
- **Benchmarking**: Compare performance before/after
- **Optimization**: Optimize module loading
- **Profiling**: Identify performance bottlenecks
- **Monitoring**: Track resource usage

### 3. Compatibility
- **Platform Testing**: Test on all supported platforms
- **Version Compatibility**: Ensure backward compatibility
- **Dependency Management**: Handle module dependencies
- **Error Handling**: Graceful degradation

---

*This modularization plan provides a comprehensive roadmap for transforming the monolithic setup script into a maintainable, testable, and extensible modular architecture while preserving all existing functionality.*
