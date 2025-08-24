#!/bin/bash
# FriendlyElec GPIO and PWM Interface Setup Script
# Configures hardware interfaces for RK3588/RK3588S boards

set -euo pipefail

# Source gum utilities for enhanced logging and user interaction
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/../shared/gum-utils.sh" ]]; then
    # shellcheck source=../shared/gum-utils.sh
    source "$SCRIPT_DIR/../shared/gum-utils.sh"
else
    echo "ERROR: gum-utils.sh not found. Cannot continue without logging functions." >&2
    exit 1
fi

# Configuration file
CONFIG_FILE="/etc/dangerprep/gpio-pwm-setup.conf"

# Default configuration
GPIO_GROUPS="gpio gpio-admin"
PWM_GROUPS="gpio pwm"
I2C_GROUPS="i2c"
SPI_GROUPS="spi"
export ALLOW_NON_ROOT_GPIO=true
export ALLOW_NON_ROOT_PWM=true
export ALLOW_NON_ROOT_I2C=true
ALLOW_NON_ROOT_SPI=false

# Load configuration
load_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        # shellcheck source=/dev/null
        source "$CONFIG_FILE"
    fi
}

# Create system groups for hardware access
create_hardware_groups() {
    enhanced_section "Hardware Access Groups" "Creating system groups for GPIO, PWM, I2C, and SPI access" "👥"

    # Create array from space-separated group lists
    local all_groups=()
    # shellcheck disable=SC2206
    all_groups+=($GPIO_GROUPS $PWM_GROUPS $I2C_GROUPS $SPI_GROUPS)
    local total_groups=${#all_groups[@]}
    local current_group=0

    # GPIO groups
    for group in $GPIO_GROUPS; do
        ((++current_group))
        enhanced_progress_bar "$current_group" "$total_groups" "Creating Hardware Groups"

        if ! getent group "$group" >/dev/null 2>&1; then
            enhanced_spin "Creating GPIO group: $group" groupadd "$group"
            enhanced_status_indicator "success" "Created GPIO group: $group"
        else
            enhanced_status_indicator "info" "GPIO group already exists: $group"
        fi
    done

    # PWM groups
    for group in $PWM_GROUPS; do
        ((++current_group))
        enhanced_progress_bar "$current_group" "$total_groups" "Creating Hardware Groups"

        if ! getent group "$group" >/dev/null 2>&1; then
            enhanced_spin "Creating PWM group: $group" groupadd "$group"
            enhanced_status_indicator "success" "Created PWM group: $group"
        else
            enhanced_status_indicator "info" "PWM group already exists: $group"
        fi
    done

    # I2C groups
    for group in $I2C_GROUPS; do
        ((++current_group))
        enhanced_progress_bar "$current_group" "$total_groups" "Creating Hardware Groups"

        if ! getent group "$group" >/dev/null 2>&1; then
            enhanced_spin "Creating I2C group: $group" groupadd "$group"
            enhanced_status_indicator "success" "Created I2C group: $group"
        else
            enhanced_status_indicator "info" "I2C group already exists: $group"
        fi
    done

    # SPI groups
    for group in $SPI_GROUPS; do
        ((++current_group))
        enhanced_progress_bar "$current_group" "$total_groups" "Creating Hardware Groups"

        if ! getent group "$group" >/dev/null 2>&1; then
            enhanced_spin "Creating SPI group: $group" groupadd "$group"
            enhanced_status_indicator "success" "Created SPI group: $group"
        else
            enhanced_status_indicator "info" "SPI group already exists: $group"
        fi
    done
}

# Configure GPIO access
configure_gpio_access() {
    log_info "Configuring GPIO access..."
    
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
    
    log_success "GPIO access configured"
}

# Configure PWM access
configure_pwm_access() {
    log_info "Configuring PWM access..."
    
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
    
    log_success "PWM access configured"
}

# Configure I2C access
configure_i2c_access() {
    log_info "Configuring I2C access..."

    # Install I2C tools if not present
    if ! command -v i2cdetect >/dev/null 2>&1; then
        log_info "Installing I2C tools..."
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
    
    log_success "I2C access configured"
}

# Configure SPI access
configure_spi_access() {
    log_info "Configuring SPI access..."
    
    # Create udev rules for SPI access
    if [[ "$ALLOW_NON_ROOT_SPI" == true ]]; then
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
            if [[ "$ALLOW_NON_ROOT_SPI" == true ]]; then
                chgrp spi "$spi_dev" 2>/dev/null || true
                chmod 664 "$spi_dev" 2>/dev/null || true
            else
                chgrp root "$spi_dev" 2>/dev/null || true
                chmod 600 "$spi_dev" 2>/dev/null || true
            fi
        fi
    done
    
    log_success "SPI access configured"
}

# Configure UART access
configure_uart_access() {
    log_info "Configuring UART access..."
    
    # Create udev rules for UART access
    cat > /etc/udev/rules.d/99-friendlyelec-uart.rules << 'EOF'
# FriendlyElec UART access rules
KERNEL=="ttyS[0-9]*", GROUP="dialout", MODE="0664"
KERNEL=="ttyAMA[0-9]*", GROUP="dialout", MODE="0664"
KERNEL=="ttyUSB[0-9]*", GROUP="dialout", MODE="0664"
EOF
    
    log_success "UART access configured"
}

# Add user to hardware groups
add_user_to_groups() {
    local username="${1:-$SUDO_USER}"
    
    if [[ -z "$username" ]]; then
        log_warn "No username provided, skipping user group assignment"
        return 0
    fi

    log_info "Adding user $username to hardware groups..."
    
    # Add to GPIO groups
    for group in $GPIO_GROUPS; do
        usermod -a -G "$group" "$username" 2>/dev/null || true
    done
    
    # Add to PWM groups
    for group in $PWM_GROUPS; do
        usermod -a -G "$group" "$username" 2>/dev/null || true
    done
    
    # Add to I2C groups
    for group in $I2C_GROUPS; do
        usermod -a -G "$group" "$username" 2>/dev/null || true
    done
    
    # Add to SPI groups (if allowed)
    if [[ "$ALLOW_NON_ROOT_SPI" == true ]]; then
        for group in $SPI_GROUPS; do
            usermod -a -G "$group" "$username" 2>/dev/null || true
        done
    fi
    
    # Add to dialout for UART access
    usermod -a -G dialout "$username" 2>/dev/null || true
    
    log_success "User $username added to hardware groups"
}

# Test hardware interfaces
test_hardware_interfaces() {
    log_info "Testing hardware interfaces..."

    # Test GPIO
    if [[ -d /sys/class/gpio ]]; then
        log_success "GPIO interface available"
    else
        log_warn "GPIO interface not available"
    fi

    # Test PWM
    if [[ -d /sys/class/pwm ]]; then
        local pwm_chips
        pwm_chips=$(find /sys/class/pwm -name "pwmchip*" 2>/dev/null | wc -l)
        log_success "PWM interface available (${pwm_chips} chips)"
    else
        log_warn "PWM interface not available"
    fi

    # Test I2C
    local i2c_buses
    i2c_buses=$(find /dev -name "i2c-*" 2>/dev/null | wc -l)
    if [[ ${i2c_buses} -gt 0 ]]; then
        log_success "I2C interface available (${i2c_buses} buses)"
    else
        log_warn "I2C interface not available"
    fi

    # Test SPI
    local spi_devices
    spi_devices=$(find /dev -name "spidev*" 2>/dev/null | wc -l)
    if [[ ${spi_devices} -gt 0 ]]; then
        log_success "SPI interface available (${spi_devices} devices)"
    else
        log_warn "SPI interface not available"
    fi
}

# Main function
main() {
    case "${1:-setup}" in
        setup)
            log_info "Setting up FriendlyElec GPIO and PWM interfaces..."
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
            log_success "FriendlyElec hardware interface setup completed"
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
