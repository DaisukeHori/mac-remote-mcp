import { describe, it, expect, vi, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { bearerAuth } from "../../src/auth.js";

function mkReq(headers: Record<string,string> = {}, path="/mcp"): Partial<Request> {
  return { headers, path };
}
function mkRes() {
  const state = { code: 0, body: null as unknown };
  const res: Partial<Response> = {
    status: vi.fn((c:number) => { state.code = c; return res; }),
    json: vi.fn((d:unknown) => { state.body = d; return res; }),
  };
  return { res, state };
}

describe("bearerAuth", () => {
  afterEach(() => { delete process.env.MCP_API_KEY; vi.restoreAllMocks(); });

  describe("no API key set", () => {
    it("passes without header", () => {
      delete process.env.MCP_API_KEY;
      const next = vi.fn();
      bearerAuth(mkReq() as Request, mkRes().res as Response, next);
      expect(next).toHaveBeenCalled();
    });
    it("passes with any header", () => {
      delete process.env.MCP_API_KEY;
      const next = vi.fn();
      bearerAuth(mkReq({authorization:"Bearer x"}) as Request, mkRes().res as Response, next);
      expect(next).toHaveBeenCalled();
    });
    it("passes with empty header", () => {
      delete process.env.MCP_API_KEY;
      const next = vi.fn();
      bearerAuth(mkReq({authorization:""}) as Request, mkRes().res as Response, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("API key set", () => {
    const KEY = "test-secret-key-12345";
    
    it("passes with correct token", () => {
      process.env.MCP_API_KEY = KEY;
      const next = vi.fn();
      bearerAuth(mkReq({authorization:`Bearer ${KEY}`}) as Request, mkRes().res as Response, next);
      expect(next).toHaveBeenCalled();
    });
    it("rejects missing header (401)", () => {
      process.env.MCP_API_KEY = KEY;
      const {res,state} = mkRes(); const next = vi.fn();
      bearerAuth(mkReq() as Request, res as Response, next);
      expect(next).not.toHaveBeenCalled();
      expect(state.code).toBe(401);
    });
    it("rejects empty header", () => {
      process.env.MCP_API_KEY = KEY;
      const {res} = mkRes(); const next = vi.fn();
      bearerAuth(mkReq({authorization:""}) as Request, res as Response, next);
      expect(next).not.toHaveBeenCalled();
    });
    it("rejects Basic scheme (401)", () => {
      process.env.MCP_API_KEY = KEY;
      const {res,state} = mkRes(); const next = vi.fn();
      bearerAuth(mkReq({authorization:`Basic ${KEY}`}) as Request, res as Response, next);
      expect(next).not.toHaveBeenCalled();
      expect(state.code).toBe(401);
    });
    it("rejects wrong token (403)", () => {
      process.env.MCP_API_KEY = KEY;
      const {res,state} = mkRes(); const next = vi.fn();
      bearerAuth(mkReq({authorization:"Bearer wrong"}) as Request, res as Response, next);
      expect(next).not.toHaveBeenCalled();
      expect(state.code).toBe(403);
    });
    it("allows /health without auth", () => {
      process.env.MCP_API_KEY = KEY;
      const next = vi.fn();
      bearerAuth(mkReq({},"/health") as Request, mkRes().res as Response, next);
      expect(next).toHaveBeenCalled();
    });
    it("requires auth for /mcp", () => {
      process.env.MCP_API_KEY = KEY;
      const next = vi.fn();
      bearerAuth(mkReq({},"/mcp") as Request, mkRes().res as Response, next);
      expect(next).not.toHaveBeenCalled();
    });
    it("is case-sensitive", () => {
      process.env.MCP_API_KEY = KEY;
      const next = vi.fn();
      bearerAuth(mkReq({authorization:`Bearer ${KEY.toUpperCase()}`}) as Request, mkRes().res as Response, next);
      expect(next).not.toHaveBeenCalled();
    });
    it("rejects Bearer with no token (403)", () => {
      process.env.MCP_API_KEY = KEY;
      const {res,state} = mkRes(); const next = vi.fn();
      bearerAuth(mkReq({authorization:"Bearer "}) as Request, res as Response, next);
      expect(state.code).toBe(403);
    });
    it("rejects extra space in bearer", () => {
      process.env.MCP_API_KEY = KEY;
      const next = vi.fn();
      bearerAuth(mkReq({authorization:`Bearer  ${KEY}`}) as Request, mkRes().res as Response, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("various token patterns", () => {
    const tokens = ["simple","with-dashes","with_underscores","MiXeD.123","a".repeat(256),"特殊文字","tok en","!@#$%"];
    tokens.forEach(tok => {
      it(`accepts valid: "${tok.slice(0,20)}"`, () => {
        process.env.MCP_API_KEY = tok;
        const next = vi.fn();
        bearerAuth(mkReq({authorization:`Bearer ${tok}`}) as Request, mkRes().res as Response, next);
        expect(next).toHaveBeenCalled();
      });
      it(`rejects wrong when key="${tok.slice(0,20)}"`, () => {
        process.env.MCP_API_KEY = tok;
        const next = vi.fn();
        bearerAuth(mkReq({authorization:"Bearer WRONG"}) as Request, mkRes().res as Response, next);
        expect(next).not.toHaveBeenCalled();
      });
    });
  });
});
