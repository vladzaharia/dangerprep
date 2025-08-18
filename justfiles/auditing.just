# DangerPrep Security Auditing Module
# Comprehensive security auditing and vulnerability scanning

scripts_dir := "../scripts"

# Auditing help
help:
    @echo "🔍 SECURITY AUDITING:"
    @echo ""
    @echo "COMPREHENSIVE:"
    @echo "  all                 - Run all security audits"
    @echo "  cron                - Security audit cron job"
    @echo ""
    @echo "SPECIFIC AUDITS:"
    @echo "  aide                - Run AIDE integrity check"
    @echo "  antivirus           - Run antivirus scan"
    @echo "  lynis               - Run Lynis security audit"
    @echo "  rootkit             - Run rootkit scan"
    @echo "  general             - Run general security audit"

# Comprehensive Auditing
[group('comprehensive')]
all:
    @{{scripts_dir}}/security/manager.sh audit-all

[group('comprehensive')]
cron:
    @{{scripts_dir}}/security/helpers/orchestrator.sh cron

# Specific Audits
[group('specific')]
aide:
    @{{scripts_dir}}/security/manager.sh audit-aide

[group('specific')]
antivirus:
    @{{scripts_dir}}/security/manager.sh audit-antivirus

[group('specific')]
lynis:
    @{{scripts_dir}}/security/manager.sh audit-lynis

[group('specific')]
rootkit:
    @{{scripts_dir}}/security/manager.sh audit-rootkit

[group('specific')]
general:
    @{{scripts_dir}}/security/manager.sh audit-general
