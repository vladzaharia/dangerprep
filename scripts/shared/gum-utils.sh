#!/bin/bash
# DangerPrep Gum Utility Functions
# Enhanced user interaction functions with gum integration
# Gum is guaranteed to be available (system-installed or from lib directory)

# Determine script directory for gum binary location
GUM_UTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUM_PROJECT_ROOT="$(cd "${GUM_UTILS_DIR}/../.." && pwd)"
GUM_LIB_DIR="${GUM_PROJECT_ROOT}/lib/gum"

# Get gum command (system or lib directory)
get_gum_cmd() {
    if command -v gum >/dev/null 2>&1; then
        echo "gum"
    else
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
            echo "${GUM_LIB_DIR}/gum"
        else
            echo "gum"  # Fallback to system command
        fi
    fi
}

# Enhanced input function with gum integration
# Usage: enhanced_input "prompt" ["default_value"] ["placeholder"]
enhanced_input() {
    local prompt="$1"
    local default="${2:-}"
    local placeholder="${3:-}"
    local gum_cmd
    gum_cmd=$(get_gum_cmd)
    local gum_args=()

    [[ -n "${default}" ]] && gum_args+=(--value "${default}")
    [[ -n "${placeholder}" ]] && gum_args+=(--placeholder "${placeholder}")

    # Handle empty array properly
    if [[ ${#gum_args[@]} -gt 0 ]]; then
        "${gum_cmd}" input --prompt "${prompt} " "${gum_args[@]}"
    else
        "${gum_cmd}" input --prompt "${prompt} "
    fi
}

# Enhanced confirmation function with gum integration
# Usage: enhanced_confirm "question" [default_yes]
enhanced_confirm() {
    local question="$1"
    local default_yes="${2:-false}"
    local gum_cmd
    gum_cmd=$(get_gum_cmd)
    local gum_args=()

    if [[ "${default_yes}" == "true" ]]; then
        gum_args+=(--default=true)
    else
        gum_args+=(--default=false)
    fi

    # Handle array expansion properly
    if [[ ${#gum_args[@]} -gt 0 ]]; then
        "${gum_cmd}" confirm "${question}" "${gum_args[@]}"
    else
        "${gum_cmd}" confirm "${question}"
    fi
}

# Enhanced choice function with gum integration
# Usage: enhanced_choose "prompt" option1 option2 option3...
# Returns: selected option
enhanced_choose() {
    local prompt="$1"
    shift
    local options=("$@")
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    "${gum_cmd}" choose --header "${prompt}" "${options[@]}"
}

# Enhanced multi-choice function with gum integration
# Usage: enhanced_multi_choose "prompt" option1 option2 option3...
# Returns: space-separated selected options
enhanced_multi_choose() {
    local prompt="$1"
    shift
    local options=("$@")
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    "${gum_cmd}" choose --no-limit --header "${prompt}" "${options[@]}"
}

# Enhanced progress spinner function with gum integration
# Usage: enhanced_spin "message" command [args...]
enhanced_spin() {
    local message="$1"
    shift
    local command=("$@")
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    "${gum_cmd}" spin --spinner dot --title "${message}" -- "${command[@]}"
}

# Enhanced logging functions with gum integration and file logging
# These functions replace the custom logging in setup scripts

# Enhanced logging function with gum integration
# Usage: enhanced_log "level" "message" [key=value pairs...]
enhanced_log() {
    local level="$1"
    local message="$2"
    shift 2
    local structured_args=("$@")
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    case "${level}" in
        "error"|"ERROR")
            if [[ ${#structured_args[@]} -gt 0 ]]; then
                "${gum_cmd}" log --structured --level error --time rfc3339 "${message}" "${structured_args[@]}"
            else
                "${gum_cmd}" log --level error --time rfc3339 "${message}"
            fi
            ;;
        "warn"|"WARN"|"warning"|"WARNING")
            if [[ ${#structured_args[@]} -gt 0 ]]; then
                "${gum_cmd}" log --structured --level warn --time rfc3339 "${message}" "${structured_args[@]}"
            else
                "${gum_cmd}" log --level warn --time rfc3339 "${message}"
            fi
            ;;
        "info"|"INFO")
            if [[ ${#structured_args[@]} -gt 0 ]]; then
                "${gum_cmd}" log --structured --level info --time rfc3339 "${message}" "${structured_args[@]}"
            else
                "${gum_cmd}" log --level info --time rfc3339 "${message}"
            fi
            ;;
        "debug"|"DEBUG")
            [[ "${DEBUG:-}" != "true" ]] && return 0
            if [[ ${#structured_args[@]} -gt 0 ]]; then
                "${gum_cmd}" log --structured --level debug --time rfc3339 "${message}" "${structured_args[@]}"
            else
                "${gum_cmd}" log --level debug --time rfc3339 "${message}"
            fi
            ;;
        "success"|"SUCCESS")
            if [[ ${#structured_args[@]} -gt 0 ]]; then
                "${gum_cmd}" log --structured --level info --time rfc3339 "SUCCESS: ${message}" "${structured_args[@]}"
            else
                "${gum_cmd}" log --level info --time rfc3339 "SUCCESS: ${message}"
            fi
            ;;
        *)
            "${gum_cmd}" log --time rfc3339 "${message}"
            ;;
    esac

    # Always log to file if LOG_FILE is set
    if [[ -n "${LOG_FILE:-}" ]]; then
        local file_timestamp
        file_timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
        local file_level
        file_level="$(echo "${level}" | tr '[:lower:]' '[:upper:]')"
        echo "[${file_timestamp}] [${file_level}] ${message}" >> "${LOG_FILE}" 2>/dev/null || true
    fi
}

# Modern logging functions - use these consistently across all scripts

log_debug() {
    enhanced_log "debug" "$@"
}

log_info() {
    enhanced_log "info" "$@"
}

log_warn() {
    enhanced_log "warn" "$@"
}

log_error() {
    enhanced_log "error" "$@"
}

log_success() {
    enhanced_log "success" "$@"
}

# Enhanced file selection with gum integration
# Usage: enhanced_file_select [starting_directory]
enhanced_file_select() {
    local start_dir="${1:-$(pwd)}"
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    "${gum_cmd}" file "${start_dir}"
}

# Enhanced write/multiline input with gum integration
# Usage: enhanced_write "prompt" [placeholder]
enhanced_write() {
    local prompt="$1"
    local placeholder="${2:-}"
    local gum_cmd
    gum_cmd=$(get_gum_cmd)
    local gum_args=()

    [[ -n "${placeholder}" ]] && gum_args+=(--placeholder "${placeholder}")

    echo "${prompt}"
    if [[ ${#gum_args[@]} -gt 0 ]]; then
        "${gum_cmd}" write "${gum_args[@]}"
    else
        "${gum_cmd}" write
    fi
}

# Enhanced style function with gum integration
# Usage: enhanced_style "text" [style_options...]
enhanced_style() {
    local text="$1"
    shift
    local style_args=("$@")
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    "${gum_cmd}" style "${style_args[@]}" "${text}"
}

# Enhanced join function with gum integration
# Usage: enhanced_join [--vertical] text1 text2 text3...
enhanced_join() {
    local vertical=false
    if [[ "$1" == "--vertical" ]]; then
        vertical=true
        shift
    fi

    local texts=("$@")
    local gum_cmd
    gum_cmd=$(get_gum_cmd)
    local gum_args=()

    [[ "${vertical}" == "true" ]] && gum_args+=(--vertical)

    if [[ ${#gum_args[@]} -gt 0 ]]; then
        "${gum_cmd}" join "${gum_args[@]}" "${texts[@]}"
    else
        "${gum_cmd}" join "${texts[@]}"
    fi
}

# Enhanced table display function with gum integration
# Usage: enhanced_table "header1,header2,header3" "row1col1,row1col2,row1col3" "row2col1,row2col2,row2col3"...
enhanced_table() {
    local headers="$1"
    shift
    local rows=("$@")
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    # Create temporary file for table data
    local temp_file
    temp_file=$(mktemp)

    # Write headers and rows to temp file
    echo "${headers}" > "${temp_file}"
    printf '%s\n' "${rows[@]}" >> "${temp_file}"

    # Use gum table with static print (non-interactive)
    "${gum_cmd}" table --separator="," --print < "${temp_file}"
    local exit_code=$?
    rm -f "${temp_file}"

    return "${exit_code}"
}

# Enhanced pager function with gum integration
# Usage: enhanced_pager < input_file  OR  echo "content" | enhanced_pager
enhanced_pager() {
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    "${gum_cmd}" pager
}

# Enhanced progress bar function with gum integration
# Usage: enhanced_progress_bar current total "description"
enhanced_progress_bar() {
    local current="$1"
    local total="$2"
    local description="${3:-Processing}"
    local percentage=$((current * 100 / total))
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    # Use gum style to create a progress bar
    local bar_width=40
    local filled_width=$((percentage * bar_width / 100))
    local empty_width=$((bar_width - filled_width))

    local filled_bar=""
    local empty_bar=""

    # Create filled portion
    if [[ ${filled_width} -gt 0 ]]; then
        filled_bar=$(printf "%*s" "${filled_width}" "" | tr ' ' '█')
    fi

    # Create empty portion
    if [[ ${empty_width} -gt 0 ]]; then
        empty_bar=$(printf "%*s" "${empty_width}" "" | tr ' ' '░')
    fi

    local progress_text="[${filled_bar}${empty_bar}] ${percentage}% (${current}/${total})"

    "${gum_cmd}" style --foreground 212 --bold "${description}"
    "${gum_cmd}" style --foreground 86 "${progress_text}"
}

# Enhanced card function with gum integration
# Usage: enhanced_card "title" "content" [border_color] [title_color]
enhanced_card() {
    local title="$1"
    local content="$2"
    local border_color="${3:-212}"  # Default: bright magenta
    local title_color="${4:-86}"    # Default: bright cyan
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    # Create styled title
    local styled_title
    styled_title=$("${gum_cmd}" style --foreground "${title_color}" --bold "${title}")

    # Create card content with title
    local card_content="${styled_title}"$'\n'"${content}"

    # Style the entire card with border
    "${gum_cmd}" style \
        --border normal \
        --border-foreground "${border_color}" \
        --padding "1 2" \
        --margin "1 0" \
        "${card_content}"
}

# Enhanced status indicator function with gum integration
# Usage: enhanced_status_indicator "success|failure|warning|info" "message"
enhanced_status_indicator() {
    local status="$1"
    local message="$2"
    local symbol=""
    local color=""

    case "${status}" in
        "success"|"ok"|"pass"|"✓")
            symbol="✓"
            color="46"  # Green
            ;;
        "failure"|"error"|"fail"|"✗")
            symbol="✗"
            color="196" # Red
            ;;
        "warning"|"warn"|"⚠")
            symbol="⚠"
            color="226" # Yellow
            ;;
        "info"|"ℹ")
            symbol="ℹ"
            color="39"  # Blue
            ;;
        "pending"|"…")
            symbol="…"
            color="244" # Gray
            ;;
        *)
            symbol="${status}"
            color="15"  # White
            ;;
    esac

    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    # Style the symbol with color
    local styled_symbol
    styled_symbol=$("${gum_cmd}" style --foreground "${color}" --bold "${symbol}")

    # Combine symbol and message
    echo "${styled_symbol} ${message}"
}

# Enhanced warning box function with gum integration
# Usage: enhanced_warning_box "title" "message" [warning_level]
# warning_level: "danger" (red), "warning" (yellow), "info" (blue), default: "warning"
enhanced_warning_box() {
    local title="$1"
    local message="$2"
    local warning_level="${3:-warning}"
    local border_color=""
    local title_color=""
    local symbol=""

    case "${warning_level}" in
        "danger"|"error")
            border_color="196"  # Red
            title_color="196"   # Red
            symbol="🚨"
            ;;
        "warning"|"warn")
            border_color="226"  # Yellow
            title_color="226"   # Yellow
            symbol="⚠️"
            ;;
        "info")
            border_color="39"   # Blue
            title_color="39"    # Blue
            symbol="ℹ️"
            ;;
        *)
            border_color="226"  # Default to yellow
            title_color="226"
            symbol="⚠️"
            ;;
    esac

    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    # Create styled title with symbol
    local styled_title
    styled_title=$("${gum_cmd}" style --foreground "${title_color}" --bold "${symbol} ${title}")

    # Process message to convert \n to actual newlines
    local processed_message
    processed_message=$(echo -e "${message}")

    # Create warning content with title and processed message
    local warning_content="${styled_title}"$'\n\n'"${processed_message}"

    # Style the entire warning box with prominent border
    "${gum_cmd}" style \
        --border thick \
        --border-foreground "${border_color}" \
        --padding "2 3" \
        --margin "1 0" \
        --width 80 \
        "${warning_content}"
}

# Enhanced section function with gum integration
# Usage: enhanced_section "title" "content" [emoji] [title_color]
enhanced_section() {
    local title="$1"
    local content="$2"
    local emoji="${3:-📋}"
    local title_color="${4:-39}"  # Default: blue
    local gum_cmd
    gum_cmd=$(get_gum_cmd)

    # Create styled section header
    local section_header
    section_header=$("${gum_cmd}" style \
        --foreground "${title_color}" \
        --bold \
        --margin "1 0 0 0" \
        "${emoji} ${title}")

    # Create section separator
    local separator
    separator=$("${gum_cmd}" style \
        --foreground 244 \
        "$(printf "%*s" 60 "" | tr ' ' '─')")

    # Display section
    echo "${section_header}"
    echo "${separator}"
    echo "${content}"
    echo
}

# Test function to verify gum integration
test_gum_utils() {
    echo "Testing DangerPrep Gum Utilities"
    echo "================================"
    echo

    echo "✓ Gum is available"
    local gum_cmd
    gum_cmd=$(get_gum_cmd)
    echo "  Using: ${gum_cmd}"
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
    local timestamp
    timestamp="$(date +%Y%m%d-%H%M%S)"
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
