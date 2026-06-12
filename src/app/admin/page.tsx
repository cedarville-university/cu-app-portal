import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  addAppCollaboratorAction,
  grantAdminRoleAction,
  reassignAppOwnerAction,
  removeAdminRoleAction,
  removeAppCollaboratorAction,
} from "@/features/admin/actions";
import { isAdminUser } from "@/features/admin/roles";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { ConfirmDeleteForm } from "@/features/app-deletion/confirm-delete-form";
import { deleteAppFormAction } from "@/features/app-deletion/actions";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { prisma } from "@/lib/db";

type BadgeVariant = "success" | "error" | "warning" | "info" | "default";

function formatStatus(status: string | null | undefined) {
  if (!status) return "Not checked";

  return status.toLowerCase().replaceAll("_", " ");
}

function statusVariant(status: string | null | undefined): BadgeVariant {
  const normalized = status?.toLowerCase();

  if (
    normalized === "ready" ||
    normalized === "succeeded" ||
    normalized === "completed" ||
    normalized === "granted"
  ) {
    return "success";
  }
  if (normalized === "failed" || normalized === "blocked") return "error";
  if (
    normalized === "queued" ||
    normalized === "pending" ||
    normalized === "provisioning" ||
    normalized === "deploying"
  ) {
    return "warning";
  }
  if (normalized === "deleted" || normalized === "not_started") {
    return "default";
  }

  return "info";
}

function StatusBadge({ label, status }: { label: string; status: string }) {
  return (
    <span className={`badge badge--${statusVariant(status)}`}>
      {label}: {formatStatus(status)}
    </span>
  );
}

function userLabel(user: { displayName: string; email: string }) {
  return `${user.displayName} (${user.email})`;
}

function createdDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function AdminPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  if (!(await isAdminUser(userId))) {
    return (
      <main>
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb__sep" aria-hidden="true">
            /
          </span>
          <span aria-current="page">Admin</span>
        </nav>

        <div className="empty-state">
          <h1 className="empty-state__title">Not Authorized</h1>
          <p className="empty-state__desc">
            You do not have permission to use the admin tools.
          </p>
          <Link href="/apps" className="btn btn--primary-solid">
            Go to My Apps
          </Link>
        </div>
      </main>
    );
  }

  const [users, appRequests] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      include: {
        roles: {
          select: {
            role: true,
          },
        },
        appRequests: {
          select: {
            id: true,
          },
        },
        appAccess: {
          select: {
            id: true,
          },
        },
        _count: {
          select: {
            appRequests: true,
            appAccess: true,
          },
        },
      },
    }),
    prisma.appRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">Admin</span>
      </nav>

      <div className="page-header">
        <h1>Admin</h1>
        <p>Manage portal users, app ownership, collaborators, and resources.</p>
      </div>

      <section
        aria-labelledby="admin-users-heading"
        style={{ marginBottom: "2.5rem" }}
      >
        <h2 id="admin-users-heading">Users</h2>
        <div className="grid grid--2" style={{ gap: "1rem" }}>
          {users.map((user) => {
            const isAdmin = user.roles.some((role) => role.role === "ADMIN");
            const roleAction = isAdmin
              ? removeAdminRoleAction.bind(null, user.id)
              : grantAdminRoleAction.bind(null, user.id);

            return (
              <article className="card" key={user.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <h3 style={{ marginBottom: "0.25rem" }}>
                      {user.displayName}
                    </h3>
                    <p style={{ margin: 0 }}>{user.email}</p>
                    {user.githubUsername ? (
                      <p style={{ margin: "0.25rem 0 0", color: "var(--text-muted)" }}>
                        @{user.githubUsername}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`badge badge--${isAdmin ? "success" : "default"}`}
                  >
                    {isAdmin ? "Admin" : "User"}
                  </span>
                </div>

                <div className="status-table" style={{ marginTop: "1rem" }}>
                  <div className="status-row">
                    <span className="status-row__label">Owned</span>
                    <span>{user._count.appRequests}</span>
                  </div>
                  <div className="status-row">
                    <span className="status-row__label">Collaborator</span>
                    <span>{user._count.appAccess}</span>
                  </div>
                </div>

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
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="admin-apps-heading" role="region">
        <h2 id="admin-apps-heading">Apps</h2>
        <div className="grid grid--2" style={{ gap: "1rem" }}>
          {appRequests.map((request) => {
            const displayPublishUrl =
              request.publishUrl ?? request.primaryPublishUrl;
            const collaborators = request.collaborators.map(
              (access) => access.user,
            );
            const canDeleteGitHub =
              request.repositoryStatus !== "DELETED" &&
              Boolean(request.repositoryOwner && request.repositoryName);
            const canDeleteAzure =
              request.publishStatus !== "DELETED" &&
              Boolean(request.azureWebAppName || request.azureDatabaseName);

            return (
              <article className="card" key={request.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <h3 style={{ marginBottom: "0.25rem" }}>
                      {request.appName}
                    </h3>
                    <p style={{ margin: 0 }}>
                      Owner: {request.user.displayName}
                    </p>
                    <p style={{ margin: "0.25rem 0 0", color: "var(--text-muted)" }}>
                      Created {createdDate(request.createdAt)}
                    </p>
                  </div>
                  <Link
                    href={`/download/${request.id}`}
                    className="btn btn--ghost btn--sm"
                  >
                    App Details
                  </Link>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    marginTop: "1rem",
                  }}
                >
                  <StatusBadge label="Generation" status={request.generationStatus} />
                  <StatusBadge label="Repository" status={request.repositoryStatus} />
                  <StatusBadge label="Published" status={request.publishStatus} />
                </div>

                <div className="status-table" style={{ marginTop: "1rem" }}>
                  <div className="status-row">
                    <span className="status-row__label">Owner</span>
                    <span>{userLabel(request.user)}</span>
                  </div>
                  <div className="status-row">
                    <span className="status-row__label">Collaborators</span>
                    <span>
                      {collaborators.length > 0
                        ? collaborators.map((user) => user.displayName).join(", ")
                        : "None"}
                    </span>
                  </div>
                  {request.repositoryUrl ? (
                    <div className="status-row">
                      <span className="status-row__label">Repository</span>
                      <a
                        href={request.repositoryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="meta-link"
                      >
                        {request.repositoryUrl.replace("https://github.com/", "")}
                      </a>
                    </div>
                  ) : null}
                  {displayPublishUrl ? (
                    <div className="status-row">
                      <span className="status-row__label">Published</span>
                      <a
                        href={displayPublishUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="meta-link"
                      >
                        {displayPublishUrl}
                      </a>
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "1rem",
                    marginTop: "1rem",
                  }}
                >
                  <form
                    action={addAppCollaboratorAction.bind(null, request.id)}
                    className="form-stack"
                  >
                    <label className="form-group">
                      <span className="form-label">Add collaborator</span>
                      <select className="form-control" name="userId" required>
                        <option value="">Select a user</option>
                        {users
                          .filter((user) => user.id !== request.userId)
                          .map((user) => (
                            <option key={user.id} value={user.id}>
                              {userLabel(user)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div>
                      <PendingSubmitButton
                        idleLabel="Add Collaborator"
                        pendingLabel="Adding..."
                        statusText="Adding app collaborator."
                        variant="secondary"
                        size="sm"
                      />
                    </div>
                  </form>

                  <form
                    action={reassignAppOwnerAction.bind(null, request.id)}
                    className="form-stack"
                  >
                    <label className="form-group">
                      <span className="form-label">Reassign owner</span>
                      <select
                        className="form-control"
                        name="userId"
                        required
                        defaultValue=""
                      >
                        <option value="">Select a new owner</option>
                        {users
                          .filter((user) => user.id !== request.userId)
                          .map((user) => (
                            <option key={user.id} value={user.id}>
                              {userLabel(user)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div>
                      <PendingSubmitButton
                        idleLabel="Reassign Owner"
                        pendingLabel="Reassigning..."
                        statusText="Reassigning app owner."
                        variant="secondary"
                        size="sm"
                      />
                    </div>
                  </form>

                  {collaborators.length > 0 ? (
                    <div className="form-stack">
                      <p className="section-title">Remove collaborators</p>
                      {collaborators.map((user) => (
                        <form
                          action={removeAppCollaboratorAction.bind(
                            null,
                            request.id,
                            user.id,
                          )}
                          key={user.id}
                        >
                          <PendingSubmitButton
                            idleLabel={`Remove ${user.displayName}`}
                            pendingLabel="Removing..."
                            statusText="Removing collaborator."
                            variant="ghost"
                            size="sm"
                          />
                        </form>
                      ))}
                    </div>
                  ) : null}

                  <ConfirmDeleteForm
                    action={deleteAppFormAction.bind(null, request.id)}
                    className="form-stack"
                  >
                    <details className="delete-panel">
                      <summary>Delete selected resources</summary>
                      <div className="delete-panel__content">
                        <fieldset>
                          <legend>Resources to delete</legend>
                          <label>
                            <input name="deletePortal" type="checkbox" />
                            Remove this app from the portal
                          </label>
                          {canDeleteGitHub ? (
                            <label>
                              <input name="deleteGithub" type="checkbox" />
                              Delete GitHub repository{" "}
                              <code style={{ fontSize: "0.875em" }}>
                                {request.repositoryOwner}/{request.repositoryName}
                              </code>
                            </label>
                          ) : (
                            <p
                              style={{
                                fontSize: "0.875rem",
                                color: "var(--text-muted)",
                                margin: 0,
                              }}
                            >
                              GitHub repository already deleted or not tracked.
                            </p>
                          )}
                          {canDeleteAzure ? (
                            <label>
                              <input name="deleteAzure" type="checkbox" />
                              <span>
                                Delete Azure deployment
                                {request.azureWebAppName ? (
                                  <>: Web App {request.azureWebAppName}</>
                                ) : null}
                                {request.azureDatabaseName ? (
                                  <>
                                    {" "}
                                    and PostgreSQL database{" "}
                                    {request.azureDatabaseName}
                                  </>
                                ) : null}
                              </span>
                            </label>
                          ) : (
                            <p
                              style={{
                                fontSize: "0.875rem",
                                color: "var(--text-muted)",
                                margin: 0,
                              }}
                            >
                              Azure deployment already deleted or not tracked.
                            </p>
                          )}
                        </fieldset>
                        <label>
                          <input name="confirmDelete" type="checkbox" required />
                          I understand that checked items will be permanently
                          deleted.
                        </label>
                        <input name="returnTo" type="hidden" value="/admin" />
                        <PendingSubmitButton
                          idleLabel="Delete Selected Resources"
                          pendingLabel="Deleting..."
                          statusText="Deleting selected resources."
                          variant="danger"
                          size="sm"
                        />
                      </div>
                    </details>
                  </ConfirmDeleteForm>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
