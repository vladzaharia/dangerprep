#!/bin/bash
set -e

echo "Fixing step-ca permissions..."

# Create secrets directory if it doesn't exist
mkdir -p /home/step/secrets

# Set correct permissions for mounted password file
if [ -f "/home/step/secrets/password" ]; then
    chmod 600 /home/step/secrets/password
    chown step:step /home/step/secrets/password
    echo "Password file permissions set"
else
    echo "Warning: CA password file not found at /home/step/secrets/password"
    # Create a placeholder file to prevent errors
    echo "placeholder" > /home/step/secrets/password
    chmod 600 /home/step/secrets/password
    chown step:step /home/step/secrets/password
    echo "Created placeholder password file"
fi

# Ensure step user owns the entire step directory
chown -R step:step /home/step

echo "Permissions fixed successfully"
