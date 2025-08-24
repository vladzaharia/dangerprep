#!/bin/bash
# DangerPrep Shared Banner Utility
# Provides colorful banner functions for all DangerPrep scripts

# Source gum utilities if available
BANNER_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$BANNER_SCRIPT_DIR/gum-utils.sh" ]]; then
    # shellcheck source=gum-utils.sh
    source "$BANNER_SCRIPT_DIR/gum-utils.sh"
fi

# Color codes for banner display
BANNER_NC='\033[0m'             # No color reset

# Embedded ASCII art data (replaces external banner.txt dependency)
# Banner elements
BANNER_TOP_BORDER=".·:'''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''':·."
BANNER_BOTTOM_BORDER="·:........................................................................:·"
BANNER_SIDE_BORDER=': :'
BANNER_EMPTY_LINE=': :                                                                        : :'

# ASCII art lines for the DangerPrep logo
declare -a BANNER_ASCII_LINES=(
    ': :     ______                                _______                      : :'
    ': :    |   _  \ .---.-.-----.-----.-----.----|   _   |----.-----.-----.    : :'
    ': :    |.  |   \|  _  |     |  _  |  -__|   _|.  1   |   _|  -__|  _  |    : :'
    ': :    |.  |    |___._|__|__|___  |_____|__| |.  ____|__| |_____|   __|    : :'
    ': :    |:  1    /           |_____|          |:  |              |__|       : :'
    ': :    |::.. . /                             |::.|                         : :'
    ': :    `------'"'"'                              `---'"'"'                         : :'
)

# Split position for two-color rendering (Danger vs Prep)
BANNER_SPLIT_POS=45

# Get colors for a specific scheme
get_scheme_colors() {
    local scheme="${1:-default}"

    case "$scheme" in
        "security")
            BANNER_BORDER='\033[1;31m'     # Red
            BANNER_PRIMARY='\033[1;33m'    # Yellow (Danger)
            BANNER_SECONDARY='\033[1;31m'  # Red (Prep)
            BANNER_TITLE='\033[1;33m'      # Yellow
            ;;
        "monitoring")
            BANNER_BORDER='\033[1;32m'     # Green
            BANNER_PRIMARY='\033[1;36m'    # Cyan (Danger)
            BANNER_SECONDARY='\033[1;32m'  # Green (Prep)
            BANNER_TITLE='\033[1;36m'      # Cyan
            ;;
        "network")
            BANNER_BORDER='\033[1;34m'     # Blue
            BANNER_PRIMARY='\033[1;36m'    # Cyan (Danger)
            BANNER_SECONDARY='\033[1;37m'  # White (Prep)
            BANNER_TITLE='\033[1;36m'      # Cyan
            ;;
        "backup")
            BANNER_BORDER='\033[1;35m'     # Purple
            BANNER_PRIMARY='\033[1;35m'    # Magenta (Danger)
            BANNER_SECONDARY='\033[1;34m'  # Blue (Prep)
            BANNER_TITLE='\033[1;35m'      # Magenta
            ;;
        "system")
            BANNER_BORDER='\033[0;37m'     # Gray
            BANNER_PRIMARY='\033[1;37m'    # White (Danger)
            BANNER_SECONDARY='\033[1;34m'  # Blue (Prep)
            BANNER_TITLE='\033[1;37m'      # White
            ;;
        "validation")
            BANNER_BORDER='\033[1;32m'     # Green
            BANNER_PRIMARY='\033[1;33m'    # Yellow (Danger)
            BANNER_SECONDARY='\033[1;32m'  # Green (Prep)
            BANNER_TITLE='\033[1;33m'      # Yellow
            ;;
        "docker")
            BANNER_BORDER='\033[1;34m'     # Blue
            BANNER_PRIMARY='\033[1;37m'    # White (Danger)
            BANNER_SECONDARY='\033[1;36m'  # Cyan (Prep)
            BANNER_TITLE='\033[1;37m'      # White
            ;;
        *)  # default
            BANNER_BORDER='\033[1;35m'     # Pink
            BANNER_PRIMARY='\033[1;36m'    # Aqua (Danger)
            BANNER_SECONDARY='\033[1;34m'  # Blue (Prep)
            BANNER_TITLE='\033[1;34m'      # Blue
            ;;
    esac
}

# Banner element rendering functions

# Render top border
render_top_border() {
    local use_color="${1:-true}"
    if [[ "$use_color" == "true" ]]; then
        echo -e "${BANNER_BORDER}${BANNER_TOP_BORDER}${BANNER_NC}"
    else
        echo "$BANNER_TOP_BORDER"
    fi
}

# Render bottom border
render_bottom_border() {
    local use_color="${1:-true}"
    if [[ "$use_color" == "true" ]]; then
        echo -e "${BANNER_BORDER}'${BANNER_BOTTOM_BORDER}'${BANNER_NC}"
    else
        echo "'$BANNER_BOTTOM_BORDER'"
    fi
}

# Render empty line with side borders
render_empty_line() {
    local use_color="${1:-true}"
    local side_color="${2:-$BANNER_SECONDARY}"
    if [[ "$use_color" == "true" ]]; then
        echo -e "${side_color}${BANNER_EMPTY_LINE}${BANNER_NC}"
    else
        echo "$BANNER_EMPTY_LINE"
    fi
}

# Get alternating side color based on line number
get_side_color() {
    local line_num="$1"
    if [[ $((line_num % 2)) -eq 1 ]]; then
        echo "$BANNER_PRIMARY"
    else
        echo "$BANNER_SECONDARY"
    fi
}

# Render ASCII art line with two-color support and alternating side borders
render_ascii_line() {
    local line="$1"
    local use_color="${2:-true}"
    local side_color="${3:-$BANNER_SECONDARY}"

    if [[ "$use_color" == "true" ]]; then
        # Split line at the original position 45 for two-color rendering
        local danger_part="${line:0:$BANNER_SPLIT_POS}"     # Danger part (positions 0-44)
        local prep_part="${line:$BANNER_SPLIT_POS}"         # Prep part (positions 45+)

        # Extract side borders from each part
        local left_border="${danger_part:0:4}"              # ": : " from danger part
        local danger_content="${danger_part:4}"             # Content from danger part (without left border)

        # Calculate prep content length (total prep part minus right border)
        local prep_part_len=${#prep_part}
        local prep_content_len=$((prep_part_len - 4))
        local prep_content="${prep_part:0:$prep_content_len}" # Content from prep part (without right border)
        local right_border="${prep_part: -4}"               # " : :" from prep part

        echo -e "${side_color}${left_border}${BANNER_PRIMARY}${danger_content}${BANNER_SECONDARY}${prep_content}${side_color}${right_border}${BANNER_NC}"
    else
        echo "$line"
    fi
}

# Render title line with proper centering and coloring
render_title_line() {
    local title="$1"
    local use_color="${2:-true}"
    local side_color="${3:-$BANNER_SECONDARY}"

    # Calculate proper centering and padding for title
    local content_width=72  # Width between ": :" markers
    local title_length=${#title}

    # Truncate title if too long
    if [[ $title_length -gt 66 ]]; then
        title="${title:0:63}..."
        title_length=${#title}
    fi

    local padding_total=$((content_width - title_length))
    local padding_left=$((padding_total / 2))
    local padding_right=$((padding_total - padding_left))

    # Build properly padded title line
    printf -v spaces_left "%*s" $padding_left ""
    printf -v spaces_right "%*s" $padding_right ""
    local title_content="${spaces_left}${title}${spaces_right}"

    if [[ "$use_color" == "true" ]]; then
        echo -e "${side_color}: :${BANNER_TITLE}${title_content}${side_color}: :${BANNER_NC}"
    else
        echo ": :${title_content}: :"
    fi
}



# Show banner without title (for utility scripts)
show_banner() {
    local scheme="${1:-default}"
    local use_color="${2:-true}"

    # Set colors for the scheme
    get_scheme_colors "$scheme"

    # Render banner elements dynamically with alternating side colors
    local line_num=1
    render_top_border "$use_color"

    line_num=$((line_num + 1))
    render_empty_line "$use_color" "$(get_side_color $line_num)"

    line_num=$((line_num + 1))
    render_empty_line "$use_color" "$(get_side_color $line_num)"

    # Render ASCII art lines with two-color support
    for line in "${BANNER_ASCII_LINES[@]}"; do
        line_num=$((line_num + 1))
        render_ascii_line "$line" "$use_color" "$(get_side_color $line_num)"
    done

    line_num=$((line_num + 1))
    render_empty_line "$use_color" "$(get_side_color $line_num)"

    line_num=$((line_num + 1))
    render_empty_line "$use_color" "$(get_side_color $line_num)"

    render_bottom_border "$use_color"
}

# Show banner with custom title (for major scripts)
show_banner_with_title() {
    local title="$1"
    local scheme="${2:-default}"
    local use_color="${3:-true}"

    # Set colors for the scheme
    get_scheme_colors "$scheme"

    # Render banner elements dynamically with alternating side colors
    local line_num=1
    render_top_border "$use_color"

    line_num=$((line_num + 1))
    render_empty_line "$use_color" "$(get_side_color $line_num)"

    line_num=$((line_num + 1))
    render_empty_line "$use_color" "$(get_side_color $line_num)"

    # Render ASCII art lines with two-color support
    for line in "${BANNER_ASCII_LINES[@]}"; do
        line_num=$((line_num + 1))
        render_ascii_line "$line" "$use_color" "$(get_side_color $line_num)"
    done

    line_num=$((line_num + 1))
    render_empty_line "$use_color" "$(get_side_color $line_num)"

    line_num=$((line_num + 1))
    render_title_line "$title" "$use_color" "$(get_side_color $line_num)"

    line_num=$((line_num + 1))
    render_empty_line "$use_color" "$(get_side_color $line_num)"

    render_bottom_border "$use_color"
}

# Convenience function for setup scripts
show_setup_banner() {
    show_banner_with_title "DangerPrep Setup 2025" "default" "$@"
}

# Convenience function for cleanup scripts
show_cleanup_banner() {
    show_banner_with_title "System Cleanup & Restoration" "default" "$@"
}

# Convenience function for monitoring scripts
show_monitoring_banner() {
    show_banner_with_title "System Monitoring" "monitoring" "$@"
}

# Convenience function for security scripts
show_security_banner() {
    show_banner_with_title "Security Audit" "security" "$@"
}

# Convenience function for backup scripts
show_backup_banner() {
    show_banner_with_title "Backup Management" "backup" "$@"
}

# Convenience function for network scripts
show_network_banner() {
    show_banner_with_title "Network Configuration" "network" "$@"
}

# Convenience function for system scripts
show_system_banner() {
    show_banner_with_title "System Management" "system" "$@"
}

# Convenience function for validation scripts
show_validation_banner() {
    show_banner_with_title "System Validation" "validation" "$@"
}

# Convenience function for docker scripts
show_docker_banner() {
    show_banner_with_title "Docker Management" "docker" "$@"
}

# Function to show banner in MOTD style (more subdued but still colorful)
show_motd_banner() {
    local scheme="${1:-default}"

    # Set colors for the scheme
    get_scheme_colors "$scheme"

    # Render banner elements dynamically with subdued styling (all sides use BANNER_SECONDARY)
    render_top_border "true"
    render_empty_line "true" "$BANNER_SECONDARY"
    render_empty_line "true" "$BANNER_SECONDARY"

    # Render ASCII art lines with two-color support
    for line in "${BANNER_ASCII_LINES[@]}"; do
        render_ascii_line "$line" "true" "$BANNER_SECONDARY"
    done

    render_empty_line "true" "$BANNER_SECONDARY"
    render_empty_line "true" "$BANNER_SECONDARY"
    render_bottom_border "true"
}

# Test function to verify banner display
test_banner() {
    echo "Testing DangerPrep Banner System"
    echo "================================"
    echo
    echo "1. Title-less banner (default scheme):"
    show_banner
    echo
    echo "2. Banner with custom title (security scheme):"
    show_banner_with_title "Test Title" "security"
    echo
    echo "3. Network scheme banner:"
    show_banner "network"
    echo
    echo "4. Setup banner:"
    show_setup_banner
    echo
    echo "5. MOTD banner:"
    show_motd_banner
    echo
    echo "6. Plain text version:"
    show_banner "default" "false"
}

# If script is run directly, show test
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    test_banner
fi
