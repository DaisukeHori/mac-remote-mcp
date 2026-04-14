import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runShellCommand } from "../utils/osascript.js";

// Dangerous commands that require explicit confirmation
const DANGEROUS_PATTERNS = [
  /\brm\s+(-rf?|--recursive)\s+[\/~]/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b>\s*\/dev\/sd/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bsudo\s+rm/i,
  /\bcurl\b.*\|\s*(ba)?sh/i,
  /\bchmod\s+-R\s+777\s+\//i,
];

function isDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked: command matches dangerous pattern ${pattern.source}. Use confirm_dangerous=true to override.`;
    }
  }
  return null;
}

export function registerShellTools(server: McpServer): void {
  // ── execute_command ─────────────────────────────────────────
  server.registerTool(
    "shell_execute",
    {
      title: "Execute Shell Command",
      description: `Execute a shell command on the Mac. Uses tmux for session persistence — 
commands in the same session share working directory, env vars, etc.

Args:
  - command: Shell command to execute
  - session: tmux session name (default "default"). Same session = persistent state
  - timeout_ms: Timeout in milliseconds (default 60000)
  - confirm_dangerous: Set true to run commands matching dangerous patterns (rm -rf /, etc.)

Returns:
  { stdout, stderr, exit_code, session }`,
      inputSchema: {
        command: z.string().min(1).describe("Shell command to execute"),
        session: z.string().default("default").describe("tmux session name for persistent state"),
        timeout_ms: z.number().int().min(1000).max(600000).default(60000).describe("Timeout in ms"),
        confirm_dangerous: z.boolean().default(false).describe("Confirm execution of dangerous commands"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ command, session, timeout_ms, confirm_dangerous }) => {
      // Safety check
      if (!confirm_dangerous) {
        const danger = isDangerous(command);
        if (danger) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: danger }) }],
          };
        }
      }

      // Ensure tmux session exists
      const sessionName = `mcp-${session}`;
      await runShellCommand(
        `tmux has-session -t ${sessionName} 2>/dev/null || tmux new-session -d -s ${sessionName}`,
        { timeout: 5000 }
      );

      // Execute in tmux session and capture output
      // We use a temp file approach for reliable output capture
      const tmpFile = `/tmp/mcp-shell-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const wrappedCmd = `tmux send-keys -t ${sessionName} '${command.replace(/'/g, "'\\''")} > ${tmpFile}.out 2> ${tmpFile}.err; echo $? > ${tmpFile}.rc' Enter`;

      await runShellCommand(wrappedCmd, { timeout: 5000 });

      // Wait for completion
      const waitStart = Date.now();
      let exitCode = -1;
      while (Date.now() - waitStart < timeout_ms) {
        const rcCheck = await runShellCommand(`cat ${tmpFile}.rc 2>/dev/null`, { timeout: 2000 });
        if (rcCheck.stdout.trim() !== "") {
          exitCode = parseInt(rcCheck.stdout.trim(), 10);
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      let stdout = "";
      let stderr = "";
      if (exitCode >= 0) {
        const outResult = await runShellCommand(`cat ${tmpFile}.out 2>/dev/null`, { timeout: 5000 });
        const errResult = await runShellCommand(`cat ${tmpFile}.err 2>/dev/null`, { timeout: 5000 });
        stdout = outResult.stdout;
        stderr = errResult.stdout;
      } else {
        stderr = `Command timed out after ${timeout_ms}ms`;
        exitCode = 124;
      }

      // Cleanup
      await runShellCommand(`rm -f ${tmpFile}.out ${tmpFile}.err ${tmpFile}.rc`, { timeout: 2000 });

      const output = { stdout, stderr, exit_code: exitCode, session: sessionName };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      };
    }
  );

  // ── shell_execute_simple (no tmux, single shot) ─────────────
  server.registerTool(
    "shell_execute_simple",
    {
      title: "Execute Simple Shell Command",
      description: `Execute a one-off shell command without tmux session persistence. 
Faster than shell_execute for simple commands.

Args:
  - command: Shell command to execute
  - cwd: Working directory (optional)
  - timeout_ms: Timeout in ms (default 60000)
  - confirm_dangerous: Confirm dangerous commands

Returns:
  { stdout, stderr, exit_code }`,
      inputSchema: {
        command: z.string().min(1).describe("Shell command to execute"),
        cwd: z.string().optional().describe("Working directory"),
        timeout_ms: z.number().int().min(1000).max(600000).default(60000).describe("Timeout in ms"),
        confirm_dangerous: z.boolean().default(false).describe("Confirm dangerous commands"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ command, cwd, timeout_ms, confirm_dangerous }) => {
      if (!confirm_dangerous) {
        const danger = isDangerous(command);
        if (danger) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: danger }) }],
          };
        }
      }

      const result = await runShellCommand(command, { timeout: timeout_ms, cwd });
      const output = {
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      };
    }
  );

  // ── list_sessions ───────────────────────────────────────────
  server.registerTool(
    "shell_list_sessions",
    {
      title: "List Shell Sessions",
      description: `List active tmux sessions managed by this MCP server.

Returns:
  { sessions: [{ name, created, attached }] }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const result = await runShellCommand(
        "tmux list-sessions -F '#{session_name}|#{session_created}|#{session_attached}' 2>/dev/null | grep '^mcp-'",
        { timeout: 5000 }
      );
      const sessions = result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [name, created, attached] = line.split("|");
          return {
            name: name?.replace("mcp-", ""),
            created: created ? new Date(parseInt(created, 10) * 1000).toISOString() : "unknown",
            attached: attached === "1",
          };
        });
      return {
        content: [{ type: "text", text: JSON.stringify({ sessions }, null, 2) }],
      };
    }
  );

  // ── kill_session ────────────────────────────────────────────
  server.registerTool(
    "shell_kill_session",
    {
      title: "Kill Shell Session",
      description: `Kill a specific tmux session or all MCP sessions.

Args:
  - session: Session name to kill, or "all" to kill all MCP sessions

Returns:
  { killed: string[] }`,
      inputSchema: {
        session: z.string().default("all").describe('Session name or "all"'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ session }) => {
      const killed: string[] = [];
      if (session === "all") {
        const list = await runShellCommand(
          "tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^mcp-'",
          { timeout: 5000 }
        );
        for (const name of list.stdout.split("\n").filter(Boolean)) {
          await runShellCommand(`tmux kill-session -t '${name}'`, { timeout: 3000 });
          killed.push(name);
        }
      } else {
        const sessionName = `mcp-${session}`;
        await runShellCommand(`tmux kill-session -t '${sessionName}'`, { timeout: 3000 });
        killed.push(sessionName);
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ killed }, null, 2) }],
      };
    }
  );
}
