import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { bearerAuth } from "./auth.js";
import { logAudit } from "./logger.js";
import { registerShellTools } from "./tools/shell.js";
import { registerGuiTools } from "./tools/gui.js";
import { registerUiTools } from "./tools/ui.js";
import { registerFileTools } from "./tools/files.js";
import { registerAppTools } from "./tools/apps.js";
import { registerAdminTools } from "./tools/admin.js";

// ── Server Setup ──────────────────────────────────────────────
const server = new McpServer({
  name: "mac-remote-mcp",
  version: "1.0.0",
});

// Register all tool groups
registerShellTools(server);
registerGuiTools(server);
registerUiTools(server);
registerFileTools(server);
registerAppTools(server);
registerAdminTools(server);

console.error("Registered tool groups: shell, gui, ui, files, apps, admin");

// ── Streamable HTTP Transport (for remote access) ─────────────
async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // Bearer auth on all routes except /health
  app.use(bearerAuth);

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      server: "mac-remote-mcp",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });

  // MCP endpoint (Streamable HTTP)
  app.post("/mcp", async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Handle GET and DELETE for SSE compatibility
  app.get("/mcp", async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("MCP SSE error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.delete("/mcp", async (req, res) => {
    res.status(200).json({ status: "session closed" });
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "127.0.0.1";

  app.listen(port, host, () => {
    console.error(`mac-remote-mcp running on http://${host}:${port}/mcp`);
    console.error(`Health check: http://${host}:${port}/health`);
    if (!process.env.MCP_API_KEY) {
      console.error("⚠️  WARNING: MCP_API_KEY not set — server is unauthenticated!");
    } else {
      console.error("✅ Bearer authentication enabled");
    }
  });
}

// ── stdio transport (for local use / Claude Desktop) ──────────
async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mac-remote-mcp running via stdio");
}

// ── Entry Point ───────────────────────────────────────────────
const transportMode = process.env.TRANSPORT || "http";

if (transportMode === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
