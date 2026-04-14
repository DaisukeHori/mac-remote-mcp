import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { runShellCommand } from "../utils/osascript.js";

const SERVER_START_TIME = new Date().toISOString();

export function registerAdminTools(server: McpServer): void {
  // ── server_status ───────────────────────────────────────────
  server.registerTool(
    "admin_status",
    {
      title: "Server Status",
      description: `Get server health and system information.

Returns:
  { uptime, started_at, macos_version, hostname, user, caffeinate_active, tmux_sessions }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const [macVer, hostname, user, caffCheck, tmuxCheck] = await Promise.all([
        runShellCommand("sw_vers -productVersion", { timeout: 3000 }),
        runShellCommand("hostname", { timeout: 3000 }),
        runShellCommand("whoami", { timeout: 3000 }),
        runShellCommand("pgrep -x caffeinate > /dev/null && echo active || echo inactive", { timeout: 3000 }),
        runShellCommand("tmux list-sessions 2>/dev/null | grep '^mcp-' | wc -l", { timeout: 3000 }),
      ]);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            started_at: SERVER_START_TIME,
            uptime_seconds: Math.floor((Date.now() - new Date(SERVER_START_TIME).getTime()) / 1000),
            macos_version: macVer.stdout.trim(),
            hostname: hostname.stdout.trim(),
            user: user.stdout.trim(),
            caffeinate_active: caffCheck.stdout.trim() === "active",
            tmux_sessions: parseInt(tmuxCheck.stdout.trim(), 10) || 0,
          }, null, 2),
        }],
      };
    }
  );

  // ── kill_switch ─────────────────────────────────────────────
  server.registerTool(
    "admin_kill_switch",
    {
      title: "Emergency Kill Switch",
      description: `Emergency stop: kills all MCP tmux sessions and optionally stops this server.
Use when something goes wrong or a command is running out of control.

Args:
  - kill_sessions: Kill all tmux MCP sessions (default true)
  - kill_all_user_processes: Kill all user processes started by MCP commands (default false)
  - stop_server: Stop this MCP server process (default false)
  - confirm: Must be "CONFIRM" to execute

Returns:
  { actions_taken }`,
      inputSchema: {
        kill_sessions: z.boolean().default(true).describe("Kill all tmux MCP sessions"),
        kill_all_user_processes: z.boolean().default(false).describe("Kill processes from MCP commands"),
        stop_server: z.boolean().default(false).describe("Stop this server"),
        confirm: z.string().describe('Must be "CONFIRM" to execute'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ kill_sessions, kill_all_user_processes, stop_server, confirm }) => {
      if (confirm !== "CONFIRM") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ error: 'confirm must be "CONFIRM"' }),
          }],
        };
      }

      const actions: string[] = [];

      if (kill_sessions) {
        await runShellCommand(
          "tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^mcp-' | xargs -I{} tmux kill-session -t {}",
          { timeout: 10000 }
        );
        actions.push("Killed all MCP tmux sessions");
      }

      if (kill_all_user_processes) {
        // Kill processes that were started in tmux mcp sessions
        await runShellCommand(
          "tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^mcp-' | while read s; do tmux send-keys -t \"$s\" C-c; done",
          { timeout: 5000 }
        );
        actions.push("Sent SIGINT to all running MCP processes");
      }

      if (stop_server) {
        actions.push("Server will stop in 2 seconds");
        setTimeout(() => process.exit(0), 2000);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ actions_taken: actions }, null, 2),
        }],
      };
    }
  );

  // ── caffeinate_control ──────────────────────────────────────
  server.registerTool(
    "admin_caffeinate",
    {
      title: "Caffeinate Control",
      description: `Prevent Mac from sleeping (caffeinate). Important for remote operation.

Args:
  - action: "start" | "stop" | "status"

Returns:
  { active, pid? }`,
      inputSchema: {
        action: z.enum(["start", "stop", "status"]).describe("Action to perform"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ action }) => {
      if (action === "status") {
        const result = await runShellCommand("pgrep -x caffeinate", { timeout: 3000 });
        const active = result.exitCode === 0;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ active, pid: active ? result.stdout.trim() : null }),
          }],
        };
      }

      if (action === "start") {
        // Kill existing first
        await runShellCommand("pkill -x caffeinate 2>/dev/null || true");
        // Start in background: prevent display + system sleep
        await runShellCommand("nohup caffeinate -d -i -s > /dev/null 2>&1 &");
        await new Promise((r) => setTimeout(r, 500));
        const check = await runShellCommand("pgrep -x caffeinate", { timeout: 3000 });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ active: check.exitCode === 0, pid: check.stdout.trim() || null }),
          }],
        };
      }

      // stop
      await runShellCommand("pkill -x caffeinate 2>/dev/null || true");
      return {
        content: [{ type: "text", text: JSON.stringify({ active: false }) }],
      };
    }
  );

  // ── view_audit_log ──────────────────────────────────────────
  server.registerTool(
    "admin_view_log",
    {
      title: "View Audit Log",
      description: `View recent audit log entries.

Args:
  - lines: Number of recent lines to show (default 50)
  - date: Date in YYYY-MM-DD format (default today)

Returns:
  { entries }`,
      inputSchema: {
        lines: z.number().int().min(1).max(500).default(50).describe("Number of lines"),
        date: z.string().optional().describe("Date YYYY-MM-DD (default today)"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ lines, date }) => {
      const targetDate = date || new Date().toISOString().split("T")[0];
      const logPath = join(homedir(), ".mac-remote-mcp", "logs", `audit-${targetDate}.log`);
      try {
        const result = await runShellCommand(`tail -n ${lines} "${logPath}"`, { timeout: 5000 });
        const entries = result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            try { return JSON.parse(line); } catch { return { raw: line }; }
          });
        return {
          content: [{ type: "text", text: JSON.stringify({ entries, log_file: logPath }, null, 2) }],
        };
      } catch {
        return {
          content: [{ type: "text", text: JSON.stringify({ entries: [], message: "No log file found for " + targetDate }) }],
        };
      }
    }
  );
}
