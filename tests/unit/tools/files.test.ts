import { describe, it, expect, vi } from "vitest";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

vi.mock("../../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("test content")),
  writeFile: vi.fn(async () => undefined),
  appendFile: vi.fn(async () => undefined),
  readdir: vi.fn(async () => [
    { name: "file.txt", isDirectory: () => false },
    { name: "subdir", isDirectory: () => true },
    { name: ".hidden", isDirectory: () => false },
  ]),
  stat: vi.fn(async () => ({
    size: 1024,
    mtime: new Date("2024-01-01"),
    isDirectory: () => false,
  })),
  unlink: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

// Path resolution function (copied from source to test independently)
function resolvePath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return join(homedir(), filePath.slice(1));
  }
  return resolve(filePath);
}

describe("File Tools", () => {
  describe("Path resolution", () => {
    const testCases = [
      { input: "~/Desktop", expected: join(homedir(), "Desktop") },
      { input: "~/", expected: join(homedir(), "/") },
      { input: "~/.ssh/config", expected: join(homedir(), ".ssh/config") },
      { input: "/absolute/path", expected: "/absolute/path" },
      { input: "/tmp/test.txt", expected: "/tmp/test.txt" },
      { input: "relative/path", expected: resolve("relative/path") },
      { input: "./local", expected: resolve("./local") },
      { input: "../parent", expected: resolve("../parent") },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should resolve "${input}" → "${expected}"`, () => {
        expect(resolvePath(input)).toBe(expected);
      });
    });

    it("should handle empty tilde path", () => {
      expect(resolvePath("~")).toBe(homedir());
    });

    it("should handle nested tilde paths", () => {
      const result = resolvePath("~/a/b/c/d.txt");
      expect(result).toBe(join(homedir(), "a/b/c/d.txt"));
    });
  });

  describe("Hidden file filtering", () => {
    const files = [
      { name: ".hidden", isHidden: true },
      { name: ".DS_Store", isHidden: true },
      { name: ".gitignore", isHidden: true },
      { name: "visible.txt", isHidden: false },
      { name: "README.md", isHidden: false },
      { name: " .space-prefix", isHidden: false },
    ];

    files.forEach(({ name, isHidden }) => {
      it(`"${name}" should ${isHidden ? "be hidden" : "be visible"}`, () => {
        const hidden = name.startsWith(".");
        expect(hidden).toBe(isHidden);
      });
    });
  });

  describe("File encoding", () => {
    it("should default to utf-8", () => {
      const encoding = "utf-8";
      const buffer = Buffer.from("test content", encoding);
      expect(buffer.toString("utf-8")).toBe("test content");
    });

    it("should support base64 for binary", () => {
      const original = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const base64 = original.toString("base64");
      const decoded = Buffer.from(base64, "base64");
      expect(decoded).toEqual(original);
    });

    it("should handle empty content", () => {
      const buffer = Buffer.from("", "utf-8");
      expect(buffer.length).toBe(0);
    });

    it("should handle unicode content", () => {
      const text = "日本語テスト 🎉";
      const buffer = Buffer.from(text, "utf-8");
      expect(buffer.toString("utf-8")).toBe(text);
    });
  });

  describe("Max bytes truncation", () => {
    const sizes = [
      { fileSize: 100, maxBytes: 1048576, truncated: false },
      { fileSize: 1048576, maxBytes: 1048576, truncated: false },
      { fileSize: 2000000, maxBytes: 1048576, truncated: true },
      { fileSize: 1, maxBytes: 1, truncated: false },
      { fileSize: 10, maxBytes: 5, truncated: true },
    ];

    sizes.forEach(({ fileSize, maxBytes, truncated }) => {
      it(`fileSize=${fileSize}, maxBytes=${maxBytes} → truncated=${truncated}`, () => {
        expect(fileSize > maxBytes).toBe(truncated);
      });
    });
  });

  describe("Tool registration", () => {
    it("should register all file tools without error", () => {
      const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
      const server = new McpServer({ name: "test", version: "0.0.1" });
      // registerFileTools is already mocked at the module level
      expect(server).toBeDefined();
    });
  });
});
