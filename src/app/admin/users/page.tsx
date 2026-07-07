import Link from "next/link";
import React from "react";
import {
  grantAdminRoleAction,
  removeAdminRoleAction,
} from "@/features/admin/actions";
import { AdminNotAuthorized, getAdminUserIdOrNull } from "@/features/admin/guard";
import { Pagination } from "@/features/admin/pagination";
import {
  ADMIN_PAGE_SIZE,
  clampPage,
  parsePage,
  parseSearch,
} from "@/features/admin/query-params";
import { AdminSearchForm } from "@/features/admin/search-form";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { prisma } from "@/lib/db";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminUserId = await getAdminUserIdOrNull();

  if (!adminUserId) {
    return <AdminNotAuthorized />;
  }

  const params = await searchParams;
  const q = parseSearch(params.q);
  const where = q
    ? {
        OR: [
          { displayName: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { githubUsername: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const totalCount = await prisma.user.count({ where });
  const page = clampPage(parsePage(params.page), totalCount);
  const users = await prisma.user.findMany({
    where,
    orderBy: [{ displayName: "asc" }, { email: "asc" }],
    skip: (page - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
    include: {
      roles: { select: { role: true } },
      _count: { select: { appRequests: true, appAccess: true } },
    },
  });

  return (
    <>
      <div className="page-header">
        <h1>Users</h1>
        <p>
          {totalCount} portal {totalCount === 1 ? "user" : "users"}. Select a
          user to edit details and see their apps.
        </p>
      </div>

      <AdminSearchForm
        basePath="/admin/users"
        defaultValue={q}
        placeholder="Search by name, email, or GitHub username"
      />

      {users.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__desc">
            {q ? "No users match your search." : "No users yet."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>GitHub</th>
                <th>Owned</th>
                <th>Collaborating</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isAdmin = user.roles.some((role) => role.role === "ADMIN");
                const roleAction = isAdmin
                  ? removeAdminRoleAction.bind(null, user.id)
                  : grantAdminRoleAction.bind(null, user.id);

                return (
                  <tr key={user.id}>
                    <td>
                      <Link href={`/admin/users/${user.id}`} className="meta-link">
                        {user.displayName}
                      </Link>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.githubUsername ? `@${user.githubUsername}` : "—"}</td>
                    <td>{user._count.appRequests}</td>
                    <td>{user._count.appAccess}</td>
                    <td>
                      <span
                        className={`badge badge--${isAdmin ? "success" : "default"}`}
                      >
                        {isAdmin ? "Admin" : "User"}
                      </span>
                    </td>
                    <td>
                      <form action={roleAction}>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        totalCount={totalCount}
        basePath="/admin/users"
        params={q ? { q } : {}}
      />
    </>
  );
}
