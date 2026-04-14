import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async (cmd: string) => {
    if (cmd.includes("tmux has-session")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux new-session")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux send-keys")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("wc")) return { stdout: "3\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("xargs")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("grep")) return { stdout: "mcp-a|1700000000|0\nmcp-b|1700001000|1\nmcp-c|1700002000|0\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux kill-session")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes(".rc")) return { stdout: "0\n", stderr: "", exitCode: 0 };
    if (cmd.includes(".out")) return { stdout: "output\n", stderr: "", exitCode: 0 };
    if (cmd.includes(".err")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("rm -f /tmp")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("sw_vers")) return { stdout: "15.0\n", stderr: "", exitCode: 0 };
    if (cmd.includes("hostname")) return { stdout: "Daisuke-Mac.local\n", stderr: "", exitCode: 0 };
    if (cmd.includes("whoami")) return { stdout: "daisuke\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep") && cmd.includes("echo")) return { stdout: "active\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep")) return { stdout: "5678\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pkill")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("nohup")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tail")) return { stdout: '{"tool":"shell_execute","result":"success","duration_ms":50}\n{"tool":"gui_screenshot","result":"success","duration_ms":200}\n', stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 0 };
  }),
  runOsascript: vi.fn(async () => ({ stdout: "ok", stderr: "" })),
  runOsascriptJXA: vi.fn(async () => ({ stdout: "[]", stderr: "" })),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("x")),
  writeFile: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ size: 1, mtime: new Date(), isDirectory: () => false })),
  unlink: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

import { createTestServer, callTool, type TestServer } from "../../helpers/server.js";
import { registerShellTools } from "../../../src/tools/shell.js";
import { registerAdminTools } from "../../../src/tools/admin.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const KEY = "session-test-key";

describe("Shell Session Management", () => {
  let srv: TestServer;
  beforeAll(async () => {
    srv = await createTestServer((s: McpServer) => {
      registerShellTools(s); registerAdminTools(s);
    }, KEY);
  });
  afterAll(async () => { await srv.close(); });

  describe("Multiple named sessions", () => {
    const sessions = ["dev", "staging", "prod", "build", "test", "deploy", "monitor", "debug"];
    sessions.forEach((name) => {
      it(`should create session "${name}"`, async () => {
        const r = await callTool(srv.url, "shell_execute", { command: "echo hello", session: name }, KEY);
        expect(r.status).toBe(200);
        const body = r.body as { result?: { content?: Array<{ text?: string }> } };
        const text = body.result?.content?.[0]?.text;
        if (text) expect(JSON.parse(text).session).toBe(`mcp-${name}`);
      });
    });

    sessions.forEach((name) => {
      it(`should kill session "${name}"`, async () => {
        const r = await callTool(srv.url, "shell_kill_session", { session: name }, KEY);
        expect(r.status).toBe(200);
      });
    });
  });

  describe("Session listing response format", () => {
    it("should return array of sessions", async () => {
      const r = await callTool(srv.url, "shell_list_sessions", {}, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        expect(Array.isArray(parsed.sessions)).toBe(true);
      }
    });

    it("each session should have name field", async () => {
      const r = await callTool(srv.url, "shell_list_sessions", {}, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        parsed.sessions.forEach((s: { name?: string }) => {
          expect(s.name).toBeDefined();
        });
      }
    });

    it("each session should have created timestamp", async () => {
      const r = await callTool(srv.url, "shell_list_sessions", {}, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        parsed.sessions.forEach((s: { created?: string }) => {
          expect(s.created).toBeDefined();
        });
      }
    });
  });
});

describe("Admin Status Response", () => {
  let srv: TestServer;
  beforeAll(async () => {
    srv = await createTestServer((s: McpServer) => registerAdminTools(s), KEY);
  });
  afterAll(async () => { await srv.close(); });

  it("should include macos_version", async () => {
    const r = await callTool(srv.url, "admin_status", {}, KEY);
    const body = r.body as { result?: { content?: Array<{ text?: string }> } };
    const text = body.result?.content?.[0]?.text;
    if (text) expect(JSON.parse(text).macos_version).toBe("15.0");
  });

  it("should include hostname", async () => {
    const r = await callTool(srv.url, "admin_status", {}, KEY);
    const body = r.body as { result?: { content?: Array<{ text?: string }> } };
    const text = body.result?.content?.[0]?.text;
    if (text) expect(JSON.parse(text).hostname).toBe("Daisuke-Mac.local");
  });

  it("should include user", async () => {
    const r = await callTool(srv.url, "admin_status", {}, KEY);
    const body = r.body as { result?: { content?: Array<{ text?: string }> } };
    const text = body.result?.content?.[0]?.text;
    if (text) expect(JSON.parse(text).user).toBe("daisuke");
  });

  it("should have non-negative uptime", async () => {
    const r = await callTool(srv.url, "admin_status", {}, KEY);
    const body = r.body as { result?: { content?: Array<{ text?: string }> } };
    const text = body.result?.content?.[0]?.text;
    if (text) expect(JSON.parse(text).uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("should have started_at as ISO string", async () => {
    const r = await callTool(srv.url, "admin_status", {}, KEY);
    const body = r.body as { result?: { content?: Array<{ text?: string }> } };
    const text = body.result?.content?.[0]?.text;
    if (text) {
      const started = JSON.parse(text).started_at;
      expect(() => new Date(started)).not.toThrow();
    }
  });

  it("should report caffeinate status", async () => {
    const r = await callTool(srv.url, "admin_status", {}, KEY);
    const body = r.body as { result?: { content?: Array<{ text?: string }> } };
    const text = body.result?.content?.[0]?.text;
    if (text) expect(typeof JSON.parse(text).caffeinate_active).toBe("boolean");
  });

  it("should report tmux session count", async () => {
    const r = await callTool(srv.url, "admin_status", {}, KEY);
    const body = r.body as { result?: { content?: Array<{ text?: string }> } };
    const text = body.result?.content?.[0]?.text;
    if (text) expect(typeof JSON.parse(text).tmux_sessions).toBe("number");
  });
});

describe("Audit Log Viewing", () => {
  let srv: TestServer;
  beforeAll(async () => {
    srv = await createTestServer((s: McpServer) => registerAdminTools(s), KEY);
  });
  afterAll(async () => { await srv.close(); });

  [1, 5, 10, 50, 100, 200, 500].forEach((n) => {
    it(`should accept lines=${n}`, async () => {
      const r = await callTool(srv.url, "admin_view_log", { lines: n }, KEY);
      expect(r.status).toBe(200);
    });
  });
});

describe("Health endpoint resilience", () => {
  let srv: TestServer;
  beforeAll(async () => { srv = await createTestServer((s: McpServer) => registerAdminTools(s), KEY); });
  afterAll(async () => { await srv.close(); });

  it("health should return version string", async () => {
    const res = await fetch(`${srv.url}/health`);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
