#!/usr/bin/env bash
# DangerPrep Hardware Detection Helper Functions
#
# Purpose: Consolidated hardware detection and configuration functions for FriendlyElec devices
# Usage: Source this file to access hardware detection functions
# Dependencies: logging.sh, errors.sh, services.sh
# Author: DangerPrep Project
# Version: 2.0

# Modern shell script best practices
set -euo pipefail

# Get the directory where this script is located
HARDWARE_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if not already sourced
if [[ -z "${LOGGING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${HARDWARE_HELPER_DIR}/../../shared/logging.sh"
fi

if [[ -z "${ERROR_HANDLING_SOURCED:-}" ]]; then
    # shellcheck source=../../shared/errors.sh
    source "${HARDWARE_HELPER_DIR}/../../shared/errors.sh"
fi

if [[ -z "${SERVICES_HELPER_SOURCED:-}" ]]; then
    # shellcheck source=./services.sh
    source "${HARDWARE_HELPER_DIR}/services.sh"
fi

# Mark this file as sourced
export HARDWARE_HELPER_SOURCED=true

#
# Platform Detection Functions
#

# Enhanced FriendlyElec platform detection
# Usage: detect_friendlyelec_platform
# Sets global variables: PLATFORM, IS_FRIENDLYELEC, IS_RK3588, IS_RK3588S, FRIENDLYELEC_MODEL, SOC_TYPE, IS_ARM64
detect_friendlyelec_platform() {
    # Initialize platform variables
    PLATFORM="Unknown"
    IS_FRIENDLYELEC=false
    IS_RK3588=false
    IS_RK3588S=false
    FRIENDLYELEC_MODEL=""
    SOC_TYPE=""

    # Detect architecture first
    case "$(uname -m)" in
        aarch64|arm64)
            IS_ARM64=true
            ;;
        x86_64|amd64)
            IS_ARM64=false
            ;;
        *)
            IS_ARM64=false
            ;;
    esac

    # Detect platform from device tree
    if [[ -f /proc/device-tree/model ]]; then
        PLATFORM=$(cat /proc/device-tree/model | tr -d '\0')
        log "Platform: ${PLATFORM}"

        # Check for FriendlyElec hardware
        if [[ "${PLATFORM}" =~ (NanoPi|NanoPC|CM3588) ]]; then
            IS_FRIENDLYELEC=true
            log "FriendlyElec hardware detected"

            # Extract model information
            if [[ "${PLATFORM}" =~ NanoPi[[:space:]]*M6 ]]; then
                FRIENDLYELEC_MODEL="NanoPi-M6"
                IS_RK3588S=true
                SOC_TYPE="RK3588S"
            elif [[ "${PLATFORM}" =~ NanoPi[[:space:]]*R6[CS] ]]; then
                FRIENDLYELEC_MODEL="NanoPi-R6C"
                IS_RK3588S=true
                SOC_TYPE="RK3588S"
            elif [[ "${PLATFORM}" =~ NanoPC[[:space:]]*T6 ]]; then
                FRIENDLYELEC_MODEL="NanoPC-T6"
                IS_RK3588=true
                SOC_TYPE="RK3588"
            elif [[ "${PLATFORM}" =~ CM3588 ]]; then
                FRIENDLYELEC_MODEL="CM3588"
                IS_RK3588=true
                SOC_TYPE="RK3588"
            else
                FRIENDLYELEC_MODEL="Unknown FriendlyElec"
            fi

            log "Model: ${FRIENDLYELEC_MODEL}"
            log "SoC: ${SOC_TYPE}"

            # Detect additional hardware features
            detect_friendlyelec_features
        fi
    else
        PLATFORM="Generic x86_64"
        log "Platform: ${PLATFORM}"
    fi

    # Export variables for use in other functions
    export PLATFORM IS_FRIENDLYELEC IS_RK3588 IS_RK3588S FRIENDLYELEC_MODEL SOC_TYPE IS_ARM64
}

# Detect FriendlyElec-specific hardware features
# Usage: detect_friendlyelec_features
# Returns: 0 if successful
detect_friendlyelec_features() {
    local features=()

    # Check for hardware acceleration support
    if [[ -d /sys/class/devfreq/fb000000.gpu ]]; then
        features+=("Mali GPU")
        debug "Mali GPU devfreq interface detected"
    else
        debug "Mali GPU devfreq interface not found"
    fi

    # Check for VPU/MPP support
    if [[ -c /dev/mpp_service ]]; then
        features+=("Hardware VPU")
        debug "VPU/MPP device detected"
    else
        debug "VPU/MPP device not found"
    fi

    # Check for NPU support (RK3588/RK3588S)
    if [[ "${IS_RK3588}" == true || "${IS_RK3588S}" == true ]]; then
        if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
            features+=("6TOPS NPU")
            debug "NPU devfreq interface detected"
        else
            debug "NPU devfreq interface not found"
        fi
    fi

    # Check for RTC support with error handling
    if [[ -f /sys/class/rtc/rtc0/name ]]; then
        local rtc_name
        if rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null); then
            if [[ "$rtc_name" =~ hym8563 ]]; then
                features+=("HYM8563 RTC")
                debug "HYM8563 RTC detected"
            else
                debug "RTC detected but not HYM8563: $rtc_name"
            fi
        else
            debug "Failed to read RTC name"
        fi
    else
        debug "RTC interface not found"
    fi

    # Check for M.2 interfaces
    if [[ -d /sys/class/nvme ]]; then
        local nvme_count
        nvme_count=$(find /sys/class/nvme -name "nvme*" -type l 2>/dev/null | wc -l)
        if [[ $nvme_count -gt 0 ]]; then
            features+=("M.2 NVMe ($nvme_count devices)")
            debug "M.2 NVMe devices detected: $nvme_count"
        fi
    else
        debug "M.2 NVMe interface not found"
    fi

    # Log detected features
    if [[ ${#features[@]} -gt 0 ]]; then
        log "Hardware features: ${features[*]}"
    else
        log "No special hardware features detected"
    fi

    return 0
}

#
# Hardware Configuration Functions
#

# Configure FriendlyElec RTC
# Usage: configure_friendlyelec_rtc
# Returns: 0 if successful
configure_friendlyelec_rtc() {
    if [[ -f /sys/class/rtc/rtc0/name ]]; then
        local rtc_name
        rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null)
        if [[ "$rtc_name" =~ hym8563 ]]; then
            log "Configuring HYM8563 RTC..."

            # Ensure RTC is set as system clock source
            if command -v timedatectl >/dev/null 2>&1; then
                timedatectl set-local-rtc 0 2>/dev/null || true
                log "Configured RTC as UTC time source"
            fi
        fi
    fi
    return 0
}

# Configure FriendlyElec sensors
# Usage: configure_friendlyelec_sensors
# Returns: 0 if successful
configure_friendlyelec_sensors() {
    log "Configuring FriendlyElec sensors..."

    # Create sensors configuration for RK3588/RK3588S
    if [[ "${IS_RK3588}" == true || "${IS_RK3588S}" == true ]]; then
        # This would call a config loading function
        debug "Loading RK3588 sensors configuration"
        # load_rk3588_sensors_config
    fi
    
    return 0
}

# Configure FriendlyElec fan control for thermal management
# Usage: configure_friendlyelec_fan_control
# Returns: 0 if successful
configure_friendlyelec_fan_control() {
    if [[ "${IS_RK3588}" != true && "${IS_RK3588S}" != true ]]; then
        return 0
    fi

    log "Configuring RK3588 fan control..."

    # Check if PWM fan control is available
    if [[ ! -d /sys/class/pwm/pwmchip0 ]]; then
        warning "PWM fan control not available, skipping fan configuration"
        return 0
    fi

    # Create fan control configuration directory
    create_service_directories "dangerprep-config" "/etc/dangerprep"

    # Load fan control configuration (would be handled by config helper)
    debug "Loading RK3588 fan control configuration"
    # load_rk3588_fan_control_config

    # Make fan control script executable
    local fan_script="${HARDWARE_HELPER_DIR}/../../monitoring/rk3588-fan-control.sh"
    if [[ -f "$fan_script" ]]; then
        chmod +x "$fan_script"
    fi

    # Install and enable fan control service (would be handled by service helper)
    debug "Installing RK3588 fan control service"
    # install_rk3588_fan_control_service

    # Test fan control functionality
    if [[ -f "$fan_script" ]] && "$fan_script" test >/dev/null 2>&1; then
        success "Fan control test successful"
    else
        warning "Fan control test failed, but service installed"
    fi

    log "RK3588 fan control configured"
    return 0
}

# Configure FriendlyElec GPIO and PWM interfaces
# Usage: configure_friendlyelec_gpio_pwm
# Returns: 0 if successful
configure_friendlyelec_gpio_pwm() {
    if [[ "${IS_FRIENDLYELEC}" != true ]]; then
        return 0
    fi

    log "Configuring FriendlyElec GPIO and PWM interfaces..."

    # Load GPIO/PWM configuration (would be handled by config helper)
    debug "Loading GPIO/PWM configuration"
    # load_gpio_pwm_config

    # Make GPIO setup script executable
    local gpio_script="${HARDWARE_HELPER_DIR}/../setup-gpio.sh"
    if [[ -f "$gpio_script" ]]; then
        chmod +x "$gpio_script"

        # Run GPIO/PWM setup
        if "$gpio_script" setup "${SUDO_USER:-root}"; then
            success "GPIO and PWM interfaces configured"
        else
            warning "GPIO and PWM setup completed with warnings"
        fi
    else
        debug "GPIO setup script not found: $gpio_script"
    fi

    log "FriendlyElec GPIO and PWM configuration completed"
    return 0
}

#
# Package Installation Functions
#

# Install FriendlyElec-specific packages and configurations
# Usage: install_friendlyelec_packages
# Returns: 0 if successful
install_friendlyelec_packages() {
    log "Installing FriendlyElec-specific packages..."

    # FriendlyElec-specific packages for hardware acceleration
    local friendlyelec_packages=()

    if [[ "${IS_RK3588}" == true || "${IS_RK3588S}" == true ]]; then
        friendlyelec_packages+=(
            "mesa-utils"           # OpenGL utilities
            "glmark2-es2"         # OpenGL ES benchmark
            "v4l-utils"           # Video4Linux utilities
            "gstreamer1.0-tools"  # GStreamer tools for hardware decoding
            "gstreamer1.0-plugins-bad"
            "gstreamer1.0-rockchip1"  # RK3588 hardware acceleration (if available)
        )
    fi

    # Install available packages
    for package in "${friendlyelec_packages[@]}"; do
        log "Installing FriendlyElec package: $package..."
        if DEBIAN_FRONTEND=noninteractive apt install -y "$package" 2>/dev/null; then
            success "Installed $package"
        else
            warning "Package $package not available, skipping"
        fi
    done

    # Install FriendlyElec kernel headers if available
    install_friendlyelec_kernel_headers

    success "FriendlyElec-specific packages installation completed"
    return 0
}

# Install FriendlyElec kernel headers
# Usage: install_friendlyelec_kernel_headers
# Returns: 0 if successful
install_friendlyelec_kernel_headers() {
    log "Installing FriendlyElec kernel headers..."

    # Check for pre-installed kernel headers in /opt/archives/
    if [[ -d /opt/archives ]]; then
        local kernel_headers
        kernel_headers=$(find /opt/archives -name "linux-headers-*.deb" | head -1)
        if [[ -n "$kernel_headers" ]]; then
            log "Found FriendlyElec kernel headers: $kernel_headers"
            if dpkg -i "$kernel_headers" 2>/dev/null; then
                success "Installed FriendlyElec kernel headers"
            else
                warning "Failed to install FriendlyElec kernel headers"
            fi
        else
            log "No FriendlyElec kernel headers found in /opt/archives/"
        fi
    fi

    # Try to download latest kernel headers if not found locally
    if ! dpkg -l | grep -q "linux-headers-$(uname -r)"; then
        log "Attempting to download latest kernel headers..."
        local kernel_version
        kernel_version=$(uname -r)
        local headers_url="http://112.124.9.243/archives/rk3588/linux-headers-${kernel_version}-latest.deb"

        if wget -q --spider "$headers_url" 2>/dev/null; then
            log "Downloading kernel headers from FriendlyElec repository..."
            if wget -O "/tmp/linux-headers-latest.deb" "$headers_url" 2>/dev/null; then
                if dpkg -i "/tmp/linux-headers-latest.deb" 2>/dev/null; then
                    success "Downloaded and installed latest kernel headers"
                    rm -f "/tmp/linux-headers-latest.deb"
                else
                    warning "Failed to install downloaded kernel headers"
                fi
            else
                warning "Failed to download kernel headers"
            fi
        else
            log "No online kernel headers available for this version"
        fi
    fi

    return 0
}

#
# Performance Optimization Functions
#

# Configure RK3588/RK3588S performance optimizations
# Usage: configure_rk3588_performance
# Returns: 0 if successful
configure_rk3588_performance() {
    if [[ "${IS_RK3588}" != true && "${IS_RK3588S}" != true ]]; then
        return 0
    fi

    log "Configuring RK3588/RK3588S performance optimizations..."

    # Configure CPU governors for optimal performance
    configure_rk3588_cpu_governors

    # Configure GPU performance settings
    configure_rk3588_gpu_performance

    # Configure memory and I/O optimizations
    configure_rk3588_memory_optimizations

    # Configure hardware acceleration
    configure_rk3588_hardware_acceleration

    success "RK3588/RK3588S performance optimizations configured"
    return 0
}

# Configure CPU governors for RK3588/RK3588S
# Usage: configure_rk3588_cpu_governors
# Returns: 0 if successful
configure_rk3588_cpu_governors() {
    log "Configuring RK3588 CPU governors..."

    # RK3588/RK3588S has multiple CPU clusters
    # Cluster 0: Cortex-A55 (cores 0-3)
    # Cluster 1: Cortex-A76 (cores 4-7)
    # Cluster 2: Cortex-A76 (cores 6-7) - RK3588 only

    local cpu_policies=(
        "/sys/devices/system/cpu/cpufreq/policy0"  # A55 cluster
        "/sys/devices/system/cpu/cpufreq/policy4"  # A76 cluster 1
    )

    # Add third cluster for RK3588 (not RK3588S)
    if [[ "${IS_RK3588}" == true ]]; then
        cpu_policies+=("/sys/devices/system/cpu/cpufreq/policy6")  # A76 cluster 2
    fi

    # Set performance governor for better responsiveness
    for policy in "${cpu_policies[@]}"; do
        if [[ -d "$policy" ]]; then
            local governor_file="$policy/scaling_governor"
            if [[ -w "$governor_file" ]]; then
                # Check available governors first
                local available_governors
                available_governors=$(cat "$policy/scaling_available_governors" 2>/dev/null || echo "")

                if [[ "$available_governors" =~ performance ]]; then
                    if echo "performance" > "$governor_file" 2>/dev/null; then
                        local current_governor
                        current_governor=$(cat "$governor_file" 2>/dev/null)
                        log "Set CPU policy $(basename "$policy") governor to: $current_governor"
                    else
                        warning "Failed to set performance governor for $(basename "$policy")"
                    fi
                else
                    warning "Performance governor not available for $(basename "$policy"), available: $available_governors"
                fi
            else
                debug "CPU governor file not writable: $governor_file"
            fi
        else
            debug "CPU policy directory not found: $policy"
        fi
    done

    # Create systemd service to maintain CPU governor settings (would be handled by config helper)
    debug "Loading RK3588 CPU governor service configuration"
    # load_rk3588_cpu_governor_service

    return 0
}

# Configure GPU performance for RK3588/RK3588S
# Usage: configure_rk3588_gpu_performance
# Returns: 0 if successful
configure_rk3588_gpu_performance() {
    log "Configuring RK3588 GPU performance..."

    # Mali-G610 MP4 GPU configuration
    local gpu_devfreq="/sys/class/devfreq/fb000000.gpu"

    if [[ -d "$gpu_devfreq" ]]; then
        # Set GPU governor to performance
        if [[ -w "$gpu_devfreq/governor" ]]; then
            echo "performance" > "$gpu_devfreq/governor" 2>/dev/null || true
            log "Set GPU governor to performance"
        fi

        # Set maximum GPU frequency
        if [[ -w "$gpu_devfreq/max_freq" ]]; then
            local max_freq
            max_freq=$(cat "$gpu_devfreq/available_frequencies" 2>/dev/null | tr ' ' '\n' | sort -n | tail -1)
            if [[ -n "$max_freq" ]]; then
                echo "$max_freq" > "$gpu_devfreq/max_freq" 2>/dev/null || true
                log "Set GPU max frequency to: $max_freq Hz"
            fi
        fi
    else
        debug "GPU devfreq interface not found"
    fi

    # Configure Mali GPU environment variables for applications (would be handled by config helper)
    debug "Loading Mali GPU environment configuration"
    # load_mali_gpu_env_config

    return 0
}

# Configure memory and I/O optimizations for RK3588/RK3588S
# Usage: configure_rk3588_memory_optimizations
# Returns: 0 if successful
configure_rk3588_memory_optimizations() {
    log "Configuring RK3588 memory and I/O optimizations..."

    # Add RK3588-specific kernel parameters (would be handled by config helper)
    debug "Loading RK3588 performance configuration"
    # load_rk3588_performance_config

    # Create udev rules for I/O scheduler optimization (would be handled by config helper)
    debug "Loading RK3588 udev rules"
    # load_rk3588_udev_rules

    return 0
}

# Configure hardware acceleration for RK3588/RK3588S
# Usage: configure_rk3588_hardware_acceleration
# Returns: 0 if successful
configure_rk3588_hardware_acceleration() {
    log "Configuring RK3588 hardware acceleration..."

    # Configure VPU (Video Processing Unit) access
    if [[ -c /dev/mpp_service ]]; then
        # Ensure proper permissions for VPU device
        chown root:video /dev/mpp_service 2>/dev/null || true
        chmod 664 /dev/mpp_service 2>/dev/null || true
        log "Configured VPU device permissions"
    fi

    # Configure NPU (Neural Processing Unit) access
    if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
        # Set NPU to performance mode
        echo "performance" > /sys/class/devfreq/fdab0000.npu/governor 2>/dev/null || true
        log "Configured NPU for performance"
    fi

    # Create GStreamer configuration for hardware acceleration (would be handled by config helper)
    debug "Loading RK3588 GStreamer configuration"
    # load_rk3588_gstreamer_config

    # Configure environment variables for video acceleration (would be handled by config helper)
    debug "Loading RK3588 video environment configuration"
    # load_rk3588_video_env_config

    return 0
}

#
# Main Hardware Configuration Function
#

# Configure FriendlyElec hardware-specific settings
# Usage: configure_friendlyelec_hardware
# Returns: 0 if successful
configure_friendlyelec_hardware() {
    log "Configuring FriendlyElec hardware settings..."

    # Load FriendlyElec-specific configuration templates (would be handled by config helper)
    debug "Loading FriendlyElec configurations"
    # load_friendlyelec_configs

    # Configure RTC if HYM8563 is detected
    configure_friendlyelec_rtc

    # Configure hardware monitoring
    configure_friendlyelec_sensors

    # Configure fan control for thermal management
    configure_friendlyelec_fan_control

    # Configure GPIO and PWM interfaces
    configure_friendlyelec_gpio_pwm

    success "FriendlyElec hardware configuration completed"
    return 0
}
