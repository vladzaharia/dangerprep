#!/bin/bash
# DangerPrep rootkit scan

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

show_banner_with_title "Rootkit Scan" "security"
echo

SCAN_LOG="/var/log/rkhunter-scan.log"

echo "[$(date)] Starting rootkit scan..." >> "$SCAN_LOG"

rkhunter --check --skip-keypress --report-warnings-only >> "$SCAN_LOG" 2>&1

echo "[$(date)] Rootkit scan completed" >> "$SCAN_LOG"
