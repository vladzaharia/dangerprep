#!/bin/bash
# DangerPrep Gum Utility Functions
# Enhanced user interaction functions with gum integration and graceful fallbacks
# Maintains 100% backward compatibility when gum is unavailable

# Determine script directory for gum binary location
GUM_UTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUM_PROJECT_ROOT="$(cd "${GUM_UTILS_DIR}/../.." && pwd)"
GUM_LIB_DIR="${GUM_PROJECT_ROOT}/lib/gum"

# Global gum availability flag (cached after first check)
GUM_AVAILABLE=""

# Check if gum is available (system-installed or from lib directory)
gum_available() {
    # Return cached result if already checked
    if [[ -n "${GUM_AVAILABLE}" ]]; then
        [[ "${GUM_AVAILABLE}" == "true" ]]
        return $?
    fi

    # Check system-installed gum first
    if command -v gum >/dev/null 2>&1; then
        GUM_AVAILABLE="true"
        return 0
    fi

    # Check lib directory for platform-specific binary
    local platform
    case "$(uname -s)" in
        Linux*)  platform="linux" ;;
        Darwin*) platform="darwin" ;;
        *)       platform="unknown" ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)   platform="${platform}-x86_64" ;;
        aarch64|arm64)  platform="${platform}-aarch64" ;;
        armv7l)         platform="${platform}-armv7" ;;
        arm*)           platform="${platform}-arm" ;;
        *)              platform="unknown" ;;
    esac

    local gum_binary="${GUM_LIB_DIR}/gum-${platform}"
    if [[ -x "${gum_binary}" ]]; then
        # Create symlink for easy access
        if [[ ! -L "${GUM_LIB_DIR}/gum" ]] || [[ ! -e "${GUM_LIB_DIR}/gum" ]]; then
            ln -sf "gum-${platform}" "${GUM_LIB_DIR}/gum" 2>/dev/null || true
        fi
        GUM_AVAILABLE="true"
        return 0
    fi

    GUM_AVAILABLE="false"
    return 1
}

# Get gum command (system or lib directory)
get_gum_cmd() {
    if command -v gum >/dev/null 2>&1; then
        echo "gum"
    elif [[ -x "${GUM_LIB_DIR}/gum" ]]; then
        echo "${GUM_LIB_DIR}/gum"
    else
        return 1
    fi
}

# Enhanced input function with gum integration
# Usage: enhanced_input "prompt" ["default_value"] ["placeholder"]
enhanced_input() {
    local prompt="$1"
    local default="${2:-}"
    local placeholder="${3:-}"
    local result

    if gum_available; then
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        local gum_args=()
        
        [[ -n "${default}" ]] && gum_args+=(--value "${default}")
        [[ -n "${placeholder}" ]] && gum_args+=(--placeholder "${placeholder}")
        
        result=$("${gum_cmd}" input --prompt "${prompt} " "${gum_args[@]}" 2>/dev/null)
        local exit_code=$?
        
        if [[ ${exit_code} -eq 0 ]]; then
            echo "${result}"
            return 0
        fi
    fi

    # Fallback to traditional read
    if [[ -n "${default}" ]]; then
        read -r -p "${prompt} [${default}]: " result
        echo "${result:-${default}}"
    else
        read -r -p "${prompt}: " result
        echo "${result}"
    fi
}

# Enhanced confirmation function with gum integration
# Usage: enhanced_confirm "question" [default_yes]
enhanced_confirm() {
    local question="$1"
    local default_yes="${2:-false}"

    if gum_available; then
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        local gum_args=()
        
        if [[ "${default_yes}" == "true" ]]; then
            gum_args+=(--default=true)
        else
            gum_args+=(--default=false)
        fi
        
        if "${gum_cmd}" confirm "${question}" "${gum_args[@]}" 2>/dev/null; then
            return 0
        else
            return 1
        fi
    fi

    # Fallback to traditional read
    local reply
    local prompt_suffix
    if [[ "${default_yes}" == "true" ]]; then
        prompt_suffix=" [Y/n]: "
    else
        prompt_suffix=" [y/N]: "
    fi
    
    read -r -p "${question}${prompt_suffix}" reply
    
    if [[ "${default_yes}" == "true" ]]; then
        [[ -z "${reply}" || "${reply}" =~ ^[Yy] ]]
    else
        [[ "${reply}" =~ ^[Yy] ]]
    fi
}

# Enhanced choice function with gum integration
# Usage: enhanced_choose "prompt" option1 option2 option3...
# Returns: selected option
enhanced_choose() {
    local prompt="$1"
    shift
    local options=("$@")

    if gum_available && [[ ${#options[@]} -gt 0 ]]; then
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        
        local result
        result=$("${gum_cmd}" choose --header "${prompt}" "${options[@]}" 2>/dev/null)
        local exit_code=$?
        
        if [[ ${exit_code} -eq 0 && -n "${result}" ]]; then
            echo "${result}"
            return 0
        fi
    fi

    # Fallback to traditional menu
    echo "${prompt}"
    local i=1
    for option in "${options[@]}"; do
        echo "  ${i}) ${option}"
        ((i++))
    done
    
    local choice
    while true; do
        read -r -p "Select option (1-${#options[@]}): " choice
        if [[ "${choice}" =~ ^[0-9]+$ ]] && [[ ${choice} -ge 1 ]] && [[ ${choice} -le ${#options[@]} ]]; then
            echo "${options[$((choice-1))]}"
            return 0
        fi
        echo "Invalid choice. Please select 1-${#options[@]}."
    done
}

# Enhanced multi-choice function with gum integration
# Usage: enhanced_multi_choose "prompt" option1 option2 option3...
# Returns: space-separated selected options
enhanced_multi_choose() {
    local prompt="$1"
    shift
    local options=("$@")

    if gum_available && [[ ${#options[@]} -gt 0 ]]; then
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        
        local result
        result=$("${gum_cmd}" choose --no-limit --header "${prompt}" "${options[@]}" 2>/dev/null)
        local exit_code=$?
        
        if [[ ${exit_code} -eq 0 ]]; then
            echo "${result}"
            return 0
        fi
    fi

    # Fallback to traditional multi-select
    echo "${prompt}"
    echo "Enter numbers separated by spaces (e.g., 1 3 5):"
    
    local i=1
    for option in "${options[@]}"; do
        echo "  ${i}) ${option}"
        ((i++))
    done
    
    local choices
    local selected=()
    
    while true; do
        read -r -p "Select options (1-${#options[@]}): " -a choices
        selected=()
        local valid=true
        
        for choice in "${choices[@]}"; do
            if [[ "${choice}" =~ ^[0-9]+$ ]] && [[ ${choice} -ge 1 ]] && [[ ${choice} -le ${#options[@]} ]]; then
                selected+=("${options[$((choice-1))]}")
            else
                echo "Invalid choice: ${choice}. Please select from 1-${#options[@]}."
                valid=false
                break
            fi
        done
        
        if [[ "${valid}" == "true" ]]; then
            printf '%s\n' "${selected[@]}"
            return 0
        fi
    done
}

# Enhanced progress spinner function with gum integration
# Usage: enhanced_spin "message" command [args...]
enhanced_spin() {
    local message="$1"
    shift
    local command=("$@")

    if gum_available; then
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        
        "${gum_cmd}" spin --spinner dot --title "${message}" -- "${command[@]}" 2>/dev/null
        return $?
    fi

    # Fallback to simple execution with message
    echo "${message}..."
    "${command[@]}"
}

# Enhanced logging function with gum integration
# Usage: enhanced_log "level" "message"
enhanced_log() {
    local level="$1"
    local message="$2"

    if gum_available; then
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        
        case "${level}" in
            "error"|"ERROR")
                "${gum_cmd}" log --level error "${message}" 2>/dev/null || echo "ERROR: ${message}" >&2
                ;;
            "warn"|"WARN"|"warning"|"WARNING")
                "${gum_cmd}" log --level warn "${message}" 2>/dev/null || echo "WARNING: ${message}" >&2
                ;;
            "info"|"INFO")
                "${gum_cmd}" log --level info "${message}" 2>/dev/null || echo "INFO: ${message}"
                ;;
            "debug"|"DEBUG")
                "${gum_cmd}" log --level debug "${message}" 2>/dev/null || echo "DEBUG: ${message}"
                ;;
            *)
                "${gum_cmd}" log "${message}" 2>/dev/null || echo "${message}"
                ;;
        esac
        return 0
    fi

    # Fallback to traditional logging
    case "${level}" in
        "error"|"ERROR")
            echo "ERROR: ${message}" >&2
            ;;
        "warn"|"WARN"|"warning"|"WARNING")
            echo "WARNING: ${message}" >&2
            ;;
        *)
            echo "${message}"
            ;;
    esac
}

# Enhanced table display function with gum integration
# Usage: enhanced_table "header1,header2,header3" "row1col1,row1col2,row1col3" "row2col1,row2col2,row2col3"...
enhanced_table() {
    local headers="$1"
    shift
    local rows=("$@")

    if gum_available && [[ -n "${headers}" ]] && [[ ${#rows[@]} -gt 0 ]]; then
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        
        # Create temporary file for table data
        local temp_file
        temp_file=$(mktemp)
        
        echo "${headers}" > "${temp_file}"
        printf '%s\n' "${rows[@]}" >> "${temp_file}"
        
        "${gum_cmd}" table < "${temp_file}" 2>/dev/null
        local exit_code=$?
        rm -f "${temp_file}"
        
        if [[ ${exit_code} -eq 0 ]]; then
            return 0
        fi
    fi

    # Fallback to simple column display
    echo "${headers}"
    echo "${headers}" | sed 's/[^,]/-/g'
    printf '%s\n' "${rows[@]}"
}

# Enhanced pager function with gum integration
# Usage: enhanced_pager < input_file  OR  echo "content" | enhanced_pager
enhanced_pager() {
    if gum_available; then
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        
        "${gum_cmd}" pager 2>/dev/null
        return $?
    fi

    # Fallback to less or more
    if command -v less >/dev/null 2>&1; then
        less
    elif command -v more >/dev/null 2>&1; then
        more
    else
        cat
    fi
}

# Test function to verify gum integration
test_gum_utils() {
    echo "Testing DangerPrep Gum Utilities"
    echo "================================"
    echo
    
    if gum_available; then
        echo "✓ Gum is available"
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        echo "  Using: ${gum_cmd}"
    else
        echo "✗ Gum is not available, using fallbacks"
    fi
    echo
    
    echo "Testing enhanced_input:"
    local test_input
    test_input=$(enhanced_input "Enter test value" "default")
    echo "Result: ${test_input}"
    echo
    
    echo "Testing enhanced_confirm:"
    if enhanced_confirm "Test confirmation"; then
        echo "Result: Yes"
    else
        echo "Result: No"
    fi
    echo
    
    echo "Testing enhanced_choose:"
    local test_choice
    test_choice=$(enhanced_choose "Choose an option" "Option 1" "Option 2" "Option 3")
    echo "Result: ${test_choice}"
    echo
}

# Create directory with fallback to user home
# Usage: create_directory_with_fallback "primary_path" "fallback_subdir" ["description"]
create_directory_with_fallback() {
    local primary_path="$1"
    local fallback_subdir="$2"
    local description="${3:-directory}"
    local fallback_path="${HOME}/.local/dangerprep/${fallback_subdir}"

    # Try primary path first
    if mkdir -p "${primary_path}" 2>/dev/null; then
        echo "${primary_path}"
        return 0
    fi

    # Log the fallback
    if command -v log_warn >/dev/null 2>&1; then
        log_warn "Cannot create ${description} at ${primary_path}, using fallback: ${fallback_path}"
    else
        echo "WARNING: Cannot create ${description} at ${primary_path}, using fallback: ${fallback_path}" >&2
    fi

    # Create fallback directory
    if mkdir -p "${fallback_path}" 2>/dev/null; then
        echo "${fallback_path}"
        return 0
    else
        if command -v log_error >/dev/null 2>&1; then
            log_error "Failed to create ${description} at both ${primary_path} and ${fallback_path}"
        else
            echo "ERROR: Failed to create ${description} at both ${primary_path} and ${fallback_path}" >&2
        fi
        return 1
    fi
}

# Get appropriate log file path with fallback
# Usage: get_log_file_path "script_name"
get_log_file_path() {
    local script_name="$1"
    local primary_log="/var/log/dangerprep-${script_name}.log"
    local fallback_log="${HOME}/.local/dangerprep/logs/dangerprep-${script_name}.log"

    # Try to create/touch the primary log file
    if touch "${primary_log}" 2>/dev/null; then
        echo "${primary_log}"
        return 0
    fi

    # Create fallback log directory and file
    local log_dir
    log_dir="$(dirname "${fallback_log}")"
    if mkdir -p "${log_dir}" 2>/dev/null && touch "${fallback_log}" 2>/dev/null; then
        echo "${fallback_log}"
        return 0
    else
        # Last resort: use /tmp
        local temp_log="/tmp/dangerprep-${script_name}-$$.log"
        echo "${temp_log}"
        return 0
    fi
}

# Get appropriate backup directory path with fallback
# Usage: get_backup_dir_path "script_name"
get_backup_dir_path() {
    local script_name="$1"
    local timestamp="$(date +%Y%m%d-%H%M%S)"
    local primary_backup="/var/backups/dangerprep-${script_name}-${timestamp}"
    local fallback_backup="${HOME}/.local/dangerprep/backups/dangerprep-${script_name}-${timestamp}"

    # Try primary backup directory
    if mkdir -p "${primary_backup}" 2>/dev/null; then
        echo "${primary_backup}"
        return 0
    fi

    # Use fallback
    if mkdir -p "${fallback_backup}" 2>/dev/null; then
        echo "${fallback_backup}"
        return 0
    else
        # Last resort: use /tmp
        local temp_backup="/tmp/dangerprep-${script_name}-${timestamp}-$$"
        mkdir -p "${temp_backup}" 2>/dev/null || true
        echo "${temp_backup}"
        return 0
    fi
}

# If script is run directly, show test
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    test_gum_utils
fi
