import { beforeEach, describe, expect, it, vi } from "vitest";
import { PortalApiError } from "@/features/portal-api/errors";
import type { PortalActor } from "@/features/portal-api/principal";

const mocks = vi.hoisted(() => ({
  appAccessWhere: vi.fn(),
  appListWhereForUser: vi.fn(),
  appRequestFindFirst: vi.fn(),
  publishAttemptFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  resolveRepositoryAccessForActor: vi.fn(),
}));

vi.mock("@/features/app-requests/access", () => ({
  appAccessWhere: mocks.appAccessWhere,
  appListWhereForUser: mocks.appListWhereForUser,
}));

vi.mock("@/features/repositories/actor-access", () => ({
  resolveRepositoryAccessForActor: mocks.resolveRepositoryAccessForActor,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findFirst: mocks.appRequestFindFirst },
    publishAttempt: { findFirst: mocks.publishAttemptFindFirst },
    user: { findUnique: mocks.userFindUnique },
  },
}));

import {
  getAccessibleAppSummary,
  getAccessiblePublishAttemptSummary,
} from "./get-app-summary";

const collaborator: PortalActor = {
  userId: "collaborator-1",
  entraOid: "entra-collaborator-1",
  email: "collaborator@cedarville.edu",
  displayName: "Collaborator",
  isAdmin: false,
};

const administrator: PortalActor = {
  ...collaborator,
  userId: "admin-1",
  isAdmin: true,
};

function managedApp(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    appName: "Campus Forms",
    sourceOfTruth: "PORTAL_MANAGED_REPO",
    generationStatus: "SUCCEEDED",
    repositoryStatus: "READY",
    repositoryAccessStatus: "GRANTED",
    repositoryAccessNote: "GitHub access is ready for @owner-name.",
    repositoryUrl: "https://github.com/cedarville-it/campus-forms",
    repositoryDefaultBranch: "main",
    publishStatus: "FAILED",
    publishingSetupStatus: "NEEDS_REPAIR",
    publishUrl: "https://campus-forms.azurewebsites.net",
    primaryPublishUrl: null,
    supportReference: "SUP-123",
    publishingSetupErrorSummary: "secret=provider-detail",
    azureKeyVaultUri: "https://secret-vault.vault.azure.net/",
    submittedConfig: { password: "not-for-callers" },
    publishSetupChecks: [
      {
        checkKey: "github_actions_secrets",
        metadata: { rawProviderDetail: "secret=setup-check-metadata" },
      },
    ],
    template: { slug: "web-app", name: "Custom Web App" },
    repositoryImport: null,
    publishAttempts: [
      {
        id: "attempt-1",
        status: "FAILED",
        stage: "FAILED",
        githubWorkflowRunUrl: "https://github.com/cedarville-it/campus-forms/actions/runs/1",
        startedAt: new Date("2026-09-01T12:00:00.000Z"),
        finishedAt: new Date("2026-09-01T12:05:00.000Z"),
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appAccessWhere.mockImplementation((id, userId, isAdmin) => ({
    id,
    actor: userId,
    isAdmin,
  }));
  mocks.appListWhereForUser.mockReturnValue({ OR: [{ userId: "collaborator-1" }] });
  mocks.userFindUnique.mockResolvedValue({ githubUsername: "collaborator-name" });
  mocks.resolveRepositoryAccessForActor.mockResolvedValue({
    status: "INVITED",
    note: "GitHub invited @collaborator-name to this repository.",
  });
});

describe("getAccessibleAppSummary", () => {
  it("returns an authorized collaborator view with actor-specific repository access and safe actions", async () => {
    mocks.appRequestFindFirst.mockResolvedValue(managedApp());

    const summary = await getAccessibleAppSummary(collaborator, "app-1");

    expect(summary).toMatchObject({
      id: "app-1",
      appName: "Campus Forms",
      template: { slug: "web-app", name: "Custom Web App" },
      repositoryAccess: {
        status: "INVITED",
        note: "GitHub invited @collaborator-name to this repository.",
      },
      repository: {
        url: "https://github.com/cedarville-it/campus-forms",
        defaultBranch: "main",
      },
      latestAttempt: {
        id: "attempt-1",
        workflowUrl: "https://github.com/cedarville-it/campus-forms/actions/runs/1",
      },
      liveUrl: "https://campus-forms.azurewebsites.net",
      allowedNextActions: [
        "request_github_access",
        "repair_publishing_setup",
        "retry_publish",
        "get_publish_status",
        "open_portal_for_advanced_management",
      ],
    });
    expect(Object.keys(summary).sort()).toEqual([
      "allowedNextActions",
      "appName",
      "generationStatus",
      "id",
      "latestAttempt",
      "liveUrl",
      "publishStatus",
      "publishingSetupStatus",
      "repository",
      "repositoryAccess",
      "repositoryStatus",
      "sourceOfTruth",
      "supportReference",
      "template",
    ]);
    expect(summary).not.toHaveProperty("publishingSetupErrorSummary");
    expect(summary).not.toHaveProperty("azureKeyVaultUri");
    expect(summary).not.toHaveProperty("submittedConfig");
    expect(summary).not.toHaveProperty("publishSetupChecks");
    expect(JSON.stringify(summary)).not.toContain("secret=provider-detail");
    expect(JSON.stringify(summary)).not.toContain("secret-vault.vault.azure.net");
    expect(JSON.stringify(summary)).not.toContain("not-for-callers");
    expect(JSON.stringify(summary)).not.toContain("secret=setup-check-metadata");
    expect(mocks.appAccessWhere).toHaveBeenCalledWith(
      "app-1",
      "collaborator-1",
      false,
    );
    expect(mocks.resolveRepositoryAccessForActor).toHaveBeenCalledWith({
      requestId: "app-1",
      actorUserId: "collaborator-1",
      githubUsername: "collaborator-name",
      legacyStatus: "GRANTED",
      legacyNote: "GitHub access is ready for @owner-name.",
    });
  });

  it("lets an administrator read an app through the admin predicate", async () => {
    mocks.appRequestFindFirst.mockResolvedValue(managedApp());

    await expect(getAccessibleAppSummary(administrator, "app-1")).resolves.toMatchObject({
      id: "app-1",
    });
    expect(mocks.appAccessWhere).toHaveBeenCalledWith("app-1", "admin-1", true);
  });

  it.each(["missing", "foreign"])(
    "uses the same quiet not-found result for a %s app",
    async (requestId) => {
      mocks.appRequestFindFirst.mockResolvedValue(null);

      await expect(getAccessibleAppSummary(collaborator, requestId)).rejects.toEqual(
        expect.objectContaining<Partial<PortalApiError>>({
          code: "NOT_FOUND",
          message: "App not found.",
        }),
      );
    },
  );

  it("returns a publish attempt only when its app is accessible", async () => {
    mocks.publishAttemptFindFirst.mockResolvedValue({
      ...managedApp().publishAttempts[0],
      appRequest: managedApp(),
    });

    await expect(
      getAccessiblePublishAttemptSummary(collaborator, "attempt-1"),
    ).resolves.toMatchObject({
      id: "attempt-1",
      appId: "app-1",
      status: "FAILED",
      workflowUrl: "https://github.com/cedarville-it/campus-forms/actions/runs/1",
    });
  });

  it("returns the same quiet not-found result for missing and inaccessible publish attempts", async () => {
    mocks.publishAttemptFindFirst.mockResolvedValue(null);

    const missing = await getAccessiblePublishAttemptSummary(
      collaborator,
      "missing-attempt",
    ).catch((error: unknown) => error);
    const inaccessible = await getAccessiblePublishAttemptSummary(
      collaborator,
      "foreign-attempt",
    ).catch((error: unknown) => error);

    const safeError = (error: unknown) => ({
      code: error instanceof PortalApiError ? error.code : undefined,
      message: error instanceof Error ? error.message : undefined,
    });

    expect(safeError(missing)).toEqual({
      code: "NOT_FOUND",
      message: "App not found.",
    });
    expect(safeError(inaccessible)).toEqual(safeError(missing));
    expect(mocks.appListWhereForUser).toHaveBeenCalledTimes(2);
    expect(mocks.appListWhereForUser).toHaveBeenNthCalledWith(
      1,
      "collaborator-1",
    );
    expect(mocks.appListWhereForUser).toHaveBeenNthCalledWith(
      2,
      "collaborator-1",
    );
    expect(mocks.publishAttemptFindFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: "missing-attempt",
          appRequest: { is: { OR: [{ userId: "collaborator-1" }] } },
        },
      }),
    );
    expect(mocks.publishAttemptFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: "foreign-attempt",
          appRequest: { is: { OR: [{ userId: "collaborator-1" }] } },
        },
      }),
    );
  });
});
