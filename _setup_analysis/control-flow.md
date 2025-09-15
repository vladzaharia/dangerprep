# Control Flow Analysis

## Overview

This document analyzes the execution flow, decision logic, and control structures in the DangerPrep setup system. The script follows a sophisticated phase-based execution model with comprehensive error handling and resume capabilities.

## Main Execution Flow

### 1. Script Initialization

```mermaid
graph TD
  A[Script Start] --> B[Parse Arguments]
  B --> C[Initialize Paths]
  C --> D[Show Banner]
  D --> E[Check Root Privileges]
  E --> F{Root Check}
  F -->|Fail| G[Exit with Error]
  F -->|Pass| H[Setup Logging]
  H --> I[Acquire Lock]
  I --> J{Lock Acquired}
  J -->|Fail| K[Exit with Error]
  J -->|Pass| L[Create Temp Directory]
  L --> M[Pre-flight Checks]
```

**Key Decision Points**:
- **Root Privilege Check**: Must run as root/sudo
- **Lock Acquisition**: Prevents concurrent execution
- **Network Connectivity**: Required for package downloads

### 2. Configuration Collection Phase

```mermaid
graph TD
  A[Configuration Start] --> B{Interactive Mode?}
  B -->|No| C[Set Default Values]
  B -->|Yes| D[Load Saved Config]
  D --> E{Config Exists?}
  E -->|Yes| F[Load Previous Config]
  E -->|No| G[Collect New Config]
  F --> H[Confirm Loaded Config]
  G --> I[Package Selection]
  I --> J[Docker Services Selection]
  J --> K[Network Configuration]
  K --> L[User Account Setup]
  L --> M[Storage Configuration]
  M --> N[Show Summary]
  N --> O{User Confirms?}
  O -->|No| P[Return to Config]
  O -->|Yes| Q[Save Configuration]
  C --> Q
  H --> Q
  Q --> R[Export Variables]
```

**Configuration Decision Logic**:
- **Non-Interactive Mode**: Use defaults, skip prompts
- **Force Interactive**: Override non-interactive detection
- **Saved Configuration**: Resume with previous choices
- **User Confirmation**: Final approval before proceeding

### 3. Phase-Based Installation System

#### Installation Phases Array
```bash
installation_phases=(
  "backup_original_configs:Backing up original configurations"
  "update_system_packages:Updating system packages"
  "install_essential_packages:Installing essential packages"
  "setup_automatic_updates:Setting up automatic updates"
  "detect_and_configure_nvme_storage:Detecting and configuring NVMe storage"
  "load_motd_config:Loading MOTD configuration"
  "configure_kernel_hardening:Configuring kernel hardening"
  "setup_file_integrity_monitoring:Setting up file integrity monitoring"
  "setup_hardware_monitoring:Setting up hardware monitoring"
  "setup_advanced_security_tools:Setting up advanced security tools"
  "configure_rootless_docker:Configuring rootless Docker"
  "enumerate_docker_services:Enumerating Docker services"
  "setup_docker_services:Setting up Docker services"
  "setup_container_health_monitoring:Setting up container health monitoring"
  "detect_network_interfaces:Detecting network interfaces"
  "setup_raspap:Setting up RaspAP"
  "configure_rk3588_performance:Applying hardware optimizations"
  "generate_sync_configs:Generating sync configurations"
  "setup_tailscale:Setting up Tailscale"
  "setup_advanced_dns:Setting up advanced DNS"
  "setup_certificate_management:Setting up certificate management"
  "install_management_tools:Installing management tools"
  "create_routing_scenarios:Creating routing scenarios"
  "setup_system_monitoring:Setting up system monitoring"
  "configure_nfs_client:Configuring NFS client"
  "install_maintenance_tools:Installing maintenance tools"
  "setup_encrypted_backups:Setting up encrypted backups"
  "configure_user_accounts:Configuring user accounts"
  "configure_screen_lock:Configuring screen lock settings"
  "create_emergency_recovery_service:Creating emergency recovery service"
  "enable_essential_services:Enabling essential system services"
  "start_all_services:Starting all services"
  "verify_setup:Verifying setup"
)
```

#### Phase Execution Logic

```mermaid
graph TD
  A[Start Phase Loop] --> B[Get Next Phase]
  B --> C{Resume Mode?}
  C -->|Yes| D{Phase Completed?}
  D -->|Yes| E[Skip Phase]
  D -->|No| F[Execute Phase]
  C -->|No| F
  E --> G{More Phases?}
  F --> H{Dry Run Mode?}
  H -->|Yes| I[Log Dry Run]
  H -->|No| J[Check Function Exists]
  J --> K{Function Exists?}
  K -->|No| L[Exit with Error]
  K -->|Yes| M[Mark In Progress]
  M --> N[Execute Function]
  N --> O{Function Success?}
  O -->|No| P[Mark Failed & Exit]
  O -->|Yes| Q[Mark Completed]
  I --> G
  Q --> G
  G -->|Yes| B
  G -->|No| R[Show Final Info]
```

**Phase Control Logic**:
- **Resume Detection**: Check for previous incomplete installation
- **Function Validation**: Ensure function exists before execution
- **State Tracking**: Mark phases as in_progress/completed/failed
- **Hardware Conditional**: Skip RK3588 optimization on non-FriendlyElec

### 4. Error Handling and Recovery

#### Signal Handling
```bash
trap 'handle_error ${LINENO}' ERR
trap cleanup_resources EXIT
trap handle_interrupt INT
trap handle_termination TERM
```

#### Error Handler Flow

```mermaid
graph TD
  A[Error Occurs] --> B[Capture Context]
  B --> C[Log Error Details]
  C --> D[Show Recent Logs]
  D --> E[Cleanup Resources]
  E --> F[Exit with Code]
  
  G[SIGINT/SIGTERM] --> H[Log Signal]
  H --> I[Cleanup Resources]
  I --> J[Exit with Signal Code]
```

**Error Context Captured**:
- Line number where error occurred
- Failed command (`${BASH_COMMAND}`)
- Function call stack (`${FUNCNAME[*]}`)
- Current working directory
- Current user and UID
- Last 5 log entries for context

#### Cleanup System

```mermaid
graph TD
  A[Cleanup Triggered] --> B{Already Cleaned?}
  B -->|Yes| C[Skip Cleanup]
  B -->|No| D[Set Cleanup Flag]
  D --> E[Process Cleanup Tasks]
  E --> F[Remove Temp Dir]
  F --> G[Release Lock]
  G --> H[Log Final Status]
  H --> I[Exit with Code]
```

### 5. Package Installation Control Flow

#### Package Selection Logic

```mermaid
graph TD
  A[Package Installation] --> B[Parse Selected Categories]
  B --> C{Category Match?}
  C -->|Convenience| D[Add Convenience Packages]
  C -->|Network| E[Add Network Packages]
  C -->|Security| F[Add Security Packages]
  C -->|Monitoring| G[Add Monitoring Packages]
  C -->|Backup| H[Add Backup Packages]
  C -->|Docker| I[Add Docker Packages]
  D --> J[Install Package Set]
  E --> J
  F --> J
  G --> J
  H --> J
  I --> J
  J --> K{Installation Success?}
  K -->|Yes| L[Mark Success]
  K -->|No| M[Return Error]
```

#### FriendlyElec Hardware Detection

```mermaid
graph TD
  A[Hardware Detection] --> B[Check Device Tree]
  B --> C{FriendlyElec Device?}
  C -->|Yes| D[Set IS_FRIENDLYELEC=true]
  C -->|No| E[Set IS_FRIENDLYELEC=false]
  D --> F[Detect Specific Platform]
  F --> G{Platform Type?}
  G -->|NanoPi R6C| H[Set R6C Flags]
  G -->|NanoPi M6| I[Set M6 Flags]
  G -->|NanoPC-T6| J[Set T6 Flags]
  G -->|Other| K[Set Generic Flags]
  H --> L[Detect RK3588 Features]
  I --> L
  J --> L
  K --> L
  E --> M[Skip Hardware Config]
  L --> N[Configure Hardware]
```

### 6. Docker Service Deployment Flow

#### Service Selection and Deployment

```mermaid
graph TD
  A[Docker Deployment] --> B{Services Selected?}
  B -->|No| C[Skip Deployment]
  B -->|Yes| D[Check Disk Space]
  D --> E{Sufficient Space?}
  E -->|No| F[Skip with Warning]
  E -->|Yes| G[Start Docker Service]
  G --> H[Create Networks]
  H --> I[Parse Service List]
  I --> J[Deploy Each Service]
  J --> K{Service Deploy OK?}
  K -->|Yes| L[Mark Success]
  K -->|No| M[Mark Warning]
  L --> N{More Services?}
  M --> N
  N -->|Yes| J
  N -->|No| O[Report Results]
```

### 7. User Account Management Flow

#### User Account Configuration

```mermaid
graph TD
  A[User Config Start] --> B{Pi User Exists?}
  B -->|No| C[Create New User Only]
  B -->|Yes| D[Create New User]
  D --> E[Transfer SSH Keys]
  E --> F[Update Sudo Config]
  F --> G[Schedule Pi Removal]
  G --> H[Create Reboot Service]
  C --> I[Configure New User]
  H --> I
  I --> J[Set Permissions]
  J --> K[Add to Groups]
```

#### Pi User Removal (Deferred via Service)

```mermaid
graph TD
  A[Reboot Occurs] --> B[Service Starts]
  B --> C[Check Pi User Exists]
  C --> D{Pi User Found?}
  D -->|No| E[Service Complete]
  D -->|Yes| F[Kill Pi Processes]
  F --> G[Backup Pi Data]
  G --> H[Remove Pi User]
  H --> I[Update Configs]
  I --> J[Apply SSH Hardening]
  J --> K[Configure Fail2ban]
  K --> L[Mark Complete]
```

### 8. Conditional Execution Patterns

#### Hardware-Specific Execution
```bash
# RK3588 Performance Optimization
if [[ "$phase_function" == "configure_rk3588_performance" && "$IS_FRIENDLYELEC" != "true" ]]; then
  log_info "Skipping RK3588 optimizations (not FriendlyElec hardware)"
  continue
fi

# FriendlyElec Package Installation
if [[ "$IS_FRIENDLYELEC" == true ]] && [[ -n "$FRIENDLYELEC_INSTALL_PACKAGES" ]]; then
  # Install hardware-specific packages
fi
```

#### Package Category Conditional Installation
```bash
# Network Packages
if [[ -n "${SELECTED_PACKAGE_CATEGORIES:-}" ]] && echo "${SELECTED_PACKAGE_CATEGORIES:-}" | grep -q "Network packages"; then
  package_categories+=("Network:netplan.io,iproute2,wondershaper,iperf3,tailscale")
fi
```

#### Service Availability Checks
```bash
# Docker Service Check
if ! command -v docker >/dev/null 2>&1; then
  enhanced_status_indicator "warning" "Docker command not found - skipping Docker network setup"
  return 0
fi
```

### 9. Resume and Recovery Logic

#### Installation Resume

```mermaid
graph TD
  A[Check Resume State] --> B{Previous Install?}
  B -->|No| C[Start Fresh]
  B -->|Yes| D[Show Resume Options]
  D --> E{Interactive Mode?}
  E -->|No| F[Auto Resume]
  E -->|Yes| G[User Choice]
  G --> H{Resume or Restart?}
  H -->|Resume| I[Find Last Phase]
  H -->|Restart| J[Clear State]
  F --> I
  I --> K[Set Resume Index]
  J --> C
  C --> L[Start Installation]
  K --> L
```

#### State Persistence
- **Phase Tracking**: Each phase marked as in_progress/completed/failed
- **Resume Capability**: Can resume from any completed phase
- **State Validation**: Verify state consistency before resume
- **Cleanup on Success**: Clear state after successful completion

---

*This control flow analysis documents the complete execution logic, decision points, and control structures in the setup script. The phase-based architecture with comprehensive error handling and resume capabilities demonstrates enterprise-grade installation system design.*
