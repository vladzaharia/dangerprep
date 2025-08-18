# DangerPrep Deployment Scenarios
# Different deployment modes for various network situations

# Scenario help
help:
    @echo "🛜 NETWORKING SCENARIOS:"
    @echo "  router      - Quick setup: ethernet → WiFi hotspot"
    @echo "  repeater    - Quick setup: WiFi repeater mode"
    @echo "  local       - Quick setup: local network (no internet)"
    @echo ""
    @echo "These scenarios configure the system for different network situations."

# Quick router setup (WAN ethernet → WiFi hotspot)
[group('scenarios')]
router:
    @echo "🛜 Setting up router mode (ethernet → WiFi hotspot)..."
    @just start
    @just network::wan-to-wifi
    @just status

# Quick WiFi repeater setup
[group('scenarios')]
repeater:
    @echo "🛜 Setting up WiFi repeater mode..."
    @just start
    @just network::wifi-repeater
    @just status

# Local network only (no internet)
[group('scenarios')]
local:
    @echo "🛜 Setting up local-only network mode..."
    @just start
    @just network::local-only
    @just status
