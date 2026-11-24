import { z } from "zod";

const id = z.string().min(1).max(512);
export const timestamp = z.string().datetime({ offset: true });
export const repository = z.string().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
const metadata = z.object({ scope: id, collectedAt: timestamp, complete: z.boolean(),
  gapReason: z.enum(["page-unavailable", "pagination-changed", "azure-inventory-unavailable"]).optional() });
const app = z.object({
  id, ownerId: id.nullable(), repositoryUrl: repository.nullable(), sourceOfTruth: id,
  publishStatus: id, hasLiveUrl: z.boolean(),
  deploymentTriggerMode: z.enum(["PORTAL_DISPATCH", "PUSH_TO_DEPLOY"]).nullish(),
  health: z.object({ status: z.enum(["HEALTHY", "WARNING", "UNHEALTHY", "NOT_CHECKED"]), checkedAt: timestamp }).nullish(),
});
const site = z.object({ resourceId: id, requestId: id.nullish(), manager: id.nullish(), state: id.nullable(),
  ownerId: id.nullish(), repository: id.nullish() });
export const portalSnapshot = metadata.extend({ rows: z.array(app) });
export const azureSnapshot = metadata.extend({ rows: z.array(site) });
export type App = z.infer<typeof app>;
export type Site = z.infer<typeof site>;

function unique<T>(rows: T[], key: (row: T) => string) {
  const entries = new Map<string, T>();
  for (const row of rows) {
    const identity = key(row);
    const previous = entries.get(identity);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
      throw new Error("Conflicting records share a source identity. Refresh the snapshot.");
    }
    entries.set(identity, row);
  }
  return [...entries.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);
}

export function inventory(portalInput: unknown, azureInput: unknown) {
  const { rows: apps, ...portal } = portalSnapshot.parse(portalInput);
  const { rows: sites, ...azure } = azureSnapshot.parse(azureInput);
  const registrations = new Map(unique(apps, a => a.id).map(a => [a.id, a]));
  const claims = new Map<string, Site[]>();
  const otherSites: { site: Site; status: "ownership-unknown" | "other-manager" }[] = [];
  for (const site of unique(sites, s => s.resourceId.toLowerCase())) {
    if (site.manager === "cu-app-portal" && site.requestId) {
      const group = claims.get(site.requestId) ?? [];
      group.push(site);
      claims.set(site.requestId, group);
    } else {
      otherSites.push({ site, status: site.manager && site.manager !== "cu-app-portal" ? "other-manager" : "ownership-unknown" });
    }
  }
  const complete = portal.complete && azure.complete;
  const rows = [...new Set([...registrations.keys(), ...claims.keys()])].sort().map(requestId => {
    const app = registrations.get(requestId) ?? null;
    const sites = claims.get(requestId) ?? [];
    let status: string;
    if (sites.length > 1) status = "ambiguous";
    else if (!complete) status = "incomplete";
    else if (!app) status = "azure-only";
    else status = sites.length ? "matched" : "portal-only";
    const gaps: string[] = [];
    if (!app?.ownerId) gaps.push("missing-owner");
    if (!app?.repositoryUrl) gaps.push("missing-repository");
    const assigned = sites.length === 1 ? sites[0] : null;
    if (app && assigned?.ownerId && app.ownerId !== assigned.ownerId) gaps.push("owner-tag-mismatch");
    if (app && assigned?.repository && app.repositoryUrl?.toLowerCase() !== "https://github.com/" + assigned.repository.toLowerCase()) gaps.push("repository-tag-mismatch");
    if (sites.length && app && app.publishStatus !== "SUCCEEDED") gaps.push("review-publish-status");
    const ageMs = app?.health && Date.parse(portal.collectedAt) - Date.parse(app.health.checkedAt);
    const healthInterval = app?.health?.status === "HEALTHY" ? 120 : 5;
    if (ageMs == null || ageMs < 0 || ageMs > healthInterval * 60_000 || app?.health?.status === "NOT_CHECKED") gaps.push("no-current-health-observation");
    return { requestId, app, sites, status, gaps };
  });
  const counts: Record<string, number> = {};
  for (const row of [...rows, ...otherSites]) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return { portal, azure, complete, counts, rows, otherSites };
}
