# DangerPrep Hardware Support Specifications - Cleanroom Implementation

## FriendlyElec Platform Detection

### Platform Detection Implementation
```bash
# Enhanced FriendlyElec platform detection
detect_friendlyelec_platform() {
    # Initialize platform variables
    PLATFORM="Unknown"
    IS_FRIENDLYELEC=false
    IS_RK3588=false
    IS_RK3588S=false
    FRIENDLYELEC_MODEL=""
    SOC_TYPE=""
    IS_ARM64=false
    
    # Detect architecture
    case "$(uname -m)" in
        aarch64|arm64) IS_ARM64=true ;;
        x86_64|amd64) IS_ARM64=false ;;
        *) IS_ARM64=false ;;
    esac
    
    # Detect platform from device tree
    if [[ -f /proc/device-tree/model ]]; then
        PLATFORM=$(cat /proc/device-tree/model | tr -d '\0')
        
        # Check for FriendlyElec hardware
        if [[ "${PLATFORM}" =~ (NanoPi|NanoPC|CM3588) ]]; then
            IS_FRIENDLYELEC=true
            
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
            fi
        fi
    fi
    
    # Export variables for use in other scripts
    export PLATFORM IS_FRIENDLYELEC IS_RK3588 IS_RK3588S
    export FRIENDLYELEC_MODEL SOC_TYPE IS_ARM64
}
```

### Hardware Capability Detection
```bash
# Detect hardware capabilities
detect_hardware_capabilities() {
    # GPU detection
    HAS_MALI_GPU=false
    if [[ -d /sys/class/devfreq/fb000000.gpu ]]; then
        HAS_MALI_GPU=true
        GPU_GOVERNOR_PATH="/sys/class/devfreq/fb000000.gpu/governor"
    fi
    
    # VPU detection
    HAS_VPU=false
    if [[ -c /dev/mpp_service ]]; then
        HAS_VPU=true
    fi
    
    # NPU detection
    HAS_NPU=false
    if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
        HAS_NPU=true
        NPU_GOVERNOR_PATH="/sys/class/devfreq/fdab0000.npu/governor"
    fi
    
    # PWM fan detection
    HAS_PWM_FAN=false
    if [[ -d /sys/class/pwm ]]; then
        # Check for available PWM channels
        for pwm_chip in /sys/class/pwm/pwmchip*; do
            if [[ -d "$pwm_chip" ]]; then
                HAS_PWM_FAN=true
                PWM_CHIP_PATH="$pwm_chip"
                break
            fi
        done
    fi
    
    # Temperature sensor detection
    TEMP_SENSORS=()
    if [[ -d /sys/class/thermal ]]; then
        for thermal_zone in /sys/class/thermal/thermal_zone*; do
            if [[ -f "$thermal_zone/temp" ]]; then
                TEMP_SENSORS+=("$thermal_zone")
            fi
        done
    fi
    
    export HAS_MALI_GPU HAS_VPU HAS_NPU HAS_PWM_FAN
    export GPU_GOVERNOR_PATH NPU_GOVERNOR_PATH PWM_CHIP_PATH
    export TEMP_SENSORS
}
```

## RK3588/RK3588S Performance Optimization

### CPU Governor Configuration
```bash
# Configure RK3588 CPU performance
configure_rk3588_performance() {
    if [[ "${IS_RK3588}" == true || "${IS_RK3588S}" == true ]]; then
        log "Configuring RK3588 performance optimizations..."
        
        # CPU governor configuration
        configure_cpu_governors
        
        # GPU optimization
        configure_mali_gpu
        
        # Memory optimization
        configure_memory_optimization
        
        # I/O scheduler optimization
        configure_io_scheduler
        
        success "RK3588 performance optimizations applied"
    fi
}

# CPU governor configuration
configure_cpu_governors() {
    # Create CPU governor service
    cat > /etc/systemd/system/rk3588-cpu-governor.service << 'EOF'
[Unit]
Description=RK3588 CPU Governor Configuration
After=multi-user.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/rk3588-cpu-governor.sh
User=root

[Install]
WantedBy=multi-user.target
EOF

    # Create governor script
    cat > /usr/local/bin/rk3588-cpu-governor.sh << 'EOF'
#!/bin/bash
# RK3588 CPU Governor Configuration

# Set performance governor for big cores (CPU 4-7)
for cpu in {4..7}; do
    if [[ -f /sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_governor ]]; then
        echo "performance" > /sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_governor
    fi
done

# Set ondemand governor for little cores (CPU 0-3)
for cpu in {0..3}; do
    if [[ -f /sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_governor ]]; then
        echo "ondemand" > /sys/devices/system/cpu/cpu${cpu}/cpufreq/scaling_governor
    fi
done

# Configure ondemand parameters
if [[ -f /sys/devices/system/cpu/cpufreq/ondemand/up_threshold ]]; then
    echo "80" > /sys/devices/system/cpu/cpufreq/ondemand/up_threshold
fi

if [[ -f /sys/devices/system/cpu/cpufreq/ondemand/sampling_rate ]]; then
    echo "50000" > /sys/devices/system/cpu/cpufreq/ondemand/sampling_rate
fi
EOF

    chmod +x /usr/local/bin/rk3588-cpu-governor.sh
    systemctl enable rk3588-cpu-governor.service
}
```

### GPU Optimization Configuration
```bash
# Mali GPU configuration
configure_mali_gpu() {
    # Create GPU environment configuration
    mkdir -p /etc/environment.d
    cat > /etc/environment.d/mali-gpu.conf << 'EOF'
# Mali GPU Environment Configuration
MALI_GPU_GOVERNOR=performance
MALI_GPU_MIN_FREQ=200000000
MALI_GPU_MAX_FREQ=1000000000
EOF

    # Create GPU profile script
    cat > /etc/profile.d/mali-gpu.sh << 'EOF'
#!/bin/bash
# Mali GPU Profile Configuration

# Set GPU governor to performance for better graphics performance
if [[ -f /sys/class/devfreq/fb000000.gpu/governor ]]; then
    echo "performance" > /sys/class/devfreq/fb000000.gpu/governor 2>/dev/null || true
fi

# Set GPU frequency limits
if [[ -f /sys/class/devfreq/fb000000.gpu/min_freq ]]; then
    echo "200000000" > /sys/class/devfreq/fb000000.gpu/min_freq 2>/dev/null || true
fi

if [[ -f /sys/class/devfreq/fb000000.gpu/max_freq ]]; then
    echo "1000000000" > /sys/class/devfreq/fb000000.gpu/max_freq 2>/dev/null || true
fi
EOF

    chmod +x /etc/profile.d/mali-gpu.sh
}
```

### Memory Optimization
```bash
# Memory optimization for RK3588
configure_memory_optimization() {
    # Create sysctl configuration for RK3588
    cat > /etc/sysctl.d/99-rk3588-optimizations.conf << 'EOF'
# RK3588 Memory and Performance Optimizations

# Memory management
vm.swappiness=10
vm.dirty_ratio=15
vm.dirty_background_ratio=5
vm.vfs_cache_pressure=50

# Network performance
net.core.rmem_default=262144
net.core.rmem_max=16777216
net.core.wmem_default=262144
net.core.wmem_max=16777216
net.core.netdev_max_backlog=5000

# TCP optimization
net.ipv4.tcp_rmem=4096 65536 16777216
net.ipv4.tcp_wmem=4096 65536 16777216
net.ipv4.tcp_congestion_control=bbr

# File system optimization
fs.file-max=2097152
fs.inotify.max_user_watches=524288
EOF

    # Apply immediately
    sysctl -p /etc/sysctl.d/99-rk3588-optimizations.conf
}
```

### I/O Scheduler Optimization
```bash
# I/O scheduler optimization
configure_io_scheduler() {
    # Create udev rules for storage optimization
    cat > /etc/udev/rules.d/99-rk3588-storage.rules << 'EOF'
# RK3588 Storage Optimization Rules

# NVMe SSD optimization
ACTION=="add|change", KERNEL=="nvme[0-9]*n[0-9]*", ATTR{queue/scheduler}="none"
ACTION=="add|change", KERNEL=="nvme[0-9]*n[0-9]*", ATTR{queue/read_ahead_kb}="128"
ACTION=="add|change", KERNEL=="nvme[0-9]*n[0-9]*", ATTR{queue/nr_requests}="256"

# eMMC optimization
ACTION=="add|change", KERNEL=="mmcblk[0-9]*", ATTR{queue/scheduler}="deadline"
ACTION=="add|change", KERNEL=="mmcblk[0-9]*", ATTR{queue/read_ahead_kb}="512"

# SD card optimization
ACTION=="add|change", KERNEL=="mmcblk[0-9]*p[0-9]*", ATTR{../queue/scheduler}="deadline"
ACTION=="add|change", KERNEL=="mmcblk[0-9]*p[0-9]*", ATTR{../queue/read_ahead_kb}="512"
EOF

    # Create I/O scheduler service
    cat > /etc/udev/rules.d/99-rk3588-io-scheduler.rules << 'EOF'
# I/O Scheduler Rules for RK3588

# Set mq-deadline for SATA/SCSI devices
ACTION=="add|change", KERNEL=="sd[a-z]", ATTR{queue/scheduler}="mq-deadline"

# Set none for NVMe devices (they have their own internal scheduling)
ACTION=="add|change", KERNEL=="nvme[0-9]n[0-9]", ATTR{queue/scheduler}="none"
EOF

    # Reload udev rules
    udevadm control --reload-rules
    udevadm trigger
}
```

## Hardware Acceleration Configuration

### VPU (Video Processing Unit) Setup
```bash
# Configure VPU for hardware video acceleration
configure_vpu_acceleration() {
    if [[ "${HAS_VPU}" == true ]]; then
        log "Configuring VPU hardware acceleration..."
        
        # Create VPU udev rules
        cat > /etc/udev/rules.d/99-rk3588-vpu.rules << 'EOF'
# RK3588 VPU Device Rules
SUBSYSTEM=="misc", KERNEL=="mpp_service", GROUP="video", MODE="0664"
SUBSYSTEM=="dma_heap", KERNEL=="system", GROUP="video", MODE="0664"
SUBSYSTEM=="dma_heap", KERNEL=="cma", GROUP="video", MODE="0664"
EOF

        # Add users to video group for VPU access
        usermod -a -G video ubuntu 2>/dev/null || true
        
        # Configure GStreamer for hardware acceleration
        configure_gstreamer_hardware()
        
        udevadm control --reload-rules
        udevadm trigger
        
        success "VPU hardware acceleration configured"
    fi
}

# GStreamer hardware acceleration configuration
configure_gstreamer_hardware() {
    mkdir -p /etc/gstreamer-1.0
    
    cat > /etc/gstreamer-1.0/gstreamer.conf << 'EOF'
# GStreamer Hardware Acceleration Configuration for RK3588

[core]
# Enable hardware acceleration plugins
plugin-path=/usr/lib/aarch64-linux-gnu/gstreamer-1.0

[rockchip]
# RK3588 specific settings
mpp-enable=true
rga-enable=true
vpu-enable=true

[video]
# Video acceleration settings
hw-decode=true
hw-encode=true
zero-copy=true
EOF
}
```

### NPU (Neural Processing Unit) Setup
```bash
# Configure NPU for AI workloads
configure_npu_acceleration() {
    if [[ "${HAS_NPU}" == true ]]; then
        log "Configuring NPU acceleration..."
        
        # Set NPU governor for optimal performance
        if [[ -f "${NPU_GOVERNOR_PATH}" ]]; then
            echo "performance" > "${NPU_GOVERNOR_PATH}"
        fi
        
        # Create NPU environment configuration
        cat > /etc/environment.d/rk3588-npu.conf << 'EOF'
# RK3588 NPU Configuration
NPU_GOVERNOR=performance
RKNN_RUNTIME_PATH=/usr/lib/aarch64-linux-gnu
EOF

        success "NPU acceleration configured"
    fi
}
```

## Thermal Management

### PWM Fan Control
```bash
# Configure PWM fan control
configure_pwm_fan_control() {
    if [[ "${HAS_PWM_FAN}" == true ]]; then
        log "Configuring PWM fan control..."
        
        # Create fan control configuration
        cat > /etc/dangerprep/rk3588-fan-control.conf << 'EOF'
# RK3588 Fan Control Configuration

# Temperature thresholds (in millicelsius)
TEMP_LOW=45000
TEMP_MID=60000
TEMP_HIGH=75000
TEMP_CRITICAL=85000

# PWM duty cycle values (0-255)
PWM_OFF=0
PWM_LOW=64
PWM_MID=128
PWM_HIGH=192
PWM_MAX=255

# PWM chip and channel
PWM_CHIP=0
PWM_CHANNEL=0

# Temperature sensor path
TEMP_SENSOR="/sys/class/thermal/thermal_zone0/temp"

# Update interval (seconds)
UPDATE_INTERVAL=5
EOF

        # Create fan control script
        cat > /usr/local/bin/rk3588-fan-control.sh << 'EOF'
#!/bin/bash
# RK3588 PWM Fan Control Script

# Source configuration
source /etc/dangerprep/rk3588-fan-control.conf

# PWM paths
PWM_PATH="/sys/class/pwm/pwmchip${PWM_CHIP}"
PWM_CHANNEL_PATH="${PWM_PATH}/pwm${PWM_CHANNEL}"

# Initialize PWM
initialize_pwm() {
    # Export PWM channel if not already exported
    if [[ ! -d "${PWM_CHANNEL_PATH}" ]]; then
        echo "${PWM_CHANNEL}" > "${PWM_PATH}/export"
        sleep 1
    fi
    
    # Set PWM period (20kHz = 50000ns)
    echo "50000" > "${PWM_CHANNEL_PATH}/period"
    
    # Enable PWM
    echo "1" > "${PWM_CHANNEL_PATH}/enable"
}

# Set fan speed
set_fan_speed() {
    local duty_cycle="$1"
    local duty_ns=$((duty_cycle * 50000 / 255))
    echo "${duty_ns}" > "${PWM_CHANNEL_PATH}/duty_cycle"
}

# Get CPU temperature
get_cpu_temp() {
    if [[ -f "${TEMP_SENSOR}" ]]; then
        cat "${TEMP_SENSOR}"
    else
        echo "0"
    fi
}

# Main control loop
main() {
    initialize_pwm
    
    while true; do
        local temp
        temp=$(get_cpu_temp)
        
        if [[ "${temp}" -lt "${TEMP_LOW}" ]]; then
            set_fan_speed "${PWM_OFF}"
        elif [[ "${temp}" -lt "${TEMP_MID}" ]]; then
            set_fan_speed "${PWM_LOW}"
        elif [[ "${temp}" -lt "${TEMP_HIGH}" ]]; then
            set_fan_speed "${PWM_MID}"
        elif [[ "${temp}" -lt "${TEMP_CRITICAL}" ]]; then
            set_fan_speed "${PWM_HIGH}"
        else
            set_fan_speed "${PWM_MAX}"
        fi
        
        sleep "${UPDATE_INTERVAL}"
    done
}

# Handle signals
cleanup() {
    # Set fan to maximum speed on exit
    set_fan_speed "${PWM_MAX}"
    exit 0
}

trap cleanup SIGTERM SIGINT

# Run main function
main
EOF

        chmod +x /usr/local/bin/rk3588-fan-control.sh
        
        # Create systemd service
        cat > /etc/systemd/system/rk3588-fan-control.service << 'EOF'
[Unit]
Description=RK3588 PWM Fan Control
After=multi-user.target

[Service]
Type=simple
ExecStart=/usr/local/bin/rk3588-fan-control.sh
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

        systemctl enable rk3588-fan-control.service
        systemctl start rk3588-fan-control.service
        
        success "PWM fan control configured and started"
    fi
}
```

### Temperature Monitoring
```bash
# Configure temperature monitoring
configure_temperature_monitoring() {
    # Create sensors configuration
    cat > /etc/sensors.d/rk3588.conf << 'EOF'
# RK3588 Temperature Sensor Configuration

chip "rk3588-thermal-*"
    label temp1 "CPU Temperature"
    set temp1_max 85
    set temp1_crit 95

chip "rk3588-gpu-thermal-*"
    label temp1 "GPU Temperature"
    set temp1_max 80
    set temp1_crit 90

chip "rk3588-npu-thermal-*"
    label temp1 "NPU Temperature"
    set temp1_max 80
    set temp1_crit 90
EOF

    # Detect sensors
    sensors-detect --auto
    
    # Start lm-sensors service
    systemctl enable lm-sensors
    systemctl start lm-sensors
}
```

## GPIO and Hardware Interface Setup

### GPIO Access Configuration
```bash
# Configure GPIO access for users
configure_gpio_access() {
    # Create GPIO group
    groupadd -f gpio
    
    # Add ubuntu user to gpio group
    usermod -a -G gpio ubuntu 2>/dev/null || true
    
    # Create udev rules for GPIO access
    cat > /etc/udev/rules.d/99-gpio.rules << 'EOF'
# GPIO Access Rules
SUBSYSTEM=="gpio", KERNEL=="gpiochip*", GROUP="gpio", MODE="0664"
SUBSYSTEM=="gpio", KERNEL=="gpio*", GROUP="gpio", MODE="0664"
EOF

    # Create PWM access rules
    cat > /etc/udev/rules.d/99-pwm.rules << 'EOF'
# PWM Access Rules
SUBSYSTEM=="pwm", GROUP="gpio", MODE="0664"
EOF

    # Create I2C access rules
    cat > /etc/udev/rules.d/99-i2c.rules << 'EOF'
# I2C Access Rules
SUBSYSTEM=="i2c-dev", GROUP="i2c", MODE="0664"
EOF

    # Create SPI access rules
    cat > /etc/udev/rules.d/99-spi.rules << 'EOF'
# SPI Access Rules
SUBSYSTEM=="spidev", GROUP="spi", MODE="0664"
EOF

    # Create groups and reload rules
    groupadd -f i2c
    groupadd -f spi
    usermod -a -G i2c,spi ubuntu 2>/dev/null || true
    
    udevadm control --reload-rules
    udevadm trigger
}
```

### Hardware Interface Testing
```bash
# Test hardware interfaces
test_hardware_interfaces() {
    log "Testing hardware interfaces..."
    
    # Test GPIO
    if [[ -d /sys/class/gpio ]]; then
        success "GPIO interface available"
    else
        warning "GPIO interface not available"
    fi
    
    # Test PWM
    if [[ -d /sys/class/pwm ]]; then
        success "PWM interface available"
    else
        warning "PWM interface not available"
    fi
    
    # Test I2C
    if command -v i2cdetect >/dev/null 2>&1; then
        local i2c_buses
        i2c_buses=$(i2cdetect -l | wc -l)
        success "I2C interface available (${i2c_buses} buses)"
    else
        warning "I2C tools not available"
    fi
    
    # Test temperature sensors
    if command -v sensors >/dev/null 2>&1; then
        local sensor_count
        sensor_count=$(sensors | grep -c "°C" || echo "0")
        success "Temperature sensors available (${sensor_count} sensors)"
    else
        warning "Temperature sensors not available"
    fi
}
```
