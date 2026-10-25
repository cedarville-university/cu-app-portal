import { z } from "zod";
import { LogReadBudget, checkLogResponse, parseLogJson } from "./http";
import { LogReadError, sourceFailure, type AzurePosition, type ProviderLogPage, type LogEntry } from "./types";
const deploymentSchema = z.object({
  id: z.string().min(1).max(2048),
  name: z.string().min(1).max(128).optional(),
  properties: z.object({
    start_time: z.string().optional(), end_time: z.string().optional(), status: z.union([z.number(), z.string()]).optional()
  }).optional(),
});
const deploymentsSchema = z.object({ value: z.array(deploymentSchema).max(100), nextLink: z.string().nullable().optional() });
type Deployment = z.infer<typeof deploymentSchema>;
async function selectDeployment(base: string, pinnedId: string | undefined, budget: LogReadBudget, token: () => Promise<string>): Promise<Deployment | undefined> {
  if (pinnedId) {
    const response = await budget.request(`${base}/deployments/${encodeURIComponent(pinnedId)}?api-version=2025-03-01`, { method: "GET" }, token);
    checkLogResponse(response);
    const parsed = deploymentSchema.safeParse(parseLogJson(response.text));
    if (!parsed.success || (parsed.data.name ?? parsed.data.id.split("/").pop()) !== pinnedId)
      throw new LogReadError("unavailable", "The provider returned unexpected deployment metadata.");
    return parsed.data;
  }
  const deployments: Deployment[] = [];
  const expected = new URL(`${base}/deployments`);
  let nextUrl: string | null = `${expected}?api-version=2025-03-01`;
  for (let page = 0; nextUrl && page < 5; page++) {
    const response = await budget.request(nextUrl, { method: "GET" }, token);
    checkLogResponse(response);
    const parsed = deploymentsSchema.safeParse(parseLogJson(response.text));
    if (!parsed.success)
      throw new LogReadError("unavailable", "The provider returned unsupported deployment metadata.");
    deployments.push(...parsed.data.value);
    nextUrl = null;
    if (parsed.data.nextLink) {
      let next: URL;
      try {
        next = new URL(parsed.data.nextLink);
      }
      catch {
        throw new LogReadError("unavailable", "The provider returned an invalid deployment page.");
      }
      if (next.origin !== expected.origin || next.pathname.toLowerCase() !== expected.pathname.toLowerCase() || next.username || next.password || next.hash || next.searchParams.get("api-version") !== "2025-03-01")
        throw new LogReadError("unavailable", "The provider returned a deployment page outside this app.");
      nextUrl = next.toString();
    }
  }
  if (nextUrl)
    throw new LogReadError("unavailable", "Deployment discovery exceeded its page budget; the latest deployment could not be established.");
  return deployments.sort((a, b) => (b.properties?.start_time ?? "").localeCompare(a.properties?.start_time ?? ""))[0];
}
export async function readAzureLogs(target: {
  subscription: string;
  resourceGroup: string;
  webApp: string;
}, selection: {
  maxLines: number;
  logKind: "deployment" | "runtime" | "both";
  position?: AzurePosition;
}, budget: LogReadBudget, token: () => Promise<string>): Promise<ProviderLogPage<AzurePosition>> {
  const base = `https://management.azure.com/subscriptions/${encodeURIComponent(target.subscription)}/resourceGroups/${encodeURIComponent(target.resourceGroup)}/providers/Microsoft.Web/sites/${encodeURIComponent(target.webApp)}`;
  const version = "api-version=2025-03-01";
  const entries: LogEntry[] = [];
  const next: AzurePosition = { deployment: null, runtime: null };
  const wantDeployment = selection.position ? selection.position.deployment : selection.logKind !== "runtime" ? { offset: 0 } : null;
  const wantRuntime = selection.position ? selection.position.runtime : selection.logKind !== "deployment" ? { offset: 0 } : null;
  if (wantDeployment)
    try {
      const selected = await selectDeployment(base, wantDeployment.id, budget, token);
      if (!selected)
        throw new LogReadError("empty", "No deployment logs are available.");
      const deploymentId = selected.name ?? selected.id.split("/").pop()!;
      if (!deploymentId || deploymentId.length > 128)
        throw new LogReadError("unavailable", "The provider returned an unsupported deployment ID.");
      const deployment = { ...selected, deploymentId };
      const response = await budget.request(`${base}/deployments/${encodeURIComponent(deployment.deploymentId)}/log?${version}`, { method: "GET" }, token);
      checkLogResponse(response);
      const raw = parseLogJson(response.text);
      const records = Array.isArray(raw) ? raw : raw && typeof raw === "object" && "value" in raw ? (raw as {
        value: unknown;
      }).value : undefined;
      if (!Array.isArray(records))
        throw new LogReadError("unavailable", "The provider returned unsupported deployment logs.");
      const text = records.map(item => {
        if (!item || typeof item !== "object")
          return "";
        const p = "properties" in item && item.properties && typeof item.properties === "object" ? item.properties : item;
        const r = p as Record<string, unknown>;
        return typeof r.message === "string" ? `${typeof r.log_time === "string" ? r.log_time + " " : ""}${r.message}` : "";
      }).filter(Boolean).join("\n");
      const clip = budget.excerpt(text, wantDeployment.offset, selection.maxLines);
      entries.push({
        source: "azure_deployment", status: clip.text ? "available" : "empty", deploymentId: deployment.deploymentId, providerStatus: String(deployment.properties?.status ?? "unknown"), correlation: "uncorrelated", message: "Azure deployment logs; no reliable correlation to the selected portal attempt is recorded.", timestamp: deployment.properties?.start_time, text: clip.text, lineCount: clip.nextLine, truncated: clip.truncated
      });
      if (clip.truncated)
        next.deployment = { id: deployment.deploymentId, offset: clip.nextOffset };
    }
    catch (error) {
      entries.push(sourceFailure("azure_deployment", error));
    }
  if (wantRuntime)
    try {
      const response = await budget.request(`${base}/containerlogs?${version}`, { method: "POST" }, token);
      checkLogResponse(response);
      const clip = budget.excerpt(response.text, wantRuntime.offset, selection.maxLines);
      entries.push({
        source: "azure_runtime", status: clip.text ? "available" : "empty", text: clip.text, lineCount: clip.nextLine, truncated: clip.truncated, collectedAt: new Date().toISOString(), snapshot: "Recent runtime snapshot; output can change between calls and is not tied to the selected publish attempt."
      });
      if (clip.truncated)
        next.runtime = { offset: clip.nextOffset };
    }
    catch (error) {
      entries.push(sourceFailure("azure_runtime", error));
    }
  return { entries, next: next.deployment || next.runtime ? next : null };
}
