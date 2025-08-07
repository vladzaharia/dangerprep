#!/bin/bash
# DangerPrep Hardware Monitoring Script

LOG_FILE="/var/log/dangerprep-hardware.log"
ALERT_TEMP_CPU=80
ALERT_TEMP_SYSTEM=70
ALERT_DISK_TEMP=50

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $1" | tee -a "$LOG_FILE"
    logger -t "HARDWARE-ALERT" -p daemon.warning "$1"
}

# Check CPU temperature
check_cpu_temperature() {
    if command -v sensors >/dev/null 2>&1; then
        local cpu_temp=$(sensors | grep -i "core\|cpu" | grep -o '[0-9]\+\.[0-9]\+°C' | head -1 | grep -o '[0-9]\+')
        if [[ -n "$cpu_temp" && $cpu_temp -gt $ALERT_TEMP_CPU ]]; then
            alert "High CPU temperature: ${cpu_temp}°C"
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
        for disk in /dev/sd* /dev/nvme*; do
            if [[ -b "$disk" ]]; then
                local smart_status=$(smartctl -H "$disk" 2>/dev/null | grep "SMART overall-health")
                if [[ "$smart_status" == *"FAILED"* ]]; then
                    alert "SMART health check failed for $disk"
                fi
            fi
        done
    fi
}

# Main monitoring function
case "${1:-check}" in
    check)
        check_cpu_temperature
        check_disk_temperature
        check_disk_health
        ;;
    report)
        log "=== Hardware Status Report ==="
        sensors 2>/dev/null || echo "Sensors not available"
        echo "Disk temperatures:"
        hddtemp /dev/sd* /dev/nvme* 2>/dev/null || echo "hddtemp not available"
        echo "SMART status:"
        for disk in /dev/sd* /dev/nvme*; do
            if [[ -b "$disk" ]]; then
                echo "$disk: $(smartctl -H "$disk" 2>/dev/null | grep "SMART overall-health" || echo "N/A")"
            fi
        done
        ;;
    *)
        echo "Usage: $0 {check|report}"
        exit 1
        ;;
esac
