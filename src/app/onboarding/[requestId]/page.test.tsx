import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
}));

vi.mock("@/features/repositories/actions", () => ({
  saveGitHubUsernameAndGrantAccessAction: vi.fn(),
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
    publishStatus: "NOT_STARTED",
    repositoryImport: null,
    user: { githubUsername: "owner-name" },
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>;
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppOnboardingPage generated apps", () => {
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
      include: { repositoryImport: true },
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
      include: { repositoryImport: true },
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
      screen.getByText(/github access failed for @collaborator-name/i),
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
      screen.getByText(/open this app's managed repository in codex/i),
    ).toBeInTheDocument();
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
