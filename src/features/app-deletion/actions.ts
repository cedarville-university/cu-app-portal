"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  canDeleteApp,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { deleteArtifact } from "@/features/generation/storage";
import { recordAuditEvent, type AuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  deleteAzureDeployment,
  deleteManagedGitHubRepository,
  type DeleteAzureDeploymentInput,
} from "./external";

type DeleteTargets = {
  portal: boolean;
  github: boolean;
  azure: boolean;
};

function isChecked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function parseDeleteTargets(formData: FormData): DeleteTargets {
  if (!isChecked(formData, "confirmDelete")) {
    throw new Error("Confirm deletion before continuing.");
  }

  const targets = {
    portal: isChecked(formData, "deletePortal"),
    github: isChecked(formData, "deleteGithub"),
    azure: isChecked(formData, "deleteAzure"),
  };

  if (!targets.portal && !targets.github && !targets.azure) {
    throw new Error("Choose at least one app resource to delete.");
  }

  return targets;
}

function parseDeletionReturnPath(formData: FormData) {
  const returnTo = formData.get("returnTo");

  return returnTo === "/admin" ? "/admin" : "/apps";
}

async function loadDeletableAppRequest(requestId: string) {
  const actorUserId = await resolveCurrentUserId();
  const actorIsAdmin = await userHasAdminRole(actorUserId);

  if (!(await canDeleteApp(actorUserId, requestId))) {
    throw new Error("App request not found.");
  }

  const appRequest = await prisma.appRequest.findFirst({
    where: actorIsAdmin
      ? { id: requestId }
      : { id: requestId, userId: actorUserId },
    include: {
      artifact: true,
    },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return { appRequest, actorUserId, actorIsAdmin };
}

async function recordDeletionAudit(
  event: AuditEvent,
  details: Record<string, unknown>,
) {
  try {
    await recordAuditEvent(event, details);
  } catch (error) {
    console.error("Failed to record app deletion audit event.", {
      event,
      error,
    });
  }
}

function revalidateDeletionViews(requestId: string) {
  try {
    revalidatePath("/apps");
    revalidatePath(`/download/${requestId}`);
  } catch (error) {
    console.error("Failed to revalidate app deletion views.", error);
  }
}

function assertGitHubDeletionDetails(appRequest: {
  repositoryOwner: string | null;
  repositoryName: string | null;
}): asserts appRequest is {
  repositoryOwner: string;
  repositoryName: string;
} {
  if (!appRequest.repositoryOwner || !appRequest.repositoryName) {
    throw new Error("GitHub repository details are missing for this app.");
  }
}

function assertAzureDeletionDetails(appRequest: {
  azureWebAppName: string | null;
  azureDatabaseName: string | null;
}): asserts appRequest is {
  azureWebAppName: string | null;
  azureDatabaseName: string | null;
} {
  if (!appRequest.azureWebAppName && !appRequest.azureDatabaseName) {
    throw new Error("Azure deployment details are missing for this app.");
  }
}

async function markExternalDeletions(
  requestId: string,
  completed: Pick<DeleteTargets, "github" | "azure">,
) {
  const data: Record<string, unknown> = {};

  if (completed.github) {
    Object.assign(data, {
      repositoryStatus: "DELETED",
      repositoryUrl: null,
      repositoryDefaultBranch: null,
      repositoryVisibility: null,
      repositoryAccessStatus: "NOT_REQUESTED",
      repositoryAccessNote: null,
    });
  }

  if (completed.azure) {
    Object.assign(data, {
      publishStatus: "DELETED",
      publishUrl: null,
      publishErrorSummary: null,
      azureWebAppName: null,
      azureDatabaseName: null,
      azureDefaultHostName: null,
      customDomain: null,
      primaryPublishUrl: null,
    });
  }

  if (Object.keys(data).length === 0) {
    return;
  }

  await prisma.appRequest.update({
    where: { id: requestId },
    data,
  });
}

async function deletePortalRecord(appRequest: {
  id: string;
  artifact: { storagePath: string } | null;
}) {
  if (appRequest.artifact?.storagePath) {
    await deleteArtifact(appRequest.artifact.storagePath);
  }

  await prisma.$transaction(async (tx) => {
    await tx.publishAttempt.deleteMany({
      where: { appRequestId: appRequest.id },
    });
    await tx.generatedArtifact.deleteMany({
      where: { appRequestId: appRequest.id },
    });
    await tx.appRequest.delete({
      where: { id: appRequest.id },
    });
  });
}

export async function deleteAppAction(requestId: string, formData: FormData) {
  const targets = parseDeleteTargets(formData);
  const returnPath = parseDeletionReturnPath(formData);
  const { appRequest, actorUserId, actorIsAdmin } =
    await loadDeletableAppRequest(requestId);
  const adminInitiated = actorIsAdmin && appRequest.userId !== actorUserId;
  let githubRepository: { owner: string; name: string } | null = null;
  let azureDeployment: DeleteAzureDeploymentInput | null = null;
  const completed = {
    github: false,
    azure: false,
  };
  let redirectToApps = false;

  if (targets.github) {
    assertGitHubDeletionDetails(appRequest);
    githubRepository = {
      owner: appRequest.repositoryOwner,
      name: appRequest.repositoryName,
    };
  }

  if (targets.azure) {
    assertAzureDeletionDetails(appRequest);
    azureDeployment = {
      resourceGroup: appRequest.azureResourceGroup,
      webAppName: appRequest.azureWebAppName,
      postgresServer: appRequest.azurePostgresServer,
      databaseName: appRequest.azureDatabaseName,
      primaryPublishUrl: appRequest.primaryPublishUrl,
      repositoryOwner: appRequest.repositoryOwner,
      repositoryName: appRequest.repositoryName,
      repositoryDefaultBranch: appRequest.repositoryDefaultBranch ?? null,
    };
  }

  await recordDeletionAudit("APP_DELETION_REQUESTED", {
    requestId,
    supportReference: appRequest.supportReference,
    deletePortal: targets.portal,
    deleteGithub: targets.github,
    deleteAzure: targets.azure,
    actorUserId,
    adminInitiated,
  });

  try {
    if (githubRepository) {
      await deleteManagedGitHubRepository(githubRepository);
      completed.github = true;
    }

    if (azureDeployment) {
      await deleteAzureDeployment(azureDeployment);
      completed.azure = true;
    }

    if (targets.portal) {
      await deletePortalRecord(appRequest);
      redirectToApps = true;
    } else {
      await markExternalDeletions(requestId, completed);
    }

    await recordDeletionAudit("APP_DELETION_SUCCEEDED", {
      requestId,
      supportReference: appRequest.supportReference,
      deletedPortal: targets.portal,
      deletedGithub: completed.github,
      deletedAzure: completed.azure,
      actorUserId,
      adminInitiated,
    });
  } catch (error) {
    await markExternalDeletions(requestId, completed).catch((updateError) => {
      console.error("Failed to persist partial app deletion state.", {
        requestId,
        updateError,
      });
    });

    await recordDeletionAudit("APP_DELETION_FAILED", {
      requestId,
      supportReference: appRequest.supportReference,
      deletePortal: targets.portal,
      deletedGithub: completed.github,
      deletedAzure: completed.azure,
      error: error instanceof Error ? error.message : "unknown",
      actorUserId,
      adminInitiated,
    });

    throw error;
  } finally {
    revalidateDeletionViews(requestId);
  }

  if (redirectToApps) {
    redirect(returnPath);
  }
}
