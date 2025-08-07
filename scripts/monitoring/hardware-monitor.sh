#!/bin/bash
# DangerPrep Hardware Monitoring Script with FriendlyElec Support

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

LOG_FILE="/var/log/dangerprep-hardware.log"
ALERT_TEMP_CPU=80
ALERT_TEMP_SYSTEM=70
ALERT_TEMP_GPU=85
ALERT_TEMP_NPU=90
ALERT_DISK_TEMP=50

# Detect FriendlyElec hardware
detect_friendlyelec_hardware() {
    IS_FRIENDLYELEC=false
    IS_RK3588=false
    IS_RK3588S=false
    FRIENDLYELEC_MODEL=""

    if [[ -f /proc/device-tree/model ]]; then
        local platform=$(cat /proc/device-tree/model | tr -d '\0')

        if [[ "$platform" =~ (NanoPi|NanoPC|CM3588) ]]; then
            IS_FRIENDLYELEC=true

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
            fi
        fi
    fi
}

# Initialize hardware detection
detect_friendlyelec_hardware

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $1" | tee -a "$LOG_FILE"
    logger -t "HARDWARE-ALERT" -p daemon.warning "$1"
}

# Check CPU temperature with FriendlyElec support
check_cpu_temperature() {
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
        check_rk3588_cpu_temperature
    else
        check_generic_cpu_temperature
    fi
}

# Check generic CPU temperature
check_generic_cpu_temperature() {
    if command -v sensors >/dev/null 2>&1; then
        local cpu_temp=$(sensors | grep -i "core\|cpu" | grep -o '[0-9]\+\.[0-9]\+°C' | head -1 | grep -o '[0-9]\+')
        if [[ -n "$cpu_temp" && $cpu_temp -gt $ALERT_TEMP_CPU ]]; then
            alert "High CPU temperature: ${cpu_temp}°C"
        fi
    fi
}

# Check RK3588/RK3588S CPU temperature
check_rk3588_cpu_temperature() {
    # RK3588/RK3588S thermal zones
    local thermal_zones=(
        "/sys/class/thermal/thermal_zone0/temp"  # SoC thermal zone
        "/sys/class/thermal/thermal_zone1/temp"  # Additional thermal zone
    )

    for zone in "${thermal_zones[@]}"; do
        if [[ -r "$zone" ]]; then
            local temp_millicelsius=$(cat "$zone" 2>/dev/null)
            if [[ -n "$temp_millicelsius" ]]; then
                local temp_celsius=$((temp_millicelsius / 1000))
                local zone_name=$(basename "$(dirname "$zone")")

                log "RK3588 $zone_name: ${temp_celsius}°C"

                if [[ $temp_celsius -gt $ALERT_TEMP_CPU ]]; then
                    alert "High RK3588 temperature in $zone_name: ${temp_celsius}°C"
                fi
            fi
        fi
    done

    # Also check with sensors if available
    if command -v sensors >/dev/null 2>&1; then
        local rk3588_temp=$(sensors 2>/dev/null | grep -i "rk3588\|rockchip" | grep -o '[0-9]\+\.[0-9]\+°C' | head -1 | grep -o '[0-9]\+')
        if [[ -n "$rk3588_temp" && $rk3588_temp -gt $ALERT_TEMP_CPU ]]; then
            alert "High RK3588 SoC temperature: ${rk3588_temp}°C"
        fi
    fi
}

# Check GPU temperature for RK3588/RK3588S
check_gpu_temperature() {
    if [[ "$IS_RK3588" != true && "$IS_RK3588S" != true ]]; then
        return 0
    fi

    # Mali-G610 MP4 GPU thermal monitoring
    local gpu_thermal="/sys/class/thermal/thermal_zone2/temp"

    if [[ -r "$gpu_thermal" ]]; then
        local temp_millicelsius=$(cat "$gpu_thermal" 2>/dev/null)
        if [[ -n "$temp_millicelsius" ]]; then
            local temp_celsius=$((temp_millicelsius / 1000))
            log "Mali GPU temperature: ${temp_celsius}°C"

            if [[ $temp_celsius -gt $ALERT_TEMP_GPU ]]; then
                alert "High GPU temperature: ${temp_celsius}°C"
            fi
        fi
    fi

    # Check GPU frequency and utilization
    local gpu_devfreq="/sys/class/devfreq/fb000000.gpu"
    if [[ -d "$gpu_devfreq" ]]; then
        local cur_freq=$(cat "$gpu_devfreq/cur_freq" 2>/dev/null)
        local governor=$(cat "$gpu_devfreq/governor" 2>/dev/null)

        if [[ -n "$cur_freq" && -n "$governor" ]]; then
            local freq_mhz=$((cur_freq / 1000000))
            log "GPU: ${freq_mhz}MHz, governor: $governor"
        fi
    fi
}

# Check NPU temperature and status for RK3588/RK3588S
check_npu_status() {
    if [[ "$IS_RK3588" != true && "$IS_RK3588S" != true ]]; then
        return 0
    fi

    # NPU thermal monitoring
    local npu_thermal="/sys/class/thermal/thermal_zone3/temp"

    if [[ -r "$npu_thermal" ]]; then
        local temp_millicelsius=$(cat "$npu_thermal" 2>/dev/null)
        if [[ -n "$temp_millicelsius" ]]; then
            local temp_celsius=$((temp_millicelsius / 1000))
            log "NPU temperature: ${temp_celsius}°C"

            if [[ $temp_celsius -gt $ALERT_TEMP_NPU ]]; then
                alert "High NPU temperature: ${temp_celsius}°C"
            fi
        fi
    fi

    # Check NPU frequency and status
    local npu_devfreq="/sys/class/devfreq/fdab0000.npu"
    if [[ -d "$npu_devfreq" ]]; then
        local cur_freq=$(cat "$npu_devfreq/cur_freq" 2>/dev/null)
        local governor=$(cat "$npu_devfreq/governor" 2>/dev/null)

        if [[ -n "$cur_freq" && -n "$governor" ]]; then
            local freq_mhz=$((cur_freq / 1000000))
            log "NPU: ${freq_mhz}MHz, governor: $governor"
        fi
    fi
}

# Check disk temperatures
check_disk_temperature() {
    if command -v hddtemp >/dev/null 2>&1; then
        for disk in /dev/sd* /dev/nvme*; do
            if [[ -b "$disk" ]]; then
                local disk_temp=$(hddtemp "$disk" 2>/dev/null | grep -o '[0-9]\+°C' | grep -o '[0-9]\+')
                if [[ -n "$disk_temp" && $disk_temp -gt $ALERT_DISK_TEMP ]]; then
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
                local smart_status=$(smartctl -H "$disk" 2>/dev/null | grep "SMART overall-health")
                if [[ "$smart_status" == *"FAILED"* ]]; then
                    alert "SMART health check failed for $disk"
                fi
            fi
        done
    fi
}

# Check FriendlyElec-specific hardware features
check_friendlyelec_hardware() {
    if [[ "$IS_FRIENDLYELEC" != true ]]; then
        return 0
    fi

    log "=== FriendlyElec Hardware Status ($FRIENDLYELEC_MODEL) ==="

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
        local vpu_perms=$(ls -l /dev/mpp_service 2>/dev/null | awk '{print $1,$3,$4}')
        log "VPU permissions: $vpu_perms"

        # Check if VPU is in use
        if command -v fuser >/dev/null 2>&1; then
            local vpu_users=$(fuser /dev/mpp_service 2>/dev/null | wc -w)
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
    local drm_devices=$(ls /dev/dri/ 2>/dev/null | wc -l)
    if [[ $drm_devices -gt 0 ]]; then
        log "DRM devices: $drm_devices available"
    else
        log "DRM devices: None detected"
    fi
}

# Check M.2 interfaces
check_m2_interfaces() {
    # Check NVMe devices
    local nvme_count=$(ls /dev/nvme* 2>/dev/null | grep -c "nvme[0-9]n[0-9]" || echo "0")
    if [[ $nvme_count -gt 0 ]]; then
        log "M.2 NVMe: $nvme_count device(s) detected"

        # Check NVMe temperatures
        for nvme in /dev/nvme*n1; do
            if [[ -b "$nvme" ]]; then
                local nvme_temp=$(smartctl -A "$nvme" 2>/dev/null | grep -i temperature | awk '{print $10}' | head -1)
                if [[ -n "$nvme_temp" ]]; then
                    log "NVMe $(basename "$nvme") temperature: ${nvme_temp}°C"
                    if [[ $nvme_temp -gt $ALERT_DISK_TEMP ]]; then
                        alert "High NVMe temperature on $(basename "$nvme"): ${nvme_temp}°C"
                    fi
                fi
            fi
        done
    else
        log "M.2 NVMe: No devices detected"
    fi

    # Check for WiFi modules (M.2 E-key)
    local wifi_modules=$(lspci 2>/dev/null | grep -i "network\|wireless" | wc -l)
    if [[ $wifi_modules -gt 0 ]]; then
        log "M.2 WiFi modules: $wifi_modules detected"
    else
        log "M.2 WiFi modules: None detected"
    fi
}

# Check RTC status
check_rtc_status() {
    if [[ -f /sys/class/rtc/rtc0/name ]]; then
        local rtc_name=$(cat /sys/class/rtc/rtc0/name 2>/dev/null)
        log "RTC: $rtc_name"

        if [[ "$rtc_name" =~ hym8563 ]]; then
            # Check RTC time vs system time
            local rtc_time=$(cat /sys/class/rtc/rtc0/since_epoch 2>/dev/null)
            local sys_time=$(date +%s)

            if [[ -n "$rtc_time" && -n "$sys_time" ]]; then
                local time_diff=$((sys_time - rtc_time))
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

case "${1:-check}" in
    check)
        log "=== Hardware Monitoring Check ==="
        check_cpu_temperature
        check_disk_temperature
        check_disk_health

        # FriendlyElec-specific checks
        if [[ "$IS_FRIENDLYELEC" == true ]]; then
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
        if [[ "$IS_FRIENDLYELEC" == true ]]; then
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
                local smart_status=$(smartctl -H "$disk" 2>/dev/null | grep "SMART overall-health" || echo "N/A")
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
                local status=$(ip link show "$iface" | grep -o "state [A-Z]*" | awk '{print $2}')
                log "$iface: $status"
            fi
        done
        ;;
    friendlyelec)
        if [[ "$IS_FRIENDLYELEC" == true ]]; then
            check_friendlyelec_hardware
        else
            log "Not running on FriendlyElec hardware"
        fi
        ;;
    *)
        echo "Usage: $0 {check|report|friendlyelec}"
        echo "  check       - Run basic hardware checks"
        echo "  report      - Generate comprehensive hardware report"
        echo "  friendlyelec - FriendlyElec-specific hardware report"
        exit 1
        ;;
esac
