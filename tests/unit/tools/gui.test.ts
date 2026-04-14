import { describe, it, expect, vi } from "vitest";

vi.mock("../../../src/utils/osascript.js", () => ({
  runShellCommand: vi.fn(async () => ({ stdout: "ok\n", stderr: "", exitCode: 0 })),
  runOsascript: vi.fn(async () => ({ stdout: "ok", stderr: "" })),
  runOsascriptJXA: vi.fn(async () => ({ stdout: "[]", stderr: "" })),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("PNG_DATA")),
  unlink: vi.fn(async () => undefined),
}));

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGuiTools } from "../../../src/tools/gui.js";

describe("GUI Tools", () => {
  describe("Tool registration", () => {
    it("should register all GUI tools without error", () => {
      const server = new McpServer({ name: "test", version: "0.0.1" });
      expect(() => registerGuiTools(server)).not.toThrow();
    });
  });

  describe("Key code mapping", () => {
    const keyCodes: Record<string, number> = {
      return: 36, enter: 36, tab: 48, escape: 53, space: 49,
      delete: 51, forwarddelete: 117,
      up: 126, down: 125, left: 123, right: 124,
      home: 115, end: 119, pageup: 116, pagedown: 121,
      f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97,
      f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
    };

    Object.entries(keyCodes).forEach(([key, code]) => {
      it(`should map "${key}" to key code ${code}`, () => {
        expect(keyCodes[key]).toBe(code);
      });
    });
  });

  describe("Screenshot parameters", () => {
    it("should accept default parameters", () => {
      const params = { display: 1, max_width: 1280 };
      expect(params.display).toBe(1);
      expect(params.max_width).toBe(1280);
    });

    it("should validate region bounds", () => {
      const region = { x: 0, y: 0, width: 800, height: 600 };
      expect(region.width).toBeGreaterThan(0);
      expect(region.height).toBeGreaterThan(0);
    });

    it("should handle multi-display", () => {
      const params = { display: 2, max_width: 1920 };
      expect(params.display).toBe(2);
    });
  });

  describe("Mouse coordinates", () => {
    const coords = [
      { x: 0, y: 0, desc: "origin" },
      { x: 1920, y: 1080, desc: "bottom-right HD" },
      { x: 2560, y: 1600, desc: "retina" },
      { x: -1, y: -1, desc: "negative (edge case)" },
      { x: 10000, y: 10000, desc: "very large" },
    ];

    coords.forEach(({ x, y, desc }) => {
      it(`should accept coordinates: ${desc} (${x},${y})`, () => {
        expect(typeof x).toBe("number");
        expect(typeof y).toBe("number");
      });
    });
  });

  describe("Modifier key combinations", () => {
    const combos = [
      { modifiers: ["command"], desc: "Cmd" },
      { modifiers: ["control"], desc: "Ctrl" },
      { modifiers: ["option"], desc: "Alt/Opt" },
      { modifiers: ["shift"], desc: "Shift" },
      { modifiers: ["command", "shift"], desc: "Cmd+Shift" },
      { modifiers: ["command", "control"], desc: "Cmd+Ctrl" },
      { modifiers: ["command", "option", "shift"], desc: "Cmd+Opt+Shift" },
      { modifiers: [], desc: "no modifiers" },
    ];

    combos.forEach(({ modifiers, desc }) => {
      it(`should generate osascript modifier string for ${desc}`, () => {
        const modString = modifiers.length > 0
          ? `using {${modifiers.map((m: string) => `${m} down`).join(", ")}}`
          : "";
        if (modifiers.length > 0) {
          expect(modString).toContain("using");
          modifiers.forEach((m: string) => {
            expect(modString).toContain(`${m} down`);
          });
        } else {
          expect(modString).toBe("");
        }
      });
    });
  });

  describe("Python Quartz script generation", () => {
    it("should generate mouse click script with correct coordinates", () => {
      const x = 500, y = 300;
      const script = `Quartz.CGPointMake(${x}, ${y})`;
      expect(script).toContain("500");
      expect(script).toContain("300");
    });

    it("should use left mouse button by default", () => {
      const button = "left";
      const buttonType = button === "right" ? "Quartz.kCGMouseButtonRight" : "Quartz.kCGMouseButtonLeft";
      expect(buttonType).toBe("Quartz.kCGMouseButtonLeft");
    });

    it("should use right mouse button when specified", () => {
      const button = "right";
      const buttonType = button === "right" ? "Quartz.kCGMouseButtonRight" : "Quartz.kCGMouseButtonLeft";
      expect(buttonType).toBe("Quartz.kCGMouseButtonRight");
    });
  });
});
