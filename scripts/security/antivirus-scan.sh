#!/bin/bash
# DangerPrep antivirus scan

# Source shared banner utility
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../shared/banner.sh"

SCAN_LOG="/var/log/clamav-scan.log"
SCAN_DIRS="/home /etc /usr/local/bin /opt/dangerprep"

show_banner_with_title "Antivirus Scan" "security"
echo

echo "[$(date)] Starting antivirus scan..." >> "$SCAN_LOG"

for dir in $SCAN_DIRS; do
    if [[ -d "$dir" ]]; then
        echo "[$(date)] Scanning $dir..." >> "$SCAN_LOG"
        clamscan -r --infected --log="$SCAN_LOG" "$dir" || true
    fi
done

echo "[$(date)] Antivirus scan completed" >> "$SCAN_LOG"
