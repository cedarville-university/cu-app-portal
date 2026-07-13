# Owner Remove Collaborators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let app owners and portal admins remove accepted collaborators from the app details App Access card, using a shared service that also best-effort revokes GitHub repository collaborator access.

**Architecture:** Add GitHub `DELETE .../collaborators/{username}` on the installation client, wrap it as `revokeManagedRepositoryAccess`, centralize portal remove + audit + notify + best-effort GitHub in `removeAppCollaborator`, call that from both admin and owner/admin server actions, and add per-row Remove buttons on `/download/[requestId]` App Access for managers only.

**Tech Stack:** Next.js 15 server actions, Prisma, existing GitHub App client (`fetch` + installation JWT), Vitest + Testing Library, existing `PendingSubmitButton` + audit/notification helpers.

**Spec:** `docs/superpowers/specs/2026-07-13-remove-collaborators-design.md`

## Global Constraints

- Authorization: only app primary owner (`AppRequest.userId`) or portal admin may remove; collaborators cannot remove others or themselves.
- Portal `AppAccess` deletion always proceeds when authorized; GitHub revoke is best-effort and must not block portal remove.
- GitHub revoke only when repo `repositoryStatus === "READY"`, `repositoryOwner` + `repositoryName` set, and target has non-empty `githubUsername`.
- GitHub DELETE success statuses: `204` and `404`.
- If `AppAccess` row deleted: audit `APP_COLLABORATOR_REMOVED` + notify `COLLABORATOR_REMOVED` to target. If no row: succeed without notification noise.
- Reject removing the primary owner (not a collaborator).
- Quiet UX: revalidate only (no flash banner).
- No Prisma schema changes.
- Tests: `npm test -- <path>` (vitest). Final gate: `npm test` (or targeted suites for touched areas) and prefer `npm run build` if time allows.
- Commit after every task with a clear message.

## File map

| File | Responsibility |
| --- | --- |
| `src/features/repositories/github-app.ts` | `removeRepositoryCollaborator` on installation client |
| `src/features/repositories/github-app.test.ts` | Client DELETE 204/404 tests |
| `src/features/repositories/access.ts` | `revokeManagedRepositoryAccess` |
| `src/features/repositories/access.test.ts` | Grant/revoke wrapper tests (new file) |
| `src/features/collaboration-invites/remove-collaborator.ts` | Shared `removeAppCollaborator` service |
| `src/features/collaboration-invites/remove-collaborator.test.ts` | Service unit tests |
| `src/features/collaboration-invites/actions.ts` | Owner/admin `removeAppCollaboratorAction` |
| `src/features/collaboration-invites/actions.test.ts` | Action auth tests |
| `src/features/admin/actions.ts` | Admin remove delegates to shared service |
| `src/features/admin/actions.test.ts` | Admin remove expectations updated |
| `src/app/download/[requestId]/page.tsx` | App Access Remove UI + load `user.id` |
| `src/app/download/[requestId]/page.test.tsx` | Owner/admin see Remove; collaborator does not |
| `README.md` / `docs/portal/setup.md` | One-line product capability note if they mention invite-only management |

---

### Task 1: GitHub client — remove repository collaborator

**Files:**
- Modify: `src/features/repositories/github-app.ts`
- Test: `src/features/repositories/github-app.test.ts`

**Interfaces:**
- Consumes: existing `createGitHubAppClient`, `withInstallationHeaders`, `requireGitHubStatus`, `githubPathSegment`
- Produces: `client.removeRepositoryCollaborator({ owner, name, username }) => Promise<void>`

- [ ] **Step 1: Write the failing test**

Add to `describe("createGitHubAppClient")` in `github-app.test.ts` (near the delete-repository test):

```ts
  it("removes a repository collaborator and treats missing collaborators as already removed", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const fetchImpl = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(createJsonResponse({ token: "installation-token" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    const client = createGitHubAppClient({
      appId: "12345",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      installationId: "111",
      fetchImpl,
    });

    await client.removeRepositoryCollaborator({
      owner: "cedarville-it",
      name: "campus-dashboard",
      username: "casey-dev",
    });
    await expect(
      client.removeRepositoryCollaborator({
        owner: "cedarville-it",
        name: "campus-dashboard",
        username: "casey-dev",
      }),
    ).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/cedarville-it/campus-dashboard/collaborators/casey-dev",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      "https://api.github.com/repos/cedarville-it/campus-dashboard/collaborators/casey-dev",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/repositories/github-app.test.ts`

Expected: FAIL — `removeRepositoryCollaborator` is not a function / undefined.

- [ ] **Step 3: Implement minimal client method**

In `github-app.ts`, add type next to `AddRepositoryCollaboratorInput`:

```ts
type RemoveRepositoryCollaboratorInput = {
  owner: string;
  name: string;
  username: string;
};
```

Inside `createGitHubAppClient` return object, next to `addRepositoryCollaborator`, add:

```ts
    async removeRepositoryCollaborator({
      owner,
      name,
      username,
    }: RemoveRepositoryCollaboratorInput) {
      const headers = await withInstallationHeaders();
      const response = await fetchImpl(
        `https://api.github.com/repos/${githubPathSegment(owner)}/${githubPathSegment(name)}/collaborators/${githubPathSegment(username)}`,
        {
          method: "DELETE",
          headers,
        },
      );

      await requireGitHubStatus(response, [204, 404]);
    },
```

Note: `addRepositoryCollaborator` currently does not path-encode segments; use `githubPathSegment` for remove for safety (consistent with `deleteRepository`). Prefer also encoding username in the URL as shown.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/repositories/github-app.test.ts`

Expected: PASS for the new test (suite green).

- [ ] **Step 5: Commit**

```bash
git add src/features/repositories/github-app.ts src/features/repositories/github-app.test.ts
git commit -m "feat: remove GitHub repository collaborators via app installation"
```

---

### Task 2: `revokeManagedRepositoryAccess` wrapper

**Files:**
- Modify: `src/features/repositories/access.ts`
- Create: `src/features/repositories/access.test.ts`

**Interfaces:**
- Consumes: `createGitHubAppClient`, `loadGitHubAppConfig`, `resolveInstallationId`, `parseGitHubUsername`
- Produces:

```ts
export async function revokeManagedRepositoryAccess(
  {
    owner,
    repositoryName,
    githubUsername,
  }: {
    owner: string;
    repositoryName: string;
    githubUsername: string;
  },
  config?: GitHubAppConfig,
): Promise<void>
```

- [ ] **Step 1: Write failing tests**

Create `src/features/repositories/access.test.ts`:

```ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  grantManagedRepositoryAccess,
  revokeManagedRepositoryAccess,
} from "./access";

const addRepositoryCollaborator = vi.fn();
const removeRepositoryCollaborator = vi.fn();

vi.mock("./github-app", () => ({
  createGitHubAppClient: vi.fn(() => ({
    addRepositoryCollaborator,
    removeRepositoryCollaborator,
  })),
}));

vi.mock("./config", () => ({
  loadGitHubAppConfig: vi.fn(() => ({
    appId: "app-1",
    privateKey: "key",
    installationIdsByOrg: { "cedarville-it": "inst-1" },
  })),
}));

describe("managed repository access helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addRepositoryCollaborator.mockResolvedValue({ status: "GRANTED" });
    removeRepositoryCollaborator.mockResolvedValue(undefined);
  });

  it("grantManagedRepositoryAccess adds a collaborator with push permission", async () => {
    await expect(
      grantManagedRepositoryAccess({
        owner: "cedarville-it",
        repositoryName: "campus-dashboard",
        githubUsername: "casey-dev",
      }),
    ).resolves.toEqual({ status: "GRANTED" });

    expect(addRepositoryCollaborator).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      username: "casey-dev",
      permission: "push",
    });
  });

  it("revokeManagedRepositoryAccess removes the collaborator", async () => {
    await expect(
      revokeManagedRepositoryAccess({
        owner: "cedarville-it",
        repositoryName: "campus-dashboard",
        githubUsername: "casey-dev",
      }),
    ).resolves.toBeUndefined();

    expect(removeRepositoryCollaborator).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      username: "casey-dev",
    });
  });
});
```

- [ ] **Step 2: Run test to verify revoke fails**

Run: `npm test -- src/features/repositories/access.test.ts`

Expected: FAIL — `revokeManagedRepositoryAccess` is not exported / not a function. Grant test may pass if grant already exists (fine).

- [ ] **Step 3: Implement wrapper**

In `access.ts`, after `grantManagedRepositoryAccess`, add:

```ts
export async function revokeManagedRepositoryAccess(
  {
    owner,
    repositoryName,
    githubUsername,
  }: {
    owner: string;
    repositoryName: string;
    githubUsername: string;
  },
  config: GitHubAppConfig = loadGitHubAppConfig(),
) {
  const client = createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId: resolveInstallationId(config, owner),
  });

  await client.removeRepositoryCollaborator({
    owner,
    name: repositoryName,
    username: parseGitHubUsername(githubUsername),
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/features/repositories/access.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/repositories/access.ts src/features/repositories/access.test.ts
git commit -m "feat: add revokeManagedRepositoryAccess helper"
```

---

### Task 3: Shared `removeAppCollaborator` service

**Files:**
- Create: `src/features/collaboration-invites/remove-collaborator.ts`
- Create: `src/features/collaboration-invites/remove-collaborator.test.ts`

**Interfaces:**
- Consumes: `prisma`, `recordAuditEvent`, `safeNotifyAppEvent`, `revokeManagedRepositoryAccess`
- Produces:

```ts
export type RemoveAppCollaboratorResult = {
  removed: boolean;
  github: "revoked" | "skipped" | "failed";
  githubError?: string;
};

export async function removeAppCollaborator(input: {
  appRequestId: string;
  targetUserId: string;
  actorUserId: string;
}): Promise<RemoveAppCollaboratorResult>
```

Behavior (exact):
1. Load app by id; throw `"App request not found."` if missing. Select at least: `id`, `userId`, `supportReference`, `repositoryStatus`, `repositoryOwner`, `repositoryName`.
2. If `targetUserId === app.userId`, throw `"Cannot remove the app owner as a collaborator."`
3. `deleteMany` AppAccess for `(appRequestId, targetUserId)`; `removed = count > 0`.
4. Load target user's `githubUsername` (if needed for GitHub path).
5. If READY + owner + name + username: try `revokeManagedRepositoryAccess`; on success `github = "revoked"`; on throw log + `github = "failed"` + `githubError`.
6. Else `github = "skipped"`.
7. If `removed`: audit `APP_COLLABORATOR_REMOVED` with `{ actorUserId, appRequestId, supportReference, targetUserId, github, githubError? }`; `safeNotifyAppEvent` with `eventKey: "COLLABORATOR_REMOVED"`, `directRecipientUserIds: [targetUserId]`.
8. If not `removed`: do not notify; optional: still skip audit (prefer **no audit** on pure no-op to avoid noise — matches spec “optionally”; **choose no audit when count === 0**).
9. Return `{ removed, github, githubError? }`.

- [ ] **Step 1: Write failing service tests**

Create `remove-collaborator.test.ts`:

```ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { revokeManagedRepositoryAccess } from "@/features/repositories/access";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { removeAppCollaborator } from "./remove-collaborator";

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findUnique: vi.fn() },
    appAccess: { deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/features/notifications/safe-notify", () => ({
  safeNotifyAppEvent: vi.fn(),
}));

vi.mock("@/features/repositories/access", () => ({
  revokeManagedRepositoryAccess: vi.fn(),
}));

const appRequestId = "app-1";
const ownerUserId = "owner-1";
const targetUserId = "collab-1";
const actorUserId = "owner-1";
const supportReference = "SUP-1";

function mockApp(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
    id: appRequestId,
    userId: ownerUserId,
    supportReference,
    repositoryStatus: "READY",
    repositoryOwner: "cedarville-it",
    repositoryName: "campus-dashboard",
    ...overrides,
  } as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>);
}

describe("removeAppCollaborator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.appAccess.deleteMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "casey-dev",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(revokeManagedRepositoryAccess).mockResolvedValue(undefined);
  });

  it("deletes AppAccess, revokes GitHub, audits, and notifies when a row existed", async () => {
    mockApp();

    await expect(
      removeAppCollaborator({ appRequestId, targetUserId, actorUserId }),
    ).resolves.toEqual({ removed: true, github: "revoked" });

    expect(prisma.appAccess.deleteMany).toHaveBeenCalledWith({
      where: { appRequestId, userId: targetUserId },
    });
    expect(revokeManagedRepositoryAccess).toHaveBeenCalledWith({
      owner: "cedarville-it",
      repositoryName: "campus-dashboard",
      githubUsername: "casey-dev",
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("APP_COLLABORATOR_REMOVED", {
      actorUserId,
      appRequestId,
      supportReference,
      targetUserId,
      github: "revoked",
    });
    expect(safeNotifyAppEvent).toHaveBeenCalledWith({
      appRequestId,
      eventKey: "COLLABORATOR_REMOVED",
      actorUserId,
      directRecipientUserIds: [targetUserId],
    });
  });

  it("rejects removing the app owner", async () => {
    mockApp();

    await expect(
      removeAppCollaborator({
        appRequestId,
        targetUserId: ownerUserId,
        actorUserId,
      }),
    ).rejects.toThrow("Cannot remove the app owner as a collaborator.");

    expect(prisma.appAccess.deleteMany).not.toHaveBeenCalled();
  });

  it("skips notify when no AppAccess row existed", async () => {
    mockApp({ repositoryStatus: "NOT_STARTED", repositoryOwner: null, repositoryName: null });
    vi.mocked(prisma.appAccess.deleteMany).mockResolvedValue({ count: 0 });

    await expect(
      removeAppCollaborator({ appRequestId, targetUserId, actorUserId }),
    ).resolves.toMatchObject({ removed: false, github: "skipped" });

    expect(safeNotifyAppEvent).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("skips GitHub when username is missing", async () => {
    mockApp();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    await expect(
      removeAppCollaborator({ appRequestId, targetUserId, actorUserId }),
    ).resolves.toEqual({ removed: true, github: "skipped" });

    expect(revokeManagedRepositoryAccess).not.toHaveBeenCalled();
  });

  it("still removes portal access when GitHub revoke fails", async () => {
    mockApp();
    vi.mocked(revokeManagedRepositoryAccess).mockRejectedValue(
      new Error("GitHub unavailable"),
    );

    await expect(
      removeAppCollaborator({ appRequestId, targetUserId, actorUserId }),
    ).resolves.toEqual({
      removed: true,
      github: "failed",
      githubError: "GitHub unavailable",
    });

    expect(recordAuditEvent).toHaveBeenCalledWith(
      "APP_COLLABORATOR_REMOVED",
      expect.objectContaining({
        github: "failed",
        githubError: "GitHub unavailable",
      }),
    );
    expect(safeNotifyAppEvent).toHaveBeenCalled();
  });

  it("throws when the app does not exist", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue(null);

    await expect(
      removeAppCollaborator({ appRequestId, targetUserId, actorUserId }),
    ).rejects.toThrow("App request not found.");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- src/features/collaboration-invites/remove-collaborator.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `remove-collaborator.ts`**

```ts
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { revokeManagedRepositoryAccess } from "@/features/repositories/access";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

export type RemoveAppCollaboratorResult = {
  removed: boolean;
  github: "revoked" | "skipped" | "failed";
  githubError?: string;
};

export async function removeAppCollaborator({
  appRequestId,
  targetUserId,
  actorUserId,
}: {
  appRequestId: string;
  targetUserId: string;
  actorUserId: string;
}): Promise<RemoveAppCollaboratorResult> {
  const appRequest = await prisma.appRequest.findUnique({
    where: { id: appRequestId },
    select: {
      id: true,
      userId: true,
      supportReference: true,
      repositoryStatus: true,
      repositoryOwner: true,
      repositoryName: true,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  if (appRequest.userId === targetUserId) {
    throw new Error("Cannot remove the app owner as a collaborator.");
  }

  const deleted = await prisma.appAccess.deleteMany({
    where: {
      appRequestId,
      userId: targetUserId,
    },
  });
  const removed = deleted.count > 0;

  let github: RemoveAppCollaboratorResult["github"] = "skipped";
  let githubError: string | undefined;

  const canAttemptGitHub =
    appRequest.repositoryStatus === "READY" &&
    Boolean(appRequest.repositoryOwner) &&
    Boolean(appRequest.repositoryName);

  if (canAttemptGitHub) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { githubUsername: true },
    });
    const githubUsername = targetUser?.githubUsername?.trim() ?? "";

    if (githubUsername) {
      try {
        await revokeManagedRepositoryAccess({
          owner: appRequest.repositoryOwner!,
          repositoryName: appRequest.repositoryName!,
          githubUsername,
        });
        github = "revoked";
      } catch (error) {
        github = "failed";
        githubError =
          error instanceof Error ? error.message : "unknown";
        console.error("Managed repository collaborator revoke failed", {
          appRequestId,
          targetUserId,
          githubUsername,
          error,
        });
      }
    }
  }

  if (removed) {
    await recordAuditEvent("APP_COLLABORATOR_REMOVED", {
      actorUserId,
      appRequestId,
      supportReference: appRequest.supportReference,
      targetUserId,
      github,
      ...(githubError ? { githubError } : {}),
    });
    await safeNotifyAppEvent({
      appRequestId,
      eventKey: "COLLABORATOR_REMOVED",
      actorUserId,
      directRecipientUserIds: [targetUserId],
    });
  }

  return githubError
    ? { removed, github, githubError }
    : { removed, github };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/features/collaboration-invites/remove-collaborator.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/collaboration-invites/remove-collaborator.ts src/features/collaboration-invites/remove-collaborator.test.ts
git commit -m "feat: shared removeAppCollaborator service with best-effort GitHub revoke"
```

---

### Task 4: Refactor admin `removeAppCollaboratorAction`

**Files:**
- Modify: `src/features/admin/actions.ts`
- Modify: `src/features/admin/actions.test.ts`

**Interfaces:**
- Consumes: `removeAppCollaborator` from `@/features/collaboration-invites/remove-collaborator`
- Produces: same exported `removeAppCollaboratorAction(appRequestId, userId)` requiring admin

- [ ] **Step 1: Update admin action tests first**

Mock the shared service and rewrite the remove test:

At top of `actions.test.ts`:

```ts
import { removeAppCollaborator } from "@/features/collaboration-invites/remove-collaborator";

vi.mock("@/features/collaboration-invites/remove-collaborator", () => ({
  removeAppCollaborator: vi.fn(),
}));
```

Replace the remove test body with:

```ts
  it("removeAppCollaboratorAction requires an admin, delegates to shared remove service, and revalidates app views", async () => {
    vi.mocked(removeAppCollaborator).mockResolvedValue({
      removed: true,
      github: "skipped",
    });

    await removeAppCollaboratorAction(appRequestId, targetUserId);

    expect(requireAdminUserId).toHaveBeenCalled();
    expect(removeAppCollaborator).toHaveBeenCalledWith({
      appRequestId,
      targetUserId,
      actorUserId: adminUserId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
    expect(revalidatePath).toHaveBeenCalledWith(`/download/${appRequestId}`);
  });
```

- [ ] **Step 2: Run admin tests — expect FAIL**

Run: `npm test -- src/features/admin/actions.test.ts`

Expected: FAIL — action still calls prisma/notify directly, not the mock service (or wrong call shape).

- [ ] **Step 3: Implement admin action**

Replace `removeAppCollaboratorAction` body in `admin/actions.ts`:

```ts
import { removeAppCollaborator } from "@/features/collaboration-invites/remove-collaborator";

export async function removeAppCollaboratorAction(
  appRequestId: string,
  userId: string,
) {
  const actorUserId = await requireAdminUserId();

  await removeAppCollaborator({
    appRequestId,
    targetUserId: userId,
    actorUserId,
  });

  revalidateAdminViews(appRequestId);
}
```

Remove unused direct delete/audit/notify from this function only (keep imports used by other actions).

- [ ] **Step 4: Run admin tests**

Run: `npm test -- src/features/admin/actions.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions.ts src/features/admin/actions.test.ts
git commit -m "refactor: admin remove collaborator uses shared service"
```

---

### Task 5: Owner/admin server action on app details path

**Files:**
- Modify: `src/features/collaboration-invites/actions.ts`
- Modify: `src/features/collaboration-invites/actions.test.ts`

**Interfaces:**
- Produces: `removeAppCollaboratorAction(appRequestId: string, targetUserId: string): Promise<void>`
- Auth: reuse the same rule as invite management — current user is owner of the app **or** portal admin (see existing `requireInviteManager` pattern: `findFirst` with admin `id` only vs owner `id + userId`).

Name note: admin module also exports `removeAppCollaboratorAction`. Keep both; import by module path only. In this feature module export:

```ts
export async function removeAppCollaboratorAction(
  appRequestId: string,
  targetUserId: string,
): Promise<void>
```

Implementation sketch:

```ts
export async function removeAppCollaboratorAction(
  appRequestId: string,
  targetUserId: string,
) {
  const actorUserId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(actorUserId);
  const appRequest = await prisma.appRequest.findFirst({
    where: isAdmin
      ? { id: appRequestId }
      : { id: appRequestId, userId: actorUserId },
    select: { id: true },
  });

  if (!appRequest) {
    throw new Error(
      "Only owners and admins can remove app collaborators.",
    );
  }

  await removeAppCollaborator({
    appRequestId,
    targetUserId,
    actorUserId,
  });

  revalidatePath(`/download/${appRequestId}`);
  revalidatePath("/apps");
  revalidatePath(`/admin/apps/${appRequestId}`);
  revalidatePath("/admin/apps");
}
```

- [ ] **Step 1: Write failing action tests**

In `actions.test.ts`, follow existing mock patterns for `resolveCurrentUserId`, `userHasAdminRole`, `prisma`, and mock `removeAppCollaborator`:

```ts
import { removeAppCollaborator } from "./remove-collaborator";
// also import removeAppCollaboratorAction from "./actions" once exported

vi.mock("./remove-collaborator", () => ({
  removeAppCollaborator: vi.fn(),
}));
```

Add cases:

```ts
  describe("removeAppCollaboratorAction", () => {
    it("allows the app owner and revalidates", async () => {
      vi.mocked(resolveCurrentUserId).mockResolvedValue("owner-1");
      vi.mocked(userHasAdminRole).mockResolvedValue(false);
      vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({ id: "app-1" });
      vi.mocked(removeAppCollaborator).mockResolvedValue({
        removed: true,
        github: "skipped",
      });

      await removeAppCollaboratorAction("app-1", "collab-1");

      expect(removeAppCollaborator).toHaveBeenCalledWith({
        appRequestId: "app-1",
        targetUserId: "collab-1",
        actorUserId: "owner-1",
      });
      expect(revalidatePath).toHaveBeenCalledWith("/download/app-1");
      expect(revalidatePath).toHaveBeenCalledWith("/apps");
    });

    it("allows portal admins", async () => {
      vi.mocked(resolveCurrentUserId).mockResolvedValue("admin-1");
      vi.mocked(userHasAdminRole).mockResolvedValue(true);
      vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({ id: "app-1" });
      vi.mocked(removeAppCollaborator).mockResolvedValue({
        removed: true,
        github: "revoked",
      });

      await removeAppCollaboratorAction("app-1", "collab-1");

      expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
        where: { id: "app-1" },
        select: { id: true },
      });
      expect(removeAppCollaborator).toHaveBeenCalled();
    });

    it("rejects collaborators who are not owners or admins", async () => {
      vi.mocked(resolveCurrentUserId).mockResolvedValue("collab-2");
      vi.mocked(userHasAdminRole).mockResolvedValue(false);
      vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(null);

      await expect(
        removeAppCollaboratorAction("app-1", "collab-1"),
      ).rejects.toThrow(
        "Only owners and admins can remove app collaborators.",
      );
      expect(removeAppCollaborator).not.toHaveBeenCalled();
    });
  });
```

Align mock helpers with whatever the file already uses for invite manager tests (same `resolveCurrentUserId` / `userHasAdminRole` mocks).

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- src/features/collaboration-invites/actions.test.ts`

Expected: FAIL — export missing.

- [ ] **Step 3: Implement action**

Add import of `removeAppCollaborator` and export `removeAppCollaboratorAction` as sketched above.

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- src/features/collaboration-invites/actions.test.ts`

Expected: PASS (including new cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/collaboration-invites/actions.ts src/features/collaboration-invites/actions.test.ts
git commit -m "feat: owner and admin can remove collaborators from app details action"
```

---

### Task 6: App details UI — Remove on App Access rows

**Files:**
- Modify: `src/app/download/[requestId]/page.tsx`
- Modify: `src/app/download/[requestId]/page.test.tsx`

**Interfaces:**
- Consumes: `removeAppCollaboratorAction` from `@/features/collaboration-invites/actions`
- UI: extend `renderAppAccessSummary` props:

```ts
function renderAppAccessSummary({
  owner,
  collaborators,
  canManageCollaborators,
  appRequestId,
}: {
  owner?: { displayName: string; email: string } | null;
  collaborators?: Array<{
    user: {
      id: string;
      displayName: string;
      email: string;
    };
  }>;
  canManageCollaborators?: boolean;
  appRequestId?: string;
})
```

When `canManageCollaborators && appRequestId`, each collaborator `<li>` is a horizontal flex: identity + form with `PendingSubmitButton`:

```tsx
<form
  action={removeAppCollaboratorAction.bind(
    null,
    appRequestId,
    collaborator.user.id,
  )}
>
  <PendingSubmitButton
    idleLabel="Remove"
    pendingLabel="Removing..."
    statusText="Removing collaborator."
    variant="danger"
    size="sm"
    ariaLabel={`Remove collaborator ${collaborator.user.displayName}`}
  />
</form>
```

Use `collaborator.user.id` as React `key` (not email).

Page query: add `id: true` to collaborator user select.

Call site:

```tsx
{renderAppAccessSummary({
  owner: appRequest.user,
  collaborators: appRequest.collaborators,
  canManageCollaborators: appRequest.userId === userId || isAdmin,
  appRequestId: appRequest.id,
})}
```

Ensure `PendingSubmitButton` is already importable (used elsewhere on the page / invite panel). Import `removeAppCollaboratorAction` and `PendingSubmitButton` if not present.

- [ ] **Step 1: Write failing page tests**

Update existing collaborator list fixtures to include `user.id`.

Add tests:

```ts
  it("shows remove collaborator controls to the app owner", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("owner-123");
    // mock app with userId owner-123 and collaborators with user.id
    // render DownloadPage
    expect(
      screen.getByRole("button", { name: /remove collaborator casey collaborator/i }),
    ).toBeInTheDocument();
  });

  it("shows remove collaborator controls to portal admins", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("admin-123");
    vi.mocked(userHasAdminRole).mockResolvedValue(true);
    // mock app owned by someone else, with collaborators
    expect(
      screen.getByRole("button", { name: /remove collaborator/i }),
    ).toBeInTheDocument();
  });

  it("hides remove collaborator controls from collaborators", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("collaborator-123");
    // mock collab access; isAdmin false
    expect(
      screen.queryByRole("button", { name: /remove collaborator/i }),
    ).not.toBeInTheDocument();
  });
```

Follow existing page test mocks for `userHasAdminRole` / `getCurrentUserIdOrNull` / prisma fixtures (see invite control tests around lines 346–495).

If `PendingSubmitButton` needs a mock for server actions, match how invite panel tests mock `@/features/collaboration-invites/actions`.

- [ ] **Step 2: Run page tests — expect FAIL**

Run: `npm test -- src/app/download/\\[requestId\\]/page.test.tsx`

Expected: FAIL — Remove buttons missing.

- [ ] **Step 3: Implement UI + query field**

Apply page changes described above.

- [ ] **Step 4: Run page tests — expect PASS**

Run: `npm test -- src/app/download/\\[requestId\\]/page.test.tsx`

Expected: PASS. Fix any fixture type errors for missing `user.id` in older tests that still list collaborators.

- [ ] **Step 5: Commit**

```bash
git add src/app/download/\[requestId\]/page.tsx src/app/download/\[requestId\]/page.test.tsx
git commit -m "feat: remove collaborators from app details App Access card"
```

---

### Task 7: Docs touch-up + verification

**Files:**
- Modify (if wording implies invite-only management): `README.md`, `docs/portal/setup.md`
- Optionally mention in a one-line update under collaboration: owners/admins can remove collaborators on app details; GitHub access revoked best-effort.

- [ ] **Step 1: Update docs**

In `README.md` collaboration paragraph, after invite wording, ensure it states owners/admins can remove accepted collaborators from app details (not only admins via Admin).

Example addition: “Owners and admins can also remove accepted collaborators from the app details screen.”

- [ ] **Step 2: Run targeted + broader tests**

```bash
npm test -- \
  src/features/repositories/github-app.test.ts \
  src/features/repositories/access.test.ts \
  src/features/collaboration-invites/remove-collaborator.test.ts \
  src/features/collaboration-invites/actions.test.ts \
  src/features/admin/actions.test.ts \
  src/app/download/\[requestId\]/page.test.tsx
```

Expected: all PASS.

Then:

```bash
npm test
```

Expected: full suite PASS.

Optional:

```bash
npm run build
```

- [ ] **Step 3: Commit docs (if changed)**

```bash
git add README.md docs/portal/setup.md
git commit -m "docs: note owner remove collaborators on app details"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Owner/admin remove on app details | 5, 6 |
| Shared service for admin + owner paths | 3, 4, 5 |
| Best-effort GitHub revoke | 1, 2, 3 |
| Portal remove always succeeds on GitHub fail | 3 |
| Reject remove owner | 3 |
| No notify on no-op | 3 |
| Audit + COLLABORATOR_REMOVED when removed | 3 |
| Quiet revalidate UX | 5, 6 |
| Collaborators cannot manage | 5, 6 |
| No schema changes | (none) |
| Admin page keeps Remove UI | 4 (behavior only) |
| Pending invites unchanged | (none) |

No TBD placeholders. Names: `removeAppCollaborator` (service), dual `removeAppCollaboratorAction` exports (admin vs collaboration-invites — import by path), `revokeManagedRepositoryAccess`, `removeRepositoryCollaborator`.
