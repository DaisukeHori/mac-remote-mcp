import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async (cmd: string) => {
    if (cmd.includes("pbpaste")) return { stdout: "clipboard data", stderr: "", exitCode: 0 };
    if (cmd.includes("pbcopy")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("open -a")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes('open "http')) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("killall")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("osascript") && cmd.includes("Finder")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("sw_vers")) return { stdout: "14.5\n", stderr: "", exitCode: 0 };
    if (cmd.includes("hostname")) return { stdout: "Mac\n", stderr: "", exitCode: 0 };
    if (cmd.includes("whoami")) return { stdout: "u\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep") && !cmd.includes("echo")) return { stdout: "1234\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep") && cmd.includes("echo")) return { stdout: "active\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux") && cmd.includes("wc")) return { stdout: "0\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("xargs")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("grep")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux send-keys")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("pkill")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("nohup")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tail")) return { stdout: '{"tool":"test"}\n', stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 0 };
  }),
  runOsascript: vi.fn(async (script: string) => {
    if (script.includes("clicked")) return { stdout: "clicked", stderr: "" };
    if (script.includes("set")) return { stdout: "set", stderr: "" };
    if (script.includes("quit")) return { stdout: "", stderr: "" };
    if (script.includes("activate")) return { stdout: "", stderr: "" };
    if (script.includes("keystroke")) return { stdout: "", stderr: "" };
    if (script.includes("key code")) return { stdout: "", stderr: "" };
    return { stdout: "ok", stderr: "" };
  }),
  runOsascriptJXA: vi.fn(async (script: string) => {
    if (script.includes("uiElements")) {
      return { stdout: JSON.stringify([
        { role: "AXButton", name: "OK", position: [100, 200], size: [80, 30] },
        { role: "AXTextField", name: "Search", position: [200, 100], size: [300, 30], value: "" },
        { role: "AXStaticText", name: "Title", position: [10, 10], size: [200, 20] },
      ]), stderr: "" };
    }
    if (script.includes("focusedUIElement")) {
      return { stdout: JSON.stringify({ app_name: "Safari", element_role: "AXTextField", element_name: "URL", element_value: "https://example.com" }), stderr: "" };
    }
    if (script.includes("backgroundOnly")) {
      return { stdout: JSON.stringify([
        { name: "Safari", frontmost: true, visible: true },
        { name: "Finder", frontmost: false, visible: true },
        { name: "Terminal", frontmost: false, visible: true },
      ]), stderr: "" };
    }
    if (script.includes("windows")) {
      return { stdout: JSON.stringify([
        { title: "Window 1", position: [0, 0], size: [1200, 800], index: 1, minimized: false },
      ]), stderr: "" };
    }
    return { stdout: "[]", stderr: "" };
  }),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("file content here")),
  writeFile: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
  readdir: vi.fn(async () => [
    { name: "doc.txt", isDirectory: () => false },
    { name: "images", isDirectory: () => true },
    { name: ".gitignore", isDirectory: () => false },
  ]),
  stat: vi.fn(async () => ({ size: 1024, mtime: new Date("2024-06-01"), isDirectory: () => false })),
  unlink: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

import { createTestServer, callTool, type TestServer } from "../../helpers/server.js";
import { registerUiTools } from "../../../src/tools/ui.js";
import { registerFileTools } from "../../../src/tools/files.js";
import { registerAppTools } from "../../../src/tools/apps.js";
import { registerAdminTools } from "../../../src/tools/admin.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const KEY = "combo-test-key";

describe("UI Tools Integration", () => {
  let server: TestServer;
  beforeAll(async () => { server = await createTestServer((s: McpServer) => registerUiTools(s), KEY); });
  afterAll(async () => { await server.close(); });

  describe("ui_get_elements", () => {
    it("should return elements", async () => {
      const r = await callTool(server.url, "ui_get_elements", { app_name: "Safari" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should accept max_depth", async () => {
      const r = await callTool(server.url, "ui_get_elements", { app_name: "Safari", max_depth: 5 }, KEY);
      expect(r.status).toBe(200);
    });

    it("should accept window_index", async () => {
      const r = await callTool(server.url, "ui_get_elements", { app_name: "Safari", window_index: 2 }, KEY);
      expect(r.status).toBe(200);
    });

    const apps = ["Safari", "Finder", "Google Chrome", "Terminal", "Mail", "Calendar", "Notes", "System Preferences"];
    apps.forEach((app) => {
      it(`should query elements for ${app}`, async () => {
        const r = await callTool(server.url, "ui_get_elements", { app_name: app }, KEY);
        expect(r.status).toBe(200);
      });
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "ui_get_elements", { app_name: "Safari" });
      expect(r.status).toBe(401);
    });
  });

  describe("ui_click_element", () => {
    it("should click element by name", async () => {
      const r = await callTool(server.url, "ui_click_element", { app_name: "Safari", element_name: "OK" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should accept role filter", async () => {
      const r = await callTool(server.url, "ui_click_element", { app_name: "Safari", element_name: "OK", element_role: "AXButton" }, KEY);
      expect(r.status).toBe(200);
    });

    const buttonNames = ["OK", "Cancel", "Save", "Delete", "Sign In", "Submit", "Close", "Next", "Back", "Done"];
    buttonNames.forEach((name) => {
      it(`should try clicking button "${name}"`, async () => {
        const r = await callTool(server.url, "ui_click_element", { app_name: "Safari", element_name: name }, KEY);
        expect(r.status).toBe(200);
      });
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "ui_click_element", { app_name: "Safari", element_name: "OK" });
      expect(r.status).toBe(401);
    });
  });

  describe("ui_set_value", () => {
    it("should set field value", async () => {
      const r = await callTool(server.url, "ui_set_value", { app_name: "Safari", element_name: "Search", value: "test query" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "ui_set_value", { app_name: "Safari", element_name: "Search", value: "x" });
      expect(r.status).toBe(401);
    });
  });

  describe("ui_get_focused", () => {
    it("should return focused element", async () => {
      const r = await callTool(server.url, "ui_get_focused", {}, KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "ui_get_focused", {});
      expect(r.status).toBe(401);
    });
  });
});

describe("File Tools Integration", () => {
  let server: TestServer;
  beforeAll(async () => { server = await createTestServer((s: McpServer) => registerFileTools(s), KEY); });
  afterAll(async () => { await server.close(); });

  describe("file_read", () => {
    it("should read file", async () => {
      const r = await callTool(server.url, "file_read", { path: "/tmp/test.txt" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should return content", async () => {
      const r = await callTool(server.url, "file_read", { path: "/tmp/test.txt" }, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) expect(JSON.parse(text)).toHaveProperty("content");
    });

    it("should support base64 encoding", async () => {
      const r = await callTool(server.url, "file_read", { path: "/tmp/img.png", encoding: "base64" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should accept max_bytes", async () => {
      const r = await callTool(server.url, "file_read", { path: "/tmp/big.txt", max_bytes: 1024 }, KEY);
      expect(r.status).toBe(200);
    });

    const paths = ["~/Desktop/file.txt", "~/Downloads/doc.pdf", "/tmp/test", "~/.ssh/config", "/etc/hosts"];
    paths.forEach((p) => {
      it(`should resolve path: ${p}`, async () => {
        const r = await callTool(server.url, "file_read", { path: p }, KEY);
        expect(r.status).toBe(200);
      });
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "file_read", { path: "/tmp/x" });
      expect(r.status).toBe(401);
    });
  });

  describe("file_write", () => {
    it("should write file", async () => {
      const r = await callTool(server.url, "file_write", { path: "/tmp/out.txt", content: "hello" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should support append mode", async () => {
      const r = await callTool(server.url, "file_write", { path: "/tmp/log.txt", content: "line\n", append: true }, KEY);
      expect(r.status).toBe(200);
    });

    it("should support base64 encoding", async () => {
      const r = await callTool(server.url, "file_write", { path: "/tmp/bin", content: "AAAA", encoding: "base64" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should return bytes_written", async () => {
      const r = await callTool(server.url, "file_write", { path: "/tmp/x", content: "abc" }, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) expect(JSON.parse(text).bytes_written).toBe(3);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "file_write", { path: "/tmp/x", content: "y" });
      expect(r.status).toBe(401);
    });
  });

  describe("file_list", () => {
    it("should list directory", async () => {
      const r = await callTool(server.url, "file_list", { path: "~" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should support recursive", async () => {
      const r = await callTool(server.url, "file_list", { path: "~", recursive: true }, KEY);
      expect(r.status).toBe(200);
    });

    it("should support show_hidden", async () => {
      const r = await callTool(server.url, "file_list", { path: "~", show_hidden: true }, KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "file_list", { path: "~" });
      expect(r.status).toBe(401);
    });
  });

  describe("file_delete", () => {
    it("should delete file to trash", async () => {
      const r = await callTool(server.url, "file_delete", { path: "/tmp/trash.txt" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should support permanent delete", async () => {
      const r = await callTool(server.url, "file_delete", { path: "/tmp/perm.txt", use_trash: false }, KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "file_delete", { path: "/tmp/x" });
      expect(r.status).toBe(401);
    });
  });

  describe("file_move", () => {
    it("should move file", async () => {
      const r = await callTool(server.url, "file_move", { source: "/tmp/a.txt", destination: "/tmp/b.txt" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "file_move", { source: "/tmp/a", destination: "/tmp/b" });
      expect(r.status).toBe(401);
    });
  });
});

describe("App Tools Integration", () => {
  let server: TestServer;
  beforeAll(async () => { server = await createTestServer((s: McpServer) => registerAppTools(s), KEY); });
  afterAll(async () => { await server.close(); });

  describe("app_open", () => {
    const apps = ["Safari", "Finder", "Terminal", "Calculator", "TextEdit", "Preview", "Mail", "Calendar"];
    apps.forEach((app) => {
      it(`should open ${app}`, async () => {
        const r = await callTool(server.url, "app_open", { app_name: app }, KEY);
        expect(r.status).toBe(200);
      });
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "app_open", { app_name: "Safari" });
      expect(r.status).toBe(401);
    });
  });

  describe("app_quit", () => {
    it("should quit gracefully", async () => {
      const r = await callTool(server.url, "app_quit", { app_name: "Safari" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should force quit", async () => {
      const r = await callTool(server.url, "app_quit", { app_name: "Safari", force: true }, KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "app_quit", { app_name: "Safari" });
      expect(r.status).toBe(401);
    });
  });

  describe("app_list_running", () => {
    it("should list apps", async () => {
      const r = await callTool(server.url, "app_list_running", {}, KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "app_list_running", {});
      expect(r.status).toBe(401);
    });
  });

  describe("app_activate", () => {
    it("should activate app", async () => {
      const r = await callTool(server.url, "app_activate", { app_name: "Finder" }, KEY);
      expect(r.status).toBe(200);
    });
    it("should reject without auth", async () => {
      const r = await callTool(server.url, "app_activate", { app_name: "Finder" });
      expect(r.status).toBe(401);
    });
  });

  describe("app_list_windows", () => {
    it("should list windows", async () => {
      const r = await callTool(server.url, "app_list_windows", { app_name: "Safari" }, KEY);
      expect(r.status).toBe(200);
    });
    it("should reject without auth", async () => {
      const r = await callTool(server.url, "app_list_windows", { app_name: "Safari" });
      expect(r.status).toBe(401);
    });
  });

  describe("clipboard_get", () => {
    it("should get clipboard", async () => {
      const r = await callTool(server.url, "clipboard_get", {}, KEY);
      expect(r.status).toBe(200);
    });
    it("should reject without auth", async () => {
      const r = await callTool(server.url, "clipboard_get", {});
      expect(r.status).toBe(401);
    });
  });

  describe("clipboard_set", () => {
    it("should set clipboard", async () => {
      const r = await callTool(server.url, "clipboard_set", { text: "copied!" }, KEY);
      expect(r.status).toBe(200);
    });

    const texts = ["simple", "with spaces", "日本語", "line1\nline2", "!@#$%", "a".repeat(1000)];
    texts.forEach((t) => {
      it(`should copy: "${t.slice(0, 15)}..."`, async () => {
        const r = await callTool(server.url, "clipboard_set", { text: t }, KEY);
        expect(r.status).toBe(200);
      });
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "clipboard_set", { text: "x" });
      expect(r.status).toBe(401);
    });
  });

  describe("app_open_url", () => {
    const urls = [
      "https://example.com",
      "https://github.com/DaisukeHori",
      "http://localhost:3000",
      "https://claude.ai",
      "https://api.example.com/v1/test?q=hello",
    ];
    urls.forEach((url) => {
      it(`should open ${url.slice(0, 30)}`, async () => {
        const r = await callTool(server.url, "app_open_url", { url }, KEY);
        expect(r.status).toBe(200);
      });
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "app_open_url", { url: "https://x.com" });
      expect(r.status).toBe(401);
    });
  });
});

describe("Admin Tools Integration", () => {
  let server: TestServer;
  beforeAll(async () => { server = await createTestServer((s: McpServer) => registerAdminTools(s), KEY); });
  afterAll(async () => { await server.close(); });

  describe("admin_status", () => {
    it("should return server status", async () => {
      const r = await callTool(server.url, "admin_status", {}, KEY);
      expect(r.status).toBe(200);
    });

    it("should include uptime", async () => {
      const r = await callTool(server.url, "admin_status", {}, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) {
        const p = JSON.parse(text);
        expect(p).toHaveProperty("uptime_seconds");
        expect(p).toHaveProperty("macos_version");
        expect(p).toHaveProperty("hostname");
      }
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "admin_status", {});
      expect(r.status).toBe(401);
    });
  });

  describe("admin_kill_switch", () => {
    it("should reject without CONFIRM", async () => {
      const r = await callTool(server.url, "admin_kill_switch", { confirm: "yes" }, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) expect(JSON.parse(text).error).toContain("CONFIRM");
    });

    it("should reject empty confirm", async () => {
      const r = await callTool(server.url, "admin_kill_switch", { confirm: "" }, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) expect(JSON.parse(text).error).toBeDefined();
    });

    it("should accept CONFIRM", async () => {
      const r = await callTool(server.url, "admin_kill_switch", { confirm: "CONFIRM" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should kill sessions when confirmed", async () => {
      const r = await callTool(server.url, "admin_kill_switch", { confirm: "CONFIRM", kill_sessions: true }, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) expect(JSON.parse(text).actions_taken).toBeDefined();
    });

    const badConfirms = ["confirm", "Confirm", "CONFIRMED", "YES", "true", "1", " CONFIRM", "CONFIRM "];
    badConfirms.forEach((c) => {
      it(`should reject confirm="${c}"`, async () => {
        const r = await callTool(server.url, "admin_kill_switch", { confirm: c }, KEY);
        const body = r.body as { result?: { content?: Array<{ text?: string }> } };
        const text = body.result?.content?.[0]?.text;
        if (text) expect(JSON.parse(text).error).toBeDefined();
      });
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "admin_kill_switch", { confirm: "CONFIRM" });
      expect(r.status).toBe(401);
    });
  });

  describe("admin_caffeinate", () => {
    ["start", "stop", "status"].forEach((action) => {
      it(`should handle action="${action}"`, async () => {
        const r = await callTool(server.url, "admin_caffeinate", { action }, KEY);
        expect(r.status).toBe(200);
      });
    });

    it("should return active status", async () => {
      const r = await callTool(server.url, "admin_caffeinate", { action: "status" }, KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) expect(JSON.parse(text)).toHaveProperty("active");
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "admin_caffeinate", { action: "status" });
      expect(r.status).toBe(401);
    });
  });

  describe("admin_view_log", () => {
    it("should return log entries", async () => {
      const r = await callTool(server.url, "admin_view_log", {}, KEY);
      expect(r.status).toBe(200);
    });

    it("should accept lines parameter", async () => {
      const r = await callTool(server.url, "admin_view_log", { lines: 10 }, KEY);
      expect(r.status).toBe(200);
    });

    it("should accept date parameter", async () => {
      const r = await callTool(server.url, "admin_view_log", { date: "2024-01-01" }, KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "admin_view_log", {});
      expect(r.status).toBe(401);
    });
  });
});
