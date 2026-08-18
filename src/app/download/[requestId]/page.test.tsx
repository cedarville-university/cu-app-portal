import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
}));

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

vi.mock("@/features/env-vars/env-vars-panel", () => ({
  EnvVarsPanel: () => <div />,
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
  },
}));

import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { prisma } from "@/lib/db";

function appRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-123",
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DownloadPage publishing recovery", () => {
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
    },
  );

  it("keeps setup repair absent when setup is already ready", async () => {
    await renderPage({ publishingSetupStatus: "READY" });

    expect(
      screen.getByRole("button", { name: "Retry Publish" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Repair Publishing Setup" }),
    ).not.toBeInTheDocument();
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
