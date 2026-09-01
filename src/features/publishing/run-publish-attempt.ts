import { DefaultAzureCredential } from "@azure/identity";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createAzureArmClient } from "./azure/arm-client";
import { loadAzurePublishConfig } from "./azure/config";
import { createMicrosoftGraphClient } from "./azure/graph-client";
import { createAzurePublishRuntime } from "./azure/runtime";
import {
  classifyPublishingSetupError,
  type PublishingSetupCheckKey,
} from "./setup/status";

export type ProvisionedPublishTarget = {
  azureResourceGroup: string;
  azureAppServicePlan: string;
  azureWebAppName: string;
  azurePostgresServer: string;
  azureDatabaseName: string | null;
  azureKeyVaultName: string | null;
  azureKeyVaultUri: string | null;
  azureDefaultHostName: string;
  primaryPublishUrl: string;
};

export type DeploymentRun = {
  publishUrl: string;
  githubWorkflowRunId: string;
  githubWorkflowRunUrl: string;
};

export type AuthorizeProviderMutation = () => Promise<void>;

export type ProvisionInfrastructureOptions = {
  authorizeProviderMutation?: AuthorizeProviderMutation;
};

export type DeployRepositoryOptions = {
  authorizeProviderMutation?: AuthorizeProviderMutation;
  onSetupStep?: (step: PublishingSetupCheckKey) => void;
  onWorkflowDispatched?: () => void;
};

export type VerificationResult = {
  verifiedAt: Date;
};

export type PublishRuntime = {
  provisionInfrastructure: (
    appRequestId: string,
    options?: ProvisionInfrastructureOptions,
  ) => Promise<ProvisionedPublishTarget>;
  deployRepository: (
    appRequestId: string,
    options?: DeployRepositoryOptions,
  ) => Promise<DeploymentRun>;
  verifyDeployment: (publishUrl: string) => Promise<VerificationResult>;
};

function createAzureTokenProvider(scope: string) {
  const credential = new DefaultAzureCredential();

  return async () => {
    const token = await credential.getToken(scope);

    if (!token?.token) {
      throw new Error(`Azure token was not available for scope ${scope}.`);
    }

    return token.token;
  };
}

function createDefaultRuntime() {
  const config = loadAzurePublishConfig();
  const githubConfig = loadGitHubAppConfig();
  const installationId =
    githubConfig.installationIdsByOrg[githubConfig.defaultOrg];

  if (!installationId) {
    throw new Error(
      `No GitHub App installation is configured for org "${githubConfig.defaultOrg}".`,
    );
  }

  return createAzurePublishRuntime({
    config,
    prisma,
    arm: createAzureArmClient({
      subscriptionId: config.azureSubscriptionId,
      tokenProvider: createAzureTokenProvider(
        "https://management.azure.com/.default",
      ),
    }),
    graph: createMicrosoftGraphClient({
      tokenProvider: createAzureTokenProvider(
        "https://graph.microsoft.com/.default",
      ),
    }),
    github: createGitHubAppClient({
      appId: githubConfig.appId,
      privateKey: githubConfig.privateKey,
      installationId,
    }),
  });
}

function logPublishWorker(event: string, details: Record<string, unknown>) {
  console.info("[publish-worker]", event, details);
}

const PUBLISH_AUTHORIZATION_FAILURE_SUMMARY =
  "Publishing stopped because app access could not be confirmed.";
const POST_DISPATCH_FAILURE_SUMMARY =
  "Publishing failed after deployment started. Try again or share the support reference with the portal support team.";

class PublishAuthorizationError extends Error {
  constructor() {
    super(PUBLISH_AUTHORIZATION_FAILURE_SUMMARY);
    this.name = "PublishAuthorizationError";
  }
}

function guardedAuthorization(
  authorizeProviderMutation?: AuthorizeProviderMutation,
): AuthorizeProviderMutation | undefined {
  if (!authorizeProviderMutation) {
    return undefined;
  }

  return async () => {
    try {
      await authorizeProviderMutation();
    } catch {
      throw new PublishAuthorizationError();
    }
  };
}

export async function runPublishAttempt(
  attemptId: string,
  runtime?: PublishRuntime,
  authorizeProviderMutation?: AuthorizeProviderMutation,
) {
  const attempt = await prisma.publishAttempt.findUnique({
    where: { id: attemptId },
    include: {
      appRequest: true,
    },
  });

  if (!attempt) {
    throw new Error(`Publish attempt "${attemptId}" was not found.`);
  }

  await prisma.publishAttempt.update({
    where: { id: attemptId },
    data: {
      status: "RUNNING",
      stage: "PROVISIONING",
      startedAt: new Date(),
    },
  });

  await prisma.appRequest.update({
    where: { id: attempt.appRequestId },
    data: {
      publishStatus: "PROVISIONING",
      publishErrorSummary: null,
    },
  });

  logPublishWorker("started", {
    publishAttemptId: attemptId,
    requestId: attempt.appRequestId,
  });

  let deploymentDispatchMayHaveStarted = false;
  let currentSetupStep: PublishingSetupCheckKey = "azure_resource_access";
  const authorizeMutation = guardedAuthorization(authorizeProviderMutation);

  try {
    const effectiveRuntime = runtime ?? createDefaultRuntime();

    logPublishWorker("provisioning started", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
    });

    await authorizeMutation?.();
    const publishTarget = await effectiveRuntime.provisionInfrastructure(
      attempt.appRequestId,
      { authorizeProviderMutation: authorizeMutation },
    );

    logPublishWorker("provisioning completed", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      azureResourceGroup: publishTarget.azureResourceGroup,
      azureWebAppName: publishTarget.azureWebAppName,
      primaryPublishUrl: publishTarget.primaryPublishUrl,
    });

    await prisma.appRequest.update({
      where: { id: attempt.appRequestId },
      data: publishTarget,
    });

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        stage: "DEPLOYING",
      },
    });

    await prisma.appRequest.update({
      where: { id: attempt.appRequestId },
      data: {
        publishStatus: "DEPLOYING",
      },
    });

    logPublishWorker("deployment started", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
    });

    await authorizeMutation?.();
    const deployment = await effectiveRuntime.deployRepository(
      attempt.appRequestId,
      {
        authorizeProviderMutation: authorizeMutation,
        onSetupStep: (step) => {
          currentSetupStep = step;
        },
        onWorkflowDispatched: () => {
          deploymentDispatchMayHaveStarted = true;
        },
      },
    );

    logPublishWorker("deployment completed", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      publishUrl: deployment.publishUrl,
      githubWorkflowRunId: deployment.githubWorkflowRunId,
      githubWorkflowRunUrl: deployment.githubWorkflowRunUrl,
    });

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        githubWorkflowRunId: deployment.githubWorkflowRunId,
        githubWorkflowRunUrl: deployment.githubWorkflowRunUrl,
        deploymentStartedAt: new Date(),
      },
    });

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        stage: "VERIFYING",
      },
    });

    logPublishWorker("verification started", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      publishUrl: deployment.publishUrl,
    });

    const verification = await effectiveRuntime.verifyDeployment(
      deployment.publishUrl,
    );

    logPublishWorker("verification completed", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      verifiedAt: verification.verifiedAt,
    });

    const completedAt = new Date();

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        status: "SUCCEEDED",
        stage: "COMPLETED",
        finishedAt: completedAt,
        verifiedAt: verification.verifiedAt,
      },
    });

    await prisma.appRequest.update({
      where: { id: attempt.appRequestId },
      data: {
        publishStatus: "SUCCEEDED",
        publishUrl: deployment.publishUrl,
        publishErrorSummary: null,
        publishingSetupStatus: "READY",
        publishingSetupErrorSummary: null,
        lastPublishedAt: completedAt,
      },
    });

    logPublishWorker("succeeded", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      publishUrl: deployment.publishUrl,
    });

    await recordAuditEvent("PUBLISH_SUCCEEDED", {
      requestId: attempt.appRequestId,
      publishAttemptId: attemptId,
      publishUrl: deployment.publishUrl,
    });
    await safeNotifyAppEvent({
      appRequestId: attempt.appRequestId,
      eventKey: "PUBLISH_SUCCEEDED",
    });
  } catch (error) {
    const authorizationFailed = error instanceof PublishAuthorizationError;
    const setupFailure = deploymentDispatchMayHaveStarted || authorizationFailed
      ? null
      : classifyPublishingSetupError({
          step: currentSetupStep,
          error,
        });
    const safeErrorSummary = authorizationFailed
      ? PUBLISH_AUTHORIZATION_FAILURE_SUMMARY
      : setupFailure
        ? `Publishing setup failed: ${setupFailure.summary}`
        : POST_DISPATCH_FAILURE_SUMMARY;
    const appRequestFailureData = setupFailure
      ? {
          publishStatus: "FAILED" as const,
          publishErrorSummary: safeErrorSummary,
          publishingSetupStatus: setupFailure.setupStatus,
          publishingSetupErrorSummary: setupFailure.summary,
        }
      : {
          publishStatus: "FAILED" as const,
          publishErrorSummary: safeErrorSummary,
        };
    const finishedAt = new Date();

    console.error("[publish-worker]", "failed", {
      publishAttemptId: attemptId,
      requestId: attempt.appRequestId,
      errorSummary: safeErrorSummary,
    });

    await prisma.publishAttempt.update({
      where: { id: attemptId },
      data: {
        status: "FAILED",
        stage: "FAILED",
        errorSummary: safeErrorSummary,
        finishedAt,
      },
    });

    await prisma.appRequest.update({
      where: { id: attempt.appRequestId },
      data: appRequestFailureData,
    });

    await recordAuditEvent("PUBLISH_FAILED", {
      requestId: attempt.appRequestId,
      publishAttemptId: attemptId,
      error: safeErrorSummary,
    });
    await safeNotifyAppEvent({
      appRequestId: attempt.appRequestId,
      eventKey: "PUBLISH_FAILED",
    });

    if (setupFailure?.setupStatus === "NEEDS_REPAIR") {
      await safeNotifyAppEvent({
        appRequestId: attempt.appRequestId,
        eventKey: "PUBLISHING_SETUP_NEEDS_REPAIR",
      });
    }

    if (setupFailure?.setupStatus === "BLOCKED") {
      await safeNotifyAppEvent({
        appRequestId: attempt.appRequestId,
        eventKey: "PUBLISHING_SETUP_BLOCKED",
      });
    }

    throw new Error(safeErrorSummary);
  }
}
