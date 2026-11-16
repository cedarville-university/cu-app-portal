// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { handleMcp, handleMetadata } from "../src/mcp/handler";

describe("generated MCP transport", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  it("fails closed without identity settings", async () => {
    expect((await handleMcp(new Request("https://tools.test/api/mcp"), {})).status).toBe(503);
    expect((await handleMetadata({})).status).toBe(503);
  });
  it("requires bearer auth instead of redirecting to a browser login", async () => {
    const env = { MCP_RESOURCE_URL: "https://tools.azurewebsites.net/api/mcp", MCP_ENTRA_TENANT_ID: "11111111-1111-4111-8111-111111111111", MCP_ENTRA_ISSUER: "https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0", MCP_ENTRA_AUDIENCE: "22222222-2222-4222-8222-222222222222", MCP_ENTRA_SCOPE: "mcp.access" };
    const response = await handleMcp(new Request(env.MCP_RESOURCE_URL), env);
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("/.well-known/oauth-protected-resource");
    expect(response.headers.get("Location")).toBeNull();
    expect((await handleMcp(new Request(env.MCP_RESOURCE_URL, { headers: { Origin: "https://evil.test" } }), env)).status).toBe(403);
  });
  it("initializes, lists tools, and executes the harmless tool with real signed bearer tokens", async () => {
    const env = { MCP_RESOURCE_URL: "https://tools.azurewebsites.net/api/mcp", MCP_ENTRA_TENANT_ID: "33333333-3333-4333-8333-333333333333", MCP_ENTRA_ISSUER: "https://login.microsoftonline.com/33333333-3333-4333-8333-333333333333/v2.0", MCP_ENTRA_AUDIENCE: "44444444-4444-4444-8444-444444444444", MCP_ENTRA_SCOPE: "mcp.access" };
    const keys = await generateKeyPair("RS256");
    const jwk = await exportJWK(keys.publicKey);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ keys: [{ ...jwk, kid: "test", alg: "RS256", use: "sig" }] }));
    const token = await new SignJWT({ tid: env.MCP_ENTRA_TENANT_ID, oid: "transport-user", scp: "mcp.access", preferred_username: "user@cedarville.edu" }).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(env.MCP_ENTRA_ISSUER).setAudience(env.MCP_ENTRA_AUDIENCE).setExpirationTime("5m").sign(keys.privateKey);
    const send = (method: string, params: unknown = {}) => handleMcp(new Request(env.MCP_RESOURCE_URL, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), env);
    expect(await (await send("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } })).json()).toMatchObject({ result: { serverInfo: { version: "1.0.0" } } });
    expect(await (await send("tools/list")).json()).toMatchObject({ result: { tools: [expect.objectContaining({ name: "get_server_info" })] } });
    expect(await (await send("tools/call", { name: "get_server_info", arguments: {} })).json()).toMatchObject({ result: { structuredContent: { version: "1.0.0" } } });
    expect(await (await send("tools/call", { name: "get_server_info", arguments: { userId: "someone-else" } })).json()).toMatchObject({ result: { isError: true } });
    const oversized = await handleMcp(new Request(env.MCP_RESOURCE_URL, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: "x".repeat(256*1024+1) }), env);
    expect(oversized.status).toBe(413);
    for (let i = 0; i < 55; i++) await send("tools/list");
    expect((await send("tools/list")).status).toBe(429);
  });
});
