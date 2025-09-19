# Wishlist SSH Frontdoor

This service provides an SSH directory/frontdoor using [Wishlist](https://github.com/charmbracelet/wishlist) by Charm.

## Overview

Wishlist runs on port 22 and provides a menu-driven interface for accessing SSH endpoints. Currently configured endpoints:

- **ssh**: Local SSH server running on port 2222 with full system access

## Configuration

The service is configured through:

- `config/config.yaml`: Main Wishlist configuration (generated from template)
- `compose.env`: Environment variables for Docker Compose
- `keys/`: Directory containing SSH host keys (auto-generated)

## User Access

**Security Policy**: Only the primary user account has access to the Wishlist SSH frontdoor. The `pi` user does NOT have access for security reasons.

Users are granted access through SSH public keys configured in the `users` section of `config.yaml`. The setup script automatically imports SSH keys from GitHub accounts if configured, but only applies them to the primary user for Wishlist access.

## Usage

Once running, users can SSH to the system on port 22:

```bash
ssh user@hostname
```

This will present a Wishlist menu where they can select the "ssh" option to connect to the full SSH server.

## Future Extensions

Additional endpoints can be added to the `endpoints` section in `config.yaml`, such as:

- Management applications built with Wish/Bubble Tea
- Specific service access points
- Development environments

## Security

- Only users with configured SSH public keys can access Wishlist
- SSH agent forwarding is enabled for seamless key usage
- Connection timeouts prevent hanging connections
- All connections are logged for audit purposes
