import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, unlink } from "node:fs/promises";
import { runOsascript, runShellCommand } from "../utils/osascript.js";

export function registerGuiTools(server: McpServer): void {
  // ── take_screenshot ─────────────────────────────────────────
  server.registerTool(
    "gui_screenshot",
    {
      title: "Take Screenshot",
      description: `Capture the screen and return as base64-encoded PNG.

Args:
  - region: Optional { x, y, width, height } to capture a specific area
  - display: Display number (default 1, for multi-monitor)
  - max_width: Max width in pixels for resizing (default 1280, saves tokens)

Returns:
  Base64-encoded PNG image content`,
      inputSchema: {
        region: z
          .object({
            x: z.number().int().describe("X coordinate"),
            y: z.number().int().describe("Y coordinate"),
            width: z.number().int().min(1).describe("Width in pixels"),
            height: z.number().int().min(1).describe("Height in pixels"),
          })
          .optional()
          .describe("Capture specific region"),
        display: z.number().int().min(1).default(1).describe("Display number"),
        max_width: z.number().int().min(100).default(1280).describe("Max width for resize"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ region, display, max_width }) => {
      const tmpPath = `/tmp/mcp-screenshot-${Date.now()}.png`;
      try {
        let cmd = `screencapture -x -D ${display}`;
        if (region) {
          cmd += ` -R${region.x},${region.y},${region.width},${region.height}`;
        }
        cmd += ` ${tmpPath}`;

        await runShellCommand(cmd, { timeout: 10000 });

        // Resize if needed using sips
        await runShellCommand(
          `sips --resampleWidth ${max_width} ${tmpPath} --out ${tmpPath} 2>/dev/null || true`,
          { timeout: 10000 }
        );

        const imageBuffer = await readFile(tmpPath);
        const base64 = imageBuffer.toString("base64");

        return {
          content: [
            {
              type: "image",
              data: base64,
              mimeType: "image/png",
            },
          ],
        };
      } finally {
        await unlink(tmpPath).catch(() => {});
      }
    }
  );

  // ── mouse_click ─────────────────────────────────────────────
  server.registerTool(
    "gui_mouse_click",
    {
      title: "Mouse Click",
      description: `Click at specific screen coordinates.

Args:
  - x: X coordinate
  - y: Y coordinate
  - button: "left" | "right" (default "left")
  - clicks: Number of clicks (default 1, use 2 for double-click)

Returns:
  { success, x, y }`,
      inputSchema: {
        x: z.number().int().describe("X coordinate"),
        y: z.number().int().describe("Y coordinate"),
        button: z.enum(["left", "right"]).default("left").describe("Mouse button"),
        clicks: z.number().int().min(1).max(3).default(1).describe("Number of clicks"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ x, y, button, clicks }) => {
      // Move mouse first, then click
      const clickEvent = button === "right" ? "right click" : "click";
      // Using Python/Quartz for reliable click (no brew dependency)
      const pyScript = `
import Quartz
import time

point = Quartz.CGPointMake(${x}, ${y})
# Move
moveEvent = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, point, Quartz.kCGMouseButtonLeft)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, moveEvent)
time.sleep(0.05)

buttonType = ${button === "right" ? "Quartz.kCGMouseButtonRight" : "Quartz.kCGMouseButtonLeft"}
downType = ${button === "right" ? "Quartz.kCGEventRightMouseDown" : "Quartz.kCGEventLeftMouseDown"}
upType = ${button === "right" ? "Quartz.kCGEventRightMouseUp" : "Quartz.kCGEventLeftMouseUp"}

for i in range(${clicks}):
    down = Quartz.CGEventCreateMouseEvent(None, downType, point, buttonType)
    Quartz.CGEventSetIntegerValueField(down, Quartz.kCGMouseEventClickState, i + 1)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)
    time.sleep(0.01)
    up = Quartz.CGEventCreateMouseEvent(None, upType, point, buttonType)
    Quartz.CGEventSetIntegerValueField(up, Quartz.kCGMouseEventClickState, i + 1)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)
    time.sleep(0.05)

print("ok")
`;
      const result = await runShellCommand(
        `python3 -c ${JSON.stringify(pyScript)}`,
        { timeout: 5000 }
      );
      if (result.exitCode !== 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: result.stderr }) }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, x, y, button, clicks }) }],
      };
    }
  );

  // ── mouse_move ──────────────────────────────────────────────
  server.registerTool(
    "gui_mouse_move",
    {
      title: "Move Mouse",
      description: `Move mouse cursor to coordinates without clicking.

Args:
  - x: Target X coordinate
  - y: Target Y coordinate

Returns:
  { success, x, y }`,
      inputSchema: {
        x: z.number().int().describe("X coordinate"),
        y: z.number().int().describe("Y coordinate"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ x, y }) => {
      const pyScript = `
import Quartz
point = Quartz.CGPointMake(${x}, ${y})
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, point, Quartz.kCGMouseButtonLeft)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
print("ok")
`;
      await runShellCommand(`python3 -c ${JSON.stringify(pyScript)}`, { timeout: 5000 });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, x, y }) }],
      };
    }
  );

  // ── mouse_scroll ────────────────────────────────────────────
  server.registerTool(
    "gui_mouse_scroll",
    {
      title: "Mouse Scroll",
      description: `Scroll the mouse wheel at a position.

Args:
  - x: X coordinate
  - y: Y coordinate
  - delta_y: Scroll amount (positive = down, negative = up)

Returns:
  { success }`,
      inputSchema: {
        x: z.number().int().describe("X coordinate"),
        y: z.number().int().describe("Y coordinate"),
        delta_y: z.number().int().describe("Scroll amount (positive=down, negative=up)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ x, y, delta_y }) => {
      const pyScript = `
import Quartz
point = Quartz.CGPointMake(${x}, ${y})
move = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, point, Quartz.kCGMouseButtonLeft)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, move)
scroll = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 1, ${-delta_y})
Quartz.CGEventPost(Quartz.kCGHIDEventTap, scroll)
print("ok")
`;
      await runShellCommand(`python3 -c ${JSON.stringify(pyScript)}`, { timeout: 5000 });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true }) }],
      };
    }
  );

  // ── keyboard_type ───────────────────────────────────────────
  server.registerTool(
    "gui_keyboard_type",
    {
      title: "Type Text",
      description: `Type text using keyboard simulation. Supports Unicode.

Args:
  - text: Text to type
  - delay_ms: Delay between keystrokes in ms (default 0)

Returns:
  { success, length }`,
      inputSchema: {
        text: z.string().min(1).max(10000).describe("Text to type"),
        delay_ms: z.number().int().min(0).max(1000).default(0).describe("Delay between keystrokes"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ text, delay_ms }) => {
      // Use osascript for reliable Unicode support
      const escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      if (delay_ms > 0) {
        // Type character by character with delay
        for (const char of text) {
          const escapedChar = char.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          await runOsascript(
            `tell application "System Events" to keystroke "${escapedChar}"`
          );
          if (delay_ms > 0) {
            await new Promise((r) => setTimeout(r, delay_ms));
          }
        }
      } else {
        await runOsascript(
          `tell application "System Events" to keystroke "${escapedText}"`
        );
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, length: text.length }) }],
      };
    }
  );

  // ── keyboard_key ────────────────────────────────────────────
  server.registerTool(
    "gui_keyboard_key",
    {
      title: "Press Key Combination",
      description: `Press a key or key combination (hotkey).

Args:
  - key: Key name (return, tab, escape, space, delete, up, down, left, right, f1-f12)
  - modifiers: Array of modifiers: "command", "control", "option", "shift"

Examples:
  - Enter key: key="return"
  - Cmd+C: key="c", modifiers=["command"]
  - Cmd+Shift+S: key="s", modifiers=["command","shift"]

Returns:
  { success, key, modifiers }`,
      inputSchema: {
        key: z.string().min(1).describe("Key name"),
        modifiers: z
          .array(z.enum(["command", "control", "option", "shift"]))
          .default([])
          .describe("Modifier keys"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ key, modifiers }) => {
      // Map common key names to AppleScript key codes
      const keyCodeMap: Record<string, number> = {
        return: 36, enter: 36, tab: 48, escape: 53, space: 49,
        delete: 51, forwarddelete: 117,
        up: 126, down: 125, left: 123, right: 124,
        home: 115, end: 119, pageup: 116, pagedown: 121,
        f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97,
        f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
      };

      const modString = modifiers.length > 0
        ? `using {${modifiers.map((m) => `${m} down`).join(", ")}}`
        : "";

      const keyLower = key.toLowerCase();
      if (keyCodeMap[keyLower] !== undefined) {
        await runOsascript(
          `tell application "System Events" to key code ${keyCodeMap[keyLower]} ${modString}`
        );
      } else if (key.length === 1) {
        await runOsascript(
          `tell application "System Events" to keystroke "${key}" ${modString}`
        );
      } else {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: `Unknown key: ${key}. Use single character or: ${Object.keys(keyCodeMap).join(", ")}` }),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, key, modifiers }),
        }],
      };
    }
  );

  // ── get_mouse_position ──────────────────────────────────────
  server.registerTool(
    "gui_get_mouse_position",
    {
      title: "Get Mouse Position",
      description: `Get current mouse cursor coordinates.

Returns:
  { x, y }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const pyScript = `
import Quartz
loc = Quartz.NSEvent.mouseLocation()
screen = Quartz.NSScreen.mainScreen().frame()
print(f"{int(loc.x)},{int(screen.size.height - loc.y)}")
`;
      const result = await runShellCommand(`python3 -c ${JSON.stringify(pyScript)}`, { timeout: 3000 });
      const [x, y] = result.stdout.trim().split(",").map(Number);
      return {
        content: [{ type: "text", text: JSON.stringify({ x: x || 0, y: y || 0 }) }],
      };
    }
  );

  // ── get_screen_size ─────────────────────────────────────────
  server.registerTool(
    "gui_get_screen_size",
    {
      title: "Get Screen Size",
      description: `Get the screen resolution.

Returns:
  { width, height, displays }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const result = await runShellCommand(
        `system_profiler SPDisplaysDataType -json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
displays = []
for gpu in data.get('SPDisplaysDataType', []):
    for d in gpu.get('spdisplays_ndrvs', []):
        res = d.get('_spdisplays_resolution', 'unknown')
        displays.append(res)
print(json.dumps(displays))
"`,
        { timeout: 10000 }
      );
      // Also get main screen via python
      const pyResult = await runShellCommand(
        `python3 -c "import Quartz; s=Quartz.NSScreen.mainScreen().frame(); print(f'{int(s.size.width)},{int(s.size.height)}')"`,
        { timeout: 3000 }
      );
      const [width, height] = pyResult.stdout.trim().split(",").map(Number);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            width: width || 0,
            height: height || 0,
            displays: JSON.parse(result.stdout || "[]"),
          }),
        }],
      };
    }
  );
}
