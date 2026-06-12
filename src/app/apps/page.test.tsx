import { cleanup, render, screen, within } from "@testing-library/react";
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
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MyAppsPage", () => {
  it("renders breadcrumb links for returning home or creating another app", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(await MyAppsPage());

    const breadcrumb = screen.getByRole("navigation", {
      name: /breadcrumb/i,
    });
    expect(
      within(breadcrumb).getByRole("link", { name: /home/i }),
    ).toHaveAttribute("href", "/");
    expect(
      within(breadcrumb).getByRole("link", { name: /create new app/i }),
    ).toHaveAttribute("href", "/create");
    expect(within(breadcrumb).getByText("My Apps")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps each app card high-level with status and app links only", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_123",
        appName: "Campus Dashboard",
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
    expect(within(card).getByText(/created:\s*succeeded/i)).toBeInTheDocument();
    expect(within(card).getByText(/repository:\s*ready/i)).toBeInTheDocument();
    expect(within(card).getByText(/published:\s*failed/i)).toBeInTheDocument();
    expect(within(card).getByText(/code access:\s*granted/i)).toBeInTheDocument();
    expect(
      within(card).getByText(/pub\. config:\s*needs repair/i),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "cedarville-it/campus-dashboard" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/cedarville-it/campus-dashboard",
    );
    expect(
      within(card).getByRole("link", { name: "https://dashboard.example.edu" }),
    ).toHaveAttribute("href", "https://dashboard.example.edu");
    expect(
      within(card).getByRole("link", { name: /app details/i }),
    ).toHaveAttribute("href", "/download/req_123");
    expect(
      within(card).getByRole("link", { name: "Campus Dashboard" }),
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

  it("does not fetch detail-only data for the list view", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue(
      [] as Awaited<ReturnType<typeof prisma.appRequest.findMany>>,
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

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
        include: {
          repositoryImport: true,
        },
      }),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("shows legacy published apps with unchecked publishing setup as ready", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
      {
        id: "req_legacy_published",
        appName: "Campus Dashboard",
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
      within(appCard as HTMLElement).getByText(/pub\. config:\s*ready/i),
    ).toBeInTheDocument();
    expect(
      within(appCard as HTMLElement).queryByText(
        /pub\. config:\s*not checked/i,
      ),
    ).not.toBeInTheDocument();
  });
});
