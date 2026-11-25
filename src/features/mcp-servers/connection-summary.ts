import type { McpIdentityRecord } from "./types";
type McpConnectionRecord = Pick<McpIdentityRecord, "endpointUrl" | "tenantId" | "setupStatus" | "checkedAt" |
  "probeStatus" | "probeAttemptId" | "probeCommitSha" | "probeCheckedAt">;

export function buildMcpConnectionSummary(record: McpConnectionRecord | null | undefined, deployment: { published: boolean }) {
  if (!record) return null;
  const endpoint = record.setupStatus === "READY" && deployment.published ? record.endpointUrl : null;
  return {
    profileVersion: "1.0" as const, transport: "streamable-http" as const,
    endpointUrl: endpoint, resourceMetadataUrl: endpoint ? new URL("/.well-known/oauth-protected-resource", endpoint).href : null,
    authentication: { mode: "entra-mcp" as const, tenantId: record.tenantId, issuer: `https://login.microsoftonline.com/${record.tenantId}/v2.0`, scopes: [`${record.endpointUrl}/mcp.access`] },
    setupStatus: record.setupStatus, checkedAt: record.checkedAt?.toISOString() ?? null,
    deploymentProbe: { status: record.probeStatus ?? "NOT_CHECKED", currency: "HISTORICAL_ONLY" as const, attemptId: record.probeAttemptId ?? null, commitSha: record.probeCommitSha ?? null, checkedAt: record.probeCheckedAt?.toISOString() ?? null },
    clientVerification: "REQUIRED" as const,
  };
}
export type McpConnectionSummary = NonNullable<ReturnType<typeof buildMcpConnectionSummary>>;
