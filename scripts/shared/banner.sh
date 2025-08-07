#!/bin/bash
# DangerPrep Shared Banner Utility
# Provides colorful banner functions for all DangerPrep scripts

# Color codes for banner display
BANNER_NC='\033[0m'             # No color reset

# Get colors for a specific scheme
get_scheme_colors() {
    local scheme="${1:-default}"

    case "$scheme" in
        "security")
            BANNER_BORDER='\033[1;31m'   # Red
            BANNER_TEXT='\033[1;33m'     # Yellow
            BANNER_SIDE1='\033[1;31m'    # Red
            BANNER_SIDE2='\033[1;33m'    # Yellow
            BANNER_TITLE='\033[1;33m'    # Yellow
            ;;
        "monitoring")
            BANNER_BORDER='\033[1;32m'   # Green
            BANNER_TEXT='\033[1;36m'     # Cyan
            BANNER_SIDE1='\033[1;32m'    # Green
            BANNER_SIDE2='\033[1;36m'    # Cyan
            BANNER_TITLE='\033[1;36m'    # Cyan
            ;;
        "network")
            BANNER_BORDER='\033[1;34m'   # Blue
            BANNER_TEXT='\033[1;36m'     # Cyan
            BANNER_SIDE1='\033[1;34m'    # Blue
            BANNER_SIDE2='\033[1;37m'    # White
            BANNER_TITLE='\033[1;36m'    # Cyan
            ;;
        "backup")
            BANNER_BORDER='\033[1;35m'   # Purple
            BANNER_TEXT='\033[1;35m'     # Magenta
            BANNER_SIDE1='\033[1;35m'    # Purple
            BANNER_SIDE2='\033[1;34m'    # Blue
            BANNER_TITLE='\033[1;35m'    # Magenta
            ;;
        "system")
            BANNER_BORDER='\033[0;37m'   # Gray
            BANNER_TEXT='\033[1;37m'     # White
            BANNER_SIDE1='\033[0;37m'    # Gray
            BANNER_SIDE2='\033[1;34m'    # Blue
            BANNER_TITLE='\033[1;37m'    # White
            ;;
        "validation")
            BANNER_BORDER='\033[1;32m'   # Green
            BANNER_TEXT='\033[1;33m'     # Yellow
            BANNER_SIDE1='\033[1;32m'    # Green
            BANNER_SIDE2='\033[1;33m'    # Yellow
            BANNER_TITLE='\033[1;33m'    # Yellow
            ;;
        "docker")
            BANNER_BORDER='\033[1;34m'   # Blue
            BANNER_TEXT='\033[1;37m'     # White
            BANNER_SIDE1='\033[1;34m'    # Blue
            BANNER_SIDE2='\033[1;36m'    # Cyan
            BANNER_TITLE='\033[1;37m'    # White
            ;;
        *)  # default
            BANNER_BORDER='\033[1;35m'   # Pink
            BANNER_TEXT='\033[1;36m'     # Aqua
            BANNER_SIDE1='\033[1;34m'    # Blue
            BANNER_SIDE2='\033[1;36m'    # Aqua
            BANNER_TITLE='\033[1;34m'    # Blue
            ;;
    esac
}

# Find banner file relative to script location
find_banner_file() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
    local banner_file=""
    
    # Try different relative paths from script location
    local paths=(
        "$script_dir/../../banner.txt"
        "$script_dir/../banner.txt"
        "$script_dir/banner.txt"
        "$(dirname "$(dirname "$script_dir")")/banner.txt"
    )
    
    for path in "${paths[@]}"; do
        if [[ -f "$path" ]]; then
            banner_file="$path"
            break
        fi
    done
    
    echo "$banner_file"
}

# Show banner without title (for utility scripts)
show_banner() {
    local scheme="${1:-default}"
    local use_color="${2:-true}"
    local banner_file
    banner_file="$(find_banner_file)"

    if [[ ! -f "$banner_file" ]]; then
        echo "Warning: Banner file not found" >&2
        return 1
    fi

    # Set colors for the scheme
    get_scheme_colors "$scheme"

    if [[ "$use_color" == "true" ]]; then
        local line_num=0
        # Read lines 3-15 (without title section)
        sed -n '3,15p' "$banner_file" | while IFS= read -r line; do
            line_num=$((line_num + 1))

            # Top and bottom borders
            if [[ $line_num -eq 1 || $line_num -eq 13 ]]; then
                echo -e "${BANNER_BORDER}$line${BANNER_NC}"
            # Main text content (DangerPrep logo)
            elif [[ "$line" == *"_"* ]] || [[ "$line" == *"|"* ]] || [[ "$line" == *"."* ]] || [[ "$line" == *"\`"* ]]; then
                echo -e "${BANNER_TEXT}$line${BANNER_NC}"
            # Side borders and empty lines alternate
            else
                case $((line_num % 2)) in
                    1) echo -e "${BANNER_SIDE1}$line${BANNER_NC}" ;;
                    0) echo -e "${BANNER_SIDE2}$line${BANNER_NC}" ;;
                esac
            fi
        done
    else
        # Plain version
        sed -n '3,15p' "$banner_file"
    fi
}

# Show banner with custom title (for major scripts)
show_banner_with_title() {
    local title="$1"
    local scheme="${2:-default}"
    local use_color="${3:-true}"
    local banner_file
    banner_file="$(find_banner_file)"

    if [[ ! -f "$banner_file" ]]; then
        echo "Warning: Banner file not found" >&2
        return 1
    fi

    # Set colors for the scheme
    get_scheme_colors "$scheme"

    if [[ "$use_color" == "true" ]]; then
        local line_num=0
        # Read the banner template with title
        sed -n '19,32p' "$banner_file" | while IFS= read -r line; do
            line_num=$((line_num + 1))

            # Top and bottom borders
            if [[ $line_num -eq 1 || $line_num -eq 14 ]]; then
                echo -e "${BANNER_BORDER}$line${BANNER_NC}"
            # Title line
            elif [[ "$line" == *"Title Goes Here"* ]]; then
                # Calculate proper centering and padding for title
                local content_width=72  # Width between ": :" markers (same as other lines)
                local title_length=${#title}

                # Truncate title if too long (truncate earlier for safety)
                if [[ $title_length -gt 66 ]]; then
                    title="${title:0:63}..."
                    title_length=${#title}
                fi

                local padding_total=$((content_width - title_length))
                local padding_left=$((padding_total / 2))
                local padding_right=$((padding_total - padding_left))

                # Build properly padded title line with colored sides
                printf -v spaces_left "%*s" $padding_left ""
                printf -v spaces_right "%*s" $padding_right ""
                local title_content="${spaces_left}${title}${spaces_right}"

                # Determine side color for this line (alternating)
                local side_color
                case $((line_num % 2)) in
                    1) side_color="${BANNER_SIDE1}" ;;
                    0) side_color="${BANNER_SIDE2}" ;;
                esac

                echo -e "${side_color}: :${BANNER_TITLE}${title_content}${side_color}: :${BANNER_NC}"
            # Main text content (DangerPrep logo)
            elif [[ "$line" == *"_"* ]] || [[ "$line" == *"|"* ]] || [[ "$line" == *"."* ]] || [[ "$line" == *"\`"* ]]; then
                echo -e "${BANNER_TEXT}$line${BANNER_NC}"
            # Side borders and empty lines alternate
            else
                case $((line_num % 2)) in
                    1) echo -e "${BANNER_SIDE1}$line${BANNER_NC}" ;;
                    0) echo -e "${BANNER_SIDE2}$line${BANNER_NC}" ;;
                esac
            fi
        done
    else
        # Plain version with title replacement
        sed -n '19,32p' "$banner_file" | sed "s/Title Goes Here/$title/"
    fi
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
    local banner_file
    banner_file="$(find_banner_file)"

    if [[ ! -f "$banner_file" ]]; then
        return 1
    fi

    # Set colors for the scheme
    get_scheme_colors "$scheme"

    local line_num=0
    # Read lines 3-15 (without title section) with subdued colors
    sed -n '3,15p' "$banner_file" | while IFS= read -r line; do
        line_num=$((line_num + 1))

        # Top and bottom borders
        if [[ $line_num -eq 1 || $line_num -eq 13 ]]; then
            echo -e "${BANNER_BORDER}$line${BANNER_NC}"
        # Main text content (DangerPrep logo)
        elif [[ "$line" == *"_"* ]] || [[ "$line" == *"|"* ]] || [[ "$line" == *"."* ]] || [[ "$line" == *"\`"* ]]; then
            echo -e "${BANNER_TEXT}$line${BANNER_NC}"
        # Side borders (more subdued than alternating)
        else
            echo -e "${BANNER_SIDE2}$line${BANNER_NC}"
        fi
    done
}

# Test function to verify banner display
test_banner() {
    echo "Testing DangerPrep Banner System"
    echo "================================"
    echo
    echo "1. Title-less banner:"
    show_banner
    echo
    echo "2. Banner with custom title:"
    show_banner_with_title "Test Title"
    echo
    echo "3. Setup banner:"
    show_setup_banner
    echo
    echo "4. MOTD banner:"
    show_motd_banner
}

# If script is run directly, show test
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    test_banner
fi
