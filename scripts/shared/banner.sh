#!/bin/bash
# DangerPrep Shared Banner Utility
# Provides colorful banner functions for all DangerPrep scripts

# Color codes for flashy banner display
BANNER_PINK='\033[1;35m'        # Bright magenta for pink (top/bottom borders and alternating)
BANNER_BLUE='\033[1;34m'        # Bright blue for alternating sides
BANNER_AQUA='\033[1;36m'        # Bright cyan for main text and alternating
BANNER_WHITE='\033[1;37m'       # White for titles
BANNER_NC='\033[0m'             # No color reset

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
    local use_color="${1:-true}"
    local banner_file
    banner_file="$(find_banner_file)"

    if [[ ! -f "$banner_file" ]]; then
        echo "Warning: Banner file not found" >&2
        return 1
    fi

    if [[ "$use_color" == "true" ]]; then
        local line_num=0
        # Read lines 3-15 (without title section)
        sed -n '3,15p' "$banner_file" | while IFS= read -r line; do
            line_num=$((line_num + 1))

            # Top and bottom borders in pink
            if [[ $line_num -eq 1 || $line_num -eq 13 ]]; then
                echo -e "${BANNER_PINK}$line${BANNER_NC}"
            # Main text content (DangerPrep logo) in aqua
            elif [[ "$line" == *"_"* ]] || [[ "$line" == *"|"* ]] || [[ "$line" == *"."* ]] || [[ "$line" == *"\`"* ]]; then
                echo -e "${BANNER_AQUA}$line${BANNER_NC}"
            # Side borders and empty lines alternate: blue-aqua
            else
                case $((line_num % 2)) in
                    1) echo -e "${BANNER_BLUE}$line${BANNER_NC}" ;;
                    0) echo -e "${BANNER_AQUA}$line${BANNER_NC}" ;;
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
    local use_color="${2:-true}"
    local banner_file
    banner_file="$(find_banner_file)"

    if [[ ! -f "$banner_file" ]]; then
        echo "Warning: Banner file not found" >&2
        return 1
    fi

    if [[ "$use_color" == "true" ]]; then
        local line_num=0
        # Read the banner template with title
        sed -n '19,32p' "$banner_file" | while IFS= read -r line; do
            line_num=$((line_num + 1))

            # Top and bottom borders in pink
            if [[ $line_num -eq 1 || $line_num -eq 14 ]]; then
                echo -e "${BANNER_PINK}$line${BANNER_NC}"
            # Title line in blue
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

                # Determine side color for this line (alternating blue-aqua)
                local side_color
                case $((line_num % 2)) in
                    1) side_color="${BANNER_BLUE}" ;;
                    0) side_color="${BANNER_AQUA}" ;;
                esac

                echo -e "${side_color}: :${BANNER_BLUE}${title_content}${side_color}: :${BANNER_NC}"
            # Main text content (DangerPrep logo) in aqua
            elif [[ "$line" == *"_"* ]] || [[ "$line" == *"|"* ]] || [[ "$line" == *"."* ]] || [[ "$line" == *"\`"* ]]; then
                echo -e "${BANNER_AQUA}$line${BANNER_NC}"
            # Side borders and empty lines alternate: blue-aqua
            else
                case $((line_num % 2)) in
                    1) echo -e "${BANNER_BLUE}$line${BANNER_NC}" ;;
                    0) echo -e "${BANNER_AQUA}$line${BANNER_NC}" ;;
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
    show_banner_with_title "System Setup" "$@"
}

# Convenience function for cleanup scripts
show_cleanup_banner() {
    show_banner_with_title "System Cleanup & Restoration" "$@"
}

# Convenience function for monitoring scripts
show_monitoring_banner() {
    show_banner_with_title "System Monitoring" "$@"
}

# Convenience function for security scripts
show_security_banner() {
    show_banner_with_title "Security Audit" "$@"
}

# Convenience function for backup scripts
show_backup_banner() {
    show_banner_with_title "Backup Management" "$@"
}

# Convenience function for network scripts
show_network_banner() {
    show_banner_with_title "Network Configuration" "$@"
}

# Function to show banner in MOTD style (more subdued but still colorful)
show_motd_banner() {
    local banner_file
    banner_file="$(find_banner_file)"

    if [[ ! -f "$banner_file" ]]; then
        return 1
    fi

    local line_num=0
    # Read lines 3-15 (without title section) with subdued colors
    sed -n '3,15p' "$banner_file" | while IFS= read -r line; do
        line_num=$((line_num + 1))

        # Top and bottom borders in pink
        if [[ $line_num -eq 1 || $line_num -eq 13 ]]; then
            echo -e "${BANNER_PINK}$line${BANNER_NC}"
        # Main text content (DangerPrep logo) in aqua
        elif [[ "$line" == *"_"* ]] || [[ "$line" == *"|"* ]] || [[ "$line" == *"."* ]] || [[ "$line" == *"\`"* ]]; then
            echo -e "${BANNER_AQUA}$line${BANNER_NC}"
        # Side borders in aqua (more subdued than alternating)
        else
            echo -e "${BANNER_AQUA}$line${BANNER_NC}"
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
