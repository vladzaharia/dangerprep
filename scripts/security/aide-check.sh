#!/bin/bash
# DangerPrep AIDE integrity check

LOG_FILE="/var/log/aide-check.log"
AIDE_REPORT="/tmp/aide-report-$(date +%Y%m%d-%H%M%S).txt"

echo "[$(date)] Starting AIDE integrity check..." >> "$LOG_FILE"

if aide --check > "$AIDE_REPORT" 2>&1; then
    echo "[$(date)] AIDE check completed - no changes detected" >> "$LOG_FILE"
else
    echo "[$(date)] AIDE check detected changes:" >> "$LOG_FILE"
    cat "$AIDE_REPORT" >> "$LOG_FILE"

    # Alert about changes (could integrate with monitoring system)
    echo "AIDE detected file system changes on $(hostname)" | \
        logger -t "AIDE-ALERT" -p security.warning
fi

# Clean up old reports (keep last 7 days)
find /tmp -name "aide-report-*.txt" -mtime +7 -delete 2>/dev/null || true
