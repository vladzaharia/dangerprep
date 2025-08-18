# DangerPrep Hardware Management Module
# Hardware monitoring, fan control, and platform-specific features

scripts_dir := "../scripts"

# Hardware help
help:
    @echo "🔧 HARDWARE MANAGEMENT:"
    @echo ""
    @echo "MONITORING:"
    @echo "  monitor [cmd]       - Hardware monitoring (check/report/friendlyelec)"
    @echo "  report              - Generate comprehensive hardware report"
    @echo "  friendlyelec        - FriendlyElec-specific hardware monitoring"
    @echo ""
    @echo "FAN CONTROL (Linux only):"
    @echo "  fan-start           - Start cooling fan"
    @echo "  fan-stop            - Stop cooling fan"
    @echo "  fan-status          - Check cooling fan status"
    @echo "  fan-test            - Test cooling fan"

# Hardware Monitoring (also available in monitoring module)
[group('monitoring')]
monitor cmd="check":
    @{{scripts_dir}}/monitoring/manager.sh hardware {{cmd}}

[group('monitoring')]
report:
    @{{scripts_dir}}/monitoring/manager.sh hardware report

[group('monitoring')]
[linux]
friendlyelec:
    @{{scripts_dir}}/monitoring/manager.sh hardware friendlyelec

# Fan Control (RK3588 specific)
[group('fan')]
[linux]
fan-start:
    @{{scripts_dir}}/system/fan.sh start

[group('fan')]
[linux]
fan-stop:
    @{{scripts_dir}}/system/fan.sh stop

[group('fan')]
[linux]
fan-status:
    @{{scripts_dir}}/system/fan.sh status

[group('fan')]
[linux]
fan-test:
    @{{scripts_dir}}/system/fan.sh test
