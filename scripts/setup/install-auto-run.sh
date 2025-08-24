#!/bin/bash
# DangerPrep Reboot Finalization Installer
# This script is now deprecated - reboot finalization is handled automatically by the main setup script

set -euo pipefail

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}DangerPrep Reboot Finalization Installer${NC}"
echo "========================================"
echo
echo -e "${YELLOW}[DEPRECATED]${NC} This script is no longer needed!"
echo
echo -e "${BLUE}[INFO]${NC} The main setup script now handles reboot finalization automatically."
echo -e "${BLUE}[INFO]${NC} When you run the interactive setup, it will:"
echo "  1. Configure your custom user account"
echo "  2. Set up all services and configurations"
echo "  3. Create a reboot finalization service automatically"
echo "  4. Clean up the pi user on next reboot"
echo
echo -e "${BLUE}[INFO]${NC} To run the setup:"
echo "  sudo /dangerprep/scripts/setup/setup-dangerprep.sh"
echo
echo -e "${BLUE}[INFO]${NC} After setup completion, simply reboot and the pi user cleanup will happen automatically."
