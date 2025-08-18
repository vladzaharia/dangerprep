#!/usr/bin/env bash
# DangerPrep Security Functions Library
# Common security utilities and functions for security scripts
# Author: DangerPrep Project
# Version: 1.0

# Prevent multiple sourcing
if [[ "${SECURITY_FUNCTIONS_LOADED:-}" == "true" ]]; then
    return 0
fi
readonly SECURITY_FUNCTIONS_LOADED="true"

# Security configuration
SECURITY_STATE_DIR="/var/lib/dangerprep/security"
readonly SECURITY_LOG_DIR="/var/log/dangerprep"
SECRETS_DIR="/opt/dangerprep/secrets"

# Ensure security directories exist
ensure_security_directories() {
    local dirs=(
        "$SECURITY_STATE_DIR"
        "$SECURITY_LOG_DIR"
        "$SECRETS_DIR"
        "/var/quarantine"
    )
    
    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir" 2>/dev/null || true
            chmod 700 "$dir" 2>/dev/null || true
        fi
    done
}

# Generate secure random password
generate_secure_password() {
    local length="${1:-32}"
    local charset="${2:-alphanumeric}"
    
    case "$charset" in
        "alphanumeric")
            openssl rand -base64 "$((length * 3 / 4))" | tr -d "=+/" | cut -c1-"$length"
            ;;
        "hex")
            openssl rand -hex "$((length / 2))"
            ;;
        "strong")
            openssl rand -base64 "$((length * 3 / 4))" | tr -d "=+/" | head -c "$length"
            ;;
        *)
            error "Unknown charset: $charset"
            return 1
            ;;
    esac
}

# Generate secure random string for secrets
generate_secret() {
    local secret_type="$1"
    local length="${2:-32}"
    
    case "$secret_type" in
        "password")
            generate_secure_password "$length" "strong"
            ;;
        "api_key")
            generate_secure_password 64 "alphanumeric"
            ;;
        "jwt_secret")
            generate_secure_password 64 "hex"
            ;;
        "session_secret")
            generate_secure_password 32 "hex"
            ;;
        "auth_key")
            generate_secure_password 32 "hex"
            ;;
        *)
            generate_secure_password "$length" "alphanumeric"
            ;;
    esac
}

# Validate password strength
validate_password_strength() {
    local password="$1"
    local min_length="${2:-12}"
    
    local score=0
    local issues=()
    
    # Check length
    if [[ ${#password} -lt $min_length ]]; then
        issues+=("Password too short (minimum $min_length characters)")
    else
        ((score += 1))
    fi
    
    # Check for lowercase
    if [[ "$password" =~ [a-z] ]]; then
        ((score += 1))
    else
        issues+=("Missing lowercase letters")
    fi
    
    # Check for uppercase
    if [[ "$password" =~ [A-Z] ]]; then
        ((score += 1))
    else
        issues+=("Missing uppercase letters")
    fi
    
    # Check for numbers
    if [[ "$password" =~ [0-9] ]]; then
        ((score += 1))
    else
        issues+=("Missing numbers")
    fi
    
    # Check for special characters
    if [[ "$password" =~ [^a-zA-Z0-9] ]]; then
        ((score += 1))
    else
        issues+=("Missing special characters")
    fi
    
    # Return score and issues
    if [[ $score -ge 4 ]]; then
        return 0  # Strong password
    else
        for issue in "${issues[@]}"; do
            warning "Password weakness: $issue"
        done
        return 1  # Weak password
    fi
}

# Secure file operations
secure_write_file() {
    local file_path="$1"
    local content="$2"
    local permissions="${3:-600}"
    
    # Create directory if needed
    local dir_path
    dir_path="$(dirname "$file_path")"
    mkdir -p "$dir_path"
    
    # Write content securely
    local temp_file
    temp_file="$(mktemp)"
    echo "$content" > "$temp_file"
    chmod "$permissions" "$temp_file"
    mv "$temp_file" "$file_path"
    
    # Verify permissions
    chmod "$permissions" "$file_path"
}

# Read secret from file
read_secret_file() {
    local secret_file="$1"
    
    if [[ ! -f "$secret_file" ]]; then
        error "Secret file not found: $secret_file"
        return 1
    fi
    
    # Check file permissions
    local file_perms
    file_perms="$(stat -c "%a" "$secret_file")"
    if [[ "$file_perms" != "600" && "$file_perms" != "400" ]]; then
        warning "Insecure permissions on secret file: $secret_file ($file_perms)"
    fi
    
    cat "$secret_file"
}

# Check if service is security-critical
is_security_critical_service() {
    local service_name="$1"
    
    local critical_services=(
        "ssh"
        "sshd"
        "fail2ban"
        "ufw"
        "iptables"
        "firewalld"
        "apparmor"
        "selinux"
        "auditd"
        "rsyslog"
        "systemd-logind"
    )
    
    for critical_service in "${critical_services[@]}"; do
        if [[ "$service_name" == "$critical_service" ]]; then
            return 0
        fi
    done
    
    return 1
}

# Check if port is considered dangerous
is_dangerous_port() {
    local port="$1"
    
    local dangerous_ports=(
        "23"    # Telnet
        "513"   # rlogin
        "514"   # rsh
        "515"   # LPD
        "79"    # Finger
        "111"   # RPC
        "135"   # RPC
        "139"   # NetBIOS
        "445"   # SMB
        "1433"  # MSSQL
        "3389"  # RDP
    )
    
    for dangerous_port in "${dangerous_ports[@]}"; do
        if [[ "$port" == "$dangerous_port" ]]; then
            return 0
        fi
    done
    
    return 1
}

# Get security tool status
get_security_tool_status() {
    local tool="$1"
    
    case "$tool" in
        "aide")
            if command -v aide >/dev/null 2>&1; then
                if [[ -f "/var/lib/aide/aide.db" ]]; then
                    echo "installed_configured"
                else
                    echo "installed_not_configured"
                fi
            else
                echo "not_installed"
            fi
            ;;
        "clamav")
            if command -v clamscan >/dev/null 2>&1; then
                if [[ -d "/var/lib/clamav" ]] && [[ -n "$(find /var/lib/clamav -name "*.cvd" -o -name "*.cld" 2>/dev/null)" ]]; then
                    echo "installed_configured"
                else
                    echo "installed_not_configured"
                fi
            else
                echo "not_installed"
            fi
            ;;
        "lynis")
            if command -v lynis >/dev/null 2>&1; then
                echo "installed_configured"
            else
                echo "not_installed"
            fi
            ;;
        "rkhunter")
            if command -v rkhunter >/dev/null 2>&1; then
                if [[ -f "/var/lib/rkhunter/db/rkhunter.dat" ]]; then
                    echo "installed_configured"
                else
                    echo "installed_not_configured"
                fi
            else
                echo "not_installed"
            fi
            ;;
        "chkrootkit")
            if command -v chkrootkit >/dev/null 2>&1; then
                echo "installed_configured"
            else
                echo "not_installed"
            fi
            ;;
        "fail2ban")
            if systemctl is-active fail2ban >/dev/null 2>&1; then
                echo "active"
            elif systemctl is-enabled fail2ban >/dev/null 2>&1; then
                echo "enabled_not_active"
            elif command -v fail2ban-server >/dev/null 2>&1; then
                echo "installed_not_enabled"
            else
                echo "not_installed"
            fi
            ;;
        *)
            echo "unknown_tool"
            return 1
            ;;
    esac
}

# Calculate security score
calculate_security_score() {
    local total_score=0
    local max_score=0
    
    # Security tools (40 points max)
    local security_tools=("aide" "clamav" "lynis" "rkhunter" "fail2ban")
    for tool in "${security_tools[@]}"; do
        local status
        status="$(get_security_tool_status "$tool")"
        case "$status" in
            "installed_configured"|"active")
                ((total_score += 8))
                ;;
            "installed_not_configured"|"enabled_not_active")
                ((total_score += 4))
                ;;
            "installed_not_enabled")
                ((total_score += 2))
                ;;
        esac
        ((max_score += 8))
    done
    
    # Firewall status (20 points max)
    if command -v ufw >/dev/null 2>&1; then
        local ufw_status
        ufw_status="$(ufw status | head -1)"
        if echo "$ufw_status" | grep -q "active"; then
            ((total_score += 20))
        fi
    elif command -v iptables >/dev/null 2>&1; then
        local iptables_rules
        iptables_rules="$(iptables -L | wc -l)"
        if [[ "$iptables_rules" -gt 10 ]]; then
            ((total_score += 20))
        fi
    fi
    ((max_score += 20))
    
    # SSH security (20 points max)
    if [[ -f "/etc/ssh/sshd_config" ]]; then
        # Root login disabled
        if ! grep -q "^PermitRootLogin yes" /etc/ssh/sshd_config 2>/dev/null; then
            ((total_score += 10))
        fi
        # Empty passwords disabled
        if ! grep -q "^PermitEmptyPasswords yes" /etc/ssh/sshd_config 2>/dev/null; then
            ((total_score += 10))
        fi
    fi
    ((max_score += 20))
    
    # File permissions (20 points max)
    local permission_score=0
    if [[ "$(stat -c "%a" /etc/passwd 2>/dev/null)" == "644" ]]; then
        ((permission_score += 5))
    fi
    if [[ "$(stat -c "%a" /etc/shadow 2>/dev/null)" == "640" ]]; then
        ((permission_score += 5))
    fi
    if [[ "$(stat -c "%a" /tmp 2>/dev/null)" == "1777" ]]; then
        ((permission_score += 5))
    fi
    if [[ "$(stat -c "%a" /var/tmp 2>/dev/null)" == "1777" ]]; then
        ((permission_score += 5))
    fi
    ((total_score += permission_score))
    ((max_score += 20))
    
    # Calculate percentage
    local percentage
    if [[ $max_score -gt 0 ]]; then
        percentage=$((total_score * 100 / max_score))
    else
        percentage=0
    fi
    
    echo "$percentage"
}

# Initialize security functions
ensure_security_directories
