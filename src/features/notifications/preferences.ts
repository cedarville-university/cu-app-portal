import type { NotificationCategory } from "@prisma/client";

export type NotificationPreferenceSnapshot = {
  emailNotificationsEnabled: boolean;
  collaborationEmailsEnabled: boolean;
  appLifecycleEmailsEnabled: boolean;
  publishingEmailsEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceSnapshot =
  {
    emailNotificationsEnabled: true,
    collaborationEmailsEnabled: true,
    appLifecycleEmailsEnabled: true,
    publishingEmailsEnabled: true,
  };

export function canReceiveNotificationCategory(
  preference: NotificationPreferenceSnapshot | null | undefined,
  category: NotificationCategory,
) {
  const effective = preference ?? DEFAULT_NOTIFICATION_PREFERENCES;

  if (!effective.emailNotificationsEnabled) {
    return false;
  }

  if (category === "COLLABORATION") {
    return effective.collaborationEmailsEnabled;
  }

  if (category === "APP_LIFECYCLE") {
    return effective.appLifecycleEmailsEnabled;
  }

  return effective.publishingEmailsEnabled;
}

export function parseNotificationPreferenceForm(
  formData: FormData,
): NotificationPreferenceSnapshot {
  return {
    emailNotificationsEnabled:
      formData.get("emailNotificationsEnabled") === "on",
    collaborationEmailsEnabled:
      formData.get("collaborationEmailsEnabled") === "on",
    appLifecycleEmailsEnabled:
      formData.get("appLifecycleEmailsEnabled") === "on",
    publishingEmailsEnabled: formData.get("publishingEmailsEnabled") === "on",
  };
}
