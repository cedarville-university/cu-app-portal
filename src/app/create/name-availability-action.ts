"use server";

import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { isAppNameAvailable } from "@/features/app-requests/app-name";

export async function checkAppNameAvailability(appName: string): Promise<boolean> {
  await resolveCurrentUserId();
  return isAppNameAvailable(appName);
}
