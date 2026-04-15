import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runOsascript, runOsascriptJXA, runShellCommand } from "../utils/osascript.js";

export function registerAppTools(server: McpServer): void {
  // ── open_app ────────────────────────────────────────────────
  server.registerTool(
    "app_open",
    {
      title: "Open Application",
      description: `Launch or activate a macOS application.

Args:
  - app_name: Application name (e.g. "Safari", "Terminal", "Visual Studio Code")

Returns:
  { success, app_name }`,
      inputSchema: {
        app_name: z.string().min(1).describe("Application name"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_name }) => {
      await runShellCommand(`open -a "${app_name.replace(/"/g, '\\"')}"`, { timeout: 10000 });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, app_name }) }],
      };
    }
  );

  // ── quit_app ────────────────────────────────────────────────
  server.registerTool(
    "app_quit",
    {
      title: "Quit Application",
      description: `Quit a running application gracefully.

Args:
  - app_name: Application name
  - force: Force quit (default false)

Returns:
  { success, app_name }`,
      inputSchema: {
        app_name: z.string().min(1).describe("Application name"),
        force: z.boolean().default(false).describe("Force quit"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_name, force }) => {
      if (force) {
        await runShellCommand(`killall "${app_name.replace(/"/g, '\\"')}" 2>/dev/null || true`);
      } else {
        await runOsascript(`tell application "${app_name.replace(/"/g, '\\"')}" to quit`);
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, app_name, force }) }],
      };
    }
  );

  // ── list_running_apps ───────────────────────────────────────
  server.registerTool(
    "app_list_running",
    {
      title: "List Running Applications",
      description: `List all currently running applications.

Returns:
  { apps: [{ name, frontmost, visible }] }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        // Try shell-based approach first (no accessibility permission needed)
        const result = await runShellCommand(
          `osascript -e 'tell application "System Events" to get name of every process whose background only is false'`
        );
        if (result.exitCode === 0 && result.stdout.trim()) {
          const names = result.stdout.trim().split(", ");
          const apps = names.map((name: string) => ({ name: name.trim(), frontmost: false, visible: true }));
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ apps }, null, 2) }],
          };
        }
      } catch { /* fall through */ }

      // Fallback: use lsappinfo (always works, no permissions needed)
      const result = await runShellCommand(
        `lsappinfo list | grep -E '^ *"LSDisplayName"|"CFBundleName"' | head -50 | sed 's/.*= "//;s/".*//'`
      );
      const names = result.stdout.trim().split("\n").filter((n: string) => n.length > 0);
      const apps = names.map((name: string) => ({ name }));
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ apps }, null, 2) }],
      };
    }
  );

  // ── activate_app ────────────────────────────────────────────
  server.registerTool(
    "app_activate",
    {
      title: "Activate Application",
      description: `Bring an application to the foreground.

Args:
  - app_name: Application name

Returns:
  { success }`,
      inputSchema: {
        app_name: z.string().min(1).describe("Application name"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_name }) => {
      await runOsascript(
        `tell application "${app_name.replace(/"/g, '\\"')}" to activate`
      );
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, app_name }) }],
      };
    }
  );

  // ── list_windows ────────────────────────────────────────────
  server.registerTool(
    "app_list_windows",
    {
      title: "List Application Windows",
      description: `List windows of a running application.

Args:
  - app_name: Application name

Returns:
  { windows: [{ title, position, size, index, minimized }] }`,
      inputSchema: {
        app_name: z.string().min(1).describe("Application name"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_name }) => {
      const jxa = `
function run() {
  const se = Application("System Events");
  const proc = se.processes.byName("${app_name.replace(/"/g, '\\"')}");
  const wins = proc.windows();
  const result = [];
  for (let i = 0; i < wins.length; i++) {
    const w = wins[i];
    const item = { title: "", position: null, size: null, index: i + 1, minimized: false };
    try { item.title = w.name() || ""; } catch(e) {}
    try { item.position = w.position(); } catch(e) {}
    try { item.size = w.size(); } catch(e) {}
    try { item.minimized = w.miniaturized ? w.miniaturized() : false; } catch(e) {}
    result.push(item);
  }
  return JSON.stringify(result);
}
`;
      const result = await runOsascriptJXA(jxa, 10000);
      return {
        content: [{ type: "text", text: result.stdout }],
      };
    }
  );

  // ── get_clipboard ───────────────────────────────────────────
  server.registerTool(
    "clipboard_get",
    {
      title: "Get Clipboard",
      description: `Get current clipboard contents.

Returns:
  { content, length }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async () => {
      const result = await runShellCommand("pbpaste", { timeout: 5000 });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ content: result.stdout, length: result.stdout.length }),
        }],
      };
    }
  );

  // ── set_clipboard ───────────────────────────────────────────
  server.registerTool(
    "clipboard_set",
    {
      title: "Set Clipboard",
      description: `Set clipboard contents.

Args:
  - text: Text to copy to clipboard

Returns:
  { success, length }`,
      inputSchema: {
        text: z.string().describe("Text to copy"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ text }) => {
      await runShellCommand(`echo -n ${JSON.stringify(text)} | pbcopy`, { timeout: 5000 });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, length: text.length }) }],
      };
    }
  );

  // ── open_url ────────────────────────────────────────────────
  server.registerTool(
    "app_open_url",
    {
      title: "Open URL",
      description: `Open a URL in the default browser.

Args:
  - url: URL to open

Returns:
  { success, url }`,
      inputSchema: {
        url: z.string().url().describe("URL to open"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ url }) => {
      await runShellCommand(`open "${url.replace(/"/g, '\\"')}"`, { timeout: 10000 });
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, url }) }],
      };
    }
  );
}
