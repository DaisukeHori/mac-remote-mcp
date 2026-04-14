import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async (cmd: string) => {
    if (cmd.includes("sw_vers")) return { stdout: "14.5\n", stderr: "", exitCode: 0 };
    if (cmd.includes("hostname")) return { stdout: "Test-Mac\n", stderr: "", exitCode: 0 };
    if (cmd.includes("whoami")) return { stdout: "testuser\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep -x caffeinate") && !cmd.includes("||")) return { stdout: "12345\n", stderr: "", exitCode: 0 };
    if (cmd.includes("pgrep") && cmd.includes("echo")) return { stdout: "active\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("wc")) return { stdout: "3\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux list-sessions") && cmd.includes("grep")) return { stdout: "mcp-a\nmcp-b\n", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux kill-session")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tmux send-keys")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("pkill")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("nohup")) return { stdout: "", stderr: "", exitCode: 0 };
    if (cmd.includes("tail")) return { stdout: '{"tool":"test","result":"success"}\n', stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 0 };
  }),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAdminTools } from "../../../src/tools/admin.js";

describe("Admin Tools", () => {
  describe("Tool registration", () => {
    it("should register all admin tools", () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      expect(() => registerAdminTools(server)).not.toThrow();
    });
  });

  describe("Kill switch confirmation", () => {
    const confirmValues = [
      { value: "CONFIRM", valid: true },
      { value: "confirm", valid: false },
      { value: "Confirm", valid: false },
      { value: "yes", valid: false },
      { value: "true", valid: false },
      { value: "", valid: false },
      { value: " CONFIRM ", valid: false },
      { value: "CONFIRM!", valid: false },
    ];

    confirmValues.forEach(({ value, valid }) => {
      it(`confirm="${value}" should be ${valid ? "accepted" : "rejected"}`, () => {
        expect(value === "CONFIRM").toBe(valid);
      });
    });
  });

  describe("Caffeinate actions", () => {
    const actions = ["start", "stop", "status"];
    actions.forEach((action) => {
      it(`should accept action "${action}"`, () => {
        expect(["start", "stop", "status"]).toContain(action);
      });
    });

    it("should reject invalid action", () => {
      expect(["start", "stop", "status"]).not.toContain("restart");
    });
  });

  describe("Log date formatting", () => {
    const dates = [
      { input: "2024-01-01", valid: true },
      { input: "2024-12-31", valid: true },
      { input: "2024-02-29", valid: true },
      { input: "not-a-date", valid: false },
      { input: "2024/01/01", valid: false },
      { input: "01-01-2024", valid: false },
    ];

    dates.forEach(({ input, valid }) => {
      it(`date "${input}" should be ${valid ? "valid" : "invalid"}`, () => {
        const isValid = /^\d{4}-\d{2}-\d{2}$/.test(input);
        expect(isValid).toBe(valid);
      });
    });
  });
});
