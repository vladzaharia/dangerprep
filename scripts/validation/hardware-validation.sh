#!/bin/bash
# FriendlyElec Hardware Validation and Testing Script
# Comprehensive validation of GPU, VPU, NPU, and other hardware features

set -euo pipefail

# Basic logging functions
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
success() { echo "[SUCCESS] $*"; }
warning() { echo "[WARNING] $*"; }
error() { echo "[ERROR] $*"; }

# Validation results
VALIDATION_RESULTS=()
ISSUES_FOUND=0

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

# Add validation result
add_result() {
    local status="$1"
    local component="$2"
    local message="$3"
    
    VALIDATION_RESULTS+=("$status|$component|$message")
    
    case "$status" in
        "PASS") success "$component: $message" ;;
        "FAIL") error "$component: $message"; ((ISSUES_FOUND++)) ;;
        "WARN") warning "$component: $message" ;;
        "INFO") log "$component: $message" ;;
    esac
}

# Validate GPU functionality
validate_gpu() {
    log "Validating GPU functionality..."
    
    # Check if Mali GPU is detected
    if [[ -d /sys/class/devfreq/fb000000.gpu ]]; then
        add_result "PASS" "GPU" "Mali GPU device detected"
        
        # Check GPU governor
        local gpu_governor=$(cat /sys/class/devfreq/fb000000.gpu/governor 2>/dev/null || echo "unknown")
        add_result "INFO" "GPU" "Governor: $gpu_governor"
        
        # Check GPU frequency
        local gpu_freq=$(cat /sys/class/devfreq/fb000000.gpu/cur_freq 2>/dev/null || echo "0")
        local gpu_freq_mhz=$((gpu_freq / 1000000))
        add_result "INFO" "GPU" "Current frequency: ${gpu_freq_mhz}MHz"
        
        # Test OpenGL ES if available
        test_opengl_es
        
    else
        add_result "FAIL" "GPU" "Mali GPU device not detected"
    fi
}

# Test OpenGL ES functionality
test_opengl_es() {
    log "Testing OpenGL ES functionality..."
    
    # Check for OpenGL ES libraries
    if ldconfig -p | grep -q "libGLESv2"; then
        add_result "PASS" "OpenGL ES" "Libraries available"
        
        # Test with glmark2-es2 if available
        if command -v glmark2-es2 >/dev/null 2>&1; then
            log "Running glmark2-es2 benchmark..."
            local glmark_output
            if glmark_output=$(timeout 30 glmark2-es2 --off-screen --run-forever 2>&1 | head -20); then
                local score=$(echo "$glmark_output" | grep -o "Score: [0-9]*" | grep -o "[0-9]*" || echo "0")
                if [[ $score -gt 0 ]]; then
                    add_result "PASS" "OpenGL ES" "Benchmark score: $score"
                else
                    add_result "WARN" "OpenGL ES" "Benchmark completed but no score detected"
                fi
            else
                add_result "WARN" "OpenGL ES" "Benchmark test failed or timed out"
            fi
        else
            add_result "WARN" "OpenGL ES" "glmark2-es2 not available for testing"
        fi
    else
        add_result "FAIL" "OpenGL ES" "Libraries not found"
    fi
}

# Validate VPU functionality
validate_vpu() {
    log "Validating VPU functionality..."
    
    # Check VPU device
    if [[ -c /dev/mpp_service ]]; then
        add_result "PASS" "VPU" "MPP service device available"
        
        # Check VPU permissions
        local vpu_perms=$(ls -l /dev/mpp_service 2>/dev/null | awk '{print $1,$3,$4}')
        add_result "INFO" "VPU" "Permissions: $vpu_perms"
        
        # Test hardware video decoding
        test_hardware_video_decoding
        
    else
        add_result "FAIL" "VPU" "MPP service device not available"
    fi
}

# Test hardware video decoding
test_hardware_video_decoding() {
    log "Testing hardware video decoding..."
    
    # Check for GStreamer MPP plugins
    if gst-inspect-1.0 mppvideodec >/dev/null 2>&1; then
        add_result "PASS" "Video Decode" "GStreamer MPP plugin available"
        
        # Test with a simple pipeline (if test video available)
        if command -v gst-launch-1.0 >/dev/null 2>&1; then
            # Create a test pattern and try to decode it
            local test_result
            if test_result=$(timeout 10 gst-launch-1.0 videotestsrc num-buffers=30 ! video/x-raw,width=640,height=480 ! mppvideoenc ! mppvideodec ! fakesink 2>&1); then
                if echo "$test_result" | grep -q "Setting pipeline to NULL"; then
                    add_result "PASS" "Video Decode" "Hardware encoding/decoding test successful"
                else
                    add_result "WARN" "Video Decode" "Hardware test completed with warnings"
                fi
            else
                add_result "WARN" "Video Decode" "Hardware test failed or timed out"
            fi
        fi
    else
        add_result "FAIL" "Video Decode" "GStreamer MPP plugin not available"
    fi
}

# Validate NPU functionality
validate_npu() {
    if [[ "$IS_RK3588" != true && "$IS_RK3588S" != true ]]; then
        return 0
    fi
    
    log "Validating NPU functionality..."
    
    # Check NPU device
    if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
        add_result "PASS" "NPU" "NPU device detected"
        
        # Check NPU governor
        local npu_governor=$(cat /sys/class/devfreq/fdab0000.npu/governor 2>/dev/null || echo "unknown")
        add_result "INFO" "NPU" "Governor: $npu_governor"
        
        # Check NPU frequency
        local npu_freq=$(cat /sys/class/devfreq/fdab0000.npu/cur_freq 2>/dev/null || echo "0")
        local npu_freq_mhz=$((npu_freq / 1000000))
        add_result "INFO" "NPU" "Current frequency: ${npu_freq_mhz}MHz"
        
        # Check for NPU runtime libraries
        if [[ -d /usr/lib/aarch64-linux-gnu/rknn ]]; then
            add_result "PASS" "NPU" "RKNN runtime libraries found"
        else
            add_result "WARN" "NPU" "RKNN runtime libraries not found"
        fi
        
    else
        add_result "FAIL" "NPU" "NPU device not detected"
    fi
}

# Validate thermal management
validate_thermal_management() {
    log "Validating thermal management..."
    
    # Check thermal zones
    local thermal_zones=($(ls /sys/class/thermal/thermal_zone*/temp 2>/dev/null || true))
    
    if [[ ${#thermal_zones[@]} -gt 0 ]]; then
        add_result "PASS" "Thermal" "${#thermal_zones[@]} thermal zones detected"
        
        # Check temperatures
        for zone in "${thermal_zones[@]}"; do
            local zone_name=$(basename "$(dirname "$zone")")
            local temp_millicelsius=$(cat "$zone" 2>/dev/null || echo "0")
            local temp_celsius=$((temp_millicelsius / 1000))
            
            if [[ $temp_celsius -gt 0 && $temp_celsius -lt 100 ]]; then
                add_result "INFO" "Thermal" "$zone_name: ${temp_celsius}°C"
            else
                add_result "WARN" "Thermal" "$zone_name: Invalid temperature reading"
            fi
        done
        
        # Check fan control if available
        if [[ -d /sys/class/pwm/pwmchip0 ]]; then
            add_result "PASS" "Fan Control" "PWM fan control available"
            
            # Check if fan control service is running
            if systemctl is-active rk3588-fan-control.service >/dev/null 2>&1; then
                add_result "PASS" "Fan Control" "Fan control service is running"
            else
                add_result "WARN" "Fan Control" "Fan control service not running"
            fi
        else
            add_result "WARN" "Fan Control" "PWM fan control not available"
        fi
    else
        add_result "FAIL" "Thermal" "No thermal zones detected"
    fi
}

# Validate storage performance
validate_storage_performance() {
    log "Validating storage performance..."
    
    # Check for NVMe devices
    local nvme_devices=($(ls /dev/nvme*n1 2>/dev/null || true))
    for nvme in "${nvme_devices[@]}"; do
        if [[ -b "$nvme" ]]; then
            add_result "PASS" "Storage" "NVMe device detected: $(basename "$nvme")"
            
            # Check NVMe temperature
            if command -v smartctl >/dev/null 2>&1; then
                local nvme_temp=$(smartctl -A "$nvme" 2>/dev/null | grep -i temperature | awk '{print $10}' | head -1 || echo "N/A")
                add_result "INFO" "Storage" "$(basename "$nvme") temperature: ${nvme_temp}°C"
            fi
        fi
    done
    
    # Check eMMC
    local emmc_devices=($(ls /dev/mmcblk* 2>/dev/null | grep -v "p[0-9]" || true))
    for emmc in "${emmc_devices[@]}"; do
        if [[ -b "$emmc" ]]; then
            add_result "PASS" "Storage" "eMMC device detected: $(basename "$emmc")"
        fi
    done
    
    # Test I/O scheduler settings
    for device in /sys/block/*/queue/scheduler; do
        if [[ -r "$device" ]]; then
            local block_device=$(echo "$device" | cut -d'/' -f4)
            local scheduler=$(cat "$device" | grep -o '\[.*\]' | tr -d '[]')
            add_result "INFO" "Storage" "$block_device I/O scheduler: $scheduler"
        fi
    done
}

# Print validation summary
print_summary() {
    echo
    echo "=================================="
    echo "Hardware Validation Summary"
    echo "=================================="
    
    local pass_count=0
    local fail_count=0
    local warn_count=0
    local info_count=0
    
    for result in "${VALIDATION_RESULTS[@]}"; do
        IFS='|' read -r status component message <<< "$result"
        case "$status" in
            "PASS") ((pass_count++)) ;;
            "FAIL") ((fail_count++)) ;;
            "WARN") ((warn_count++)) ;;
            "INFO") ((info_count++)) ;;
        esac
    done
    
    echo "Results: $pass_count passed, $fail_count failed, $warn_count warnings, $info_count info"
    echo
    
    if [[ $fail_count -eq 0 ]]; then
        success "All critical hardware validation tests passed!"
        return 0
    else
        error "$fail_count critical issues found"
        return 1
    fi
}

# Main validation function
main() {
    log "Starting FriendlyElec hardware validation..."
    
    # Detect hardware
    detect_friendlyelec_hardware
    
    if [[ "$IS_FRIENDLYELEC" != true ]]; then
        log "Not running on FriendlyElec hardware, skipping hardware-specific validation"
        return 0
    fi
    
    log "Validating $FRIENDLYELEC_MODEL hardware..."
    
    # Run validation tests
    validate_gpu
    validate_vpu
    validate_npu
    validate_thermal_management
    validate_storage_performance
    
    # Print summary
    print_summary
}

# Run main function
main "$@"
