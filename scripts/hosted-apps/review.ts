import { securityUpdate } from "../../src/features/security-review/update-types";
import { z } from "zod";
import { advisoryMetadata } from "../../src/features/security-review/results";
import { inventory, repository, timestamp } from "./report";

const key = z.string().regex(/^[\w./@:-]{1,512}$/);
const revision = z.string().regex(/^(?:[a-f0-9]{40}|sha256:[a-f0-9]{64})$/);
const deployment = z.object({
  id: key, resourceId: key, active: z.boolean(), succeeded: z.boolean(), finishedAt: timestamp.nullable(),
});
// A receipt binds the *deployed* checkout or package digest to the target's deployment ID.
// Workflow head SHA, time proximity and notification dismissal are not receipts.
const receipt = z.object({
  deploymentId: key, resourceId: key, repositoryUrl: repository, revision, evidenceRef: key,
});
const ruleControls = {
  dependency: ["advisory"],
  secret: ["secret-scan"],
  access: ["protected-pages", "protected-apis"],
  data: ["classification", "access-policy", "encryption", "retention"],
  login: ["branded-login", "server-initiation", "safe-return", "callback", "protected-pages", "protected-apis"],
  "entra-sign-in": ["live-entra"],
  "chrome-login": ["live-chrome"],
} as const;
const rules = z.enum(["dependency", "secret", "access", "data", "login", "entra-sign-in", "chrome-login"]);
type Rule = z.infer<typeof rules>;
const observation = z.object({
  rule: rules, component: key, revision, resourceId: key, checkedAt: timestamp, evidenceRef: key,
  controls: z.record(z.enum(["pass", "fail", "unknown"])),
});
const profile = z.object({
  framework: z.enum(["nextjs", "express", "fastapi", "static", "unknown"]),
  audience: z.enum(["public", "entra", "unknown"]), database: z.enum(["postgresql", "none", "unknown"]),
  trigger: z.enum(["portal-dispatch", "push", "unknown"]), revision,
  // Deployment manifests describe intent. Exemption requires review of the deployed source.
  loginExemptionEvidence: key.optional(),
});
const capability = z.enum(["readable", "unavailable", "unverified"]);
const sourcePath = z.string().min(1).max(4096).refine(path =>
  !path.startsWith("/") && !path.split("/").includes("..") && !/[\u0000-\u001f\u007f]/.test(path));
const semgrepReceipt = z.object({
  repository, revision, checkedAt: timestamp, engine: z.literal("Semgrep CE"), version: key, rulesRevision: revision,
  ruleDirectories: z.array(key).min(1), ruleFiles: z.number().int().positive(), status: z.enum(["complete", "partial"]),
  scanned: z.array(sourcePath), skipped: z.array(sourcePath), errors: z.array(z.unknown()), exitCode: z.number().int(),
  findings: z.array(z.object({ rule: key, file: sourcePath, line: z.number().int().positive(), severity: key })),
}).refine(scan => scan.status === "partial" ||
  (scan.exitCode === 0 && scan.scanned.length > 0 && scan.skipped.length === 0 && scan.errors.length === 0),
  "Complete Semgrep scans require coverage and zero scanner errors.");
const dependabotReceipt = z.object({
  repository: key, reader: z.literal("cu-launch-installation"), checkedAt: timestamp,
  updates: z.array(securityUpdate).optional(),
  alerts: z.array(z.object({ number: z.number().int().positive(), severity: key, package: key, manifest: sourcePath, advisory: key, ...advisoryMetadata })),
});
const exception = z.object({
  rule: rules, component: key, ownerId: key, rationale: z.string().trim().min(1).max(240), expiresAt: timestamp,
});
export const pilotEvidence = z.object({
  observedAt: timestamp, apps: z.array(z.object({
    requestId: key, deployments: z.array(deployment), receipts: z.array(receipt),
    profile: profile.optional(), observations: z.array(observation), deploymentsComplete: z.boolean(),
    capabilities: z.object({ dependency: capability, code: capability, secret: capability }),
    semgrep: semgrepReceipt.optional(), dependabot: dependabotReceipt.optional(),
    workflowRuns: z.array(z.object({ id: key, event: key, headSha: revision, conclusion: key.nullable() })).optional(),
    portalRunId: key.nullish(),
    exceptions: z.array(exception).default([]),
  })),
});
type PilotApp = z.infer<typeof pilotEvidence>["apps"][number];

function evaluate(rule: Rule, observations: z.infer<typeof observation>[], appProfile?: z.infer<typeof profile>) {
  if (rule === "login" || rule === "entra-sign-in" || rule === "chrome-login") {
    if (appProfile?.audience === "public" || ["static", "fastapi"].includes(appProfile?.framework ?? "")) {
      return appProfile?.loginExemptionEvidence ? "not-applicable" : "coverage-gap";
    }
    if (appProfile?.audience !== "entra" || !["nextjs", "express"].includes(appProfile.framework)) return "coverage-gap";
  }
  const controls: string[] = [...ruleControls[rule]];
  if (rule === "login" && appProfile?.framework === "express") controls.push("csrf-protected-initiation");
  const verdicts = controls.map(control => observations.map(o => o.controls[control]));
  if (verdicts.some(results => results.includes("fail"))) return "finding";
  return verdicts.every(results => results.includes("pass")) ? "pass" : "coverage-gap";
}

function resolveRevision(app: PilotApp, asOf: number, resourceId?: string, repositoryUrl?: string | null) {
  const active = app.deployments.filter(d => d.active && d.resourceId.toLowerCase() === resourceId?.toLowerCase());
  const current = active.length === 1 ? active[0] : null;
  const matching = app.receipts.filter(r => r.deploymentId === current?.id &&
    r.resourceId.toLowerCase() === resourceId?.toLowerCase() && r.repositoryUrl === repositoryUrl);
  const revisions = new Set(matching.map(r => r.revision));
  const verified = app.deploymentsComplete && current?.succeeded && current.finishedAt &&
    Date.parse(current.finishedAt) <= asOf && revisions.size === 1;
  return { deployment: current, revision: verified ? matching[0].revision : null,
    evidenceRef: verified ? matching[0].evidenceRef : null };
}

export function reviewPilot(report: ReturnType<typeof inventory>, input: unknown) {
  const evidence = pilotEvidence.parse(input);
  if (new Set(evidence.apps.map(a => a.requestId)).size !== evidence.apps.length) throw new Error("Duplicate pilot app.");
  const asOf = Date.parse(evidence.observedAt);
  return evidence.apps.map(app => {
    const row = report.rows.find(r => r.requestId === app.requestId);
    const target = row?.status === "matched" && !row.gaps.includes("repository-tag-mismatch") ? row.sites[0].resourceId : undefined;
    const ownerId = row?.app?.ownerId ?? null;
    const resolved = resolveRevision(app, asOf, target, row?.app?.repositoryUrl);
    const profile = resolved.revision && app.profile?.revision === resolved.revision ? app.profile : undefined;
    const fresh = (time: string) => Date.parse(time) <= asOf && asOf - Date.parse(time) <= 7 * 24 * 3600_000;
    const scan = app.semgrep;
    const semgrep = scan && scan.repository === row?.app?.repositoryUrl && scan.revision === resolved.revision && fresh(scan.checkedAt)
      ? scan : null;
    const alerts = app.dependabot;
    const dependabot = alerts && "https://github.com/" + alerts.repository === row?.app?.repositoryUrl && fresh(alerts.checkedAt)
      ? alerts : null;
    const checks = rules.options.flatMap(rule => {
      const relevant = app.observations.filter(o => o.rule === rule && o.revision === resolved.revision &&
        o.resourceId.toLowerCase() === target?.toLowerCase() && Date.parse(o.checkedAt) <= asOf);
      const components = relevant.length ? [...new Set(relevant.map(o => o.component))].sort() : ["application"];
      return components.map(component => {
        const samples = relevant.filter(o => o.component === component).sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt));
        const latest = samples[0];
        const fresh = samples.filter(o => Date.parse(o.checkedAt) === Date.parse(latest.checkedAt) &&
          asOf - Date.parse(o.checkedAt) <= 7 * 24 * 3600_000);
        const outcome = evaluate(rule, fresh, profile);
        const exceptions = app.exceptions.filter(e => e.rule === rule && e.component === component)
          .map(e => ({ ...e, expired: Date.parse(e.expiresAt) <= asOf }));
        let gapReason: string | null = null;
        if (outcome === "coverage-gap") {
          if (!resolved.revision) gapReason = "missing-deployed-revision";
          else if (!profile && ["login", "entra-sign-in", "chrome-login"].includes(rule)) gapReason = "unknown-login-applicability";
          else gapReason = fresh.length ? "incomplete-control-evidence" : "no-current-observation";
        }
        return { rule, ruleVersion: rule === "login" ? "2026-10-28" : "1", component, ownerId, gapReason,
          outcome, failedControls: [...new Set(fresh.flatMap(sample => Object.entries(sample.controls)
            .filter(([, verdict]) => verdict === "fail").map(([control]) => control)))].sort(),
          checkedAt: latest?.checkedAt ?? null, revision: resolved.revision, exceptions,
          evidenceRefs: [...new Set(fresh.map(o => o.evidenceRef))].sort(),
          route: outcome === "finding" && (rule === "secret" || rule === "data") ? "it-security-triage" :
            ownerId && !row?.gaps.includes("owner-tag-mismatch") ? "app-owner" : "cu-launch" };
      });
    });
    return { requestId: app.requestId, ownerId, ownerTagMatches: row?.status === "matched" && ownerId && row.sites[0].ownerId
      ? ownerId === row.sites[0].ownerId : null, target: target ?? null, ...resolved, profile: profile ?? null,
      capabilities: app.capabilities, dependabot, semgrep, portalRunId: app.portalRunId ?? null, workflowRuns: app.workflowRuns ?? [],
      checks, gaps: [...(row?.gaps ?? ["no-portal-record"]), ...(!resolved.revision ? ["missing-deployed-revision"] : [])] };
  });
}
