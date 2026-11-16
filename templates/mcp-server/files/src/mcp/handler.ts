import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AuthError, loadConfig, metadata, verifyToken } from "./auth";
import { createServer } from "./server";

const buckets = new Map<string, { until: number; count: number }>();
function reply(status: number, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
export async function handleMetadata(env: Record<string, string | undefined> = process.env) {
  try { return Response.json(metadata(loadConfig(env)), { headers: { "Cache-Control": "no-store" } }); }
  catch { return reply(503, "MCP identity setup is required."); }
}
export async function handleMcp(request: Request, env: Record<string, string | undefined> = process.env, displayName?: string): Promise<Response> {
  let config;
  try { config = loadConfig(env); } catch { return reply(503, "MCP identity setup is required."); }
  const origin = request.headers.get("Origin");
  if (origin && !config.origins.includes(origin)) return reply(403, "Origin is not allowed.");
  const cors: Record<string, string> = origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version" } : {};
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id", "Cache-Control": "no-store" } });
  let principal;
  try { principal = await verifyToken(request.headers.get("Authorization"), config); }
  catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    const metadataUrl = new URL("/.well-known/oauth-protected-resource", config.endpoint).href;
    return reply(status, "Cedarville sign-in with this server's permission is required.", { ...cors, "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}", scope="${config.endpoint}/${config.scope}"` });
  }
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key);
  const key = `${principal.tenantId}:${principal.objectId}`;
  const bucket = buckets.get(key) ?? { until: now + 60_000, count: 0 };
  if (bucket.count >= 60 || (!buckets.has(key) && buckets.size >= 10_000)) return reply(429, "Request limit reached.", { ...cors, "Retry-After": "60" });
  bucket.count++; buckets.set(key, bucket);
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const server = createServer(principal, displayName);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reader = request.body?.getReader();
  try {
    const deadline = new Promise<Response>(resolve => { timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(() => {}); resolve(reply(504, "Request deadline exceeded.", cors)); }, 20_000); });
    const execute = async () => {
      let size = 0;
      const chunks: ArrayBuffer[] = [];
      if (reader) for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 256 * 1024) { await reader.cancel(); return reply(413, "Request is too large.", cors); }
        chunks.push(new Uint8Array(value).buffer);
      }
      if (signal.aborted) return reply(504, "Request deadline exceeded.", cors);
      const body = reader ? new Blob(chunks).stream() : undefined;
      const bounded = new Request(request.url, { method: request.method, headers: request.headers, ...(body ? { body, duplex: "half" } : {}), signal } as RequestInit);
      await server.connect(transport);
      const response = await transport.handleRequest(bounded);
      // JSON mode: consume before closing the per-request transport.
      const text = await response.text();
      return new Response(text || null, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...cors, "Cache-Control": "no-store" } });
    };
    return await Promise.race([execute(), deadline]);
  } catch { return reply(500, "The MCP request could not be completed.", cors); }
  finally { clearTimeout(timer); controller.abort(); await server.close().catch(() => {}); }
}
