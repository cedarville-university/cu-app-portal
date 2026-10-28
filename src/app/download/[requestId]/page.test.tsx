import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DownloadPage from "./page";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormStatus: mockUseFormStatus };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

vi.mock("@/features/publishing/actions", () => ({
  enablePushToDeployAction: vi.fn(),
  disablePushToDeployAction: vi.fn(),
  publishToAzureAction: vi.fn(),
  retryPublishAction: vi.fn(),
}));

vi.mock("@/features/publishing/setup/actions", () => ({
  repairPublishingSetupAction: vi.fn(),
}));

vi.mock("@/features/repositories/actions", () => ({
  retryRepositoryBootstrapAction: vi.fn(),
  saveGitHubUsernameAndGrantAccessAction: vi.fn(),
}));

vi.mock("@/features/repository-imports/actions", () => ({
  prepareExistingAppAction: vi.fn(),
  verifyExistingAppPreparationAction: vi.fn(),
}));

vi.mock("@/features/app-deletion/actions", () => ({
  deleteAppFormAction: vi.fn(),
}));

vi.mock("@/features/collaboration-invites/actions", () => ({
  removeAppCollaboratorAction: vi.fn(),
}));

vi.mock("@/features/collaboration-invites/invite-panel", () => ({
  CollaborationInvitePanel: () => <div />,
}));

vi.mock("@/features/env-vars/actions", () => ({
  saveEnvVarsFormAction: vi.fn(),
}));

vi.mock("@/features/public-apps/public-listing-panel", () => ({
  PublicListingPanel: () => <div />,
}));

vi.mock("@/features/app-deletion/confirm-delete-form", () => ({
  ConfirmDeleteForm: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/features/repositories/copy-codex-handoff-button", () => ({
  CopyCodexHandoffButton: () => <div />,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
    appRequest: { findFirst: vi.fn() },
    auditLog: { findFirst: vi.fn() },
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

function appRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-123",
    supportReference: "SUP-20260818-ABC123",
    userId: "user-123",
    appName: "Campus Dashboard",
    sourceOfTruth: "PORTAL_MANAGED_REPO",
    submittedConfig: {},
    repositoryStatus: "READY",
    repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
    repositoryOwner: "cedarville-it",
    repositoryName: "campus-dashboard",
    repositoryDefaultBranch: "main",
    repositoryAccessStatus: "GRANTED",
    repositoryAccessNote: null,
    publishStatus: "FAILED",
    publishErrorSummary: null,
    publishingSetupStatus: "READY",
    publishingSetupErrorSummary: null,
    primaryPublishUrl: null,
    publishUrl: null,
    publishAttempts: [],
    publishSetupChecks: [],
    azureWebAppName: null,
    azureDatabaseName: null,
    deploymentTarget: "AZURE_APP_SERVICE",
    deploymentTriggerMode: "MANUAL",
    generationStatus: "SUCCEEDED",
    isPubliclyListed: false,
    user: { displayName: "Portal Owner", email: "owner@cedarville.edu" },
    collaborators: [],
    collaborationInvites: [],
    repositoryImport: null,
    environmentVariables: [],
    ...overrides,
  } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>;
}

async function renderPage(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
    appRequest(overrides),
  );
  render(
    await DownloadPage({
      params: Promise.resolve({ requestId: "request-123" }),
    }),
  );
}

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ githubUsername: null });
  vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DownloadPage navigation", () => {
  it("offers an Express-specific update for imported sign-in apps", async () => {
    await renderPage({
      sourceOfTruth: "IMPORTED_REPOSITORY",
      submittedConfig: { entraLogin: true, importRuntime: { framework: "express" } },
    });
    expect(screen.getByRole("region", { name: "Sign-in update" })).toBeInTheDocument();
    const prompt = (screen.getByRole("textbox", { name: "Codex sign-in update prompt" }) as HTMLTextAreaElement).value;
    expect(prompt).toContain("Express");
    expect(prompt).not.toContain("server action");
  });
  it("shows the sign-in update for older sign-in apps above app readiness", async () => {
    await renderPage({ templateVersion: "1.0.0", submittedConfig: { templateSlug: "web-app", entraLogin: true } });
    const notice = screen.getByRole("region", { name: "Sign-in update" });
    expect(notice).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy update prompt" })).toBeInTheDocument();
    expect((screen.getByRole("textbox", { name: "Codex sign-in update prompt" }) as HTMLTextAreaElement).value).toContain("https://github.com/cedarville-it/campus-dashboard");
    expect(notice.compareDocumentPosition(screen.getByRole("heading", { name: "App readiness" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not show the sign-in update for new starter versions", async () => {
    await renderPage({ templateVersion: "1.1.0", submittedConfig: { templateSlug: "web-app", entraLogin: true } });
    expect(screen.queryByRole("region", { name: "Sign-in update" })).not.toBeInTheDocument();
  });
  it.each(["NOT_STARTED", "QUEUED", "PROVISIONING", "DEPLOYING", "DELETED"])("redirects a non-admin to onboarding for %s", async (publishStatus) => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(appRequest({ publishStatus }));

    await expect(
      DownloadPage({
        params: Promise.resolve({ requestId: "request-123" }),
      }),
    ).rejects.toThrow("redirect:/onboarding/request-123");
  });

  it("lets an owner manage settings and delete an app after a failed first publish", async () => {
    await renderPage({ publishStatus: "FAILED", azureWebAppName: null });

    expect(screen.getByText("Advanced options")).toBeInTheDocument();
    expect(screen.getByText("Delete App")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Environment variables", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry Publish" })).toBeInTheDocument();
  });

  it("renders published app details for a non-admin", async () => {
    await renderPage({
      publishStatus: "SUCCEEDED",
      submittedConfig: { entraLogin: true },
      primaryPublishUrl: "https://campus-dashboard.azurewebsites.net",
    });

    expect(
      screen.getByRole("heading", { name: /your app is ready/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "App readiness" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cedarville sign-in is required.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open your app" })).toHaveAttribute(
      "href",
      "https://campus-dashboard.azurewebsites.net",
    );
    expect(screen.getByText("Advanced options")).toBeInTheDocument();
  });

  it("shows the health warning to a published app owner", async () => {
    const warning = "Published with a warning: /api/health is missing. The root path returned HTTP 200.";
    await renderPage({ publishStatus: "SUCCEEDED", publishWarningSummary: warning, primaryPublishUrl: "https://app.example.test" });
    expect(screen.getByText(warning)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open your app" })).toHaveAttribute("href", "https://app.example.test");
  });

  it("offers repair and retry controls under advanced options for published apps", async () => {
    await renderPage({
      publishStatus: "SUCCEEDED",
      publishingSetupStatus: "READY",
    });

    const advancedOptions = screen
      .getByText("Advanced options")
      .closest("details");
    expect(advancedOptions).not.toBeNull();
    for (const name of ["Repair Publishing Setup", "Retry Publish"]) {
      expect(
        within(advancedOptions!).getByRole("button", { name }),
      ).toBeInTheDocument();
    }
  });

  it("keeps published customization inside a local Codex project", async () => {
    await renderPage({ publishStatus: "SUCCEEDED" });

    expect(
      screen.getByRole("heading", { name: "Before opening Codex" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/company portal/i)).toBeInTheDocument();
    expect(screen.getByText(/Cedarville login scripts/i)).toBeInTheDocument();
    expect(screen.getAllByText(/local codex project/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/make it the primary folder/i)).toBeInTheDocument();
    expect(screen.getByText(/do not use quick chat/i)).toBeInTheDocument();
  });

  it("keeps broad Git staging commands off published local-app details", async () => {
    await renderPage({
      publishStatus: "SUCCEEDED",
      submittedConfig: { localOnlySource: true },
    });

    expect(
      screen.getByRole("heading", { name: "Use your existing app folder" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/local codex project/i).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent("git add .");
    expect(document.body).not.toHaveTextContent("git init");
  });

  it("keeps published imported-app syncing inside a local Codex project", async () => {
    await renderPage({
      publishStatus: "SUCCEEDED",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryImport: {
        importStatus: "SUCCEEDED",
        sourceRepositoryUrl: "https://github.com/example/source",
        preparationStatus: "SUCCEEDED",
        preparationMode: "DIRECT_COMMIT",
      },
    });

    expect(
      screen.getByRole("heading", { name: "Before opening Codex" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/use codex to sync your imported app/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("git remote add portal");
    expect(document.body).not.toHaveTextContent("git pull portal");
    expect(document.body).not.toHaveTextContent("git push portal");
  });

  it("renders unpublished app details for an admin", async () => {
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "user-123",
      role: "ADMIN",
      createdAt: new Date("2026-08-18T12:00:00Z"),
      updatedAt: new Date("2026-08-18T12:00:00Z"),
    });

    await renderPage();

    expect(
      screen.getByRole("heading", { name: /your app is ready/i }),
    ).toBeInTheDocument();
  });
});

describe("DownloadPage admin publishing recovery", () => {
  beforeEach(() => {
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "user-123",
      role: "ADMIN",
      createdAt: new Date("2026-08-18T12:00:00Z"),
      updatedAt: new Date("2026-08-18T12:00:00Z"),
    });
  });

  it.each(["CHECKING", "REPAIRING"])(
    "waits safely while publishing setup is %s",
    async (publishingSetupStatus) => {
      await renderPage({ publishingSetupStatus });

      expect(screen.getByText(/publishing check is still running/i)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /view publishing progress/i }),
      ).toHaveAttribute("href", "/onboarding/request-123");
      expect(
        screen.queryByRole("button", { name: /retry publish/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /repair publishing setup/i }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(["NEEDS_REPAIR", "BLOCKED"])(
    "offers valid retry and repair recovery while setup is %s",
    async (publishingSetupStatus) => {
      await renderPage({ publishingSetupStatus });

      expect(
        screen.getByRole("button", { name: "Retry Publish" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Repair Publishing Setup" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Retry Publish" }).closest("details"),
      ).toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Repair Publishing Setup" })
          .closest("details"),
      ).toBeNull();
    },
  );

  it("offers setup repair after a failed publish whose saved setup is ready", async () => {
    await renderPage({ publishingSetupStatus: "READY" });

    expect(
      screen.getByRole("button", { name: "Retry Publish" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Repair Publishing Setup" }),
    ).toBeInTheDocument();
  });

  it("keeps setup repair absent for a deleted publish", async () => {
    await renderPage({
      publishStatus: "DELETED",
      publishingSetupStatus: "NEEDS_REPAIR",
    });

    expect(
      screen.queryByRole("button", { name: /retry publish/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /repair publishing setup/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the disable auto-deploy control visible while leaving diagnostics advanced", async () => {
    await renderPage({
      deploymentTriggerMode: "PUSH_TO_DEPLOY",
      publishStatus: "SUCCEEDED",
      azureWebAppName: "campus-dashboard",
      deploymentTarget: "Azure App Service",
      primaryPublishUrl: "https://campus-dashboard.azurewebsites.net",
      publishAttempts: [
        {
          githubWorkflowRunUrl:
            "https://github.com/cedarville-it/campus-dashboard/actions/runs/123",
        },
      ],
    });

    expect(
      screen.getByRole("button", { name: "Disable Auto-Deploy" }).closest("details"),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: "Deployment log" }).closest("details"),
    ).not.toBeNull();
  });

  it("keeps publish and repair mutations absent before imported preparation", async () => {
    await renderPage({
      sourceOfTruth: "IMPORTED_REPOSITORY",
      publishingSetupStatus: "NEEDS_REPAIR",
      repositoryImport: {
        importStatus: "SUCCEEDED",
        sourceRepositoryUrl: "https://github.com/example/source",
        preparationStatus: "FAILED",
        preparationMode: "DIRECT_COMMIT",
      },
    });

    expect(screen.getByText(/publishing setup has been applied/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry Publish" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /repair publishing setup/i }),
    ).not.toBeInTheDocument();
  });
});

describe("DownloadPage actor-specific GitHub access", () => {
  it.each([
    {
      actorUserId: "owner-123",
      githubUsername: "owner-name",
      role: "owner",
      event: "REPOSITORY_ACCESS_FAILED",
      status: "FAILED",
      expected: /could not confirm repository access for @owner-name/i,
    },
    {
      actorUserId: "collaborator-123",
      githubUsername: "collaborator-name",
      role: "collaborator",
      event: "REPOSITORY_ACCESS_SUCCEEDED",
      status: "INVITED",
      expected: /github invited @collaborator-name/i,
    },
    {
      actorUserId: "admin-123",
      githubUsername: "admin-name",
      role: "admin",
      event: "REPOSITORY_ACCESS_SUCCEEDED",
      status: "GRANTED",
      expected: /repository access has been granted/i,
    },
  ] as const)(
    "renders the durable $status outcome for the $role actor only",
    async ({ actorUserId, githubUsername, role, event, status, expected }) => {
      vi.mocked(getCurrentUserIdOrNull).mockResolvedValue(actorUserId);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ githubUsername });
      if (role === "admin") {
        vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
          id: "role-123",
          userId: actorUserId,
          role: "ADMIN",
          createdAt: new Date("2026-08-18T12:00:00Z"),
          updatedAt: new Date("2026-08-18T12:00:00Z"),
        });
      }
      vi.mocked(prisma.auditLog.findFirst).mockResolvedValue({
        event,
        details: {
          requestId: "request-123",
          actorUserId,
          githubUsername,
          accessStatus: status,
          safeSummary: "secret=provider-detail&token=raw-token",
        },
      } as Awaited<ReturnType<typeof prisma.auditLog.findFirst>>);

      await renderPage({
        userId: "owner-123",
        publishStatus: "SUCCEEDED",
        repositoryAccessStatus: "FAILED",
        repositoryAccessNote:
          "GitHub access failed for @another-actor: secret=other-actor-detail",
      });

      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(
        /another-actor|other-actor-detail|provider-detail|raw-token|secret=/i,
      );
      expect(prisma.auditLog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { details: { path: ["actorUserId"], equals: actorUserId } },
            ]),
          }),
        }),
      );
    },
  );

  it("keeps one actor's durable grant when another actor last wrote shared failure", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "collaborator-name",
    });
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue({
      event: "REPOSITORY_ACCESS_SUCCEEDED",
      details: {
        requestId: "request-123",
        actorUserId: "user-123",
        githubUsername: "collaborator-name",
        accessStatus: "GRANTED",
      },
    } as Awaited<ReturnType<typeof prisma.auditLog.findFirst>>);

    await renderPage({
      publishStatus: "SUCCEEDED",
      repositoryAccessStatus: "FAILED",
      repositoryAccessNote:
        "GitHub access failed for @owner-name: secret=owner-provider-detail",
    });

    expect(
      screen.getByText(/repository access has been granted/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/owner-name|owner-provider-detail/i);
  });
});

describe("DownloadPage diagnostic redaction", () => {
  const hostileSummary =
    "Azure response https://management.azure.com/op?token=raw-token secret=provider-detail";

  it("keeps provider evidence out of the full ordinary-user DOM", async () => {
    await renderPage({
      publishStatus: "SUCCEEDED",
      publishErrorSummary: hostileSummary,
      publishingSetupErrorSummary: `Error.message: ${hostileSummary}`,
      publishSetupChecks: [
        {
          checkKey: "azure_resource_access",
          status: "FAIL",
          message: `Provider metadata requestId=raw-123 ${hostileSummary}`,
          metadata: { requestId: "secret=metadata-detail" },
        },
      ],
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryImport: {
        importStatus: "FAILED",
        importErrorSummary: `Import ${hostileSummary}`,
        compatibilityStatus: "UNSUPPORTED",
        preparationStatus: "FAILED",
        preparationMode: "DIRECT_COMMIT",
        preparationErrorSummary: `Preparation ${hostileSummary}`,
      },
    });

    expect(document.body.innerHTML).not.toMatch(
      /management\.azure\.com|raw-token|provider-detail|raw-123|metadata-detail|secret=|error\.message/i,
    );
    expect(screen.getByText("SUP-20260818-ABC123")).toBeInTheDocument();
    expect(screen.getByText(/share this support reference/i)).toBeInTheDocument();
  });

  it("shows raw provider diagnostics only to an admin", async () => {
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "user-123",
      role: "ADMIN",
      createdAt: new Date("2026-08-18T12:00:00Z"),
      updatedAt: new Date("2026-08-18T12:00:00Z"),
    });

    await renderPage({
      publishErrorSummary: hostileSummary,
      publishingSetupErrorSummary: `Error.message: ${hostileSummary}`,
      publishSetupChecks: [
        {
          checkKey: "azure_resource_access",
          status: "FAIL",
          message: `Provider metadata requestId=raw-123 ${hostileSummary}`,
          metadata: { requestId: "secret=metadata-detail" },
        },
      ],
    });

    expect(document.body).toHaveTextContent("provider-detail");
    expect(document.body).toHaveTextContent("raw-123");
  });
});
