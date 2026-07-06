import Link from "next/link";
import React from "react";
import {
  addAppCollaboratorAction,
  reassignAppOwnerAction,
  removeAppCollaboratorAction,
} from "@/features/admin/actions";
import { AdminNotAuthorized, getAdminUserIdOrNull } from "@/features/admin/guard";
import { createdDate, StatusBadge, userLabel } from "@/features/admin/status";
import { deleteAppFormAction } from "@/features/app-deletion/actions";
import { ConfirmDeleteForm } from "@/features/app-deletion/confirm-delete-form";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { prisma } from "@/lib/db";

export default async function AdminAppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminUserId = await getAdminUserIdOrNull();

  if (!adminUserId) {
    return <AdminNotAuthorized />;
  }

  const { id } = await params;
  const [request, users] = await Promise.all([
    prisma.appRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, displayName: true, email: true },
        },
        collaborators: {
          include: {
            user: {
              select: { id: true, displayName: true, email: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.user.findMany({
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      select: { id: true, displayName: true, email: true },
    }),
  ]);

  if (!request) {
    return (
      <div className="empty-state">
        <h1 className="empty-state__title">App Not Found</h1>
        <p className="empty-state__desc">
          That app does not exist or has been removed.
        </p>
        <Link href="/admin/apps" className="btn btn--primary-solid">
          Back to Apps
        </Link>
      </div>
    );
  }

  const displayPublishUrl = request.publishUrl ?? request.primaryPublishUrl;
  const collaborators = request.collaborators.map((access) => access.user);
  const canDeleteGitHub =
    request.repositoryStatus !== "DELETED" &&
    Boolean(request.repositoryOwner && request.repositoryName);
  const canDeleteAzure =
    request.publishStatus !== "DELETED" &&
    Boolean(request.azureWebAppName || request.azureDatabaseName);

  return (
    <>
      <div className="page-header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1>{request.appName}</h1>
            <p>
              Owned by {userLabel(request.user)} · Created{" "}
              {createdDate(request.createdAt)}
            </p>
          </div>
          <Link href={`/download/${request.id}`} className="btn btn--ghost btn--sm">
            App Details
          </Link>
        </div>
      </div>

      <section className="card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
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
      </section>

      <div className="grid grid--2" style={{ gap: "1rem", marginTop: "1rem" }}>
        <section className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>Collaborators</h2>
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

          {collaborators.length > 0 ? (
            <div className="form-stack" style={{ marginTop: "1rem" }}>
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
        </section>

        <section className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>Ownership</h2>
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
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Danger Zone</h2>
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
                          and PostgreSQL database {request.azureDatabaseName}
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
                I understand that checked items will be permanently deleted.
              </label>
              <input name="returnTo" type="hidden" value="/admin/apps" />
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
      </section>
    </>
  );
}
