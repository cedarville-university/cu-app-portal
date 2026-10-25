import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalActor } from "@/features/portal-api/principal";
const db = vi.hoisted(() => ({ appRequest: { findMany: vi.fn(), findUnique: vi.fn() }, user: { findMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
import { adminListApps, adminFindUsers, adminDebugApp } from "./queries";
const admin: PortalActor = {
  userId: "a", entraOid: "o", email: "a@cedarville.edu", displayName: "Admin", isAdmin: true
};
const row = {
  id: "app", appName: "Example", user: {
    id: "u", displayName: "User", email: "user@cedarville.edu"
  }, template: { slug: "web", name: "Web" }, sourceOfTruth: "PORTAL_MANAGED_REPO", generationStatus: "SUCCEEDED", repositoryStatus: "READY", publishingSetupStatus: "READY", publishStatus: "FAILED", repositoryUrl: "https://github.com/org/repo", publishUrl: null, primaryPublishUrl: null, supportReference: "SUP", createdAt: new Date(), updatedAt: new Date(), submittedConfig: { password: "hidden" }, workerToken: "hidden"
};
beforeEach(() => vi.clearAllMocks());
describe("admin data", () => {
  it("denies non-admin services before database reads", async () => {
    for (const run of [() => adminListApps({ ...admin, isAdmin: false }, {}), () => adminFindUsers({ ...admin, isAdmin: false }, {}), () => adminDebugApp({ ...admin, isAdmin: false }, { appId: "app" })])
      await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.appRequest.findMany).not.toHaveBeenCalled();
    expect(db.appRequest.findUnique).not.toHaveBeenCalled();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
  it("returns a selected app page and combines owner and search filters", async () => {
    db.appRequest.findMany.mockResolvedValue([row, { ...row, id: "next" }]);
    const result = await adminListApps(admin, {
      query: "  Exam  ", ownerUserId: "u", limit: 1
    });
    expect(result.nextOffset).toBe(1);
    expect(result.apps).toHaveLength(1);
    expect(result.apps[0]).toMatchObject({ id: "app", owner: { id: "u" } });
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(db.appRequest.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: "u", OR: [{ appName: { contains: "Exam", mode: "insensitive" } }, { supportReference: { contains: "Exam", mode: "insensitive" } }] }, take: 2, orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
  });
  it("finds portal users and labels derived usernames without returning Entra IDs", async () => {
    db.user.findMany.mockResolvedValue([{
        id: "u", displayName: "User", email: "user@cedarville.edu", githubUsername: null, entraOid: "private"
      }]);
    expect(await adminFindUsers(admin, { query: "user" })).toEqual({ users: [{
          id: "u", displayName: "User", email: "user@cedarville.edu", username: "user", githubUsername: null
        }], nextOffset: null });
    expect(db.user.findMany.mock.calls[0][0].where.OR).toHaveLength(3);
  });
  it("returns recorded diagnostics with redacted failures and no arbitrary fields", async () => {
    db.appRequest.findUnique.mockResolvedValue({
      ...row, repositoryDefaultBranch: "main", publishErrorSummary: "password=private", publishWarningSummary: null, publishingSetupErrorSummary: "Bearer private", publishingSetupCheckedAt: null, publishingSetupRepairedAt: null, repositoryImport: null, publishSetupChecks: [{
          checkKey: "github", status: "BLOCKED", message: "token=private", checkedAt: new Date(), metadata: { password: "hidden" }
        }], publishAttempts: [{
          id: "p", status: "FAILED", stage: "FAILED", errorSummary: "secret=private", createdAt: new Date(), workerToken: "hidden"
        }]
    });
    const result = await adminDebugApp(admin, { appId: "app" });
    expect(result.app.id).toBe("app");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("hidden");
    expect(db.appRequest.findUnique.mock.calls[0][0].select.publishAttempts).toMatchObject({ take: 10, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  });
  it("returns NOT_FOUND for an absent app and validates pagination at the service boundary", async () => {
    db.appRequest.findUnique.mockResolvedValue(null);
    await expect(adminDebugApp(admin, { appId: "gone" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const input of [
      { limit: 101 }, { offset: -1 }, { query: "a".repeat(201) }, { isAdmin: true }
    ])
      await expect(adminListApps(admin, input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
