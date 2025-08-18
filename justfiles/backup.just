# DangerPrep Backup Management Module
# Backup creation, restoration, verification, and cleanup

scripts_dir := "../scripts"

# Backup management help
help:
    @echo "💾 BACKUP MANAGEMENT:"
    @echo ""
    @echo "BACKUP CREATION:"
    @echo "  create [type]       - Create backup (basic/encrypted/full)"
    @echo "  daily               - Create daily encrypted backup"
    @echo "  weekly              - Create weekly full backup"
    @echo "  monthly             - Create monthly full backup"
    @echo ""
    @echo "BACKUP MANAGEMENT:"
    @echo "  list                - List available backups"
    @echo "  restore <backup>    - Restore from backup file"
    @echo "  verify <backup>     - Verify backup integrity"
    @echo "  cleanup [days]      - Remove backups older than days (default: 30)"
    @echo ""
    @echo "BACKUP TYPES:"
    @echo "  basic               - Simple tar.gz backup (default)"
    @echo "  encrypted           - GPG encrypted backup"
    @echo "  full                - Complete system backup including content"

# Backup Creation
[group('backup-creation')]
create type="basic":
    @{{scripts_dir}}/backup/manager.sh create {{type}}

[group('backup-creation')]
daily:
    @{{scripts_dir}}/backup/manager.sh create encrypted

[group('backup-creation')]
weekly:
    @{{scripts_dir}}/backup/manager.sh create full

[group('backup-creation')]
monthly:
    @{{scripts_dir}}/backup/manager.sh create full

# Backup Management
[group('backup-management')]
list:
    @{{scripts_dir}}/backup/manager.sh list

[group('backup-management')]
restore backup:
    @{{scripts_dir}}/backup/manager.sh restore {{backup}}

[group('backup-management')]
verify backup:
    @{{scripts_dir}}/backup/manager.sh verify {{backup}}

[group('backup-management')]
cleanup days="30":
    @{{scripts_dir}}/backup/manager.sh cleanup {{days}}
