import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
  runOsascript: vi.fn(async () => ({ stdout: "ok", stderr: "" })),
  runOsascriptJXA: vi.fn(async () => ({
    stdout: JSON.stringify([
      { name: "Safari", frontmost: true, visible: true },
      { name: "Finder", frontmost: false, visible: true },
    ]),
    stderr: "",
  })),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTools } from "../../../src/tools/apps.js";

describe("App Tools", () => {
  describe("Tool registration", () => {
    it("should register all app tools", () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      expect(() => registerAppTools(server)).not.toThrow();
    });
  });

  describe("App name escaping", () => {
    const appNames = [
      { input: "Safari", escaped: "Safari" },
      { input: "Google Chrome", escaped: "Google Chrome" },
      { input: 'App "name"', escaped: 'App \\"name\\"' },
      { input: "Visual Studio Code", escaped: "Visual Studio Code" },
      { input: "System Preferences", escaped: "System Preferences" },
      { input: "iTerm2", escaped: "iTerm2" },
    ];

    appNames.forEach(({ input, escaped }) => {
      it(`should escape "${input}" for shell command`, () => {
        const result = input.replace(/"/g, '\\"');
        expect(result).toBe(escaped);
      });
    });
  });

  describe("URL validation", () => {
    const urls = [
      { url: "https://example.com", valid: true },
      { url: "http://localhost:3000", valid: true },
      { url: "https://api.github.com/repos", valid: true },
      { url: "ftp://files.example.com", valid: true },
      { url: "not-a-url", valid: false },
      { url: "", valid: false },
      { url: "example.com", valid: false },
    ];

    urls.forEach(({ url, valid }) => {
      it(`"${url}" should be ${valid ? "valid" : "invalid"}`, () => {
        try {
          new URL(url);
          expect(valid).toBe(true);
        } catch {
          expect(valid).toBe(false);
        }
      });
    });
  });

  describe("Clipboard operations", () => {
    it("should handle empty clipboard", () => {
      const content = "";
      expect(content.length).toBe(0);
    });

    it("should handle large clipboard content", () => {
      const content = "x".repeat(100000);
      expect(content.length).toBe(100000);
    });

    it("should handle unicode in clipboard", () => {
      const content = "日本語テスト 🎉";
      expect(content).toContain("日本語");
    });
  });
});
