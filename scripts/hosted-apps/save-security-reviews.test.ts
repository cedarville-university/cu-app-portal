// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { reviewFixture } from "./fixture-review";
import { saveSecurityReviews } from "./save-security-reviews";

const prisma = vi.hoisted(() => ({ $executeRaw: vi.fn(), $disconnect: vi.fn() }));
vi.mock("@prisma/client", () => ({ PrismaClient: vi.fn(() => prisma) }));
const at = "2026-11-24T16:00:00Z";
function sample() {
  const bytes = readFileSync(new URL("./fixtures/baseline.json", import.meta.url));
  return reviewFixture(bytes, createHash("sha256").update(bytes).digest("hex"), "demo", at);
}

afterEach(() => vi.clearAllMocks());

it("saves only the review fields used by app owners", async () => {
  const report = sample();
  vi.mocked(prisma.$executeRaw).mockResolvedValue(1);
  expect(await saveSecurityReviews(report, report.pilot)).toBe(1);
  const [, date, json, id, repository, owner] = vi.mocked(prisma.$executeRaw).mock.calls[0];
  expect([date, id, repository, owner]).toEqual([new Date(at), "synthetic-pilot", "https://github.com/example/pilot-fixture", "fixture-owner"]);
  const results = JSON.parse(String(json));
  expect(results.checks.filter((c: {outcome: string}) => c.outcome === "finding")).toHaveLength(5);
  expect(results.healthObservationMissing).toBe(true);
  expect(results.checks).toContainEqual(expect.objectContaining({ rule: "login", failedControls: expect.arrayContaining(["csrf-protected-initiation"]) }));
  expect(results.checks[0]).not.toHaveProperty("evidenceRefs");
  expect(results).not.toHaveProperty("workflowRuns");
});

it.each(["repository-tag-mismatch", "owner-tag-mismatch"])("skips conflicting identity: %s", async gap => {
  const report = sample();
  report.rows[0].gaps.push(gap);
  expect(await saveSecurityReviews(report, report.pilot)).toBe(0);
  expect(prisma.$executeRaw).not.toHaveBeenCalled();
});

it("does not persist results from a provisional inventory or from coverage gaps alone", async () => {
  const report = sample();
  await expect(saveSecurityReviews({ ...report, complete: false }, report.pilot)).rejects.toThrow(/complete inventory/);
  const gaps = report.pilot.map(app => ({ ...app, checks: app.checks.filter(check => check.outcome === "coverage-gap") }));
  expect(await saveSecurityReviews(report, gaps)).toBe(0);
  expect(prisma.$executeRaw).not.toHaveBeenCalled();
});
