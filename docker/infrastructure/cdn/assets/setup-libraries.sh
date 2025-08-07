#!/bin/bash

# CDN Library Setup Script
# This script helps verify that required external libraries are properly installed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FONTAWESOME_DIR="$SCRIPT_DIR/fontawesome"
WEBAWESOME_DIR="$SCRIPT_DIR/webawesome"

echo "🔍 CDN Library Setup Verification"
echo "=================================="
echo

# Check FontAwesome
echo "📦 Checking FontAwesome..."
FONTAWESOME_MISSING=()

if [ ! -d "$FONTAWESOME_DIR/css" ]; then
    FONTAWESOME_MISSING+=("css/")
fi

if [ ! -d "$FONTAWESOME_DIR/webfonts" ]; then
    FONTAWESOME_MISSING+=("webfonts/")
fi

if [ ! -d "$FONTAWESOME_DIR/svgs" ]; then
    FONTAWESOME_MISSING+=("svgs/")
fi

if [ ${#FONTAWESOME_MISSING[@]} -eq 0 ]; then
    echo "✅ FontAwesome files appear to be present"
    
    # Check specific files
    if [ -f "$FONTAWESOME_DIR/css/all.min.css" ]; then
        echo "   ✅ all.min.css found"
    else
        echo "   ⚠️  all.min.css missing"
    fi
    
    if [ -d "$FONTAWESOME_DIR/webfonts" ] && [ "$(ls -A "$FONTAWESOME_DIR/webfonts")" ]; then
        echo "   ✅ webfonts directory has files"
    else
        echo "   ⚠️  webfonts directory empty or missing"
    fi
else
    echo "❌ FontAwesome files missing:"
    for missing in "${FONTAWESOME_MISSING[@]}"; do
        echo "   - $missing"
    done
    echo "   📖 See $FONTAWESOME_DIR/README.md for setup instructions"
fi

echo

# Check Web Awesome
echo "📦 Checking Web Awesome..."
if [ ! -d "$WEBAWESOME_DIR/dist" ]; then
    echo "❌ Web Awesome dist/ directory missing"
    echo "   📖 See $WEBAWESOME_DIR/README.md for setup instructions"
else
    echo "✅ Web Awesome dist/ directory found"
    
    # Check specific files
    if [ -f "$WEBAWESOME_DIR/dist/styles/webawesome.css" ]; then
        echo "   ✅ webawesome.css found"
    else
        echo "   ⚠️  webawesome.css missing"
    fi
    
    if [ -f "$WEBAWESOME_DIR/dist/webawesome.loader.js" ]; then
        echo "   ✅ webawesome.loader.js found"
    else
        echo "   ⚠️  webawesome.loader.js missing"
    fi
fi

echo

# Summary
if [ ${#FONTAWESOME_MISSING[@]} -eq 0 ] && [ -d "$WEBAWESOME_DIR/dist" ]; then
    echo "🎉 All required libraries appear to be installed!"
    echo "   You can now start the CDN service."
else
    echo "⚠️  Some libraries are missing. Please:"
    echo "   1. Read the README.md files in each library directory"
    echo "   2. Obtain the required files from official sources"
    echo "   3. Install them in the correct locations"
    echo "   4. Run this script again to verify"
fi

echo
echo "📚 For detailed setup instructions:"
echo "   - FontAwesome: $FONTAWESOME_DIR/README.md"
echo "   - Web Awesome: $WEBAWESOME_DIR/README.md"
