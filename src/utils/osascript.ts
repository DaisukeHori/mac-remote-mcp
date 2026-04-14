import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface OsascriptResult {
  stdout: string;
  stderr: string;
}

export async function runOsascript(script: string, timeout = 15000): Promise<OsascriptResult> {
  try {
    const { stdout, stderr } = await execFileAsync("osascript", ["-e", script], {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `osascript error: ${error.stderr || error.message || "unknown error"}`
    );
  }
}

export async function runOsascriptJXA(script: string, timeout = 15000): Promise<OsascriptResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", script],
      { timeout, maxBuffer: 10 * 1024 * 1024 }
    );
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `JXA error: ${error.stderr || error.message || "unknown error"}`
    );
  }
}

export async function runShellCommand(
  command: string,
  options: { timeout?: number; cwd?: string; env?: Record<string, string> } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const timeout = options.timeout ?? 60000;
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["-c", command], {
      timeout,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const error = err as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      message?: string;
    };
    if (error.killed) {
      return {
        stdout: error.stdout ?? "",
        stderr: `Command timed out after ${timeout}ms`,
        exitCode: 124,
      };
    }
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message ?? "unknown error",
      exitCode: typeof error.code === "number" ? error.code : 1,
    };
  }
}
