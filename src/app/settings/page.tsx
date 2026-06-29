import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/features/notifications/preferences";
import { updateNotificationPreferencesAction } from "@/features/settings/actions";
import { prisma } from "@/lib/db";

export default async function SettingsPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  const savedPreferences = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  const preferences = savedPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES;

  return (
    <main>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage account preferences for your Cedarville App Portal account.</p>
      </div>

      <section className="card" style={{ maxWidth: "760px" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
          Notification Preferences
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Choose which portal updates are sent to your email address.
        </p>

        <form action={updateNotificationPreferencesAction} className="form-stack">
          <fieldset className="form-stack" style={{ border: 0, padding: 0 }}>
            <legend>Notification preferences</legend>

            <label>
              <input
                type="checkbox"
                name="emailNotificationsEnabled"
                defaultChecked={preferences.emailNotificationsEnabled}
              />{" "}
              Email notifications
            </label>

            <label>
              <input
                type="checkbox"
                name="collaborationEmailsEnabled"
                defaultChecked={preferences.collaborationEmailsEnabled}
              />{" "}
              Collaboration emails
            </label>

            <label>
              <input
                type="checkbox"
                name="appLifecycleEmailsEnabled"
                defaultChecked={preferences.appLifecycleEmailsEnabled}
              />{" "}
              App lifecycle emails
            </label>

            <label>
              <input
                type="checkbox"
                name="publishingEmailsEnabled"
                defaultChecked={preferences.publishingEmailsEnabled}
              />{" "}
              Publishing emails
            </label>
          </fieldset>

          <div>
            <PendingSubmitButton
              idleLabel="Save Preferences"
              pendingLabel="Saving..."
              statusText="Saving your notification preferences."
              variant="primary-solid"
            />
          </div>
        </form>
      </section>
    </main>
  );
}
