#!/bin/bash
# DangerPrep rootkit scan

SCAN_LOG="/var/log/rkhunter-scan.log"

echo "[$(date)] Starting rootkit scan..." >> "$SCAN_LOG"

rkhunter --check --skip-keypress --report-warnings-only >> "$SCAN_LOG" 2>&1

echo "[$(date)] Rootkit scan completed" >> "$SCAN_LOG"
