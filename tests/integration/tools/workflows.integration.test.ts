import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async (cmd: string) => {
    if (cmd.includes("tmux has-session")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux new-session")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux send-keys")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("wc")) return { stdout: "1\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("grep")) return { stdout: "mcp-default|1700000000|0\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("xargs")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux kill-session")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes(".rc")) return { stdout: "0\n", stderr: "", exitCode: 0 };
    if (cmd.includes(".out")) return { stdout: "output\n", stderr: "", exitCode: 0 };
    if (cmd.includes(".err")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("rm -f /tmp")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("screencapture")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("sips")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("python3") && cmd.includes("mouseLocation")) return { stdout: "400,300\n", stderr: "", exitCode: 0 };
    if (cmd.includes("python3") && cmd.includes("mainScreen")) return { stdout: "1920,1080\n", stderr: "", exitCode: 0 };
    if (cmd.includes("python3")) return { stdout: "ok\n", stderr: "", exitCode: 0 };
    if (cmd.includes("system_profiler")) return { stdout: '["1920 x 1080"]', stderr: "", exitCode: 0 };
    if (cmd.includes("pbpaste")) return { stdout: "clip", stderr: "", exitCode: 0 };
    if (cmd.includes("pbcopy")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("open ")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("killall")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("sw_vers")) return { stdout: "14.5\n", stderr: "", exitCode: 0 };
    if (cmd.includes("hostname")) return { stdout: "Mac\n", stderr: "", exitCode: 0 };
    if (cmd.includes("whoami")) return { stdout: "u\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep") && cmd.includes("echo")) return { stdout: "active\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep")) return { stdout: "999\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pkill")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("nohup")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tail")) return { stdout: '{"tool":"t"}\n', stderr: "", exitCode: 0 };
    if (cmd.includes("osascript") && cmd.includes("Finder")) return { stdout: "", stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 0 };
  }),
  runOsascript: vi.fn(async (script: string) => {
    if (script.includes("clicked")) return { stdout: "clicked", stderr: "" };
    if (script.includes('"set"')) return { stdout: "set", stderr: "" };
    return { stdout: "ok", stderr: "" };
  }),
  runOsascriptJXA: vi.fn(async () => ({
    stdout: JSON.stringify([{ role: "AXButton", name: "OK", position: [100, 200], size: [80, 30] }]),
    stderr: "",
  })),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("test content")),
  writeFile: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
  readdir: vi.fn(async () => [
    { name: "a.txt", isDirectory: () => false },
    { name: "sub", isDirectory: () => true },
  ]),
  stat: vi.fn(async () => ({ size: 100, mtime: new Date("2024-06-01"), isDirectory: () => false })),
  unlink: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

import { createTestServer, callTool, type TestServer } from "../../helpers/server.js";
import { registerShellTools } from "../../../src/tools/shell.js";
import { registerGuiTools } from "../../../src/tools/gui.js";
import { registerUiTools } from "../../../src/tools/ui.js";
import { registerFileTools } from "../../../src/tools/files.js";
import { registerAppTools } from "../../../src/tools/apps.js";
import { registerAdminTools } from "../../../src/tools/admin.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const KEY = "workflow-key";
function all(s: McpServer) {
  registerShellTools(s); registerGuiTools(s); registerUiTools(s);
  registerFileTools(s); registerAppTools(s); registerAdminTools(s);
}

describe("Cross-Tool Workflows", () => {
  let srv: TestServer;
  beforeAll(async () => { srv = await createTestServer(all, KEY); });
  afterAll(async () => { await srv.close(); });

  describe("Screenshot → Click workflow", () => {
    it("screenshot then click at center", async () => {
      const ss = await callTool(srv.url, "gui_screenshot", {}, KEY);
      expect(ss.status).toBe(200);
      const click = await callTool(srv.url, "gui_mouse_click", { x: 960, y: 540 }, KEY);
      expect(click.status).toBe(200);
    });

    it("get screen size then screenshot", async () => {
      const size = await callTool(srv.url, "gui_get_screen_size", {}, KEY);
      expect(size.status).toBe(200);
      const ss = await callTool(srv.url, "gui_screenshot", { max_width: 800 }, KEY);
      expect(ss.status).toBe(200);
    });

    it("get elements then click element", async () => {
      const els = await callTool(srv.url, "ui_get_elements", { app_name: "Safari" }, KEY);
      expect(els.status).toBe(200);
      const click = await callTool(srv.url, "ui_click_element", { app_name: "Safari", element_name: "OK" }, KEY);
      expect(click.status).toBe(200);
    });
  });

  describe("Shell → File workflow", () => {
    it("execute command then write output to file", async () => {
      const exec = await callTool(srv.url, "shell_execute_simple", { command: "echo hello" }, KEY);
      expect(exec.status).toBe(200);
      const write = await callTool(srv.url, "file_write", { path: "/tmp/output.txt", content: "hello" }, KEY);
      expect(write.status).toBe(200);
    });

    it("read file then copy to clipboard", async () => {
      const read = await callTool(srv.url, "file_read", { path: "/tmp/test.txt" }, KEY);
      expect(read.status).toBe(200);
      const clip = await callTool(srv.url, "clipboard_set", { text: "file content" }, KEY);
      expect(clip.status).toBe(200);
    });

    it("list directory then read file", async () => {
      const list = await callTool(srv.url, "file_list", { path: "~" }, KEY);
      expect(list.status).toBe(200);
      const read = await callTool(srv.url, "file_read", { path: "~/a.txt" }, KEY);
      expect(read.status).toBe(200);
    });
  });

  describe("App → GUI workflow", () => {
    it("open app then take screenshot", async () => {
      const open = await callTool(srv.url, "app_open", { app_name: "Safari" }, KEY);
      expect(open.status).toBe(200);
      const ss = await callTool(srv.url, "gui_screenshot", {}, KEY);
      expect(ss.status).toBe(200);
    });

    it("activate app then type text", async () => {
      const act = await callTool(srv.url, "app_activate", { app_name: "TextEdit" }, KEY);
      expect(act.status).toBe(200);
      const type = await callTool(srv.url, "gui_keyboard_type", { text: "hello" }, KEY);
      expect(type.status).toBe(200);
    });

    it("open URL then get focused element", async () => {
      const url = await callTool(srv.url, "app_open_url", { url: "https://example.com" }, KEY);
      expect(url.status).toBe(200);
      const focused = await callTool(srv.url, "ui_get_focused", {}, KEY);
      expect(focused.status).toBe(200);
    });
  });

  describe("Admin workflows", () => {
    it("check status then enable caffeinate", async () => {
      const status = await callTool(srv.url, "admin_status", {}, KEY);
      expect(status.status).toBe(200);
      const caff = await callTool(srv.url, "admin_caffeinate", { action: "start" }, KEY);
      expect(caff.status).toBe(200);
    });

    it("create session then list then kill", async () => {
      const exec = await callTool(srv.url, "shell_execute", { command: "echo test", session: "workflow" }, KEY);
      expect(exec.status).toBe(200);
      const list = await callTool(srv.url, "shell_list_sessions", {}, KEY);
      expect(list.status).toBe(200);
      const kill = await callTool(srv.url, "shell_kill_session", { session: "workflow" }, KEY);
      expect(kill.status).toBe(200);
    });

    it("view log after operations", async () => {
      await callTool(srv.url, "shell_execute_simple", { command: "ls" }, KEY);
      const log = await callTool(srv.url, "admin_view_log", { lines: 5 }, KEY);
      expect(log.status).toBe(200);
    });
  });
});

describe("Response Format Validation", () => {
  let srv: TestServer;
  beforeAll(async () => { srv = await createTestServer(all, KEY); });
  afterAll(async () => { await srv.close(); });

  const toolsWithJsonResponse = [
    { tool: "shell_execute_simple", args: { command: "echo test" }, fields: ["stdout", "stderr", "exit_code"] },
    { tool: "gui_mouse_click", args: { x: 100, y: 100 }, fields: ["success"] },
    { tool: "gui_mouse_move", args: { x: 50, y: 50 }, fields: ["success"] },
    { tool: "gui_keyboard_type", args: { text: "hi" }, fields: ["success", "length"] },
    { tool: "gui_keyboard_key", args: { key: "return" }, fields: ["success"] },
    { tool: "clipboard_set", args: { text: "test" }, fields: ["success"] },
    { tool: "app_open", args: { app_name: "Finder" }, fields: ["success"] },
    { tool: "app_open_url", args: { url: "https://example.com" }, fields: ["success"] },
    { tool: "file_write", args: { path: "/tmp/x.txt", content: "x" }, fields: ["success", "bytes_written"] },
    { tool: "file_read", args: { path: "/tmp/x.txt" }, fields: ["content", "size"] },
    { tool: "file_list", args: { path: "~" }, fields: ["entries"] },
  ];

  toolsWithJsonResponse.forEach(({ tool, args, fields }) => {
    it(`${tool} should return parseable JSON with fields: ${fields.join(",")}`, async () => {
      const r = await callTool(srv.url, tool, args, KEY);
      expect(r.status).toBe(200);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      expect(text).toBeDefined();
      if (text) {
        const parsed = JSON.parse(text);
        fields.forEach((f) => {
          expect(parsed).toHaveProperty(f);
        });
      }
    });
  });
});

describe("Concurrent Requests", () => {
  let srv: TestServer;
  beforeAll(async () => { srv = await createTestServer(all, KEY); });
  afterAll(async () => { await srv.close(); });

  it("should handle 5 concurrent shell commands", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      callTool(srv.url, "shell_execute_simple", { command: `echo concurrent_${i}` }, KEY)
    );
    const results = await Promise.all(promises);
    results.forEach((r) => expect(r.status).toBe(200));
  });

  it("should handle 5 concurrent screenshots", async () => {
    const promises = Array.from({ length: 5 }, () =>
      callTool(srv.url, "gui_screenshot", {}, KEY)
    );
    const results = await Promise.all(promises);
    results.forEach((r) => expect(r.status).toBe(200));
  });

  it("should handle mixed concurrent tools", async () => {
    const promises = [
      callTool(srv.url, "shell_execute_simple", { command: "echo 1" }, KEY),
      callTool(srv.url, "gui_get_mouse_position", {}, KEY),
      callTool(srv.url, "clipboard_get", {}, KEY),
      callTool(srv.url, "app_list_running", {}, KEY),
      callTool(srv.url, "admin_status", {}, KEY),
    ];
    const results = await Promise.all(promises);
    results.forEach((r) => expect(r.status).toBe(200));
  });

  it("should handle 10 concurrent auth checks", async () => {
    const promises = Array.from({ length: 10 }, () =>
      callTool(srv.url, "admin_status", {}, KEY)
    );
    const results = await Promise.all(promises);
    results.forEach((r) => expect(r.status).toBe(200));
  });

  it("should reject all concurrent unauthenticated requests", async () => {
    const promises = Array.from({ length: 5 }, () =>
      callTool(srv.url, "admin_status", {})
    );
    const results = await Promise.all(promises);
    results.forEach((r) => expect(r.status).toBe(401));
  });
});

describe("Edge Case Parameters", () => {
  let srv: TestServer;
  beforeAll(async () => { srv = await createTestServer(all, KEY); });
  afterAll(async () => { await srv.close(); });

  describe("shell edge cases", () => {
    const edgeCmds = [
      { cmd: "echo ''", desc: "empty string echo" },
      { cmd: "echo \"hello world\"", desc: "quoted string" },
      { cmd: "echo $HOME", desc: "env variable" },
      { cmd: "echo `date`", desc: "backtick" },
      { cmd: "true", desc: "true command" },
      { cmd: "false || true", desc: "chained with fallback" },
      { cmd: "echo -e 'line1\\nline2'", desc: "multiline" },
      { cmd: "cat /dev/null", desc: "empty input" },
      { cmd: "echo " + "x".repeat(1000), desc: "very long command" },
    ];
    edgeCmds.forEach(({ cmd, desc }) => {
      it(`should handle: ${desc}`, async () => {
        const r = await callTool(srv.url, "shell_execute_simple", { command: cmd }, KEY);
        expect(r.status).toBe(200);
      });
    });
  });

  describe("keyboard edge cases", () => {
    const keys = [
      { key: "a", mods: [], desc: "single char" },
      { key: "A", mods: [], desc: "uppercase" },
      { key: "1", mods: [], desc: "number" },
      { key: "return", mods: [], desc: "enter" },
      { key: "c", mods: ["command"], desc: "cmd+c" },
      { key: "v", mods: ["command"], desc: "cmd+v" },
      { key: "z", mods: ["command"], desc: "cmd+z" },
      { key: "a", mods: ["command"], desc: "cmd+a" },
      { key: "s", mods: ["command", "shift"], desc: "cmd+shift+s" },
      { key: "f", mods: ["command", "control"], desc: "cmd+ctrl+f" },
      { key: "q", mods: ["command"], desc: "cmd+q" },
      { key: "tab", mods: ["command"], desc: "cmd+tab" },
      { key: "space", mods: ["command"], desc: "cmd+space" },
      { key: "f5", mods: [], desc: "F5" },
      { key: "escape", mods: [], desc: "escape" },
    ];
    keys.forEach(({ key, mods, desc }) => {
      it(`should press: ${desc}`, async () => {
        const r = await callTool(srv.url, "gui_keyboard_key", { key, modifiers: mods }, KEY);
        expect(r.status).toBe(200);
      });
    });
  });

  describe("file path edge cases", () => {
    const paths = [
      "~/Desktop/file.txt",
      "~/Downloads/日本語ファイル.txt",
      "/tmp/space in name.txt",
      "~/.config/test",
      "/tmp/deep/nested/dir/file.txt",
      "~/file-with-dashes.txt",
      "~/file_with_underscores.txt",
    ];
    paths.forEach((p) => {
      it(`should handle path: ${p.slice(0, 30)}`, async () => {
        const r = await callTool(srv.url, "file_read", { path: p }, KEY);
        expect(r.status).toBe(200);
      });
    });
  });
});
