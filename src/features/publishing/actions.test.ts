import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  enablePushToDeployAction,
  publishToAzureAction,
  retryPublishAction,
} from "./actions";
import { queuePublishForActor } from "./queue-publish";
import { retryPublishForActor } from "./retry-publish";

const mockGithub = vi.hoisted(() => ({
  readRepositoryTextFiles: vi.fn(),
  getBranchHead: vi.fn(),
  commitFiles: vi.fn(),
}));

const manualWorkflow = `name: Deploy to Azure App Service

on:
  workflow_dispatch:

env:
  AZURE_WEBAPP_NAME: \${{ secrets.AZURE_WEBAPP_NAME }}
  DEPLOY_PACKAGE_PATH: release

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v3
`;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/app-requests/current-user", () => ({
  resolveCurrentUserId: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/features/repositories/config", () => ({
  loadGitHubAppConfig: vi.fn(() => ({
    appId: "123",
    privateKey: "private-key",
    allowedOrgs: ["cedarville-it"],
    defaultOrg: "cedarville-it",
    defaultRepoVisibility: "private",
    installationIdsByOrg: { "cedarville-it": "456" },
  })),
}));
vi.mock("@/features/repositories/github-app", () => ({
  createGitHubAppClient: vi.fn(() => mockGithub),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: { findFirst: vi.fn(), update: vi.fn() },
    userRole: { findFirst: vi.fn() },
  },
}));
vi.mock("./queue-publish", () => ({ queuePublishForActor: vi.fn() }));
vi.mock("./retry-publish", () => ({ retryPublishForActor: vi.fn() }));

describe("publishing action adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveCurrentUserId).mockResolvedValue("actor-123");
    vi.mocked(queuePublishForActor).mockResolvedValue({
      attemptId: "attempt-123",
      status: "QUEUED",
    });
    vi.mocked(retryPublishForActor).mockResolvedValue({
      attemptId: "attempt-456",
      status: "QUEUED",
    });
    vi.mocked(prisma.userRole.findFirst).mockResolvedValue(null);
    mockGithub.readRepositoryTextFiles.mockResolvedValue({
      ".github/workflows/deploy-azure-app-service.yml": manualWorkflow,
    });
    mockGithub.getBranchHead.mockResolvedValue({ sha: "head-sha" });
    mockGithub.commitFiles.mockResolvedValue({ commitSha: "commit-sha" });
  });

  it("adapts explicit browser publish to the actor-aware queue service", async () => {
    await publishToAzureAction("request-123");

    expect(queuePublishForActor).toHaveBeenCalledWith({
      requestId: "request-123",
      actorUserId: "actor-123",
      source: "portal-ui",
    });
    expect(retryPublishForActor).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding/request-123");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
  });

  it("adapts explicit browser retry to the separate actor-aware retry service", async () => {
    await retryPublishAction("request-123");

    expect(retryPublishForActor).toHaveBeenCalledWith({
      requestId: "request-123",
      actorUserId: "actor-123",
      source: "portal-ui",
    });
    expect(queuePublishForActor).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/download/request-123");
    expect(revalidatePath).toHaveBeenCalledWith("/onboarding/request-123");
    expect(revalidatePath).toHaveBeenCalledWith("/apps");
  });

  it("does not revalidate when the shared service rejects the request", async () => {
    vi.mocked(queuePublishForActor).mockRejectedValue(
      new Error("App request not found."),
    );

    await expect(publishToAzureAction("request-123")).rejects.toThrow(
      "App request not found.",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects push-to-deploy before a successful publish", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      publishStatus: "NOT_STARTED",
      deploymentTarget: "Azure App Service",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(enablePushToDeployAction("request-123")).rejects.toThrow(
      "Push-to-deploy can only be enabled after a successful publish.",
    );
    expect(mockGithub.readRepositoryTextFiles).not.toHaveBeenCalled();
  });

  it("rejects push-to-deploy for imported repositories", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      sourceOfTruth: "IMPORTED_REPOSITORY",
      repositoryStatus: "READY",
      publishStatus: "SUCCEEDED",
      deploymentTarget: "Azure App Service",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await expect(enablePushToDeployAction("request-123")).rejects.toThrow(
      "Push-to-deploy is only available for generated template apps.",
    );
    expect(mockGithub.readRepositoryTextFiles).not.toHaveBeenCalled();
  });

  it("commits a push trigger to the managed repository workflow", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      publishStatus: "SUCCEEDED",
      deploymentTarget: "Azure App Service",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      deploymentTriggerMode: "PORTAL_DISPATCH",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);

    await enablePushToDeployAction("request-123");

    expect(createGitHubAppClient).toHaveBeenCalledWith({
      appId: "123",
      privateKey: "private-key",
      installationId: "456",
    });
    expect(mockGithub.readRepositoryTextFiles).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      ref: "main",
      paths: [".github/workflows/deploy-azure-app-service.yml"],
    });
    expect(mockGithub.getBranchHead).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      branch: "main",
    });
    expect(mockGithub.commitFiles).toHaveBeenCalledWith({
      owner: "cedarville-it",
      name: "campus-dashboard",
      branch: "main",
      message: "Enable push-to-deploy",
      expectedHeadSha: "head-sha",
      files: {
        ".github/workflows/deploy-azure-app-service.yml": expect.stringContaining(
          "push:\n    branches:\n      - main",
        ),
      },
    });
    expect(prisma.appRequest.update).toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: {
        deploymentTriggerMode: "PUSH_TO_DEPLOY",
        publishErrorSummary: null,
      },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith(
      "PUSH_TO_DEPLOY_ENABLED",
      expect.objectContaining({
        requestId: "request-123",
        repository: "cedarville-it/campus-dashboard",
        commitSha: "commit-sha",
      }),
    );
  });

  it("refuses to overwrite unrecognized workflow content", async () => {
    vi.mocked(prisma.appRequest.findFirst).mockResolvedValue({
      id: "request-123",
      userId: "user-123",
      sourceOfTruth: "PORTAL_MANAGED_REPO",
      repositoryStatus: "READY",
      publishStatus: "SUCCEEDED",
      deploymentTarget: "Azure App Service",
      repositoryOwner: "cedarville-it",
      repositoryName: "campus-dashboard",
      repositoryDefaultBranch: "main",
      deploymentTriggerMode: "PORTAL_DISPATCH",
    } as Awaited<ReturnType<typeof prisma.appRequest.findFirst>>);
    mockGithub.readRepositoryTextFiles.mockResolvedValue({
      ".github/workflows/deploy-azure-app-service.yml": "name: Custom\n",
    });

    await expect(enablePushToDeployAction("request-123")).rejects.toThrow(
      "Deployment workflow is not a recognized portal-managed Azure workflow.",
    );
    expect(mockGithub.commitFiles).not.toHaveBeenCalled();
    expect(prisma.appRequest.update).not.toHaveBeenCalledWith({
      where: { id: "request-123" },
      data: expect.objectContaining({ deploymentTriggerMode: "PUSH_TO_DEPLOY" }),
    });
  });
});
