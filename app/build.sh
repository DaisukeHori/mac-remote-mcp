#!/bin/bash
set -e

# Build MacRemoteMCP.app from Swift sources
# Must be run on macOS with Xcode Command Line Tools installed

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/MacRemoteMCP"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$SCRIPT_DIR/build"
APP_BUNDLE="$BUILD_DIR/MacRemoteMCP.app"

echo "▶ Building MacRemoteMCP.app..."

# Clean
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Compile Swift sources
echo "  Compiling Swift..."
swiftc \
  -o "$BUILD_DIR/MacRemoteMCP" \
  -framework Cocoa \
  -framework Security \
  -target arm64-apple-macos13 \
  -O \
  "$APP_DIR/AppDelegate.swift" \
  "$APP_DIR/ProcessManager.swift" \
  "$APP_DIR/Config.swift"

# Also compile for x86_64 if possible
if swiftc \
  -o "$BUILD_DIR/MacRemoteMCP_x86" \
  -framework Cocoa \
  -framework Security \
  -target x86_64-apple-macos13 \
  -O \
  "$APP_DIR/AppDelegate.swift" \
  "$APP_DIR/ProcessManager.swift" \
  "$APP_DIR/Config.swift" 2>/dev/null; then
  echo "  Creating universal binary..."
  lipo -create \
    "$BUILD_DIR/MacRemoteMCP" \
    "$BUILD_DIR/MacRemoteMCP_x86" \
    -output "$BUILD_DIR/MacRemoteMCP_universal"
  mv "$BUILD_DIR/MacRemoteMCP_universal" "$BUILD_DIR/MacRemoteMCP"
  rm -f "$BUILD_DIR/MacRemoteMCP_x86"
else
  echo "  (arm64 only — x86_64 cross-compile not available)"
fi

# Create .app bundle structure
echo "  Creating .app bundle..."
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Copy binary
mv "$BUILD_DIR/MacRemoteMCP" "$APP_BUNDLE/Contents/MacOS/MacRemoteMCP"
chmod +x "$APP_BUNDLE/Contents/MacOS/MacRemoteMCP"

# Copy Info.plist
cp "$APP_DIR/Info.plist" "$APP_BUNDLE/Contents/"

# Update version from git tag if available
if VERSION=$(git describe --tags --exact-match 2>/dev/null); then
  VERSION="${VERSION#v}"  # Strip leading 'v'
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$APP_BUNDLE/Contents/Info.plist"
  echo "  Version: $VERSION"
fi

# Create PkgInfo
echo -n "APPL????" > "$APP_BUNDLE/Contents/PkgInfo"

# Ad-hoc code sign
echo "  Code signing..."
codesign --force --sign - "$APP_BUNDLE"

# Build Node.js dist and bundle it alongside
echo "  Building Node.js MCP server..."
cd "$PROJECT_ROOT"
npm install --production
npm run build

# Create dist archive to ship alongside the app
echo "  Packaging MCP server..."
DIST_DIR="$BUILD_DIR/mac-remote-mcp"
mkdir -p "$DIST_DIR"
cp -r dist/ "$DIST_DIR/dist/"
cp -r node_modules/ "$DIST_DIR/node_modules/"
cp package.json "$DIST_DIR/"
cp .env.example "$DIST_DIR/"
cp -r scripts/ "$DIST_DIR/scripts/"
cp -r cloudflare/ "$DIST_DIR/cloudflare/"
cp -r launchagents/ "$DIST_DIR/launchagents/"
cp README.md "$DIST_DIR/"

# Create final zip
echo "  Creating release archive..."
cd "$BUILD_DIR"
zip -r "MacRemoteMCP-macOS.zip" \
  MacRemoteMCP.app \
  mac-remote-mcp/ \
  -x "*/node_modules/.cache/*"

echo ""
echo "✅ Build complete!"
echo "   App:     $APP_BUNDLE"
echo "   Archive: $BUILD_DIR/MacRemoteMCP-macOS.zip"
echo ""
echo "   To install:"
echo "   1. Unzip MacRemoteMCP-macOS.zip"
echo "   2. Move MacRemoteMCP.app to /Applications"
echo "   3. Move mac-remote-mcp/ to ~/mac-remote-mcp"
echo "   4. cd ~/mac-remote-mcp && ./scripts/setup.sh"
echo "   5. Launch MacRemoteMCP from /Applications"
