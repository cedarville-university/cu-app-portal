// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  resolveCurrentUserId: vi.fn(),
  userHasAdminRole: vi.fn(),
  appAccessWhere: vi.fn(),
  appRequestFindFirst: vi.fn(),
  appRequestUpdate: vi.fn(),
  appRequestUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  auditLogCreate: vi.fn(),
  auditLogFindFirst: vi.fn(),
  buildSourceSnapshot: vi.fn(),
  bootstrapManagedRepository: vi.fn(),
  grantManagedRepositoryAccess: vi.fn(),
  recordAuditEvent: vi.fn(),
  safeNotifyAppEvent: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/features/app-requests/access", () => ({
  appAccessWhere: mocks.appAccessWhere,
  userHasAdminRole: mocks.userHasAdminRole,
}));

vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: mocks.resolveCurrentUserId,
}));

vi.mock("@/features/notifications/safe-notify", () => ({
  safeNotifyAppEvent: mocks.safeNotifyAppEvent,
}));

vi.mock("@/features/generation/build-source-snapshot", () => ({
  buildSourceSnapshot: mocks.buildSourceSnapshot,
}));

vi.mock("./bootstrap-managed-repository", () => ({
  bootstrapManagedRepository: mocks.bootstrapManagedRepository,
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findFirst: mocks.appRequestFindFirst,
      update: mocks.appRequestUpdate,
      updateMany: mocks.appRequestUpdateMany,
    },
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
    auditLog: {
      create: mocks.auditLogCreate,
      findFirst: mocks.auditLogFindFirst,
    },
  },
}));

vi.mock("./access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./access")>();
  return {
    ...actual,
    grantManagedRepositoryAccess: mocks.grantManagedRepositoryAccess,
  };
});

import {
  retryRepositoryBootstrapAction,
  saveGitHubUsernameAndGrantAccessAction,
} from "./actions";

describe("repository access actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCurrentUserId.mockResolvedValue("collaborator-123");
    mocks.userHasAdminRole.mockResolvedValue(false);
    mocks.appAccessWhere.mockReturnValue({
      id: "req_123",
      OR: [
        { userId: "collaborator-123" },
        { collaborators: { some: { userId: "collaborator-123" } } },
      ],
    });
    mocks.appRequestFindFirst.mockResolvedValue({
      id: "req_123",
      repositoryStatus: "READY",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      supportReference: "SUP-20260818-ABC123",
    });
    mocks.userUpdate.mockResolvedValue({});
    mocks.appRequestUpdate.mockResolvedValue({});
    mocks.appRequestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.auditLogCreate.mockResolvedValue({ id: "audit-123" });
    mocks.auditLogFindFirst.mockResolvedValue(null);
    mocks.recordAuditEvent.mockResolvedValue(undefined);
    mocks.safeNotifyAppEvent.mockResolvedValue(undefined);
  });

  it("persists a failed access result for the signed-in actor without provider details", async () => {
    mocks.grantManagedRepositoryAccess.mockRejectedValue(
      new Error("GitHub could not find that account: secret=provider-detail"),
    );
    const formData = new FormData();
    formData.set("githubUsername", "collaborator-name");

    await saveGitHubUsernameAndGrantAccessAction("req_123", formData);

    expect(mocks.appRequestUpdate).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: {
        repositoryAccessStatus: "FAILED",
        repositoryAccessNote:
          "GitHub could not confirm repository access for @collaborator-name. Check the username and try again.",
      },
    });
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: {
        event: "REPOSITORY_ACCESS_FAILED",
        details: expect.objectContaining({
          requestId: "req_123",
          actorUserId: "collaborator-123",
          githubUsername: "collaborator-name",
          accessStatus: "FAILED",
          safeSummary:
            "GitHub could not confirm repository access for @collaborator-name. Check the username and try again.",
        }),
      },
    });
    expect(JSON.stringify(mocks.auditLogCreate.mock.calls)).not.toContain(
      "provider-detail",
    );
    expect(JSON.stringify(mocks.recordAuditEvent.mock.calls)).not.toContain(
      "provider-detail",
    );
  });

  it.each(["INVITED", "GRANTED"] as const)(
    "persists a %s result for the signed-in actor",
    async (status) => {
      mocks.grantManagedRepositoryAccess.mockResolvedValue({ status });
      const formData = new FormData();
      formData.set("githubUsername", "collaborator-name");

      await saveGitHubUsernameAndGrantAccessAction("req_123", formData);

      expect(mocks.auditLogCreate).toHaveBeenCalledWith({
        data: {
          event: "REPOSITORY_ACCESS_SUCCEEDED",
          details: expect.objectContaining({
            requestId: "req_123",
            actorUserId: "collaborator-123",
            githubUsername: "collaborator-name",
            accessStatus: status,
          }),
        },
      });
    },
  );

  it("records the actor on the request event before remote work", async () => {
    mocks.grantManagedRepositoryAccess.mockResolvedValue({ status: "INVITED" });
    const formData = new FormData();
    formData.set("githubUsername", "collaborator-name");

    await saveGitHubUsernameAndGrantAccessAction("req_123", formData);

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      "REPOSITORY_ACCESS_REQUESTED",
      expect.objectContaining({ actorUserId: "collaborator-123" }),
    );
  });

  it("does not turn a successful GitHub grant into a failed actor outcome when durable persistence fails", async () => {
    mocks.grantManagedRepositoryAccess.mockResolvedValue({ status: "GRANTED" });
    mocks.auditLogCreate.mockRejectedValueOnce(
      new Error("database unavailable: secret=provider-detail"),
    );
    const formData = new FormData();
    formData.set("githubUsername", "collaborator-name");

    await expect(
      saveGitHubUsernameAndGrantAccessAction("req_123", formData),
    ).rejects.toThrow(
      "The GitHub access result could not be saved. Please try again.",
    );

    expect(mocks.grantManagedRepositoryAccess).toHaveBeenCalledTimes(1);
    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1);
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: "REPOSITORY_ACCESS_SUCCEEDED",
          details: expect.objectContaining({ accessStatus: "GRANTED" }),
        }),
      }),
    );
    expect(mocks.appRequestUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ repositoryAccessStatus: "FAILED" }),
      }),
    );
  });
});

describe("repository bootstrap retry", () => {
  const failedRequest = {
    id: "req_123",
    repositoryStatus: "FAILED",
    supportReference: "SUP-20260818-ABC123",
    submittedConfig: {
      templateSlug: "web-app",
      appName: "Campus Dashboard",
      description: "Shows campus information.",
      hostingTarget: "Azure App Service",
      databaseProvider: "postgresql",
      entraLogin: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCurrentUserId.mockResolvedValue("collaborator-123");
    mocks.userHasAdminRole.mockResolvedValue(false);
    mocks.appAccessWhere.mockReturnValue({
      id: "req_123",
      OR: [
        { userId: "collaborator-123" },
        { collaborators: { some: { userId: "collaborator-123" } } },
      ],
    });
    mocks.appRequestFindFirst.mockResolvedValue(failedRequest);
    mocks.userFindUnique.mockResolvedValue({
      id: "collaborator-123",
      githubUsername: null,
    });
    mocks.appRequestUpdate.mockResolvedValue({});
    mocks.buildSourceSnapshot.mockResolvedValue([
      { path: "README.md", content: "# Campus Dashboard\n" },
    ]);
    mocks.bootstrapManagedRepository.mockResolvedValue({
      provider: "github",
      owner: "cedarville-it",
      name: "campus-dashboard",
      url: "https://github.com/cedarville-it/campus-dashboard",
      defaultBranch: "main",
      visibility: "private",
    });
    mocks.recordAuditEvent.mockResolvedValue(undefined);
    mocks.safeNotifyAppEvent.mockResolvedValue(undefined);
  });

  it("rejects a retry when the signed-in actor cannot access the app", async () => {
    mocks.appRequestFindFirst.mockResolvedValue(null);

    await expect(retryRepositoryBootstrapAction("req_123")).rejects.toThrow(
      "App request not found.",
    );

    expect(mocks.bootstrapManagedRepository).not.toHaveBeenCalled();
    expect(mocks.appRequestUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a retry unless repository setup is failed", async () => {
    mocks.appRequestFindFirst.mockResolvedValue({
      ...failedRequest,
      repositoryStatus: "PENDING",
    });

    await expect(retryRepositoryBootstrapAction("req_123")).rejects.toThrow(
      "Only failed repository bootstraps can be retried.",
    );

    expect(mocks.buildSourceSnapshot).not.toHaveBeenCalled();
    expect(mocks.bootstrapManagedRepository).not.toHaveBeenCalled();
    expect(mocks.appRequestUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates onboarding after a guarded repository retry succeeds", async () => {
    await retryRepositoryBootstrapAction("req_123");

    expect(mocks.bootstrapManagedRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        appRequestId: "req_123",
        reuseExistingRepository: true,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/onboarding/req_123");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/apps");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/download/req_123");
  });

  it("allows only one failed-to-pending retry claimant to perform remote work", async () => {
    let finishBootstrap!: (value: {
      provider: "GITHUB";
      owner: string;
      name: string;
      url: string;
      defaultBranch: string;
      visibility: "private";
    }) => void;
    mocks.bootstrapManagedRepository.mockReturnValueOnce(
      new Promise((resolve) => {
        finishBootstrap = resolve;
      }),
    );
    mocks.appRequestUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const firstRetry = retryRepositoryBootstrapAction("req_123");
    await vi.waitFor(() => {
      expect(mocks.bootstrapManagedRepository).toHaveBeenCalledTimes(1);
    });

    await expect(
      retryRepositoryBootstrapAction("req_123"),
    ).rejects.toThrow(/already being retried/i);
    expect(mocks.bootstrapManagedRepository).toHaveBeenCalledTimes(1);

    finishBootstrap({
      provider: "GITHUB",
      owner: "cedarville-it",
      name: "campus-dashboard-request-123",
      url: "https://github.com/cedarville-it/campus-dashboard-request-123",
      defaultBranch: "main",
      visibility: "private",
    });
    await firstRetry;

    expect(mocks.appRequestUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "req_123", repositoryStatus: "FAILED" },
      data: expect.objectContaining({
        repositoryStatus: "PENDING",
        publishErrorSummary: null,
        updatedAt: expect.any(Date),
      }),
    });
    const attemptClaimedAt = mocks.appRequestUpdateMany.mock.calls[0][0].data
      .updatedAt as Date;
    expect(mocks.appRequestUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: "req_123",
          repositoryStatus: "PENDING",
          updatedAt: attemptClaimedAt,
        },
      }),
    );
  });

  it("returns snapshot failures to a safe failed state without throwing", async () => {
    mocks.buildSourceSnapshot.mockRejectedValue(
      new Error("template read failed: secret=provider-detail"),
    );
    mocks.appRequestUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      retryRepositoryBootstrapAction("req_123"),
    ).resolves.toBeUndefined();

    expect(mocks.bootstrapManagedRepository).not.toHaveBeenCalled();
    expect(mocks.appRequestUpdateMany).toHaveBeenLastCalledWith({
      where: {
        id: "req_123",
        repositoryStatus: "PENDING",
        updatedAt: expect.any(Date),
      },
      data: expect.objectContaining({
        generationStatus: "FAILED",
        repositoryStatus: "FAILED",
        publishErrorSummary: expect.not.stringContaining("provider-detail"),
      }),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/onboarding/req_123");
  });

  it("does not auto-grant GitHub access during generated repository retry", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "collaborator-123",
      githubUsername: "saved-user",
    });

    await retryRepositoryBootstrapAction("req_123");

    expect(mocks.grantManagedRepositoryAccess).not.toHaveBeenCalled();
    expect(mocks.appRequestUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          repositoryAccessStatus: "NOT_REQUESTED",
          repositoryAccessNote: null,
        }),
      }),
    );
  });

  it("does not regress a newer retry state when success completion loses its claim", async () => {
    mocks.appRequestUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await retryRepositoryBootstrapAction("req_123");

    expect(mocks.appRequestUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalledWith(
      "REPOSITORY_BOOTSTRAP_FAILED",
      expect.anything(),
    );
  });

  it("does not report a stale repository failure after the attempt loses its claim", async () => {
    mocks.bootstrapManagedRepository.mockRejectedValue(
      new Error("provider failed after a newer attempt finished"),
    );
    mocks.appRequestUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await retryRepositoryBootstrapAction("req_123");

    expect(mocks.recordAuditEvent).not.toHaveBeenCalledWith(
      "REPOSITORY_BOOTSTRAP_FAILED",
      expect.anything(),
    );
    expect(mocks.safeNotifyAppEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "REPOSITORY_FAILED" }),
    );
  });

  it("does not report a stale source-generation failure after the attempt loses its claim", async () => {
    mocks.buildSourceSnapshot.mockRejectedValue(
      new Error("source failed after a newer attempt finished"),
    );
    mocks.appRequestUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await retryRepositoryBootstrapAction("req_123");

    expect(mocks.recordAuditEvent).not.toHaveBeenCalledWith(
      "APP_REQUEST_FAILED",
      expect.anything(),
    );
  });
});
