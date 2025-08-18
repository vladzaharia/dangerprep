#!/bin/bash
# FriendlyElec GPIO and PWM Interface Setup Script
# Configures hardware interfaces for RK3588/RK3588S boards

set -euo pipefail

# Script metadata
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utilities if available
if [[ -f "${SCRIPT_DIR}/../../shared/logging.sh" ]]; then
    # shellcheck source=../../shared/logging.sh
    source "${SCRIPT_DIR}/../../shared/logging.sh"
    # shellcheck source=../../shared/errors.sh
    source "${SCRIPT_DIR}/../../shared/errors.sh"
    # shellcheck source=../../shared/validation.sh
    source "${SCRIPT_DIR}/../../shared/validation.sh"
else
    # Fallback logging functions if shared utilities not available
    log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
    success() { echo "[SUCCESS] $*"; }
    warning() { echo "[WARNING] $*"; }
    error() { echo "[ERROR] $*"; }

    # Basic validation function
    validate_root_user() {
        if [[ $EUID -ne 0 ]]; then
            error "This script must be run as root"
            exit 1
        fi
    }

    # Basic command validation
    require_commands() {
        local missing_commands=()
        for cmd in "$@"; do
            if ! command -v "$cmd" >/dev/null 2>&1; then
                missing_commands+=("$cmd")
            fi
        done

        if [[ ${#missing_commands[@]} -gt 0 ]]; then
            error "Missing required commands: ${missing_commands[*]}"
            exit 1
        fi
    }
fi

# Configuration file
CONFIG_FILE="/etc/dangerprep/gpio-pwm-setup.conf"

# Default configuration
GPIO_GROUPS="gpio gpio-admin"
PWM_GROUPS="gpio pwm"
I2C_GROUPS="i2c"
SPI_GROUPS="spi"
# Configuration flags (defined for documentation purposes)
ALLOW_NON_ROOT_SPI=false

# Load configuration
load_config() {
    if [[ -f "${CONFIG_FILE}" ]]; then
        # shellcheck source=/dev/null
        if source "${CONFIG_FILE}" 2>/dev/null; then
            log "Configuration loaded from: ${CONFIG_FILE}"
            return 0
        else
            warning "Failed to load configuration from: ${CONFIG_FILE}"
            return 1
        fi
    else
        log "No configuration file found, using defaults"
        return 0
    fi
}

# Create system groups for hardware access
create_hardware_groups() {
    log "Creating hardware access groups..."
    
    # GPIO groups
    for group in ${GPIO_GROUPS}; do
        if ! getent group "$group" >/dev/null 2>&1; then
            groupadd "$group"
            success "Created group: $group"
        else
            log "Group already exists: $group"
        fi
    done
    
    # PWM groups
    for group in ${PWM_GROUPS}; do
        if ! getent group "$group" >/dev/null 2>&1; then
            groupadd "$group"
            success "Created group: $group"
        else
            log "Group already exists: $group"
        fi
    done
    
    # I2C groups
    for group in ${I2C_GROUPS}; do
        if ! getent group "$group" >/dev/null 2>&1; then
            groupadd "$group"
            success "Created group: $group"
        else
            log "Group already exists: $group"
        fi
    done
    
    # SPI groups
    for group in ${SPI_GROUPS}; do
        if ! getent group "$group" >/dev/null 2>&1; then
            groupadd "$group"
            success "Created group: $group"
        else
            log "Group already exists: $group"
        fi
    done
}

# Configure GPIO access
configure_gpio_access() {
    log "Configuring GPIO access..."
    
    # Create udev rules for GPIO access
    cat > /etc/udev/rules.d/99-friendlyelec-gpio.rules << 'EOF'
# FriendlyElec GPIO access rules
SUBSYSTEM=="gpio", GROUP="gpio", MODE="0664"
KERNEL=="gpiochip*", GROUP="gpio", MODE="0664"

# GPIO export/unexport
KERNEL=="export", SUBSYSTEM=="gpio", GROUP="gpio", MODE="0220"
KERNEL=="unexport", SUBSYSTEM=="gpio", GROUP="gpio", MODE="0220"

# Individual GPIO pins
SUBSYSTEM=="gpio", KERNEL=="gpio*", ATTR{direction}=="*", GROUP="gpio", MODE="0664"
EOF
    
    # Set permissions for existing GPIO devices
    if [[ -d /sys/class/gpio ]]; then
        chgrp -R gpio /sys/class/gpio 2>/dev/null || true
        chmod -R g+rw /sys/class/gpio 2>/dev/null || true
    fi
    
    success "GPIO access configured"
}

# Configure PWM access
configure_pwm_access() {
    log "Configuring PWM access..."
    
    # Create udev rules for PWM access
    cat > /etc/udev/rules.d/99-friendlyelec-pwm.rules << 'EOF'
# FriendlyElec PWM access rules
KERNEL=="pwm*", GROUP="pwm", MODE="0664"
SUBSYSTEM=="pwm", GROUP="pwm", MODE="0664"

# PWM chip access
KERNEL=="pwmchip*", GROUP="pwm", MODE="0664"

# PWM export/unexport
KERNEL=="export", SUBSYSTEM=="pwm", GROUP="pwm", MODE="0220"
KERNEL=="unexport", SUBSYSTEM=="pwm", GROUP="pwm", MODE="0220"

# Individual PWM channels
SUBSYSTEM=="pwm", KERNEL=="pwm*", ATTR{period}=="*", GROUP="pwm", MODE="0664"
SUBSYSTEM=="pwm", KERNEL=="pwm*", ATTR{duty_cycle}=="*", GROUP="pwm", MODE="0664"
SUBSYSTEM=="pwm", KERNEL=="pwm*", ATTR{enable}=="*", GROUP="pwm", MODE="0664"
EOF
    
    # Set permissions for existing PWM devices
    if [[ -d /sys/class/pwm ]]; then
        chgrp -R pwm /sys/class/pwm 2>/dev/null || true
        chmod -R g+rw /sys/class/pwm 2>/dev/null || true
    fi
    
    success "PWM access configured"
}

# Configure I2C access
configure_i2c_access() {
    log "Configuring I2C access..."
    
    # Install I2C tools if not present
    if ! command -v i2cdetect >/dev/null 2>&1; then
        log "Installing I2C tools..."
        apt update
        apt install -y i2c-tools
    fi
    
    # Create udev rules for I2C access
    cat > /etc/udev/rules.d/99-friendlyelec-i2c.rules << 'EOF'
# FriendlyElec I2C access rules
KERNEL=="i2c-[0-9]*", GROUP="i2c", MODE="0664"
EOF
    
    # Set permissions for existing I2C devices
    for i2c_dev in /dev/i2c-*; do
        if [[ -c "$i2c_dev" ]]; then
            chgrp i2c "$i2c_dev" 2>/dev/null || true
            chmod 664 "$i2c_dev" 2>/dev/null || true
        fi
    done
    
    success "I2C access configured"
}

# Configure SPI access
configure_spi_access() {
    log "Configuring SPI access..."
    
    # Create udev rules for SPI access
    if [[ "${ALLOW_NON_ROOT_SPI}" == true ]]; then
        cat > /etc/udev/rules.d/99-friendlyelec-spi.rules << 'EOF'
# FriendlyElec SPI access rules (non-root access enabled)
KERNEL=="spidev*", GROUP="spi", MODE="0664"
EOF
    else
        cat > /etc/udev/rules.d/99-friendlyelec-spi.rules << 'EOF'
# FriendlyElec SPI access rules (root only for security)
KERNEL=="spidev*", GROUP="root", MODE="0600"
EOF
    fi
    
    # Set permissions for existing SPI devices
    for spi_dev in /dev/spidev*; do
        if [[ -c "$spi_dev" ]]; then
            if [[ "${ALLOW_NON_ROOT_SPI}" == true ]]; then
                chgrp spi "$spi_dev" 2>/dev/null || true
                chmod 664 "$spi_dev" 2>/dev/null || true
            else
                chgrp root "$spi_dev" 2>/dev/null || true
                chmod 600 "$spi_dev" 2>/dev/null || true
            fi
        fi
    done
    
    success "SPI access configured"
}

# Configure UART access
configure_uart_access() {
    log "Configuring UART access..."
    
    # Create udev rules for UART access
    cat > /etc/udev/rules.d/99-friendlyelec-uart.rules << 'EOF'
# FriendlyElec UART access rules
KERNEL=="ttyS[0-9]*", GROUP="dialout", MODE="0664"
KERNEL=="ttyAMA[0-9]*", GROUP="dialout", MODE="0664"
KERNEL=="ttyUSB[0-9]*", GROUP="dialout", MODE="0664"
EOF
    
    success "UART access configured"
}

# Add user to hardware groups
add_user_to_groups() {
    local username
    username=${1:-${SUDO_USER}}
    
    if [[ -z "$username" ]]; then
        warning "No username provided, skipping user group assignment"
        return 0
    fi
    
    log "Adding user $username to hardware groups..."
    
    # Add to GPIO groups
    for group in ${GPIO_GROUPS}; do
        usermod -a -G "$group" "$username" 2>/dev/null || true
    done
    
    # Add to PWM groups
    for group in ${PWM_GROUPS}; do
        usermod -a -G "$group" "$username" 2>/dev/null || true
    done
    
    # Add to I2C groups
    for group in ${I2C_GROUPS}; do
        usermod -a -G "$group" "$username" 2>/dev/null || true
    done
    
    # Add to SPI groups (if allowed)
    if [[ "${ALLOW_NON_ROOT_SPI}" == true ]]; then
        for group in ${SPI_GROUPS}; do
            usermod -a -G "$group" "$username" 2>/dev/null || true
        done
    fi
    
    # Add to dialout for UART access
    usermod -a -G dialout "$username" 2>/dev/null || true
    
    success "User $username added to hardware groups"
}

# Detect hardware platform
detect_hardware_platform() {
    log "Detecting hardware platform..."

    local board_info=""
    local is_friendlyelec=false
    local is_rk3588=false

    # Try to detect board model
    if [[ -f /proc/device-tree/model ]]; then
        board_info=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0')
        log "Board model: $board_info"

        if echo "$board_info" | grep -qi "friendlyelec\|nanopi"; then
            is_friendlyelec=true
            success "FriendlyElec hardware detected"

            if echo "$board_info" | grep -qi "rk3588"; then
                is_rk3588=true
                success "RK3588 SoC detected"
            fi
        else
            info "Generic hardware detected"
        fi
    else
        warning "Cannot detect board model"
    fi

    # Export detection results
    export IS_FRIENDLYELEC="$is_friendlyelec"
    export IS_RK3588="$is_rk3588"
    export BOARD_INFO="$board_info"
}

# Test hardware interfaces
test_hardware_interfaces() {
    log "Testing hardware interfaces..."

    local interface_count=0

    # Test GPIO
    if [[ -d /sys/class/gpio ]]; then
        local gpio_chips
        gpio_chips=$(find /sys/class/gpio/gpiochip* -maxdepth 1 -type d 2>/dev/null | wc -l)
        success "GPIO interface available ($gpio_chips chips)"
        ((interface_count++))
    else
        warning "GPIO interface not available"
    fi

    # Test PWM
    if [[ -d /sys/class/pwm ]]; then
        local pwm_chips
        pwm_chips=$(find /sys/class/pwm/pwmchip* -maxdepth 1 -type d 2>/dev/null | wc -l)
        success "PWM interface available ($pwm_chips chips)"
        ((interface_count++))
    else
        warning "PWM interface not available"
    fi

    # Test I2C
    local i2c_buses
    i2c_buses=$(find /dev/i2c-* -maxdepth 1 -type c 2>/dev/null | wc -l)
    if [[ $i2c_buses -gt 0 ]]; then
        success "I2C interface available ($i2c_buses buses)"
        ((interface_count++))
    else
        warning "I2C interface not available"
    fi

    # Test SPI
    local spi_devices
    spi_devices=$(find /dev/spidev* -maxdepth 1 -type c 2>/dev/null | wc -l)
    if [[ $spi_devices -gt 0 ]]; then
        success "SPI interface available ($spi_devices devices)"
        ((interface_count++))
    else
        warning "SPI interface not available"
    fi

    # Test UART
    local uart_devices
    uart_devices=$(find /dev/ttyS* /dev/ttyAMA* -maxdepth 1 -type c 2>/dev/null | wc -l)
    if [[ $uart_devices -gt 0 ]]; then
        success "UART interface available ($uart_devices devices)"
        ((interface_count++))
    else
        warning "UART interface not available"
    fi

    log "Hardware interface summary: $interface_count interfaces available"

    if [[ $interface_count -eq 0 ]]; then
        error "No hardware interfaces detected - this may not be compatible hardware"
        return 1
    fi

    return 0
}

# Cleanup function for error recovery
cleanup_on_error() {
    local exit_code=$?
    error "GPIO/PWM setup failed with exit code $exit_code"

    # Remove any partially created udev rules
    local udev_rules=(
        "/etc/udev/rules.d/99-friendlyelec-gpio.rules"
        "/etc/udev/rules.d/99-friendlyelec-pwm.rules"
        "/etc/udev/rules.d/99-friendlyelec-i2c.rules"
        "/etc/udev/rules.d/99-friendlyelec-spi.rules"
        "/etc/udev/rules.d/99-friendlyelec-uart.rules"
    )

    for rule_file in "${udev_rules[@]}"; do
        if [[ -f "$rule_file" ]]; then
            warning "Removing partially created udev rule: $rule_file"
            rm -f "$rule_file" 2>/dev/null || true
        fi
    done

    # Reload udev rules to clean up
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger 2>/dev/null || true

    error "GPIO/PWM setup cleanup completed"
    exit $exit_code
}

# Initialize script
init_script() {
    # Set up error handling
    trap cleanup_on_error ERR EXIT

    # Validate root permissions
    validate_root_user

    # Validate required commands
    require_commands groupadd usermod udevadm find

    # Create configuration directory if it doesn't exist
    mkdir -p "$(dirname "${CONFIG_FILE}")" 2>/dev/null || true

    log "GPIO/PWM setup script initialized"
}

# Main function
main() {
    case "${1:-setup}" in
        setup)
            init_script
            log "Setting up FriendlyElec GPIO and PWM interfaces..."

            # Detect hardware platform first
            detect_hardware_platform

            if ! load_config; then
                warning "Failed to load configuration, using defaults"
            fi

            create_hardware_groups || {
                error "Failed to create hardware groups"
                exit 1
            }

            configure_gpio_access || {
                error "Failed to configure GPIO access"
                exit 1
            }

            configure_pwm_access || {
                error "Failed to configure PWM access"
                exit 1
            }

            configure_i2c_access || {
                error "Failed to configure I2C access"
                exit 1
            }

            configure_spi_access || {
                error "Failed to configure SPI access"
                exit 1
            }

            configure_uart_access || {
                error "Failed to configure UART access"
                exit 1
            }

            add_user_to_groups "${2:-}" || {
                warning "Failed to add user to groups"
            }

            # Reload udev rules
            if ! udevadm control --reload-rules 2>/dev/null; then
                warning "Failed to reload udev rules"
            fi

            if ! udevadm trigger 2>/dev/null; then
                warning "Failed to trigger udev"
            fi

            test_hardware_interfaces
            success "FriendlyElec hardware interface setup completed"
            ;;
        test)
            test_hardware_interfaces
            ;;
        *)
            echo "Usage: $0 {setup [username]|test}"
            echo ""
            echo "Commands:"
            echo "  setup [username]  - Set up GPIO/PWM interfaces and optionally add user to groups"
            echo "  test              - Test hardware interface availability"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
