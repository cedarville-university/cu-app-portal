"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { userHasAdminRole } from "@/features/app-requests/access";
import { toSafePortalApiError } from "@/features/portal-api/errors";
import { reviewImportedAppLogin } from "./login-review";

export async function confirmLoginReviewAction(appId: string, _previous: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  try {
    const userId = await resolveCurrentUserId();
    await reviewImportedAppLogin({ userId, isAdmin: await userHasAdminRole(userId) }, {
      appId, commitSha: form.get("commitSha"),
      sourcePaths: String(form.get("sourcePaths") ?? "").split(/\r?\n/).map(path => path.trim()).filter(Boolean),
      checksConfirmed: form.get("checksConfirmed") === "on",
    });
    revalidatePath(`/onboarding/${appId}`);
    revalidatePath(`/download/${appId}`);
    revalidatePath(`/admin/apps/${appId}`);
    return { error: null };
  } catch (error) {
    return { error: toSafePortalApiError(error).message };
  }
}
