// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { collectPortal } from "./capture";
import { inventory } from "./report";
import { reviewPilot } from "./review";
import { reviewFixture } from "./fixture-review";
import { followUp } from "./follow-up";

const now = "2026-11-23T16:00:00Z";
const snapshot = { scope: "fixture", collectedAt: now, complete: true };
const repo = "https://github.com/example/pilot";
const app = { id: "A", ownerId: "owner", repositoryUrl: repo, sourceOfTruth: "IMPORTED_REPOSITORY",
  publishStatus: "NOT_STARTED", hasLiveUrl: true };
const site = { resourceId: "/sites/a", manager: "cu-app-portal", requestId: "A", state: "Running" };
const full = inventory({ ...snapshot, rows: [app] }, { ...snapshot, rows: [site] });
const sha = "a".repeat(40);
const triggerSha = "b".repeat(40);
const active = { resourceId: site.resourceId, id: "deploy-1", active: true, succeeded: true, finishedAt: now };
const receipt = { resourceId: site.resourceId, deploymentId: active.id, repositoryUrl: repo, revision: sha, evidenceRef: "build/1" };
const evidence = {
  requestId: app.id, capabilities: { code: "unavailable", secret: "unavailable", dependency: "readable" },
  deploymentsComplete: true, deployments: [active], receipts: [receipt], observations: [],
  workflowRuns: [{ id: "1", event: "workflow_dispatch", headSha: triggerSha, conclusion: "success" }],
};
const review = (extra = {}) => reviewPilot(full, { observedAt: now, apps: [{ ...evidence, ...extra }] })[0];

describe("hosted app inventory", () => {
  it("joins every registration and distinguishes unresolved ownership, duplicate claims and missing metadata", () => {
    const result = inventory({ ...snapshot, rows: [app, app, { ...app, id: "B", ownerId: null, repositoryUrl: null,
      hasLiveUrl: false, publishStatus: "FAILED" }, { ...app, id: "C" }] }, { ...snapshot, rows: [
      site, site, { ...site, resourceId: "/b", requestId: "B" }, { ...site, resourceId: "/c", requestId: "C" },
      { ...site, resourceId: "/c2", requestId: "C" }, { ...site, resourceId: "/d", requestId: "D" },
      { ...site, resourceId: "/e", manager: null }, { ...site, resourceId: "/f", requestId: null },
      { ...site, resourceId: "/g", manager: "another-team" }] });
    expect(result.counts).toEqual({ matched: 2, ambiguous: 1, "azure-only": 1, "ownership-unknown": 2, "other-manager": 1 });
    expect(result.rows[0]).toMatchObject({ status: "matched", gaps: expect.arrayContaining(["review-publish-status"]) });
    expect(result.rows[1].gaps).toEqual(expect.arrayContaining(["missing-owner", "missing-repository", "review-publish-status"]));
    expect(() => inventory({ ...snapshot, rows: [app, { ...app, ownerId: "other" }] }, { ...snapshot, rows: [] })).toThrow(/Conflicting/);
  });
  it("follows the page cursor and keeps a partial snapshot on denial or a nonadvancing cursor", async () => {
    const row = { ...app, owner: { id: "owner", email: "hidden" }, liveUrl: null, healthStatus: "HEALTHY", healthCheckedAt: now };
    const offsets: number[] = [];
    const complete = await collectPortal("fixture", async offset => {
      offsets.push(offset);
      return { apps: [{ ...row, id: String(offset) }], nextOffset: offset === 0 ? 1 : null };
    });
    expect(offsets).toEqual([0, 1]);
    expect(complete.complete).toBe(true);
    expect(complete.rows[0].health).toEqual({ status: "HEALTHY", checkedAt: now });
    expect(JSON.stringify(complete)).not.toContain("hidden");
    const partial = await collectPortal("fixture", async offset => {
      if (offset) throw new Error("denied");
      return { apps: [row], nextOffset: 1 };
    });
    expect(inventory(partial, { ...snapshot, rows: [] }).counts).toEqual({ incomplete: 1 });
    expect((await collectPortal("fixture", async () => ({ apps: [row], nextOffset: 0 }))).complete).toBe(false);
  });
  it("replays through the CLI with byte-identical output and marks a partial Azure read", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-cli-"));
    try {
      writeFileSync(join(dir, "p"), JSON.stringify({ ...snapshot, rows: [app] }));
      writeFileSync(join(dir, "a"), JSON.stringify({ ...snapshot, rows: [site] }));
      const run = () => execFileSync(process.execPath, ["--import", "tsx", "scripts/hosted-apps/inventory.ts",
        "--portal", join(dir, "p"), "--azure", join(dir, "a")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      expect(run()).toBe(run());
      expect(JSON.parse(run()).counts).toEqual({ matched: 1 });
      writeFileSync(join(dir, "a"), JSON.stringify({ ...snapshot, complete: false, rows: [] }));
      try { run(); } catch (error) {
        expect(error).toMatchObject({ status: 2 });
        expect(JSON.parse((error as { stdout: string }).stdout).counts).toEqual({ incomplete: 1 });
        return;
      }
      throw new Error("Expected partial inventory exit status 2.");
    } finally { rmSync(dir, { recursive: true }); }
  });
  it("automatically saves evidence, preserves the JSON on save failure, and supports read-only replay", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-save-"));
    const portal = join(dir, "portal.json");
    const azure = join(dir, "azure.json");
    const file = join(dir, "evidence.json");
    const run = (...flags: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/hosted-apps/inventory.ts",
      "--portal", portal, "--azure", azure, "--evidence", file, ...flags], {
      encoding: "utf8", env: { ...process.env, DATABASE_URL: "invalid-for-this-test" },
    });
    try {
      writeFileSync(portal, JSON.stringify({ ...snapshot, rows: [app] }));
      writeFileSync(azure, JSON.stringify({ ...snapshot, rows: [site] }));
      writeFileSync(file, JSON.stringify({ observedAt: now, apps: [{ ...evidence, dependabot: {
        repository: "example/pilot", reader: "cu-launch-installation", checkedAt: now, alerts: [],
      } }] }));
      const automatic = run();
      expect(automatic.status).toBe(1);
      expect(automatic.stderr).toContain("saving to CU Launch failed");
      expect(JSON.parse(automatic.stdout).pilot[0].dependabot.alerts).toEqual([]);
      const offline = run("--report-only");
      expect(offline.status).toBe(0);
      expect(offline.stdout).toEqual(automatic.stdout);
      writeFileSync(azure, JSON.stringify({ ...snapshot, complete: false, rows: [site] }));
      const partial = run();
      expect(partial.status).toBe(2);
      expect(JSON.parse(partial.stdout).complete).toBe(false);
      expect(partial.stderr).not.toContain("saving to CU Launch failed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("pilot review", () => {
  it("attaches Semgrep only to the matching active checkout and retains incomplete scan status", () => {
    const semgrep = { engine: "Semgrep CE", version: "1.186.0", status: "partial", repository: repo,
      checkedAt: now, revision: sha, rulesRevision: sha, ruleDirectories: ["typescript/react/security"],
      ruleFiles: 1, scanned: ["app/[id]/page.tsx"], skipped: ["page.tsx"], errors: [], exitCode: 0, findings: [] };
    expect(review({ semgrep }).semgrep?.status).toBe("partial");
    expect(() => review({ semgrep: { ...semgrep, status: "complete" } })).toThrow();
    for (const extra of [{ revision: triggerSha }, { repository: repo + "-other" }, { checkedAt: "2025-01-01T00:00:00Z" }]) {
      expect(review({ semgrep: { ...semgrep, ...extra } }).semgrep).toBeNull();
    }
  });
  it("binds an imported checkout or later push to the actual active target", () => {
    expect(review().revision).toBe(sha);
    const push = { ...active, id: "push" };
    const result = review({ deployments: [{ ...active, active: false }, push],
      receipts: [receipt, { ...receipt, deploymentId: "push", revision: triggerSha }] });
    expect(result.revision).toBe(triggerSha);
    expect(result.portalRunId).toBeNull();
  });
  it.each([{ receipts: [] }, { deploymentsComplete: false }, { deployments: [active, { ...active, id: "rollback" }] },
    { receipts: [{ ...receipt, resourceId: "/wrong" }] }, { receipts: [receipt, { ...receipt, revision: triggerSha }] }])(
    "preserves missing or conflicting deployment evidence as a gap", extra => {
      const result = review(extra);
      expect(result.revision).toBeNull();
      expect(result.checks.every(c => c.outcome === "coverage-gap")).toBe(true);
    });
  it("requires current evidence for the actual revision and deduplicates repeated observations", () => {
    const sample = { rule: "dependency", resourceId: site.resourceId, component: "lodash", checkedAt: now, revision: sha,
      controls: { advisory: "fail" }, evidenceRef: "alerts/1" };
    const run = (obs: object[]) => review({ observations: obs }).checks.filter(c => c.rule === "dependency");
    expect(run([sample, sample])).toMatchObject([{ outcome: "finding", evidenceRefs: ["alerts/1"] }]);
    for (const change of [{ revision: triggerSha }, { checkedAt: "2026-10-01T00:00:00Z" }, { checkedAt: "2027-01-01T00:00:00Z" }]) {
      expect(run([{ ...sample, ...change }])[0].outcome).toBe("coverage-gap");
    }
  });
  it("requires source evidence before exempting a deployed public app", () => {
    const declared = { audience: "public", framework: "nextjs", database: "none", trigger: "push", revision: sha };
    expect(review({ profile: declared }).checks.find(c => c.rule === "login")?.outcome).toBe("coverage-gap");
    const profile = { ...declared, loginExemptionEvidence: "review/deployed-source" };
    expect(review({ profile }).checks.find(c => c.rule === "login")?.outcome).toBe("not-applicable");
    expect(review({ profile: { ...profile, revision: triggerSha } }).checks.find(c => c.rule === "login")?.outcome).toBe("coverage-gap");
  });
  it("traces synthetic findings to a subsequent verified deployment and withholds browser or live sign-in claims", () => {
    const run = (variant: string, time: string) => {
      const bytes = readFileSync("scripts/hosted-apps/fixtures/" + variant + ".json");
      return reviewFixture(bytes, createHash("sha256").update(bytes).digest("hex"), variant, time);
    };
    const baseline = run("baseline", now), fixed = run("fixed", "2026-11-23T17:00:00Z");
    expect(followUp(fixed, baseline).map(c => c.status)).toEqual(Array(5).fill("verified-fixed"));
    const missing = { pilot: [], findings: followUp({ pilot: [] }, baseline) };
    expect(followUp(fixed, missing).map(c => c.status)).toEqual(Array(5).fill("verified-fixed"));
    expect(followUp(baseline, baseline).every(c => c.status === "open")).toBe(true);
    expect(fixed.pilot[0].checks.filter(c => c.outcome === "coverage-gap").map(c => c.rule)).toEqual(["entra-sign-in", "chrome-login"]);
    expect(JSON.stringify(baseline)).not.toMatch(/synthetic-001|CU_PILOT_TEST_MARKER/);
  });
  it("retains the owner, reason and expiry of exceptions without closing findings", () => {
    const exception = { rule: "dependency", component: "library", ownerId: "security-owner",
      rationale: "Replacement release is in review", expiresAt: "2026-11-22T00:00:00Z" };
    const result = review({ exceptions: [exception], observations: [{ rule: "dependency", component: "library",
      resourceId: site.resourceId, revision: sha, checkedAt: now, evidenceRef: "alerts/2", controls: { advisory: "fail" } }] });
    expect(result.checks[0]).toMatchObject({ outcome: "finding", exceptions: [{ ...exception, expired: true }] });
  });
});
