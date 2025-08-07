#!/bin/bash
# DangerPrep Suricata IDS Monitoring

LOG_FILE="/var/log/suricata/eve.json"
ALERT_LOG="/var/log/dangerprep-suricata-alerts.log"

if [[ -f "$LOG_FILE" ]]; then
    # Check for recent alerts (last hour)
    recent_alerts=$(tail -1000 "$LOG_FILE" | jq -r 'select(.event_type=="alert") | select(.timestamp > (now - 3600 | strftime("%Y-%m-%dT%H:%M:%S"))) | .alert.signature' 2>/dev/null | wc -l)

    if [[ $recent_alerts -gt 0 ]]; then
        echo "[$(date)] $recent_alerts new IDS alerts detected" >> "$ALERT_LOG"
        logger -t "SURICATA-ALERT" -p security.warning "$recent_alerts new IDS alerts detected"
    fi
fi
