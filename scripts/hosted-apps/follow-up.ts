import { z } from "zod";
import { timestamp } from "./report";

const check = z.object({ rule: z.string(), ruleVersion: z.string(), component: z.string(),
  outcome: z.string(), revision: z.string().nullable(), checkedAt: timestamp.nullable() });
const tracking = z.object({ requestId: z.string(), target: z.string().nullable(), rule: z.string(),
  ruleVersion: z.string(), component: z.string(), previousRevision: z.string().nullable(),
  lastFindingAt: timestamp.nullable(), status: z.enum(["open", "verified-fixed"]) });
const previousReport = z.object({ pilot: z.array(z.object({ requestId: z.string(), target: z.string().nullable(),
  checks: z.array(check) })), findings: z.array(tracking).optional() });
type Report = z.infer<typeof previousReport>;

export function followUp(current: Report, previous: unknown) {
  const history = previousReport.parse(previous);
  const pending = new Map<string, z.infer<typeof tracking>>();
  function add(entry: z.infer<typeof tracking>) {
    pending.set(JSON.stringify([entry.requestId, entry.target, entry.rule, entry.ruleVersion, entry.component]), entry);
  }
  for (const old of history.findings ?? []) if (old.status === "open") add(old);
  for (const app of history.pilot) {
    for (const c of app.checks.filter(check => check.outcome === "finding")) {
      add({ requestId: app.requestId, target: app.target, rule: c.rule, ruleVersion: c.ruleVersion,
        component: c.component, lastFindingAt: c.checkedAt, previousRevision: c.revision, status: "open" });
    }
  }
  return [...pending.values()].map(old => {
    const app = current.pilot.find(a => a.requestId === old.requestId && old.target && a.target === old.target);
    const latest = app?.checks.find(c => c.rule === old.rule && c.component === old.component && c.ruleVersion === old.ruleVersion);
    const verified = latest?.outcome === "pass" && latest.revision && old.previousRevision &&
      latest.revision !== old.previousRevision && latest.checkedAt && old.lastFindingAt &&
      Date.parse(latest.checkedAt) > Date.parse(old.lastFindingAt);
    return { ...old, revision: latest?.revision ?? null, status: verified ? "verified-fixed" as const : "open" as const };
  });
}
