#!/bin/bash
# FriendlyElec GPIO and PWM Interface Setup Script
# Configures hardware interfaces for RK3588/RK3588S boards

set -euo pipefail

# Basic logging functions
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
success() { echo "[SUCCESS] $*"; }
warning() { echo "[WARNING] $*"; }
error() { echo "[ERROR] $*"; }

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
        source "${CONFIG_FILE}"
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
        local pwm_chips
        pwm_chips=$(find /sys/class/pwm/pwmchip* -maxdepth 1 -type f 2>/dev/null | wc -l)
        success "PWM interface available ($pwm_chips chips)"
    else
        warning "PWM interface not available"
    fi
    
    # Test I2C
    local i2c_buses
    i2c_buses=$(find /dev/i2c-* -maxdepth 1 -type f 2>/dev/null | wc -l)
    if [[ $i2c_buses -gt 0 ]]; then
        success "I2C interface available ($i2c_buses buses)"
    else
        warning "I2C interface not available"
    fi
    
    # Test SPI
    local spi_devices
    spi_devices=$(find /dev/spidev* -maxdepth 1 -type f 2>/dev/null | wc -l)
    if [[ $spi_devices -gt 0 ]]; then
        success "SPI interface available ($spi_devices devices)"
    else
        warning "SPI interface not available"
    fi
}

# Main function
main() {
    case "${1:-setup}" in
        setup)
            log "Setting up FriendlyElec GPIO and PWM interfaces..."
            load_config
            create_hardware_groups
            configure_gpio_access
            configure_pwm_access
            configure_i2c_access
            configure_spi_access
            configure_uart_access
            add_user_to_groups "${2:-}"
            
            # Reload udev rules
            udevadm control --reload-rules
            udevadm trigger
            
            test_hardware_interfaces
            success "FriendlyElec hardware interface setup completed"
            ;;
        test)
            test_hardware_interfaces
            ;;
        *)
            echo "Usage: $0 {setup [username]|test}"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
