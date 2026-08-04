import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { listPublicApps } from "@/features/public-apps/queries";

export default async function PublicAppsPage() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  const publicApps = await listPublicApps();

  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <Link href="/apps">My Apps</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">Public Apps</span>
      </nav>

      <div className="page-header">
        <h1>Public Apps</h1>
        <p>
          Apps built by the Cedarville community that their owners have chosen
          to share with everyone.
        </p>
      </div>

      {publicApps.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🌐</div>
          <div className="empty-state__title">No public apps yet</div>
          <p className="empty-state__desc">
            When app owners list their apps publicly, they will show up here.
          </p>
        </div>
      ) : (
        <ul
          className="grid grid--2"
          style={{ gap: "1.25rem", listStyle: "none", padding: 0, margin: 0 }}
        >
          {publicApps.map((app) => (
            <li key={app.id} className="app-card">
              <div className="app-card__header">
                <h2 className="app-card__name">{app.name}</h2>
              </div>
              <div className="app-card__body">
                <p style={{ color: "var(--text-secondary)", margin: 0 }}>
                  {app.description ?? "No description provided."}
                </p>
                {app.url ? (
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noreferrer"
                    className="meta-link"
                  >
                    {app.url}
                  </a>
                ) : (
                  <span style={{ color: "var(--text-secondary)" }}>
                    Not published yet.
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
