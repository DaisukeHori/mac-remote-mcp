#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/MacRemoteMCP"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$SCRIPT_DIR/build"
APP_BUNDLE="$BUILD_DIR/MacRemoteMCP.app"
DMG_DIR="$BUILD_DIR/dmg-contents"

echo "▶ Building MacRemoteMCP.app..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# ── 1. Compile Swift ──────────────────────────────────────────
echo "  Compiling Swift (arm64)..."
swiftc \
  -o "$BUILD_DIR/MacRemoteMCP" \
  -framework Cocoa -framework Security \
  -target arm64-apple-macos13 -O \
  "$APP_DIR/main.swift" \
  "$APP_DIR/AppDelegate.swift" \
  "$APP_DIR/ProcessManager.swift" \
  "$APP_DIR/Config.swift" \
  "$APP_DIR/Logic.swift" \
  "$APP_DIR/PermissionChecker.swift"

if swiftc \
  -o "$BUILD_DIR/MacRemoteMCP_x86" \
  -framework Cocoa -framework Security \
  -target x86_64-apple-macos13 -O \
  "$APP_DIR/main.swift" \
  "$APP_DIR/AppDelegate.swift" \
  "$APP_DIR/ProcessManager.swift" \
  "$APP_DIR/Config.swift" \
  "$APP_DIR/Logic.swift" \
  "$APP_DIR/PermissionChecker.swift" 2>/dev/null; then
  echo "  Creating universal binary..."
  lipo -create "$BUILD_DIR/MacRemoteMCP" "$BUILD_DIR/MacRemoteMCP_x86" \
    -output "$BUILD_DIR/MacRemoteMCP_universal"
  mv "$BUILD_DIR/MacRemoteMCP_universal" "$BUILD_DIR/MacRemoteMCP"
  rm -f "$BUILD_DIR/MacRemoteMCP_x86"
fi

# ── 2. Build Node.js MCP server ──────────────────────────────
echo "  Building Node.js MCP server..."
cd "$PROJECT_ROOT"
[ -d "node_modules" ] || npm install
npm run build

# ── 3. Create .app bundle ────────────────────────────────────
echo "  Creating .app bundle..."
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources/mcp-server"

mv "$BUILD_DIR/MacRemoteMCP" "$APP_BUNDLE/Contents/MacOS/MacRemoteMCP"
chmod +x "$APP_BUNDLE/Contents/MacOS/MacRemoteMCP"
cp "$APP_DIR/Info.plist" "$APP_BUNDLE/Contents/"
echo -n "APPL????" > "$APP_BUNDLE/Contents/PkgInfo"

# Copy PPPC profile into bundle
if [ -f "$APP_DIR/MacRemoteMCP-Permissions.mobileconfig" ]; then
  cp "$APP_DIR/MacRemoteMCP-Permissions.mobileconfig" "$APP_BUNDLE/Contents/Resources/"
fi

if VERSION=$(git describe --tags --exact-match 2>/dev/null); then
  VERSION="${VERSION#v}"
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" \
    "$APP_BUNDLE/Contents/Info.plist"
  echo "  Version: $VERSION"
fi

# ── 4. Embed MCP server inside .app ──────────────────────────
echo "  Embedding MCP server..."
RES="$APP_BUNDLE/Contents/Resources/mcp-server"
cp -r dist/ "$RES/dist/"
cp package.json package-lock.json .env.example README.md "$RES/"
cp -r scripts/ "$RES/scripts/"
cp -r cloudflare/ "$RES/cloudflare/"
cp -r launchagents/ "$RES/launchagents/"

cd "$RES" && npm install --omit=dev 2>/dev/null && cd "$PROJECT_ROOT"
echo "  App size: $(du -sh "$APP_BUNDLE" | cut -f1)"

# ── 5. Code sign ─────────────────────────────────────────────
echo "  Code signing..."
if [ -n "$APPLE_SIGNING_IDENTITY" ]; then
  codesign --force --deep --options runtime --sign "$APPLE_SIGNING_IDENTITY" "$APP_BUNDLE"
  echo "  Signed with: $APPLE_SIGNING_IDENTITY"
else
  codesign --force --deep --sign - "$APP_BUNDLE"
  echo "  Ad-hoc signed (no Developer ID)"
fi

# ── 6. Create DMG ────────────────────────────────────────────
echo "  Creating DMG installer..."
mkdir -p "$DMG_DIR"
cp -r "$APP_BUNDLE" "$DMG_DIR/"
ln -s /Applications "$DMG_DIR/Applications"

hdiutil create -volname "MacRemoteMCP" -srcfolder "$DMG_DIR" \
  -ov -format UDZO "$BUILD_DIR/MacRemoteMCP.dmg"
rm -rf "$DMG_DIR"

# Also zip for GitHub
cd "$BUILD_DIR" && zip -qr "MacRemoteMCP-macOS.zip" MacRemoteMCP.app

echo ""
echo "✅ Build complete!"
echo "   DMG: $BUILD_DIR/MacRemoteMCP.dmg ($(du -sh "$BUILD_DIR/MacRemoteMCP.dmg" | cut -f1))"
echo "   Install: Mount DMG → Drag MacRemoteMCP to Applications → Launch"
