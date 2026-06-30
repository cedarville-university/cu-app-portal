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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      displayName: true,
      email: true,
      githubUsername: true,
    },
  });

  if (!user) {
    redirect("/");
  }

  const preferences = savedPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES;

  return (
    <main>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage account preferences for your Cedarville App Portal account.</p>
      </div>

      <section className="card" style={{ maxWidth: "760px" }}>
        <form action={updateNotificationPreferencesAction} className="form-stack">
          <section className="form-stack" aria-labelledby="account-settings-title">
            <h2
              id="account-settings-title"
              style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}
            >
              Account
            </h2>
            <div className="status-table">
              <div className="status-row">
                <span className="status-row__label">Name</span>
                <span>{user.displayName}</span>
              </div>
              <div className="status-row">
                <span className="status-row__label">Email</span>
                <span>{user.email}</span>
              </div>
            </div>
            <label className="form-stack" style={{ gap: "0.375rem" }}>
              <span>GitHub username</span>
              <input
                className="form-control"
                name="githubUsername"
                type="text"
                defaultValue={user.githubUsername ?? ""}
                placeholder="octocat"
                autoComplete="username"
              />
            </label>
          </section>

          <section
            className="form-stack"
            aria-labelledby="notification-settings-title"
            style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}
          >
            <h2
              id="notification-settings-title"
              style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}
            >
              Notification Preferences
            </h2>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              Choose which portal updates are sent to {user.email}.
            </p>

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
          </section>

          <div>
            <PendingSubmitButton
              idleLabel="Save Settings"
              pendingLabel="Saving..."
              statusText="Saving your settings."
              variant="primary-solid"
            />
          </div>
        </form>
      </section>
    </main>
  );
}
