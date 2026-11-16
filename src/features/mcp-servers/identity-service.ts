import type { McpIdentityGraph, McpIdentityLease, McpIdentityRecord } from "./types";

export function requireManagedMcpEndpoint(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.azurewebsites\.net$/.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/api/mcp") throw new Error("MCP requires the canonical managed Azure endpoint.");
  return url.href;
}
export type McpIdentityDependencies = {
  enabled: boolean; tenantId: string; now(): Date;
  store: { claim(appId: string, endpointUrl: string, tenantId: string): Promise<McpIdentityLease> };
  graph: McpIdentityGraph;
};
export async function ensureMcpIdentity(input: { appId: string; endpointUrl: string }, deps: McpIdentityDependencies): Promise<McpIdentityRecord> {
  if (!deps.enabled) throw new Error("MCP identity automation requires the approved live pilot. Ask an operator to complete MCP setup.");
  const endpointUrl = requireManagedMcpEndpoint(input.endpointUrl);
  const lease = await deps.store.claim(input.appId, endpointUrl, deps.tenantId);
  let record = lease.record;
  try {
    if (record.endpointUrl !== endpointUrl || record.tenantId !== deps.tenantId) throw new Error("MCP resource identity cannot change during repair.");
    try {
      const application = await deps.graph.ensureApplication({ ...input, endpointUrl, applicationObjectId: record.applicationObjectId, scopeId: record.scopeId, authorizeMutation: () => lease.assertCurrent() });
      if (record.applicationObjectId && (record.applicationObjectId !== application.applicationObjectId || record.applicationClientId !== application.applicationClientId || record.scopeId !== application.scopeId)) throw new Error("MCP identity changed.");
      record = await lease.save(application);
      const servicePrincipalId = await deps.graph.ensureServicePrincipal(application.applicationClientId, () => lease.assertCurrent());
      if (record.servicePrincipalId && record.servicePrincipalId !== servicePrincipalId) throw new Error("MCP identity changed.");
      record = await lease.save({ servicePrincipalId });
      const ready = await deps.graph.isReady(application.applicationObjectId, servicePrincipalId, application.scopeId);
      return await lease.save({ setupStatus: ready ? "READY" : "ACTION_REQUIRED", failureCode: ready ? null : "MCP_CLIENT_ENROLLMENT_REQUIRED", checkedAt: deps.now() });
    } catch {
      return await lease.save({ setupStatus: "ACTION_REQUIRED", failureCode: "MCP_IDENTITY_ACTION_REQUIRED", checkedAt: deps.now() });
    }
  } finally { await lease.release(); }
}
export const MCP_SETTING_NAMES = ["MCP_RESOURCE_URL", "MCP_ENTRA_TENANT_ID", "MCP_ENTRA_ISSUER", "MCP_ENTRA_AUDIENCE", "MCP_ENTRA_SCOPE", "MCP_ALLOWED_ORIGINS"] as const;
export function buildMcpRuntimeSettings(identity: McpIdentityRecord): Record<string, string> {
  if (identity.setupStatus !== "READY" || !identity.applicationClientId) throw new Error("MCP resource identity setup is required before publishing.");
  return { MCP_RESOURCE_URL: identity.endpointUrl, MCP_ENTRA_TENANT_ID: identity.tenantId, MCP_ENTRA_ISSUER: `https://login.microsoftonline.com/${identity.tenantId}/v2.0`, MCP_ENTRA_AUDIENCE: identity.applicationClientId, MCP_ENTRA_SCOPE: "mcp.access", MCP_ALLOWED_ORIGINS: "" };
}
