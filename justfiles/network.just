# DangerPrep Network Management Module
# Intelligent network management with automatic mode switching

scripts_dir := "../scripts"

# Network management help
help:
    @echo "🌐 NETWORK MANAGEMENT:"
    @echo ""
    @echo "INTELLIGENT CONTROL:"
    @echo "  status              - Show comprehensive network status"
    @echo "  auto                - Enable automatic network management"
    @echo "  manual              - Disable automatic network management"
    @echo "  evaluate            - Force network re-evaluation"
    @echo ""
    @echo "NOTE: WiFi, WAN, and diagnostics are now in separate modules:"
    @echo "  just wifi::help     - WiFi management commands"
    @echo "  just wan::help      - WAN interface management"
    @echo "  just diagnostics::help - Network diagnostics"
    @echo ""
    @echo "FIREWALL & QOS:"
    @echo "  fw-status           - Show firewall status"
    @echo "  fw-reset            - Reset firewall to defaults"
    @echo "  fw-port-forward <port> <target> - Add port forwarding"
    @echo "  qos-setup           - Setup QoS traffic shaping"
    @echo "  qos-status          - Show QoS status"

# Intelligent Network Management
[group('network')]
status:
    @{{scripts_dir}}/network/manager.sh status

[group('network')]
auto:
    @sudo {{scripts_dir}}/network/manager.sh auto

[group('network')]
manual:
    @sudo {{scripts_dir}}/network/manager.sh manual

[group('network')]
evaluate:
    @sudo {{scripts_dir}}/network/manager.sh evaluate

# Firewall Management
[group('firewall')]
fw-status:
    @echo "Firewall status..."
    @{{scripts_dir}}/network/firewall.sh status

[group('firewall')]
fw-reset:
    @echo "Resetting firewall to defaults..."
    @sudo {{scripts_dir}}/network/firewall.sh reset

[group('firewall')]
fw-port-forward port target:
    @echo "Adding port forwarding {{port}} → {{target}}..."
    @sudo {{scripts_dir}}/network/firewall.sh port-forward {{port}} {{target}}

# QoS Management
[group('qos')]
qos-setup:
    @sudo {{scripts_dir}}/network/qos.sh setup

[group('qos')]
qos-status:
    @{{scripts_dir}}/network/qos.sh status

# Routing Management
[group('routing')]
route-start *args:
    @echo "Starting dynamic routing..."
    @sudo {{scripts_dir}}/network/helpers/routes.sh start {{args}}

[group('routing')]
route-stop:
    @echo "Stopping routing..."
    @sudo {{scripts_dir}}/network/helpers/routes.sh stop

[group('routing')]
route-status:
    @echo "Checking routing status..."
    @{{scripts_dir}}/network/helpers/routes.sh status

[group('routing')]
route-restart *args:
    @echo "Restarting routing..."
    @sudo {{scripts_dir}}/network/helpers/routes.sh restart {{args}}
