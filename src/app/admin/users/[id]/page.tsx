import Link from "next/link";
import React from "react";
import {
  grantAdminRoleAction,
  removeAdminRoleAction,
  updateUserGithubUsernameAction,
} from "@/features/admin/actions";
import { AdminNotAuthorized, getAdminUserIdOrNull } from "@/features/admin/guard";
import { createdDate, StatusBadge } from "@/features/admin/status";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { prisma } from "@/lib/db";

type AppSummary = {
  id: string;
  appName: string;
  generationStatus: string;
  repositoryStatus: string;
  publishStatus: string;
  createdAt: Date;
};

function AppSummaryList({
  apps,
  emptyMessage,
}: {
  apps: AppSummary[];
  emptyMessage: string;
}) {
  if (apps.length === 0) {
    return <p style={{ color: "var(--text-muted)", margin: 0 }}>{emptyMessage}</p>;
  }

  return (
    <div className="status-table">
      {apps.map((app) => (
        <div className="status-row" key={app.id}>
          <span className="status-row__label">
            <Link href={`/admin/apps/${app.id}`} className="meta-link">
              {app.appName}
            </Link>
          </span>
          <span
            style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
          >
            <StatusBadge label="Generation" status={app.generationStatus} />
            <StatusBadge label="Repository" status={app.repositoryStatus} />
            <StatusBadge label="Published" status={app.publishStatus} />
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminUserId = await getAdminUserIdOrNull();

  if (!adminUserId) {
    return <AdminNotAuthorized />;
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      roles: { select: { role: true } },
      appRequests: {
        select: {
          id: true,
          appName: true,
          generationStatus: true,
          repositoryStatus: true,
          publishStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      appAccess: {
        select: {
          appRequest: {
            select: {
              id: true,
              appName: true,
              generationStatus: true,
              repositoryStatus: true,
              publishStatus: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    return (
      <div className="empty-state">
        <h1 className="empty-state__title">User Not Found</h1>
        <p className="empty-state__desc">
          That user does not exist or has been removed.
        </p>
        <Link href="/admin/users" className="btn btn--primary-solid">
          Back to Users
        </Link>
      </div>
    );
  }

  const isAdmin = user.roles.some((role) => role.role === "ADMIN");
  const roleAction = isAdmin
    ? removeAdminRoleAction.bind(null, user.id)
    : grantAdminRoleAction.bind(null, user.id);
  const collaborations = user.appAccess.map((access) => access.appRequest);

  return (
    <>
      <div className="page-header">
        <h1>{user.displayName}</h1>
      </div>

      <div className="grid grid--2" style={{ gap: "1rem", alignItems: "start" }}>
        <section className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>Identity</h2>
          <div className="status-table">
            <div className="status-row">
              <span className="status-row__label">Name</span>
              <span>{user.displayName}</span>
            </div>
            <div className="status-row">
              <span className="status-row__label">Email</span>
              <span>{user.email}</span>
            </div>
            <div className="status-row">
              <span className="status-row__label">Joined</span>
              <span>{createdDate(user.createdAt)}</span>
            </div>
            <div className="status-row">
              <span className="status-row__label">Role</span>
              <span className={`badge badge--${isAdmin ? "success" : "default"}`}>
                {isAdmin ? "Admin" : "User"}
              </span>
            </div>
          </div>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              margin: "0.75rem 0 0",
            }}
          >
            Name and email are synced from Entra at each sign-in and cannot be
            edited here.
          </p>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>Portal Settings</h2>
          <form
            action={updateUserGithubUsernameAction.bind(null, user.id)}
            className="form-stack"
          >
            <label className="form-group">
              <span className="form-label">GitHub username</span>
              <input
                type="text"
                name="githubUsername"
                className="form-control"
                defaultValue={user.githubUsername ?? ""}
                placeholder="octocat"
                pattern="[a-zA-Z\d](?:[a-zA-Z\d-]{0,37}[a-zA-Z\d])?"
                maxLength={39}
                title="Enter a valid GitHub username: letters, digits, and single hyphens, up to 39 characters. Leave blank to clear it."
              />
            </label>
            <div>
              <PendingSubmitButton
                idleLabel="Save GitHub Username"
                pendingLabel="Saving..."
                statusText="Saving GitHub username."
                variant="secondary"
                size="sm"
              />
            </div>
          </form>

          <form action={roleAction} style={{ marginTop: "1rem" }}>
            <PendingSubmitButton
              idleLabel={isAdmin ? "Remove Admin" : "Make Admin"}
              pendingLabel={isAdmin ? "Removing..." : "Granting..."}
              statusText={
                isAdmin
                  ? "Removing administrator role."
                  : "Granting administrator role."
              }
              variant={isAdmin ? "danger" : "secondary"}
              size="sm"
            />
          </form>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>
          Owned Apps ({user.appRequests.length})
        </h2>
        <AppSummaryList apps={user.appRequests} emptyMessage="No apps owned." />
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>
          Collaborations ({collaborations.length})
        </h2>
        <AppSummaryList apps={collaborations} emptyMessage="No collaborations." />
      </section>
    </>
  );
}
