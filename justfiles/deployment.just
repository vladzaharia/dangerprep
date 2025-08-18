# DangerPrep Deployment Module
# System deployment, installation, and updates

scripts_dir := "../scripts"

# Deployment help
help:
    @echo "🚀 DEPLOYMENT & INSTALLATION:"
    @echo ""
    @echo "INSTALLATION:"
    @echo "  deploy              - Deploy/install entire system"
    @echo "  cleanup             - Uninstall system"
    @echo "  uninstall           - Force uninstall system"
    @echo ""
    @echo "UPDATES:"
    @echo "  update              - Update from repository"

# Installation
[group('installation')]
deploy:
    @echo "Deploying DangerPrep system..."
    @sudo {{scripts_dir}}/setup/setup.sh

[group('installation')]
cleanup:
    @echo "Cleaning up DangerPrep system..."
    @sudo {{scripts_dir}}/setup/cleanup.sh

[group('installation')]
uninstall:
    @{{scripts_dir}}/setup/cleanup.sh --force

# Updates
[group('updates')]
update:
    @{{scripts_dir}}/system/update.sh
