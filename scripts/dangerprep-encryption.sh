#!/bin/bash
# DangerPrep File Encryption System
# Hardware-backed file encryption using YubiKey PIV keys and age encryption
# 
# Commands:
#   dp-encrypt  - Encrypt files and directories defined in configuration
#   dp-decrypt  - Decrypt files and directories using YubiKey
#
# Dependencies:
#   - age (encryption tool)
#   - age-plugin-yubikey (YubiKey PIV support)
#   - ykman (YubiKey Manager CLI)
#   - yq (YAML processor)
#   - tar, gzip, zstd (archiving and compression)

set -euo pipefail

# Script configuration
readonly SCRIPT_NAME="dangerprep-encryption"
readonly SCRIPT_VERSION="1.0.0"
readonly CONFIG_FILE="/etc/dangerprep/encryption.yaml"
readonly LOCK_FILE="/var/run/dangerprep-encryption.lock"

# Get script directory for sourcing shared utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SHARED_DIR="${SCRIPT_DIR}/shared"

# Source shared utilities
HAS_GUM_UTILS=false
if [[ -f "${SHARED_DIR}/gum-utils.sh" ]]; then
    # shellcheck source=scripts/shared/gum-utils.sh
    source "${SHARED_DIR}/gum-utils.sh"
    HAS_GUM_UTILS=true
fi

# Source lock utilities
if [[ -f "${SHARED_DIR}/lock-utils.sh" ]]; then
    # shellcheck source=scripts/shared/lock-utils.sh
    source "${SHARED_DIR}/lock-utils.sh"
fi

# Setup logging with gum-utils
readonly LOG_FILE=$(get_log_file_path "encryption")
export LOG_FILE

# Error handling
error_exit() {
    log_error "$1"
    cleanup
    exit 1
}

# Cleanup function
cleanup() {
    log_debug "Performing cleanup..."

    # Release lock file if using lock-utils
    if [[ -n "${LOCK_FD:-}" ]]; then
        release_lock "${LOCK_FD}"
    fi

    # Clean up temporary files
    if [[ -n "${TEMP_DIR:-}" && -d "$TEMP_DIR" ]]; then
        log_debug "Cleaning up temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
    fi
}

# Trap for cleanup
trap cleanup EXIT INT TERM

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root"
    fi
}

# Check dependencies
check_dependencies() {
    local deps=("age" "age-plugin-yubikey" "ykman" "yq" "tar")
    local missing_deps=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" >/dev/null 2>&1; then
            missing_deps+=("$dep")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        error_exit "Missing dependencies: ${missing_deps[*]}"
    fi
    
    log_debug "All dependencies satisfied"
}

# Create lock file using lock-utils
create_lock() {
    LOCK_FD=""
    if ! acquire_lock "${LOCK_FILE}" "LOCK_FD"; then
        error_exit "Another instance is already running or failed to acquire lock"
    fi
    log_debug "Acquired lock: ${LOCK_FILE} (FD: ${LOCK_FD})"
}

# Load configuration
load_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        error_exit "Configuration file not found: $CONFIG_FILE"
    fi
    
    # Validate YAML syntax
    if ! yq eval '.' "$CONFIG_FILE" >/dev/null 2>&1; then
        error_exit "Invalid YAML syntax in configuration file"
    fi
    
    log_debug "Configuration loaded successfully"
}

# Get configuration value
get_config() {
    local key="$1"
    local default="${2:-}"
    
    local value
    value=$(yq eval ".$key" "$CONFIG_FILE" 2>/dev/null || echo "null")
    
    if [[ "$value" == "null" ]]; then
        echo "$default"
    else
        echo "$value"
    fi
}

# Check YubiKey presence
check_yubikey() {
    log_info "Checking for YubiKey..."
    
    if ! ykman list >/dev/null 2>&1; then
        error_exit "No YubiKey detected. Please insert your YubiKey and try again."
    fi
    
    local yubikey_count
    yubikey_count=$(ykman list | wc -l)
    log_info "Found $yubikey_count YubiKey(s)"
    
    # Get YubiKey serial number
    local serial
    serial=$(ykman list | head -n1 | awk '{print $NF}' | tr -d '()')
    log_debug "YubiKey serial: $serial"
    
    echo "$serial"
}

# Initialize YubiKey PIV key
init_yubikey_key() {
    local slot="$1"
    local algorithm="$2"
    local touch_policy="$3"
    local pin_policy="$4"
    
    log_info "Initializing YubiKey PIV key in slot $slot..."
    
    # Check if key already exists
    if ykman piv keys generate --help >/dev/null 2>&1; then
        # Generate new key if it doesn't exist
        if ! ykman piv certificates export "$slot" - >/dev/null 2>&1; then
            log_info "Generating new PIV key in slot $slot..."
            ykman piv keys generate \
                --algorithm "$algorithm" \
                --pin-policy "$pin_policy" \
                --touch-policy "$touch_policy" \
                "$slot" \
                /tmp/pubkey.pem
            
            # Generate self-signed certificate
            ykman piv certificates generate \
                --subject "CN=DangerPrep Encryption Key" \
                "$slot" \
                /tmp/pubkey.pem
            
            rm -f /tmp/pubkey.pem
            log_info "PIV key generated successfully"
        else
            log_info "PIV key already exists in slot $slot"
        fi
    else
        error_exit "Failed to access YubiKey PIV functionality"
    fi
}

# Get YubiKey public key for age
get_yubikey_public_key() {
    local slot="$1"
    
    log_debug "Extracting public key from YubiKey slot $slot..."
    
    # Use age-plugin-yubikey to get the public key
    local public_key
    if public_key=$(age-plugin-yubikey --list 2>/dev/null | grep -A1 "Slot $slot" | tail -n1 | awk '{print $1}'); then
        if [[ -n "$public_key" && "$public_key" != "Slot" ]]; then
            echo "$public_key"
            return 0
        fi
    fi
    
    error_exit "Failed to extract public key from YubiKey slot $slot"
}

# Show usage information
show_usage() {
    cat << EOF
DangerPrep File Encryption System v$SCRIPT_VERSION

USAGE:
    $0 <command> [options]

COMMANDS:
    encrypt     Encrypt files and directories defined in configuration
    decrypt     Decrypt files and directories using YubiKey
    init        Initialize YubiKey PIV keys for encryption
    status      Show encryption system status
    list        List encrypted bundles
    help        Show this help message

OPTIONS:
    -c, --config FILE    Use alternative configuration file
    -v, --verbose        Enable verbose output
    -d, --debug          Enable debug output
    -n, --dry-run        Show what would be done without executing
    -f, --force          Force operation without confirmation

EXAMPLES:
    $0 init              Initialize YubiKey PIV keys
    $0 encrypt           Encrypt all configured targets
    $0 decrypt           Decrypt all encrypted bundles
    $0 status            Show system status
    $0 list              List all encrypted bundles

CONFIGURATION:
    Configuration file: $CONFIG_FILE
    Log file: $LOG_FILE

For more information, see: https://github.com/vladzaharia/dangerprep
EOF
}

# Main function
main() {
    local command="${1:-help}"
    
    # Parse command line options
    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            -v|--verbose)
                export VERBOSE=true
                shift
                ;;
            -d|--debug)
                export DEBUG=true
                shift
                ;;
            -n|--dry-run)
                export DRY_RUN=true
                shift
                ;;
            -f|--force)
                export FORCE=true
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                if [[ -z "${command:-}" || "$command" == "help" ]]; then
                    command="$1"
                fi
                shift
                ;;
        esac
    done
    
    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    
    log_info "Starting DangerPrep Encryption System v$SCRIPT_VERSION"
    log_debug "Command: $command"
    
    case "$command" in
        "encrypt")
            check_root
            create_lock
            check_dependencies
            load_config
            encrypt_targets
            ;;
        "decrypt")
            check_root
            create_lock
            check_dependencies
            load_config
            decrypt_targets
            ;;
        "init")
            check_root
            check_dependencies
            load_config
            init_yubikey_keys
            ;;
        "status")
            show_status
            ;;
        "list")
            list_encrypted_bundles
            ;;
        "help"|*)
            show_usage
            exit 0
            ;;
    esac
    
    log_info "Operation completed successfully"
}

# Initialize YubiKey PIV keys
init_yubikey_keys() {
    log_info "Initializing YubiKey PIV keys..."

    local yubikey_serial
    yubikey_serial=$(check_yubikey)

    # Get primary key configuration
    local primary_slot
    primary_slot=$(get_config "yubikeys.primary.slot" "9a")
    local primary_algorithm
    primary_algorithm=$(get_config "yubikeys.primary.algorithm" "ECCP256")
    local primary_touch_policy
    primary_touch_policy=$(get_config "yubikeys.primary.touch_policy" "always")
    local primary_pin_policy
    primary_pin_policy=$(get_config "yubikeys.primary.pin_policy" "once")

    # Initialize primary key
    init_yubikey_key "$primary_slot" "$primary_algorithm" "$primary_touch_policy" "$primary_pin_policy"

    # Get and store public key
    local public_key
    public_key=$(get_yubikey_public_key "$primary_slot")
    log_info "Primary key public key: $public_key"

    # Update configuration with public key (if not already set)
    local current_pubkey
    current_pubkey=$(get_config "yubikeys.primary.public_key")
    if [[ "$current_pubkey" == "null" || -z "$current_pubkey" ]]; then
        log_info "Updating configuration with public key..."
        yq eval ".yubikeys.primary.public_key = \"$public_key\"" -i "$CONFIG_FILE"
        yq eval ".yubikeys.primary.serial = \"$yubikey_serial\"" -i "$CONFIG_FILE"
    fi

    log_info "YubiKey initialization completed"
}

# Create encrypted archive from source
create_encrypted_archive() {
    local source="$1"
    local target_name="$2"
    local include_patterns="$3"
    local exclude_patterns="$4"
    local recursive="$5"
    local follow_symlinks="$6"

    log_info "Creating encrypted archive for: $source"

    # Create temporary directory
    TEMP_DIR=$(mktemp -d -t dangerprep-encryption.XXXXXX)
    local archive_path="$TEMP_DIR/${target_name}.tar"

    # Build tar command
    local tar_cmd="tar"
    local tar_args=()

    # Add compression if enabled
    local compression_enabled
    compression_enabled=$(get_config "encryption.compression.enabled" "true")
    if [[ "$compression_enabled" == "true" ]]; then
        local compression_algo
        compression_algo=$(get_config "encryption.compression.algorithm" "zstd")
        case "$compression_algo" in
            "gzip") tar_args+=("--gzip") ;;
            "bzip2") tar_args+=("--bzip2") ;;
            "xz") tar_args+=("--xz") ;;
            "lz4") tar_args+=("--lz4") ;;
            "zstd") tar_args+=("--zstd") ;;
        esac
        archive_path="${archive_path}.${compression_algo}"
    fi

    # Add other options
    tar_args+=("-cf" "$archive_path")

    if [[ "$follow_symlinks" == "true" ]]; then
        tar_args+=("-h")
    fi

    # Add exclude patterns
    if [[ -n "$exclude_patterns" ]]; then
        while IFS= read -r pattern; do
            [[ -n "$pattern" ]] && tar_args+=("--exclude=$pattern")
        done <<< "$exclude_patterns"
    fi

    # Add source
    tar_args+=("$source")

    # Create archive
    log_debug "Creating archive: $tar_cmd ${tar_args[*]}"
    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        "$tar_cmd" "${tar_args[@]}" || error_exit "Failed to create archive"
    fi

    echo "$archive_path"
}

# Split archive into chunks
split_archive() {
    local archive_path="$1"
    local chunk_size="$2"

    log_debug "Splitting archive into ${chunk_size}MB chunks"

    local chunk_prefix="${archive_path}.chunk."
    local chunk_size_bytes=$((chunk_size * 1024 * 1024))

    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        split -b "$chunk_size_bytes" -d "$archive_path" "$chunk_prefix" || error_exit "Failed to split archive"
    fi

    # Return list of chunk files
    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        ls "${chunk_prefix}"* 2>/dev/null || echo ""
    else
        echo "${chunk_prefix}00 ${chunk_prefix}01"  # Mock for dry run
    fi
}

# Encrypt chunk with age and YubiKey
encrypt_chunk() {
    local chunk_path="$1"
    local output_dir="$2"
    local recipients="$3"

    local chunk_name
    chunk_name=$(basename "$chunk_path")

    # Generate random filename to prevent metadata leakage
    local randomize_filenames
    randomize_filenames=$(get_config "encryption.storage.randomize_filenames" "true")

    local output_filename
    if [[ "$randomize_filenames" == "true" ]]; then
        output_filename=$(openssl rand -hex 16)
    else
        output_filename="$chunk_name"
    fi

    local output_path="$output_dir/${output_filename}.age"

    log_debug "Encrypting chunk: $chunk_name -> $output_filename"

    # Build age command
    local age_cmd="age"
    local age_args=()

    # Add recipients
    while IFS= read -r recipient; do
        [[ -n "$recipient" ]] && age_args+=("-r" "$recipient")
    done <<< "$recipients"

    age_args+=("-o" "$output_path" "$chunk_path")

    # Encrypt chunk
    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        "$age_cmd" "${age_args[@]}" || error_exit "Failed to encrypt chunk: $chunk_name"
    fi

    # Return mapping: original_name:encrypted_name:size
    local chunk_size
    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        chunk_size=$(stat -f%z "$chunk_path" 2>/dev/null || stat -c%s "$chunk_path" 2>/dev/null || echo "0")
    else
        chunk_size="1048576"  # Mock size for dry run
    fi

    echo "${chunk_name}:${output_filename}:${chunk_size}"
}

# Show system status
show_status() {
    log_info "DangerPrep Encryption System Status"
    echo "======================================"

    # Check configuration
    if [[ -f "$CONFIG_FILE" ]]; then
        echo "✓ Configuration file: $CONFIG_FILE"
    else
        echo "✗ Configuration file missing: $CONFIG_FILE"
        return 1
    fi

    # Check dependencies
    echo
    echo "Dependencies:"
    local deps=("age" "age-plugin-yubikey" "ykman" "yq" "tar")
    for dep in "${deps[@]}"; do
        if command -v "$dep" >/dev/null 2>&1; then
            local version
            case "$dep" in
                "age") version=$(age --version 2>/dev/null | head -n1 || echo "unknown") ;;
                "ykman") version=$(ykman --version 2>/dev/null || echo "unknown") ;;
                "yq") version=$(yq --version 2>/dev/null || echo "unknown") ;;
                "tar") version=$(tar --version 2>/dev/null | head -n1 || echo "unknown") ;;
                *) version="installed" ;;
            esac
            echo "  ✓ $dep ($version)"
        else
            echo "  ✗ $dep (not found)"
        fi
    done

    # Check YubiKey
    echo
    echo "YubiKey Status:"
    if ykman list >/dev/null 2>&1; then
        local yubikey_info
        yubikey_info=$(ykman list)
        echo "  ✓ YubiKey detected:"
        echo "$yubikey_info" | sed 's/^/    /'

        # Check PIV keys
        local primary_slot
        primary_slot=$(get_config "yubikeys.primary.slot" "9a")
        if ykman piv certificates export "$primary_slot" - >/dev/null 2>&1; then
            echo "  ✓ PIV key in slot $primary_slot"
        else
            echo "  ✗ No PIV key in slot $primary_slot"
        fi
    else
        echo "  ✗ No YubiKey detected"
    fi

    # Check storage
    echo
    echo "Storage:"
    local base_path
    base_path=$(get_config "encryption.storage.base_path" "/data/encrypted")
    if [[ -d "$base_path" ]]; then
        local bundle_count
        bundle_count=$(find "$base_path" -name "*.manifest" 2>/dev/null | wc -l)
        echo "  ✓ Storage directory: $base_path"
        echo "  ✓ Encrypted bundles: $bundle_count"
    else
        echo "  ✗ Storage directory missing: $base_path"
    fi
}

# List encrypted bundles
list_encrypted_bundles() {
    log_info "Listing encrypted bundles..."

    local base_path
    base_path=$(get_config "encryption.storage.base_path" "/data/encrypted")

    if [[ ! -d "$base_path" ]]; then
        log_warn "Storage directory not found: $base_path"
        return 1
    fi

    echo "Encrypted Bundles:"
    echo "=================="

    local manifest_files
    manifest_files=$(find "$base_path" -name "*.manifest" 2>/dev/null | sort)

    if [[ -z "$manifest_files" ]]; then
        echo "No encrypted bundles found."
        return 0
    fi

    while IFS= read -r manifest_file; do
        if [[ -f "$manifest_file" ]]; then
            local bundle_name
            bundle_name=$(basename "$manifest_file" .manifest)
            local bundle_date
            bundle_date=$(stat -f%Sm -t"%Y-%m-%d %H:%M:%S" "$manifest_file" 2>/dev/null || \
                         stat -c%y "$manifest_file" 2>/dev/null | cut -d' ' -f1-2 || echo "unknown")

            echo "  $bundle_name (created: $bundle_date)"
        fi
    done <<< "$manifest_files"
}

# Encrypt all configured targets
encrypt_targets() {
    log_info "Starting encryption of configured targets..."

    # Check YubiKey presence
    local yubikey_serial
    yubikey_serial=$(check_yubikey)

    # Get recipients (public keys)
    local recipients=""
    local primary_pubkey
    primary_pubkey=$(get_config "yubikeys.primary.public_key")
    if [[ "$primary_pubkey" != "null" && -n "$primary_pubkey" ]]; then
        recipients="$primary_pubkey"
    else
        error_exit "No public key configured for primary YubiKey. Run 'init' command first."
    fi

    # Get storage configuration
    local base_path
    base_path=$(get_config "encryption.storage.base_path" "/data/encrypted")
    local chunk_size
    chunk_size=$(get_config "encryption.chunk_size" "100")

    # Create storage directory
    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        mkdir -p "$base_path"
    fi

    # Get list of enabled targets
    local targets
    targets=$(yq eval '.targets | to_entries | .[] | select(.value.enabled == true) | .key' "$CONFIG_FILE" 2>/dev/null || echo "")

    if [[ -z "$targets" ]]; then
        log_warn "No enabled targets found in configuration"
        return 0
    fi

    # Process each target
    while IFS= read -r target_name; do
        [[ -z "$target_name" ]] && continue

        log_info "Processing target: $target_name"

        # Get target configuration
        local source
        source=$(get_config "targets.${target_name}.source")
        local target_type
        target_type=$(get_config "targets.${target_name}.type" "directory")
        local include_patterns
        include_patterns=$(yq eval ".targets.${target_name}.include[]?" "$CONFIG_FILE" 2>/dev/null | tr '\n' '\n' || echo "")
        local exclude_patterns
        exclude_patterns=$(yq eval ".targets.${target_name}.exclude[]?" "$CONFIG_FILE" 2>/dev/null | tr '\n' '\n' || echo "")
        local recursive
        recursive=$(get_config "targets.${target_name}.recursive" "true")
        local follow_symlinks
        follow_symlinks=$(get_config "targets.${target_name}.follow_symlinks" "false")

        # Validate source exists
        if [[ ! -e "$source" ]]; then
            log_warn "Source not found, skipping: $source"
            continue
        fi

        # Create backup if enabled
        local create_backup
        create_backup=$(get_config "backup.create_backup" "true")
        if [[ "$create_backup" == "true" ]]; then
            create_target_backup "$source" "$target_name"
        fi

        # Create encrypted archive
        local archive_path
        archive_path=$(create_encrypted_archive "$source" "$target_name" "$include_patterns" "$exclude_patterns" "$recursive" "$follow_symlinks")

        # Split into chunks
        local chunk_files
        chunk_files=$(split_archive "$archive_path" "$chunk_size")

        # Encrypt chunks
        local manifest_entries=()
        local chunk_count=0

        while IFS= read -r chunk_file; do
            [[ -z "$chunk_file" || ! -f "$chunk_file" ]] && continue

            local chunk_mapping
            chunk_mapping=$(encrypt_chunk "$chunk_file" "$base_path" "$recipients")
            manifest_entries+=("$chunk_mapping")
            ((chunk_count++))

            log_debug "Encrypted chunk $chunk_count: $chunk_mapping"
        done <<< "$chunk_files"

        # Create manifest file
        create_manifest "$target_name" "$base_path" "${manifest_entries[@]}"

        # Clean up temporary files
        if [[ "${DRY_RUN:-false}" != "true" ]]; then
            rm -f "$archive_path" $chunk_files
        fi

        log_info "Target '$target_name' encrypted successfully ($chunk_count chunks)"

    done <<< "$targets"

    log_info "Encryption completed for all targets"
}

# Create backup of target before encryption
create_target_backup() {
    local source="$1"
    local target_name="$2"

    local backup_path
    backup_path=$(get_config "backup.backup_path" "/data/backup/pre-encryption")
    local compress_backups
    compress_backups=$(get_config "backup.compress_backups" "true")

    log_debug "Creating backup for target: $target_name"

    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        mkdir -p "$backup_path"

        local backup_file="$backup_path/${target_name}_$(date +%Y%m%d_%H%M%S)"

        if [[ "$compress_backups" == "true" ]]; then
            backup_file="${backup_file}.tar.gz"
            tar -czf "$backup_file" -C "$(dirname "$source")" "$(basename "$source")" || log_warn "Failed to create backup for $target_name"
        else
            if [[ -d "$source" ]]; then
                cp -r "$source" "$backup_file" || log_warn "Failed to create backup for $target_name"
            else
                cp "$source" "$backup_file" || log_warn "Failed to create backup for $target_name"
            fi
        fi

        log_debug "Backup created: $backup_file"
    fi
}

# Create manifest file for encrypted bundle
create_manifest() {
    local target_name="$1"
    local base_path="$2"
    shift 2
    local manifest_entries=("$@")

    local manifest_file="$base_path/${target_name}.manifest"

    log_debug "Creating manifest file: $manifest_file"

    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        cat > "$manifest_file" << EOF
# DangerPrep Encryption Manifest
# Target: $target_name
# Created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Version: $SCRIPT_VERSION

target_name: "$target_name"
created: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
version: "$SCRIPT_VERSION"
chunks:
EOF

        for entry in "${manifest_entries[@]}"; do
            IFS=':' read -r original_name encrypted_name size <<< "$entry"
            cat >> "$manifest_file" << EOF
  - original_name: "$original_name"
    encrypted_name: "$encrypted_name"
    size: $size
EOF
        done

        # Encrypt manifest if configured
        local encrypt_manifest
        encrypt_manifest=$(get_config "encryption.storage.encrypt_manifest" "true")
        if [[ "$encrypt_manifest" == "true" ]]; then
            local recipients
            recipients=$(get_config "yubikeys.primary.public_key")
            age -r "$recipients" -o "${manifest_file}.age" "$manifest_file" && rm "$manifest_file"
            log_debug "Manifest encrypted: ${manifest_file}.age"
        fi
    fi
}

# Decrypt all encrypted bundles
decrypt_targets() {
    log_info "Starting decryption of encrypted bundles..."

    # Check YubiKey presence
    local yubikey_serial
    yubikey_serial=$(check_yubikey)

    # Get storage configuration
    local base_path
    base_path=$(get_config "encryption.storage.base_path" "/data/encrypted")

    if [[ ! -d "$base_path" ]]; then
        error_exit "Storage directory not found: $base_path"
    fi

    # Find all manifest files
    local manifest_files
    manifest_files=$(find "$base_path" -name "*.manifest" -o -name "*.manifest.age" 2>/dev/null | sort)

    if [[ -z "$manifest_files" ]]; then
        log_warn "No encrypted bundles found"
        return 0
    fi

    # Process each manifest
    while IFS= read -r manifest_file; do
        [[ -z "$manifest_file" || ! -f "$manifest_file" ]] && continue

        local bundle_name
        bundle_name=$(basename "$manifest_file" | sed 's/\.manifest\(\.age\)\?$//')

        log_info "Decrypting bundle: $bundle_name"

        # Decrypt manifest if encrypted
        local working_manifest="$manifest_file"
        if [[ "$manifest_file" == *.age ]]; then
            working_manifest="$TEMP_DIR/$(basename "$manifest_file" .age)"
            log_debug "Decrypting manifest: $manifest_file"

            if [[ "${DRY_RUN:-false}" != "true" ]]; then
                age -d -i <(age-plugin-yubikey --identity) -o "$working_manifest" "$manifest_file" || {
                    log_error "Failed to decrypt manifest: $manifest_file"
                    continue
                }
            fi
        fi

        # Parse manifest and decrypt chunks
        decrypt_bundle "$working_manifest" "$base_path" "$bundle_name"

    done <<< "$manifest_files"

    log_info "Decryption completed for all bundles"
}

# Decrypt a single bundle
decrypt_bundle() {
    local manifest_file="$1"
    local base_path="$2"
    local bundle_name="$3"

    log_debug "Decrypting bundle from manifest: $manifest_file"

    # Create temporary directory for this bundle
    local bundle_temp_dir="$TEMP_DIR/$bundle_name"
    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        mkdir -p "$bundle_temp_dir"
    fi

    # Parse manifest to get chunk information
    local chunk_files=()
    local chunk_names=()

    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        # Extract chunk information from YAML manifest
        while IFS= read -r line; do
            if [[ "$line" =~ ^[[:space:]]*encrypted_name:[[:space:]]*\"(.*)\"$ ]]; then
                chunk_files+=("${BASH_REMATCH[1]}")
            elif [[ "$line" =~ ^[[:space:]]*original_name:[[:space:]]*\"(.*)\"$ ]]; then
                chunk_names+=("${BASH_REMATCH[1]}")
            fi
        done < "$manifest_file"
    else
        # Mock data for dry run
        chunk_files=("chunk1.age" "chunk2.age")
        chunk_names=("chunk.00" "chunk.01")
    fi

    # Decrypt each chunk
    local decrypted_chunks=()
    for i in "${!chunk_files[@]}"; do
        local encrypted_chunk="$base_path/${chunk_files[$i]}.age"
        local original_name="${chunk_names[$i]}"
        local decrypted_chunk="$bundle_temp_dir/$original_name"

        log_debug "Decrypting chunk: ${chunk_files[$i]} -> $original_name"

        if [[ "${DRY_RUN:-false}" != "true" ]]; then
            if [[ -f "$encrypted_chunk" ]]; then
                age -d -i <(age-plugin-yubikey --identity) -o "$decrypted_chunk" "$encrypted_chunk" || {
                    log_error "Failed to decrypt chunk: $encrypted_chunk"
                    continue
                }
                decrypted_chunks+=("$decrypted_chunk")
            else
                log_warn "Encrypted chunk not found: $encrypted_chunk"
            fi
        else
            decrypted_chunks+=("$decrypted_chunk")
        fi
    done

    # Reassemble chunks into archive
    local archive_path="$bundle_temp_dir/${bundle_name}.tar"
    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        if [[ ${#decrypted_chunks[@]} -gt 0 ]]; then
            # Sort chunks by name to ensure correct order
            IFS=$'\n' decrypted_chunks=($(sort <<<"${decrypted_chunks[*]}"))

            # Concatenate chunks
            cat "${decrypted_chunks[@]}" > "$archive_path" || {
                log_error "Failed to reassemble archive for bundle: $bundle_name"
                return 1
            }

            log_debug "Archive reassembled: $archive_path"
        else
            log_error "No chunks were successfully decrypted for bundle: $bundle_name"
            return 1
        fi
    fi

    # Extract archive to original location
    extract_archive "$archive_path" "$bundle_name"

    log_info "Bundle '$bundle_name' decrypted successfully"
}

# Extract archive to original location
extract_archive() {
    local archive_path="$1"
    local bundle_name="$2"

    log_debug "Extracting archive: $archive_path"

    # Get target configuration to determine extraction location
    local target_source
    target_source=$(get_config "targets.${bundle_name}.source")

    if [[ "$target_source" == "null" || -z "$target_source" ]]; then
        log_warn "No target configuration found for bundle: $bundle_name"
        log_info "Archive available at: $archive_path"
        return 0
    fi

    # Determine extraction directory
    local extract_dir
    if [[ -d "$target_source" ]]; then
        extract_dir="$(dirname "$target_source")"
    else
        extract_dir="$(dirname "$target_source")"
    fi

    log_info "Extracting to: $extract_dir"

    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        # Detect compression and extract accordingly
        local tar_args=("-xf" "$archive_path" "-C" "$extract_dir")

        # Auto-detect compression
        if file "$archive_path" | grep -q "gzip"; then
            tar_args=("-xzf" "$archive_path" "-C" "$extract_dir")
        elif file "$archive_path" | grep -q "bzip2"; then
            tar_args=("-xjf" "$archive_path" "-C" "$extract_dir")
        elif file "$archive_path" | grep -q "XZ"; then
            tar_args=("-xJf" "$archive_path" "-C" "$extract_dir")
        elif file "$archive_path" | grep -q "Zstandard"; then
            tar_args=("--zstd" "-xf" "$archive_path" "-C" "$extract_dir")
        fi

        tar "${tar_args[@]}" || {
            log_error "Failed to extract archive: $archive_path"
            return 1
        }

        log_debug "Archive extracted successfully"
    fi
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
