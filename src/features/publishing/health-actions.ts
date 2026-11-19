"use server";

import { revalidatePath } from "next/cache";
import { loadAccessibleAppRequest } from "@/features/app-requests/access";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { checkAppHealth } from "./app-health";

export async function checkAppHealthAction(requestId: string): Promise<void> {
  const actorUserId = await resolveCurrentUserId();
  const app = await loadAccessibleAppRequest(requestId, actorUserId);
  if (!app) throw new Error("App request not found.");
  await checkAppHealth(requestId, actorUserId);
  revalidatePath(`/download/${requestId}`);
  revalidatePath(`/onboarding/${requestId}`);
  revalidatePath(`/admin/apps/${requestId}`);
  revalidatePath("/apps");
}
