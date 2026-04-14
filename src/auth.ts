import type { Request, Response, NextFunction } from "express";

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const API_KEY = process.env.MCP_API_KEY;

  if (!API_KEY) {
    console.error("WARNING: MCP_API_KEY not set — authentication disabled");
    next();
    return;
  }

  // Health check endpoint is public
  if (req.path === "/health") {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== API_KEY) {
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
}
