import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(),
  template: vi.fn(), importCreate: vi.fn(), bootstrap: vi.fn(), add: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  appRequest: { findUnique: mocks.findUnique, findFirst: mocks.findFirst, create: mocks.create, update: mocks.update },
  template: { upsert: mocks.template }, repositoryImport: { upsert: mocks.importCreate },
} }));
vi.mock("@/features/repositories/bootstrap-managed-repository", () => ({ bootstrapManagedRepository: mocks.bootstrap }));
vi.mock("./service", () => ({ addExistingAppForActor: mocks.add }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/features/notifications/safe-notify", () => ({ safeNotifyAppEvent: vi.fn() }));
vi.mock("@/features/repositories/config", () => ({ loadGitHubAppConfig: () => ({ installationIdsByOrg: { cu: "installation" } }) }));
vi.mock("./queue", () => ({ createRepositoryImportQueue: () => ({ send: vi.fn() }) }));
import { adoptExistingApp } from "./adoption";
const actor = { userId: "user-1", isAdmin: false };
const input = { idempotencyKey: "53b6240b-2f6f-4ab8-bf70-3458b861bf3f", appName: "Existing app", description: "An app", databaseProvider: "none" as const, entraLogin: true };
describe("existing app adoption", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.template.mockResolvedValue({ id: "template" });
    mocks.create.mockImplementation(async ({ data }) => ({ ...data }));
    mocks.findUnique.mockResolvedValue(null); mocks.findFirst.mockResolvedValue(null);
    mocks.bootstrap.mockResolvedValue({ owner: "cu", name: "app", url: "https://github.com/cu/app", defaultBranch: "main", visibility: "private" });
  });
  it("persists request identity before GitHub provisioning and seeds only the skill", async () => {
    const result = await adoptExistingApp(actor, input);
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.bootstrap.mock.invocationCallOrder[0]);
    expect(mocks.bootstrap).toHaveBeenCalledWith(expect.objectContaining({ appRequestId: result.requestId, reuseExistingRepository: true, files: { ".codex/skills/cu-app-portal/SKILL.md": expect.any(String) } }));
    expect(mocks.importCreate).toHaveBeenCalled();
  });
  it("resumes interrupted provisioning using the same request and never creates another app", async () => {
    const first = await adoptExistingApp(actor, input);
    const saved = mocks.create.mock.calls[0][0].data;
    mocks.findUnique.mockResolvedValue({ ...saved, repositoryStatus: "PENDING" });
    await adoptExistingApp(actor, input);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.bootstrap.mock.calls[1][0].appRequestId).toBe(first.requestId);
  });
  it("rejects changed input for the same operation", async () => {
    await adoptExistingApp(actor, input);
    mocks.findUnique.mockResolvedValue(mocks.create.mock.calls[0][0].data);
    await expect(adoptExistingApp(actor, { ...input, appName: "Different app" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.bootstrap).toHaveBeenCalledTimes(1);
  });
  it("does not adopt an unowned private org repository using installation privileges", async () => {
    await expect(adoptExistingApp(actor, { ...input, repositoryUrl: "https://github.com/cu/another-app" })).rejects.toMatchObject({ code: "ACTION_REQUIRED" });
    expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.findFirst.mock.calls[0][0].where.OR).toEqual([{ userId: actor.userId }, { collaborators: { some: { userId: actor.userId } } }]);
  });
  it("resumes an authorized managed app instead of duplicating it", async () => {
    mocks.findFirst.mockResolvedValue({ id: "already-managed" });
    expect(await adoptExistingApp(actor, { ...input, repositoryUrl: "https://github.com/cu/my-app" })).toEqual({ requestId: "already-managed" });
    expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("passes a durable identity and explicit service choices to GitHub import", async () => {
    mocks.add.mockResolvedValue({ requestId: "imported" });
    expect(await adoptExistingApp(actor, { ...input, repositoryUrl: "https://github.com/outside/app" })).toEqual({ requestId: "imported" });
    const [actualActor, form, deps] = mocks.add.mock.calls[0];
    expect(actualActor).toBe(actor); expect(form.get("databaseProvider")).toBe("none");
    expect(deps.requestIdentity).toEqual({ requestId: expect.stringMatching(/^adopt-/), digest: expect.any(String) });
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
  it("sanitizes private source failures and suggests local upload", async () => {
    mocks.add.mockRejectedValue(new Error("private credentials should never be returned"));
    await expect(adoptExistingApp(actor, { ...input, repositoryUrl: "https://github.com/outside/app" })).rejects.toMatchObject({ code: "ACTION_REQUIRED", message: expect.stringContaining("local upload route") });
  });
  it("requires acknowledgement for public apps", async () => {
    await expect(adoptExistingApp(actor, { ...input, entraLogin: false })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not reprovision a completed local request", async () => {
    await adoptExistingApp(actor, input);
    const saved = mocks.create.mock.calls[0][0].data;
    mocks.findUnique.mockResolvedValue({ ...saved, repositoryStatus: "READY", repositoryImport: { id: "import" } });
    await adoptExistingApp(actor, input);
    expect(mocks.bootstrap).toHaveBeenCalledTimes(1);
  });
});
