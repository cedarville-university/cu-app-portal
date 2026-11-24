import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { azureSnapshot, portalSnapshot } from "./report";

const page = z.object({ nextOffset: z.number().int().nonnegative().nullable(), apps: z.array(z.object({
  id: z.string(), owner: z.object({ id: z.string() }).nullish(), repositoryUrl: z.string().nullable(),
  publishStatus: z.string(), sourceOfTruth: z.string(), liveUrl: z.string().nullable(),
  healthStatus: z.string().nullish(), healthCheckedAt: z.string().nullish(),
  deploymentTriggerMode: z.string().nullish(),
})) });

export async function collectPortal(scope: string, fetchPage: (offset: number) => Promise<unknown>) {
  const rows: z.infer<typeof portalSnapshot>["rows"] = [];
  let offset: number | null = 0;
  let complete = false;
  let gapReason: "page-unavailable" | "pagination-changed" | undefined;
  try {
    do {
      const result = page.parse(await fetchPage(offset));
      rows.push(...portalSnapshot.shape.rows.parse(result.apps.map(a => ({
        id: a.id, ownerId: a.owner?.id ?? null, repositoryUrl: a.repositoryUrl,
        publishStatus: a.publishStatus, sourceOfTruth: a.sourceOfTruth, hasLiveUrl: Boolean(a.liveUrl),
        deploymentTriggerMode: a.deploymentTriggerMode,
        health: a.healthCheckedAt && a.healthStatus ? { checkedAt: a.healthCheckedAt, status: a.healthStatus } : null,
      }))));
      if (result.nextOffset !== null && (result.apps.length === 0 || result.nextOffset !== offset + result.apps.length)) break;
      offset = result.nextOffset;
    } while (offset !== null);
    complete = offset === null && new Set(rows.map(a => a.id)).size === rows.length;
    if (!complete) gapReason = "pagination-changed";
  } catch { gapReason = "page-unavailable"; }
  return { scope, collectedAt: new Date().toISOString(), complete, gapReason, rows };
}

export async function capture() {
  const { values } = parseArgs({ options: { out: { type: "string" }, "portal-url": { type: "string" },
    "resource-group": { type: "string", default: "rg-cu-apps-published" } } });
  if (!values.out || !values["portal-url"]) throw new Error("Expected a new output directory and portal MCP URL.");
  const url = new URL(values["portal-url"]);
  if (url.protocol !== "https:" || url.pathname !== "/api/mcp" || url.username || url.password || url.search || url.hash) throw new Error("Invalid portal URL.");
  const group = values["resource-group"]!;
  await mkdir(values.out, { mode: 0o700 });
  const client = new Client({ name: "cu-launch-pilot-inventory", version: "1" });
  let connected = false;
  const portal = await collectPortal(url.origin, async offset => {
    if (!connected) {
      const token = process.env.CU_LAUNCH_PILOT_READ_TOKEN;
      if (!token) throw new Error("Missing delegated read token.");
      await client.connect(new StreamableHTTPClientTransport(url, { requestInit: {
        headers: { Authorization: "Bearer " + token }, redirect: "error",
      } }));
      connected = true;
    }
    const result = await client.callTool({ name: "admin_list_apps", arguments: { offset, limit: 100 } });
    if (result.isError) throw new Error("Portal read unavailable.");
    return result.structuredContent;
  });
  if (connected) await client.close();
  const azure: z.infer<typeof azureSnapshot> = { scope: group, collectedAt: new Date().toISOString(), complete: false, rows: [] };
  try {
    const { stdout } = await promisify(execFile)("az", ["webapp", "list", "-g", group, "--query",
      "[].{resourceId:id,manager:tags.managedBy,requestId:tags.appRequestId,state:state,ownerId:tags.ownerUserId,repository:tags.repository}", "-o", "json", "--only-show-errors"],
    { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 });
    azure.rows = azureSnapshot.shape.rows.parse(JSON.parse(stdout));
    azure.complete = true;
  } catch { azure.gapReason = "azure-inventory-unavailable"; }
  for (const [name, value] of Object.entries({ portal, azure })) {
    await writeFile(join(values.out, name + ".json"), JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
  }
  if (!portal.complete || !azure.complete) process.exitCode = 2;
}
