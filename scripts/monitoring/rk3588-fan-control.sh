#!/usr/bin/env bash
# RK3588/RK3588S PWM Fan Control Script
# Automatic thermal management with intelligent fan curve control

# Modern shell script best practices
set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR

# Source shared utilities
# shellcheck source=../shared/logging.sh
source "${SCRIPT_DIR}/../shared/logging.sh"
# shellcheck source=../shared/error-handling.sh
source "${SCRIPT_DIR}/../shared/error-handling.sh"
# shellcheck source=../shared/validation.sh
source "${SCRIPT_DIR}/../shared/validation.sh"
# shellcheck source=../shared/banner.sh
source "${SCRIPT_DIR}/../shared/banner.sh"
# shellcheck source=../shared/hardware-detection.sh
source "${SCRIPT_DIR}/../shared/hardware-detection.sh"

# Configuration file
CONFIG_FILE="/etc/dangerprep/rk3588-fan-control.conf"
DEFAULT_CONFIG="/etc/default/rk3588-fan-control"

# Default configuration values
TEMP_MIN=40
TEMP_LOW=50
TEMP_MID=65
TEMP_HIGH=75
TEMP_MAX=85
TEMP_CRITICAL=90
FAN_SPEED_OFF=0
FAN_SPEED_MIN=25
FAN_SPEED_LOW=40
FAN_SPEED_MID=60
FAN_SPEED_HIGH=80
FAN_SPEED_MAX=100
PWM_FREQUENCY=25000
MONITOR_INTERVAL=5
TEMP_HYSTERESIS=3
ENABLE_LOGGING=true
EMERGENCY_SHUTDOWN_TEMP=95
# Fan failure detection settings - used in monitoring
export FAN_FAILURE_DETECTION=true
export FAN_FAILURE_TIMEOUT=30

# Initialize script with validation
init_script() {
    set_error_context "Script initialization"

    # Validate root permissions for PWM access
    validate_root_user

    # Validate required commands
    require_commands cat echo sleep logger

    # Validate hardware platform
    validate_rk3588_hardware

    # Validate PWM hardware availability
    validate_pwm_hardware

    debug "RK3588 fan control initialized"
    clear_error_context
}

# Validate RK3588 hardware platform using shared detection
validate_rk3588_hardware() {
    # Use shared hardware detection and validation
    validate_rk3588_platform
}

# Validate PWM hardware availability
validate_pwm_hardware() {
    set_error_context "PWM hardware validation"

    local pwm_chip="${FAN_PWM_CHIP:-/sys/class/pwm/pwmchip0}"

    if [[ ! -d "$pwm_chip" ]]; then
        error "PWM chip not found: $pwm_chip"
        error "PWM hardware may not be available or kernel module not loaded"
        error "Try: modprobe pwm-rockchip"
        return 1
    fi

    if [[ ! -w "$pwm_chip" ]]; then
        error "No write access to PWM chip: $pwm_chip"
        error "This script must be run as root for PWM access"
        return 1
    fi

    success "PWM hardware validated: $pwm_chip"
    clear_error_context
}

# Load configuration
load_config() {
    set_error_context "Configuration loading"

    if [[ -f "${CONFIG_FILE}" ]]; then
        # shellcheck source=/dev/null
        if source "${CONFIG_FILE}" 2>/dev/null; then
            info "Configuration loaded from: ${CONFIG_FILE}"
        else
            warning "Failed to load configuration from: ${CONFIG_FILE}"
        fi
    elif [[ -f "${DEFAULT_CONFIG}" ]]; then
        # shellcheck source=/dev/null
        if source "${DEFAULT_CONFIG}" 2>/dev/null; then
            info "Configuration loaded from: ${DEFAULT_CONFIG}"
        else
            warning "Failed to load configuration from: ${DEFAULT_CONFIG}"
        fi
    else
        info "No configuration file found, using defaults"
    fi

    clear_error_context
}

# Logging function
log_message() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    if [[ "${ENABLE_LOGGING}" == true ]]; then
        echo "[$timestamp] [$level] $message" >> "${FAN_LOG_FILE:-/var/log/rk3588-fan-control.log}"
    fi
    
    # Also log to syslog for systemd
    logger -t "rk3588-fan-control" -p "daemon.$level" "$message"
}

# Get maximum temperature from all sensors
get_max_temperature() {
    local max_temp=0
    local temp_sensors=(
        "/sys/class/thermal/thermal_zone0/temp"
        "/sys/class/thermal/thermal_zone1/temp"
        "/sys/class/thermal/thermal_zone2/temp"
    )
    
    for sensor in "${temp_sensors[@]}"; do
        if [[ -r "$sensor" ]]; then
            local temp_millicelsius
            temp_millicelsius=$(cat "$sensor" 2>/dev/null || echo "0")
            local temp_celsius
            temp_celsius=$((temp_millicelsius / 1000))
            
            if [[ $temp_celsius -gt $max_temp ]]; then
                max_temp=$temp_celsius
            fi
        fi
    done
    
    echo "$max_temp"
}

# Initialize PWM for fan control
init_pwm() {
    local pwm_chip
    pwm_chip=${FAN_PWM_CHIP:-/sys/class/pwm/pwmchip0}
    local pwm_device
    pwm_device=${FAN_PWM_DEVICE:-/sys/class/pwm/pwmchip0/pwm0}
    
    # Check if PWM chip exists
    if [[ ! -d "$pwm_chip" ]]; then
        log_message "error" "PWM chip not found: $pwm_chip"
        return 1
    fi
    
    # Export PWM channel if not already exported
    if [[ ! -d "$pwm_device" ]]; then
        echo "0" > "$pwm_chip/export" 2>/dev/null || {
            log_message "error" "Failed to export PWM channel"
            return 1
        }
        sleep 0.1
    fi
    
    # Set PWM frequency
    local period_ns
    period_ns=$((1000000000 / PWM_FREQUENCY))
    echo "$period_ns" > "$pwm_device/period" 2>/dev/null || {
        log_message "error" "Failed to set PWM period"
        return 1
    }
    
    # Enable PWM
    echo "1" > "$pwm_device/enable" 2>/dev/null || {
        log_message "error" "Failed to enable PWM"
        return 1
    }
    
    log_message "info" "PWM initialized successfully"
    return 0
}

# Set fan speed (0-100%)
set_fan_speed() {
    local speed_percent="$1"
    local pwm_device
    pwm_device=${FAN_PWM_DEVICE:-/sys/class/pwm/pwmchip0/pwm0}
    
    # Validate speed range
    if [[ $speed_percent -lt 0 || $speed_percent -gt 100 ]]; then
        log_message "error" "Invalid fan speed: $speed_percent%"
        return 1
    fi
    
    # Calculate duty cycle
    local period_ns
    period_ns=$(cat "$pwm_device/period" 2>/dev/null || echo "40000")
    local duty_cycle_ns
    duty_cycle_ns=$((period_ns * speed_percent / 100))
    
    # Set duty cycle
    if echo "$duty_cycle_ns" > "$pwm_device/duty_cycle" 2>/dev/null; then
        log_message "debug" "Fan speed set to $speed_percent%"
        return 0
    else
        log_message "error" "Failed to set fan speed to $speed_percent%"
        return 1
    fi
}

# Calculate fan speed based on temperature
calculate_fan_speed() {
    local temp="$1"
    local current_speed="$2"
    local new_speed="$current_speed"
    
    # Apply hysteresis to prevent oscillation
    local temp_up
    temp_up=$((temp))
    local temp_down
    temp_down=$((temp - TEMP_HYSTERESIS))
    
    # Determine fan speed based on temperature thresholds
    if [[ $temp_up -ge ${TEMP_CRITICAL} ]]; then
        new_speed=${FAN_SPEED_MAX}
    elif [[ $temp_up -ge ${TEMP_MAX} ]]; then
        new_speed=${FAN_SPEED_HIGH}
    elif [[ $temp_up -ge ${TEMP_HIGH} ]]; then
        new_speed=${FAN_SPEED_MID}
    elif [[ $temp_up -ge ${TEMP_MID} ]]; then
        new_speed=${FAN_SPEED_LOW}
    elif [[ $temp_up -ge ${TEMP_LOW} ]]; then
        new_speed=${FAN_SPEED_MIN}
    elif [[ $temp_down -le ${TEMP_MIN} ]]; then
        new_speed=${FAN_SPEED_OFF}
    fi
    
    echo "$new_speed"
}

# Emergency shutdown if temperature is too high
check_emergency_shutdown() {
    local temp="$1"
    
    if [[ $temp -ge ${EMERGENCY_SHUTDOWN_TEMP} ]]; then
        log_message "critical" "Emergency shutdown triggered at ${temp}°C"
        echo "Emergency thermal shutdown at ${temp}°C" | wall
        sync
        shutdown -h now "Emergency thermal shutdown"
    fi
}

# Main fan control loop
fan_control_loop() {
    local current_fan_speed=0
    local last_temp=0
    local stable_count=0
    
    log_message "info" "Starting fan control loop"
    
    while true; do
        local temp
        temp=$(get_max_temperature)
        
        # Check for emergency shutdown
        check_emergency_shutdown "$temp"
        
        # Calculate new fan speed
        local new_fan_speed
        new_fan_speed=$(calculate_fan_speed "$temp" "$current_fan_speed")
        
        # Only change fan speed if necessary
        if [[ $new_fan_speed -ne $current_fan_speed ]]; then
            if set_fan_speed "$new_fan_speed"; then
                log_message "info" "Temperature: ${temp}°C, Fan speed: ${new_fan_speed}%"
                current_fan_speed=$new_fan_speed
                stable_count=0
            else
                log_message "error" "Failed to set fan speed"
            fi
        else
            ((stable_count++))
            # Log every 12 cycles (1 minute) when stable
            if [[ $((stable_count % 12)) -eq 0 ]]; then
                log_message "debug" "Temperature stable: ${temp}°C, Fan: ${current_fan_speed}%"
            fi
        fi
        
        # Store last temperature for comparison
        export last_temp=$temp
        sleep "${MONITOR_INTERVAL}"
    done
}

# Error cleanup function
cleanup_on_error() {
    local exit_code=$?
    log_message "error" "Fan control failed with exit code $exit_code"

    # Set fan to safe speed
    set_fan_speed "${FAN_SPEED_HIGH}" || true

    # Clean up PWM if needed
    local pwm_device="${FAN_PWM_DEVICE:-/sys/class/pwm/pwmchip0/pwm0}"
    if [[ -w "$pwm_device/enable" ]]; then
        echo "0" > "$pwm_device/enable" 2>/dev/null || true
    fi

    log_message "error" "Fan control cleanup completed"
    exit $exit_code
}

# Normal cleanup function
cleanup() {
    log_message "info" "Fan control stopping, setting fan to safe speed"
    set_fan_speed "${FAN_SPEED_HIGH}" || true
    exit 0
}

# Signal handlers
trap cleanup SIGTERM SIGINT
trap cleanup_on_error ERR

# Main function
main() {
    # Show banner for fan control operations
    if [[ "${1:-start}" != "help" && "${1:-start}" != "--help" && "${1:-start}" != "-h" ]]; then
        show_banner_with_title "RK3588 Fan Control" "monitoring"
        echo
    fi

    case "${1:-start}" in
        start)
            init_script
            load_config
            if init_pwm; then
                fan_control_loop
            else
                log_message "error" "Failed to initialize PWM"
                exit 1
            fi
            ;;
        stop)
            log_message "info" "Stopping fan control"
            set_fan_speed "${FAN_SPEED_HIGH}"
            ;;
        status)
            init_script
            load_config
            local temp
            temp=$(get_max_temperature)
            echo "Current temperature: ${temp}°C"
            if [[ -r "${FAN_PWM_DEVICE:-/sys/class/pwm/pwmchip0/pwm0}/duty_cycle" ]]; then
                local duty
                duty=$(cat "${FAN_PWM_DEVICE:-/sys/class/pwm/pwmchip0/pwm0}/duty_cycle")
                local period
                period=$(cat "${FAN_PWM_DEVICE:-/sys/class/pwm/pwmchip0/pwm0}/period")
                local speed_percent
                speed_percent=$((duty * 100 / period))
                echo "Current fan speed: ${speed_percent}%"
            fi
            ;;
        test)
            init_script
            load_config
            init_pwm
            echo "Testing fan speeds..."
            for speed in 0 25 50 75 100 50 0; do
                echo "Setting fan speed to ${speed}%"
                set_fan_speed "$speed"
                sleep 2
            done
            ;;
        help|--help|-h)
            echo "RK3588/RK3588S PWM Fan Control Script"
            echo "Usage: $0 {start|stop|status|test|help}"
            echo ""
            echo "Commands:"
            echo "  start   - Start fan control daemon"
            echo "  stop    - Stop fan control and set safe speed"
            echo "  status  - Show current temperature and fan speed"
            echo "  test    - Test fan speed control"
            echo "  help    - Show this help message"
            exit 0
            ;;
        *)
            echo "Usage: $0 {start|stop|status|test|help}"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
