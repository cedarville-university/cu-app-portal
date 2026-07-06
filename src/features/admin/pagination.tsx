import Link from "next/link";
import React from "react";
import { ADMIN_PAGE_SIZE, totalPages } from "./query-params";

function pageHref(
  basePath: string,
  params: Record<string, string>,
  page: number,
) {
  const query = new URLSearchParams(params);

  query.set("page", String(page));

  return `${basePath}?${query.toString()}`;
}

export function Pagination({
  page,
  totalCount,
  pageSize = ADMIN_PAGE_SIZE,
  basePath,
  params = {},
}: {
  page: number;
  totalCount: number;
  pageSize?: number;
  basePath: string;
  params?: Record<string, string>;
}) {
  const pageCount = totalPages(totalCount, pageSize);

  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        marginTop: "1rem",
      }}
    >
      {page > 1 ? (
        <Link
          href={pageHref(basePath, params, page - 1)}
          className="btn btn--ghost btn--sm"
        >
          Previous
        </Link>
      ) : null}
      <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link
          href={pageHref(basePath, params, page + 1)}
          className="btn btn--ghost btn--sm"
        >
          Next
        </Link>
      ) : null}
    </nav>
  );
}
