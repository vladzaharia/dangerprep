# DangerPrep Monitoring Module
# System monitoring, hardware monitoring, and diagnostics

scripts_dir := "../scripts"

# Monitoring help
help:
    @echo "📊 MONITORING & DIAGNOSTICS:"
    @echo ""
    @echo "SYSTEM MONITORING:"
    @echo "  all                 - Run all monitoring checks"
    @echo "  system              - Run system monitoring"
    @echo "  continuous          - Run continuous monitoring"
    @echo "  report              - Generate monitoring report"
    @echo ""
    @echo "HARDWARE MONITORING:"
    @echo "  hardware [cmd]      - Hardware monitoring (check/report/friendlyelec)"
    @echo "  hardware-report     - Generate comprehensive hardware report"
    @echo "  hardware-friendlyelec - FriendlyElec-specific hardware monitoring"
    @echo ""
    @echo "HEALTH CHECKS:"
    @echo "  health              - Quick system health check"
    @echo ""
    @echo "LOGS & PLATFORM:"
    @echo "  logs                - Show recent service logs"
    @echo "  olares              - Show Olares/K3s status"

# System Monitoring
[group('system')]
all:
    @{{scripts_dir}}/monitoring/manager.sh all

[group('system')]
system:
    @{{scripts_dir}}/monitoring/manager.sh system

[group('system')]
continuous:
    @{{scripts_dir}}/monitoring/manager.sh continuous

[group('system')]
report:
    @{{scripts_dir}}/monitoring/manager.sh report

# Hardware Monitoring (also available in hardware module)
[group('hardware')]
hardware cmd="check":
    @{{scripts_dir}}/monitoring/manager.sh hardware {{cmd}}

[group('hardware')]
hardware-report:
    @{{scripts_dir}}/monitoring/manager.sh hardware report

[group('hardware')]
[linux]
hardware-friendlyelec:
    @{{scripts_dir}}/monitoring/manager.sh hardware friendlyelec

# Health Checks
[group('health')]
health:
    @echo "🏥 System health check..."
    @just system::status
    @echo ""
    @just network::connectivity
    @echo ""
    @just monitoring::hardware check

# System Logs
[group('logs')]
logs:
    #!/usr/bin/env bash
    echo "Recent service logs:"
    echo "==================="
    echo "K3s logs:"
    sudo journalctl -u k3s --no-pager -n 20 2>/dev/null || echo "K3s not running"
    echo ""
    echo "AdGuard Home logs:"
    sudo journalctl -u adguardhome --no-pager -n 20 2>/dev/null || echo "AdGuard Home not running"
    echo ""
    echo "Step-CA logs:"
    sudo journalctl -u step-ca --no-pager -n 20 2>/dev/null || echo "Step-CA not running"
    echo ""
    echo "Tailscale logs:"
    sudo journalctl -u tailscaled --no-pager -n 20 2>/dev/null || echo "Tailscale not running"

# Olares/K3s Status
[group('platform')]
olares:
    @echo "Olares/K3s Status:"
    @echo "=================="
    @kubectl get nodes 2>/dev/null || echo "K3s not running"
    @echo ""
    @kubectl get pods --all-namespaces 2>/dev/null || echo "No pods found"
