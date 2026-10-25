// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { PortalActor } from "@/features/portal-api/principal";
const db = vi.hoisted(() => ({ appRequest: { findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { adminGetAppLogs, type LogReadDependencies } from "./service";
const admin: PortalActor = {
  userId: "a", entraOid: "o", email: "a@cedarville.edu", displayName: "Admin", isAdmin: true
};
const app = {
  id: "app", repositoryOwner: "org", repositoryName: "repo", azureResourceGroup: "rg", azureWebAppName: "web", publishAttempts: [{
      id: "attempt", githubWorkflowRunId: "99", status: "FAILED"
    }]
};
beforeEach(() => { vi.clearAllMocks(); db.appRequest.findUnique.mockResolvedValue(app); });
function deps() { return { readGitHub: vi.fn<LogReadDependencies["readGitHub"]>(async () => ({ entries: [{
        source: "github" as const, status: "available" as const, text: "build failed"
      }], next: null })), readAzure: vi.fn<LogReadDependencies["readAzure"]>(async () => ({ entries: [{
        source: "azure_runtime" as const, status: "available" as const, text: "runtime failed"
      }], next: null })) }; }
it("denies admin log access before any database or provider work", async () => {
  const d = deps();
  await expect(adminGetAppLogs({ ...admin, isAdmin: false }, { appId: "app" }, d)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(db.appRequest.findUnique).not.toHaveBeenCalled();
  expect(d.readGitHub).not.toHaveBeenCalled();
  expect(d.readAzure).not.toHaveBeenCalled();
});
it("reads both sources with server-resolved targets and preserves partial failures", async () => {
  const d = deps();
  d.readAzure.mockRejectedValue(new Error("token=sensitive"));
  const result = await adminGetAppLogs(admin, { appId: "app" }, d);
  expect(result).toMatchObject({
    appId: "app", attemptId: "attempt", sources: [{ source: "github", status: "available" }, { source: "azure_deployment", status: "unavailable" }, { source: "azure_runtime", status: "unavailable" }]
  });
  expect(JSON.stringify(result)).not.toContain("sensitive");
  expect(d.readGitHub.mock.calls[0][0]).toMatchObject({
    owner: "org", repo: "repo", runId: "99"
  });
});
it("never guesses a workflow run and rejects a foreign selected attempt", async () => {
  db.appRequest.findUnique.mockResolvedValue({ ...app, publishAttempts: [] });
  const d = deps();
  const result = await adminGetAppLogs(admin, { appId: "app" }, d);
  expect(result.sources[0].status).toBe("not_ready");
  expect(d.readGitHub).not.toHaveBeenCalled();
  await expect(adminGetAppLogs(admin, { appId: "app", attemptId: "foreign" }, d)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("pins cursor continuation to the selected app and attempt and reauthorizes", async () => {
  const d = deps();
  d.readGitHub.mockResolvedValue({ entries: [{
        source: "github", status: "available", text: "page one"
      }], next: {
      page: 1, index: 0, offset: 200, jobId: "2"
    } } as never);
  const first = await adminGetAppLogs(admin, { appId: "app", source: "github" }, d);
  expect(first.nextCursor).toBeTypeOf("string");
  await expect(adminGetAppLogs(admin, {
    appId: "other", source: "github", cursor: first.nextCursor!
  }, d)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(adminGetAppLogs({ ...admin, isAdmin: false }, {
    appId: "app", source: "github", cursor: first.nextCursor!
  }, d)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await adminGetAppLogs(admin, {
    appId: "app", source: "github", cursor: first.nextCursor!
  }, d);
  expect(db.appRequest.findUnique.mock.calls.at(-1)![0].select.publishAttempts.where).toEqual({ id: "attempt" });
  db.appRequest.findUnique.mockResolvedValue({ ...app, repositoryName: "changed" });
  await expect(adminGetAppLogs(admin, {
    appId: "app", source: "github", cursor: first.nextCursor!
  }, d)).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
