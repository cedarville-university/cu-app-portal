import { createHash } from "node:crypto";
import { z } from "zod";
import { inventory } from "./report";
import { reviewPilot } from "./review";

const fixture = z.object({
  lockfile: z.object({ packages: z.object({ "node_modules/lodash": z.object({ version: z.string() }) }) }),
  source: z.string(), store: z.object({ records: z.array(z.object({ fixtureStudentId: z.string() })),
    readers: z.array(z.string()), encrypted: z.boolean(), retentionDays: z.number() }),
  routeTests: z.object({ anonymousPage: z.number(), anonymousApi: z.number() }),
  loginReview: z.object({ framework: z.literal("express"), brandedPage: z.boolean(), serverInitiation: z.boolean(),
    csrfProtected: z.boolean(), safeReturn: z.boolean(), callback: z.boolean() }),
});

// Evaluate only the synthetic pilot format. Raw fixture content is never included in a report.
export function reviewFixture(bytes: Buffer, expectedSha256: string, deploymentId: string, observedAt: string) {
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== expectedSha256) throw new Error("Fixture artifact differs from the deployed artifact expected by the operator.");
  const release = fixture.parse(JSON.parse(bytes.toString("utf8")));
  const revision = "sha256:" + digest;
  const resourceId = "/synthetic/hosted-app-pilot";
  const repositoryUrl = "https://github.com/example/pilot-fixture";
  const requestId = "synthetic-pilot";
  const metadata = { scope: "synthetic-fixture", collectedAt: observedAt, complete: true };
  const report = inventory({ ...metadata, rows: [{ id: requestId, ownerId: "fixture-owner", repositoryUrl,
    sourceOfTruth: "IMPORTED_REPOSITORY", publishStatus: "SUCCEEDED", hasLiveUrl: true }] },
  { ...metadata, rows: [{ resourceId, manager: "cu-app-portal", requestId, state: "Running" }] });
  const result = (passed: boolean) => passed ? "pass" : "fail";
  const access = { "protected-pages": result([302, 303, 307, 401, 403].includes(release.routeTests.anonymousPage)),
    "protected-apis": result([401, 403].includes(release.routeTests.anonymousApi)) };
  const login = release.loginReview;
  const packageVersion = release.lockfile.packages["node_modules/lodash"].version;
  // This fixture pins two releases either side of GHSA-35jh-r3h4-6jhm.
  const advisory = packageVersion === "4.17.20" ? "fail" : packageVersion === "4.17.21" ? "pass" : "unknown";
  const observations = [
    { rule: "dependency", component: "lodash", controls: { advisory } },
    { rule: "secret", component: "source", controls: { "secret-scan": result(!release.source.includes("CU_PILOT_TEST_MARKER")) } },
    { rule: "access", component: "routes", controls: access },
    { rule: "data", component: "fixture-store", controls: {
      classification: release.store.records.some(r => r.fixtureStudentId.startsWith("synthetic-")) ? "pass" : "unknown",
      "access-policy": result(release.store.readers.length > 0 && release.store.readers.every(r => r === "registrar")),
      encryption: result(release.store.encrypted), retention: result(release.store.retentionDays > 0 && release.store.retentionDays <= 30) } },
    { rule: "login", component: "login-page", controls: { ...access, "branded-login": result(login.brandedPage),
      "server-initiation": result(login.serverInitiation), "csrf-protected-initiation": result(login.csrfProtected),
      "safe-return": result(login.safeReturn), callback: result(login.callback) } },
  ].map(o => ({ ...o, resourceId, revision, checkedAt: observedAt, evidenceRef: "fixture/" + o.component }));
  const pilot = reviewPilot(report, { observedAt, apps: [{ requestId, deploymentsComplete: true,
    deployments: [{ id: deploymentId, active: true, succeeded: true, finishedAt: observedAt, resourceId }],
    receipts: [{ resourceId, deploymentId, repositoryUrl, revision, evidenceRef: "fixture/sha256" }],
    capabilities: { dependency: "unverified", code: "unverified", secret: "unverified" },
    profile: { framework: login.framework, audience: "entra", database: "none", trigger: "portal-dispatch", revision },
    observations }] });
  return { ...report, pilot };
}
