# DangerPrep System Management Module
# System control, deployment, maintenance, and hardware management

scripts_dir := "../scripts"

# System management help
help:
    @echo "🖥️  SYSTEM MANAGEMENT:"
    @echo ""

    @echo "INTELLIGENT CONTROL:"
    @echo "  auto                - Enable automatic system management"
    @echo "  manual              - Disable automatic system management"
    @echo "  diagnostics         - Run comprehensive system diagnostics"
    @echo "  optimize            - Optimize system performance"
    @echo ""
    @echo "NOTE: Deployment and hardware are now in separate modules:"
    @echo "  just deployment::help - Deployment and installation commands"
    @echo "  just hardware::help - Hardware monitoring and fan control"
    @echo ""
    @echo "MAINTENANCE:"
    @echo "  maintenance         - Run system maintenance"
    @echo "  health              - Quick system health check"
    @echo "  validate            - Validate system configuration"
    @echo "  fix-permissions     - Fix file permissions"
    @echo "  clean               - Clean up system resources"
    @echo ""
    @echo "MONITORING:"
    @echo "  monitor             - Run system monitoring"
    @echo "  monitor-continuous  - Run continuous monitoring"
    @echo "  monitor-report      - Generate monitoring report"
    @echo ""

    @echo "CERTIFICATES:"
    @echo "  certs-traefik       - Setup Traefik ACME certificates"
    @echo "  certs-step-ca       - Setup Step-CA internal certificates"

# Intelligent System Management
[group('system')]
status:
    @{{scripts_dir}}/system/manager.sh status

[group('system')]
auto:
    @{{scripts_dir}}/system/manager.sh auto

[group('system')]
manual:
    @{{scripts_dir}}/system/manager.sh manual

[group('system')]
diagnostics:
    @{{scripts_dir}}/system/helpers/diagnostics.sh all

[group('system')]
optimize:
    @{{scripts_dir}}/system/helpers/optimization.sh all

# System Monitoring (also available in monitoring module)
[group('monitoring')]
monitor:
    @{{scripts_dir}}/monitoring/manager.sh system

[group('monitoring')]
monitor-continuous:
    @{{scripts_dir}}/monitoring/manager.sh continuous

[group('monitoring')]
monitor-report:
    @{{scripts_dir}}/monitoring/manager.sh report

# Deployment commands moved to deployment module

# System Cleanup
[group('maintenance')]
clean:
    @echo "Cleaning up system resources..."
    @sudo systemctl restart k3s 2>/dev/null || echo "K3s not running"
    @sudo journalctl --vacuum-time=7d
    @sudo apt autoremove -y
    @sudo apt autoclean

# System Maintenance
[group('maintenance')]
maintenance:
    @{{scripts_dir}}/system/helpers/maintenance.sh all

[group('maintenance')]
health:
    @{{scripts_dir}}/system/helpers/maintenance.sh health

[group('maintenance')]
validate:
    @{{scripts_dir}}/system/helpers/maintenance.sh validate

[group('maintenance')]
fix-permissions:
    @{{scripts_dir}}/system/helpers/maintenance.sh permissions
