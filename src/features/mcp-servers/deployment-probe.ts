import { requireManagedMcpEndpoint } from "./identity-service";

class McpStartupError extends Error {}

export async function probeMcpDeployment(input: { endpointUrl: string; tenantId: string }, {
  fetchImpl = fetch,
  sleepImpl = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
}: { fetchImpl?: typeof fetch; sleepImpl?: (ms: number) => Promise<void> } = {}) {
  const endpoint = requireManagedMcpEndpoint(input.endpointUrl);
  for (let attempt = 1; ; attempt++) {
    try {
      return await probeReadyMcpDeployment(endpoint, input.tenantId, fetchImpl);
    } catch (error) {
      if (!(error instanceof McpStartupError) || attempt >= 6) throw error;
      await sleepImpl(5_000);
    }
  }
}

async function probeReadyMcpDeployment(endpoint: string, tenantId: string, fetchImpl: typeof fetch) {
  const metadataUrl = new URL("/.well-known/oauth-protected-resource", endpoint).href;
  const probe = async (url: string, method = "GET") => {
    try { return await fetchImpl(url, { method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) }); }
    catch { throw new McpStartupError("MCP endpoint could not be reached during startup."); }
  };
  const requireStatus = (response: Response, expected: number, message: string) => {
    if (response.status === expected) return;
    if (response.status === 404 || response.status >= 500) throw new McpStartupError(message);
    throw new Error(message);
  };
  requireStatus(await probe(new URL("/api/health", endpoint).href), 200, "MCP health check failed.");
  const discovery = await probe(metadataUrl);
  requireStatus(discovery, 200, "MCP discovery check failed.");
  const reader=discovery.body?.getReader(); let text=""; let size=0;
  if (reader) {
    const decoder = new TextDecoder();
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try { chunk = await reader.read(); }
      catch { throw new McpStartupError("MCP metadata could not be read during startup."); }
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 32_768) { await reader.cancel(); throw new Error("MCP metadata exceeds the limit."); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  }
  const data = JSON.parse(text);
  if (data.resource !== endpoint || !Array.isArray(data.authorization_servers) || data.authorization_servers.length !== 1 || data.authorization_servers[0] !== `https://login.microsoftonline.com/${tenantId}/v2.0` || !data.scopes_supported?.includes(`${endpoint}/mcp.access`)) throw new Error("MCP resource metadata does not match the configured identity.");
  const response = await probe(endpoint, "POST");
  requireStatus(response, 401, "MCP authentication challenge check failed.");
  if (!response.headers.get("WWW-Authenticate")?.includes(`resource_metadata="${metadataUrl}"`)) throw new Error("MCP authentication challenge check failed.");
  return { status: "PASSED" as const, currency: "HISTORICAL_ONLY" as const, checkedAt: new Date() };
}
