import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  appListWhereForUser,
  userHasAdminRole,
} from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { getEffectivePublishingSetupStatus } from "@/features/publishing/setup/status";
import { prisma } from "@/lib/db";

type BadgeVariant = "success" | "error" | "warning" | "info" | "default";

function statusBadge(
  status: string | null | undefined,
): { label: string; variant: BadgeVariant } {
  if (!status) return { label: "Not checked", variant: "default" };

  const s = status.toLowerCase();
  if (
    s === "ready" ||
    s === "succeeded" ||
    s === "granted" ||
    s === "completed"
  ) {
    return { label: formatStatus(status), variant: "success" };
  }
  if (s === "failed") return { label: "Failed", variant: "error" };
  if (s === "blocked") return { label: "Blocked", variant: "error" };
  if (s === "needs_repair") return { label: "Needs repair", variant: "warning" };
  if (s === "checking" || s === "repairing") {
    return { label: formatStatus(status), variant: "warning" };
  }
  if (s === "deleted") return { label: "Deleted", variant: "default" };
  if (s === "not_started") return { label: "Not started", variant: "default" };
  if (s === "not_checked") return { label: "Not checked", variant: "default" };
  if (s === "invited") return { label: "Invited", variant: "info" };
  return { label: formatStatus(status), variant: "info" };
}

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function getDisplayPublishUrl(
  primaryPublishUrl: string | null,
  publishUrl: string | null,
) {
  return publishUrl ?? primaryPublishUrl;
}

function StatusBadge({
  label,
  status,
  title,
}: {
  label: string;
  status: string | null | undefined;
  title: string;
}) {
  const badge = statusBadge(status);

  return (
    <span className={`badge badge--${badge.variant}`} title={title}>
      {label}: {badge.label}
    </span>
  );
}

export default async function MyAppsPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  const isAdmin = await userHasAdminRole(userId);
  const appRequests = await prisma.appRequest.findMany({
    where: appListWhereForUser(userId, isAdmin),
    orderBy: { createdAt: "desc" },
    include: {
      repositoryImport: true,
    },
  });

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <Link href="/create">Create New App</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">My Apps</span>
      </nav>

      <div
        className="page-header"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1>My Apps</h1>
          <p>Review app status and open the links you need most often.</p>
        </div>
        <Link href="/create" className="btn btn--primary-solid btn--sm">
          + Create New App
        </Link>
      </div>

      {appRequests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📦</div>
          <div className="empty-state__title">No apps yet</div>
          <p className="empty-state__desc">
            Create your first Cedarville-approved app to get started.
          </p>
          <Link href="/create" className="btn btn--primary-solid">
            Create New App
          </Link>
        </div>
      ) : (
        <ul
          className="grid grid--2"
          style={{ gap: "1.25rem", listStyle: "none", padding: 0, margin: 0 }}
        >
          {appRequests.map((request) => {
            const displayPublishUrl = getDisplayPublishUrl(
              request.primaryPublishUrl,
              request.publishUrl,
            );
            const repositoryImport = request.repositoryImport;

            return (
              <li key={request.id} className="app-card">
                <div className="app-card__header">
                  <h2 className="app-card__name">
                    <Link
                      href={`/download/${request.id}`}
                      className="app-card__name-link"
                    >
                      {request.appName}
                    </Link>
                  </h2>
                </div>

                <div className="app-card__body">
                  <div className="app-card__statuses">
                    <StatusBadge
                      label="Created"
                      status={request.generationStatus}
                      title="Whether your app files have been generated"
                    />
                    <StatusBadge
                      label="Repository"
                      status={request.repositoryStatus}
                      title="Whether your GitHub code repository is set up"
                    />
                    <StatusBadge
                      label="Published"
                      status={request.publishStatus}
                      title="Whether your app has been deployed to Azure"
                    />
                    <StatusBadge
                      label="Code access"
                      status={request.repositoryAccessStatus}
                      title="Whether Codex has been invited to your code repository"
                    />
                    <StatusBadge
                      label="Pub. config"
                      status={getEffectivePublishingSetupStatus({
                        publishStatus: request.publishStatus,
                        publishingSetupStatus: request.publishingSetupStatus,
                      })}
                      title="Whether Azure, login, and GitHub publishing settings are ready"
                    />
                    {repositoryImport ? (
                      <>
                        <StatusBadge
                          label="Import"
                          status={repositoryImport.importStatus}
                          title="Whether the source repository was copied into the managed organization"
                        />
                        <StatusBadge
                          label="Preparation"
                          status={repositoryImport.preparationStatus}
                          title="Whether repository publishing setup has been prepared"
                        />
                      </>
                    ) : null}
                  </div>

                  <div className="status-table">
                    {request.repositoryUrl ? (
                      <div className="status-row">
                        <span className="status-row__label">Repository</span>
                        <a
                          href={request.repositoryUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="meta-link"
                        >
                          {request.repositoryUrl.replace(
                            "https://github.com/",
                            "",
                          )}
                        </a>
                      </div>
                    ) : null}
                    {displayPublishUrl ? (
                      <div className="status-row">
                        <span className="status-row__label">Published app</span>
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

                  <div className="app-card__actions">
                    <Link
                      href={`/download/${request.id}`}
                      className="btn btn--ghost btn--sm"
                    >
                      App Details
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
