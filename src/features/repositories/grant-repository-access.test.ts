// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  grantRepositoryAccessForActor,
  type GrantRepositoryAccessDependencies,
} from "./grant-repository-access";

const request = {
  id: "request-123",
  repositoryStatus: "READY",
  repositoryOwner: "cedarville-it",
  repositoryName: "campus-dashboard",
  supportReference: "SUP-123",
};

function dependencies(): GrantRepositoryAccessDependencies {
  return {
    prisma: {
      appRequest: {
        findFirst: vi.fn().mockResolvedValue(request),
        update: vi.fn().mockResolvedValue({}),
      },
      user: { update: vi.fn().mockResolvedValue({}) },
    },
    appAccessWhere: vi.fn((requestId, actorUserId, isAdmin) => ({
      id: requestId,
      actorUserId,
      isAdmin,
    })),
    userHasAdminRole: vi.fn().mockResolvedValue(false),
    parseGitHubUsername: vi.fn((username: unknown) => {
      if (username === "not valid!") {
        throw new Error("Enter a valid GitHub username.");
      }
      return String(username).trim();
    }),
    grantManagedRepositoryAccess: vi.fn().mockResolvedValue({
      status: "INVITED",
    }),
    recordAuditEvent: vi.fn().mockResolvedValue(undefined),
    persistRepositoryAccessOutcome: vi.fn().mockResolvedValue(undefined),
    buildSafeRepositoryAccessNote: vi.fn(
      (status, githubUsername) => `${status} @${githubUsername}`,
    ),
  };
}

describe("grantRepositoryAccessForActor", () => {
  let deps: GrantRepositoryAccessDependencies;

  beforeEach(() => {
    deps = dependencies();
  });

  it.each([
    ["owner-123", false],
    ["collaborator-123", false],
    ["admin-123", true],
  ])(
    "grants access for an authorized %s actor",
    async (actorUserId, isAdmin) => {
      vi.mocked(deps.userHasAdminRole).mockResolvedValue(isAdmin);

      await expect(
        grantRepositoryAccessForActor(
          {
            requestId: "request-123",
            actorUserId,
            githubUsername: "actor-name",
            source: "codex-mcp",
          },
          deps,
        ),
      ).resolves.toEqual({
        status: "INVITED",
        note: "INVITED @actor-name",
        githubUsername: "actor-name",
      });

      expect(deps.appAccessWhere).toHaveBeenLastCalledWith(
        "request-123",
        actorUserId,
        isAdmin,
      );
    },
  );

  it("uses the same quiet not-found result for a foreign or missing app", async () => {
    vi.mocked(deps.prisma.appRequest.findFirst).mockResolvedValue(null);

    const missing = await grantRepositoryAccessForActor(
      {
        requestId: "missing",
        actorUserId: "actor-123",
        githubUsername: "actor-name",
        source: "codex-mcp",
      },
      deps,
    ).catch((error: unknown) => error);
    const foreign = await grantRepositoryAccessForActor(
      {
        requestId: "foreign",
        actorUserId: "actor-123",
        githubUsername: "actor-name",
        source: "codex-mcp",
      },
      deps,
    ).catch((error: unknown) => error);

    expect(missing).toEqual(foreign);
    expect(deps.grantManagedRepositoryAccess).not.toHaveBeenCalled();
  });

  it("rejects access when the managed repository is not ready", async () => {
    vi.mocked(deps.prisma.appRequest.findFirst).mockResolvedValue({
      ...request,
      repositoryStatus: "PENDING",
    });

    await expect(
      grantRepositoryAccessForActor(
        {
          requestId: "request-123",
          actorUserId: "actor-123",
          githubUsername: "actor-name",
          source: "codex-mcp",
        },
        deps,
      ),
    ).rejects.toThrow("Managed repository is not ready for GitHub access grants.");

    expect(deps.grantManagedRepositoryAccess).not.toHaveBeenCalled();
  });

  it("validates the GitHub username before persistence or provider work", async () => {
    await expect(
      grantRepositoryAccessForActor(
        {
          requestId: "request-123",
          actorUserId: "actor-123",
          githubUsername: "not valid!",
          source: "codex-mcp",
        },
        deps,
      ),
    ).rejects.toThrow("Enter a valid GitHub username.");

    expect(deps.prisma.user.update).not.toHaveBeenCalled();
    expect(deps.grantManagedRepositoryAccess).not.toHaveBeenCalled();
  });

  it.each(["INVITED", "GRANTED"] as const)(
    "returns and persists a safe %s provider result for the requesting actor",
    async (status) => {
      vi.mocked(deps.grantManagedRepositoryAccess).mockResolvedValue({ status });

      await expect(
        grantRepositoryAccessForActor(
          {
            requestId: "request-123",
            actorUserId: "collaborator-123",
            githubUsername: "collaborator-name",
            source: "portal-ui",
          },
          deps,
        ),
      ).resolves.toEqual({
        status,
        note: `${status} @collaborator-name`,
        githubUsername: "collaborator-name",
      });

      expect(deps.prisma.user.update).toHaveBeenCalledWith({
        where: { id: "collaborator-123" },
        data: { githubUsername: "collaborator-name" },
      });
      expect(deps.persistRepositoryAccessOutcome).toHaveBeenCalledWith({
        requestId: "request-123",
        actorUserId: "collaborator-123",
        githubUsername: "collaborator-name",
        status,
        supportReference: "SUP-123",
        source: "portal-ui",
      });
    },
  );

  it("returns and persists a safe failed result without provider details", async () => {
    vi.mocked(deps.grantManagedRepositoryAccess).mockRejectedValue(
      new Error("token=provider-secret"),
    );

    await expect(
      grantRepositoryAccessForActor(
        {
          requestId: "request-123",
          actorUserId: "collaborator-123",
          githubUsername: "collaborator-name",
          source: "codex-mcp",
        },
        deps,
      ),
    ).resolves.toEqual({
      status: "FAILED",
      note: "FAILED @collaborator-name",
      githubUsername: "collaborator-name",
    });

    expect(deps.persistRepositoryAccessOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "collaborator-123",
        status: "FAILED",
        source: "codex-mcp",
      }),
    );
    expect(JSON.stringify(deps.persistRepositoryAccessOutcome.mock.calls)).not.toContain(
      "provider-secret",
    );
  });

  it("rechecks portal authorization immediately before the GitHub grant", async () => {
    vi.mocked(deps.prisma.appRequest.findFirst)
      .mockResolvedValueOnce(request)
      .mockResolvedValueOnce(null);

    await expect(
      grantRepositoryAccessForActor(
        {
          requestId: "request-123",
          actorUserId: "collaborator-123",
          githubUsername: "collaborator-name",
          source: "portal-ui",
        },
        deps,
      ),
    ).rejects.toThrow("App request not found.");

    expect(deps.userHasAdminRole).toHaveBeenCalledTimes(2);
    expect(deps.prisma.appRequest.findFirst).toHaveBeenCalledTimes(2);
    expect(deps.grantManagedRepositoryAccess).not.toHaveBeenCalled();
  });
});
