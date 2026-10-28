"use server";

import type { Prisma } from "@prisma/client";
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
  disablePushTriggerForAzureWorkflow,
} from "./workflow-triggers";

async function loadAccessibleAppRequest(
  requestId: string,
  db: Pick<Prisma.TransactionClient, "appRequest"> = prisma,
) {
  const userId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await db.appRequest.findFirst({
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
  return setPushToDeploy(requestId, true);
}

export async function disablePushToDeployAction(requestId: string) {
  return setPushToDeploy(requestId, false);
}

async function setPushToDeploy(requestId: string, enabled: boolean) {
  // Check access before locking, then check again under the lock. Publish queue
  // claims update this same row and must wait until the workflow and mode agree.
  await loadAccessibleAppRequest(requestId);
  const details = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AppRequest" WHERE id = ${requestId} FOR UPDATE`;
    return updatePushToDeploy(requestId, enabled, tx);
  }, { timeout: 60_000 });
  await recordAuditEvent(
    enabled ? "PUSH_TO_DEPLOY_ENABLED" : "PUSH_TO_DEPLOY_DISABLED",
    details,
  );
  revalidatePublishViews(requestId);
}

async function updatePushToDeploy(
  requestId: string,
  enabled: boolean,
  tx: Prisma.TransactionClient,
) {
  const appRequest = await loadAccessibleAppRequest(requestId, tx);

  if (
    !["PORTAL_MANAGED_REPO", "IMPORTED_REPOSITORY"].includes(appRequest.sourceOfTruth)
  ) {
    throw new Error(
      "Push-to-deploy is only available for managed repositories.",
    );
  }

  if (appRequest.repositoryStatus !== "READY") {
    throw new Error("Managed repository is not ready for push-to-deploy.");
  }

  if (["QUEUED", "PROVISIONING", "DEPLOYING"].includes(appRequest.publishStatus)) {
    throw new Error("Wait for the current publish to finish before changing auto-deploy.");
  }

  if (enabled && appRequest.publishStatus !== "SUCCEEDED") {
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

  const owner = appRequest.repositoryOwner;
  const name = appRequest.repositoryName;
  const branch = appRequest.repositoryDefaultBranch;
  const github = createGitHubClientForOwner(owner);
  const head = await github.getBranchHead({ owner, name, branch });
  const files = await github.readRepositoryTextFiles({
    owner,
    name,
    ref: head.sha,
    paths: [AZURE_DEPLOY_WORKFLOW_PATH],
  });
  const workflow = files[AZURE_DEPLOY_WORKFLOW_PATH];

  if (!workflow) {
    throw new Error("Deployment workflow was not found in the managed repository.");
  }

  const patched = enabled
    ? enablePushTriggerForAzureWorkflow(workflow, branch)
    : disablePushTriggerForAzureWorkflow(workflow);
  let commitSha: string | null = null;

  if (patched.changed) {
    const commit = await github.commitFiles({
      owner,
      name,
      branch,
      message: `${enabled ? "Enable" : "Disable"} push-to-deploy [skip ci]`,
      expectedHeadSha: head.sha,
      files: {
        [AZURE_DEPLOY_WORKFLOW_PATH]: patched.content,
      },
    });
    commitSha = commit.commitSha;
  }

  await tx.appRequest.update({
    where: { id: requestId },
    data: {
      deploymentTriggerMode: enabled ? "PUSH_TO_DEPLOY" : "PORTAL_DISPATCH",
    },
  });

  return { requestId, repository: `${owner}/${name}`, commitSha };
}
