"use server";

import { revalidatePath } from "next/cache";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { loadGitHubAppConfig } from "@/features/repositories/config";
import { createGitHubAppClient } from "@/features/repositories/github-app";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { supportsPostSuccessPushToDeploy } from "./providers";
import { queuePublishForActor } from "./queue-publish";
import { retryPublishForActor } from "./retry-publish";
import {
  AZURE_DEPLOY_WORKFLOW_PATH,
  enablePushTriggerForAzureWorkflow,
} from "./workflow-triggers";

async function loadAccessibleAppRequest(requestId: string) {
  const userId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, userId, isAdmin),
    include: {
      repositoryImport: true,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return appRequest;
}

function revalidatePublishViews(requestId: string) {
  try {
    revalidatePath(`/download/${requestId}`);
    revalidatePath(`/onboarding/${requestId}`);
    revalidatePath("/apps");
  } catch (error) {
    console.error("Failed to revalidate publish views.", error);
  }
}

function createGitHubClientForOwner(owner: string) {
  const config = loadGitHubAppConfig();
  const installationId = config.installationIdsByOrg[owner];

  if (!installationId) {
    throw new Error(`No GitHub App installation is configured for org "${owner}".`);
  }

  return createGitHubAppClient({
    appId: config.appId,
    privateKey: config.privateKey,
    installationId,
  });
}

export async function publishToAzureAction(requestId: string) {
  const actorUserId = await resolveCurrentUserId();
  await queuePublishForActor({
    requestId,
    actorUserId,
    source: "portal-ui",
  });
  revalidatePublishViews(requestId);
}

export async function retryPublishAction(requestId: string) {
  const actorUserId = await resolveCurrentUserId();
  await retryPublishForActor({
    requestId,
    actorUserId,
    source: "portal-ui",
  });
  revalidatePublishViews(requestId);
}

export async function enablePushToDeployAction(requestId: string) {
  const appRequest = await loadAccessibleAppRequest(requestId);

  if (appRequest.sourceOfTruth !== "PORTAL_MANAGED_REPO") {
    throw new Error(
      "Push-to-deploy is only available for generated template apps.",
    );
  }

  if (appRequest.repositoryStatus !== "READY") {
    throw new Error("Managed repository is not ready for push-to-deploy.");
  }

  if (appRequest.publishStatus !== "SUCCEEDED") {
    throw new Error(
      "Push-to-deploy can only be enabled after a successful publish.",
    );
  }

  if (
    !appRequest.deploymentTarget ||
    !supportsPostSuccessPushToDeploy(appRequest.deploymentTarget)
  ) {
    throw new Error(
      `Push-to-deploy is not supported for ${
        appRequest.deploymentTarget ?? "this hosting target"
      }.`,
    );
  }

  if (
    !appRequest.repositoryOwner ||
    !appRequest.repositoryName ||
    !appRequest.repositoryDefaultBranch
  ) {
    throw new Error("Managed repository metadata is incomplete.");
  }

  if (appRequest.deploymentTriggerMode === "PUSH_TO_DEPLOY") {
    return;
  }

  const owner = appRequest.repositoryOwner;
  const name = appRequest.repositoryName;
  const branch = appRequest.repositoryDefaultBranch;
  const github = createGitHubClientForOwner(owner);
  const files = await github.readRepositoryTextFiles({
    owner,
    name,
    ref: branch,
    paths: [AZURE_DEPLOY_WORKFLOW_PATH],
  });
  const workflow = files[AZURE_DEPLOY_WORKFLOW_PATH];

  if (!workflow) {
    throw new Error("Deployment workflow was not found in the managed repository.");
  }

  const patched = enablePushTriggerForAzureWorkflow(workflow, branch);
  let commitSha: string | null = null;

  if (patched.changed) {
    const head = await github.getBranchHead({ owner, name, branch });
    const commit = await github.commitFiles({
      owner,
      name,
      branch,
      message: "Enable push-to-deploy",
      expectedHeadSha: head.sha,
      files: {
        [AZURE_DEPLOY_WORKFLOW_PATH]: patched.content,
      },
    });
    commitSha = commit.commitSha;
  }

  await prisma.appRequest.update({
    where: { id: requestId },
    data: {
      deploymentTriggerMode: "PUSH_TO_DEPLOY",
      publishErrorSummary: null,
    },
  });

  await recordAuditEvent("PUSH_TO_DEPLOY_ENABLED", {
    requestId,
    repository: `${owner}/${name}`,
    commitSha,
  });

  revalidatePublishViews(requestId);
}
