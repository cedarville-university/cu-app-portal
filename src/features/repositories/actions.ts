"use server";

import { revalidatePath } from "next/cache";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import type { CreateAppRequestInput } from "@/features/app-requests/types";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { createAppSchema } from "@/features/create-app/validation";
import { buildSourceSnapshot } from "@/features/generation/build-source-snapshot";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { getTemplateBySlug } from "@/features/templates/catalog";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { grantManagedRepositoryAccess, parseGitHubUsername } from "./access";
import {
  buildSafeRepositoryAccessNote,
  persistRepositoryAccessOutcome,
} from "./actor-access";
import { bootstrapManagedRepository } from "./bootstrap-managed-repository";
import {
  REPOSITORY_SETUP_FAILURE_SUMMARY,
  SOURCE_GENERATION_FAILURE_SUMMARY,
} from "./failure-feedback";

async function loadAccessibleAppRequestForActor(requestId: string) {
  const actorUserId = await resolveCurrentUserId();
  const actorIsAdmin = await userHasAdminRole(actorUserId);
  const appRequest = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, actorUserId, actorIsAdmin),
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  return { appRequest, actorUserId };
}

function parseStoredCreateAppInput(
  submittedConfig: unknown,
): CreateAppRequestInput {
  if (
    !submittedConfig ||
    typeof submittedConfig !== "object" ||
    !("templateSlug" in submittedConfig) ||
    typeof submittedConfig.templateSlug !== "string"
  ) {
    throw new Error("Stored app request configuration is invalid.");
  }

  const template = getTemplateBySlug(submittedConfig.templateSlug);

  if (!template) {
    throw new Error("Stored app request template is no longer available.");
  }

  const parsed = createAppSchema({
    hostingTarget: template.hostingTarget,
    features: template.features,
  }).parse(submittedConfig);

  return {
    ...parsed,
    templateSlug: submittedConfig.templateSlug,
  };
}

export async function retryRepositoryBootstrapAction(requestId: string) {
  const { appRequest, actorUserId } =
    await loadAccessibleAppRequestForActor(requestId);

  if (appRequest.repositoryStatus !== "FAILED") {
    throw new Error("Only failed repository bootstraps can be retried.");
  }

  const attemptClaimedAt = new Date();
  const claim = await prisma.appRequest.updateMany({
    where: { id: requestId, repositoryStatus: "FAILED" },
    data: {
      repositoryStatus: "PENDING",
      publishErrorSummary: null,
      updatedAt: attemptClaimedAt,
    },
  });

  if (claim.count !== 1) {
    throw new Error("Repository setup is already being retried.");
  }

  await recordAuditEvent("REPOSITORY_BOOTSTRAP_REQUESTED", {
    requestId,
    supportReference: appRequest.supportReference,
    retried: true,
  });

  let input: CreateAppRequestInput;
  let files: Record<string, string>;

  try {
    input = parseStoredCreateAppInput(appRequest.submittedConfig);
    files = await buildSourceSnapshot(input);
  } catch (error) {
    console.error("Managed repository source regeneration failed", {
      requestId,
      supportReference: appRequest.supportReference,
      error,
    });

    const failed = await prisma.appRequest.updateMany({
      where: {
        id: requestId,
        repositoryStatus: "PENDING",
        updatedAt: attemptClaimedAt,
      },
      data: {
        generationStatus: "FAILED",
        repositoryStatus: "FAILED",
        publishErrorSummary: SOURCE_GENERATION_FAILURE_SUMMARY,
      },
    });
    if (failed.count === 1) {
      await recordAuditEvent("APP_REQUEST_FAILED", {
        requestId,
        supportReference: appRequest.supportReference,
        failureStage: "source-generation",
        safeSummary: SOURCE_GENERATION_FAILURE_SUMMARY,
        retried: true,
      });
    } else {
      console.warn(
        "Repository source-generation failure skipped after state changed",
        {
          requestId,
          supportReference: appRequest.supportReference,
        },
      );
    }
    revalidatePath(`/download/${requestId}`);
    revalidatePath(`/onboarding/${requestId}`);
    revalidatePath("/apps");
    return;
  }

  try {
    const repository = await bootstrapManagedRepository({
      appRequestId: requestId,
      input,
      files,
      reuseExistingRepository: true,
    });

    const completed = await prisma.appRequest.updateMany({
      where: {
        id: requestId,
        repositoryStatus: "PENDING",
        updatedAt: attemptClaimedAt,
      },
      data: {
        generationStatus: "SUCCEEDED",
        repositoryProvider: repository.provider,
        repositoryOwner: repository.owner,
        repositoryName: repository.name,
        repositoryUrl: repository.url,
        repositoryDefaultBranch: repository.defaultBranch,
        repositoryVisibility: repository.visibility,
        repositoryStatus: "READY",
        repositoryAccessStatus: "NOT_REQUESTED",
        repositoryAccessNote: null,
        publishErrorSummary: null,
      },
    });

    if (completed.count !== 1) {
      console.warn("Repository retry completion skipped after state changed", {
        requestId,
        supportReference: appRequest.supportReference,
      });
      revalidatePath(`/download/${requestId}`);
      revalidatePath(`/onboarding/${requestId}`);
      revalidatePath("/apps");
      return;
    }

    await recordAuditEvent("REPOSITORY_BOOTSTRAP_SUCCEEDED", {
      requestId,
      supportReference: appRequest.supportReference,
      repositoryUrl: repository.url,
      retried: true,
    });
    await safeNotifyAppEvent({
      appRequestId: requestId,
      eventKey: "REPOSITORY_READY",
      actorUserId,
      directRecipientUserIds: [actorUserId],
    });
  } catch (error) {
    console.error("Managed repository bootstrap retry failed", {
      requestId,
      supportReference: appRequest.supportReference,
      error,
    });

    const failed = await prisma.appRequest.updateMany({
      where: {
        id: requestId,
        repositoryStatus: "PENDING",
        updatedAt: attemptClaimedAt,
      },
      data: {
        repositoryStatus: "FAILED",
        publishErrorSummary: REPOSITORY_SETUP_FAILURE_SUMMARY,
      },
    });

    if (failed.count === 1) {
      await recordAuditEvent("REPOSITORY_BOOTSTRAP_FAILED", {
        requestId,
        supportReference: appRequest.supportReference,
        failureStage: "repository-bootstrap",
        safeSummary: REPOSITORY_SETUP_FAILURE_SUMMARY,
        retried: true,
      });
      await safeNotifyAppEvent({
        appRequestId: requestId,
        eventKey: "REPOSITORY_FAILED",
        actorUserId,
        directRecipientUserIds: [actorUserId],
      });
    } else {
      console.warn("Repository retry failure skipped after state changed", {
        requestId,
        supportReference: appRequest.supportReference,
      });
    }
  }

  revalidatePath(`/download/${requestId}`);
  revalidatePath(`/onboarding/${requestId}`);
  revalidatePath("/apps");
}

export async function saveGitHubUsernameAndGrantAccessAction(
  requestId: string,
  formData: FormData,
) {
  const { appRequest, actorUserId } =
    await loadAccessibleAppRequestForActor(requestId);

  if (
    appRequest.repositoryStatus !== "READY" ||
    !appRequest.repositoryOwner ||
    !appRequest.repositoryName
  ) {
    throw new Error("Managed repository is not ready for GitHub access grants.");
  }

  const githubUsername = parseGitHubUsername(formData.get("githubUsername"));

  await prisma.user.update({
    where: { id: actorUserId },
    data: { githubUsername },
  });

  await recordAuditEvent("REPOSITORY_ACCESS_REQUESTED", {
    requestId,
    actorUserId,
    supportReference: appRequest.supportReference,
    githubUsername,
    source: "portal-form",
  });

  let accessStatus: "INVITED" | "GRANTED" | "FAILED";

  try {
    const accessResult = await grantManagedRepositoryAccess({
      owner: appRequest.repositoryOwner,
      repositoryName: appRequest.repositoryName,
      githubUsername,
    });
    accessStatus = accessResult.status;
  } catch (error) {
    console.error("Managed repository access grant failed", {
      requestId,
      supportReference: appRequest.supportReference,
      githubUsername,
      error,
    });

    accessStatus = "FAILED";
  }

  const safeNote = buildSafeRepositoryAccessNote(accessStatus, githubUsername);

  try {
    await persistRepositoryAccessOutcome({
      requestId,
      actorUserId,
      githubUsername,
      status: accessStatus,
      supportReference: appRequest.supportReference,
      source: "portal-form",
    });
  } catch (error) {
    console.error("Repository access outcome persistence failed", {
      requestId,
      actorUserId,
      supportReference: appRequest.supportReference,
      error,
    });

    throw new Error(
      "The GitHub access result could not be saved. Please try again.",
    );
  }

  try {
    await prisma.appRequest.update({
      where: { id: requestId },
      data: {
        repositoryAccessStatus: accessStatus,
        repositoryAccessNote: safeNote,
      },
    });
  } catch (error) {
    console.error("Shared repository access status update failed", {
      requestId,
      actorUserId,
      supportReference: appRequest.supportReference,
      error,
    });
  }

  revalidatePath(`/download/${requestId}`);
  revalidatePath(`/onboarding/${requestId}`);
  revalidatePath("/apps");
}
