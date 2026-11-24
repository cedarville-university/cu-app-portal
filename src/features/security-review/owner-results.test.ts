import { expect, it } from "vitest";
import { ownerSecurityReview } from "./owner-results";
import { fixInstructions } from "./results";
import { nightlyCycle } from "./nightly";

it("keeps deployed checks and dependency findings when main advances", () => {
  const repository = "https://github.com/example/app", deployed = "1".repeat(40), main = "2".repeat(40);
  const pilot = { checkedAt: new Date("2026-01-01"), repositoryUrl: repository, results: {
    revision: deployed, dependency: { alerts: [], checkedAt: "2026-01-01T00:00:00Z" },
    source: { checkedAt: "2026-01-01T00:00:00Z", complete: true, scannedFiles: 1,
      findings: [{ rule: "deployed-warning", severity: "WARNING", file: "live.js", line: 2 }] },
    checks: [{ rule: "login", component: "app", checkedAt: "2026-01-01T00:00:00Z", outcome: "finding" }],
  } };
  const review = ownerSecurityReview(repository, pilot, { successfulSha: main, source: {
    mainRevision: main, checkedAt: "2026-01-02T07:00:00Z", scannedFiles: 1, complete: true, findings: [],
  } });
  expect(review?.results).toMatchObject({ revision: deployed, checks: pilot.results.checks,
    dependency: pilot.results.dependency, deployedSource: pilot.results.source, source: { mainRevision: main } });
  expect(ownerSecurityReview(repository, null, { successfulSha: main, source: pilot.results.source })).toBeNull();
  const instructions = fixInstructions("App", repository, review!.results);
  expect(instructions).toContain("nightly source scan checked main at " + main);
  expect(instructions).toContain("deployed-warning · live.js line 2");
  expect(instructions).toContain("reviewed deployment was " + deployed);
});
it("catches up using the last nightly boundary and never resets at midnight", () => {
  expect(nightlyCycle(new Date("2026-01-01T06:59:59Z")).toISOString()).toBe("2025-12-31T07:00:00.000Z");
  expect(nightlyCycle(new Date("2026-01-01T07:00:00Z")).toISOString()).toBe("2026-01-01T07:00:00.000Z");
});
