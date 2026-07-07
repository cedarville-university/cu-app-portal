import Link from "next/link";
import React from "react";
import { AdminNotAuthorized, getAdminUserIdOrNull } from "@/features/admin/guard";
import { prisma } from "@/lib/db";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function HubCard({
  title,
  count,
  description,
  href,
  linkLabel,
}: {
  title: string;
  count: number;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <article className="card">
      <h2 style={{ marginBottom: "0.25rem" }}>{title}</h2>
      <p
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          margin: "0 0 0.5rem",
        }}
      >
        {count}
      </p>
      <p style={{ color: "var(--text-muted)", margin: "0 0 1rem" }}>
        {description}
      </p>
      <Link href={href} className="btn btn--secondary btn--sm">
        {linkLabel}
      </Link>
    </article>
  );
}

export default async function AdminPage() {
  const adminUserId = await getAdminUserIdOrNull();

  if (!adminUserId) {
    return <AdminNotAuthorized />;
  }

  const [userCount, appCount, recentEventCount] = await Promise.all([
    prisma.user.count(),
    prisma.appRequest.count(),
    prisma.auditLog.count({
      where: { createdAt: { gte: new Date(Date.now() - SEVEN_DAYS_MS) } },
    }),
  ]);

  return (
    <>
      <div className="page-header">
        <h1>Admin</h1>
        <p>Manage portal users, app ownership, collaborators, and resources.</p>
      </div>

      <div className="grid grid--3" style={{ gap: "1rem" }}>
        <HubCard
          title="Users"
          count={userCount}
          description="Portal accounts, admin roles, and user details."
          href="/admin/users"
          linkLabel="Manage Users"
        />
        <HubCard
          title="Apps"
          count={appCount}
          description="App ownership, collaborators, and resources."
          href="/admin/apps"
          linkLabel="Manage Apps"
        />
        <HubCard
          title="Events (7 days)"
          count={recentEventCount}
          description="Audit trail of sign-ins and admin activity."
          href="/admin/events"
          linkLabel="View Events"
        />
      </div>
    </>
  );
}
