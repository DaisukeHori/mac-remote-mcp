import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runOsascript, runOsascriptJXA } from "../utils/osascript.js";

export function registerUiTools(server: McpServer): void {
  // ── get_ui_elements ─────────────────────────────────────────
  server.registerTool(
    "ui_get_elements",
    {
      title: "Get UI Elements",
      description: `Get the accessibility tree of a running application. Returns buttons, text fields,
and other UI elements with their roles, names, positions, and sizes.
Useful for finding where to click or what's on screen.

Args:
  - app_name: Application name (e.g. "Safari", "Finder", "Google Chrome")
  - max_depth: How deep to traverse the UI tree (default 3, max 5)
  - window_index: Window index (default 1, first window)

Returns:
  JSON array of UI elements with { role, name, position, size, subrole, value, enabled }`,
      inputSchema: {
        app_name: z.string().min(1).describe("Application name"),
        max_depth: z.number().int().min(1).max(5).default(3).describe("Max tree depth"),
        window_index: z.number().int().min(1).default(1).describe("Window index"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ app_name, max_depth, window_index }) => {
      const jxa = `
function run() {
  const app = Application("${app_name.replace(/"/g, '\\"')}");
  const se = Application("System Events");
  const proc = se.processes.byName("${app_name.replace(/"/g, '\\"')}");
  
  function getElements(el, depth, maxD) {
    if (depth > maxD) return [];
    const results = [];
    try {
      const children = el.uiElements();
      for (let i = 0; i < children.length && i < 100; i++) {
        const c = children[i];
        try {
          const item = {
            role: c.role() || "",
            name: "",
            position: null,
            size: null,
            subrole: "",
            value: "",
            enabled: true,
          };
          try { item.name = c.name() || ""; } catch(e) {}
          try { item.position = c.position(); } catch(e) {}
          try { item.size = c.size(); } catch(e) {}
          try { item.subrole = c.subrole() || ""; } catch(e) {}
          try { 
            const v = c.value();
            item.value = (v !== null && v !== undefined) ? String(v).substring(0, 200) : "";
          } catch(e) {}
          try { item.enabled = c.enabled(); } catch(e) {}
          
          if (depth < maxD) {
            const sub = getElements(c, depth + 1, maxD);
            if (sub.length > 0) item.children = sub;
          }
          results.push(item);
        } catch(e) {}
      }
    } catch(e) {}
    return results;
  }
  
  const win = proc.windows[${window_index - 1}];
  return JSON.stringify(getElements(win, 1, ${max_depth}));
}
`;
      try {
        const result = await runOsascriptJXA(jxa, 30000);
        const elements = JSON.parse(result.stdout || "[]");
        return {
          content: [{ type: "text", text: JSON.stringify(elements, null, 2) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
        };
      }
    }
  );

  // ── click_ui_element ────────────────────────────────────────
  server.registerTool(
    "ui_click_element",
    {
      title: "Click UI Element by Name/Role",
      description: `Click a UI element identified by name and/or role in an application.
More reliable than coordinate-based clicking for buttons, links, etc.

Args:
  - app_name: Application name
  - element_name: Name/title of the element to click
  - element_role: Optional role filter ("AXButton", "AXLink", "AXTextField", etc.)
  - window_index: Window index (default 1)
  - action: Action to perform (default "AXPress")

Returns:
  { success, element_name, element_role }`,
      inputSchema: {
        app_name: z.string().min(1).describe("Application name"),
        element_name: z.string().min(1).describe("Element name to click"),
        element_role: z.string().optional().describe("Optional role filter (AXButton, AXLink, etc.)"),
        window_index: z.number().int().min(1).default(1).describe("Window index"),
        action: z.string().default("AXPress").describe("Accessibility action"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ app_name, element_name, element_role, window_index, action }) => {
      const roleFilter = element_role
        ? ` whose role is "${element_role}"`
        : "";
      const script = `
tell application "System Events"
  tell process "${app_name.replace(/"/g, '\\"')}"
    set frontmost to true
    delay 0.3
    set targetWin to window ${window_index}
    set allElements to every UI element of targetWin${roleFilter}
    repeat with el in allElements
      try
        if name of el is "${element_name.replace(/"/g, '\\"')}" then
          perform action "${action}" of el
          return "clicked"
        end if
      end try
    end repeat
    -- Deep search: check inside groups/toolbars
    set allGroups to every group of targetWin
    repeat with g in allGroups
      try
        set subEls to every UI element of g${roleFilter}
        repeat with el in subEls
          try
            if name of el is "${element_name.replace(/"/g, '\\"')}" then
              perform action "${action}" of el
              return "clicked"
            end if
          end try
        end repeat
      end try
    end repeat
    return "not_found"
  end tell
end tell
`;
      const result = await runOsascript(script, 15000);
      if (result.stdout === "clicked") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: true, element_name, element_role: element_role || "any" }),
          }],
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Element "${element_name}" not found in ${app_name} window ${window_index}`,
            hint: "Use ui_get_elements to inspect available elements",
          }),
        }],
      };
    }
  );

  // ── set_ui_element_value ────────────────────────────────────
  server.registerTool(
    "ui_set_value",
    {
      title: "Set UI Element Value",
      description: `Set the value of a text field or other input element.

Args:
  - app_name: Application name
  - element_name: Name of the text field
  - value: Value to set
  - window_index: Window index (default 1)

Returns:
  { success }`,
      inputSchema: {
        app_name: z.string().min(1).describe("Application name"),
        element_name: z.string().min(1).describe("Element name"),
        value: z.string().describe("Value to set"),
        window_index: z.number().int().min(1).default(1).describe("Window index"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ app_name, element_name, value, window_index }) => {
      const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const script = `
tell application "System Events"
  tell process "${app_name.replace(/"/g, '\\"')}"
    set frontmost to true
    delay 0.2
    set targetWin to window ${window_index}
    set allFields to every text field of targetWin
    repeat with f in allFields
      try
        if name of f is "${element_name.replace(/"/g, '\\"')}" or description of f is "${element_name.replace(/"/g, '\\"')}" then
          set value of f to "${escapedValue}"
          return "set"
        end if
      end try
    end repeat
    -- Try text areas too
    set allAreas to every text area of targetWin
    repeat with a in allAreas
      try
        if name of a is "${element_name.replace(/"/g, '\\"')}" then
          set value of a to "${escapedValue}"
          return "set"
        end if
      end try
    end repeat
    return "not_found"
  end tell
end tell
`;
      const result = await runOsascript(script, 10000);
      if (result.stdout === "set") {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true }) }],
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: `Text field "${element_name}" not found` }),
        }],
      };
    }
  );

  // ── get_focused_element ─────────────────────────────────────
  server.registerTool(
    "ui_get_focused",
    {
      title: "Get Focused Element",
      description: `Get info about the currently focused UI element and frontmost application.

Returns:
  { app_name, element_role, element_name, element_value }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async () => {
      const jxa = `
function run() {
  const se = Application("System Events");
  const frontApp = se.processes.whose({frontmost: true})[0];
  const result = { app_name: "", element_role: "", element_name: "", element_value: "" };
  try { result.app_name = frontApp.name(); } catch(e) {}
  try {
    const focused = frontApp.focusedUIElement();
    try { result.element_role = focused.role(); } catch(e) {}
    try { result.element_name = focused.name() || ""; } catch(e) {}
    try { 
      const v = focused.value();
      result.element_value = v ? String(v).substring(0, 500) : "";
    } catch(e) {}
  } catch(e) {}
  return JSON.stringify(result);
}
`;
      const result = await runOsascriptJXA(jxa, 5000);
      return {
        content: [{ type: "text", text: result.stdout }],
      };
    }
  );
}
