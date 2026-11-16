// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { probeMcpDeployment } from "./deployment-probe";
const endpointUrl="https://tools.azurewebsites.net/api/mcp";
describe("MCP deployment probe", () => {
  it("requires exact health, resource discovery and a bearer challenge", async () => {
    const fetchImpl=vi.fn().mockResolvedValueOnce(new Response(null,{status:200})).mockResolvedValueOnce(Response.json({resource:endpointUrl,authorization_servers:["https://login.microsoftonline.com/tenant/v2.0"],scopes_supported:[`${endpointUrl}/mcp.access`]})).mockResolvedValueOnce(new Response(null,{status:401,headers:{"WWW-Authenticate":'Bearer resource_metadata="https://tools.azurewebsites.net/.well-known/oauth-protected-resource"'}}));
    await expect(probeMcpDeployment({endpointUrl,tenantId:"tenant"},{fetchImpl})).resolves.toMatchObject({status:"PASSED",currency:"HISTORICAL_ONLY"});
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("does not follow redirects or fall back to the homepage", async () => {
    const fetchImpl=vi.fn(async()=>new Response(null,{status:302}));
    await expect(probeMcpDeployment({endpointUrl,tenantId:"tenant"},{fetchImpl})).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({redirect:"manual"});
  });
  it("rejects non-managed URLs before fetch", async()=>{
    const fetchImpl=vi.fn();
    await expect(probeMcpDeployment({endpointUrl:"https://example.org/api/mcp",tenantId:"tenant"},{fetchImpl})).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
