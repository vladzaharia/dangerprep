# DangerPrep Certificate Management Module
# SSL/TLS certificate management and operations

scripts_dir := "../scripts"

# Certificate management help
help:
    @echo "🔐 CERTIFICATE MANAGEMENT:"
    @echo ""
    @echo "OPERATIONS:"
    @echo "  status              - Show certificate status"
    @echo "  generate            - Generate new certificates"
    @echo "  renew               - Renew certificates"
    @echo "  validate            - Validate certificates"

# Certificate Operations
[group('operations')]
status:
    @{{scripts_dir}}/security/manager.sh certs-status

[group('operations')]
generate:
    @{{scripts_dir}}/security/manager.sh certs-generate

[group('operations')]
renew:
    @{{scripts_dir}}/security/manager.sh certs-renew

[group('operations')]
validate:
    @{{scripts_dir}}/security/manager.sh certs-validate
