"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { repairPublishingSetupForActor } from "./repair-publishing-setup";

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

export async function repairPublishingSetupAction(requestId: string) {
  const actorUserId = await resolveCurrentUserId();
  await repairPublishingSetupForActor({
    requestId,
    actorUserId,
    source: "portal-ui",
  });
  revalidatePublishingSetupViews(requestId);
}
