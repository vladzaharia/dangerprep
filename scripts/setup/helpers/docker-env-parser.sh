#!/bin/bash
# Docker Environment Parser - Main Orchestrator
# Cleanroom implementation of docker environment parsing system
# Handles PROMPT and GENERATE directives in compose.env.example files

# Set strict error handling
set -euo pipefail

# =============================================================================
# SCRIPT INITIALIZATION
# =============================================================================

# Determine script directory and project root
DOCKER_ENV_PARSER_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_ENV_PARSER_PROJECT_ROOT="$(cd "$DOCKER_ENV_PARSER_SCRIPT_DIR/../../.." && pwd)"

# Source all required modules
source_modules() {
    local modules=(
        "../../shared/gum-utils.sh"
        "env-parser.sh"
        "prompt-handler.sh"
        "generate-handler.sh"
        "env-processor.sh"
        "env-error-handler.sh"
    )
    
    for module in "${modules[@]}"; do
        local module_path="$DOCKER_ENV_PARSER_SCRIPT_DIR/$module"
        if [[ -f "$module_path" ]]; then
            # shellcheck source=/dev/null
            source "$module_path"
        else
            echo "ERROR: Required module not found: $module_path" >&2
            exit 1
        fi
    done
}

# Initialize the system
initialize_system() {
    # Source all modules
    source_modules
    
    # Validate system requirements
    if ! validate_system_requirements; then
        log_error "System requirements not met"
        show_error_log
        exit 1
    fi
    
    # Check generation requirements
    if ! check_generation_requirements; then
        log_error "Generation requirements not met"
        show_error_log
        exit 1
    fi
    
    log_debug "Docker Environment Parser initialized successfully"
}

# =============================================================================
# MAIN FUNCTIONS
# =============================================================================

# Process a single environment file
process_single_file() {
    local example_file="$1"
    local env_file="${2:-}"
    
    if [[ -z "$env_file" ]]; then
        env_file="${example_file%.example}"
    fi
    
    log_info "Processing: $(basename "$example_file")"
    
    # Validate input file
    if ! validate_file_access "$example_file" "read"; then
        return 1
    fi
    
    # Process the file
    if process_environment_file "$example_file" "$env_file"; then
        log_info "✅ Successfully processed $(basename "$env_file")"
        return 0
    else
        log_error "❌ Failed to process $(basename "$example_file")"
        return 1
    fi
}

# Process multiple environment files
process_multiple_files() {
    local -a example_files=("$@")
    local processed=0
    local failed=0
    
    if [[ ${#example_files[@]} -eq 0 ]]; then
        log_warn "No environment files specified"
        return 0
    fi
    
    echo
    enhanced_section "Docker Environment Configuration" \
        "Processing ${#example_files[@]} environment files" "🔧"
    
    for example_file in "${example_files[@]}"; do
        if process_single_file "$example_file"; then
            ((processed++))
        else
            ((failed++))
        fi
        echo  # Add spacing between files
    done
    
    # Show summary
    echo
    if [[ $failed -eq 0 ]]; then
        enhanced_success "All environment files processed successfully" \
            "Processed: $processed files"
    else
        enhanced_error "Some environment files failed to process" \
            "Successful: $processed, Failed: $failed"
        show_error_log
    fi
    
    return $([[ $failed -eq 0 ]] && echo 0 || echo 1)
}

# Auto-discover and process environment files
auto_process_env_files() {
    local search_dir="${1:-$DOCKER_ENV_PARSER_PROJECT_ROOT/docker}"
    
    log_info "Auto-discovering environment files in: $search_dir"
    
    # Find all compose.env.example files
    local -a example_files
    mapfile -t example_files < <(find_env_example_files "$search_dir")
    
    if [[ ${#example_files[@]} -eq 0 ]]; then
        log_warn "No compose.env.example files found in $search_dir"
        return 0
    fi
    
    log_info "Found ${#example_files[@]} environment files"
    
    # Process all found files
    process_multiple_files "${example_files[@]}"
}

# Interactive file selection
interactive_file_selection() {
    local search_dir="${1:-$DOCKER_ENV_PARSER_PROJECT_ROOT/docker}"
    
    # Find all compose.env.example files
    local -a example_files
    mapfile -t example_files < <(find_env_example_files "$search_dir")
    
    if [[ ${#example_files[@]} -eq 0 ]]; then
        log_warn "No compose.env.example files found in $search_dir"
        return 0
    fi
    
    # Create display names for selection
    local -a display_names
    for file in "${example_files[@]}"; do
        local relative_path="${file#$DOCKER_ENV_PARSER_PROJECT_ROOT/}"
        display_names+=("$relative_path")
    done
    
    echo
    enhanced_section "Environment File Selection" \
        "Select environment files to process" "📋"
    
    # Use gum for multi-select if available
    if gum_available; then
        local gum_cmd
        gum_cmd=$(get_gum_cmd)
        
        local -a selected_indices
        mapfile -t selected_indices < <("$gum_cmd" choose --no-limit "${display_names[@]}" | \
            while read -r selected; do
                for i in "${!display_names[@]}"; do
                    if [[ "${display_names[$i]}" == "$selected" ]]; then
                        echo "$i"
                        break
                    fi
                done
            done)
        
        if [[ ${#selected_indices[@]} -eq 0 ]]; then
            log_info "No files selected"
            return 0
        fi
        
        # Build array of selected files
        local -a selected_files
        for index in "${selected_indices[@]}"; do
            selected_files+=("${example_files[$index]}")
        done
        
        process_multiple_files "${selected_files[@]}"
    else
        # Fallback to simple selection
        echo "Available environment files:"
        for i in "${!display_names[@]}"; do
            echo "  $((i+1)). ${display_names[$i]}"
        done
        
        echo
        echo -n "Enter file numbers to process (space-separated, or 'all'): "
        read -r selection
        
        if [[ "$selection" == "all" ]]; then
            process_multiple_files "${example_files[@]}"
        else
            local -a selected_files
            for num in $selection; do
                if [[ "$num" =~ ^[0-9]+$ ]] && [[ $num -ge 1 ]] && [[ $num -le ${#example_files[@]} ]]; then
                    selected_files+=("${example_files[$((num-1))]}")
                fi
            done
            
            if [[ ${#selected_files[@]} -gt 0 ]]; then
                process_multiple_files "${selected_files[@]}"
            else
                log_warn "No valid files selected"
            fi
        fi
    fi
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Show usage information
show_usage() {
    cat << EOF
Docker Environment Parser - Cleanroom Implementation

USAGE:
    $0 [OPTIONS] [FILES...]

OPTIONS:
    -h, --help              Show this help message
    -a, --auto              Auto-discover and process all compose.env.example files
    -i, --interactive       Interactive file selection
    -d, --directory DIR     Search directory for auto-discovery (default: ./docker)
    -v, --verbose           Enable verbose logging
    -q, --quiet             Suppress non-error output

ARGUMENTS:
    FILES...                Specific compose.env.example files to process

EXAMPLES:
    # Process specific files
    $0 docker/services/app/compose.env.example

    # Auto-discover and process all files
    $0 --auto

    # Interactive selection
    $0 --interactive

    # Process files in specific directory
    $0 --auto --directory /path/to/docker

DIRECTIVES:
    PROMPT[type,OPTIONAL]: description
        - Prompts user for input with optional validation
        - Types: email, pw/password, or text (default)
        - OPTIONAL: field can be skipped

    GENERATE[type,size,OPTIONAL]: description
        - Auto-generates secure values
        - Types: b64/base64, hex, bcrypt, pw/password, or default
        - Size: length of generated value (default: 24)
        - OPTIONAL: field can be skipped

EOF
}

# Parse command line arguments
parse_arguments() {
    local mode="files"
    local search_dir="$DOCKER_ENV_PARSER_PROJECT_ROOT/docker"
    local -a files=()
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                show_usage
                exit 0
                ;;
            -a|--auto)
                mode="auto"
                shift
                ;;
            -i|--interactive)
                mode="interactive"
                shift
                ;;
            -d|--directory)
                search_dir="$2"
                shift 2
                ;;
            -v|--verbose)
                export LOG_LEVEL="DEBUG"
                shift
                ;;
            -q|--quiet)
                export LOG_LEVEL="ERROR"
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                files+=("$1")
                shift
                ;;
        esac
    done
    
    # Execute based on mode
    case "$mode" in
        "auto")
            auto_process_env_files "$search_dir"
            ;;
        "interactive")
            interactive_file_selection "$search_dir"
            ;;
        "files")
            if [[ ${#files[@]} -gt 0 ]]; then
                process_multiple_files "${files[@]}"
            else
                log_error "No files specified. Use --help for usage information."
                exit 1
            fi
            ;;
    esac
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    # Initialize system
    initialize_system
    
    # Parse arguments and execute
    if [[ $# -eq 0 ]]; then
        show_usage
        exit 1
    fi
    
    parse_arguments "$@"
    
    # Show final summary
    local summary
    summary=$(get_error_summary)
    if [[ "$summary" != "Errors: 0, Warnings: 0, Recovery attempts: 0" ]]; then
        echo
        enhanced_section "Final Summary" "$summary" "📊"
        show_error_log
    fi
    
    # Clean up
    cleanup_error_tracking
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
