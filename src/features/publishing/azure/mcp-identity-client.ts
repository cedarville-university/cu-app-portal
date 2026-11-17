import { createHash } from "node:crypto";
import type { McpIdentityGraph } from "@/features/mcp-servers/types";
import { requireManagedMcpEndpoint } from "@/features/mcp-servers/identity-service";

export const mcpOwnership = (appId: string) => `cu-launch-mcp:${appId}`;
function scopeUuid(appId: string) {
  const h = createHash("sha256").update(mcpOwnership(appId)).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
type Application = { id: string; appId: string; notes: string; identifierUris?: string[]; signInAudience?: string; api?: { requestedAccessTokenVersion?: number; oauth2PermissionScopes?: Array<{ id: string; value: string; isEnabled: boolean; type: string }>; preAuthorizedApplications?: Array<{ appId: string; delegatedPermissionIds: string[] }> } };
type Principal = { id: string; appId: string; appRoleAssignmentRequired?: boolean };
type Options = { tokenProvider(): Promise<string>; clientIds: string[]; fetchImpl?: typeof fetch; authorizeMutation?: () => Promise<void> };
export function createMcpIdentityClient(options: Options): McpIdentityGraph & { deleteOwnedApplication(appId: string, applicationObjectId: string): Promise<void> } {
  const fetchImpl = options.fetchImpl ?? fetch;
  async function request<T>(path: string, method = "GET", body?: unknown, authorizeMutation?: () => Promise<void>): Promise<T | null> {
    if (method !== "GET") { await authorizeMutation?.(); await options.authorizeMutation?.(); }
    const response = await fetchImpl(`https://graph.microsoft.com/v1.0/${path}`, { method, headers: { Authorization: `Bearer ${await options.tokenProvider()}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000) });
    if (response.status === 404 && (method === "GET" || method === "DELETE")) return null;
    if (!response.ok) throw new Error(`MCP identity provider action required (HTTP ${response.status}).`);
    return response.status === 204 ? null : response.json() as Promise<T>;
  }
  const application = (id: string) => request<Application>(`applications/${encodeURIComponent(id)}`);
  return {
    async ensureApplication(input) {
      const endpoint = requireManagedMcpEndpoint(input.endpointUrl);
      const marker = mcpOwnership(input.appId);
      const displayName = `cu-mcp-${createHash("sha256").update(marker).digest("hex").slice(0,24)}`;
      let app = input.applicationObjectId ? await application(input.applicationObjectId) : null;
      if (input.applicationObjectId && !app) throw new Error("Stored MCP application is missing; operator review is required.");
      if (!input.applicationObjectId) {
        const result = await request<{ value: Application[]; "@odata.nextLink"?: string }>(`applications?${new URLSearchParams({ "$filter": `displayName eq '${displayName}'`, "$top": "2" })}`);
        if (!result || result["@odata.nextLink"] || result.value.length > 1) throw new Error("Ambiguous MCP resource ownership.");
        app = result.value[0] ?? null;
      }
      let scopeId = input.scopeId ?? scopeUuid(input.appId);
      if (app) {
        if (app.notes !== marker) throw new Error("MCP resource ownership mismatch.");
        const scope = app.api?.oauth2PermissionScopes?.find(s => s.value === "mcp.access" && s.isEnabled && s.type === "Admin");
        if (!scope || (input.scopeId && scope.id !== input.scopeId) || app.signInAudience !== "AzureADMyOrg" || app.api?.requestedAccessTokenVersion !== 2 || !app.identifierUris?.includes(endpoint)) throw new Error("MCP resource identity drift requires operator review.");
        scopeId = scope.id;
      } else {
        app = await request<Application>("applications", "POST", { displayName, notes: marker, signInAudience: "AzureADMyOrg", identifierUris: [endpoint], api: { requestedAccessTokenVersion: 2, oauth2PermissionScopes: [{ id: scopeId, value: "mcp.access", type: "Admin", isEnabled: true, adminConsentDisplayName: "Access this Cedarville MCP server", adminConsentDescription: "Use this server's tools as the signed-in Cedarville user." }] } }, input.authorizeMutation);
      }
      if (!app?.id || !app.appId) throw new Error("MCP identity creation did not return identifiers.");
      return { applicationObjectId: app.id, applicationClientId: app.appId, scopeId };
    },
    async ensureServicePrincipal(applicationClientId, authorizeMutation) {
      const result = await request<{ value: Principal[] }>(`servicePrincipals?${new URLSearchParams({ "$filter": `appId eq '${applicationClientId.replaceAll("'", "''")}'`, "$top": "2" })}`);
      if (!result || result.value.length > 1) throw new Error("Ambiguous MCP service principal.");
      const principal = result.value[0] ?? await request<Principal>("servicePrincipals", "POST", { appId: applicationClientId, appRoleAssignmentRequired: true }, authorizeMutation);
      if (!principal?.id || principal.appId !== applicationClientId) throw new Error("MCP service principal mismatch.");
      return principal.id;
    },
    async isReady(applicationObjectId, servicePrincipalId, scopeId) {
      if (!options.clientIds.length) return false;
      const app = await application(applicationObjectId);
      const principal = await request<Principal>(`servicePrincipals/${encodeURIComponent(servicePrincipalId)}`);
      return Boolean(app && principal?.appId === app.appId && principal.appRoleAssignmentRequired && options.clientIds.every(id => app.api?.preAuthorizedApplications?.some(c => c.appId === id && c.delegatedPermissionIds.includes(scopeId))));
    },
    async deleteOwnedApplication(appId, applicationObjectId) {
      const app = await application(applicationObjectId);
      if (!app) return;
      if (app.notes !== mcpOwnership(appId)) throw new Error("MCP resource ownership mismatch; deletion stopped.");
      // Deleting the owned home-tenant application also removes its service principal.
      await request(`applications/${encodeURIComponent(applicationObjectId)}`, "DELETE");
    },
  };
}
