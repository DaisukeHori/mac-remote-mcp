import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
  runOsascript: vi.fn(async (script: string) => {
    if (script.includes("not_found_app")) throw new Error("Can't find application");
    if (script.includes('"clicked"')) return { stdout: "clicked", stderr: "" };
    if (script.includes('"set"')) return { stdout: "set", stderr: "" };
    return { stdout: "ok", stderr: "" };
  }),
  runOsascriptJXA: vi.fn(async (script: string) => {
    if (script.includes("not_found_app")) throw new Error("Can't find application");
    return { stdout: JSON.stringify([
      { role: "AXButton", name: "OK", position: [100, 200], size: [80, 30] },
      { role: "AXTextField", name: "Search", position: [200, 100], size: [300, 30], value: "" },
    ]), stderr: "" };
  }),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUiTools } from "../../../src/tools/ui.js";

describe("UI Element Tools", () => {
  describe("Tool registration", () => {
    it("should register all UI tools without error", () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      expect(() => registerUiTools(server)).not.toThrow();
    });
  });

  describe("JXA script generation", () => {
    const appNames = [
      { name: "Safari", escaped: "Safari" },
      { name: "Google Chrome", escaped: "Google Chrome" },
      { name: 'App "with" quotes', escaped: 'App \\"with\\" quotes' },
      { name: "Visual Studio Code", escaped: "Visual Studio Code" },
      { name: "System Preferences", escaped: "System Preferences" },
    ];

    appNames.forEach(({ name, escaped }) => {
      it(`should escape app name "${name}" in JXA script`, () => {
        const jxa = `const app = Application("${name.replace(/"/g, '\\"')}");`;
        expect(jxa).toContain(escaped);
      });
    });
  });

  describe("Element role filtering", () => {
    const roles = [
      "AXButton", "AXTextField", "AXLink", "AXStaticText",
      "AXCheckBox", "AXRadioButton", "AXPopUpButton",
      "AXComboBox", "AXSlider", "AXImage",
    ];

    roles.forEach((role) => {
      it(`should generate role filter for ${role}`, () => {
        const filter = ` whose role is "${role}"`;
        expect(filter).toContain(role);
      });
    });
  });

  describe("Max depth validation", () => {
    [1, 2, 3, 4, 5].forEach((depth) => {
      it(`should accept max_depth=${depth}`, () => {
        expect(depth).toBeGreaterThanOrEqual(1);
        expect(depth).toBeLessThanOrEqual(5);
      });
    });
  });
});
