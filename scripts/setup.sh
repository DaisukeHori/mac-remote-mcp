#!/bin/bash
set -e

# ── mac-remote-mcp Setup Script ──────────────────────────────
# Run this on your Mac to set up everything

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOME_DIR="$HOME"
LOG_DIR="$HOME_DIR/.mac-remote-mcp/logs"
LAUNCHAGENT_DIR="$HOME_DIR/Library/LaunchAgents"

echo "╔══════════════════════════════════════════════════╗"
echo "║          mac-remote-mcp Setup                    ║"
echo "╚══════════════════════════════════════════════════╝"

# ── 1. Check prerequisites ────────────────────────────────────
echo ""
echo "▶ Checking prerequisites..."

command -v node >/dev/null 2>&1 || { echo "❌ Node.js required. Install: brew install node"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm required."; exit 1; }
command -v tmux >/dev/null 2>&1 || { echo "❌ tmux required. Install: brew install tmux"; exit 1; }

NODE_VER=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VER" -lt 20 ]; then
  echo "❌ Node.js 20+ required. Current: $(node --version)"
  exit 1
fi

echo "  ✅ Node.js $(node --version)"
echo "  ✅ tmux $(tmux -V)"

# ── 2. Generate API key if not set ────────────────────────────
if [ -z "$MCP_API_KEY" ]; then
  if [ -f "$PROJECT_DIR/.env" ]; then
    source "$PROJECT_DIR/.env"
  fi
fi

if [ -z "$MCP_API_KEY" ]; then
  MCP_API_KEY=$(openssl rand -hex 32)
  echo ""
  echo "▶ Generated new API key:"
  echo "  MCP_API_KEY=$MCP_API_KEY"
  echo ""
  cat > "$PROJECT_DIR/.env" << ENVEOF
MCP_API_KEY=$MCP_API_KEY
TRANSPORT=http
PORT=3000
HOST=127.0.0.1
PLAYWRIGHT_PORT=3001
PROXY_PORT=3002
ENVEOF
  echo "  ✅ Saved to $PROJECT_DIR/.env"
fi

# ── 3. Install dependencies & build ──────────────────────────
echo ""
echo "▶ Installing dependencies..."
cd "$PROJECT_DIR"
npm install

echo ""
echo "▶ Building..."
npm run build

echo "  ✅ Build complete"

# ── 4. Create log directory ───────────────────────────────────
mkdir -p "$LOG_DIR"
echo "  ✅ Log directory: $LOG_DIR"

# ── 5. Install Playwright (for browser MCP) ──────────────────
echo ""
echo "▶ Installing Playwright..."
npx playwright install chromium 2>/dev/null || echo "  ⚠️  Playwright install skipped (run manually: npx playwright install chromium)"
echo "  ✅ Playwright ready"

# ── 6. Install LaunchAgents ───────────────────────────────────
echo ""
echo "▶ Installing LaunchAgents..."
mkdir -p "$LAUNCHAGENT_DIR"

NODE_PATH=$(which node)
NPX_PATH=$(which npx)

for PLIST in "$PROJECT_DIR"/launchagents/*.plist; do
  BASENAME=$(basename "$PLIST")
  DEST="$LAUNCHAGENT_DIR/$BASENAME"

  # Replace placeholders
  sed \
    -e "s|__NODE_PATH__|$NODE_PATH|g" \
    -e "s|__NPX_PATH__|$NPX_PATH|g" \
    -e "s|__INSTALL_DIR__|$PROJECT_DIR|g" \
    -e "s|__HOME__|$HOME_DIR|g" \
    -e "s|__MCP_API_KEY__|$MCP_API_KEY|g" \
    "$PLIST" > "$DEST"

  echo "  ✅ Installed $BASENAME"
done

# ── 7. macOS Permissions Guide ────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ⚠️  IMPORTANT: macOS Permissions Required       ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  Open System Settings → Privacy & Security       ║"
echo "║                                                  ║"
echo "║  1. Accessibility                                ║"
echo "║     → Add Terminal (or iTerm2)                   ║"
echo "║     → Add node ($(which node))          ║"
echo "║                                                  ║"
echo "║  2. Screen Recording                             ║"
echo "║     → Add Terminal (or iTerm2)                   ║"
echo "║     → Add node                                   ║"
echo "║                                                  ║"
echo "║  3. Automation                                   ║"
echo "║     → Allow Terminal to control all apps         ║"
echo "║                                                  ║"
echo "║  4. Full Disk Access (optional, for file tools)  ║"
echo "║     → Add node                                   ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"

# ── 8. Start services ────────────────────────────────────────
echo ""
echo "▶ Starting services..."

# Unload first if already loaded
for LABEL in com.mac-remote.caffeinate com.mac-remote.server com.mac-remote.playwright com.mac-remote.playwright-proxy; do
  launchctl bootout gui/$(id -u)/$LABEL 2>/dev/null || true
done

# Load all
for PLIST in "$LAUNCHAGENT_DIR"/com.mac-remote.*.plist; do
  LABEL=$(basename "$PLIST" .plist)
  launchctl bootstrap gui/$(id -u) "$PLIST" 2>/dev/null && echo "  ✅ Started $LABEL" || echo "  ⚠️  Failed: $LABEL"
done

# ── 9. Verify ─────────────────────────────────────────────────
echo ""
echo "▶ Verifying..."
sleep 2

if curl -sf http://127.0.0.1:3000/health > /dev/null 2>&1; then
  echo "  ✅ Mac control MCP server: http://127.0.0.1:3000/mcp"
else
  echo "  ⚠️  Mac control server not responding yet (check logs)"
fi

if curl -sf http://127.0.0.1:3002/health > /dev/null 2>&1; then
  echo "  ✅ Playwright proxy: http://127.0.0.1:3002"
else
  echo "  ⚠️  Playwright proxy not responding yet (check logs)"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Setup Complete!                                 ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  API Key: $MCP_API_KEY  ║"
echo "║                                                  ║"
echo "║  Next steps:                                     ║"
echo "║  1. Grant macOS permissions (see above)          ║"
echo "║  2. Set up Cloudflare Tunnel:                    ║"
echo "║     cp cloudflare/config.example.yml \\            ║"
echo "║        ~/.cloudflared/config.yml                 ║"
echo "║  3. Register in Claude.ai:                       ║"
echo "║     Settings → Connectors → Custom              ║"
echo "║     URL: https://your-domain.com/mcp             ║"
echo "║     Auth: Bearer <API_KEY>                       ║"
echo "║                                                  ║"
echo "║  Logs: $LOG_DIR  ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
