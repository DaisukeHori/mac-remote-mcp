import { vi } from "vitest";

// ── Mock for utils/osascript.ts ──────────────────────────────

export interface MockShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface MockOsascriptResult {
  stdout: string;
  stderr: string;
}

let shellMockFn: ((cmd: string) => MockShellResult) | null = null;
let osascriptMockFn: ((script: string) => MockOsascriptResult) | null = null;
let jxaMockFn: ((script: string) => MockOsascriptResult) | null = null;

export function setShellMock(fn: (cmd: string) => MockShellResult): void {
  shellMockFn = fn;
}

export function setOsascriptMock(fn: (script: string) => MockOsascriptResult): void {
  osascriptMockFn = fn;
}

export function setJxaMock(fn: (script: string) => MockOsascriptResult): void {
  jxaMockFn = fn;
}

export function resetAllMocks(): void {
  shellMockFn = null;
  osascriptMockFn = null;
  jxaMockFn = null;
}

export function defaultShellMock(cmd: string): MockShellResult {
  if (cmd.includes("sw_vers")) return { stdout: "14.5\n", stderr: "", exitCode: 0 };
  if (cmd.includes("hostname")) return { stdout: "Daisuke-Mac\n", stderr: "", exitCode: 0 };
  if (cmd.includes("whoami")) return { stdout: "daisuke\n", stderr: "", exitCode: 0 };
  if (cmd.includes("pgrep -x caffeinate")) return { stdout: "12345\n", stderr: "", exitCode: 0 };
  if (cmd.includes("tmux list-sessions")) return { stdout: "mcp-default|1700000000|0\n", stderr: "", exitCode: 0 };
  if (cmd.includes("tmux has-session")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("tmux new-session")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("tmux send-keys")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("tmux kill-session")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("pbpaste")) return { stdout: "clipboard content", stderr: "", exitCode: 0 };
  if (cmd.includes("pbcopy")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("screencapture")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("sips")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("open -a")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("open \"http")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("killall")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("python3")) return { stdout: "ok\n", stderr: "", exitCode: 0 };
  if (cmd.includes("pkill")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("nohup caffeinate")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("system_profiler")) return { stdout: '["2560 x 1600"]', stderr: "", exitCode: 0 };
  if (cmd.includes("cat /tmp/mcp-shell") && cmd.includes(".rc")) return { stdout: "0\n", stderr: "", exitCode: 0 };
  if (cmd.includes("cat /tmp/mcp-shell") && cmd.includes(".out")) return { stdout: "command output\n", stderr: "", exitCode: 0 };
  if (cmd.includes("cat /tmp/mcp-shell") && cmd.includes(".err")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("rm -f /tmp/mcp-shell")) return { stdout: "", stderr: "", exitCode: 0 };
  if (cmd.includes("tail -n")) return { stdout: '{"tool":"test"}\n', stderr: "", exitCode: 0 };
  return { stdout: "", stderr: "", exitCode: 0 };
}

export function defaultOsascriptMock(_script: string): MockOsascriptResult {
  return { stdout: "ok", stderr: "" };
}

export function defaultJxaMock(_script: string): MockOsascriptResult {
  return { stdout: "[]", stderr: "" };
}

// ── Create the mock module ───────────────────────────────────

export const mockRunShellCommand = vi.fn(async (cmd: string, _opts?: unknown) => {
  const fn = shellMockFn || defaultShellMock;
  return fn(cmd);
});

export const mockRunOsascript = vi.fn(async (script: string, _timeout?: number) => {
  const fn = osascriptMockFn || defaultOsascriptMock;
  return fn(script);
});

export const mockRunOsascriptJXA = vi.fn(async (script: string, _timeout?: number) => {
  const fn = jxaMockFn || defaultJxaMock;
  return fn(script);
});

// ── Mock filesystem calls ────────────────────────────────────

export const mockReadFile = vi.fn(async () => Buffer.from("file content"));
export const mockWriteFile = vi.fn(async () => undefined);
export const mockUnlink = vi.fn(async () => undefined);
export const mockRename = vi.fn(async () => undefined);
export const mockMkdir = vi.fn(async () => undefined);
export const mockStat = vi.fn(async () => ({
  size: 100,
  mtime: new Date("2024-01-01"),
  isDirectory: () => false,
}));
export const mockReaddir = vi.fn(async () => [
  { name: "file.txt", isDirectory: () => false },
  { name: "subdir", isDirectory: () => true },
  { name: ".hidden", isDirectory: () => false },
]);
