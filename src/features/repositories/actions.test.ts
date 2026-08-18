// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  resolveCurrentUserId: vi.fn(),
  userHasAdminRole: vi.fn(),
  appAccessWhere: vi.fn(),
  appRequestFindFirst: vi.fn(),
  appRequestUpdate: vi.fn(),
  userUpdate: vi.fn(),
  grantManagedRepositoryAccess: vi.fn(),
  recordAuditEvent: vi.fn(),
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
  safeNotifyAppEvent: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findFirst: mocks.appRequestFindFirst,
      update: mocks.appRequestUpdate,
    },
    user: {
      findUnique: vi.fn(),
      update: mocks.userUpdate,
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

import { saveGitHubUsernameAndGrantAccessAction } from "./actions";

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
    mocks.recordAuditEvent.mockResolvedValue(undefined);
  });

  it("persists the signed-in actor username with a failed access note", async () => {
    mocks.grantManagedRepositoryAccess.mockRejectedValue(
      new Error("GitHub could not find that account."),
    );
    const formData = new FormData();
    formData.set("githubUsername", "collaborator-name");

    await saveGitHubUsernameAndGrantAccessAction("req_123", formData);

    expect(mocks.appRequestUpdate).toHaveBeenCalledWith({
      where: { id: "req_123" },
      data: {
        repositoryAccessStatus: "FAILED",
        repositoryAccessNote:
          "GitHub access failed for @collaborator-name: GitHub could not find that account.",
      },
    });
  });
});
