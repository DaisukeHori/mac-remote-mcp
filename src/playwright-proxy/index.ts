/**
 * Playwright MCP Auth Proxy
 * 
 * Sits in front of @playwright/mcp SSE server and adds Bearer token auth.
 * Playwright MCP doesn't have built-in auth, so this proxy adds it.
 * 
 * Usage:
 *   PLAYWRIGHT_PORT=3001 PROXY_PORT=3002 MCP_API_KEY=xxx node dist/playwright-proxy/index.js
 */

import express from "express";
const PLAYWRIGHT_PORT = parseInt(process.env.PLAYWRIGHT_PORT || "3001", 10);
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "3002", 10);
const API_KEY = process.env.MCP_API_KEY;

const app = express();

// Health check (no auth)
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "playwright-mcp-proxy",
    upstream: `http://127.0.0.1:${PLAYWRIGHT_PORT}`,
  });
});

// Bearer auth
app.use((req, res, next) => {
  if (!API_KEY) {
    console.error("WARNING: MCP_API_KEY not set — auth disabled");
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }

  if (authHeader.slice(7) !== API_KEY) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
});

// Proxy all requests to Playwright MCP
// Note: http-proxy-middleware needs to be installed separately
// For simplicity, we implement a manual proxy using Node's http module
import { request as httpRequest } from "node:http";

app.all("*", (req, res) => {
  const options = {
    hostname: "127.0.0.1",
    port: PLAYWRIGHT_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${PLAYWRIGHT_PORT}`,
    },
  };

  // Remove auth header before forwarding
  delete options.headers.authorization;

  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: "Playwright MCP upstream unavailable" });
    }
  });

  req.pipe(proxyReq, { end: true });
});

app.listen(PROXY_PORT, "127.0.0.1", () => {
  console.error(`Playwright auth proxy on http://127.0.0.1:${PROXY_PORT}`);
  console.error(`Proxying to Playwright MCP on http://127.0.0.1:${PLAYWRIGHT_PORT}`);
  if (!API_KEY) {
    console.error("⚠️  WARNING: MCP_API_KEY not set!");
  }
});
