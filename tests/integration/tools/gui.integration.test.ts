import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async (cmd: string) => {
    if (cmd.includes("screencapture")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("sips")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("python3") && cmd.includes("mouseLocation")) return { stdout: "500,300\n", stderr: "", exitCode: 0 };
    if (cmd.includes("python3") && cmd.includes("mainScreen")) return { stdout: "2560,1600\n", stderr: "", exitCode: 0 };
    if (cmd.includes("python3") && cmd.includes("CGPointMake")) return { stdout: "ok\n", stderr: "", exitCode: 0 };
    if (cmd.includes("python3") && cmd.includes("CGEventCreateScrollWheelEvent")) return { stdout: "ok\n", stderr: "", exitCode: 0 };
    if (cmd.includes("python3")) return { stdout: "ok\n", stderr: "", exitCode: 0 };
    if (cmd.includes("system_profiler")) return { stdout: '["2560 x 1600"]', stderr: "", exitCode: 0 };
    if (cmd.includes("sw_vers")) return { stdout: "14.5\n", stderr: "", exitCode: 0 };
    if (cmd.includes("hostname")) return { stdout: "Mac\n", stderr: "", exitCode: 0 };
    if (cmd.includes("whoami")) return { stdout: "u\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep")) return { stdout: "active\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux") && cmd.includes("wc")) return { stdout: "0\n", stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 0 };
  }),
  runOsascript: vi.fn(async () => ({ stdout: "ok", stderr: "" })),
  runOsascriptJXA: vi.fn(async () => ({ stdout: "[]", stderr: "" })),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("FAKE_PNG_DATA_FOR_TEST")),
  writeFile: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ size: 1, mtime: new Date(), isDirectory: () => false })),
  rename: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

import { createTestServer, callTool, type TestServer } from "../../helpers/server.js";
import { registerGuiTools } from "../../../src/tools/gui.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const API_KEY = "gui-test-key";

describe("GUI Tools Integration", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await createTestServer((s: McpServer) => registerGuiTools(s), API_KEY);
  });
  afterAll(async () => { await server.close(); });

  // ── gui_screenshot ─────────────────────────────────────────
  describe("gui_screenshot", () => {
    it("should capture screenshot with defaults", async () => {
      const r = await callTool(server.url, "gui_screenshot", {}, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should return image content type", async () => {
      const r = await callTool(server.url, "gui_screenshot", {}, API_KEY);
      const body = r.body as { result?: { content?: Array<{ type?: string }> } };
      expect(body.result?.content?.[0]?.type).toBe("image");
    });

    it("should accept region parameter", async () => {
      const r = await callTool(server.url, "gui_screenshot", {
        region: { x: 0, y: 0, width: 800, height: 600 },
      }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should accept display parameter", async () => {
      const r = await callTool(server.url, "gui_screenshot", { display: 2 }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should accept max_width parameter", async () => {
      const r = await callTool(server.url, "gui_screenshot", { max_width: 800 }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "gui_screenshot", {});
      expect(r.status).toBe(401);
    });

    [640, 800, 1024, 1280, 1920, 2560].forEach((w) => {
      it(`should accept max_width=${w}`, async () => {
        const r = await callTool(server.url, "gui_screenshot", { max_width: w }, API_KEY);
        expect(r.status).toBe(200);
      });
    });
  });

  // ── gui_mouse_click ────────────────────────────────────────
  describe("gui_mouse_click", () => {
    it("should click at coordinates", async () => {
      const r = await callTool(server.url, "gui_mouse_click", { x: 100, y: 200 }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should return success with coordinates", async () => {
      const r = await callTool(server.url, "gui_mouse_click", { x: 500, y: 300 }, API_KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) {
        const p = JSON.parse(text);
        expect(p.success).toBe(true);
        expect(p.x).toBe(500);
        expect(p.y).toBe(300);
      }
    });

    it("should support right click", async () => {
      const r = await callTool(server.url, "gui_mouse_click", { x: 100, y: 100, button: "right" }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should support double click", async () => {
      const r = await callTool(server.url, "gui_mouse_click", { x: 100, y: 100, clicks: 2 }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should support triple click", async () => {
      const r = await callTool(server.url, "gui_mouse_click", { x: 100, y: 100, clicks: 3 }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "gui_mouse_click", { x: 0, y: 0 });
      expect(r.status).toBe(401);
    });

    // Coordinate edge cases
    const coords = [
      { x: 0, y: 0 }, { x: 1920, y: 1080 }, { x: 2560, y: 1600 },
      { x: 1, y: 1 }, { x: 100, y: 100 },
    ];
    coords.forEach(({ x, y }) => {
      it(`should accept coords (${x},${y})`, async () => {
        const r = await callTool(server.url, "gui_mouse_click", { x, y }, API_KEY);
        expect(r.status).toBe(200);
      });
    });
  });

  // ── gui_mouse_move ─────────────────────────────────────────
  describe("gui_mouse_move", () => {
    it("should move mouse", async () => {
      const r = await callTool(server.url, "gui_mouse_move", { x: 500, y: 500 }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should return success", async () => {
      const r = await callTool(server.url, "gui_mouse_move", { x: 100, y: 100 }, API_KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) expect(JSON.parse(text).success).toBe(true);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "gui_mouse_move", { x: 0, y: 0 });
      expect(r.status).toBe(401);
    });
  });

  // ── gui_mouse_scroll ───────────────────────────────────────
  describe("gui_mouse_scroll", () => {
    it("should scroll down", async () => {
      const r = await callTool(server.url, "gui_mouse_scroll", { x: 500, y: 500, delta_y: 5 }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should scroll up (negative)", async () => {
      const r = await callTool(server.url, "gui_mouse_scroll", { x: 500, y: 500, delta_y: -5 }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "gui_mouse_scroll", { x: 0, y: 0, delta_y: 1 });
      expect(r.status).toBe(401);
    });
  });

  // ── gui_keyboard_type ──────────────────────────────────────
  describe("gui_keyboard_type", () => {
    it("should type text", async () => {
      const r = await callTool(server.url, "gui_keyboard_type", { text: "hello" }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should return text length", async () => {
      const r = await callTool(server.url, "gui_keyboard_type", { text: "abc" }, API_KEY);
      const body = r.body as { result?: { content?: Array<{ text?: string }> } };
      const text = body.result?.content?.[0]?.text;
      if (text) expect(JSON.parse(text).length).toBe(3);
    });

    it("should handle unicode", async () => {
      const r = await callTool(server.url, "gui_keyboard_type", { text: "日本語" }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should accept delay_ms", async () => {
      const r = await callTool(server.url, "gui_keyboard_type", { text: "hi", delay_ms: 10 }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "gui_keyboard_type", { text: "x" });
      expect(r.status).toBe(401);
    });

    const texts = ["hello world", "user@example.com", "p@$$w0rd!", "https://example.com", "line1\nline2"];
    texts.forEach((t) => {
      it(`should type: "${t.slice(0, 20)}"`, async () => {
        const r = await callTool(server.url, "gui_keyboard_type", { text: t }, API_KEY);
        expect(r.status).toBe(200);
      });
    });
  });

  // ── gui_keyboard_key ───────────────────────────────────────
  describe("gui_keyboard_key", () => {
    const keys = ["return", "tab", "escape", "space", "delete", "up", "down", "left", "right"];
    keys.forEach((key) => {
      it(`should press ${key}`, async () => {
        const r = await callTool(server.url, "gui_keyboard_key", { key }, API_KEY);
        expect(r.status).toBe(200);
      });
    });

    it("should press key with cmd modifier", async () => {
      const r = await callTool(server.url, "gui_keyboard_key", { key: "c", modifiers: ["command"] }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should press key with multiple modifiers", async () => {
      const r = await callTool(server.url, "gui_keyboard_key", { key: "s", modifiers: ["command", "shift"] }, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "gui_keyboard_key", { key: "return" });
      expect(r.status).toBe(401);
    });
  });

  // ── gui_get_mouse_position ─────────────────────────────────
  describe("gui_get_mouse_position", () => {
    it("should return position", async () => {
      const r = await callTool(server.url, "gui_get_mouse_position", {}, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "gui_get_mouse_position", {});
      expect(r.status).toBe(401);
    });
  });

  // ── gui_get_screen_size ────────────────────────────────────
  describe("gui_get_screen_size", () => {
    it("should return screen dimensions", async () => {
      const r = await callTool(server.url, "gui_get_screen_size", {}, API_KEY);
      expect(r.status).toBe(200);
    });

    it("should reject without auth", async () => {
      const r = await callTool(server.url, "gui_get_screen_size", {});
      expect(r.status).toBe(401);
    });
  });
});
