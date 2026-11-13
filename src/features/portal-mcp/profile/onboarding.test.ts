import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeIdempotentMutation } from "@/features/portal-api/idempotency";
import type { PortalActor } from "@/features/portal-api/principal";
import type { PortalAppSummary } from "@/features/app-requests/portal-summary";
import { InMemoryPortalOperationStore } from "@/test/portal-operation-store";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  appRequest: { findFirst: vi.fn() },
  repositoryAccessGrant: { upsert: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const audit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: audit }));
import { createPortalMcpHandler, type PortalMcpDependencies } from "../server";
import { grantRepositoryAccessForActor } from "@/features/repositories/grant-repository-access";
import { appAccessWhere } from "@/features/app-requests/access";
import { parseGitHubUsername, revokeManagedRepositoryAccess } from "@/features/repositories/access";
import { buildSafeRepositoryAccessNote, persistRepositoryAccessOutcome } from "@/features/repositories/actor-access";

const actor: PortalActor = { userId: "employee", entraOid: "entra", email: "employee@cedarville.edu", displayName: "Employee", isAdmin: false };
const createKey = "00000000-0000-4000-8000-000000000001";
const saveKey = "00000000-0000-4000-8000-000000000002";
const inviteKey = "00000000-0000-4000-8000-000000000003";
const checkKey = "00000000-0000-4000-8000-000000000004";
const request = { id: "app-1", repositoryStatus: "READY", repositoryOwner: "cedarville", repositoryName: "app-1", supportReference: "SUP-1" };
const app: PortalAppSummary = {
  id: "app-1", appName: "Example app", template: { slug: "web-app", name: "Custom Web App" },
  sourceOfTruth: "PORTAL_MANAGED_REPO", generationStatus: "SUCCEEDED", repositoryStatus: "READY",
  publishingSetupStatus: "NOT_CHECKED", publishStatus: "NOT_STARTED",
  repositoryAccess: { status: "NOT_REQUESTED", note: null },
  repository: { url: "https://github.com/cedarville/app-1", defaultBranch: "main" },
  supportReference: "SUP-1", latestAttempt: null, liveUrl: null,
  allowedNextActions: ["request_github_access"],
};

beforeEach(() => vi.resetAllMocks());

function fixture(savedUsername: string | null) {
  const users = new Map([
    ["employee", { displayName: "Employee", email: actor.email, githubUsername: savedUsername }],
    ["other-user", { displayName: "Other", email: "other@cedarville.edu", githubUsername: "other-account" }],
  ]);
  db.user.findUnique.mockImplementation(async ({ where }) => users.get(where.id) ?? null);
  db.user.update.mockImplementation(async ({ where, data }) => Object.assign(users.get(where.id)!, data));
  db.appRequest.findFirst.mockResolvedValue(request);
  db.repositoryAccessGrant.upsert.mockResolvedValue({ id: "grant-1" });
  db.repositoryAccessGrant.update.mockResolvedValue({});
  const provider = vi.fn().mockResolvedValue({ status: "INVITED" });
  let recordedAccess = app.repositoryAccess;
  const store = new InMemoryPortalOperationStore();
  const deps: Partial<PortalMcpDependencies> = {
    claimPortalRateLimit: vi.fn(async () => {}),
    executeIdempotentMutation: (options) => executeIdempotentMutation({ ...options, store }),
    createGeneratedApp: vi.fn(async () => ({ requestId: "app-1", supportReference: "SUP-1", generationStatus: "SUCCEEDED" as const, repositoryStatus: "READY" as const, repositoryUrl: app.repository.url! })),
    getAccessibleAppSummary: vi.fn(async () => ({ ...app, repositoryAccess: recordedAccess })),
    grantRepositoryAccessForActor: (input) => grantRepositoryAccessForActor(input, {
      prisma: db, appAccessWhere, userHasAdminRole: vi.fn(async () => false), parseGitHubUsername,
      grantManagedRepositoryAccess: provider, revokeManagedRepositoryAccess,
      recordAuditEvent: audit, buildSafeRepositoryAccessNote,
      persistRepositoryAccessOutcome: async (outcome) => {
        recordedAccess = { status: outcome.status, note: buildSafeRepositoryAccessNote(outcome.status, outcome.githubUsername) };
        await persistRepositoryAccessOutcome(outcome);
      },
    }),
    queuePublishForActor: vi.fn(),
  };
  const handler = createPortalMcpHandler(actor, deps);
  async function invoke(name: string, input: Record<string, unknown> = {}) {
    const response = await handler(new Request("https://portal.example.edu/api/mcp", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call", "Mcp-Name": name },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: input, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} } } }),
    }));
    return (await response.json()).result;
  }
  const create = () => invoke("create_app", { idempotencyKey: createKey, templateSlug: "web-app", appName: "Example app", description: "Example", databaseProvider: "none", entraLogin: true });
  const access = (idempotencyKey: string, githubUsername = "saved-user") => invoke("request_github_access", { appId: "app-1", githubUsername, idempotencyKey });
  return { users, deps, provider, invoke, create, access };
}

describe("profile, creation, and invitation integration", () => {
  it("uses a saved profile and records an invitation for that actor after creation", async () => {
    const f = fixture("saved-user");
    expect(await f.invoke("get_my_profile")).toMatchObject({ structuredContent: { profile: { githubUsername: "saved-user" } } });
    expect(await f.create()).toMatchObject({ structuredContent: { requestId: "app-1", repositoryStatus: "READY" } });
    expect(await f.access(inviteKey)).toMatchObject({ structuredContent: { status: "INVITED", githubUsername: "saved-user" } });
    expect(f.provider).toHaveBeenCalledWith({ owner: "cedarville", repositoryName: "app-1", githubUsername: "saved-user" });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.repositoryAccessGrant.upsert.mock.calls[0][0].create).toMatchObject({ actorUserId: "employee", githubUsername: "saved-user" });
    expect(f.deps.queuePublishForActor).not.toHaveBeenCalled();
  });

  it("saves a supplied missing username for the actor and reuses it for future calls", async () => {
    const f = fixture(null);
    expect(await f.invoke("get_my_profile")).toMatchObject({ structuredContent: { profile: { githubUsername: null } } });
    await f.invoke("set_my_github_username", { githubUsername: "New-User", idempotencyKey: saveKey });
    await f.create();
    expect(await f.access(inviteKey, "new-user")).toMatchObject({ structuredContent: { status: "INVITED", githubUsername: "new-user" } });
    expect(await f.invoke("get_my_profile")).toMatchObject({ structuredContent: { profile: { githubUsername: "new-user" } } });
    expect(f.users.get("other-user")?.githubUsername).toBe("other-account");
  });

  it("keeps an invitation replay pending and performs a fresh check after confirmed acceptance", async () => {
    const f = fixture("saved-user");
    await f.create();
    await f.access(inviteKey);
    f.provider.mockResolvedValue({ status: "GRANTED" }); // Actor accepted on GitHub.
    expect(await f.invoke("get_app", { appId: "app-1" })).toMatchObject({ structuredContent: { app: { repositoryAccess: { status: "INVITED" } } } });
    expect(await f.access(inviteKey)).toMatchObject({ structuredContent: { status: "INVITED" } });
    expect(f.provider).toHaveBeenCalledTimes(1);
    expect(await f.access(checkKey)).toMatchObject({ structuredContent: { status: "GRANTED" } });
    await f.access(checkKey); // Uncertain response replays the check, not the grant.
    expect(f.provider).toHaveBeenCalledTimes(2);
    expect(await f.invoke("get_app", { appId: "app-1" })).toMatchObject({ structuredContent: { app: { repositoryAccess: { status: "GRANTED" } } } });
    expect(db.auditLog.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ details: expect.objectContaining({ actorUserId: "employee", accessStatus: "GRANTED" }) }) }));
    expect(f.deps.createGeneratedApp).toHaveBeenCalledTimes(1);
    expect(f.deps.queuePublishForActor).not.toHaveBeenCalled();
  });

  it("retains successful creation and its replay when the access provider fails", async () => {
    const f = fixture("saved-user");
    const creation = await f.create();
    f.provider.mockRejectedValue(new Error("provider credential must stay private"));
    const failedAccess = await f.access(inviteKey);
    expect(failedAccess).toMatchObject({ structuredContent: { status: "FAILED" } });
    expect(JSON.stringify(failedAccess)).not.toContain("credential");
    expect(await f.create()).toEqual(creation);
    expect(f.deps.createGeneratedApp).toHaveBeenCalledTimes(1);
    expect(f.deps.queuePublishForActor).not.toHaveBeenCalled();
  });

  it("does not present a cached grant for a previously saved GitHub identity as current access", async () => {
    const f = fixture("saved-user");
    f.provider.mockResolvedValue({ status: "GRANTED" });
    await f.access(inviteKey);
    await f.invoke("set_my_github_username", { githubUsername: "new-user", idempotencyKey: saveKey });
    expect(await f.access(inviteKey)).toMatchObject({ isError: true, structuredContent: { code: "ACTION_REQUIRED" } });
    expect(f.provider).toHaveBeenCalledTimes(1);
  });
});
