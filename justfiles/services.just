# DangerPrep Services Module
# Service lifecycle management (start, stop, restart, status)

scripts_dir := "../scripts"

# Services help
help:
    @echo "⚙️  SERVICE MANAGEMENT:"
    @echo ""
    @echo "LIFECYCLE:"
    @echo "  start               - Start all DangerPrep services"
    @echo "  stop                - Stop all DangerPrep services"
    @echo "  restart             - Restart all DangerPrep services"
    @echo "  status              - Show service status"

# Service Lifecycle Management
[group('services')]
start:
    @{{scripts_dir}}/service/start.sh

[group('services')]
stop:
    @{{scripts_dir}}/service/stop.sh

[group('services')]
restart:
    @echo "Restarting DangerPrep services..."
    @{{scripts_dir}}/service/stop.sh
    @sleep 5
    @{{scripts_dir}}/service/start.sh

[group('services')]
status:
    @{{scripts_dir}}/service/status.sh
