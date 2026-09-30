import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyAppsPage from "./page";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

vi.mock("@/features/publishing/actions", () => ({
  enablePushToDeployAction: vi.fn(),
  publishToAzureAction: vi.fn(),
  retryPublishAction: vi.fn(),
}));

vi.mock("@/features/publishing/setup/actions", () => ({
  repairPublishingSetupAction: vi.fn(),
}));

vi.mock("@/features/app-deletion/actions", () => ({
  deleteAppAction: vi.fn(),
}));

vi.mock("@/features/auth/logout", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/features/repositories/actions", () => ({
  retryRepositoryBootstrapAction: vi.fn(),
  saveGitHubUsernameAndGrantAccessAction: vi.fn(),
}));

vi.mock("@/features/repository-imports/actions", () => ({
  prepareExistingAppAction: vi.fn(),
  verifyExistingAppPreparationAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    userRole: {
      findFirst: vi.fn(),
    },
    appRequest: {
      findMany: vi.fn(),
    },
    auditLog: {
      findFirst: vi.fn(),
    },
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MyAppsPage", () => {
  it("shows a queued external import as in setup without provider details", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_pending_import",
        appName: "Queued Existing App",
        createdAt: new Date("2025-05-01T12:00:00.000Z"),
        updatedAt: new Date("2025-05-12T12:00:00.000Z"),
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "PENDING",
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
        publishStatus: "NOT_STARTED",
        publishingSetupStatus: "NOT_CHECKED",
        repositoryUrl: null,
        publishUrl: null,
        primaryPublishUrl: null,
        repositoryImport: {
          importStatus: "PENDING",
          importErrorSummary: "provider token=must-not-render",
          compatibilityStatus: "NOT_SCANNED",
          preparationStatus: "NOT_STARTED",
          preparationErrorSummary: null,
        },
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    render(await MyAppsPage());

    const row = screen
      .getByRole("heading", { name: "Queued Existing App" })
      .closest("li")!;
    expect(within(row).getByText("In setup")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: /continue setup/i })).toHaveAttribute(
      "href",
      "/onboarding/req_pending_import",
    );
    expect(row).not.toHaveTextContent(/provider token|must-not-render/i);
  });

  it("renders the page heading and launch actions for an empty app list", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>,
    );
    render(await MyAppsPage());

    expect(screen.getByRole("heading", { name: "My Apps" })).toBeInTheDocument();
    expect(screen.getByText("No apps yet")).toBeInTheDocument();
    for (const launchLink of screen.getAllByRole("link", { name: "Launch New App" })) {
      expect(launchLink).toHaveAttribute("href", "/create");
    }
  });

  it("renders a compact app row with setup status and management links", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_123",
        appName: "Campus Dashboard",
        createdAt: new Date("2025-05-01T12:00:00.000Z"),
        updatedAt: new Date("2025-05-12T12:00:00.000Z"),
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "IMPORTED_REPOSITORY",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: "GitHub access is ready for @portalstaff.",
        publishStatus: "FAILED",
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary:
          "Publishing credentials are out of date and need to be refreshed.",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        repositoryOwner: "cedarville-it",
        repositoryName: "campus-dashboard",
        repositoryDefaultBranch: "main",
        publishUrl: "https://dashboard.example.edu",
        primaryPublishUrl:
          "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
        azureWebAppName: "app-campus-dashboard-clx9abc1",
        azureDatabaseName: "db_campus_dashboard_clx9abc1",
        repositoryImport: {
          sourceRepositoryUrl: "https://github.com/example/source-dashboard",
          importStatus: "FAILED",
          importErrorSummary:
            "Repository import failed while cloning source repository.",
          compatibilityStatus: "CONFLICTED",
          preparationStatus: "BLOCKED",
          preparationErrorSummary:
            "Repository has publishing file conflicts.",
        },
        publishAttempts: [
          {
            githubWorkflowRunUrl:
              "https://github.com/cedarville-it/campus-dashboard/actions/runs/123",
          },
        ],
        publishSetupChecks: [
          {
            checkKey: "github_actions_secrets",
            status: "FAIL",
            message: "Required GitHub Actions secrets are missing.",
          },
        ],
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    const appCard = screen
      .getByRole("heading", { name: /campus dashboard/i })
      .closest("li");
    expect(appCard).not.toBeNull();

    const card = appCard as HTMLElement;
    expect(within(card).getByText("Needs attention")).toBeInTheDocument();
    expect(within(card).getByText(/updated may 12, 2025/i)).toBeInTheDocument();
    fireEvent.click(
      within(card).getByLabelText("More options for Campus Dashboard"),
    );
    expect(
      within(card).getByRole("link", { name: "GitHub repository" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/cedarville-it/campus-dashboard",
    );
    expect(
      within(card).getByRole("link", { name: "Published app URL" }),
    ).toHaveAttribute("href", "https://dashboard.example.edu");
    expect(
      within(card).getByRole("link", { name: /continue setup/i }),
    ).toHaveAttribute("href", "/onboarding/req_123");
    expect(
      within(card).getByRole("link", { name: "App details" }),
    ).toHaveAttribute("href", "/download/req_123");

    expect(
      within(card).queryByRole("button", { name: /retry publish/i }),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: /repair publishing setup/i }),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: /copy codex handoff prompt/i }),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: /delete selected resources/i }),
    ).not.toBeInTheDocument();
    expect(within(card).queryByText(/deployment log/i)).not.toBeInTheDocument();
    expect(
      within(card).queryByText(/required github actions secrets are missing/i),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByText(/repository import failed while cloning/i),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByText(/app-campus-dashboard-clx9abc1/i),
    ).not.toBeInTheDocument();
  });

  it("shows a live link and published state for successfully published apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_actor_access",
        appName: "Actor Access App",
        createdAt: new Date("2025-05-01T12:00:00.000Z"),
        updatedAt: new Date("2025-05-08T12:00:00.000Z"),
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "PORTAL_MANAGED_REPO",
        repositoryStatus: "READY",
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
        publishStatus: "SUCCEEDED",
        publishingSetupStatus: "NOT_CHECKED",
        repositoryUrl:
          "https://github.com/cedarville-it/actor-access-app",
        publishUrl: "https://actor-access.example.edu",
        primaryPublishUrl: null,
        repositoryImport: null,
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    render(await MyAppsPage());

    const appCard = screen
      .getByRole("heading", { name: "Actor Access App" })
      .closest("li");

    expect(appCard).not.toBeNull();
    expect(within(appCard as HTMLElement).getByText("Live")).toBeInTheDocument();
    expect(
      within(appCard as HTMLElement).getByRole("link", { name: "Open app" }),
    ).toHaveAttribute("href", "https://actor-access.example.edu");
  });

  it("fetches apps scoped to the signed-in owner and collaborators", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>,
    );
    render(await MyAppsPage());

    expect(prisma.appRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { userId: "user-123" },
            {
              collaborators: {
                some: { userId: "user-123" },
              },
            },
          ],
        },
      }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not widen my apps results just because the user is an admin", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("admin-123");
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "admin-123",
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>,
    );

    render(await MyAppsPage());

    expect(prisma.appRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { userId: "admin-123" },
            {
              collaborators: {
                some: { userId: "admin-123" },
              },
            },
          ],
        },
      }),
    );
  });

  it("shows legacy published apps as live when setup has not been checked", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_legacy_published",
        appName: "Campus Dashboard",
        createdAt: new Date("2025-05-01T12:00:00.000Z"),
        updatedAt: new Date("2025-05-08T12:00:00.000Z"),
        generationStatus: "SUCCEEDED",
        sourceOfTruth: "PORTAL_MANAGED_REPO",
        repositoryStatus: "READY",
        repositoryAccessStatus: "GRANTED",
        publishStatus: "SUCCEEDED",
        publishingSetupStatus: "NOT_CHECKED",
        repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        publishUrl: "https://app-campus-dashboard.azurewebsites.net",
        primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
        repositoryImport: null,
      },
    ] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);

    render(await MyAppsPage());

    const appCard = screen
      .getByRole("heading", { name: /campus dashboard/i })
      .closest("li");

    expect(appCard).not.toBeNull();
    expect(
      within(appCard as HTMLElement).getByRole("link", {
        name: /open app/i,
      }),
    ).toHaveAttribute("href", "https://app-campus-dashboard.azurewebsites.net");
    expect(
      within(appCard as HTMLElement).getByRole("link", {
        name: "Campus Dashboard",
      }),
    ).toHaveAttribute("href", "/download/req_legacy_published");
    expect(within(appCard as HTMLElement).getByText("Live")).toBeInTheDocument();
  });
});
