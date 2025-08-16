#!/usr/bin/env bash
# DangerPrep Hardware Monitoring Script
#
# Purpose: Hardware monitoring with FriendlyElec support and temperature alerts
# Usage: hardware-monitor.sh [monitor|status|alerts] [--continuous] [--interval SECONDS]
# Dependencies: sensors (lm-sensors), smartctl (smartmontools), cat (coreutils), awk (gawk), grep (grep)
# Author: DangerPrep Project
# Version: 1.0

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_NAME=""
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}" .sh)"
readonly SCRIPT_NAME

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

readonly SCRIPT_VERSION="1.0"
readonly SCRIPT_DESCRIPTION="Hardware Monitoring with FriendlyElec Support"

# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/error-handling.sh
source "${SCRIPT_DIR}/../shared/error-handling.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"

# Configuration variables
readonly ALERT_TEMP_CPU=80
readonly ALERT_TEMP_GPU=85
readonly ALERT_TEMP_NPU=90
readonly ALERT_DISK_TEMP=50

# Global hardware detection variables
IS_FRIENDLYELEC=false
IS_RK3588=false
IS_RK3588S=false
FRIENDLYELEC_MODEL=""

# Detect FriendlyElec hardware with proper validation
detect_friendlyelec_hardware() {
    set_error_context "Hardware detection"

    # Initialize variables
    IS_FRIENDLYELEC=false
    IS_RK3588=false
    IS_RK3588S=false
    FRIENDLYELEC_MODEL=""

    # Check if device tree model file exists
    local model_file="/proc/device-tree/model"
    if [[ ! -f "$model_file" ]]; then
        debug "Device tree model file not found: $model_file"
        clear_error_context
        return 0
    fi

    # Read platform information safely
    local platform
    if ! platform=$(cat "$model_file" | tr -d '\0' 2>/dev/null); then
        warning "Failed to read device tree model"
        clear_error_context
        return 0
    fi

    validate_not_empty "$platform" "platform information"

    # Detect FriendlyElec devices
    if [[ "$platform" =~ (NanoPi|NanoPC|CM3588) ]]; then
        IS_FRIENDLYELEC=true
        debug "FriendlyElec hardware detected: $platform"

        # Identify specific models
        if [[ "$platform" =~ NanoPi[[:space:]]*M6 ]]; then
            FRIENDLYELEC_MODEL="NanoPi-M6"
            IS_RK3588S=true
        elif [[ "$platform" =~ NanoPi[[:space:]]*R6[CS] ]]; then
            FRIENDLYELEC_MODEL="NanoPi-R6C"
            IS_RK3588S=true
        elif [[ "$platform" =~ NanoPC[[:space:]]*T6 ]]; then
            FRIENDLYELEC_MODEL="NanoPC-T6"
            IS_RK3588=true
        elif [[ "$platform" =~ CM3588 ]]; then
            FRIENDLYELEC_MODEL="CM3588"
            IS_RK3588=true
        else
            FRIENDLYELEC_MODEL="Unknown FriendlyElec"
        fi

        success "Detected FriendlyElec model: ${FRIENDLYELEC_MODEL}"
    else
        debug "Non-FriendlyElec hardware detected: $platform"
    fi

    clear_error_context
}

alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $1" | tee -a "${LOG_FILE}"
    logger -t "HARDWARE-ALERT" -p daemon.warning "$1"
}

# Check CPU temperature with FriendlyElec support
check_cpu_temperature() {
    set_error_context "CPU temperature check"

    log_subsection "CPU Temperature Monitoring"

    if [[ "${IS_FRIENDLYELEC}" == "true" ]]; then
        debug "Using FriendlyElec-specific CPU temperature monitoring"
        check_rk3588_cpu_temperature
    else
        debug "Using generic CPU temperature monitoring"
        check_generic_cpu_temperature
    fi

    clear_error_context
}

# Check generic CPU temperature
check_generic_cpu_temperature() {
    set_error_context "Generic CPU temperature check"

    if ! command -v sensors >/dev/null 2>&1; then
        warning "sensors command not available for CPU temperature monitoring"
        clear_error_context
        return 0
    fi

    # Get CPU temperature using sensors
    local cpu_temp_output
    if ! cpu_temp_output=$(sensors 2>/dev/null); then
        warning "Failed to read sensors data"
        clear_error_context
        return 0
    fi

    # Extract temperature value
    local cpu_temp
    cpu_temp=$(echo "$cpu_temp_output" | grep -i "core\|cpu" | grep -o '[0-9]\+\.[0-9]\+°C' | head -1 | grep -o '[0-9]\+' || echo "")

    if [[ -n "$cpu_temp" ]]; then
        validate_numeric "$cpu_temp" "CPU temperature"

        info "CPU Temperature: ${cpu_temp}°C"

        if [[ $cpu_temp -gt ${ALERT_TEMP_CPU} ]]; then
            error "⚠️  HIGH CPU TEMPERATURE ALERT: ${cpu_temp}°C (threshold: ${ALERT_TEMP_CPU}°C)"
            log_validation_result "CPU Temperature Check" "FAIL" "Temperature ${cpu_temp}°C exceeds threshold ${ALERT_TEMP_CPU}°C"
        else
            log_validation_result "CPU Temperature Check" "PASS" "Temperature ${cpu_temp}°C is within normal range"
        fi
    else
        warning "Could not determine CPU temperature from sensors output"
    fi

    clear_error_context
}

# Check RK3588/RK3588S CPU temperature
check_rk3588_cpu_temperature() {
    set_error_context "RK3588 CPU temperature check"

    # RK3588/RK3588S thermal zones
    local thermal_zones=(
        "/sys/class/thermal/thermal_zone0/temp"  # SoC thermal zone
        "/sys/class/thermal/thermal_zone1/temp"  # Additional thermal zone
    )

    local zone_found=false
    for zone in "${thermal_zones[@]}"; do
        if [[ -r "$zone" ]]; then
            zone_found=true
            local temp_millicelsius

            if temp_millicelsius=$(cat "$zone" 2>/dev/null); then
                validate_not_empty "$temp_millicelsius" "temperature reading"
                validate_numeric "$temp_millicelsius" "temperature value"

                local temp_celsius
                temp_celsius=$((temp_millicelsius / 1000))
                local zone_name
                zone_name=$(basename "$zone")

                info "CPU thermal zone $zone_name: ${temp_celsius}°C"

                if [[ $temp_celsius -gt ${ALERT_TEMP_CPU} ]]; then
                    error "⚠️  HIGH CPU TEMPERATURE ALERT in $zone_name: ${temp_celsius}°C (threshold: ${ALERT_TEMP_CPU}°C)"
                    log_validation_result "CPU Temperature Check ($zone_name)" "FAIL" "Temperature ${temp_celsius}°C exceeds threshold ${ALERT_TEMP_CPU}°C"
                else
                    log_validation_result "CPU Temperature Check ($zone_name)" "PASS" "Temperature ${temp_celsius}°C is within normal range"
                fi
            else
                warning "Failed to read temperature from thermal zone: $zone"
            fi
        else
            debug "Thermal zone not accessible: $zone"
        fi
    done

    if [[ "$zone_found" != "true" ]]; then
        warning "No accessible thermal zones found for RK3588 CPU temperature monitoring"
    fi

    clear_error_context

    # Also check with sensors if available
    if command -v sensors >/dev/null 2>&1; then
        local rk3588_temp
        rk3588_temp=$(sensors 2>/dev/null | grep -i "rk3588\|rockchip" | grep -o '[0-9]\+\.[0-9]\+°C' | head -1 | grep -o '[0-9]\+')
        if [[ -n "$rk3588_temp" && $rk3588_temp -gt ${ALERT_TEMP_CPU} ]]; then
            alert "High RK3588 SoC temperature: ${rk3588_temp}°C"
        fi
    fi
}

# Check GPU temperature for RK3588/RK3588S
check_gpu_temperature() {
    if [[ "${IS_RK3588}" != true && "${IS_RK3588S}" != true ]]; then
        return 0
    fi

    # Mali-G610 MP4 GPU thermal monitoring
    local gpu_thermal="/sys/class/thermal/thermal_zone2/temp"

    if [[ -r "$gpu_thermal" ]]; then
        local temp_millicelsius
        temp_millicelsius=$(cat "$gpu_thermal" 2>/dev/null)
        if [[ -n "$temp_millicelsius" ]]; then
            local temp_celsius
            temp_celsius=$((temp_millicelsius / 1000))
            log "Mali GPU temperature: ${temp_celsius}°C"

            if [[ $temp_celsius -gt ${ALERT_TEMP_GPU} ]]; then
                alert "High GPU temperature: ${temp_celsius}°C"
            fi
        fi
    fi

    # Check GPU frequency and utilization
    local gpu_devfreq="/sys/class/devfreq/fb000000.gpu"
    if [[ -d "$gpu_devfreq" ]]; then
        local cur_freq
        cur_freq=$(cat "$gpu_devfreq/cur_freq" 2>/dev/null)
        local governor
        governor=$(cat "$gpu_devfreq/governor" 2>/dev/null)

        if [[ -n "$cur_freq" && -n "$governor" ]]; then
            local freq_mhz
            freq_mhz=$((cur_freq / 1000000))
            log "GPU: ${freq_mhz}MHz, governor: $governor"
        fi
    fi
}

# Check NPU temperature and status for RK3588/RK3588S
check_npu_status() {
    if [[ "${IS_RK3588}" != true && "${IS_RK3588S}" != true ]]; then
        return 0
    fi

    # NPU thermal monitoring
    local npu_thermal="/sys/class/thermal/thermal_zone3/temp"

    if [[ -r "$npu_thermal" ]]; then
        local temp_millicelsius
        temp_millicelsius=$(cat "$npu_thermal" 2>/dev/null)
        if [[ -n "$temp_millicelsius" ]]; then
            local temp_celsius
            temp_celsius=$((temp_millicelsius / 1000))
            log "NPU temperature: ${temp_celsius}°C"

            if [[ $temp_celsius -gt ${ALERT_TEMP_NPU} ]]; then
                alert "High NPU temperature: ${temp_celsius}°C"
            fi
        fi
    fi

    # Check NPU frequency and status
    local npu_devfreq="/sys/class/devfreq/fdab0000.npu"
    if [[ -d "$npu_devfreq" ]]; then
        local cur_freq
        cur_freq=$(cat "$npu_devfreq/cur_freq" 2>/dev/null)
        local governor
        governor=$(cat "$npu_devfreq/governor" 2>/dev/null)

        if [[ -n "$cur_freq" && -n "$governor" ]]; then
            local freq_mhz
            freq_mhz=$((cur_freq / 1000000))
            log "NPU: ${freq_mhz}MHz, governor: $governor"
        fi
    fi
}

# Check disk temperatures
check_disk_temperature() {
    if command -v hddtemp >/dev/null 2>&1; then
        for disk in /dev/sd* /dev/nvme*; do
            if [[ -b "$disk" ]]; then
                local disk_temp
                disk_temp=$(hddtemp "$disk" 2>/dev/null | grep -o '[0-9]\+°C' | grep -o '[0-9]\+')
                if [[ -n "$disk_temp" && $disk_temp -gt ${ALERT_DISK_TEMP} ]]; then
                    alert "High disk temperature on $disk: ${disk_temp}°C"
                fi
            fi
        done
    fi
}

# Check disk health with SMART
check_disk_health() {
    if command -v smartctl >/dev/null 2>&1; then
        for disk in /dev/sd* /dev/nvme* /dev/mmcblk*; do
            if [[ -b "$disk" ]]; then
                local smart_status
                smart_status=$(smartctl -H "$disk" 2>/dev/null | grep "SMART overall-health")
                if [[ "$smart_status" == *"FAILED"* ]]; then
                    alert "SMART health check failed for $disk"
                fi
            fi
        done
    fi
}

# Check FriendlyElec-specific hardware features
check_friendlyelec_hardware() {
    if [[ "${IS_FRIENDLYELEC}" != true ]]; then
        return 0
    fi

    log "=== FriendlyElec Hardware Status (${FRIENDLYELEC_MODEL}) ==="

    # Check VPU status
    check_vpu_status

    # Check hardware acceleration devices
    check_hardware_acceleration

    # Check M.2 interfaces
    check_m2_interfaces

    # Check RTC status
    check_rtc_status
}

# Check VPU (Video Processing Unit) status
check_vpu_status() {
    if [[ -c /dev/mpp_service ]]; then
        log "VPU: Available (/dev/mpp_service)"

        # Check VPU permissions
        local vpu_perms
        vpu_perms=$(stat -c "%A %U %G" /dev/mpp_service 2>/dev/null || echo "N/A")
        log "VPU permissions: $vpu_perms"

        # Check if VPU is in use
        if command -v fuser >/dev/null 2>&1; then
            local vpu_users
            vpu_users=$(fuser /dev/mpp_service 2>/dev/null | wc -w)
            if [[ $vpu_users -gt 0 ]]; then
                log "VPU: In use by $vpu_users process(es)"
            else
                log "VPU: Idle"
            fi
        fi
    else
        log "VPU: Not available"
    fi
}

# Check hardware acceleration devices
check_hardware_acceleration() {
    # Check GPU device
    if [[ -d /sys/class/devfreq/fb000000.gpu ]]; then
        log "Mali GPU: Available"
    else
        log "Mali GPU: Not detected"
    fi

    # Check NPU device
    if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
        log "NPU: Available (6TOPS)"
    else
        log "NPU: Not detected"
    fi

    # Check DRM devices
    local drm_devices
    drm_devices=$(find /dev/dri/ -maxdepth 1 -type f 2>/dev/null | wc -l)
    if [[ $drm_devices -gt 0 ]]; then
        log "DRM devices: $drm_devices available"
    else
        log "DRM devices: None detected"
    fi
}

# Check M.2 interfaces
check_m2_interfaces() {
    # Check NVMe devices
    local nvme_count
    nvme_count=$(find /dev -name "nvme*" 2>/dev/null | grep -c "nvme[0-9]n[0-9]" || echo "0")
    if [[ $nvme_count -gt 0 ]]; then
        log "M.2 NVMe: $nvme_count device(s) detected"

        # Check NVMe temperatures
        for nvme in /dev/nvme*n1; do
            if [[ -b "$nvme" ]]; then
                local nvme_temp
                nvme_temp=$(smartctl -A "$nvme" 2>/dev/null | grep -i temperature | awk '{print $10}' | head -1)
                if [[ -n "$nvme_temp" ]]; then
                    log "NVMe $(basename "$nvme") temperature: ${nvme_temp}°C"
                    if [[ $nvme_temp -gt ${ALERT_DISK_TEMP} ]]; then
                        alert "High NVMe temperature on $(basename "$nvme"): ${nvme_temp}°C"
                    fi
                fi
            fi
        done
    else
        log "M.2 NVMe: No devices detected"
    fi

    # Check for WiFi modules (M.2 E-key)
    local wifi_modules
    wifi_modules=$(lspci 2>/dev/null | grep -ic "network\|wireless")
    if [[ $wifi_modules -gt 0 ]]; then
        log "M.2 WiFi modules: $wifi_modules detected"
    else
        log "M.2 WiFi modules: None detected"
    fi
}

# Check RTC status
check_rtc_status() {
    if [[ -f /sys/class/rtc/rtc0/name ]]; then
        local rtc_name
        rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null)
        log "RTC: $rtc_name"

        if [[ "$rtc_name" =~ hym8563 ]]; then
            # Check RTC time vs system time
            local rtc_time
            rtc_time=$(cat /sys/class/rtc/rtc0/since_epoch 2>/dev/null)
            local sys_time
            sys_time=$(date +%s)

            if [[ -n "$rtc_time" && -n "$sys_time" ]]; then
                local time_diff
                time_diff=$((sys_time - rtc_time))
                if [[ ${time_diff#-} -gt 60 ]]; then  # More than 1 minute difference
                    alert "RTC time drift detected: ${time_diff}s difference"
                else
                    log "RTC time sync: OK (${time_diff}s difference)"
                fi
            fi
        fi
    else
        log "RTC: Not available"
    fi
}

# Main monitoring function
# Show banner for hardware monitoring
if [[ "${1:-check}" != "help" && "${1:-check}" != "--help" && "${1:-check}" != "-h" ]]; then
    show_banner_with_title "Hardware Monitor" "monitoring"
    echo
fi

# Show help information
show_help() {
    cat << EOF
${SCRIPT_DESCRIPTION} v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [COMMAND]

Commands:
    check       Run basic hardware checks (default)
    report      Generate comprehensive hardware report
    friendlyelec FriendlyElec-specific hardware report
    help        Show this help message

Examples:
    ${SCRIPT_NAME} check      # Run hardware checks
    ${SCRIPT_NAME} report     # Generate full report

Exit Codes:
    0   Success
    1   General error
    2   Invalid arguments

For more information, see the DangerPrep documentation.
EOF
}

case "${1:-check}" in
    check)
        log "=== Hardware Monitoring Check ==="
        check_cpu_temperature
        check_disk_temperature
        check_disk_health

        # FriendlyElec-specific checks
        if [[ "${IS_FRIENDLYELEC}" == true ]]; then
            check_gpu_temperature
            check_npu_status
        fi
        ;;
    report)
        log "=== Hardware Status Report ==="

        # Basic system information
        log "Platform: $(cat /proc/device-tree/model 2>/dev/null | tr -d '\0' || echo "Unknown")"
        log "Kernel: $(uname -r)"
        log "Uptime: $(uptime -p)"

        # Temperature monitoring
        if command -v sensors >/dev/null 2>&1; then
            log "=== Temperature Sensors ==="
            sensors 2>/dev/null || log "Sensors not available"
        fi

        # FriendlyElec-specific hardware report
        if [[ "${IS_FRIENDLYELEC}" == true ]]; then
            check_friendlyelec_hardware
            check_gpu_temperature
            check_npu_status
        fi

        # Disk information
        log "=== Storage Devices ==="
        log "Disk temperatures:"
        hddtemp /dev/sd* /dev/nvme* /dev/mmcblk* 2>/dev/null || log "hddtemp not available"

        log "=== SMART Status ==="
        for disk in /dev/sd* /dev/nvme* /dev/mmcblk*; do
            if [[ -b "$disk" ]]; then
                smart_status=$(smartctl -H "$disk" 2>/dev/null | grep "SMART overall-health" || echo "N/A")
                log "$disk: $smart_status"
            fi
        done

        # Memory and load information
        log "=== System Resources ==="
        log "Memory: $(free -h | grep Mem | awk '{print "Used: "$3" / Total: "$2" ("$3/$2*100"% used)"}')"
        log "Load average: $(cat /proc/loadavg | awk '{print $1" "$2" "$3}')"

        # Network interfaces status
        log "=== Network Interfaces ==="
        for iface in $(ip link show | grep -E "^[0-9]+:" | cut -d: -f2 | tr -d ' '); do
            if [[ "$iface" != "lo" ]]; then
                status=$(ip link show "$iface" | grep -o "state [A-Z]*" | awk '{print $2}')
                log "$iface: $status"
            fi
        done
        ;;
    friendlyelec)
        if [[ "${IS_FRIENDLYELEC}" == true ]]; then
            check_friendlyelec_hardware
        else
            log "Not running on FriendlyElec hardware"
        fi
        ;;
    help|--help|-h)
        show_help
        exit 0
        ;;
    *)
        error "Unknown command: $1"
        error "Use '${SCRIPT_NAME} help' for usage information"
        exit 2
        ;;
esac
