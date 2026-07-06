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
  const q = parseSearch(params.q);
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
    orderBy: { createdAt: "desc" },
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
                <th>App</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Created</th>
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
