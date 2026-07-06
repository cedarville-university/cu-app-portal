import Link from "next/link";
import React from "react";
import { searchAuditLog, summarizeDetails } from "@/features/admin/audit-log";
import { AdminNotAuthorized, getAdminUserIdOrNull } from "@/features/admin/guard";
import { Pagination } from "@/features/admin/pagination";
import {
  ADMIN_PAGE_SIZE,
  parseAuditEventFilter,
  parseDateFilter,
  parsePage,
  parseSearch,
} from "@/features/admin/query-params";
import { formatDateTime } from "@/features/admin/status";
import { AUDIT_EVENTS } from "@/lib/audit";

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminUserId = await getAdminUserIdOrNull();

  if (!adminUserId) {
    return <AdminNotAuthorized />;
  }

  const params = await searchParams;
  const event = parseAuditEventFilter(params.event);
  const from = parseDateFilter(params.from, "start");
  const to = parseDateFilter(params.to, "end");
  const search = parseSearch(params.q);
  const filters = { event, from, to, search };
  const requestedPage = parsePage(params.page);

  let page = requestedPage;
  let result = await searchAuditLog(filters, page, ADMIN_PAGE_SIZE);

  if (result.entries.length === 0 && page > 1) {
    page = 1;
    result = await searchAuditLog(filters, page, ADMIN_PAGE_SIZE);
  }

  const { entries, totalCount } = result;
  const hasFilters = Boolean(event || from || to || search);
  const preservedParams: Record<string, string> = {};

  if (event) preservedParams.event = event;
  if (typeof params.from === "string" && from) preservedParams.from = params.from;
  if (typeof params.to === "string" && to) preservedParams.to = params.to;
  if (search) preservedParams.q = search;

  return (
    <>
      <div className="page-header">
        <h1>Events</h1>
        <p>
          {totalCount} audit {totalCount === 1 ? "event" : "events"} recorded by
          the portal.
        </p>
      </div>

      <form
        method="get"
        action="/admin/events"
        className="card"
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <label className="form-group" style={{ minWidth: "220px" }}>
          <span className="form-label">Event type</span>
          <select
            className="form-control"
            name="event"
            defaultValue={event ?? ""}
          >
            <option value="">All events</option>
            {AUDIT_EVENTS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-group">
          <span className="form-label">From</span>
          <input
            type="date"
            name="from"
            className="form-control"
            defaultValue={typeof params.from === "string" && from ? params.from : ""}
          />
        </label>
        <label className="form-group">
          <span className="form-label">To</span>
          <input
            type="date"
            name="to"
            className="form-control"
            defaultValue={typeof params.to === "string" && to ? params.to : ""}
          />
        </label>
        <label className="form-group" style={{ minWidth: "220px" }}>
          <span className="form-label">Search</span>
          <input
            type="search"
            name="q"
            className="form-control"
            placeholder="Support reference, email, app id..."
            defaultValue={search ?? ""}
          />
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" className="btn btn--secondary btn--sm">
            Apply Filters
          </button>
          {hasFilters ? (
            <Link href="/admin/events" className="btn btn--ghost btn--sm">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {entries.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__desc">
            {hasFilters
              ? "No events match your filters."
              : "No events recorded yet."}
          </p>
        </div>
      ) : (
        <div className="card">
          {entries.map((entry) => (
            <details
              key={entry.id}
              style={{ borderBottom: "1px solid var(--border-light)" }}
            >
              <summary
                style={{
                  padding: "0.625rem 0",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDateTime(entry.createdAt)}
                  </span>
                  <span className="badge badge--info">{entry.event}</span>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {summarizeDetails(entry.details)}
                  </span>
                </span>
              </summary>
              <pre
                style={{
                  background: "var(--surface-subtle, #f6f6f6)",
                  borderRadius: "var(--radius)",
                  padding: "0.75rem",
                  margin: "0 0 0.75rem",
                  fontSize: "0.8125rem",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalCount={totalCount}
        basePath="/admin/events"
        params={preservedParams}
      />
    </>
  );
}
