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
import { bootstrapManagedRepository } from "./bootstrap-managed-repository";
import {
  REPOSITORY_SETUP_FAILURE_SUMMARY,
  SOURCE_GENERATION_FAILURE_SUMMARY,
} from "./failure-feedback";
import { grantRepositoryAccessForActor } from "./grant-repository-access";
import { parseGitHubUsername } from "./access";

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
  const actorUserId = await resolveCurrentUserId();
  const githubUsername = parseGitHubUsername(
    String(formData.get("githubUsername") ?? ""),
  ).toLowerCase();
  await prisma.user.update({
    where: { id: actorUserId },
    data: { githubUsername },
  });
  await grantRepositoryAccessForActor({
    requestId,
    actorUserId,
    githubUsername,
    source: "portal-ui",
  });

  revalidatePath(`/download/${requestId}`);
  revalidatePath(`/onboarding/${requestId}`);
  revalidatePath("/apps");
}
