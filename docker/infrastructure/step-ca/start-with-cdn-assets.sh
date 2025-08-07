#!/bin/sh

echo "🚀 Starting step-ca with CDN asset generation..."

# Wait for step-ca to be ready (if running in background)
wait_for_ca() {
    echo "⏳ Waiting for step-ca to be ready..."
    for i in $(seq 1 30); do
        if [ -f "/ca-data/certs/root_ca.crt" ]; then
            echo "✅ Step-ca is ready!"
            return 0
        fi
        echo "   Attempt $i/30: Waiting for root certificate..."
        sleep 2
    done
    echo "❌ Timeout waiting for step-ca to be ready"
    return 1
}

# Generate CDN assets
generate_assets() {
    echo "📦 Generating CDN assets..."
    node /app/generate-cdn-assets.js
    if [ $? -eq 0 ]; then
        echo "✅ CDN assets generated successfully"
    else
        echo "❌ Failed to generate CDN assets"
        return 1
    fi
}

# Set up periodic asset regeneration
setup_periodic_generation() {
    echo "⏰ Setting up periodic asset regeneration..."
    
    # Create a simple cron-like function
    (
        while true; do
            sleep 3600  # Wait 1 hour
            echo "🔄 Regenerating CDN assets (periodic update)..."
            generate_assets
        done
    ) &
    
    echo "✅ Periodic regeneration set up (every hour)"
}

# Main execution
main() {
    # If we're in a step-ca environment, wait for it to be ready
    if [ -d "/ca-data" ]; then
        wait_for_ca
        if [ $? -ne 0 ]; then
            echo "❌ Step-ca not ready, exiting"
            exit 1
        fi
        
        # Generate initial assets
        generate_assets
        if [ $? -ne 0 ]; then
            echo "❌ Failed to generate initial CDN assets"
            exit 1
        fi
        
        # Set up periodic regeneration
        setup_periodic_generation
    else
        echo "⚠️  No CA data directory found, skipping asset generation"
    fi
    
    # Start the main application
    echo "🌐 Starting step-ca download service..."
    exec node /app/src/server.js
}

# Handle signals for graceful shutdown
trap 'echo "🛑 Received shutdown signal, stopping..."; exit 0' TERM INT

# Run main function
main
