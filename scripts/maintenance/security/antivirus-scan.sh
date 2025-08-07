#!/bin/bash
# DangerPrep antivirus scan

SCAN_LOG="/var/log/clamav-scan.log"
SCAN_DIRS="/home /etc /usr/local/bin /opt/dangerprep"

echo "[$(date)] Starting antivirus scan..." >> "$SCAN_LOG"

for dir in $SCAN_DIRS; do
    if [[ -d "$dir" ]]; then
        echo "[$(date)] Scanning $dir..." >> "$SCAN_LOG"
        clamscan -r --infected --log="$SCAN_LOG" "$dir" || true
    fi
done

echo "[$(date)] Antivirus scan completed" >> "$SCAN_LOG"
