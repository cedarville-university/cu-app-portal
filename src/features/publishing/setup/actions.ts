"use server";

import { revalidatePath } from "next/cache";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { getPublishingSetupRepairEligibility } from "@/features/publishing/eligibility";
import { prisma } from "@/lib/db";
import { repairPublishingSetup } from "./service";

function publishingSetupEligibilityError(
  reason: Exclude<
    ReturnType<typeof getPublishingSetupRepairEligibility>,
    { eligible: true }
  >["reason"],
) {
  switch (reason) {
    case "REPOSITORY_NOT_READY":
      return "Managed repository is not ready for publishing setup.";
    case "PREPARATION_NOT_COMMITTED":
      return "Imported repository preparation must be committed before publishing setup.";
    case "PUBLISH_STATUS_NOT_ALLOWED":
      return "Publishing setup cannot be changed while publishing is active or unavailable.";
    case "PUBLISHING_SETUP_IN_PROGRESS":
      return "Publishing setup is already being checked or repaired.";
    case "PUBLISHING_SETUP_ACTION_NOT_ALLOWED":
      return "Publishing setup cannot be started or repaired from its current state.";
    case "PUBLISHING_SETUP_NOT_READY":
      return "Publishing setup is not ready for this action.";
  }
}

function revalidatePublishingSetupViews(requestId: string) {
  for (const path of [
    "/apps",
    `/download/${requestId}`,
    `/onboarding/${requestId}`,
  ]) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error("Failed to revalidate publishing setup view.", {
        path,
        error,
      });
    }
  }
}

async function notifyIfPublishingSetupBlocked({
  requestId,
  actorUserId,
}: {
  requestId: string;
  actorUserId: string;
}) {
  try {
    const appRequest = await prisma.appRequest.findUnique({
      where: { id: requestId },
      select: { publishingSetupStatus: true },
    });

    if (appRequest?.publishingSetupStatus === "BLOCKED") {
      await safeNotifyAppEvent({
        appRequestId: requestId,
        eventKey: "PUBLISHING_SETUP_BLOCKED",
        actorUserId,
        directRecipientUserIds: [actorUserId],
      });
    }
  } catch (error) {
    console.error("Failed to inspect repaired publishing setup status.", {
      requestId,
      error,
    });
  }
}

export async function repairPublishingSetupAction(requestId: string) {
  const userId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await prisma.appRequest.findFirst({
    where: appAccessWhere(requestId, userId, isAdmin),
    include: { repositoryImport: true },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  const eligibility = getPublishingSetupRepairEligibility({
    sourceOfTruth: appRequest.sourceOfTruth,
    repositoryStatus: appRequest.repositoryStatus,
    preparationStatus: appRequest.repositoryImport?.preparationStatus,
    publishingSetupStatus: appRequest.publishingSetupStatus,
    publishStatus: appRequest.publishStatus,
  });
  if (!eligibility.eligible) {
    throw new Error(publishingSetupEligibilityError(eligibility.reason));
  }

  try {
    await repairPublishingSetup(requestId);
    await notifyIfPublishingSetupBlocked({
      requestId,
      actorUserId: userId,
    });
  } catch (error) {
    await notifyIfPublishingSetupBlocked({
      requestId,
      actorUserId: userId,
    });
    console.error("Publishing setup repair failed.", {
      requestId,
      error,
    });
  } finally {
    revalidatePublishingSetupViews(requestId);
  }
}
