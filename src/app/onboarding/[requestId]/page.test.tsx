import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppOnboardingPage from "./page";

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

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
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
    auditLog: {
      findFirst: vi.fn(),
    },
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

function generatedApp(
  overrides: Record<string, unknown> = {},
): Awaited<ReturnType<typeof prisma.appRequest.findFirst>> {
  return {
    id: "req_123",
    userId: "owner-123",
    appName: "Campus Dashboard",
    sourceOfTruth: "PORTAL_MANAGED_REPO",
    submittedConfig: {},
    supportReference: "SUP-20260818-ABC123",
    repositoryStatus: "READY",
    repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
    repositoryDefaultBranch: "main",
    repositoryAccessStatus: "NOT_REQUESTED",
    repositoryAccessNote: null,
    publishingSetupStatus: "NOT_CHECKED",
    publishingSetupErrorSummary: null,
    publishStatus: "NOT_STARTED",
    publishErrorSummary: null,
    primaryPublishUrl: null,
    publishUrl: null,
    publishAttempts: [],
    publishSetupChecks: [],
    repositoryImport: null,
    user: { githubUsername: "owner-name" },
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>;
}

function importedApp(
  overrides: Record<string, unknown> = {},
): Awaited<ReturnType<typeof prisma.appRequest.findFirst>> {
  return generatedApp({
    sourceOfTruth: "IMPORTED_REPOSITORY",
    repositoryImport: {
      id: "import_123",
      sourceRepositoryUrl:
        "https://github.com/external-org/campus-dashboard",
      importStatus: "SUCCEEDED",
      importErrorSummary: null,
      compatibilityStatus: "COMPATIBLE",
      preparationStatus: "PENDING_USER_CHOICE",
      preparationMode: null,
      preparationPullRequestUrl: null,
      preparationErrorSummary: null,
    },
    ...overrides,
  });
}

async function renderPage(
  searchParams: Record<string, string | undefined> = {},
) {
  render(
    await AppOnboardingPage({
      params: Promise.resolve({ requestId: "req_123" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  mockUseFormStatus.mockReturnValue({ pending: false });
  vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("collaborator-123");
  vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    githubUsername: "collaborator-name",
  } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
  vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(generatedApp());
  vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppOnboardingPage generated apps", () => {
  it("shows automatic Code-stage progress while the repository is pending", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryStatus: "PENDING",
        repositoryUrl: null,
      }),
    );

    await renderPage();

    const progress = screen.getByRole("list", { name: /app setup progress/i });
    expect(within(progress).getByText("Code")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      screen.getByRole("heading", {
        name: /the portal is creating your app's code home/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/usually finishes within a few minutes/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /checks the code home automatically/i,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByText(/technical details for support/i).closest("details"),
    ).not.toHaveAttribute("open");
    expect(screen.getByText("SUP-20260818-ABC123")).toBeInTheDocument();
  });

  it("offers only a safe repository retry after repository setup fails", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryStatus: "FAILED",
        repositoryUrl: null,
        publishErrorSummary:
          "GitHub App installation 404 for cedarville-it; provider request gh-raw-123.",
      }),
    );

    await renderPage();

    const progress = screen.getByRole("list", { name: /app setup progress/i });
    expect(within(progress).getByText("Code")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(
      screen.getByRole("heading", {
        name: /the app's code home needs another try/i,
      }),
    ).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/your starter and saved request are safe/i);
    expect(alert).not.toHaveTextContent(/github|installation|gh-raw-123/i);
    expect(
      screen.getByText(
        /create or reconnect that private code home using the saved starter/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not publish your app or delete its saved work/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/moves to the next safe code step automatically/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try code-home setup again" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByLabelText("GitHub username")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /publish|publishing setup/i }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/gh-raw-123|installation 404/i);
    expect(screen.getByText("SUP-20260818-ABC123")).toBeInTheDocument();
  });

  it("uses the signed-in actor's GitHub username rather than the app owner's", async () => {
    await renderPage({ path: "customize", account: "existing" });

    expect(screen.getByDisplayValue("collaborator-name")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("owner-name")).not.toBeInTheDocument();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "collaborator-123" },
      select: { githubUsername: true },
    });
    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
      where: {
        id: "req_123",
        OR: [
          { userId: "collaborator-123" },
          { collaborators: { some: { userId: "collaborator-123" } } },
        ],
      },
      include: {
        repositoryImport: true,
        publishAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        publishSetupChecks: {
          orderBy: { checkedAt: "desc" },
          take: 7,
        },
      },
    });
  });

  it("uses an admin actor's GitHub username without changing admin access", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("admin-123");
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "admin-123",
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "admin-name",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    await renderPage({ path: "customize", account: "existing" });

    expect(screen.getByDisplayValue("admin-name")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("owner-name")).not.toBeInTheDocument();
    expect(prisma.appRequest.findFirst).toHaveBeenCalledWith({
      where: { id: "req_123" },
      include: {
        repositoryImport: true,
        publishAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        publishSetupChecks: {
          orderBy: { checkedAt: "desc" },
          take: 7,
        },
      },
    });
  });

  it("does not treat the owner's granted GitHub status as collaborator access", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: "GitHub access is ready for @owner-name.",
      }),
    );

    await renderPage({ path: "customize" });

    expect(screen.getByDisplayValue("collaborator-name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send repository invite/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Publish to Azure" }),
    ).not.toBeInTheDocument();
  });

  it("does not show the owner's failed GitHub access or retry to a collaborator", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryAccessStatus: "FAILED",
        repositoryAccessNote:
          "GitHub access failed for @owner-name: GitHub could not find that account.",
      }),
    );

    await renderPage({ path: "customize" });

    expect(screen.getByDisplayValue("collaborator-name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send repository invite/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/github could not find that account/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /try github access again/i }),
    ).not.toBeInTheDocument();
  });

  it("uses the collaborator's durable outcome after another actor overwrites the shared columns", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryAccessStatus: "FAILED",
        repositoryAccessNote:
          "GitHub access failed for @owner-name: secret=owner-provider-detail",
      }),
    );
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue({
      event: "REPOSITORY_ACCESS_SUCCEEDED",
      details: {
        requestId: "req_123",
        actorUserId: "collaborator-123",
        githubUsername: "collaborator-name",
        accessStatus: "GRANTED",
      },
    } as Awaited<ReturnType<typeof prisma.auditLog.findFirst>>);

    await renderPage({ path: "customize" });

    expect(
      screen.getByRole("heading", { name: /customize your app with codex/i }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/owner-name|owner-provider-detail/i);
  });

  it("renders only the actor-safe failure summary from a durable failed outcome", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: "GitHub access is ready for @owner-name.",
      }),
    );
    vi.mocked(prisma.auditLog.findFirst).mockResolvedValue({
      event: "REPOSITORY_ACCESS_FAILED",
      details: {
        requestId: "req_123",
        actorUserId: "collaborator-123",
        githubUsername: "collaborator-name",
        accessStatus: "FAILED",
        safeSummary: "secret=provider-detail&token=raw-token",
      },
    } as Awaited<ReturnType<typeof prisma.auditLog.findFirst>>);

    await renderPage({ path: "customize" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not confirm repository access for @collaborator-name/i,
    );
    expect(document.body).not.toHaveTextContent(
      /owner-name|provider-detail|raw-token|secret=/i,
    );
    expect(
      screen.getByRole("button", { name: /try github access again/i }),
    ).toBeInTheDocument();
  });

  it("lets a generated-app user publish the starter or customize it first", async () => {
    await renderPage();

    expect(
      screen.getByRole("button", { name: /publish the starter now/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /customize it with codex first/i }),
    ).toHaveAttribute("href", "/onboarding/req_123?path=customize");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows the path choice before using a legacy granted-access status", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote:
          "GitHub access is ready for @collaborator-name.",
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("button", { name: /publish the starter now/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /customize it with codex first/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Publish to Azure" }),
    ).not.toBeInTheDocument();
  });

  it("publishes the starter without requiring GitHub access", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({ repositoryAccessStatus: "INVITED" }),
    );

    await renderPage({ path: "starter" });

    expect(
      screen.getByRole("button", { name: "Publish to Azure" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("GitHub username")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/accept the invitation on github/i),
    ).not.toBeInTheDocument();
  });

  it("ignores unsupported generated path values", async () => {
    await renderPage({ path: "surprise" });

    expect(
      screen.getByRole("button", { name: /publish the starter now/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /customize it with codex first/i }),
    ).toBeInTheDocument();
  });

  it("gives distinct account paths while preserving the customize choice", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    await renderPage({ path: "customize" });

    expect(
      screen.getByRole("link", { name: "I already have a GitHub account" }),
    ).toHaveAttribute(
      "href",
      "/onboarding/req_123?path=customize&account=existing",
    );
    expect(
      screen.getByRole("link", { name: "I need to create one" }),
    ).toHaveAttribute(
      "href",
      "/onboarding/req_123?path=customize&account=new",
    );
    expect(screen.queryByLabelText("GitHub username")).not.toBeInTheDocument();
  });

  it("explains how to create an account and return to the username form", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    await renderPage({ path: "customize", account: "new" });

    expect(
      screen.getByRole("link", { name: /create a github account/i }),
    ).toHaveAttribute("href", "https://github.com/signup");
    expect(
      screen.getByText(/return to this browser tab after github confirms/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "I created my account" }),
    ).toHaveAttribute(
      "href",
      "/onboarding/req_123?path=customize&account=existing",
    );
    expect(screen.queryByLabelText("GitHub username")).not.toBeInTheDocument();
  });

  it("lets an invited actor ask GitHub to confirm accepted access", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryAccessStatus: "INVITED",
        repositoryAccessNote:
          "GitHub invited @collaborator-name to this repository.",
      }),
    );

    await renderPage({ path: "customize" });

    expect(
      screen.getByRole("link", { name: /open your github invitation/i }),
    ).toHaveAttribute(
      "href",
      "https://github.com/cedarville-it/campus-dashboard",
    );
    expect(
      screen.getByText(/accept the invitation on github/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "I've accepted the invitation" }),
    ).toBeInTheDocument();
  });

  it("shows the saved access failure and lets the actor retry", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryAccessStatus: "FAILED",
        repositoryAccessNote:
          "GitHub access failed for @collaborator-name: GitHub could not find that account.",
      }),
    );

    await renderPage({ path: "customize" });

    expect(
      screen.getByText(
        /could not confirm repository access for @collaborator-name/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try github access again/i }),
    ).toBeInTheDocument();
  });

  it("gives an actor with access the beginner Codex prompt and publish action", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      generatedApp({
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote:
          "GitHub access is ready for @collaborator-name.",
      }),
    );

    await renderPage({ path: "customize" });

    expect(
      screen.getByText(/create a local codex project first/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Before opening Codex" }),
    ).toBeInTheDocument();
    const checklist = screen.getByRole("region", {
      name: "Before opening Codex",
    });
    expect(within(checklist).getByText(/company portal/i)).toBeInTheDocument();
    expect(within(checklist).getByText(/cedarnet 2\.0/i)).toBeInTheDocument();
    expect(
      within(checklist).getByText(
        (_, element) =>
          element?.tagName === "LI" &&
          /new, empty folder named.*campus dashboard/i.test(
            element.textContent ?? "",
          ),
      ),
    ).toBeInTheDocument();
    expect(
      within(checklist).getByText(/make it the primary folder/i),
    ).toBeInTheDocument();
    expect(
      within(checklist).getByText(/do not use quick chat/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /how to add a local codex project/i }),
    ).toHaveAttribute("href", "https://learn.chatgpt.com/docs/projects");
    expect(
      screen.getByRole("button", { name: /copy codex handoff prompt/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the person i am helping is a beginner/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Publish to Azure" }),
    ).toBeInTheDocument();
  });
});

describe("AppOnboardingPage imported and local preparation", () => {
  it("offers only direct preparation while an imported app awaits a choice", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(importedApp());

    await renderPage();

    expect(
      screen.getByRole("button", { name: "Prepare my app for publishing" }),
    ).toBeInTheDocument();
    expect(document.querySelector('input[name="preparationMode"]')).toHaveValue(
      "DIRECT_COMMIT",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("checks preparation progress automatically without offering a stale action", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      importedApp({
        repositoryImport: {
          ...importedApp().repositoryImport,
          preparationStatus: "RUNNING",
          preparationMode: "DIRECT_COMMIT",
        },
      }),
    );

    await renderPage();

    expect(screen.getByRole("status")).toHaveTextContent(
      /checking your app automatically/i,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("retries a failed preparation with its stored prior mode only", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      importedApp({
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote:
          "GitHub access is ready for @collaborator-name.",
        repositoryImport: {
          ...importedApp().repositoryImport,
          preparationStatus: "FAILED",
          preparationMode: "PULL_REQUEST",
          preparationErrorSummary: "GitHub was temporarily unavailable.",
        },
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("button", { name: "Try preparation again" }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/github was temporarily unavailable/i);
    expect(document.querySelector('input[name="preparationMode"]')).toHaveValue(
      "PULL_REQUEST",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("does not offer a pull-request retry using another actor's GitHub access", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      importedApp({
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: "GitHub access is ready for @owner-name.",
        repositoryImport: {
          ...importedApp().repositoryImport,
          preparationStatus: "FAILED",
          preparationMode: "PULL_REQUEST",
          preparationErrorSummary: "GitHub was temporarily unavailable.",
        },
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("button", { name: /send repository invite/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try preparation again" }),
    ).not.toBeInTheDocument();
  });

  it("requires current-actor GitHub access before offering conflict review", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      importedApp({
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote: "GitHub access is ready for @owner-name.",
        repositoryImport: {
          ...importedApp().repositoryImport,
          compatibilityStatus: "CONFLICTED",
          preparationStatus: "BLOCKED",
          preparationErrorSummary:
            "Existing publishing files need a safe review.",
        },
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("button", { name: /send repository invite/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open a safe review on GitHub" }),
    ).not.toBeInTheDocument();
  });

  it("offers only a safe GitHub review for an accessible conflict", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      importedApp({
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote:
          "GitHub access is ready for @collaborator-name.",
        repositoryImport: {
          ...importedApp().repositoryImport,
          compatibilityStatus: "CONFLICTED",
          preparationStatus: "BLOCKED",
          preparationErrorSummary:
            "Existing publishing files need a safe review.",
        },
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("button", { name: "Open a safe review on GitHub" }),
    ).toBeInTheDocument();
    expect(document.querySelector('input[name="preparationMode"]')).toHaveValue(
      "PULL_REQUEST",
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows the opened review and only verifies after the user approves it", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      importedApp({
        repositoryImport: {
          ...importedApp().repositoryImport,
          preparationStatus: "PULL_REQUEST_OPENED",
          preparationMode: "PULL_REQUEST",
          preparationPullRequestUrl:
            "https://github.com/cedarville-it/campus-dashboard/pull/12",
        },
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("link", { name: "Open the GitHub review" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/cedarville-it/campus-dashboard/pull/12",
    );
    expect(
      screen.getByRole("button", { name: "I've approved the changes" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("gives a local app the beginner upload prompt before direct preparation", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      importedApp({
        submittedConfig: { localOnlySource: true },
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote:
          "GitHub access is ready for @collaborator-name.",
      }),
    );

    await renderPage();

    expect(
      screen.getByText(/connect the local "campus dashboard" project/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Before opening Codex" }),
    ).toBeInTheDocument();
    const checklist = screen.getByRole("region", {
      name: "Before opening Codex",
    });
    expect(within(checklist).getByText(/company portal/i)).toBeInTheDocument();
    expect(within(checklist).getByText(/cedarnet 2\.0/i)).toBeInTheDocument();
    expect(
      within(checklist).getByText(/folder that already contains your app/i),
    ).toBeInTheDocument();
    expect(
      within(checklist).getByText(/make it the primary folder/i),
    ).toBeInTheDocument();
    expect(
      within(checklist).getByText(/do not use quick chat/i),
    ).toBeInTheDocument();
    expect(
      within(checklist).queryByText(
        (_, element) =>
          element?.tagName === "LI" &&
          /new, empty folder named.*campus dashboard/i.test(
            element.textContent ?? "",
          ),
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "My code has been uploaded" }),
    ).toBeInTheDocument();
    expect(document.querySelector('input[name="preparationMode"]')).toHaveValue(
      "DIRECT_COMMIT",
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("returns an incompatible local app to Codex repair and upload guidance", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      importedApp({
        submittedConfig: { localOnlySource: true },
        repositoryAccessStatus: "GRANTED",
        repositoryAccessNote:
          "GitHub access is ready for @collaborator-name.",
        repositoryImport: {
          ...importedApp().repositoryImport,
          compatibilityStatus: "UNSUPPORTED",
          preparationStatus: "PENDING_USER_CHOICE",
          preparationMode: "DIRECT_COMMIT",
          preparationErrorSummary:
            "The app needs a supported start command before Azure can publish it.",
        },
      }),
    );

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /needs repair before publishing/i,
    );
    expect(document.body).not.toHaveTextContent(/supported start command/i);
    expect(
      screen.getByText(/repair the app before confirming another upload/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "I've repaired and uploaded my code",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /tell me that I can return to the Cedarville App Portal myself and tell me to select "I've repaired and uploaded my code" myself/i,
      ),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      /Do not use Browser, Computer Use, Chrome, plugins, or connectors to access the Cedarville App Portal/i,
    );
    expect(
      screen.queryByRole("button", { name: "Try preparation again" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('input[name="preparationMode"]')).toHaveValue(
      "DIRECT_COMMIT",
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("restarts a failed import from the original source without reusing its partial target", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      importedApp({
        repositoryStatus: "FAILED",
        repositoryUrl: null,
        repositoryImport: {
          ...importedApp().repositoryImport,
          importStatus: "FAILED",
          importErrorSummary: "GitHub stopped the repository copy.",
          preparationStatus: "BLOCKED",
        },
      }),
    );

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /managed copy did not finish/i,
    );
    expect(document.body).not.toHaveTextContent(/github stopped the repository copy/i);
    expect(
      screen.getByRole("link", {
        name: "Start again with this repository",
      }),
    ).toHaveAttribute(
      "href",
      "/apps/add?source=github&repositoryUrl=https%3A%2F%2Fgithub.com%2Fexternal-org%2Fcampus-dashboard&appName=Campus%20Dashboard",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("AppOnboardingPage publishing setup and recovery", () => {
  function preparedImportedApp(overrides: Record<string, unknown> = {}) {
    return importedApp({
      repositoryImport: {
        ...importedApp().repositoryImport,
        preparationStatus: "COMMITTED",
        preparationMode: "DIRECT_COMMIT",
      },
      ...overrides,
    });
  }

  it("finishes imported publishing setup before offering publish", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({ publishingSetupStatus: "NOT_CHECKED" }),
    );

    await renderPage();

    expect(
      screen.getByRole("button", { name: "Finish publishing setup" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Publish to Azure" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it.each(["CHECKING", "REPAIRING"])(
    "checks %s publishing setup automatically without a stale action",
    async (publishingSetupStatus) => {
      vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
        preparedImportedApp({ publishingSetupStatus }),
      );

      await renderPage();

      expect(screen.getByRole("status")).toHaveTextContent(
        /checks this page automatically/i,
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    },
  );

  it.each(["NEEDS_REPAIR", "BLOCKED"])(
    "offers only safe setup repair when publishing setup is %s",
    async (publishingSetupStatus) => {
      vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
        preparedImportedApp({
          publishingSetupStatus,
          publishingSetupErrorSummary:
            "Azure App Service PUT failed: secret=provider-detail.",
          publishSetupChecks: [
            {
              id: "check-123",
              appRequestId: "req_123",
              checkKey: "github_actions_secrets",
              status: "FAIL",
              message:
                "Azure response body secret=provider-check-detail&token=raw-check-token",
              metadata: { requestId: "provider-request-123?sig=raw-signature" },
              checkedAt: new Date("2026-08-18T18:00:00Z"),
              createdAt: new Date("2026-08-18T18:00:00Z"),
              updatedAt: new Date("2026-08-18T18:00:00Z"),
            },
          ],
        }),
      );

      await renderPage();

      expect(screen.getByRole("alert")).toHaveTextContent(
        /publishing setup needs attention/i,
      );
      expect(screen.getByRole("alert")).not.toHaveTextContent(
        /azure app service|provider-detail/i,
      );
      expect(document.body.innerHTML).not.toMatch(
        /azure app service put|provider-detail|provider-check-detail|raw-check-token|raw-signature|secret=|token=/i,
      );
      expect(
        screen.getByRole("button", { name: "Fix publishing setup" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Publish to Azure" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Try publishing again" }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(
        screen.getByText("github_actions_secrets"),
      ).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(/provider-request-123/i);
      expect(screen.getByText("SUP-20260818-ABC123")).toBeInTheDocument();
    },
  );

  it("shows raw publishing diagnostics only to an admin", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("admin-123");
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue({
      id: "role-123",
      userId: "admin-123",
      role: "ADMIN",
      createdAt: new Date("2026-08-18T12:00:00Z"),
      updatedAt: new Date("2026-08-18T12:00:00Z"),
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      githubUsername: "admin-name",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary:
          "Azure response body secret=admin-provider-detail",
        publishSetupChecks: [
          {
            id: "check-123",
            appRequestId: "req_123",
            checkKey: "azure_resource_access",
            status: "FAIL",
            message: "Admin diagnostic requestId=admin-raw-123",
            metadata: { requestId: "admin-provider-request" },
            checkedAt: new Date("2026-08-18T18:00:00Z"),
            createdAt: new Date("2026-08-18T18:00:00Z"),
            updatedAt: new Date("2026-08-18T18:00:00Z"),
          },
        ],
      }),
    );

    await renderPage();

    expect(document.body).toHaveTextContent("admin-provider-detail");
    expect(document.body).toHaveTextContent("admin-raw-123");
    expect(document.body).toHaveTextContent("admin-provider-request");
  });

  it("offers initial publish only after imported setup is ready", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({ publishingSetupStatus: "READY" }),
    );

    await renderPage();

    expect(
      screen.getByRole("button", { name: "Publish to Azure" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Finish publishing setup" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Fix publishing setup" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it.each(["QUEUED", "PROVISIONING", "DEPLOYING"])(
    "shows automatic progress and a deployment log while publish is %s",
    async (publishStatus) => {
      vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
        preparedImportedApp({
          publishingSetupStatus: "READY",
          publishStatus,
          publishAttempts: [
            {
              id: "attempt-123",
              appRequestId: "req_123",
              status: publishStatus,
              stage: publishStatus,
              errorSummary: null,
              startedAt: new Date("2026-08-18T18:00:00Z"),
              githubWorkflowRunId: "456",
              githubWorkflowRunUrl:
                "https://github.com/cedarville-it/campus-dashboard/actions/runs/456",
              deploymentStartedAt: null,
              verifiedAt: null,
              finishedAt: null,
              createdAt: new Date("2026-08-18T18:00:00Z"),
            },
          ],
        }),
      );

      await renderPage();

      expect(screen.getByRole("status")).toHaveTextContent(
        /checks publishing progress automatically/i,
      );
      expect(
        screen.getByRole("link", { name: "Open deployment log" }),
      ).toHaveAttribute(
        "href",
        "https://github.com/cedarville-it/campus-dashboard/actions/runs/456",
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    },
  );

  it("offers valid publish recovery with user-safe error details", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({
        publishingSetupStatus: "NEEDS_REPAIR",
        publishingSetupErrorSummary:
          "GitHub Actions OIDC subject mismatch: refs/heads/main.",
        publishStatus: "FAILED",
        publishErrorSummary:
          "Azure ARM 403 AuthorizationFailed for subscription 0000.",
      }),
    );

    await renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /publishing did not complete/i,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /app code and saved work are still safe/i,
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      /azure|authorizationfailed|github actions|oidc/i,
    );
    expect(document.body).not.toHaveTextContent(
      /authorizationfailed|subscription 0000|oidc subject|refs\/heads\/main/i,
    );
    expect(screen.getByText("SUP-20260818-ABC123")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try publishing again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fix publishing setup" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Publish to Azure" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("offers only publish retry when failed publishing setup is already ready", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({
        publishingSetupStatus: "READY",
        publishStatus: "FAILED",
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("button", { name: "Try publishing again" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Fix publishing setup" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("does not offer an invalid retry while setup repair is still running", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({
        publishingSetupStatus: "REPAIRING",
        publishStatus: "FAILED",
        publishErrorSummary: "The last publish did not finish.",
      }),
    );

    await renderPage();

    expect(
      screen.queryByRole("button", { name: "Try publishing again" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /checks this page automatically/i,
    );
  });

  it("waits without mutations when a failed publish has a pending repository", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({
        repositoryStatus: "PENDING",
        publishingSetupStatus: "READY",
        publishStatus: "FAILED",
        publishErrorSummary: "Provider job failed with correlation id raw-123.",
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("heading", { name: /code home is still being prepared/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /checks repository progress automatically/i,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /publishing|setup/i }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/correlation id raw-123/i);
    expect(screen.getByText("SUP-20260818-ABC123")).toBeInTheDocument();
  });

  it("offers support without mutations when a failed publish has a failed repository", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({
        repositoryStatus: "FAILED",
        publishingSetupStatus: "NEEDS_REPAIR",
        publishStatus: "FAILED",
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("heading", { name: /code home needs support/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no repair or publish will start/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to My Apps" })).toHaveAttribute(
      "href",
      "/apps",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("returns an uncommitted imported app to its stored preparation recovery", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({
        publishStatus: "FAILED",
        publishingSetupStatus: "READY",
        repositoryImport: {
          ...preparedImportedApp().repositoryImport,
          preparationStatus: "FAILED",
          preparationMode: "DIRECT_COMMIT",
          preparationErrorSummary: "Preparation stopped before committing.",
        },
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("button", { name: "Try preparation again" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try publishing again" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Fix publishing setup" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("hands a successfully published app to its full details page", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({
        publishingSetupStatus: "READY",
        publishStatus: "SUCCEEDED",
        primaryPublishUrl: "https://campus-dashboard.azurewebsites.net",
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("heading", { name: /your app is online/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open app details" }),
    ).toHaveAttribute("href", "/download/req_123");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers no mutation after a deployment has been removed", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue(
      preparedImportedApp({
        publishingSetupStatus: "READY",
        publishStatus: "DELETED",
      }),
    );

    await renderPage();

    expect(
      screen.getByRole("heading", { name: /no longer published/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to My Apps" })).toHaveAttribute(
      "href",
      "/apps",
    );
    expect(screen.getByText(/contact the portal support team/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
