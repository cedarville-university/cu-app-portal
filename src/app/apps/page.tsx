import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LaunchRocketIcon } from "@/components/launch-rocket-icon";
import { appListWhereForUser } from "@/features/app-requests/access";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { getEffectivePublishingSetupStatus } from "@/features/publishing/setup/status";
import { prisma } from "@/lib/db";

function appInitials(appName: string) {
  return appName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function appStatus(publishStatus: string, publishingSetupStatus: string) {
  if (publishStatus === "SUCCEEDED") {
    return { label: "Live", variant: "live" } as const;
  }

  const setupStatus = getEffectivePublishingSetupStatus({
    publishStatus,
    publishingSetupStatus,
  });

  if (
    publishStatus === "FAILED" ||
    setupStatus === "NEEDS_REPAIR" ||
    setupStatus === "BLOCKED"
  ) {
    return { label: "Needs attention", variant: "attention" } as const;
  }

  return { label: "In setup", variant: "setup" } as const;
}

function formatUpdatedDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M9 2h5v5M14 2 7 9" />
      <path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

export default async function MyAppsPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  const appRequests = await prisma.appRequest.findMany({
    where: appListWhereForUser(userId),
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="my-apps-page">
      <div className="page-header my-apps-page__header">
        <div>
          <h1>My Apps</h1>
          <p>Manage and monitor your launched applications.</p>
        </div>
        <Link href="/create" className="btn btn--primary-solid my-apps-page__launch">
          <LaunchRocketIcon />
          Launch New App
        </Link>
      </div>

      {appRequests.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📦</div>
          <div className="empty-state__title">No apps yet</div>
          <p className="empty-state__desc">
            Launch your first CU Launch app to get started.
          </p>
          <Link href="/create" className="btn btn--primary-solid">
            <LaunchRocketIcon />
            Launch New App
          </Link>
        </div>
      ) : (
        <ul className="my-apps-list">
          {appRequests.map((request) => {
            const publishUrl = request.publishUrl ?? request.primaryPublishUrl;
            const status = appStatus(
              request.publishStatus,
              request.publishingSetupStatus,
            );
            const actionHref =
              request.publishStatus === "SUCCEEDED"
                ? `/download/${request.id}`
                : `/onboarding/${request.id}`;

            return (
              <li className="my-app-row" key={request.id}>
                <span className="my-app-row__icon" aria-hidden="true">
                  {appInitials(request.appName)}
                </span>
                <div className="my-app-row__details">
                  <h2 className="my-app-row__name">
                    <Link href={`/download/${request.id}`}>{request.appName}</Link>
                  </h2>
                  {publishUrl ? (
                    <a
                      className="my-app-row__url"
                      aria-label="Published app URL"
                      href={publishUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {publishUrl}
                    </a>
                  ) : (
                    <span className="my-app-row__url my-app-row__url--empty">
                      App URL available after publishing
                    </span>
                  )}
                  <p className="my-app-row__updated">
                    Updated {formatUpdatedDate(request.updatedAt)}
                  </p>
                </div>
                <span
                  className={`my-app-row__status my-app-row__status--${status.variant}`}
                  aria-label={`Status: ${status.label}`}
                >
                  <span aria-hidden="true" className="my-app-row__status-dot" />
                  {status.label}
                </span>
                <div className="my-app-row__actions">
                  {request.publishStatus === "SUCCEEDED" && publishUrl ? (
                    <a
                      className="btn btn--ghost my-app-row__open"
                      href={publishUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open app <ExternalLinkIcon />
                    </a>
                  ) : (
                    <Link
                      className="btn btn--ghost my-app-row__open"
                      href={actionHref}
                    >
                      {request.publishStatus === "SUCCEEDED"
                        ? "Manage App"
                        : "Continue Setup"}
                    </Link>
                  )}
                  <details className="my-app-row__menu">
                    <summary aria-label={`More options for ${request.appName}`}>
                      <span aria-hidden="true">···</span>
                    </summary>
                    <div className="my-app-row__menu-items">
                      <Link href={`/download/${request.id}`}>App details</Link>
                      {request.repositoryUrl ? (
                        <a
                          aria-label="GitHub repository"
                          href={request.repositoryUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          GitHub repository
                        </a>
                      ) : null}
                    </div>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
