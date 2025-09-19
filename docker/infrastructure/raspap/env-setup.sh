#!/bin/bash
declare -A aliases=(
    [RASPAP_SSID]=RASPAP_hostapd_ssid
    [RASPAP_SSID_PASS]=RASPAP_hostapd_wpa_passphrase
    [RASPAP_COUNTRY]=RASPAP_hostapd_country_code
)

# Files that follow a predictable key=value format
declare -A conf_files=(
    [raspap]=/etc/dnsmasq.d/090_raspap.conf
    [wlan0]=/etc/dnsmasq.d/090_wlan0.conf
    [hostapd]=/etc/hostapd/hostapd.conf
)

raspap_auth=/etc/raspap/raspap.auth
lighttpd_conf=/etc/lighttpd/lighttpd.conf

password_generator=/home/password-generator.php

function main() {
    alias_env_vars
    update_webgui_auth $RASPAP_WEBGUI_USER $RASPAP_WEBGUI_PASS
    update_webgui_port $RASPAP_WEBGUI_PORT
    update_confs
    configure_dhcp
}

function alias_env_vars() {
    for alias in "${!aliases[@]}"
    do
        if [ ! -z "${!alias}" ]
        then
            declare -g ${aliases[$alias]}="${!alias}"
            export ${aliases[$alias]}
        fi
    done
}

# $1 - Username
# $2 - Password
function update_webgui_auth() {
    declare user=$1
    declare pass=$2

    # Ensure directory exists
    mkdir -p "$(dirname "$raspap_auth")"

    if ! [ -f $raspap_auth ]
    then
        # If the raspap.auth file doesn't exist, create it with default values
        default_user=admin
        if command -v php >/dev/null 2>&1; then
            default_pass=$(php ${password_generator} secret)
        else
            # Fallback if PHP is not available
            default_pass="admin"
        fi

        echo "$default_user" > "$raspap_auth"
        echo "$default_pass" >> "$raspap_auth"
        # Only change ownership if www-data user exists
        if id "www-data" >/dev/null 2>&1; then
            chown www-data:www-data $raspap_auth
        fi
    fi

    if [ -z $user ]
    then
        # If no user var is set, keep the existing user value
        user=$(head $raspap_auth -n+1)
    fi

    if [ -z "${pass}" ]
    then
        # If no password var is set, keep the existing password value
        pass=$(tail $raspap_auth -n+2)
    else
        # Hash password if PHP is available
        if command -v php >/dev/null 2>&1; then
            pass=$(php /home/password-generator.php ${pass})
        else
            # Use plain text password as fallback
            echo "Warning: PHP not available, using plain text password"
        fi
    fi

    echo "$user" > "$raspap_auth"
    echo "$pass" >> "$raspap_auth"
}

# $1 - Port
function update_webgui_port() {
    port=$1

    if [ -z "${port}" ]
    then
        # Only update if env var is set
        return
    fi

    # Ensure lighttpd config exists
    mkdir -p "$(dirname "$lighttpd_conf")"
    if [ ! -f "$lighttpd_conf" ]; then
        # Create basic lighttpd config if it doesn't exist
        cat > "$lighttpd_conf" << EOF
server.port                 = 80
server.document-root        = "/var/www/html"
server.username             = "www-data"
server.groupname            = "www-data"
EOF
    fi

    old="server.port                 = [0-9]*"
    new="server.port                 = ${port}"
    sed -i "s/$old/$new/g" "${lighttpd_conf}" 2>/dev/null || echo "Warning: Could not update lighttpd port"
}

update_confs() {
    for conf in "${!conf_files[@]}"
    do
        path=${conf_files[$conf]}
        prefix=RASPAP_${conf}_
        vars=$(get_prefixed_env_vars ${prefix})
        for var in ${vars}
        do
            key=${var#"$prefix"}
            replace_in_conf $key ${!var} $path
        done
    done
}

# $1 - Prefix
function get_prefixed_env_vars() {
    prefix=$1
    matches=$(printenv | grep -o "${prefix}[^=]*")
    echo $matches
}

# $1 - Target key
# $2 - New value
# $3 - conf path
function replace_in_conf() {
    key=$1
    val=$2
    path=$3

    # Ensure directory and file exist
    mkdir -p "$(dirname "$path")"
    touch "$path"

    old="$key"=".*"
    new="$key"="$val"

    if [ -z "$(grep "$old" "$path" 2>/dev/null)" ]
    then
        # Add value
        echo "$new" >> "$path"
    else
        # Value exists in conf
        sed -i "s/$old/$new/g" "$path" 2>/dev/null || echo "$new" >> "$path"
    fi
}

# Configure DHCP settings for dnsmasq
configure_dhcp() {
    # Only configure DHCP if required environment variables are set
    if [[ -n "${RASPAP_DHCP_START:-}" ]] && [[ -n "${RASPAP_DHCP_END:-}" ]]; then
        echo "Configuring DHCP settings..."

        local dhcp_conf="/etc/dnsmasq.d/092_dhcp.conf"
        local interface="${RASPAP_WIFI_INTERFACE:-wlan0}"
        local lease_time="${RASPAP_DHCP_LEASE:-24h}"
        local gateway="${RASPAP_IP_ADDRESS:-192.168.120.1}"
        local netmask="${RASPAP_NETMASK:-255.255.252.0}"

        # Ensure directory exists
        mkdir -p "$(dirname "$dhcp_conf")"

        # Create DHCP configuration
        cat > "$dhcp_conf" << EOF
# DHCP Configuration for DangerPrep
# Interface to serve DHCP on
interface=${interface}

# DHCP range and lease time
dhcp-range=${RASPAP_DHCP_START},${RASPAP_DHCP_END},${netmask},${lease_time}

# Gateway (option 3)
dhcp-option=3,${gateway}

# DNS servers (option 6) - point to this device
dhcp-option=6,${gateway}

# Enable DHCP authoritative mode
dhcp-authoritative

# Disable DNS for DHCP clients that don't provide a hostname
dhcp-ignore-names

# Log DHCP transactions
log-dhcp
EOF

        echo "DHCP configured: ${RASPAP_DHCP_START} - ${RASPAP_DHCP_END} on ${interface}"
    else
        echo "DHCP environment variables not set, skipping DHCP configuration"
    fi
}

main