import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), auditFind: vi.fn(), auditCreate: vi.fn(), head: vi.fn(), read: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { appRequest: { findFirst: mocks.find, findUnique: mocks.find }, auditLog: { findFirst: mocks.auditFind, create: mocks.auditCreate } } }));
vi.mock("./github-client", () => ({ createImportGitHubClient: mocks.client }));
import { getImportedLoginReview, reviewImportedAppLogin, assertImportedLoginReviewForFirstPublish } from "./login-review";

const sha = "a".repeat(40);
const actor = { userId: "owner", isAdmin: false };
const app = {
  id: "app", appName: "Example", sourceOfTruth: "IMPORTED_REPOSITORY", lastPublishedAt: null,
  repositoryStatus: "READY", repositoryOwner: "cu", repositoryName: "example", repositoryDefaultBranch: "main",
  repositoryUrl: "https://github.com/cu/example", repositoryImport: { preparationStatus: "COMMITTED" },
  submittedConfig: { entraLogin: true, importRuntime: { framework: "nextjs" } },
};
const input = { appId: "app", commitSha: sha, sourcePaths: ["src/auth.ts", "src/app/login/page.tsx"], checksConfirmed: true as const };
const files = {
  ".github/workflows/deploy-azure-app-service.yml": "on:\n  workflow_dispatch:\n    inputs:\n      cu_launch_commit_sha:\n        type: string\njobs:\n  deploy:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ inputs.cu_launch_commit_sha || github.sha }}\n",
  "src/auth.ts": 'NextAuth({ pages: { signIn: "/login" }, providers: [MicrosoftEntraID] })',
  "src/app/login/page.tsx": 'export default function Login() { return <form action={login} />; }',
};

describe("imported login review", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.find.mockResolvedValue(app); mocks.auditFind.mockResolvedValue(null);
    mocks.head.mockResolvedValue({ sha }); mocks.read.mockResolvedValue(files);
    mocks.client.mockReturnValue({ getBranchHead: mocks.head, readRepositoryTextFiles: mocks.read });
    mocks.auditCreate.mockImplementation(async ({ data }) => ({ id: "review", ...data }));
  });
  it("denies access before reading repository code or reviews", async () => {
    mocks.find.mockResolvedValue(null);
    await expect(getImportedLoginReview(actor, "app")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.auditFind).not.toHaveBeenCalled();
  });
  it("does not approve a custom login merely from its filenames or source patterns", async () => {
    const result = await getImportedLoginReview(actor, "app");
    expect(result).toMatchObject({ status: "NEEDS_REVIEW", commitSha: sha });
    expect(result.sourcePaths).not.toContain(".github/workflows/deploy-azure-app-service.yml");
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ ref: sha }));
    expect(JSON.stringify(result)).not.toContain("NextAuth(");
  });
  it("offers a publishing refresh for older prepared workflows", async () => {
    mocks.read.mockResolvedValue({ ...files, ".github/workflows/deploy-azure-app-service.yml": "on:\n  workflow_dispatch:\n" });
    expect(await getImportedLoginReview(actor, "app")).toMatchObject({ publishingUpdateRequired: true, canRefreshPublishing: true });
    mocks.auditFind.mockResolvedValue({ id: "older-review" });
    await expect(assertImportedLoginReviewForFirstPublish("app")).rejects.toMatchObject({ code: "ACTION_REQUIRED", message: expect.stringContaining("PULL_REQUEST") });
  });
  it("records actor-confirmed code and test review at the current repository commit", async () => {
    await reviewImportedAppLogin(actor, input);
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: { event: "IMPORTED_LOGIN_REVIEWED", details: expect.objectContaining({
      appId: "app", commitSha: sha, actorUserId: "owner", repositoryOwner: "cu", repositoryName: "example", branch: "main", method: "actor_confirmed_code_and_tests", sourcePaths: input.sourcePaths,
    }) } });
  });
  it("rejects a changed remote commit before recording review", async () => {
    mocks.head.mockResolvedValue({ sha: "b".repeat(40) });
    await expect(reviewImportedAppLogin(actor, input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
  it.each([[], [".env"], ["../auth.ts"], ["src/../auth.ts"], ["https://example.com/auth.ts"]])("rejects unsafe or missing source selection %j", async sourcePaths => {
    await expect(reviewImportedAppLogin(actor, { ...input, sourcePaths })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
  it("rejects nonexistent reviewed files", async () => {
    await expect(reviewImportedAppLogin(actor, { ...input, sourcePaths: ["missing.ts"] })).rejects.toMatchObject({ code: "ACTION_REQUIRED" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
  it("does not record review without explicit confirmation", async () => {
    await expect(reviewImportedAppLogin(actor, { ...input, checksConfirmed: false })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
  it("keeps provider failures actionable without leaking provider text", async () => {
    mocks.read.mockRejectedValue(new Error("provider-secret"));
    const result = await getImportedLoginReview(actor, "app");
    expect(result.status).toBe("UNAVAILABLE"); expect(JSON.stringify(result)).not.toContain("provider-secret");
  });
  it("requires a review for first publish and fails closed if it cannot be checked", async () => {
    await expect(assertImportedLoginReviewForFirstPublish("app")).rejects.toMatchObject({ code: "ACTION_REQUIRED" });
    mocks.head.mockRejectedValue(new Error("offline"));
    await expect(assertImportedLoginReviewForFirstPublish("app")).rejects.toMatchObject({ code: "ACTION_REQUIRED" });
  });
  it("accepts durable evidence for the current commit, and not for a later one", async () => {
    mocks.auditFind.mockImplementation(async ({ where }) => where.AND.some((part: { details: { path: string[]; equals: unknown } }) => part.details.path[0] === "commitSha" && part.details.equals === sha) ? { id: "review" } : null);
    await expect(assertImportedLoginReviewForFirstPublish("app")).resolves.toBe(sha);
    mocks.head.mockResolvedValue({ sha: "b".repeat(40) });
    await expect(assertImportedLoginReviewForFirstPublish("app")).rejects.toMatchObject({ code: "ACTION_REQUIRED" });
  });
  it("keeps dynamic login configuration reviewable through explicit code/test confirmation", async () => {
    mocks.read.mockResolvedValue({ ...files, "src/auth.ts": 'const loginPath = "/login"; NextAuth({ pages: { signIn: loginPath }, providers: [MicrosoftEntraID] })' });
    await expect(reviewImportedAppLogin(actor, input)).resolves.toMatchObject({ status: "REVIEWED" });
  });
  it("rechecks permission before persisting review", async () => {
    mocks.find.mockResolvedValueOnce(app).mockResolvedValueOnce(null);
    await expect(reviewImportedAppLogin(actor, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
  it("rejects a repository change during the review", async () => {
    mocks.find.mockResolvedValueOnce(app).mockResolvedValueOnce({ ...app, repositoryName: "different" });
    await expect(reviewImportedAppLogin(actor, input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
  it("looks up review evidence bound to the repository and current commit", async () => {
    await getImportedLoginReview(actor, "app");
    expect(mocks.auditFind).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ event: "IMPORTED_LOGIN_REVIEWED", AND: expect.arrayContaining([
      { details: { path: ["commitSha"], equals: sha } },
      { details: { path: ["repositoryName"], equals: "example" } },
    ]) }) }));
  });
  it.each([
    { ...app, sourceOfTruth: "PORTAL_MANAGED_REPO" },
    { ...app, submittedConfig: { entraLogin: false } },
    { ...app, lastPublishedAt: new Date("2026-11-10T12:00:00Z") },
    { ...app, publishStatus: "SUCCEEDED" },
    { ...app, publishAttempts: [{ status: "SUCCEEDED" }] },
  ])("does not gate public, generated, or previously published apps", async value => {
    mocks.find.mockResolvedValue(value);
    await expect(assertImportedLoginReviewForFirstPublish("app")).resolves.toBeNull();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("does not report success when durable review persistence fails", async () => {
    mocks.auditCreate.mockRejectedValue(new Error("db offline"));
    await expect(reviewImportedAppLogin(actor, input)).rejects.toBeDefined();
  });
});
