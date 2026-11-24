import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { reviewResults, type ReviewResults } from "./results";

type Source = NonNullable<ReviewResults["source"]>;
export type ScanProvider = {
  head(repository: string): Promise<string>;
  scan(repository: string, sha: string): Promise<Source>;
};
const day = 86_400_000;
const leaseMs = 10 * 60_000;
const mainSha = /^[0-9a-f]{40}$/;
const sourceSchema = reviewResults.shape.source.unwrap();

// Anchor to 07:00 UTC. Late or missed wake-ups continue the most recent due cycle.
export function nightlyCycle(now: Date) {
  const today = new Date(now);
  today.setUTCHours(7, 0, 0, 0);
  return today > now ? new Date(today.getTime() - day) : today;
}

export async function scanDueRepositories(db: PrismaClient, provider: ScanProvider, allowedOrgs: string[],
  clock = () => new Date()) {
  const now = clock();
  const cycle = nightlyCycle(now);
  const next = new Date(cycle.getTime() + day);
  const summary = { scanned: 0, unchanged: 0, failed: 0 };
  const candidates = await db.$queryRaw<{ repository: string }[]>`
    SELECT DISTINCT lower(a."repositoryUrl") AS repository FROM "AppRequest" a
    LEFT JOIN "NightlyRepositoryScan" s ON s.repository = lower(a."repositoryUrl")
    WHERE a."repositoryStatus" = 'READY' AND a."createdAt" <= ${cycle}
      AND a."repositoryUrl" ~* '^https://github[.]com/[a-z0-9-]+/[a-z0-9_.-]+$'
      AND lower(split_part(a."repositoryUrl", '/', 4)) = ANY(${allowedOrgs.map(o => o.toLowerCase())}::text[])
      AND (s."nextCheckAt" IS NULL OR s."nextCheckAt" <= ${now})
    ORDER BY repository LIMIT 12`;
  for (const { repository } of candidates) {
    const start = clock();
    // Leave room for existing recovery duties and the job's execution deadline.
    if (start.getTime() - now.getTime() >= 120_000 || start >= next) break;
    const lease = randomUUID();
    const expires = new Date(start.getTime() + leaseMs);
    const [claim] = await db.$queryRaw<{ successfulSha: string | null; targetSha: string | null; attempts: number }[]>`
      INSERT INTO "NightlyRepositoryScan" (repository, lease, cycle, "nextCheckAt", attempts)
      VALUES (${repository}, ${lease}, ${cycle}, ${expires}, 1)
      ON CONFLICT (repository) DO UPDATE SET lease = EXCLUDED.lease, cycle = EXCLUDED.cycle,
        "nextCheckAt" = EXCLUDED."nextCheckAt",
        "targetSha" = CASE WHEN "NightlyRepositoryScan".cycle = EXCLUDED.cycle THEN "NightlyRepositoryScan"."targetSha" END,
        attempts = CASE WHEN "NightlyRepositoryScan".cycle = EXCLUDED.cycle THEN "NightlyRepositoryScan".attempts + 1 ELSE 1 END
      WHERE "NightlyRepositoryScan"."nextCheckAt" <= ${start}
      RETURNING CASE WHEN source->>'mainRevision' = "successfulSha" THEN "successfulSha" END AS "successfulSha",
        "targetSha", attempts`;
    if (!claim) continue;
    const where = { repository, lease };
    let stage = "read main";
    try {
      const sha = claim.targetSha ?? await provider.head(repository);
      if (!mainSha.test(sha)) throw new Error("Invalid commit");
      if (sha === claim.successfulSha) {
        const updated = await db.nightlyRepositoryScan.updateMany({ where, data: { nextCheckAt: next, lease: null, lastError: null } });
        summary.unchanged += updated.count;
        continue;
      }
      if (!claim.targetSha) {
        const pinned = await db.nightlyRepositoryScan.updateMany({ where, data: { targetSha: sha } });
        if (!pinned.count) continue;
      }
      stage = "scan source";
      const source = sourceSchema.parse(await provider.scan(repository, sha));
      if (!source.complete || source.skippedFiles || source.scanErrors) throw new Error("Incomplete source scan");
      stage = "save results";
      const saved = await db.nightlyRepositoryScan.updateMany({ where, data: {
        successfulSha: sha, source: { ...source, mainRevision: sha }, nextCheckAt: next, lease: null, lastError: null,
      } });
      summary.scanned += saved.count;
    } catch {
      // One retry for intermittent infrastructure failures. A failed scan never advances the saved commit.
      const retryAt = claim.attempts < 2 ? new Date(Math.min(clock().getTime() + 30 * 60_000, next.getTime())) : next;
      await db.nightlyRepositoryScan.updateMany({ where, data: { lease: null, nextCheckAt: retryAt, lastError: stage } });
      console.warn("[nightly-security]", repository, stage, "failed");
      summary.failed++;
    }
  }
  return summary;
}
