// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { probeMcpDeployment } from "./deployment-probe";
const endpointUrl="https://tools.azurewebsites.net/api/mcp";
function readyResponses() {
  return [
    new Response(null, { status: 200 }),
    Response.json({ resource: endpointUrl, authorization_servers: ["https://login.microsoftonline.com/tenant/v2.0"], scopes_supported: [`${endpointUrl}/mcp.access`] }),
    new Response(null, { status: 401, headers: { "WWW-Authenticate": 'Bearer resource_metadata="https://tools.azurewebsites.net/.well-known/oauth-protected-resource"' } }),
  ];
}
describe("MCP deployment probe", () => {
  it("retries a network timeout while reading discovery metadata", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(new ReadableStream({
        start(controller) { controller.error(new DOMException("Starting", "TimeoutError")); },
      })));
    for (const response of readyResponses()) fetchImpl.mockResolvedValueOnce(response);
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    await expect(probeMcpDeployment({ endpointUrl, tenantId: "tenant" }, { fetchImpl, sleepImpl })).resolves.toMatchObject({ status: "PASSED" });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });
  it("waits through a startup timeout before requiring all three checks", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new DOMException("Starting", "TimeoutError"));
    for (const response of readyResponses()) fetchImpl.mockResolvedValueOnce(response);
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    await expect(probeMcpDeployment({ endpointUrl, tenantId: "tenant" }, { fetchImpl, sleepImpl })).resolves.toMatchObject({ status: "PASSED" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).toHaveBeenCalledWith(5_000);
  });
  it("retries temporary service unavailability without accepting it as health", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }));
    for (const response of readyResponses()) fetchImpl.mockResolvedValueOnce(response);
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    await expect(probeMcpDeployment({ endpointUrl, tenantId: "tenant" }, { fetchImpl, sleepImpl })).resolves.toMatchObject({ status: "PASSED" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });
  it("stops after the bounded startup window", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    await expect(probeMcpDeployment({ endpointUrl, tenantId: "tenant" }, { fetchImpl, sleepImpl })).rejects.toThrow("MCP health check failed");
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(sleepImpl).toHaveBeenCalledTimes(5);
  });
  it("does not retry identity drift or accept anonymous MCP access", async () => {
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const drift = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 })).mockResolvedValueOnce(Response.json({ resource: "https://other.azurewebsites.net/api/mcp" }));
    await expect(probeMcpDeployment({ endpointUrl, tenantId: "tenant" }, { fetchImpl: drift, sleepImpl })).rejects.toThrow("metadata does not match");
    expect(drift).toHaveBeenCalledTimes(2);
    const responses = readyResponses();
    responses[2] = new Response(null, { status: 200 });
    const anonymous = vi.fn();
    for (const response of responses) anonymous.mockResolvedValueOnce(response);
    await expect(probeMcpDeployment({ endpointUrl, tenantId: "tenant" }, { fetchImpl: anonymous, sleepImpl })).rejects.toThrow("authentication challenge");
    expect(anonymous).toHaveBeenCalledTimes(3);
    expect(sleepImpl).not.toHaveBeenCalled();
  });
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
