# DangerPrep WAN Management Module
# WAN interface management with multiple WAN support

scripts_dir := "../scripts"

# WAN management help
help:
    @echo "🌐 WAN MANAGEMENT:"
    @echo ""
    @echo "INTERFACE MANAGEMENT:"
    @echo "  list                - List available network interfaces"
    @echo "  set <if> [pri]      - Set WAN interface (primary/secondary/available)"
    @echo "  clear [if]          - Clear WAN interface designation"
    @echo ""
    @echo "STATUS & MONITORING:"
    @echo "  status              - Show WAN/LAN configuration"
    @echo "  details             - Show detailed WAN configuration"

# Interface Management
[group('interfaces')]
list:
    @echo "Listing available interfaces..."
    @{{scripts_dir}}/network/manager.sh list-interfaces

[group('interfaces')]
set interface priority="primary":
    @echo "Setting {{interface}} as {{priority}} WAN interface..."
    @sudo {{scripts_dir}}/network/manager.sh set-wan {{interface}} {{priority}}

[group('interfaces')]
clear interface="":
    @echo "Clearing WAN interface designation..."
    @sudo {{scripts_dir}}/network/manager.sh clear-wan {{interface}}

# Status & Monitoring
[group('status')]
status:
    @echo "Current WAN configuration..."
    @{{scripts_dir}}/network/manager.sh query wan-all

[group('status')]
details:
    @echo "Detailed WAN configuration..."
    @{{scripts_dir}}/network/manager.sh show-wan-details
