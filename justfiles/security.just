# DangerPrep Security Management Module
# Security management, auditing, certificates, and monitoring

scripts_dir := "../scripts"

# Security management help
help:
    @echo "🔒 SECURITY MANAGEMENT:"
    @echo ""
    @echo "OVERVIEW:"
    @echo "  status              - Show comprehensive security status"
    @echo "  diagnostics         - Security diagnostics and validation"
    @echo ""
    @echo "SECRET MANAGEMENT:"
    @echo "  secrets-setup       - Set up secret management"
    @echo "  secrets-generate    - Generate new secrets"
    @echo "  secrets-update      - Update existing secrets"
    @echo ""
    @echo "NOTE: Auditing and certificates are now in separate modules:"
    @echo "  just auditing::help - Security auditing commands"
    @echo "  just certificates::help - Certificate management"
    @echo ""
    @echo "SECURITY MONITORING:"
    @echo "  monitor-suricata    - Monitor Suricata IDS"
    @echo "  monitor-status      - Show security monitoring status"

# Main Security Status and Overview
[group('security')]
status:
    @{{scripts_dir}}/security/manager.sh status

[group('security')]
diagnostics:
    @{{scripts_dir}}/security/manager.sh diagnostics

# Secret Management
[group('secrets')]
secrets-setup:
    @{{scripts_dir}}/security/manager.sh secrets-setup

[group('secrets')]
secrets-generate:
    @{{scripts_dir}}/security/manager.sh secrets-generate

[group('secrets')]
secrets-update:
    @{{scripts_dir}}/security/manager.sh secrets-update

# Auditing commands moved to auditing module
# Certificate commands moved to certificates module

# Security Monitoring
[group('monitoring')]
monitor-suricata:
    @{{scripts_dir}}/security/manager.sh monitor-suricata

[group('monitoring')]
monitor-status:
    @{{scripts_dir}}/security/manager.sh monitor-status
