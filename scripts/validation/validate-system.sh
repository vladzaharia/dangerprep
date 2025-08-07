#!/bin/bash
# DangerPrep System Validation Script
# Unified validation for compose files, references, docker dependencies, and NFS mounts

set -e

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DOCKER_ROOT="$PROJECT_ROOT/docker"
ISSUES_FOUND=0

# Set default environment variables for testing
export INSTALL_ROOT="${DANGERPREP_INSTALL_ROOT:-/opt/dangerprep}"
export TZ="America/Los_Angeles"
export TRAEFIK_AUTH_USERS="admin:\$2y\$10\$example-hash"
export CF_API_EMAIL="test@example.com"
export CF_API_KEY="test-api-key"
export ACME_EMAIL="test@example.com"
export PLEX_TOKEN="test-plex-token"
export NAS_HOST="100.65.182.27"
export PLEX_SERVER="100.65.182.27:32400"

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

# Show help
show_help() {
    echo "DangerPrep System Validation Script"
    echo "Usage: $0 [COMMAND]"
    echo
    echo "Commands:"
    echo "  compose      Validate Docker Compose files"
    echo "  references   Validate file references"
    echo "  docker       Validate Docker dependencies"
    echo "  nfs          Test NFS mounts"
    echo "  friendlyelec Validate FriendlyElec hardware features"
    echo "  all          Run all validations (default)"
    echo "  help         Show this help message"
    echo
    echo "Examples:"
    echo "  $0 compose    # Validate only compose files"
    echo "  $0 all        # Run all validations"
}

# Validate Docker Compose files
validate_compose() {
    log "Validating Docker Compose files..."
    
    local compose_files=($(find "$DOCKER_ROOT" -name "compose.yml" -type f | sort))
    
    if [[ ${#compose_files[@]} -eq 0 ]]; then
        warning "No compose.yml files found in $DOCKER_ROOT"
        return 0
    fi
    
    for compose_file in "${compose_files[@]}"; do
        local service_name=$(basename "$(dirname "$compose_file")")
        log "Validating $service_name..."
        
        # Check syntax
        if docker compose -f "$compose_file" config >/dev/null 2>&1; then
            success "  Syntax valid"
        else
            error "  Syntax invalid"
            ((ISSUES_FOUND++))
        fi
        
        # Check for missing environment variables
        local missing_vars=$(docker compose -f "$compose_file" config 2>&1 | grep -o 'variable.*is not set' | wc -l)
        if [[ $missing_vars -gt 0 ]]; then
            warning "  $missing_vars missing environment variables"
            ((ISSUES_FOUND++))
        fi
    done
    
    success "Compose validation complete"
}

# Validate file references
validate_references() {
    log "Validating file references..."
    
    # Check justfile references
    if [[ -f "$PROJECT_ROOT/justfile" ]]; then
        log "Checking justfile references..."
        while IFS= read -r line; do
            if [[ "$line" =~ \./scripts/([^[:space:]]+) ]]; then
                local script_path="$PROJECT_ROOT/scripts/${BASH_REMATCH[1]}"
                if [[ ! -f "$script_path" ]]; then
                    error "  Missing script: $script_path"
                    ((ISSUES_FOUND++))
                fi
            fi
        done < "$PROJECT_ROOT/justfile"
    fi
    
    # Check compose file references
    local compose_files=($(find "$DOCKER_ROOT" -name "compose.yml" -type f))
    for compose_file in "${compose_files[@]}"; do
        local dir=$(dirname "$compose_file")
        
        # Check for referenced env files
        if grep -q "env_file:" "$compose_file"; then
            local env_files=($(grep -A 5 "env_file:" "$compose_file" | grep -E "^\s*-" | sed 's/^\s*-\s*//' | tr -d '"'))
            for env_file in "${env_files[@]}"; do
                local full_path="$dir/$env_file"
                if [[ ! -f "$full_path" ]]; then
                    error "  Missing env file: $full_path"
                    ((ISSUES_FOUND++))
                fi
            done
        fi
    done
    
    success "Reference validation complete"
}

# Validate Docker dependencies
validate_docker() {
    log "Validating Docker dependencies..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running"
        ((ISSUES_FOUND++))
        return 1
    fi
    
    # Check Docker networks
    local compose_files=($(find "$DOCKER_ROOT" -name "compose.yml" -type f))
    for compose_file in "${compose_files[@]}"; do
        if grep -q "external: true" "$compose_file"; then
            local networks=($(grep -B 2 "external: true" "$compose_file" | grep -E "^\s*[a-zA-Z]" | sed 's/://' | tr -d ' '))
            for network in "${networks[@]}"; do
                if ! docker network ls | grep -q "$network"; then
                    error "  Missing Docker network: $network"
                    ((ISSUES_FOUND++))
                fi
            done
        fi
    done
    
    success "Docker validation complete"
}

# Test NFS mounts
validate_nfs() {
    log "Testing NFS connectivity..."
    
    # Check if NFS host is reachable
    if ! ping -c 1 -W 2 "$NAS_HOST" >/dev/null 2>&1; then
        warning "NAS host $NAS_HOST is not reachable"
        return 0
    fi
    
    # Test NFS mount points
    local nfs_mounts=("/mnt/nas/media" "/mnt/nas/backups")
    for mount_point in "${nfs_mounts[@]}"; do
        if [[ -d "$mount_point" ]]; then
            if mountpoint -q "$mount_point"; then
                success "  $mount_point is mounted"
            else
                warning "  $mount_point exists but is not mounted"
            fi
        else
            warning "  $mount_point directory does not exist"
        fi
    done
    
    success "NFS validation complete"
}

# Validate FriendlyElec hardware features
validate_friendlyelec() {
    if [[ "$IS_FRIENDLYELEC" != true ]]; then
        log "Not running on FriendlyElec hardware, skipping hardware validation"
        return 0
    fi

    log "Validating FriendlyElec hardware features ($FRIENDLYELEC_MODEL)..."

    # Validate platform detection
    validate_platform_detection

    # Validate hardware acceleration
    validate_hardware_acceleration

    # Validate performance optimizations
    validate_performance_optimizations

    # Validate configuration files
    validate_friendlyelec_configs

    success "FriendlyElec validation complete"
}

# Validate platform detection
validate_platform_detection() {
    log "Validating platform detection..."

    # Check device tree model
    if [[ -f /proc/device-tree/model ]]; then
        local model=$(cat /proc/device-tree/model | tr -d '\0')
        success "  Platform detected: $model"
    else
        error "  Device tree model not found"
        ((ISSUES_FOUND++))
    fi

    # Validate model detection
    if [[ -n "$FRIENDLYELEC_MODEL" ]]; then
        success "  FriendlyElec model: $FRIENDLYELEC_MODEL"
    else
        error "  FriendlyElec model not detected"
        ((ISSUES_FOUND++))
    fi

    # Validate SoC detection
    if [[ "$IS_RK3588" == true || "$IS_RK3588S" == true ]]; then
        local soc_type="RK3588"
        [[ "$IS_RK3588S" == true ]] && soc_type="RK3588S"
        success "  SoC type: $soc_type"
    else
        warning "  SoC type not detected or not RK3588/RK3588S"
    fi
}

# Validate hardware acceleration
validate_hardware_acceleration() {
    log "Validating hardware acceleration..."

    # Check GPU
    if [[ -d /sys/class/devfreq/fb000000.gpu ]]; then
        success "  Mali GPU detected"

        # Check GPU governor
        local gpu_governor=$(cat /sys/class/devfreq/fb000000.gpu/governor 2>/dev/null || echo "unknown")
        log "    GPU governor: $gpu_governor"
    else
        warning "  Mali GPU not detected"
    fi

    # Check VPU
    if [[ -c /dev/mpp_service ]]; then
        success "  VPU (MPP) device available"

        # Check VPU permissions
        local vpu_perms=$(ls -l /dev/mpp_service 2>/dev/null | awk '{print $1,$3,$4}')
        log "    VPU permissions: $vpu_perms"
    else
        warning "  VPU device not available"
    fi

    # Check NPU
    if [[ -d /sys/class/devfreq/fdab0000.npu ]]; then
        success "  NPU detected"

        # Check NPU governor
        local npu_governor=$(cat /sys/class/devfreq/fdab0000.npu/governor 2>/dev/null || echo "unknown")
        log "    NPU governor: $npu_governor"
    else
        warning "  NPU not detected"
    fi

    # Check DRM devices
    local drm_count=$(ls /dev/dri/ 2>/dev/null | wc -l)
    if [[ $drm_count -gt 0 ]]; then
        success "  DRM devices: $drm_count available"
    else
        warning "  No DRM devices found"
    fi
}

# Validate performance optimizations
validate_performance_optimizations() {
    log "Validating performance optimizations..."

    # Check CPU governors
    local cpu_policies=($(ls /sys/devices/system/cpu/cpufreq/policy* 2>/dev/null | head -3))
    for policy in "${cpu_policies[@]}"; do
        if [[ -r "$policy/scaling_governor" ]]; then
            local governor=$(cat "$policy/scaling_governor")
            local policy_name=$(basename "$policy")
            log "    $policy_name governor: $governor"

            if [[ "$governor" == "performance" ]]; then
                success "    $policy_name optimized for performance"
            else
                warning "    $policy_name not set to performance governor"
            fi
        fi
    done

    # Check sysctl optimizations
    if [[ -f /etc/sysctl.d/99-rk3588-optimizations.conf ]]; then
        success "  RK3588 sysctl optimizations loaded"
    else
        warning "  RK3588 sysctl optimizations not found"
    fi

    # Check udev rules
    if [[ -f /etc/udev/rules.d/99-rk3588-hardware.rules ]]; then
        success "  RK3588 udev rules loaded"
    else
        warning "  RK3588 udev rules not found"
    fi
}

# Validate FriendlyElec configuration files
validate_friendlyelec_configs() {
    log "Validating FriendlyElec configuration files..."

    local config_files=(
        "/etc/sensors.d/rk3588.conf"
        "/etc/environment.d/mali-gpu.conf"
        "/etc/gstreamer-1.0/rk3588-hardware.conf"
    )

    for config_file in "${config_files[@]}"; do
        if [[ -f "$config_file" ]]; then
            success "  Configuration found: $(basename "$config_file")"
        else
            warning "  Configuration missing: $(basename "$config_file")"
        fi
    done

    # Check systemd services
    local services=(
        "rk3588-cpu-governor.service"
    )

    for service in "${services[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            success "  Service enabled: $service"
        else
            warning "  Service not enabled: $service"
        fi
    done
}

# Run all validations
validate_all() {
    log "Running comprehensive system validation..."
    echo
    
    validate_compose
    echo
    
    validate_references
    echo
    
    validate_docker
    echo
    
    validate_nfs
    echo

    # FriendlyElec-specific validation
    if [[ "$IS_FRIENDLYELEC" == true ]]; then
        validate_friendlyelec
        echo
    fi

    echo "=================================="
    log "System Validation Summary:"
    
    if [[ $ISSUES_FOUND -eq 0 ]]; then
        success "All validations passed!"
        exit 0
    else
        error "Found $ISSUES_FOUND validation issues"
        exit 1
    fi
}

# Main function
main() {
    # Show banner for comprehensive validation
    if [[ "${1:-all}" == "all" ]]; then
        show_banner_with_title "System Validation" "validation"
        echo
    fi

    case "${1:-all}" in
        compose)
            validate_compose
            ;;
        references)
            validate_references
            ;;
        docker)
            validate_docker
            ;;
        nfs)
            validate_nfs
            ;;
        friendlyelec)
            validate_friendlyelec
            ;;
        all)
            validate_all
            ;;
        help|--help|-h)
            show_help
            exit 0
            ;;
        *)
            error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
