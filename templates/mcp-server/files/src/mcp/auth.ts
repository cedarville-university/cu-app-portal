import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type McpConfig = { endpoint: string; tenantId: string; issuer: string; audience: string; scope: string; origins: string[] };
export type McpPrincipal = Readonly<{ tenantId: string; objectId: string }>;
export class AuthError extends Error {
  constructor(public status: 401 | 403) { super("Cedarville sign-in with this server's permission is required."); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function loadConfig(env: Record<string, string | undefined> = process.env): McpConfig {
  const endpoint = new URL(env.MCP_RESOURCE_URL ?? "");
  const tenantId = env.MCP_ENTRA_TENANT_ID ?? "";
  const audience = env.MCP_ENTRA_AUDIENCE ?? "";
  const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.port || endpoint.pathname !== "/api/mcp" || !uuid.test(tenantId) || !uuid.test(audience) || env.MCP_ENTRA_ISSUER !== issuer || env.MCP_ENTRA_SCOPE !== "mcp.access") throw new Error("MCP identity configuration is incomplete.");
  const origins = (env.MCP_ALLOWED_ORIGINS ?? "").split(",").map(x => x.trim()).filter(Boolean);
  for (const origin of origins) if (new URL(origin).origin !== origin || !origin.startsWith("https://")) throw new Error("Invalid origin configuration.");
  return { endpoint: endpoint.href, tenantId, audience, issuer, scope: "mcp.access", origins };
}
const jwks = new Map<string, JWTVerifyGetKey>();
export async function verifyToken(authorization: string | null, config: McpConfig, key?: CryptoKey | Uint8Array | JWTVerifyGetKey): Promise<McpPrincipal> {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new AuthError(401);
  if (!key) {
    if (!jwks.has(config.tenantId)) jwks.set(config.tenantId, createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`), { timeoutDuration: 3000 }));
    key = jwks.get(config.tenantId)!;
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(match[1], key as JWTVerifyGetKey, { algorithms: ["RS256"], issuer: config.issuer, audience: config.audience, requiredClaims: ["exp", "tid", "oid"] }));
  } catch { throw new AuthError(401); }
  const email = payload.preferred_username ?? payload.email;
  if (payload.tid !== config.tenantId || typeof payload.oid !== "string" || !payload.oid.trim() || typeof email !== "string" || !email.toLowerCase().endsWith("@cedarville.edu") || payload.acct === 1 || payload.acct === "1") throw new AuthError(401);
  if (typeof payload.scp !== "string" || !payload.scp.split(" ").includes(config.scope)) throw new AuthError(403);
  return Object.freeze({ tenantId: config.tenantId, objectId: payload.oid });
}
export function metadata(config: McpConfig) {
  return { resource: config.endpoint, authorization_servers: [config.issuer], scopes_supported: [`${config.endpoint}/${config.scope}`], bearer_methods_supported: ["header"] };
}
