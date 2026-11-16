"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { getSafePortalReturnTo } from "@/features/auth/return-to";
import { githubUsernameSchema } from "@/features/repositories/access";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

export type GitHubProfileFormState = { error: string | null; username: string };

export async function saveGitHubProfileAction(
  _previousState: GitHubProfileFormState,
  formData: FormData,
): Promise<GitHubProfileFormState> {
  const returnTo = getSafePortalReturnTo(formData.get("returnTo"));
  const userId = await getCurrentUserIdOrNull();
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);

  const username = String(formData.get("githubUsername") ?? "");
  const parsed = githubUsernameSchema.safeParse(username);
  if (!parsed.success) return { username, error: parsed.error.issues[0]?.message ?? "Enter a valid GitHub username." };
  const githubUsername = parsed.data.toLowerCase();

  try {
    await prisma.user.update({ where: { id: userId }, data: { githubUsername } });
  } catch {
    return { username, error: "We couldn't save your GitHub username. Try again, or skip for now and add it in Settings later." };
  }
  try {
    await recordAuditEvent("USER_PROFILE_UPDATED", {
      actorUserId: userId, githubUsername, source: "portal-ui", operation: "save_github_profile",
    });
  } catch {
    // Audit is best-effort; a saved username should not block the user.
  }
  revalidatePath("/settings");
  redirect(returnTo);
}
