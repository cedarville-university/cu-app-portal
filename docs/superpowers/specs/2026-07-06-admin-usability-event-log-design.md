# Admin Area Restructure and Audit Event Log Viewer

**Date:** 2026-07-06
**Status:** Approved

## Problem

The admin page (`/admin`) renders every user and every app as heavy cards on one
long page. Each app card contains add-collaborator, reassign-owner,
remove-collaborator, and delete-resources forms. There is no search, filtering,
or pagination, so the page gets slower and harder to scan as data grows. The
new `AuditLog` table (added 2026-07-06) has no UI at all.

## Goals

- Split the admin area into focused sub-pages with a shared sub-nav.
- Add search, filtering, and pagination to all admin lists.
- Replace heavy app cards with a compact table plus a per-app detail page.
- Add an audit event log viewer over the `AuditLog` table.

## Non-Goals

- No changes to server actions, role logic, access control, or audit
  recording.
- No new CSS system; reuse existing classes (`card`, `badge`, `status-table`,
  `form-control`, `btn`, etc.).
- No status-filter dropdown on the apps table (search only, for now).
- No audit log retention or export tooling.

## Route Structure

`src/app/admin/layout.tsx` renders the breadcrumb and a sub-nav
(Users / Apps / Events) around all admin pages. The layout renders navigation
only — **every page keeps its own `getCurrentUserIdOrNull` + `isAdminUser`
guard**, because layouts do not re-run on client-side navigation. Non-admins
see the existing "Not Authorized" empty state.

| Route | Purpose |
| --- | --- |
| `/admin` | Slim hub: three cards with live counts (total users, total apps, events in the last 7 days) linking to the sub-pages. No management UI. |
| `/admin/users` | Searchable, paginated user table. |
| `/admin/apps` | Searchable, paginated app table; rows link to the detail page. |
| `/admin/apps/[id]` | Full admin management for one app. |
| `/admin/events` | Audit event log viewer. |

The current `/admin/page.tsx` content is decomposed into these pages; the old
single-page layout goes away.

## Search, Filters, Pagination

All list pages are server components driven by URL `searchParams`, using plain
GET forms (no client state):

- `?q=` — text search (users: name/email/GitHub username; apps: app name and
  owner name/email; events: event name and details payload).
- `?page=` — 1-based page number. Page size is 25. Out-of-range or malformed
  values clamp to valid pages.
- Events only: `?event=` (exact event type), `?from=` and `?to=` (date
  inputs; `from` means 00:00:00 of that day, `to` means 23:59:59.999 of that
  day, local server time).

Each page fetches only the current page of rows plus a total count. A shared
`Pagination` component renders prev/next links and "Page X of Y", preserving
the other query params. A shared search/filter form component submits via GET.

Query-param parsing (page clamping, date parsing, event validation) lives in a
small helper module under `src/features/admin/` with unit tests.

## Page Details

### `/admin/users`

Table columns: display name, email, GitHub username, owned app count,
collaborating app count, role badge, and the existing Make/Remove Admin
`PendingSubmitButton` form inline. Sorted by display name. Reuses
`grantAdminRoleAction` / `removeAdminRoleAction` unchanged.

### `/admin/apps`

Table columns: app name (links to `/admin/apps/[id]`), owner
(name + email), status badges (generation, repository, publish), created
date. Sorted newest first. The existing `StatusBadge`/`formatStatus`/
`statusVariant` helpers move to a shared module under `src/features/admin/`
so both the table and detail page use them.

### `/admin/apps/[id]`

Everything the current app card contains, with room to breathe:

- Header: app name, owner, created date, link to the user-facing
  `/download/[id]` page.
- Status badges and the status table (repository URL, publish URL,
  collaborators).
- Add collaborator (select excludes the current owner), reassign owner,
  remove collaborator — existing server actions bound unchanged.
- The `ConfirmDeleteForm` delete-resources panel, with `returnTo` set to
  `/admin/apps`.
- Unknown app id renders a not-found empty state linking back to
  `/admin/apps`.

### `/admin/events`

Newest-first table over `AuditLog`: timestamp (formatted date + time), event
type badge, and a compact summary (the first three key/value pairs of the
details payload, truncated). Each row is a `<details>` expansion showing the
pretty-printed JSON payload.

Filter bar (GET form): event type dropdown, from/to date inputs, text search
box, submit + clear.

**Event type list:** `src/lib/audit.ts` exports a new `AUDIT_EVENTS` const
array; the `AuditEvent` type is derived from it
(`type AuditEvent = (typeof AUDIT_EVENTS)[number]`), so the dropdown and the
type cannot drift apart. Recording behavior is unchanged.

**Query:** Prisma cannot text-search a whole JSONB column through its normal
filter API, so the events list/count queries live in a
`src/features/admin/audit-log.ts` helper using parameterized `$queryRaw`
(`details::text ILIKE '%' || $n || '%' OR event ILIKE ...`) combined with the
event/date filters. All values are bound parameters — no string-built SQL.
The helper is unit-tested (filter combinations, pagination math, empty
results).

## Error and Empty States

- Empty tables render the existing `empty-state` pattern with a short message
  ("No users match your search", "No events recorded yet", etc.).
- Invalid `?page=` clamps; invalid `?event=` or unparseable dates are ignored
  (treated as unset).
- Unknown app id on the detail page: not-found empty state.

## Testing

TDD throughout, matching existing patterns:

- Unit tests for the query-param helper and the `audit-log.ts` query builder.
- Page tests (`page.test.tsx` style with mocked `@/lib/db`) for each new
  page: guard behavior, rendering, search/filter/pagination wiring, empty
  states.
- Existing action and role tests continue to pass unchanged.
- `AUDIT_EVENTS` refactor covered by existing `audit.test.ts` plus a check
  that the array and recorded events stay consistent.
