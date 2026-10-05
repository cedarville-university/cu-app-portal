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
import type { Prisma } from "@prisma/client";

type SortKey = "name" | "email" | "github" | "owned" | "collaborating" | "role";

function sortableHeader(
  key: SortKey,
  label: string,
  currentSort: SortKey,
  direction: "asc" | "desc",
  q: string,
) {
  const nextDirection = currentSort === key && direction === "asc" ? "desc" : "asc";
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  query.set("sort", key);
  query.set("direction", nextDirection);
  return (
    <Link href={`/admin/users?${query.toString()}`}>
      {label}{currentSort === key ? (direction === "asc" ? " ↑" : " ↓") : ""}
    </Link>
  );
}

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
  const q = parseSearch(params.q) ?? "";
  const sortOptions = {
    name: true,
    email: true,
    github: true,
    owned: true,
    collaborating: true,
    role: true,
  } as const;
  const requestedSort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort = Object.hasOwn(sortOptions, requestedSort ?? "")
    ? (requestedSort as SortKey)
    : "name";
  const requestedDirection = Array.isArray(params.direction)
    ? params.direction[0]
    : params.direction;
  const direction = requestedDirection === "desc" ? "desc" : "asc";
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
  const orderBy: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[] =
    sort === "name"
      ? [{ displayName: direction }, { email: "asc" as const }]
      : sort === "email"
        ? { email: direction }
        : sort === "github"
          ? { githubUsername: direction }
          : sort === "owned"
            ? { appRequests: { _count: direction } }
            : sort === "collaborating"
              ? { appAccess: { _count: direction } }
              : { roles: { _count: direction } };
  const users = await prisma.user.findMany({
    where,
    orderBy,
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
                <th>{sortableHeader("name", "Name", sort, direction, q)}</th>
                <th>{sortableHeader("email", "Email", sort, direction, q)}</th>
                <th>{sortableHeader("github", "GitHub", sort, direction, q)}</th>
                <th>{sortableHeader("owned", "Owned", sort, direction, q)}</th>
                <th>{sortableHeader("collaborating", "Collaborating", sort, direction, q)}</th>
                <th>{sortableHeader("role", "Role", sort, direction, q)}</th>
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
        params={{ ...(q ? { q } : {}), sort, direction }}
      />
    </>
  );
}
