import { requireManagedMcpEndpoint } from "./identity-service";

export async function probeMcpDeployment(input: { endpointUrl: string; tenantId: string }, { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {}) {
  const endpoint = requireManagedMcpEndpoint(input.endpointUrl);
  const metadataUrl = new URL("/.well-known/oauth-protected-resource", endpoint).href;
  const probe = (url: string, method = "GET") => fetchImpl(url, { method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if ((await probe(new URL("/api/health", endpoint).href)).status !== 200) throw new Error("MCP health check failed.");
  const discovery = await probe(metadataUrl);
  if (discovery.status !== 200) throw new Error("MCP discovery check failed.");
  const reader=discovery.body?.getReader(); let text=""; let size=0;
  if (reader) { const decoder=new TextDecoder(); for (;;) { const {value,done}=await reader.read(); if(done) break; size+=value.byteLength; if(size>32_768){await reader.cancel(); throw new Error("MCP metadata exceeds the limit.");} text+=decoder.decode(value,{stream:true}); } text+=decoder.decode(); }
  const data = JSON.parse(text);
  if (data.resource !== endpoint || !Array.isArray(data.authorization_servers) || data.authorization_servers.length !== 1 || data.authorization_servers[0] !== `https://login.microsoftonline.com/${input.tenantId}/v2.0` || !data.scopes_supported?.includes(`${endpoint}/mcp.access`)) throw new Error("MCP resource metadata does not match the configured identity.");
  const response = await probe(endpoint, "POST");
  if (response.status !== 401 || !response.headers.get("WWW-Authenticate")?.includes(`resource_metadata="${metadataUrl}"`)) throw new Error("MCP authentication challenge check failed.");
  return { status: "PASSED" as const, currency: "HISTORICAL_ONLY" as const, checkedAt: new Date() };
}
