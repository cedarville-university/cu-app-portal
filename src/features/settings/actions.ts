"use server";

import { revalidatePath } from "next/cache";
import { resolveCurrentUserId } from "@/features/app-requests/current-user";
import { parseNotificationPreferenceForm } from "@/features/notifications/preferences";
import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

export async function updateNotificationPreferencesAction(formData: FormData) {
  const userId = await resolveCurrentUserId();
  const preferences = parseNotificationPreferenceForm(formData);

  await prisma.notificationPreference.upsert({
    where: { userId },
    update: preferences,
    create: {
      userId,
      ...preferences,
    },
  });

  await recordAuditEvent("NOTIFICATION_PREFERENCES_UPDATED", {
    actorUserId: userId,
  });

  revalidatePath("/settings");
}
