# DangerPrep Network Diagnostics Module
# Network diagnostics and connectivity testing

scripts_dir := "../scripts"

# Diagnostics help
help:
    @echo "🔍 NETWORK DIAGNOSTICS:"
    @echo ""
    @echo "COMPREHENSIVE:"
    @echo "  all                 - Run all network diagnostics"
    @echo ""
    @echo "SPECIFIC TESTS:"
    @echo "  connectivity        - Test internet connectivity"
    @echo "  interfaces          - Show network interface status"
    @echo "  dns                 - Test DNS resolution"
    @echo "  wifi                - WiFi diagnostics and scanning"
    @echo "  speed               - Basic network speed test"

# Comprehensive Diagnostics
[group('comprehensive')]
all:
    @{{scripts_dir}}/network/manager.sh diagnostics all

# Specific Tests
[group('tests')]
connectivity:
    @{{scripts_dir}}/network/manager.sh diagnostics connectivity

[group('tests')]
interfaces:
    @{{scripts_dir}}/network/manager.sh diagnostics interfaces

[group('tests')]
dns:
    @{{scripts_dir}}/network/manager.sh diagnostics dns

[group('tests')]
wifi:
    @{{scripts_dir}}/network/manager.sh diagnostics wifi

[group('tests')]
speed:
    @{{scripts_dir}}/network/manager.sh diagnostics speed
