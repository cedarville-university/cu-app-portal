import { PrismaClient } from "@prisma/client";
import { hasScanResults, reviewResults } from "../../src/features/security-review/results";
import type { reviewPilot } from "./review";
import type { inventory } from "./report";

export async function saveSecurityReviews(report: ReturnType<typeof inventory>, pilot: ReturnType<typeof reviewPilot>) {
  if (!report.complete) throw new Error("Results require a complete inventory.");
  // Keep database logs out of the JSON report that the pilot writes to stdout.
  const prisma = new PrismaClient({ log: [] });
  try {
    let saved = 0;
    for (const app of pilot) {
      const row = report.rows.find(r => r.requestId === app.requestId);
      const repository = row?.app?.repositoryUrl;
      const owner = row?.app?.ownerId;
      if (!repository || !owner || row.status !== "matched" || !app.target ||
          row.gaps.includes("repository-tag-mismatch") || row.gaps.includes("owner-tag-mismatch")) continue;
      const scan = app.semgrep;
      const results = reviewResults.parse({
        revision: app.revision,
        dependency: app.dependabot,
        healthObservationMissing: row.gaps.includes("no-current-health-observation"),
        source: scan && { checkedAt: scan.checkedAt, scannedFiles: scan.scanned.length, complete: scan.status === "complete", findings: scan.findings,
          version: scan.version, ruleFiles: scan.ruleFiles, rulesRevision: scan.rulesRevision,
          skippedFiles: scan.skipped.length, scanErrors: scan.errors.length },
        checks: app.checks.filter(c => c.outcome === "coverage-gap" ||
          (c.outcome !== "not-applicable" && c.evidenceRefs.length && c.checkedAt && c.revision === app.revision)),
      });
      if (!hasScanResults(results)) continue;
      const dates = [results.dependency?.checkedAt, results.source?.checkedAt,
        ...results.checks.filter(c => c.outcome !== "coverage-gap").map(c => c.checkedAt)].filter((d): d is string => !!d);
      const checkedAt = new Date(Math.max(...dates.map(Date.parse)));
      // Bind the write to the current portal registration, including across retries and concurrent imports.
      saved += await prisma.$executeRaw`
        INSERT INTO "AppSecurityReview" ("appRequestId", "repositoryUrl", "checkedAt", "results")
        SELECT "id", "repositoryUrl", ${checkedAt}, ${JSON.stringify(results)}::jsonb FROM "AppRequest"
        WHERE "id" = ${app.requestId} AND "repositoryUrl" = ${repository} AND "userId" = ${owner}
        ON CONFLICT ("appRequestId") DO UPDATE SET "repositoryUrl" = EXCLUDED."repositoryUrl",
          "checkedAt" = EXCLUDED."checkedAt", "results" = EXCLUDED."results"
        WHERE "AppSecurityReview"."checkedAt" <= EXCLUDED."checkedAt" OR "AppSecurityReview"."repositoryUrl" <> EXCLUDED."repositoryUrl"`;
    }
    return saved;
  } finally {
    await prisma.$disconnect();
  }
}
