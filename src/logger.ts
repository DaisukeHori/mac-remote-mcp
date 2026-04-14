import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const LOG_DIR = join(homedir(), ".mac-remote-mcp", "logs");
let logDirReady = false;

async function ensureLogDir(): Promise<void> {
  if (!logDirReady) {
    await mkdir(LOG_DIR, { recursive: true });
    logDirReady = true;
  }
}

function getLogFilePath(): string {
  const date = new Date().toISOString().split("T")[0];
  return join(LOG_DIR, `audit-${date}.log`);
}

export interface AuditEntry {
  timestamp: string;
  tool: string;
  params: Record<string, unknown>;
  result: "success" | "error";
  duration_ms: number;
  error?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await ensureLogDir();
    const line = JSON.stringify(entry) + "\n";
    await appendFile(getLogFilePath(), line, "utf-8");
  } catch {
    // Logging should never crash the server
    console.error("Failed to write audit log:", entry.tool);
  }
}

export function createAuditWrapper(
  toolName: string,
  handler: (params: Record<string, unknown>) => Promise<unknown>
): (params: Record<string, unknown>) => Promise<unknown> {
  return async (params: Record<string, unknown>) => {
    const start = Date.now();
    try {
      const result = await handler(params);
      await logAudit({
        timestamp: new Date().toISOString(),
        tool: toolName,
        params: sanitizeParams(params),
        result: "success",
        duration_ms: Date.now() - start,
      });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await logAudit({
        timestamp: new Date().toISOString(),
        tool: toolName,
        params: sanitizeParams(params),
        result: "error",
        duration_ms: Date.now() - start,
        error: message,
      });
      throw err;
    }
  };
}

function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...params };
  // Truncate very long command strings in logs
  if (typeof sanitized["command"] === "string" && (sanitized["command"] as string).length > 500) {
    sanitized["command"] = (sanitized["command"] as string).slice(0, 500) + "...[truncated]";
  }
  if (typeof sanitized["content"] === "string" && (sanitized["content"] as string).length > 200) {
    sanitized["content"] = (sanitized["content"] as string).slice(0, 200) + "...[truncated]";
  }
  return sanitized;
}
