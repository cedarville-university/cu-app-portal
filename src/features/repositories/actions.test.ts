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
  grantRepositoryAccessForActor: vi.fn(),
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

vi.mock("./grant-repository-access", () => ({
  grantRepositoryAccessForActor: mocks.grantRepositoryAccessForActor,
}));

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
    mocks.grantRepositoryAccessForActor.mockResolvedValue({
      status: "INVITED",
      note: "GitHub invited @collaborator-name to this repository.",
      githubUsername: "collaborator-name",
    });
  });

  it("adapts the browser form to the shared actor access service", async () => {
    const formData = new FormData();
    formData.set("githubUsername", "collaborator-name");

    await saveGitHubUsernameAndGrantAccessAction("req_123", formData);

    expect(mocks.grantRepositoryAccessForActor).toHaveBeenCalledWith({
      requestId: "req_123",
      actorUserId: "collaborator-123",
      githubUsername: "collaborator-name",
      source: "portal-ui",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/download/req_123");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/onboarding/req_123");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/apps");
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
