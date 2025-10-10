#!/bin/bash
# DangerPrep Lock File Utilities
# Provides atomic lock file management using flock

#######################################
# Create and acquire an exclusive lock
# Uses flock for atomic, race-condition-free locking
# Globals:
#   None
# Arguments:
#   $1 - Lock file path (default location)
#   $2 - Lock file descriptor variable name (will be set to FD number)
# Returns:
#   0 on success, 1 on failure
# Outputs:
#   Sets the variable named in $2 to the file descriptor number
#######################################
acquire_lock() {
    local lock_file_default="$1"
    local fd_var_name="$2"
    local lock_file="${lock_file_default}"
    local lock_fd

    # Try to create lock file in default location, fallback to user directory if needed
    if ! touch "${lock_file}" 2>/dev/null; then
        local user_lock_dir="${HOME}/.local/share/dangerprep/locks"
        mkdir -p "${user_lock_dir}" 2>/dev/null || return 1
        lock_file="${user_lock_dir}/$(basename "${lock_file_default}")"
        touch "${lock_file}" 2>/dev/null || return 1
    fi

    # Open file descriptor for locking
    # Find an available file descriptor (starting from 200 to avoid conflicts)
    for fd in {200..255}; do
        if ! { true >&"$fd"; } 2>/dev/null; then
            lock_fd=$fd
            break
        fi
    done

    if [[ -z "${lock_fd}" ]]; then
        echo "ERROR: No available file descriptors for locking" >&2
        return 1
    fi

    # Open the lock file on the file descriptor
    eval "exec ${lock_fd}>${lock_file}"

    # Try to acquire exclusive lock (non-blocking)
    if ! flock -n "${lock_fd}"; then
        # Lock is held by another process
        local lock_holder
        lock_holder=$(cat "${lock_file}" 2>/dev/null || echo "unknown")
        echo "ERROR: Another instance is already running (PID: ${lock_holder})" >&2
        eval "exec ${lock_fd}>&-"  # Close the file descriptor
        return 1
    fi

    # Write our PID to the lock file
    echo "$$" >&"${lock_fd}"

    # Export the lock file descriptor and path to the caller
    eval "${fd_var_name}=${lock_fd}"
    eval "${fd_var_name}_PATH='${lock_file}'"

    return 0
}

#######################################
# Release a lock acquired with acquire_lock
# Globals:
#   None
# Arguments:
#   $1 - Lock file descriptor number
# Returns:
#   0 on success
#######################################
release_lock() {
    local lock_fd="$1"

    if [[ -n "${lock_fd}" ]] && [[ "${lock_fd}" =~ ^[0-9]+$ ]]; then
        # Close the file descriptor (automatically releases flock)
        eval "exec ${lock_fd}>&-" 2>/dev/null || true
    fi

    return 0
}

#######################################
# Check if a lock is currently held
# Globals:
#   None
# Arguments:
#   $1 - Lock file path
# Returns:
#   0 if lock is held, 1 if not held
#######################################
is_locked() {
    local lock_file="$1"

    [[ ! -f "${lock_file}" ]] && return 1

    # Try to acquire lock non-blocking
    local test_fd
    for fd in {200..255}; do
        if ! { true >&"$fd"; } 2>/dev/null; then
            test_fd=$fd
            break
        fi
    done

    [[ -z "${test_fd}" ]] && return 1

    eval "exec ${test_fd}>${lock_file}" 2>/dev/null || return 1

    if flock -n "${test_fd}" 2>/dev/null; then
        # Lock was acquired, so it wasn't held
        eval "exec ${test_fd}>&-"
        return 1
    else
        # Lock is held
        eval "exec ${test_fd}>&-"
        return 0
    fi
}

