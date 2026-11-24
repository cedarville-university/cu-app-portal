// Run against a migrated developer or testing database. Only synthetic registrations in a unique test schema are written.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { scanDueRepositories, type ScanProvider } from "../../src/features/security-review/nightly";
import { ownerSecurityReview } from "../../src/features/security-review/owner-results";
import { workerScanProvider } from "../../src/features/security-review/worker";
import { loadGitHubAppConfig } from "../../src/features/repositories/config";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (!local && !(url.username === "cu_launch_testing_mcp" &&
      url.hostname === "psql-cu-app-portal-260424.postgres.database.azure.com" && url.pathname === "/cu-app-portal-testing-mcp"))
    throw new Error("Expected a local database or the CU Launch testing slot");
  const admin = new PrismaClient();
  const schema = "nightly_test_" + randomUUID().replaceAll("-", "");
  url.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  let created = false;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    await db.$executeRawUnsafe('CREATE TABLE "NightlyRepositoryScan" (LIKE public."NightlyRepositoryScan" INCLUDING ALL)');
    await db.$executeRawUnsafe('CREATE TABLE "AppRequest" ("repositoryUrl" text, "repositoryStatus" text, "createdAt" timestamp DEFAULT TIMESTAMP \'2020-01-01\')');
    const repo = "https://github.com/fixture/sample";
    await db.$executeRaw`INSERT INTO "AppRequest" ("repositoryUrl","repositoryStatus") VALUES
      (${repo}, 'READY'), (${repo.toUpperCase()}, 'READY'), ('https://github.com/fixture/deleted','DELETED'),
      ('https://github.com/other/sample','READY'), ('https://github.com/fixture/pending','PENDING')`;
    let now = new Date("2026-01-01T07:00:00Z");
    let head = "1".repeat(40), heads = 0, scans = 0, incomplete = false;
    const provider: ScanProvider = {
      async head() { heads++; return head; },
      async scan() { scans++; return { checkedAt: now.toISOString(), scannedFiles: 1, complete: !incomplete, findings: [] }; },
    };
    const run = () => scanDueRepositories(db, provider, ["fixture"], () => now);
    // An imported deployment-only receipt can cover fewer languages than the nightly rules.
    await db.nightlyRepositoryScan.create({ data: { repository: repo, successfulSha: head,
      nextCheckAt: now, source: { checkedAt: now.toISOString(), complete: true, scannedFiles: 1, findings: [] } } });
    await Promise.all([run(), run()]);
    assert.equal(scans, 1);
    head = "2".repeat(40);
    for (let commit = 0; commit < 20; commit++) await run();
    assert.equal(heads, 1);
    now = new Date("2026-01-02T06:59:59Z");
    assert.equal((await run()).scanned, 0);
    now = new Date("2026-01-02T07:00:01Z");
    incomplete = true;
    assert.equal((await run()).failed, 1);
    const row = () => db.nightlyRepositoryScan.findUniqueOrThrow({ where: { repository: repo } });
    assert.equal((await row()).successfulSha, "1".repeat(40));
    await run();
    assert.equal(scans, 2);
    incomplete = false;
    now = new Date("2026-01-02T07:30:02Z");
    assert.equal((await run()).scanned, 1);
    assert.equal((await row()).successfulSha, head);
    assert.equal(heads, 2);
    now = new Date("2026-01-05T09:00:00Z");
    assert.equal((await run()).unchanged, 1);
    assert.equal(scans, 3);
    assert.equal(await db.nightlyRepositoryScan.count(), 1);
    const review = ownerSecurityReview(repo, null, await row());
    assert.equal(review?.results.source?.mainRevision, head);
    let realFixture = null;
    const fixtureScript = process.argv[process.argv.indexOf("--fixture-script") + 1];
    if (process.argv.includes("--fixture-script")) {
      const dir = mkdtempSync(join(tmpdir(), "nightly-"));
      const git = (action: string, ...args: string[]) => execFileSync("python3", [fixtureScript, action, dir, ...args],
        { encoding: "utf8", timeout: 180_000 }).trim();
      try {
        const repository = "https://github.com/slot-fixture/example";
        await db.$executeRaw`INSERT INTO "AppRequest" ("repositoryUrl","repositoryStatus") VALUES (${repository}, 'READY')`;
        let runs = 0;
        const actual: ScanProvider = { async head() { return git("head"); },
          async scan(_, sha) { runs++; return JSON.parse(git("scan", sha)); } };
        const tick = () => scanDueRepositories(db, actual, ["slot-fixture"], () => now);
        git("advance", "1");
        assert.equal((await tick()).scanned, 1);
        git("advance", "20");
        assert.equal((await tick()).scanned, 0);
        now = new Date("2026-01-06T07:00:00Z");
        assert.equal((await tick()).scanned, 1);
        const expected = git("head");
        const saved = await db.nightlyRepositoryScan.findUniqueOrThrow({ where: { repository } });
        const source = ownerSecurityReview(repository, null, saved)?.results.source;
        assert.equal(source?.mainRevision, expected);
        assert.equal(source?.scannedFiles, 1);
        now = new Date("2026-01-07T07:00:00Z");
        assert.equal((await tick()).unchanged, 1);
        assert.equal(runs, 2);
        realFixture = { baselineScans: 1, commitsDuringDevelopment: 20, nextNightScans: 1,
          quietNightScans: 0, savedCommitMatchesMain: true, engine: source.version, rules: source.ruleFiles };
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    let live = null;
    if (process.argv.includes("--live")) {
      const repository = "https://github.com/cu-app-portal-repos/testing-bouncer";
      await db.$executeRaw`INSERT INTO "AppRequest" ("repositoryUrl","repositoryStatus") VALUES (${repository}, 'READY')`;
      const config = loadGitHubAppConfig();
      const real = workerScanProvider(config);
      assert.equal((await scanDueRepositories(db, real, ["cu-app-portal-repos"], () => now)).scanned, 1);
      const stored = await db.nightlyRepositoryScan.findUniqueOrThrow({ where: { repository } });
      const source = ownerSecurityReview(repository, null, stored)?.results.source;
      assert.ok(source?.scannedFiles && source.complete);
      now = new Date(now.getTime() + 86_400_000);
      assert.equal((await scanDueRepositories(db, real, ["cu-app-portal-repos"], () => now)).unchanged, 1);
      live = { repository, revision: stored.successfulSha, files: source.scannedFiles, rules: source.ruleFiles, nextNight: "skipped" };
    }
    console.log(JSON.stringify({ sameDayExtraScans: 0, overlappingWorkersScans: 1, failedScanRetried: true, quietNightScans: 0, realFixture, live }));
  } finally {
    await db.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Nightly smoke failed"); process.exitCode = 1; });
