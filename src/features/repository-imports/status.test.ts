import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), head: vi.fn(), read: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { appRequest: { findFirst: mocks.find } } }));
vi.mock("./service", () => ({ createGitHubClientForOwner: mocks.client }));
import { getAppImportStatus } from "./status";
const actor = { userId: "user", isAdmin: false };
const app = { repositoryStatus: "READY", repositoryOwner: "cu", repositoryName: "app", repositoryDefaultBranch: "main", submittedConfig: { importFeatures: { databaseProvider: "postgresql", entraLogin: true } }, repositoryImport: { importStatus: "SUCCEEDED", preparationStatus: "PENDING_USER_CHOICE", updatedAt: new Date("2026-11-16T12:00:00Z") } };
describe("import diagnostics", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.find.mockResolvedValue(app);
    mocks.head.mockResolvedValue({ sha: "pinned-head" });
    mocks.read.mockResolvedValue({ "index.html": "<h1>Hello</h1>" });
    mocks.client.mockReturnValue({ getBranchHead: mocks.head, readRepositoryTextFiles: mocks.read });
  });
  it("denies before provider access", async () => {
    mocks.find.mockResolvedValue(null);
    await expect(getAppImportStatus(actor, "denied")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("uses a pinned remote commit and detects service migration needs", async () => {
    const result = await getAppImportStatus(actor, "app");
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ ref: "pinned-head" }));
    expect(result.compatibility).toMatchObject({ runtime: { framework: "http-server" }, serviceIssue: expect.stringContaining("migrate"), commitSha: "pinned-head" });
    expect(JSON.stringify(result)).not.toContain("<h1>Hello</h1>");
  });
  it("does not flag already prepared publishing files as import conflicts", async () => {
    mocks.find.mockResolvedValue({ ...app, repositoryImport: { ...app.repositoryImport, preparationStatus: "COMMITTED" } });
    const result = await getAppImportStatus(actor, "app");
    expect(result.compatibility).toBeNull(); expect(mocks.client).not.toHaveBeenCalled();
  });
  it("reports unsupported runtime without returning source content", async () => {
    mocks.read.mockResolvedValue({ "package.json": '{"dependencies":{"vite":"*"}}' });
    const result = await getAppImportStatus(actor, "app");
    expect(result.compatibility).toMatchObject({ status: "UNSUPPORTED", findings: expect.arrayContaining([expect.objectContaining({ code: "UNSUPPORTED_APP_RUNTIME" })]) });
  });
});

describe("safe import failure diagnostics", () => {
  it("explains pending merge verification without exposing stored arbitrary content", async () => {
    mocks.find.mockResolvedValue({ ...app, repositoryImport: { ...app.repositoryImport, preparationStatus: "PULL_REQUEST_OPENED", preparationErrorSummary: "Missing publishing files on default branch: package.json secret-token-value" } });
    const result = await getAppImportStatus(actor, "app");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "PUBLISHING_FILES_MISSING" }));
    expect(JSON.stringify(result)).not.toContain("secret-token-value");
  });
  it("retains recorded failures when a live provider scan is unavailable", async () => {
    mocks.find.mockResolvedValue({ ...app, repositoryImport: { ...app.repositoryImport, preparationStatus: "FAILED", preparationErrorSummary: "GitHub App permissions are missing for this repository (raw secret)" } });
    mocks.head.mockRejectedValue(new Error("provider payload with secret"));
    const result = await getAppImportStatus(actor, "app");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "GITHUB_APP_PERMISSIONS" }));
    expect(result.compatibilityCheck).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
