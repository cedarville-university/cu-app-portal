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
    mockApp({
      repositoryStatus: "NOT_STARTED",
      repositoryOwner: null,
      repositoryName: null,
    });
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
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
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
    consoleErrorSpy.mockRestore();
  });

  it("throws when the app does not exist", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue(null);

    await expect(
      removeAppCollaborator({ appRequestId, targetUserId, actorUserId }),
    ).rejects.toThrow("App request not found.");
  });
});
