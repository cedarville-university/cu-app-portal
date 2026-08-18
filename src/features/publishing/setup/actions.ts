"use server";

import { revalidatePath } from "next/cache";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { safeNotifyAppEvent } from "@/features/notifications/safe-notify";
import { prisma } from "@/lib/db";
import { repairPublishingSetup } from "./service";

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
  });

  if (!appRequest) {
    throw new Error("App request not found.");
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
