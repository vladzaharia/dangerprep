#!/usr/bin/env bash
# DangerPrep Hardware Detection Utilities
#
# Purpose: Shared hardware detection functions for FriendlyElec and RK3588 platforms
# Usage: Source this file to access hardware detection functions
# Dependencies: cat (coreutils), tr (coreutils)
# Author: DangerPrep Project
# Version: 1.0

# Modern shell script best practices
set -euo pipefail

# Hardware detection variables (exported for use by other scripts)
export IS_FRIENDLYELEC=false
export IS_RK3588=false
export IS_RK3588S=false
export FRIENDLYELEC_MODEL=""
export HARDWARE_PLATFORM=""

# Detect hardware platform from device tree
detect_hardware_platform() {
    set_error_context "Hardware platform detection"

    # Initialize variables
    IS_FRIENDLYELEC=false
    IS_RK3588=false
    IS_RK3588S=false
    FRIENDLYELEC_MODEL=""
    HARDWARE_PLATFORM=""

    # Check if device tree model file exists
    local model_file="/proc/device-tree/model"
    if [[ ! -f "$model_file" ]]; then
        debug "Device tree model file not found: $model_file"
        HARDWARE_PLATFORM="Unknown"
        clear_error_context
        return 0
    fi

    # Read platform information safely
    local platform
    if ! platform=$(cat "$model_file" | tr -d '\0' 2>/dev/null); then
        warning "Failed to read device tree model"
        HARDWARE_PLATFORM="Unknown"
        clear_error_context
        return 0
    fi

    validate_not_empty "$platform" "platform information"
    HARDWARE_PLATFORM="$platform"

    # Detect FriendlyElec devices
    if [[ "$platform" =~ (NanoPi|NanoPC|CM3588) ]]; then
        IS_FRIENDLYELEC=true
        debug "FriendlyElec hardware detected: $platform"

        # Identify specific models and SoC variants
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
            # Try to detect RK3588 variants from platform string
            if [[ "$platform" =~ (RK3588S|rk3588s) ]]; then
                IS_RK3588S=true
            elif [[ "$platform" =~ (RK3588|rk3588) ]]; then
                IS_RK3588=true
            fi
        fi

        success "Detected FriendlyElec model: ${FRIENDLYELEC_MODEL}"
    else
        debug "Non-FriendlyElec hardware detected: $platform"
        
        # Check for RK3588 variants on non-FriendlyElec hardware
        if [[ "$platform" =~ (RK3588S|rk3588s) ]]; then
            IS_RK3588S=true
            debug "RK3588S SoC detected on non-FriendlyElec hardware"
        elif [[ "$platform" =~ (RK3588|rk3588) ]]; then
            IS_RK3588=true
            debug "RK3588 SoC detected on non-FriendlyElec hardware"
        fi
    fi

    # Export variables for use by other scripts
    export IS_FRIENDLYELEC
    export IS_RK3588
    export IS_RK3588S
    export FRIENDLYELEC_MODEL
    export HARDWARE_PLATFORM

    clear_error_context
}

# Validate RK3588/RK3588S platform compatibility
validate_rk3588_platform() {
    set_error_context "RK3588 platform validation"

    # Ensure hardware detection has been run
    if [[ -z "${HARDWARE_PLATFORM:-}" ]]; then
        detect_hardware_platform
    fi

    if [[ -z "$HARDWARE_PLATFORM" ]]; then
        error "Cannot detect hardware platform"
        error "This function requires RK3588/RK3588S platforms"
        clear_error_context
        return 1
    fi

    if [[ "${IS_RK3588}" != "true" && "${IS_RK3588S}" != "true" ]]; then
        warning "Hardware platform may not be RK3588/RK3588S: $HARDWARE_PLATFORM"
        warning "RK3588-specific features may not work correctly"
        clear_error_context
        return 1
    else
        local soc_variant="RK3588"
        if [[ "${IS_RK3588S}" == "true" ]]; then
            soc_variant="RK3588S"
        fi
        success "$soc_variant platform validated: $HARDWARE_PLATFORM"
    fi

    clear_error_context
    return 0
}

# Validate FriendlyElec platform compatibility
validate_friendlyelec_platform() {
    set_error_context "FriendlyElec platform validation"

    # Ensure hardware detection has been run
    if [[ -z "${HARDWARE_PLATFORM:-}" ]]; then
        detect_hardware_platform
    fi

    if [[ "${IS_FRIENDLYELEC}" != "true" ]]; then
        warning "Hardware platform is not FriendlyElec: ${HARDWARE_PLATFORM:-Unknown}"
        warning "FriendlyElec-specific features may not be available"
        clear_error_context
        return 1
    else
        success "FriendlyElec platform validated: ${FRIENDLYELEC_MODEL}"
    fi

    clear_error_context
    return 0
}

# Get hardware summary for reporting
get_hardware_summary() {
    # Ensure hardware detection has been run
    if [[ -z "${HARDWARE_PLATFORM:-}" ]]; then
        detect_hardware_platform
    fi

    echo "Hardware Platform: ${HARDWARE_PLATFORM:-Unknown}"
    
    if [[ "${IS_FRIENDLYELEC}" == "true" ]]; then
        echo "FriendlyElec Model: ${FRIENDLYELEC_MODEL}"
    fi
    
    if [[ "${IS_RK3588}" == "true" ]]; then
        echo "SoC: RK3588"
    elif [[ "${IS_RK3588S}" == "true" ]]; then
        echo "SoC: RK3588S"
    fi
}

# Check if platform supports specific features
supports_pwm_fan_control() {
    [[ "${IS_RK3588}" == "true" || "${IS_RK3588S}" == "true" ]]
}

supports_friendlyelec_features() {
    [[ "${IS_FRIENDLYELEC}" == "true" ]]
}

supports_rk3588_thermal_zones() {
    [[ "${IS_RK3588}" == "true" || "${IS_RK3588S}" == "true" ]]
}

# Initialize hardware detection on source
# This ensures variables are available immediately when script is sourced
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    # Script is being sourced, run detection automatically
    detect_hardware_platform >/dev/null 2>&1 || true
fi
