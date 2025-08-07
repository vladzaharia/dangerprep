#!/bin/bash
set -e

# This script runs after step-ca initialization to configure ACME provisioner
# and other custom settings

echo "Configuring step-ca post-initialization..."

# Wait for step-ca to be fully initialized
sleep 5

# Check if ACME provisioner already exists
if ! step ca provisioner list --ca-url https://localhost:9000 --root /home/step/certs/root_ca.crt | grep -q "acme"; then
    echo "Adding ACME provisioner..."
    step ca provisioner add acme --type ACME --ca-url https://localhost:9000 --root /home/step/certs/root_ca.crt
    
    echo "ACME provisioner added successfully"
else
    echo "ACME provisioner already exists"
fi

echo "Step-ca configuration complete"
