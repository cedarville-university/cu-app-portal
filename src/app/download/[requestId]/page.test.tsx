import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DownloadPage from "./page";

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

vi.mock("@/features/auth/logout", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/features/publishing/actions", () => ({
  enablePushToDeployAction: vi.fn(),
  publishToAzureAction: vi.fn(),
  retryPublishAction: vi.fn(),
}));

vi.mock("@/features/app-deletion/actions", () => ({
  deleteAppAction: vi.fn(),
  deleteAppFormAction: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    userRole: {
      findFirst: vi.fn(),
    },
    appRequest: {
      findFirst: vi.fn(),
    },
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("DownloadPage", () => {
  it("shows managed repo messaging instead of a manual GitHub checklist", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_123",
      appName: "Campus Dashboard",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: "GitHub access is ready for @portalstaff.",
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "NOT_CHECKED",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      artifact: {
        id: "artifact-123",
      },
      publishAttempts: [],
      publishSetupChecks: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_123" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /your app is ready/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/repository ready:/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "https://github.com/cedarville-it/campus-dashboard",
      }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("button", { name: /copy codex handoff prompt/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/create a new github repository/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download zip/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/repository access has been granted for this app/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /publish to azure/i }),
    ).toBeInTheDocument();
    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "req_123",
          OR: [
            { userId: "user-123" },
            {
              collaborators: {
                some: { userId: "user-123" },
              },
            },
          ],
        },
        include: expect.objectContaining({
          repositoryImport: true,
          publishSetupChecks: {
            orderBy: { checkedAt: "desc" },
            take: 7,
          },
        }),
      }),
    );
  });

  it("lets collaborators request their own repository access after app access was already granted", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("collaborator-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_collab_access",
      userId: "owner-123",
      appName: "Campus Dashboard",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: "GitHub access is ready for @ownerhub.",
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "NOT_CHECKED",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      artifact: {
        id: "artifact-123",
      },
      publishAttempts: [],
      publishSetupChecks: [],
      repositoryImport: null,
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "collabdev",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_collab_access" }),
      }),
    );

    expect(
      screen.getByText(/repository access has been granted for this app/i),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("collabdev")).toHaveAttribute(
      "name",
      "githubUsername",
    );
    expect(
      screen.getByRole("button", { name: /request repository access/i }),
    ).toBeInTheDocument();
  });

  it("lists the app owner and collaborators on the app details page", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("owner-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_access_list",
      userId: "owner-123",
      appName: "Campus Dashboard",
      repositoryStatus: "READY",
      repositoryAccessStatus: "NOT_REQUESTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "NOT_CHECKED",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      artifact: {
        id: "artifact-123",
      },
      publishAttempts: [],
      publishSetupChecks: [],
      repositoryImport: null,
      user: {
        displayName: "Olivia Owner",
        email: "owner@cedarville.edu",
      },
      collaborators: [
        {
          user: {
            displayName: "Casey Collaborator",
            email: "casey@cedarville.edu",
          },
        },
        {
          user: {
            displayName: "Jordan Builder",
            email: "jordan@cedarville.edu",
          },
        },
      ],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "ownerhub",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_access_list" }),
      }),
    );

    const accessRegion = screen.getByRole("region", { name: /app access/i });

    expect(within(accessRegion).getByText("Owner")).toBeInTheDocument();
    expect(within(accessRegion).getByText("Olivia Owner")).toBeInTheDocument();
    expect(
      within(accessRegion).getByText("owner@cedarville.edu"),
    ).toBeInTheDocument();
    expect(
      within(accessRegion).getByText("Collaborators"),
    ).toBeInTheDocument();
    expect(
      within(accessRegion).getByText("Casey Collaborator"),
    ).toBeInTheDocument();
    expect(
      within(accessRegion).getByText("casey@cedarville.edu"),
    ).toBeInTheDocument();
    expect(
      within(accessRegion).getByText("Jordan Builder"),
    ).toBeInTheDocument();
    expect(
      within(accessRegion).getByText("jordan@cedarville.edu"),
    ).toBeInTheDocument();
  });

  it("hides publish actions for unprepared imported apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "FAILED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        compatibilityStatus: "NEEDS_ADDITIONS",
        preparationStatus: "PENDING_USER_CHOICE",
      },
      artifact: {
        id: "artifact-import",
      },
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import" }),
      }),
    );

    expect(
      screen.getByText(
        /publishing is unavailable until the publishing setup has been applied/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /publish to azure/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry publish/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Codex git setup instructions for local apps with portal-created repos", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_local",
      appName: "Campus Dashboard",
      submittedConfig: {
        description: "Built locally with Codex.",
        hostingTarget: "Azure App Service",
        localOnlySource: true,
      },
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "NOT_REQUESTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      repositoryDefaultBranch: "main",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "NOT_CHECKED",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
        importStatus: "NOT_REQUIRED",
        compatibilityStatus: "NOT_SCANNED",
        preparationStatus: "PENDING_USER_CHOICE",
      },
      artifact: null,
      publishAttempts: [],
      publishSetupChecks: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_local" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /push your local app code/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("git init")).toBeInTheDocument();
    expect(screen.getByText("git remote add portal https://github.com/cedarville-it/campus-dashboard")).toBeInTheDocument();
    expect(screen.getByText("git push -u portal HEAD:main")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy codex handoff prompt/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /copy codex handoff prompt/i }),
    );

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("Do not require the GitHub CLI."),
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "git remote add portal https://github.com/cedarville-it/campus-dashboard",
      ),
    );
  });

  it("shows repair instead of publish actions when publishing setup needs repair", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_setup_repair",
      appName: "Campus Dashboard",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "FAILED",
      publishErrorSummary:
        "Publishing setup failed: Publishing credentials are out of date and need to be refreshed.",
      publishingSetupStatus: "NEEDS_REPAIR",
      publishingSetupErrorSummary:
        "Publishing credentials are out of date and need to be refreshed.",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      repositoryImport: null,
      artifact: {
        id: "artifact-setup-repair",
      },
      publishAttempts: [],
      publishSetupChecks: [
        {
          checkKey: "github_actions_secrets",
          status: "FAIL",
          message: "Required GitHub Actions secrets are missing.",
        },
      ],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_setup_repair" }),
      }),
    );

    const setupStatus = screen.getByRole("region", {
      name: /publishing setup status/i,
    });
    expect(
      within(setupStatus).getByText((_, element) =>
        element?.textContent === "Status: needs repair",
      ),
    ).toBeInTheDocument();
    expect(
      within(setupStatus).getByText(/publishing credentials are out of date/i),
    ).toBeInTheDocument();
    expect(
      within(setupStatus).getByText((_, element) => {
        const text = element?.textContent?.replace(/\s+/g, " ").trim();
        return Boolean(
          element?.tagName === "LI" &&
            text?.includes("GitHub publish secrets: fail") &&
            text.includes("Required GitHub Actions secrets are missing."),
        );
      }),
    ).toBeInTheDocument();
    expect(
      within(setupStatus).getByRole("button", {
        name: /repair publishing setup/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/publishing setup needs to be repaired before you can publish/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /publish to azure/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry publish/i }),
    ).not.toBeInTheDocument();
  });

  it("shows imported app details even when no generated artifact exists", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_no_artifact",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "READY",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        preparationStatus: "PENDING_USER_CHOICE",
      },
      artifact: null,
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_no_artifact" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /imported app details/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "https://github.com/cedarville-it/campus-dashboard",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download zip/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /publishing is unavailable until the publishing setup has been applied/i,
      ),
    ).toBeInTheDocument();
    const importedStatus = screen.getByRole("region", {
      name: /imported repository status/i,
    });
    expect(
      within(importedStatus).getByRole("button", {
        name: /apply publishing setup/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(importedStatus).getByRole("button", {
        name: /review publishing changes/i,
      }),
    ).toBeInTheDocument();
  });

  it("offers a preparation PR for conflict-blocked imported apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_conflict",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "READY",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        compatibilityStatus: "CONFLICTED",
        preparationStatus: "BLOCKED",
        preparationErrorSummary:
          "Repository has publishing file conflicts. app-portal/deployment-manifest.json already exists.",
      },
      artifact: null,
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const { container } = render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_conflict" }),
      }),
    );

    const importedStatus = screen.getByRole("region", {
      name: /imported repository status/i,
    });
    expect(
      within(importedStatus).getByText(/publishing setup: blocked/i),
    ).toBeInTheDocument();
    expect(
      within(importedStatus).getByRole("button", {
        name: /review publishing changes/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(importedStatus).getByRole("button", {
        name: /confirm repository is ready/i,
      }),
    ).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll('input[name="preparationMode"]')).map(
        (input) => (input as HTMLInputElement).value,
      ),
    ).toEqual(["PULL_REQUEST"]);
  });

  it("disables imported app preparation choices and shows live status while pending", async () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_pending_buttons",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "READY",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        compatibilityStatus: "NEEDS_ADDITIONS",
        preparationStatus: "PENDING_USER_CHOICE",
      },
      artifact: null,
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_pending_buttons" }),
      }),
    );

    const importedStatus = screen.getByRole("region", {
      name: /imported repository status/i,
    });
    expect(
      within(importedStatus).getByRole("button", {
        name: /applying publishing setup/i,
      }),
    ).toBeDisabled();
    expect(
      within(importedStatus).getByRole("button", {
        name: /opening review page/i,
      }),
    ).toBeDisabled();
    const pendingStatuses = within(importedStatus).getAllByRole("status");
    expect(pendingStatuses).toHaveLength(2);
    expect(pendingStatuses[0]).toHaveTextContent(
      /saving publishing configuration to your repository/i,
    );
    expect(pendingStatuses[1]).toHaveTextContent(
      /opening a review page on github/i,
    );
  });

  it("shows a retry action for failed imported app preparation", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_preparation_failed",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "READY",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        compatibilityStatus: "NEEDS_ADDITIONS",
        preparationMode: "PULL_REQUEST",
        preparationStatus: "FAILED",
        preparationErrorSummary: "GitHub API rate limit exceeded.",
      },
      artifact: null,
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const { container } = render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_preparation_failed" }),
      }),
    );

    const importedStatus = screen.getByRole("region", {
      name: /imported repository status/i,
    });
    expect(
      within(importedStatus).getByText(
        "Setup error: GitHub API rate limit exceeded.",
      ),
    ).toBeInTheDocument();
    expect(
      within(importedStatus).getByRole("button", {
        name: /retry publishing setup/i,
      }),
    ).toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll('input[name="preparationMode"]')).map(
        (input) => (input as HTMLInputElement).value,
      ),
    ).toEqual(["PULL_REQUEST"]);
  });

  it("shows publish actions for committed imported apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_ready",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryDefaultBranch: "trunk",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "READY",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        preparationStatus: "COMMITTED",
      },
      artifact: {
        id: "artifact-import-ready",
      },
      publishAttempts: [],
      publishSetupChecks: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_ready" }),
      }),
    );

    expect(
      screen.getByRole("button", { name: /publish to azure/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Syncing Your Local Code")).toBeInTheDocument();
    expect(
      screen.getByText(/still connected to the original source/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "git remote add portal https://github.com/cedarville-it/campus-dashboard",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("git fetch portal")).toBeInTheDocument();
    expect(screen.getByText("git pull portal trunk")).toBeInTheDocument();
    expect(screen.getByText("git push portal HEAD:trunk")).toBeInTheDocument();
    expect(
      screen.queryByText(
        /publishing is unavailable until the publishing setup has been applied/i,
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /copy codex handoff prompt/i }),
    );

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining(
          "git remote add portal https://github.com/cedarville-it/campus-dashboard",
        ),
      );
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("git pull portal trunk"),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("git push portal HEAD:trunk"),
    );
  });

  it("hides publish actions for committed imported apps until setup is ready", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_import_not_checked",
      appName: "Campus Dashboard",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryDefaultBranch: "trunk",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "NOT_CHECKED",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      repositoryImport: {
        sourceRepositoryUrl: "https://github.com/example/campus-dashboard",
        importStatus: "SUCCEEDED",
        preparationStatus: "COMMITTED",
      },
      artifact: {
        id: "artifact-import-not-checked",
      },
      publishAttempts: [],
      publishSetupChecks: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_import_not_checked" }),
      }),
    );

    expect(
      screen.getByText(/publishing setup must be ready before you can publish/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /publish to azure/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /repair publishing setup/i }),
    ).not.toBeInTheDocument();
  });

  it("offers repair when publishing setup is blocked", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_setup_blocked",
      appName: "Campus Dashboard",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "BLOCKED",
      publishingSetupErrorSummary:
        "Azure resource group access could not be verified.",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      artifact: {
        id: "artifact-setup-blocked",
      },
      publishAttempts: [],
      publishSetupChecks: [
        {
          checkKey: "azure_resource_access",
          status: "FAIL",
          message: "The shared resource group was not found.",
        },
      ],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_setup_blocked" }),
      }),
    );

    const setupStatus = screen.getByRole("region", {
      name: /publishing setup status/i,
    });
    expect(
      within(setupStatus).getByText((_, element) =>
        element?.textContent === "Status: blocked",
      ),
    ).toBeInTheDocument();
    expect(
      within(setupStatus).getByText(/azure resource group access/i),
    ).toBeInTheDocument();
    expect(
      within(setupStatus).getByText((_, element) => {
        const text = element?.textContent?.replace(/\s+/g, " ").trim();
        return Boolean(
          element?.tagName === "LI" &&
            text?.includes("Azure hosting access: fail") &&
            text.includes("The shared resource group was not found."),
        );
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/publishing setup needs to be repaired before you can publish/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /publish to azure/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry publish/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /repair publishing setup/i }),
    ).toBeInTheDocument();
  });

  it("hides publish without a repair button while publishing setup is repairing", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_setup_repairing",
      appName: "Campus Dashboard",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "NOT_STARTED",
      publishingSetupStatus: "REPAIRING",
      publishingSetupErrorSummary: null,
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: null,
      artifact: {
        id: "artifact-setup-repairing",
      },
      publishAttempts: [],
      publishSetupChecks: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_setup_repairing" }),
      }),
    );

    expect(
      screen.getByText(/publishing setup needs to be repaired before you can publish/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /publish to azure/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /repair publishing setup/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Azure publish and workflow metadata when present", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_789",
      appName: "Campus Dashboard",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: "GitHub access is ready for @portalstaff.",
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      publishStatus: "DEPLOYING",
      publishUrl: "https://custom.example.edu",
      primaryPublishUrl:
        "https://app-campus-dashboard-clx9abc1.azurewebsites.net",
      azureWebAppName: "app-campus-dashboard-clx9abc1",
      publishErrorSummary: null,
      artifact: {
        id: "artifact-789",
      },
      publishAttempts: [
        {
          githubWorkflowRunUrl:
            "https://github.com/cedarville-it/campus-dashboard/actions/runs/123",
        },
      ],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_789" }),
      }),
    );

    expect(
      screen.getByText(/azure app: app-campus-dashboard-clx9abc1/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "https://custom.example.edu",
      }),
    ).toHaveAttribute("href", "https://custom.example.edu");
    expect(
      screen.getByRole("link", { name: /deployment log/i }),
    ).toHaveAttribute(
      "href",
      "https://github.com/cedarville-it/campus-dashboard/actions/runs/123",
    );
  });

  it("shows the stored repo bootstrap error as a repo setup note", async () => {
    mockUseFormStatus.mockReturnValue({ pending: true });
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_456",
      appName: "Campus Dashboard",
      repositoryStatus: "FAILED",
      repositoryAccessStatus: "NOT_REQUESTED",
      repositoryAccessNote: null,
      repositoryUrl: null,
      publishStatus: "NOT_STARTED",
      publishUrl: null,
      primaryPublishUrl: null,
      azureWebAppName: null,
      publishErrorSummary: "No GitHub App installation is configured for org \"cedarville-it\".",
      artifact: {
        id: "artifact-456",
      },
      publishAttempts: [],
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_456" }),
      }),
    );

    expect(screen.getByText(/repository setup failed/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download zip/i })).toHaveAttribute(
      "href",
      "/api/download/req_456",
    );
    expect(screen.getByText(/repo setup note:/i)).toBeInTheDocument();
    expect(screen.queryByText(/last publish note:/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retrying repository setup/i }),
    ).toBeDisabled();
    expect(
      screen
        .getAllByRole("status")
        .some((status) =>
          /retrying repository setup/i.test(status.textContent ?? ""),
        ),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: /copy codex handoff prompt/i }),
    ).not.toBeInTheDocument();
  });

  it("shows scoped deletion controls on the app details page", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_delete",
      userId: "user-123",
      appName: "Campus Dashboard",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      publishStatus: "SUCCEEDED",
      publishingSetupStatus: "READY",
      publishingSetupErrorSummary: null,
      publishUrl: "https://app-campus-dashboard.azurewebsites.net",
      primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
      azureWebAppName: "app-campus-dashboard-clx9abc1",
      azureDatabaseName: "db_campus_dashboard_clx9abc1",
      publishErrorSummary: null,
      artifact: {
        id: "artifact-delete",
      },
      publishAttempts: [],
      publishSetupChecks: [],
      repositoryImport: null,
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_delete" }),
      }),
    );

    expect(screen.getByText("Delete App")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/remove this app from the portal/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/delete github repository/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/delete azure deployment/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete selected resources/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText(
        /i understand that the checked items will be permanently deleted/i,
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /delete selected resources/i }),
    );

    expect(
      screen.getByRole("dialog", { name: /confirm app deletion/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/type delete to confirm/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^delete app$/i }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "delete" },
    });

    expect(
      screen.getByRole("button", { name: /^delete app$/i }),
    ).toBeEnabled();
  });

  it("hides scoped deletion controls for collaborators", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("collaborator-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_collab_delete_hidden",
      userId: "owner-123",
      appName: "Campus Dashboard",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      publishStatus: "SUCCEEDED",
      publishingSetupStatus: "READY",
      publishingSetupErrorSummary: null,
      publishUrl: "https://app-campus-dashboard.azurewebsites.net",
      primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
      azureWebAppName: "app-campus-dashboard-clx9abc1",
      azureDatabaseName: "db_campus_dashboard_clx9abc1",
      publishErrorSummary: null,
      artifact: {
        id: "artifact-delete-hidden",
      },
      publishAttempts: [],
      publishSetupChecks: [],
      repositoryImport: null,
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "collabdev",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_collab_delete_hidden" }),
      }),
    );

    expect(screen.queryByText("Delete App")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete selected resources/i }),
    ).not.toBeInTheDocument();
  });

  it("shows auto-deploy enablement for successfully published generated apps", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_push",
      appName: "Campus Dashboard",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      publishStatus: "SUCCEEDED",
      deploymentTarget: "Azure App Service",
      deploymentTriggerMode: "PORTAL_DISPATCH",
      publishingSetupStatus: "READY",
      publishingSetupErrorSummary: null,
      publishUrl: "https://app-campus-dashboard.azurewebsites.net",
      primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
      azureWebAppName: "app-campus-dashboard-clx9abc1",
      azureDatabaseName: "db_campus_dashboard_clx9abc1",
      publishErrorSummary: null,
      artifact: {
        id: "artifact-push",
      },
      publishAttempts: [],
      publishSetupChecks: [],
      repositoryImport: null,
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_push" }),
      }),
    );

    expect(screen.getByText("Deployment mode: manual publish")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /enable auto-deploy/i }),
    ).toBeInTheDocument();
  });

  it("shows legacy published apps with unchecked publishing setup as ready", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-123");
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "req_legacy_published",
      appName: "Campus Dashboard",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      repositoryAccessStatus: "GRANTED",
      repositoryAccessNote: null,
      repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      publishStatus: "SUCCEEDED",
      deploymentTarget: "Azure App Service",
      deploymentTriggerMode: "PORTAL_DISPATCH",
      publishingSetupStatus: "NOT_CHECKED",
      publishingSetupErrorSummary: null,
      publishUrl: "https://app-campus-dashboard.azurewebsites.net",
      primaryPublishUrl: "https://app-campus-dashboard.azurewebsites.net",
      azureWebAppName: "app-campus-dashboard-clx9abc1",
      azureDatabaseName: "db_campus_dashboard_clx9abc1",
      publishErrorSummary: null,
      artifact: {
        id: "artifact-legacy-published",
      },
      publishAttempts: [],
      publishSetupChecks: [],
      repositoryImport: null,
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "portalstaff",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await DownloadPage({
        params: Promise.resolve({ requestId: "req_legacy_published" }),
      }),
    );

    expect(
      screen.getByText((_, element) => element?.textContent === "Status: ready"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        (_, element) => element?.textContent === "Status: not checked",
      ),
    ).not.toBeInTheDocument();
  });
});
