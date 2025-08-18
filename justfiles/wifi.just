# DangerPrep WiFi Management Module
# WiFi scanning, connection, access point, and repeater management

scripts_dir := "../scripts"

# WiFi management help
help:
    @echo "📶 WIFI MANAGEMENT:"
    @echo ""
    @echo "SCANNING & CONNECTION:"
    @echo "  scan                - Scan for WiFi networks"
    @echo "  connect <ssid> <pass> [if] - Connect to WiFi (auto-WAN enabled)"
    @echo "  disconnect [if]     - Disconnect from WiFi"
    @echo "  status              - Show WiFi interface status"
    @echo ""
    @echo "ACCESS POINT:"
    @echo "  ap <ssid> <pass>    - Create WiFi access point"
    @echo ""
    @echo "REPEATER MODE:"
    @echo "  repeater-start <ssid> <pass> [if] - Start WiFi repeater"
    @echo "  repeater-stop [if]  - Stop WiFi repeater"

# WiFi Scanning & Connection
[group('connection')]
scan:
    @echo "Scanning for WiFi networks..."
    @{{scripts_dir}}/network/manager.sh wifi-scan

[group('connection')]
connect ssid password interface="wlan0":
    @echo "Connecting to WiFi network {{ssid}} (auto-WAN enabled)..."
    @sudo {{scripts_dir}}/network/manager.sh wifi-connect "{{ssid}}" "{{password}}" "{{interface}}"

[group('connection')]
disconnect interface="wlan0":
    @echo "Disconnecting from WiFi..."
    @sudo {{scripts_dir}}/network/manager.sh wifi-disconnect "{{interface}}"

[group('connection')]
status:
    @echo "WiFi interface status..."
    @{{scripts_dir}}/network/manager.sh wifi-status

# Access Point
[group('access-point')]
ap ssid password:
    @echo "Creating WiFi access point {{ssid}}..."
    @sudo {{scripts_dir}}/network/manager.sh wifi-ap "{{ssid}}" "{{password}}"

# Repeater Mode
[group('repeater')]
repeater-start ssid password interface="wlan0":
    @echo "Starting WiFi repeater for {{ssid}}..."
    @sudo {{scripts_dir}}/network/manager.sh wifi-repeater-start "{{ssid}}" "{{password}}" "{{interface}}"

[group('repeater')]
repeater-stop interface="wlan0":
    @echo "Stopping WiFi repeater..."
    @sudo {{scripts_dir}}/network/manager.sh wifi-repeater-stop "{{interface}}"
