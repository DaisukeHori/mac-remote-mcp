import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCalls: { path: string; data: string }[] = [];

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(async () => undefined),
  appendFile: vi.fn(async (path: string, data: string) => {
    mockCalls.push({ path, data });
  }),
}));

import { logAudit, type AuditEntry } from "../../src/logger.js";

describe("logAudit", () => {
  beforeEach(() => { mockCalls.length = 0; });

  const base: AuditEntry = {
    timestamp: "2024-01-01T00:00:00.000Z",
    tool: "shell_execute",
    params: { command: "ls" },
    result: "success",
    duration_ms: 100,
  };

  function lastParsed() {
    const c = mockCalls[mockCalls.length - 1];
    return c ? JSON.parse(c.data.trim()) : null;
  }

  it("should write to log", async () => { await logAudit(base); expect(mockCalls.length).toBeGreaterThan(0); });
  it("should write valid JSON", async () => { await logAudit(base); expect(() => lastParsed()).not.toThrow(); });
  it("should include tool name", async () => { await logAudit(base); expect(lastParsed().tool).toBe("shell_execute"); });
  it("should include timestamp", async () => { await logAudit(base); expect(lastParsed().timestamp).toBe("2024-01-01T00:00:00.000Z"); });
  it("should include duration_ms", async () => { await logAudit({...base, duration_ms: 5000}); expect(lastParsed().duration_ms).toBe(5000); });
  it("should include params", async () => { await logAudit({...base, params:{cmd:"hi"}}); expect(lastParsed().params.cmd).toBe("hi"); });
  it("should end with newline", async () => { await logAudit(base); expect(mockCalls[mockCalls.length-1].data.endsWith("\n")).toBe(true); });
  it("should write to date-stamped file", async () => { await logAudit(base); expect(mockCalls[mockCalls.length-1].path).toMatch(/audit-\d{4}-\d{2}-\d{2}\.log$/); });
  it("should not throw on failure", async () => { await expect(logAudit(base)).resolves.not.toThrow(); });
  it("should log error result", async () => { await logAudit({...base, result:"error", error:"fail"}); expect(lastParsed().result).toBe("error"); });
  it("should log error message", async () => { await logAudit({...base, result:"error", error:"timeout"}); expect(lastParsed().error).toBe("timeout"); });
  it("should log success without error", async () => { await logAudit(base); expect(lastParsed().error).toBeUndefined(); });

  const paramCases = [
    {name:"string",params:{k:"v"}},{name:"number",params:{n:42}},{name:"bool",params:{b:true}},
    {name:"null",params:{x:null}},{name:"nested",params:{a:{b:"c"}}},{name:"array",params:{a:[1,2]}},
    {name:"empty",params:{}},{name:"special",params:{t:'h"i'}},{name:"unicode",params:{t:"日本語"}},
    {name:"long",params:{d:"x".repeat(800)}},
  ];
  paramCases.forEach(({name,params})=>{
    it(`serialize ${name}`, async()=>{await logAudit({...base,params});expect(lastParsed().params).toBeDefined();});
  });

  const tools = ["shell_execute","shell_execute_simple","gui_screenshot","gui_mouse_click","ui_get_elements","file_read","app_open","admin_status","admin_kill_switch"];
  tools.forEach(t=>{
    it(`log tool: ${t}`, async()=>{await logAudit({...base,tool:t});expect(lastParsed().tool).toBe(t);});
  });

  [0,1,50,100,1000,30000,60000].forEach(d=>{
    it(`log duration ${d}ms`, async()=>{await logAudit({...base,duration_ms:d});expect(lastParsed().duration_ms).toBe(d);});
  });
});
