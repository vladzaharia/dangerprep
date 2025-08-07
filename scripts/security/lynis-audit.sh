#!/bin/bash
# DangerPrep security audit with Lynis

AUDIT_LOG="/var/log/lynis-audit.log"
AUDIT_REPORT="/tmp/lynis-report-$(date +%Y%m%d-%H%M%S).txt"

echo "[$(date)] Starting security audit..." >> "$AUDIT_LOG"

lynis audit system --quick --log-file "$AUDIT_REPORT" >> "$AUDIT_LOG" 2>&1

echo "[$(date)] Security audit completed. Report: $AUDIT_REPORT" >> "$AUDIT_LOG"

# Clean up old reports (keep last 3 months)
find /tmp -name "lynis-report-*.txt" -mtime +90 -delete 2>/dev/null || true
