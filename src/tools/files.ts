import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, readdir, stat, unlink, rename, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export function registerFileTools(server: McpServer): void {
  // ── read_file ───────────────────────────────────────────────
  server.registerTool(
    "file_read",
    {
      title: "Read File",
      description: `Read contents of a file. Returns text for text files, base64 for binary.

Args:
  - path: File path (absolute, or relative to home directory)
  - encoding: "utf-8" (default) or "base64" for binary
  - max_bytes: Max bytes to read (default 1MB)

Returns:
  { content, size, path }`,
      inputSchema: {
        path: z.string().min(1).describe("File path"),
        encoding: z.enum(["utf-8", "base64"]).default("utf-8").describe("Encoding"),
        max_bytes: z.number().int().min(1).default(1048576).describe("Max bytes to read"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path: filePath, encoding, max_bytes }) => {
      const absPath = resolvePath(filePath);
      const fileStat = await stat(absPath);

      const fileBuffer = await readFile(absPath);
      const readSize = Math.min(fileStat.size, max_bytes);
      const truncatedBuffer = fileBuffer.subarray(0, readSize);

      const content =
        encoding === "base64"
          ? truncatedBuffer.toString("base64")
          : truncatedBuffer.toString("utf-8");

      const truncated = fileStat.size > max_bytes;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            content,
            size: fileStat.size,
            path: absPath,
            truncated,
            ...(truncated ? { message: `File truncated at ${max_bytes} bytes` } : {}),
          }),
        }],
      };
    }
  );

  // ── write_file ──────────────────────────────────────────────
  server.registerTool(
    "file_write",
    {
      title: "Write File",
      description: `Write content to a file. Creates parent directories if needed.

Args:
  - path: File path
  - content: Content to write
  - encoding: "utf-8" (default) or "base64" for binary
  - append: Append instead of overwrite (default false)

Returns:
  { success, path, bytes_written }`,
      inputSchema: {
        path: z.string().min(1).describe("File path"),
        content: z.string().describe("Content to write"),
        encoding: z.enum(["utf-8", "base64"]).default("utf-8").describe("Encoding"),
        append: z.boolean().default(false).describe("Append mode"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ path: filePath, content, encoding, append }) => {
      const absPath = resolvePath(filePath);

      // Ensure parent directory exists
      const dir = absPath.split("/").slice(0, -1).join("/");
      await mkdir(dir, { recursive: true });

      const buffer =
        encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf-8");

      if (append) {
        const { appendFile: appendFileAsync } = await import("node:fs/promises");
        await appendFileAsync(absPath, buffer);
      } else {
        await writeFile(absPath, buffer);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, path: absPath, bytes_written: buffer.length }),
        }],
      };
    }
  );

  // ── list_directory ──────────────────────────────────────────
  server.registerTool(
    "file_list",
    {
      title: "List Directory",
      description: `List files and directories at a path.

Args:
  - path: Directory path (default "~")
  - recursive: Include subdirectories (default false, max 2 levels)
  - show_hidden: Show hidden files (default false)

Returns:
  { entries: [{ name, type, size, modified }], path }`,
      inputSchema: {
        path: z.string().default("~").describe("Directory path"),
        recursive: z.boolean().default(false).describe("Include subdirectories"),
        show_hidden: z.boolean().default(false).describe("Show hidden files"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path: dirPath, recursive, show_hidden }) => {
      const absPath = resolvePath(dirPath);
      const entries = await listDir(absPath, recursive ? 2 : 0, show_hidden);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ entries, path: absPath }, null, 2),
        }],
      };
    }
  );

  // ── delete_file ─────────────────────────────────────────────
  server.registerTool(
    "file_delete",
    {
      title: "Delete File",
      description: `Delete a file. Moves to Trash by default for safety.

Args:
  - path: File path to delete
  - use_trash: Move to Trash instead of permanent delete (default true)

Returns:
  { success, path }`,
      inputSchema: {
        path: z.string().min(1).describe("File path"),
        use_trash: z.boolean().default(true).describe("Move to Trash"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path: filePath, use_trash }) => {
      const absPath = resolvePath(filePath);
      if (use_trash) {
        const { runShellCommand } = await import("../utils/osascript.js");
        await runShellCommand(
          `osascript -e 'tell application "Finder" to delete POSIX file "${absPath}"'`,
          { timeout: 10000 }
        );
      } else {
        await unlink(absPath);
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, path: absPath, trashed: use_trash }) }],
      };
    }
  );

  // ── move_file ───────────────────────────────────────────────
  server.registerTool(
    "file_move",
    {
      title: "Move/Rename File",
      description: `Move or rename a file.

Args:
  - source: Source path
  - destination: Destination path

Returns:
  { success, source, destination }`,
      inputSchema: {
        source: z.string().min(1).describe("Source path"),
        destination: z.string().min(1).describe("Destination path"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ source, destination }) => {
      const absSrc = resolvePath(source);
      const absDst = resolvePath(destination);
      await rename(absSrc, absDst);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, source: absSrc, destination: absDst }),
        }],
      };
    }
  );
}

// Helper: resolve ~ and relative paths
function resolvePath(filePath: string): string {
  if (filePath.startsWith("~")) {
    return join(homedir(), filePath.slice(1));
  }
  return resolve(filePath);
}

// Helper: list directory entries
async function listDir(
  dirPath: string,
  depth: number,
  showHidden: boolean
): Promise<Array<{ name: string; type: string; size: number; modified: string; children?: unknown[] }>> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith(".")) continue;

    const fullPath = join(dirPath, entry.name);
    let fileInfo;
    try {
      fileInfo = await stat(fullPath);
    } catch {
      continue;
    }

    const item: {
      name: string;
      type: string;
      size: number;
      modified: string;
      children?: unknown[];
    } = {
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      size: fileInfo.size,
      modified: fileInfo.mtime.toISOString(),
    };

    if (entry.isDirectory() && depth > 0) {
      try {
        item.children = await listDir(fullPath, depth - 1, showHidden);
      } catch {
        // Permission denied, skip
      }
    }

    results.push(item);
  }

  return results;
}
