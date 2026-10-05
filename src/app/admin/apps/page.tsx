import Link from "next/link";
import React from "react";
import { AdminNotAuthorized, getAdminUserIdOrNull } from "@/features/admin/guard";
import { Pagination } from "@/features/admin/pagination";
import {
  ADMIN_PAGE_SIZE,
  clampPage,
  parsePage,
  parseSearch,
} from "@/features/admin/query-params";
import { AdminSearchForm } from "@/features/admin/search-form";
import { createdDate, StatusBadge, userLabel } from "@/features/admin/status";
import { prisma } from "@/lib/db";

type SortKey = "app" | "owner" | "status" | "created";

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
    <Link href={`/admin/apps?${query.toString()}`}>
      {label}{currentSort === key ? (direction === "asc" ? " ↑" : " ↓") : ""}
    </Link>
  );
}

export default async function AdminAppsPage({
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
    app: true,
    owner: true,
    status: true,
    created: true,
  } as const;
  const requestedSort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort = Object.hasOwn(sortOptions, requestedSort ?? "")
    ? (requestedSort as SortKey)
    : "created";
  const requestedDirection = Array.isArray(params.direction)
    ? params.direction[0]
    : params.direction;
  const direction = requestedDirection === "asc" ? "asc" : "desc";
  const orderBy =
    sort === "app"
      ? { appName: direction as "asc" | "desc" }
      : sort === "owner"
        ? { user: { displayName: direction as "asc" | "desc" } }
        : sort === "status"
          ? { generationStatus: direction as "asc" | "desc" }
          : { createdAt: direction as "asc" | "desc" };
  const where = q
    ? {
        OR: [
          { appName: { contains: q, mode: "insensitive" as const } },
          {
            user: {
              displayName: { contains: q, mode: "insensitive" as const },
            },
          },
          { user: { email: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const totalCount = await prisma.appRequest.count({ where });
  const page = clampPage(parsePage(params.page), totalCount);
  const appRequests = await prisma.appRequest.findMany({
    where,
    orderBy,
    skip: (page - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
    select: {
      id: true,
      appName: true,
      generationStatus: true,
      repositoryStatus: true,
      publishStatus: true,
      createdAt: true,
      user: {
        select: { id: true, displayName: true, email: true },
      },
    },
  });

  return (
    <>
      <div className="page-header">
        <h1>Apps</h1>
        <p>
          {totalCount} portal {totalCount === 1 ? "app" : "apps"}. Select an app
          to manage collaborators, ownership, and resources.
        </p>
      </div>

      <AdminSearchForm
        basePath="/admin/apps"
        defaultValue={q}
        placeholder="Search by app name or owner"
      />

      {appRequests.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__desc">
            {q ? "No apps match your search." : "No apps yet."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{sortableHeader("app", "App", sort, direction, q)}</th>
                <th>{sortableHeader("owner", "Owner", sort, direction, q)}</th>
                <th>{sortableHeader("status", "Status", sort, direction, q)}</th>
                <th>{sortableHeader("created", "Created", sort, direction, q)}</th>
              </tr>
            </thead>
            <tbody>
              {appRequests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <Link
                      href={`/admin/apps/${request.id}`}
                      className="meta-link"
                    >
                      {request.appName}
                    </Link>
                  </td>
                  <td>{userLabel(request.user)}</td>
                  <td>
                    <span
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <StatusBadge
                        label="Generation"
                        status={request.generationStatus}
                      />
                      <StatusBadge
                        label="Repository"
                        status={request.repositoryStatus}
                      />
                      <StatusBadge
                        label="Published"
                        status={request.publishStatus}
                      />
                    </span>
                  </td>
                  <td>{createdDate(request.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        totalCount={totalCount}
        basePath="/admin/apps"
        params={q ? { q } : {}}
      />
    </>
  );
}
