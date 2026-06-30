"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { parseNotificationPreferenceForm } from "@/features/notifications/preferences";
import { parseGitHubUsername } from "@/features/repositories/access";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

function parseOptionalGitHubUsername(formData: FormData) {
  const rawValue = formData.get("githubUsername");

  if (rawValue == null || String(rawValue).trim().length === 0) {
    return null;
  }

  return parseGitHubUsername(rawValue);
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const userId = await resolveCurrentUserId();
  const preferences = parseNotificationPreferenceForm(formData);
  const githubUsername = parseOptionalGitHubUsername(formData);

  await prisma.user.update({
    where: { id: userId },
    data: { githubUsername },
  });

  await prisma.notificationPreference.upsert({
    where: { userId },
    update: preferences,
    create: {
      userId,
      ...preferences,
    },
  });

  try {
    await recordAuditEvent("NOTIFICATION_PREFERENCES_UPDATED", {
      actorUserId: userId,
    });
  } catch {
    // Preference updates should not fail if best-effort audit logging is unavailable.
  }

  revalidatePath("/settings");
}
