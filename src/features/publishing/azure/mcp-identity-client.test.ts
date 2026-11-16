// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createMcpIdentityClient, mcpOwnership } from "./mcp-identity-client";

describe("MCP Microsoft Graph ownership boundary", () => {
  it("rejects an existing shared application before writing", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: "shared", appId: "shared-client", notes: "browser login" }));
    const client = createMcpIdentityClient({ tokenProvider: async () => "token", clientIds: [], fetchImpl });
    await expect(client.ensureApplication({ appId: "request-a", endpointUrl: "https://a.azurewebsites.net/api/mcp", applicationObjectId: "shared", scopeId: null })).rejects.toThrow(/ownership/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("creates only a marked single-tenant resource with a delegated scope", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ value: [] })).mockResolvedValueOnce(Response.json({ id: "owned", appId: "resource", notes: mcpOwnership("request-a") }));
    const client = createMcpIdentityClient({ tokenProvider: async () => "token", clientIds: [], fetchImpl });
    await expect(client.ensureApplication({ appId: "request-a", endpointUrl: "https://a.azurewebsites.net/api/mcp", applicationObjectId: null, scopeId: null })).resolves.toMatchObject({ applicationObjectId: "owned", applicationClientId: "resource" });
    const body = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(body).toMatchObject({ signInAudience: "AzureADMyOrg", notes: mcpOwnership("request-a"), identifierUris: ["https://a.azurewebsites.net/api/mcp"], api: { requestedAccessTokenVersion: 2, oauth2PermissionScopes: [expect.objectContaining({ value: "mcp.access", type: "Admin" })] } });
    expect(body).not.toHaveProperty("passwordCredentials");
    expect(body.api).not.toHaveProperty("preAuthorizedApplications");
  });
  it("will not report READY without approved clients and restricted admission", async () => {
    const fetchImpl = vi.fn();
    const client = createMcpIdentityClient({ tokenProvider: async () => "token", clientIds: [], fetchImpl });
    expect(await client.isReady("a", "b", "c")).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
