import { securityUpdate } from "./update-types";
import { z } from "zod";

const text = z.string().min(1).max(4096);
const time = z.string().datetime({ offset: true });
export const advisoryMetadata = { summary: text.optional(), patchedVersion: text.optional() };
const alert = z.object({ number: z.number().int().positive(), package: text, advisory: text, manifest: text, severity: text, ...advisoryMetadata });
const warning = z.object({ file: text, line: z.number().int().positive(), rule: text, severity: text });
const sourceResult = z.object({ checkedAt: time, scannedFiles: z.number().int().nonnegative(), complete: z.boolean(), findings: z.array(warning),
    mainRevision: z.string().regex(/^[0-9a-f]{40}$/).optional(), version: text.optional(), rulesRevision: text.optional(), ruleFiles: z.number().int().positive().optional(),
    skippedFiles: z.number().int().nonnegative().optional(), scanErrors: z.number().int().nonnegative().optional() });
export const reviewResults = z.object({
  revision: text.nullable(),
  dependency: z.object({ checkedAt: time, alerts: z.array(alert), updates: z.array(securityUpdate).optional() }).nullable(),
  source: sourceResult.nullable(),
  deployedSource: sourceResult.optional(),
  healthObservationMissing: z.boolean().optional(),
  checks: z.array(z.object({ gapReason: text.nullish(), failedControls: z.array(text).optional(), rule: text, component: text, checkedAt: time.nullable(), outcome: z.enum(["pass", "finding", "coverage-gap"]) })),
});
export type ReviewResults = z.infer<typeof reviewResults>;
export type DependencyReview = NonNullable<ReviewResults["dependency"]>;

export function isFreshDependencyReview(dependency: DependencyReview | null, now: number) {
  return dependency !== null && now - Date.parse(dependency.checkedAt) < 15 * 60_000;
}

export function hasScanResults(results: ReviewResults) {
  return Boolean(results.deployedSource?.findings.length || results.dependency || (results.source && (results.source.scannedFiles > 0 || results.source.findings.length > 0))
    || results.checks.some(check => check.outcome !== "coverage-gap" && check.checkedAt));
}

export const checkNames: Record<string, string> = {
  dependency: "Deployed software versions", secret: "Exposed credentials", access: "Access controls",
  data: "Data protection", login: "Sign-in setup", "entra-sign-in": "Cedarville sign-in", "chrome-login": "Sign-in in Chrome",
};

export function needsAttention(results: ReviewResults) {
  return Boolean(results.dependency?.alerts.length || results.source?.findings.length || results.deployedSource?.findings.length || results.checks.some(c => c.outcome === "finding"));
}

export function fixInstructions(appName: string, repositoryUrl: string, results: ReviewResults) {
  const lines = [
    `Please review the security findings CU Launch reported for ${appName} (${repositoryUrl}).`,
    "Verify the open project matches this repository before editing. Compare the findings with the current code. Preserve existing work and prepare any fixes on a separate local branch.",
  ];
  if (results.revision) lines.push(`The reviewed deployment was ${results.revision}.`);
  if (results.source?.mainRevision) lines.push(`The nightly source scan checked main at ${results.source.mainRevision}. Confirm which version is deployed before treating a source warning as live.`);
  if (results.dependency?.alerts.length) {
    const advisories = new Set(results.dependency.alerts.map(a => `${a.severity} · ${a.package} · ${a.advisory} · ${a.manifest}`));
    lines.push("Review these dependency alerts, prioritizing critical and high severity. Verify the versions the build installs, update affected dependencies to compatible patched versions, and check the lockfile.", ...advisories);
  }
  if (results.source?.findings.length) {
    lines.push("Inspect these source warnings in context. Fix confirmed unsafe behavior and explain any warning already covered by existing protections.",
      ...results.source.findings.map(f => `${f.rule} · ${f.file} line ${f.line}`));
  }
  if (results.deployedSource?.findings.length) {
    lines.push(`The last reviewed deployment at ${results.revision} also had these source warnings. Check their status in the deployed version.`,
      ...results.deployedSource.findings.map(f => `${f.rule} · ${f.file} line ${f.line}`));
  }
  for (const check of results.checks.filter(c => c.outcome === "finding")) {
    lines.push(`Review the reported ${checkNames[check.rule] ?? check.rule} issue for ${check.component}.`);
  }
  lines.push("Run the relevant tests, build the app and repeat available security checks. Tell me in plain language what changed, what you verified and what still needs attention. Stop for my review before committing, pushing, merging or publishing.");
  return lines.join("\n\n");
}
