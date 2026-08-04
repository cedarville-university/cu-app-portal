"use server";

import { revalidatePath } from "next/cache";
import {
  appAccessWhere,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function setPublicListingAction(
  appRequestId: string,
  isPubliclyListed: boolean,
  formData: FormData,
) {
  void formData;

  const userId = await resolveCurrentUserId();
  const isAdmin = await userHasAdminRole(userId);
  const appRequest = await prisma.appRequest.findFirst({
    where: appAccessWhere(appRequestId, userId, isAdmin),
    select: { id: true },
  });

  if (!appRequest) {
    throw new Error("App request not found.");
  }

  await prisma.appRequest.update({
    where: { id: appRequestId },
    data: { isPubliclyListed },
  });

  await recordAuditEvent("APP_PUBLIC_LISTING_UPDATED", {
    requestId: appRequestId,
    isPubliclyListed,
    actorUserId: userId,
  });

  revalidatePath(`/download/${appRequestId}`);
  revalidatePath("/apps/public");
}
