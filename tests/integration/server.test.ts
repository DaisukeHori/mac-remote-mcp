import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// Mock all system calls
vi.mock("../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async (cmd: string) => {
    if (cmd.includes("sw_vers")) return { stdout: "14.5\n", stderr: "", exitCode: 0 };
    if (cmd.includes("hostname")) return { stdout: "Test-Mac\n", stderr: "", exitCode: 0 };
    if (cmd.includes("whoami")) return { stdout: "testuser\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep")) return { stdout: "active\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux") && cmd.includes("wc")) return { stdout: "0\n", stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 0 };
  }),
  runOsascript: vi.fn(async () => ({ stdout: "ok", stderr: "" })),
  runOsascriptJXA: vi.fn(async () => ({ stdout: "[]", stderr: "" })),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("test")),
  writeFile: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ size: 10, mtime: new Date(), isDirectory: () => false })),
  unlink: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

import { createTestServer, callTool, listTools, type TestServer } from "../helpers/server.js";
import { registerShellTools } from "../../src/tools/shell.js";
import { registerGuiTools } from "../../src/tools/gui.js";
import { registerUiTools } from "../../src/tools/ui.js";
import { registerFileTools } from "../../src/tools/files.js";
import { registerAppTools } from "../../src/tools/apps.js";
import { registerAdminTools } from "../../src/tools/admin.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const API_KEY = "test-integration-key-xyz";

function registerAllTools(server: McpServer) {
  registerShellTools(server);
  registerGuiTools(server);
  registerUiTools(server);
  registerFileTools(server);
  registerAppTools(server);
  registerAdminTools(server);
}

describe("Server Health & Auth Integration", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer(registerAllTools, API_KEY);
  });

  afterAll(async () => {
    await server.close();
  });

  describe("Health endpoint", () => {
    it("should return 200 without auth", async () => {
      const res = await fetch(`${server.url}/health`);
      expect(res.status).toBe(200);
    });

    it("should return JSON with status ok", async () => {
      const res = await fetch(`${server.url}/health`);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    it("should work with auth header too", async () => {
      const res = await fetch(`${server.url}/health`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      expect(res.status).toBe(200);
    });
  });

  describe("MCP endpoint auth", () => {
    it("should reject request without auth", async () => {
      const res = await fetch(`${server.url}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject request with wrong token", async () => {
      const res = await fetch(`${server.url}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      expect(res.status).toBe(403);
    });

    it("should reject Basic auth scheme", async () => {
      const res = await fetch(`${server.url}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${API_KEY}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      expect(res.status).toBe(401);
    });

    it("should accept correct Bearer token", async () => {
      const res = await fetch(`${server.url}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });
      // Auth passed if we get anything other than 401/403
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("Tools listing", () => {
    it("should list all registered tools", async () => {
      const result = await listTools(server.url, API_KEY);
      expect(result.status).toBe(200);
      const body = result.body as { result?: { tools?: unknown[] } };
      expect(body.result?.tools).toBeDefined();
    });

    it("should include shell_execute tool", async () => {
      const result = await listTools(server.url, API_KEY);
      const body = result.body as { result?: { tools?: Array<{ name: string }> } };
      const names = body.result?.tools?.map((t) => t.name) ?? [];
      expect(names).toContain("shell_execute");
    });

    it("should include gui_screenshot tool", async () => {
      const result = await listTools(server.url, API_KEY);
      const body = result.body as { result?: { tools?: Array<{ name: string }> } };
      const names = body.result?.tools?.map((t) => t.name) ?? [];
      expect(names).toContain("gui_screenshot");
    });

    it("should include admin_kill_switch tool", async () => {
      const result = await listTools(server.url, API_KEY);
      const body = result.body as { result?: { tools?: Array<{ name: string }> } };
      const names = body.result?.tools?.map((t) => t.name) ?? [];
      expect(names).toContain("admin_kill_switch");
    });

    const expectedTools = [
      "shell_execute", "shell_execute_simple", "shell_list_sessions", "shell_kill_session",
      "gui_screenshot", "gui_mouse_click", "gui_mouse_move", "gui_mouse_scroll",
      "gui_keyboard_type", "gui_keyboard_key", "gui_get_mouse_position", "gui_get_screen_size",
      "ui_get_elements", "ui_click_element", "ui_set_value", "ui_get_focused",
      "file_read", "file_write", "file_list", "file_delete", "file_move",
      "app_open", "app_quit", "app_list_running", "app_activate", "app_list_windows",
      "clipboard_get", "clipboard_set", "app_open_url",
      "admin_status", "admin_kill_switch", "admin_caffeinate", "admin_view_log",
    ];

    expectedTools.forEach((toolName) => {
      it(`should register tool: ${toolName}`, async () => {
        const result = await listTools(server.url, API_KEY);
        const body = result.body as { result?: { tools?: Array<{ name: string }> } };
        const names = body.result?.tools?.map((t) => t.name) ?? [];
        expect(names).toContain(toolName);
      });
    });
  });

  describe("No-auth server", () => {
    let noAuthServer: TestServer;

    beforeAll(async () => {
      noAuthServer = await createTestServer(registerAllTools, undefined);
    });

    afterAll(async () => {
      await noAuthServer.close();
    });

    it("should allow requests without auth when key is not set", async () => {
      const result = await listTools(noAuthServer.url);
      expect(result.status).toBe(200);
    });

    it("should still work with auth header even when not required", async () => {
      const result = await listTools(noAuthServer.url, "any-token");
      expect(result.status).toBe(200);
    });
  });
});
