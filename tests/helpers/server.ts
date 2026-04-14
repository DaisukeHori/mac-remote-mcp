import express, { type Express } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bearerAuth } from "../../src/auth.js";
import type { Server } from "node:http";

export interface TestServer {
  app: Express;
  server: Server;
  mcpServer: McpServer;
  url: string;
  close: () => Promise<void>;
}

export async function createTestServer(
  registerTools: (server: McpServer) => void,
  apiKey?: string
): Promise<TestServer> {
  if (apiKey) {
    process.env.MCP_API_KEY = apiKey;
  } else {
    delete process.env.MCP_API_KEY;
  }

  const mcpServer = new McpServer({ name: "test-server", version: "0.0.1" });
  registerTools(mcpServer);

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(bearerAuth);

  app.get("/health", (_req, res) => { res.json({ status: "ok" }); });

  app.post("/mcp", async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => transport.close());
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    }
  });

  return new Promise((resolve) => {
    const httpServer = app.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        app, server: httpServer, mcpServer,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => { httpServer.close(() => r()); }),
      });
    });
  });
}

async function mcpRequest(
  serverUrl: string,
  method: string,
  params: Record<string, unknown>,
  apiKey?: string
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body = { jsonrpc: "2.0", id: Date.now(), method, params };

  const res = await fetch(`${serverUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseBody = await res.json().catch(() => null);
  return { status: res.status, body: responseBody };
}

export async function callTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  apiKey?: string
): Promise<{ status: number; body: unknown }> {
  return mcpRequest(serverUrl, "tools/call", { name: toolName, arguments: args }, apiKey);
}

export async function listTools(
  serverUrl: string,
  apiKey?: string
): Promise<{ status: number; body: unknown }> {
  return mcpRequest(serverUrl, "tools/list", {}, apiKey);
}
