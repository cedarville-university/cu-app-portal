# Admin Area Restructure and Audit Event Log Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `/admin` page into focused sub-pages (users, apps, events) with search/pagination, add per-user and per-app admin detail pages, and add an audit event log viewer over the `AuditLog` table.

**Architecture:** All pages are Next.js 15 App Router server components driven by URL `searchParams` (GET forms, no client state except the nav active-tab highlight). Shared helpers live in `src/features/admin/` (query-param parsing, audit-log raw query, status badges, pagination). Existing server actions are reused unchanged; one new admin action (`updateUserGithubUsernameAction`) is added.

**Tech Stack:** Next.js 15 (App Router, server components/actions), Prisma 6 + PostgreSQL, NextAuth v5, Vitest + Testing Library (jsdom), zod.

**Spec:** `docs/superpowers/specs/2026-07-06-admin-usability-event-log-design.md`

## Global Constraints

- TDD for every task: failing test first, watch it fail, minimal code, watch it pass, commit.
- Page size for all admin lists: 25 (`ADMIN_PAGE_SIZE`).
- Every admin page does its own guard: `getCurrentUserIdOrNull()` (redirect `/` when signed out) then `isAdminUser()` (render Not Authorized when not admin). The layout renders navigation only.
- Reuse existing CSS classes (`card`, `badge`, `status-table`, `status-row`, `form-control`, `btn`, `empty-state`, `page-header`, `breadcrumb`); the only CSS addition is the `.data-table` block in Task 7.
- All raw SQL uses `Prisma.sql` tagged templates with bound parameters — never string concatenation of user input.
- Run tests with `npx vitest run <path>`; full suite is `npm test`.
- Commit messages follow the repo's `feat:`/`fix:`/`docs:` convention and end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Existing tests must keep passing after every task.

---

### Task 1: `AUDIT_EVENTS` const array as the single source of truth

**Files:**
- Modify: `src/lib/audit.ts`
- Test: `src/lib/audit.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export const AUDIT_EVENTS: readonly string[]` (const-asserted tuple) and `export type AuditEvent = (typeof AUDIT_EVENTS)[number]`. Includes the new `"USER_PROFILE_UPDATED"` member used by Task 2. `recordAuditEvent(event, details)` behavior unchanged.

- [ ] **Step 1: Write the failing test**

Add to the existing `describe` block in `src/lib/audit.test.ts` (imports at top of file stay as they are):

```ts
  it("exports the audit event list including USER_PROFILE_UPDATED", async () => {
    const { AUDIT_EVENTS } = await import("./audit");

    expect(AUDIT_EVENTS).toContain("SIGN_IN");
    expect(AUDIT_EVENTS).toContain("ARTIFACT_DOWNLOADED");
    expect(AUDIT_EVENTS).toContain("USER_PROFILE_UPDATED");
    expect(new Set(AUDIT_EVENTS).size).toBe(AUDIT_EVENTS.length);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/audit.test.ts`
Expected: FAIL — `AUDIT_EVENTS` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/audit.ts`, replace the entire `export type AuditEvent = ...` union (keep the `import type { Prisma }` line and `recordAuditEvent` unchanged) with:

```ts
export const AUDIT_EVENTS = [
  "SIGN_IN",
  "APP_REQUEST_CREATED",
  "APP_REQUEST_SUCCEEDED",
  "APP_REQUEST_FAILED",
  "APP_DELETION_REQUESTED",
  "APP_DELETION_SUCCEEDED",
  "APP_DELETION_FAILED",
  "ARTIFACT_DOWNLOADED",
  "ADMIN_ROLE_GRANTED",
  "ADMIN_ROLE_REMOVED",
  "APP_COLLABORATOR_ADDED",
  "APP_COLLABORATOR_REMOVED",
  "COLLABORATION_INVITE_SENT",
  "COLLABORATION_INVITE_RESENT",
  "COLLABORATION_INVITE_REVOKED",
  "COLLABORATION_INVITE_ACCEPTED",
  "COLLABORATION_INVITE_EXPIRED",
  "APP_OWNER_REASSIGNED",
  "ADMIN_APP_DELETION_REQUESTED",
  "ADMIN_APP_DELETION_SUCCEEDED",
  "ADMIN_APP_DELETION_FAILED",
  "REPOSITORY_BOOTSTRAP_REQUESTED",
  "REPOSITORY_BOOTSTRAP_SUCCEEDED",
  "REPOSITORY_BOOTSTRAP_FAILED",
  "REPOSITORY_ACCESS_REQUESTED",
  "REPOSITORY_ACCESS_SUCCEEDED",
  "REPOSITORY_ACCESS_FAILED",
  "EXISTING_APP_ADD_REQUESTED",
  "EXISTING_APP_IMPORT_SUCCEEDED",
  "EXISTING_APP_IMPORT_FAILED",
  "REPOSITORY_PREPARATION_COMMITTED",
  "REPOSITORY_PREPARATION_PR_OPENED",
  "REPOSITORY_PREPARATION_VERIFIED",
  "REPOSITORY_PREPARATION_FAILED",
  "PUBLISH_REQUESTED",
  "PUBLISH_SUCCEEDED",
  "PUBLISH_FAILED",
  "NOTIFICATION_DELIVERY_FAILED",
  "NOTIFICATION_PREFERENCES_UPDATED",
  "PUSH_TO_DEPLOY_ENABLED",
  "USER_PROFILE_UPDATED",
] as const;

export type AuditEvent = (typeof AUDIT_EVENTS)[number];
```

The original union has exactly 40 members; this array is those 40 in the same order plus `USER_PROFILE_UPDATED`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/audit.test.ts && npx tsc --noEmit -p tsconfig.next.json`
Expected: tests PASS; no *new* type errors (the repo has pre-existing errors in `src/features/repository-imports/import-repository.test.ts` — ignore those, they are unrelated).

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts src/lib/audit.test.ts
git commit -m "feat: derive AuditEvent type from AUDIT_EVENTS const array"
```

---

### Task 2: `updateUserGithubUsernameAction` admin action + revalidate new admin paths

**Files:**
- Modify: `src/features/admin/actions.ts`
- Test: `src/features/admin/actions.test.ts`

**Interfaces:**
- Consumes: `requireAdminUserId()` from `./roles`; `parseGitHubUsername(value: unknown): string` (zod, throws on invalid) from `@/features/repositories/access`; `recordAuditEvent` from `@/lib/audit`; `"USER_PROFILE_UPDATED"` from Task 1.
- Produces: `updateUserGithubUsernameAction(userId: string, formData: FormData): Promise<void>` — sets or clears `user.githubUsername`. Task 9's page binds it as `updateUserGithubUsernameAction.bind(null, user.id)`.

- [ ] **Step 1: Write the failing tests**

In `src/features/admin/actions.test.ts`: add `updateUserGithubUsernameAction` to the existing import from `./actions`, add `update: vi.fn()` to the `user` mock object in the `vi.mock("@/lib/db", ...)` factory (next to `findUnique`), then add this describe block at the end of the file:

```ts
describe("updateUserGithubUsernameAction", () => {
  it("updates the github username and records an audit event", async () => {
    vi.mocked(requireAdminUserId).mockResolvedValueOnce(adminUserId);
    mockUser();
    const formData = new FormData();
    formData.set("githubUsername", "octocat");

    await updateUserGithubUsernameAction(targetUserId, formData);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: targetUserId },
      data: { githubUsername: "octocat" },
    });
    expect(recordAuditEvent).toHaveBeenCalledWith("USER_PROFILE_UPDATED", {
      actorUserId: adminUserId,
      targetUserId,
      githubUsername: "octocat",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/users/${targetUserId}`);
  });

  it("clears the github username when the input is empty", async () => {
    vi.mocked(requireAdminUserId).mockResolvedValueOnce(adminUserId);
    mockUser();
    const formData = new FormData();
    formData.set("githubUsername", "   ");

    await updateUserGithubUsernameAction(targetUserId, formData);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: targetUserId },
      data: { githubUsername: null },
    });
  });

  it("rejects an invalid github username without saving", async () => {
    vi.mocked(requireAdminUserId).mockResolvedValueOnce(adminUserId);
    mockUser();
    const formData = new FormData();
    formData.set("githubUsername", "not a valid username!");

    await expect(
      updateUserGithubUsernameAction(targetUserId, formData),
    ).rejects.toThrow();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("requires the target user to exist", async () => {
    vi.mocked(requireAdminUserId).mockResolvedValueOnce(adminUserId);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    const formData = new FormData();
    formData.set("githubUsername", "octocat");

    await expect(
      updateUserGithubUsernameAction(targetUserId, formData),
    ).rejects.toThrow("User not found.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/admin/actions.test.ts`
Expected: FAIL — `updateUserGithubUsernameAction` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/features/admin/actions.ts`:

Add to the imports:

```ts
import { parseGitHubUsername } from "@/features/repositories/access";
```

Add at the end of the file:

```ts
function parseOptionalGitHubUsername(formData: FormData) {
  const rawValue = formData.get("githubUsername");

  if (rawValue == null || String(rawValue).trim().length === 0) {
    return null;
  }

  return parseGitHubUsername(rawValue);
}

export async function updateUserGithubUsernameAction(
  userId: string,
  formData: FormData,
) {
  const actorUserId = await requireAdminUserId();

  await ensureUserExists(userId);
  const githubUsername = parseOptionalGitHubUsername(formData);

  await prisma.user.update({
    where: { id: userId },
    data: { githubUsername },
  });
  await recordAuditEvent("USER_PROFILE_UPDATED", {
    actorUserId,
    targetUserId: userId,
    githubUsername,
  });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}
```

Also update `revalidateAdminViews` so existing actions refresh the new sub-pages:

```ts
function revalidateAdminViews(appRequestId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/admin/apps");
  revalidatePath("/apps");

  if (appRequestId) {
    revalidatePath(`/admin/apps/${appRequestId}`);
    revalidatePath(`/download/${appRequestId}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/admin/actions.test.ts`
Expected: PASS (all existing tests in the file still pass — they assert specific `revalidatePath` calls with `toHaveBeenCalledWith`, which is unaffected by additional calls; if any test asserts call *counts*, update the expected count).

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/actions.ts src/features/admin/actions.test.ts
git commit -m "feat: add admin github username update action"
```

---

### Task 3: Query-param parsing helpers

**Files:**
- Create: `src/features/admin/query-params.ts`
- Test: `src/features/admin/query-params.test.ts`

**Interfaces:**
- Consumes: `AUDIT_EVENTS`, `AuditEvent` from `@/lib/audit` (Task 1).
- Produces (used by every list page, Tasks 8–12):
  - `ADMIN_PAGE_SIZE = 25`
  - `parsePage(value: string | string[] | undefined): number` — positive int, defaults 1
  - `clampPage(page: number, totalCount: number, pageSize?: number): number`
  - `totalPages(totalCount: number, pageSize?: number): number` — minimum 1
  - `parseSearch(value: string | string[] | undefined): string | null`
  - `parseAuditEventFilter(value: string | string[] | undefined): AuditEvent | null`
  - `parseDateFilter(value: string | string[] | undefined, boundary: "start" | "end"): Date | null`

- [ ] **Step 1: Write the failing tests**

Create `src/features/admin/query-params.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ADMIN_PAGE_SIZE,
  clampPage,
  parseAuditEventFilter,
  parseDateFilter,
  parsePage,
  parseSearch,
  totalPages,
} from "./query-params";

describe("parsePage", () => {
  it("parses a positive page number", () => {
    expect(parsePage("3")).toBe(3);
  });

  it.each([undefined, "", "0", "-2", "abc", "1.5", ["2", "3"]])(
    "defaults to 1 for %j",
    (value) => {
      expect(parsePage(value as string | string[] | undefined)).toBe(1);
    },
  );
});

describe("totalPages and clampPage", () => {
  it("computes total pages with a minimum of 1", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(25)).toBe(1);
    expect(totalPages(26)).toBe(2);
  });

  it("clamps out-of-range pages", () => {
    expect(clampPage(9, 26)).toBe(2);
    expect(clampPage(1, 0)).toBe(1);
  });
});

describe("parseSearch", () => {
  it("trims and returns the search text", () => {
    expect(parseSearch("  SUP-123  ")).toBe("SUP-123");
  });

  it.each([undefined, "", "   ", ["a", "b"]])("returns null for %j", (value) => {
    expect(parseSearch(value as string | string[] | undefined)).toBeNull();
  });
});

describe("parseAuditEventFilter", () => {
  it("accepts a known audit event", () => {
    expect(parseAuditEventFilter("SIGN_IN")).toBe("SIGN_IN");
  });

  it.each([undefined, "", "NOT_AN_EVENT", ["SIGN_IN"]])(
    "returns null for %j",
    (value) => {
      expect(
        parseAuditEventFilter(value as string | string[] | undefined),
      ).toBeNull();
    },
  );
});

describe("parseDateFilter", () => {
  it("parses a start-of-day boundary", () => {
    const date = parseDateFilter("2026-07-01", "start");

    expect(date).toEqual(new Date("2026-07-01T00:00:00"));
  });

  it("parses an end-of-day boundary", () => {
    const date = parseDateFilter("2026-07-01", "end");

    expect(date).toEqual(new Date("2026-07-01T23:59:59.999"));
  });

  it.each([undefined, "", "07/01/2026", "2026-13-45", ["2026-07-01"]])(
    "returns null for %j",
    (value) => {
      expect(
        parseDateFilter(value as string | string[] | undefined, "start"),
      ).toBeNull();
    },
  );
});

describe("ADMIN_PAGE_SIZE", () => {
  it("is 25", () => {
    expect(ADMIN_PAGE_SIZE).toBe(25);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/admin/query-params.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/admin/query-params.ts`:

```ts
import { AUDIT_EVENTS, type AuditEvent } from "@/lib/audit";

export const ADMIN_PAGE_SIZE = 25;

type ParamValue = string | string[] | undefined;

function single(value: ParamValue): string | null {
  return typeof value === "string" ? value : null;
}

export function parsePage(value: ParamValue): number {
  const raw = single(value);

  if (!raw || !/^\d+$/.test(raw)) {
    return 1;
  }

  const page = Number.parseInt(raw, 10);

  return page >= 1 ? page : 1;
}

export function totalPages(totalCount: number, pageSize = ADMIN_PAGE_SIZE) {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

export function clampPage(
  page: number,
  totalCount: number,
  pageSize = ADMIN_PAGE_SIZE,
) {
  return Math.min(Math.max(1, page), totalPages(totalCount, pageSize));
}

export function parseSearch(value: ParamValue): string | null {
  const raw = single(value)?.trim();

  return raw ? raw : null;
}

export function parseAuditEventFilter(value: ParamValue): AuditEvent | null {
  const raw = single(value);

  if (raw && (AUDIT_EVENTS as readonly string[]).includes(raw)) {
    return raw as AuditEvent;
  }

  return null;
}

export function parseDateFilter(
  value: ParamValue,
  boundary: "start" | "end",
): Date | null {
  const raw = single(value);

  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const time = boundary === "start" ? "00:00:00" : "23:59:59.999";
  const date = new Date(`${raw}T${time}`);

  return Number.isNaN(date.getTime()) ? null : date;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/admin/query-params.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/query-params.ts src/features/admin/query-params.test.ts
git commit -m "feat: add admin list query-param parsing helpers"
```

---

### Task 4: Audit log query helper (`searchAuditLog`) and details summarizer

**Files:**
- Create: `src/features/admin/audit-log.ts`
- Test: `src/features/admin/audit-log.test.ts`

**Interfaces:**
- Consumes: `prisma.$queryRaw` from `@/lib/db`; `Prisma.sql`/`Prisma.join`/`Prisma.empty` from `@prisma/client`; `AuditEvent` from `@/lib/audit`.
- Produces (used by Task 12):
  - `type AuditLogFilters = { event: AuditEvent | null; from: Date | null; to: Date | null; search: string | null }`
  - `type AuditLogEntry = { id: string; event: string; details: unknown; createdAt: Date }`
  - `searchAuditLog(filters: AuditLogFilters, page: number, pageSize: number): Promise<{ entries: AuditLogEntry[]; totalCount: number }>`
  - `summarizeDetails(details: unknown): string` — first 3 key/value pairs, truncated to 120 chars

- [ ] **Step 1: Write the failing tests**

Create `src/features/admin/audit-log.test.ts`:

```ts
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { searchAuditLog, summarizeDetails } from "./audit-log";

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

const noFilters = { event: null, from: null, to: null, search: null } as const;

function queryArg(callIndex: number): Prisma.Sql {
  return vi.mocked(prisma.$queryRaw).mock.calls[callIndex][0] as Prisma.Sql;
}

describe("searchAuditLog", () => {
  beforeEach(() => {
    vi.mocked(prisma.$queryRaw).mockReset();
  });

  it("returns entries and a numeric total count", async () => {
    const createdAt = new Date("2026-07-06T12:00:00.000Z");
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([
        { id: "a1", event: "SIGN_IN", details: { x: 1 }, createdAt },
      ])
      .mockResolvedValueOnce([{ count: 1n }]);

    const result = await searchAuditLog(noFilters, 1, 25);

    expect(result.entries).toEqual([
      { id: "a1", event: "SIGN_IN", details: { x: 1 }, createdAt },
    ]);
    expect(result.totalCount).toBe(1);
  });

  it("applies no WHERE clause when there are no filters", async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);

    await searchAuditLog(noFilters, 1, 25);

    expect(queryArg(0).sql).not.toContain("WHERE");
  });

  it("binds event, date range, and search filters as parameters", async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);
    const from = new Date("2026-07-01T00:00:00");
    const to = new Date("2026-07-06T23:59:59.999");

    await searchAuditLog(
      { event: "SIGN_IN", from, to, search: "SUP-123" },
      1,
      25,
    );

    const listQuery = queryArg(0);

    expect(listQuery.sql).toContain("WHERE");
    expect(listQuery.sql).toContain("ILIKE");
    expect(listQuery.values).toContain("SIGN_IN");
    expect(listQuery.values).toContain(from);
    expect(listQuery.values).toContain(to);
    expect(listQuery.values).toContain("%SUP-123%");
    // Raw user input must only appear as a bound value, never in the SQL text.
    expect(listQuery.sql).not.toContain("SUP-123");

    const countQuery = queryArg(1);

    expect(countQuery.sql).toContain("COUNT");
    expect(countQuery.values).toContain("%SUP-123%");
  });

  it("paginates with LIMIT and OFFSET", async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 60n }]);

    await searchAuditLog(noFilters, 3, 25);

    const listQuery = queryArg(0);

    expect(listQuery.sql).toContain("LIMIT");
    expect(listQuery.sql).toContain("OFFSET");
    expect(listQuery.values).toContain(25);
    expect(listQuery.values).toContain(50);
  });
});

describe("summarizeDetails", () => {
  it("shows the first three key/value pairs", () => {
    expect(
      summarizeDetails({ a: "1", b: 2, c: "3", d: "4" }),
    ).toBe("a: 1, b: 2, c: 3");
  });

  it("truncates long summaries to 120 characters", () => {
    const summary = summarizeDetails({ key: "x".repeat(200) });

    expect(summary.length).toBe(120);
    expect(summary.endsWith("...")).toBe(true);
  });

  it.each([null, undefined, "text", 42, ["a"]])(
    "returns an empty string for non-object details %j",
    (details) => {
      expect(summarizeDetails(details)).toBe("");
    },
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/admin/audit-log.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/admin/audit-log.ts`:

```ts
import { Prisma } from "@prisma/client";
import type { AuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

export type AuditLogFilters = {
  event: AuditEvent | null;
  from: Date | null;
  to: Date | null;
  search: string | null;
};

export type AuditLogEntry = {
  id: string;
  event: string;
  details: unknown;
  createdAt: Date;
};

function whereClause(filters: AuditLogFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (filters.event) {
    conditions.push(Prisma.sql`"event" = ${filters.event}`);
  }

  if (filters.from) {
    conditions.push(Prisma.sql`"createdAt" >= ${filters.from}`);
  }

  if (filters.to) {
    conditions.push(Prisma.sql`"createdAt" <= ${filters.to}`);
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      Prisma.sql`("event" ILIKE ${pattern} OR "details"::text ILIKE ${pattern})`,
    );
  }

  if (conditions.length === 0) {
    return Prisma.empty;
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}

export async function searchAuditLog(
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): Promise<{ entries: AuditLogEntry[]; totalCount: number }> {
  const where = whereClause(filters);
  const offset = (page - 1) * pageSize;

  const entries = await prisma.$queryRaw<AuditLogEntry[]>(
    Prisma.sql`SELECT "id", "event", "details", "createdAt" FROM "AuditLog" ${where} ORDER BY "createdAt" DESC LIMIT ${pageSize} OFFSET ${offset}`,
  );
  const countRows = await prisma.$queryRaw<{ count: bigint }[]>(
    Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "AuditLog" ${where}`,
  );

  return {
    entries,
    totalCount: Number(countRows[0]?.count ?? 0n),
  };
}

const SUMMARY_MAX_LENGTH = 120;

export function summarizeDetails(details: unknown): string {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "";
  }

  const summary = Object.entries(details)
    .slice(0, 3)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
    )
    .join(", ");

  if (summary.length <= SUMMARY_MAX_LENGTH) {
    return summary;
  }

  return `${summary.slice(0, SUMMARY_MAX_LENGTH - 3)}...`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/admin/audit-log.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/audit-log.ts src/features/admin/audit-log.test.ts
git commit -m "feat: add parameterized audit log search helper"
```

---

### Task 5: Shared status/format helpers module

**Files:**
- Create: `src/features/admin/status.tsx`
- Test: `src/features/admin/status.test.tsx`

**Interfaces:**
- Consumes: nothing project-specific (pure functions + one component).
- Produces (used by Tasks 8–13; these are the exact helpers currently defined privately in `src/app/admin/page.tsx`, moved verbatim, plus a new `formatDateTime`):
  - `formatStatus(status: string | null | undefined): string`
  - `statusVariant(status: string | null | undefined): "success" | "error" | "warning" | "info" | "default"`
  - `StatusBadge({ label, status }: { label: string; status: string }): JSX element`
  - `userLabel(user: { displayName: string; email: string }): string`
  - `createdDate(date: Date): string` (e.g. "Jul 6, 2026")
  - `formatDateTime(date: Date): string` (e.g. "Jul 6, 2026, 1:05 PM")

- [ ] **Step 1: Write the failing tests**

Create `src/features/admin/status.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import {
  createdDate,
  formatDateTime,
  formatStatus,
  StatusBadge,
  statusVariant,
  userLabel,
} from "./status";

describe("formatStatus", () => {
  it("lowercases and replaces underscores", () => {
    expect(formatStatus("NOT_STARTED")).toBe("not started");
  });

  it("labels missing statuses as not checked", () => {
    expect(formatStatus(null)).toBe("Not checked");
  });
});

describe("statusVariant", () => {
  it.each([
    ["READY", "success"],
    ["FAILED", "error"],
    ["PENDING", "warning"],
    ["DELETED", "default"],
    ["SOMETHING_ELSE", "info"],
  ])("maps %s to %s", (status, variant) => {
    expect(statusVariant(status)).toBe(variant);
  });
});

describe("StatusBadge", () => {
  it("renders the label and formatted status", () => {
    render(<StatusBadge label="Published" status="SUCCEEDED" />);

    const badge = screen.getByText("Published: succeeded");

    expect(badge.className).toContain("badge--success");
  });
});

describe("labels and dates", () => {
  it("formats a user label", () => {
    expect(
      userLabel({ displayName: "Test User", email: "t@cedarville.edu" }),
    ).toBe("Test User (t@cedarville.edu)");
  });

  it("formats a created date", () => {
    expect(createdDate(new Date("2026-07-06T12:00:00"))).toBe("Jul 6, 2026");
  });

  it("formats a date with time", () => {
    expect(formatDateTime(new Date("2026-07-06T13:05:00"))).toContain(
      "Jul 6, 2026",
    );
    expect(formatDateTime(new Date("2026-07-06T13:05:00"))).toContain("1:05");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/admin/status.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/admin/status.tsx` (the first three helpers are moved verbatim from `src/app/admin/page.tsx` — do not modify that page yet; it is rewritten in Task 13):

```tsx
import React from "react";

export type BadgeVariant = "success" | "error" | "warning" | "info" | "default";

export function formatStatus(status: string | null | undefined) {
  if (!status) return "Not checked";

  return status.toLowerCase().replaceAll("_", " ");
}

export function statusVariant(status: string | null | undefined): BadgeVariant {
  const normalized = status?.toLowerCase();

  if (
    normalized === "ready" ||
    normalized === "succeeded" ||
    normalized === "completed" ||
    normalized === "granted"
  ) {
    return "success";
  }
  if (normalized === "failed" || normalized === "blocked") return "error";
  if (
    normalized === "queued" ||
    normalized === "pending" ||
    normalized === "provisioning" ||
    normalized === "deploying"
  ) {
    return "warning";
  }
  if (normalized === "deleted" || normalized === "not_started") {
    return "default";
  }

  return "info";
}

export function StatusBadge({ label, status }: { label: string; status: string }) {
  return (
    <span className={`badge badge--${statusVariant(status)}`}>
      {label}: {formatStatus(status)}
    </span>
  );
}

export function userLabel(user: { displayName: string; email: string }) {
  return `${user.displayName} (${user.email})`;
}

export function createdDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/admin/status.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/status.tsx src/features/admin/status.test.tsx
git commit -m "feat: add shared admin status and date helpers"
```

---

### Task 6: `Pagination` and `AdminSearchForm` components

**Files:**
- Create: `src/features/admin/pagination.tsx`
- Create: `src/features/admin/search-form.tsx`
- Test: `src/features/admin/pagination.test.tsx`
- Test: `src/features/admin/search-form.test.tsx`

**Interfaces:**
- Consumes: `totalPages` from `./query-params` (Task 3).
- Produces (used by Tasks 8, 10, 12):
  - `Pagination({ page, totalCount, pageSize, basePath, params }: { page: number; totalCount: number; pageSize?: number; basePath: string; params?: Record<string, string> })` — server component; renders nothing when there is one page; otherwise "Page X of Y" with Previous/Next links that preserve `params`.
  - `AdminSearchForm({ basePath, defaultValue, placeholder }: { basePath: string; defaultValue: string | null; placeholder: string })` — GET form with an input named `q`, a Search submit button, and a Clear link when a search is active.

- [ ] **Step 1: Write the failing tests**

Create `src/features/admin/pagination.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(
      <Pagination page={1} totalCount={10} basePath="/admin/users" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current page and next link preserving params", () => {
    render(
      <Pagination
        page={1}
        totalCount={60}
        basePath="/admin/users"
        params={{ q: "smith" }}
      />,
    );

    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Previous" })).toBeNull();

    const next = screen.getByRole("link", { name: "Next" });

    expect(next).toHaveAttribute("href", "/admin/users?q=smith&page=2");
  });

  it("shows a previous link on later pages", () => {
    render(<Pagination page={3} totalCount={60} basePath="/admin/users" />);

    const previous = screen.getByRole("link", { name: "Previous" });

    expect(previous).toHaveAttribute("href", "/admin/users?page=2");
    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
  });
});
```

Create `src/features/admin/search-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { AdminSearchForm } from "./search-form";

describe("AdminSearchForm", () => {
  it("renders a GET form with the current search value", () => {
    render(
      <AdminSearchForm
        basePath="/admin/users"
        defaultValue="smith"
        placeholder="Search users"
      />,
    );

    const input = screen.getByPlaceholderText("Search users");

    expect(input).toHaveAttribute("name", "q");
    expect(input).toHaveValue("smith");
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });

  it("omits the clear link when no search is active", () => {
    render(
      <AdminSearchForm
        basePath="/admin/users"
        defaultValue={null}
        placeholder="Search users"
      />,
    );

    expect(screen.queryByRole("link", { name: "Clear" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/admin/pagination.test.tsx src/features/admin/search-form.test.tsx`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Write minimal implementations**

Create `src/features/admin/pagination.tsx`:

```tsx
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
```

Create `src/features/admin/search-form.tsx`:

```tsx
import Link from "next/link";
import React from "react";

export function AdminSearchForm({
  basePath,
  defaultValue,
  placeholder,
}: {
  basePath: string;
  defaultValue: string | null;
  placeholder: string;
}) {
  return (
    <form
      method="get"
      action={basePath}
      style={{
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        marginBottom: "1rem",
        flexWrap: "wrap",
      }}
    >
      <input
        type="search"
        name="q"
        className="form-control"
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        style={{ maxWidth: "320px" }}
      />
      <button type="submit" className="btn btn--secondary btn--sm">
        Search
      </button>
      {defaultValue ? (
        <Link href={basePath} className="btn btn--ghost btn--sm">
          Clear
        </Link>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/admin/pagination.test.tsx src/features/admin/search-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/pagination.tsx src/features/admin/pagination.test.tsx src/features/admin/search-form.tsx src/features/admin/search-form.test.tsx
git commit -m "feat: add admin pagination and search form components"
```

---

### Task 7: Admin guard helper, sub-nav, layout, and table CSS

**Files:**
- Create: `src/features/admin/guard.tsx`
- Create: `src/features/admin/admin-nav.tsx`
- Create: `src/app/admin/layout.tsx`
- Modify: `src/app/globals.css` (append `.data-table` block)
- Test: `src/features/admin/guard.test.tsx`
- Test: `src/features/admin/admin-nav.test.tsx`

**Interfaces:**
- Consumes: `getCurrentUserIdOrNull` from `@/features/app-requests/current-user`; `isAdminUser` from `@/features/admin/roles`; `redirect` from `next/navigation`; `usePathname` from `next/navigation` (client).
- Produces (used by Tasks 8–13):
  - `getAdminUserIdOrNull(): Promise<string | null>` — redirects to `/` when signed out; returns null when signed in but not admin.
  - `AdminNotAuthorized()` — the Not Authorized empty state (no breadcrumb; the layout owns that).
  - `AdminNav()` — client component highlighting the active tab.
  - Admin layout wraps all `/admin/*` pages in `<main>` + breadcrumb + `AdminNav`; **pages must not render their own `<main>` or breadcrumb**.

- [ ] **Step 1: Write the failing tests**

Create `src/features/admin/guard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isAdminUser } from "@/features/admin/roles";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";
import { AdminNotAuthorized, getAdminUserIdOrNull } from "./guard";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/features/admin/roles", () => ({
  isAdminUser: vi.fn(),
}));

vi.mock("@/features/app-requests/current-user", () => ({
  getCurrentUserIdOrNull: vi.fn(),
}));

describe("getAdminUserIdOrNull", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUserIdOrNull).mockReset();
    vi.mocked(isAdminUser).mockReset();
  });

  it("redirects to home when signed out", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue(null);

    await expect(getAdminUserIdOrNull()).rejects.toThrow("REDIRECT:/");
  });

  it("returns null for a signed-in non-admin", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("user-1");
    vi.mocked(isAdminUser).mockResolvedValue(false);

    await expect(getAdminUserIdOrNull()).resolves.toBeNull();
  });

  it("returns the user id for an admin", async () => {
    vi.mocked(getCurrentUserIdOrNull).mockResolvedValue("admin-1");
    vi.mocked(isAdminUser).mockResolvedValue(true);

    await expect(getAdminUserIdOrNull()).resolves.toBe("admin-1");
  });
});

describe("AdminNotAuthorized", () => {
  it("renders the not authorized empty state", () => {
    render(<AdminNotAuthorized />);

    expect(screen.getByText("Not Authorized")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My Apps" })).toHaveAttribute(
      "href",
      "/apps",
    );
  });
});
```

Create `src/features/admin/admin-nav.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminNav } from "./admin-nav";

const usePathnameMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

describe("AdminNav", () => {
  it("renders links to all admin sections", () => {
    usePathnameMock.mockReturnValue("/admin");
    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    expect(screen.getByRole("link", { name: "Apps" })).toHaveAttribute(
      "href",
      "/admin/apps",
    );
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute(
      "href",
      "/admin/events",
    );
  });

  it("marks the current section active", () => {
    usePathnameMock.mockReturnValue("/admin/users/user-123");
    render(<AdminNav />);

    expect(
      screen.getByRole("link", { name: "Users" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/admin/guard.test.tsx src/features/admin/admin-nav.test.tsx`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Write minimal implementations**

Create `src/features/admin/guard.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import React from "react";
import { isAdminUser } from "@/features/admin/roles";
import { getCurrentUserIdOrNull } from "@/features/app-requests/current-user";

export async function getAdminUserIdOrNull() {
  const userId = await getCurrentUserIdOrNull();

  if (!userId) {
    redirect("/");
  }

  return (await isAdminUser(userId)) ? userId : null;
}

export function AdminNotAuthorized() {
  return (
    <div className="empty-state">
      <h1 className="empty-state__title">Not Authorized</h1>
      <p className="empty-state__desc">
        You do not have permission to use the admin tools.
      </p>
      <Link href="/apps" className="btn btn--primary-solid">
        Go to My Apps
      </Link>
    </div>
  );
}
```

Create `src/features/admin/admin-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const TABS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/users", label: "Users", exact: false },
  { href: "/admin/apps", label: "Apps", exact: false },
  { href: "/admin/events", label: "Events", exact: false },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        marginBottom: "1.5rem",
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`btn btn--sm ${isActive ? "btn--secondary-solid" : "btn--ghost"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

Create `src/app/admin/layout.tsx`:

```tsx
import Link from "next/link";
import React from "react";
import { AdminNav } from "@/features/admin/admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link href="/">Home</Link>
        <span className="breadcrumb__sep" aria-hidden="true">
          /
        </span>
        <span aria-current="page">Admin</span>
      </nav>
      <AdminNav />
      {children}
    </main>
  );
}
```

Append to the end of `src/app/globals.css`:

```css
/* ─── Admin Data Table ─── */

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}

.data-table th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid var(--border-light);
  white-space: nowrap;
}

.data-table td {
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--border-light);
  vertical-align: top;
}

.data-table tr:last-child td {
  border-bottom: none;
}
```

Note: the old `/admin/page.tsx` still renders its own `<main>` and breadcrumb inside this layout until Task 13 replaces it. That temporary nesting is cosmetic and expected.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/admin/guard.test.tsx src/features/admin/admin-nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/guard.tsx src/features/admin/guard.test.tsx src/features/admin/admin-nav.tsx src/features/admin/admin-nav.test.tsx src/app/admin/layout.tsx src/app/globals.css
git commit -m "feat: add admin layout, sub-nav, guard helper, and table styles"
```

---

### Task 8: `/admin/users` — searchable, paginated user table

**Files:**
- Create: `src/app/admin/users/page.tsx`
- Test: `src/app/admin/users/page.test.tsx`

**Interfaces:**
- Consumes: `getAdminUserIdOrNull`/`AdminNotAuthorized` (Task 7), `parsePage`/`parseSearch`/`clampPage`/`ADMIN_PAGE_SIZE` (Task 3), `Pagination` (Task 6), `AdminSearchForm` (Task 6), `grantAdminRoleAction`/`removeAdminRoleAction` (existing), `PendingSubmitButton` (existing), `prisma`.
- Produces: the users list page. Display names link to `/admin/users/[id]` (Task 9).

- [ ] **Step 1: Write the failing test**

Create `src/app/admin/users/page.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminUserIdOrNull } from "@/features/admin/guard";
import { prisma } from "@/lib/db";
import AdminUsersPage from "./page";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("@/features/admin/guard", () => ({
  getAdminUserIdOrNull: vi.fn(),
  AdminNotAuthorized: () => <div>Not Authorized</div>,
}));

vi.mock("@/features/admin/actions", () => ({
  grantAdminRoleAction: vi.fn(),
  removeAdminRoleAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

function mockUsers() {
  vi.mocked(prisma.user.count).mockResolvedValue(2);
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    {
      id: "user-1",
      displayName: "Ada Admin",
      email: "ada@cedarville.edu",
      githubUsername: "ada",
      roles: [{ role: "ADMIN" }],
      _count: { appRequests: 3, appAccess: 1 },
    },
    {
      id: "user-2",
      displayName: "Norm Normal",
      email: "norm@cedarville.edu",
      githubUsername: null,
      roles: [],
      _count: { appRequests: 0, appAccess: 2 },
    },
  ] as unknown as Awaited<ReturnType<typeof prisma.user.findMany>>);
}

describe("AdminUsersPage", () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({ pending: false });
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    vi.mocked(prisma.user.count).mockReset();
    vi.mocked(prisma.user.findMany).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the not authorized state for non-admins", async () => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue(null);

    render(await AdminUsersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Not Authorized")).toBeInTheDocument();
  });

  it("renders users with links to their detail pages", async () => {
    mockUsers();

    render(await AdminUsersPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("link", { name: "Ada Admin" })).toHaveAttribute(
      "href",
      "/admin/users/user-1",
    );
    expect(screen.getByText("ada@cedarville.edu")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Admin" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Make Admin" }),
    ).toBeInTheDocument();
  });

  it("filters by the q search param", async () => {
    mockUsers();

    render(
      await AdminUsersPage({ searchParams: Promise.resolve({ q: "ada" }) }),
    );

    expect(vi.mocked(prisma.user.count)).toHaveBeenCalledWith({
      where: {
        OR: [
          { displayName: { contains: "ada", mode: "insensitive" } },
          { email: { contains: "ada", mode: "insensitive" } },
          { githubUsername: { contains: "ada", mode: "insensitive" } },
        ],
      },
    });
    const findManyArgs = vi.mocked(prisma.user.findMany).mock.calls[0][0];

    expect(findManyArgs).toMatchObject({ skip: 0, take: 25 });
  });

  it("shows an empty state when no users match", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(0);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    render(
      await AdminUsersPage({ searchParams: Promise.resolve({ q: "zz" }) }),
    );

    expect(screen.getByText("No users match your search.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/admin/users/page.test.tsx`
Expected: FAIL — page module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/admin/users/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/admin/users/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/users/page.tsx src/app/admin/users/page.test.tsx
git commit -m "feat: add searchable paginated admin users page"
```

---

### Task 9: `/admin/users/[id]` — user detail page

**Files:**
- Create: `src/app/admin/users/[id]/page.tsx`
- Test: `src/app/admin/users/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `getAdminUserIdOrNull`/`AdminNotAuthorized` (Task 7), `updateUserGithubUsernameAction` (Task 2), `grantAdminRoleAction`/`removeAdminRoleAction` (existing), `StatusBadge`/`createdDate` (Task 5), `PendingSubmitButton` (existing), `prisma`.
- Produces: the user detail page linked from Task 8. App entries link to `/admin/apps/[id]` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `src/app/admin/users/[id]/page.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminUserIdOrNull } from "@/features/admin/guard";
import { prisma } from "@/lib/db";
import AdminUserDetailPage from "./page";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("@/features/admin/guard", () => ({
  getAdminUserIdOrNull: vi.fn(),
  AdminNotAuthorized: () => <div>Not Authorized</div>,
}));

vi.mock("@/features/admin/actions", () => ({
  grantAdminRoleAction: vi.fn(),
  removeAdminRoleAction: vi.fn(),
  updateUserGithubUsernameAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

function mockUserDetail() {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user-1",
    displayName: "Ada Admin",
    email: "ada@cedarville.edu",
    githubUsername: "ada",
    createdAt: new Date("2026-01-15T12:00:00"),
    roles: [{ role: "ADMIN" }],
    appRequests: [
      {
        id: "app-1",
        appName: "Campus Dashboard",
        generationStatus: "SUCCEEDED",
        repositoryStatus: "READY",
        publishStatus: "SUCCEEDED",
        createdAt: new Date("2026-02-01T12:00:00"),
      },
    ],
    appAccess: [
      {
        appRequest: {
          id: "app-2",
          appName: "Event Tracker",
          generationStatus: "SUCCEEDED",
          repositoryStatus: "READY",
          publishStatus: "NOT_STARTED",
          createdAt: new Date("2026-03-01T12:00:00"),
        },
      },
    ],
  } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
}

describe("AdminUserDetailPage", () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({ pending: false });
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the not authorized state for non-admins", async () => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue(null);

    render(
      await AdminUserDetailPage({
        params: Promise.resolve({ id: "user-1" }),
      }),
    );

    expect(screen.getByText("Not Authorized")).toBeInTheDocument();
  });

  it("renders a not found state for unknown users", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    render(
      await AdminUserDetailPage({
        params: Promise.resolve({ id: "missing" }),
      }),
    );

    expect(screen.getByText("User Not Found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Users" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });

  it("renders identity, github form, role toggle, and app lists", async () => {
    mockUserDetail();

    render(
      await AdminUserDetailPage({
        params: Promise.resolve({ id: "user-1" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Ada Admin" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ada@cedarville.edu")).toBeInTheDocument();
    expect(screen.getByText(/synced from Entra/i)).toBeInTheDocument();

    const githubInput = screen.getByLabelText("GitHub username");

    expect(githubInput).toHaveAttribute("name", "githubUsername");
    expect(githubInput).toHaveValue("ada");
    expect(
      screen.getByRole("button", { name: "Save GitHub Username" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Admin" }),
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Campus Dashboard" })).toHaveAttribute(
      "href",
      "/admin/apps/app-1",
    );
    expect(screen.getByRole("link", { name: "Event Tracker" })).toHaveAttribute(
      "href",
      "/admin/apps/app-2",
    );
  });

  it("shows empty states when the user has no apps", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-2",
      displayName: "Norm Normal",
      email: "norm@cedarville.edu",
      githubUsername: null,
      createdAt: new Date("2026-01-15T12:00:00"),
      roles: [],
      appRequests: [],
      appAccess: [],
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    render(
      await AdminUserDetailPage({
        params: Promise.resolve({ id: "user-2" }),
      }),
    );

    expect(screen.getByText("No apps owned.")).toBeInTheDocument();
    expect(screen.getByText("No collaborations.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/admin/users/[id]/page.test.tsx"`
Expected: FAIL — page module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/admin/users/[id]/page.tsx`:

```tsx
import Link from "next/link";
import React from "react";
import {
  grantAdminRoleAction,
  removeAdminRoleAction,
  updateUserGithubUsernameAction,
} from "@/features/admin/actions";
import { AdminNotAuthorized, getAdminUserIdOrNull } from "@/features/admin/guard";
import { createdDate, StatusBadge } from "@/features/admin/status";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { prisma } from "@/lib/db";

type AppSummary = {
  id: string;
  appName: string;
  generationStatus: string;
  repositoryStatus: string;
  publishStatus: string;
  createdAt: Date;
};

function AppSummaryList({
  apps,
  emptyMessage,
}: {
  apps: AppSummary[];
  emptyMessage: string;
}) {
  if (apps.length === 0) {
    return <p style={{ color: "var(--text-muted)", margin: 0 }}>{emptyMessage}</p>;
  }

  return (
    <div className="status-table">
      {apps.map((app) => (
        <div className="status-row" key={app.id}>
          <span className="status-row__label">
            <Link href={`/admin/apps/${app.id}`} className="meta-link">
              {app.appName}
            </Link>
          </span>
          <span
            style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}
          >
            <StatusBadge label="Generation" status={app.generationStatus} />
            <StatusBadge label="Repository" status={app.repositoryStatus} />
            <StatusBadge label="Published" status={app.publishStatus} />
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminUserId = await getAdminUserIdOrNull();

  if (!adminUserId) {
    return <AdminNotAuthorized />;
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      roles: { select: { role: true } },
      appRequests: {
        select: {
          id: true,
          appName: true,
          generationStatus: true,
          repositoryStatus: true,
          publishStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      appAccess: {
        select: {
          appRequest: {
            select: {
              id: true,
              appName: true,
              generationStatus: true,
              repositoryStatus: true,
              publishStatus: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    return (
      <div className="empty-state">
        <h1 className="empty-state__title">User Not Found</h1>
        <p className="empty-state__desc">
          That user does not exist or has been removed.
        </p>
        <Link href="/admin/users" className="btn btn--primary-solid">
          Back to Users
        </Link>
      </div>
    );
  }

  const isAdmin = user.roles.some((role) => role.role === "ADMIN");
  const roleAction = isAdmin
    ? removeAdminRoleAction.bind(null, user.id)
    : grantAdminRoleAction.bind(null, user.id);
  const collaborations = user.appAccess.map((access) => access.appRequest);

  return (
    <>
      <div className="page-header">
        <h1>{user.displayName}</h1>
        <p>{user.email}</p>
      </div>

      <div className="grid grid--2" style={{ gap: "1rem", alignItems: "start" }}>
        <section className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>Identity</h2>
          <div className="status-table">
            <div className="status-row">
              <span className="status-row__label">Name</span>
              <span>{user.displayName}</span>
            </div>
            <div className="status-row">
              <span className="status-row__label">Email</span>
              <span>{user.email}</span>
            </div>
            <div className="status-row">
              <span className="status-row__label">Joined</span>
              <span>{createdDate(user.createdAt)}</span>
            </div>
            <div className="status-row">
              <span className="status-row__label">Role</span>
              <span className={`badge badge--${isAdmin ? "success" : "default"}`}>
                {isAdmin ? "Admin" : "User"}
              </span>
            </div>
          </div>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              margin: "0.75rem 0 0",
            }}
          >
            Name and email are synced from Entra at each sign-in and cannot be
            edited here.
          </p>
        </section>

        <section className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>Portal Settings</h2>
          <form
            action={updateUserGithubUsernameAction.bind(null, user.id)}
            className="form-stack"
          >
            <label className="form-group">
              <span className="form-label">GitHub username</span>
              <input
                type="text"
                name="githubUsername"
                className="form-control"
                defaultValue={user.githubUsername ?? ""}
                placeholder="octocat"
              />
            </label>
            <div>
              <PendingSubmitButton
                idleLabel="Save GitHub Username"
                pendingLabel="Saving..."
                statusText="Saving GitHub username."
                variant="secondary"
                size="sm"
              />
            </div>
          </form>

          <form action={roleAction} style={{ marginTop: "1rem" }}>
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
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>
          Owned Apps ({user.appRequests.length})
        </h2>
        <AppSummaryList apps={user.appRequests} emptyMessage="No apps owned." />
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>
          Collaborations ({collaborations.length})
        </h2>
        <AppSummaryList apps={collaborations} emptyMessage="No collaborations." />
      </section>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/admin/users/[id]/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/users/[id]/page.tsx" "src/app/admin/users/[id]/page.test.tsx"
git commit -m "feat: add admin user detail page with github username editing"
```

---

### Task 10: `/admin/apps` — searchable, paginated app table

**Files:**
- Create: `src/app/admin/apps/page.tsx`
- Test: `src/app/admin/apps/page.test.tsx`

**Interfaces:**
- Consumes: Task 3, 5, 6, 7 helpers; `prisma`.
- Produces: the apps list page. App names link to `/admin/apps/[id]` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `src/app/admin/apps/page.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminUserIdOrNull } from "@/features/admin/guard";
import { prisma } from "@/lib/db";
import AdminAppsPage from "./page";

vi.mock("@/features/admin/guard", () => ({
  getAdminUserIdOrNull: vi.fn(),
  AdminNotAuthorized: () => <div>Not Authorized</div>,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

function mockApps() {
  vi.mocked(prisma.appRequest.count).mockResolvedValue(1);
  vi.mocked(prisma.appRequest.findMany).mockResolvedValue([
    {
      id: "app-1",
      appName: "Campus Dashboard",
      generationStatus: "SUCCEEDED",
      repositoryStatus: "READY",
      publishStatus: "SUCCEEDED",
      createdAt: new Date("2026-02-01T12:00:00"),
      user: {
        id: "user-1",
        displayName: "Ada Admin",
        email: "ada@cedarville.edu",
      },
    },
  ] as unknown as Awaited<ReturnType<typeof prisma.appRequest.findMany>>);
}

describe("AdminAppsPage", () => {
  beforeEach(() => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    vi.mocked(prisma.appRequest.count).mockReset();
    vi.mocked(prisma.appRequest.findMany).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the not authorized state for non-admins", async () => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue(null);

    render(await AdminAppsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Not Authorized")).toBeInTheDocument();
  });

  it("renders apps with owner and status badges", async () => {
    mockApps();

    render(await AdminAppsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("link", { name: "Campus Dashboard" }),
    ).toHaveAttribute("href", "/admin/apps/app-1");
    expect(screen.getByText(/Ada Admin/)).toBeInTheDocument();
    expect(screen.getByText("Generation: succeeded")).toBeInTheDocument();
  });

  it("filters by app name and owner", async () => {
    mockApps();

    render(
      await AdminAppsPage({ searchParams: Promise.resolve({ q: "dash" }) }),
    );

    expect(vi.mocked(prisma.appRequest.count)).toHaveBeenCalledWith({
      where: {
        OR: [
          { appName: { contains: "dash", mode: "insensitive" } },
          { user: { displayName: { contains: "dash", mode: "insensitive" } } },
          { user: { email: { contains: "dash", mode: "insensitive" } } },
        ],
      },
    });
  });

  it("shows an empty state when no apps match", async () => {
    vi.mocked(prisma.appRequest.count).mockResolvedValue(0);
    vi.mocked(prisma.appRequest.findMany).mockResolvedValue([]);

    render(
      await AdminAppsPage({ searchParams: Promise.resolve({ q: "zz" }) }),
    );

    expect(screen.getByText("No apps match your search.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/admin/apps/page.test.tsx`
Expected: FAIL — page module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/admin/apps/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/admin/apps/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/apps/page.tsx src/app/admin/apps/page.test.tsx
git commit -m "feat: add searchable paginated admin apps page"
```

---

### Task 11: `/admin/apps/[id]` — app management detail page

**Files:**
- Create: `src/app/admin/apps/[id]/page.tsx`
- Test: `src/app/admin/apps/[id]/page.test.tsx`

**Interfaces:**
- Consumes: Task 5, 7 helpers; existing actions `addAppCollaboratorAction`, `reassignAppOwnerAction`, `removeAppCollaboratorAction` from `@/features/admin/actions`, `deleteAppFormAction` from `@/features/app-deletion/actions`, `ConfirmDeleteForm` from `@/features/app-deletion/confirm-delete-form`, `PendingSubmitButton`, `prisma`.
- Produces: the app management page. This is the current app card from `src/app/admin/page.tsx` relocated; the delete form's `returnTo` hidden input changes from `/admin` to `/admin/apps`.

- [ ] **Step 1: Write the failing test**

Create `src/app/admin/apps/[id]/page.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminUserIdOrNull } from "@/features/admin/guard";
import { prisma } from "@/lib/db";
import AdminAppDetailPage from "./page";

const mockUseFormStatus = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: mockUseFormStatus,
  };
});

vi.mock("@/features/admin/guard", () => ({
  getAdminUserIdOrNull: vi.fn(),
  AdminNotAuthorized: () => <div>Not Authorized</div>,
}));

vi.mock("@/features/admin/actions", () => ({
  addAppCollaboratorAction: vi.fn(),
  reassignAppOwnerAction: vi.fn(),
  removeAppCollaboratorAction: vi.fn(),
}));

vi.mock("@/features/app-deletion/actions", () => ({
  deleteAppFormAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    appRequest: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

function mockAppDetail() {
  vi.mocked(prisma.appRequest.findUnique).mockResolvedValue({
    id: "app-1",
    appName: "Campus Dashboard",
    userId: "user-1",
    generationStatus: "SUCCEEDED",
    repositoryStatus: "READY",
    publishStatus: "SUCCEEDED",
    repositoryUrl: "https://github.com/cedarville-it/campus-dashboard",
    repositoryOwner: "cedarville-it",
    repositoryName: "campus-dashboard",
    publishUrl: "https://campus-dashboard.azurewebsites.net",
    primaryPublishUrl: null,
    azureWebAppName: "campus-dashboard",
    azureDatabaseName: "campus_dashboard_db",
    createdAt: new Date("2026-02-01T12:00:00"),
    user: {
      id: "user-1",
      displayName: "Ada Admin",
      email: "ada@cedarville.edu",
    },
    collaborators: [
      {
        user: {
          id: "user-2",
          displayName: "Norm Normal",
          email: "norm@cedarville.edu",
        },
      },
    ],
  } as unknown as Awaited<ReturnType<typeof prisma.appRequest.findUnique>>);
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    { id: "user-1", displayName: "Ada Admin", email: "ada@cedarville.edu" },
    { id: "user-2", displayName: "Norm Normal", email: "norm@cedarville.edu" },
    { id: "user-3", displayName: "Cass Collab", email: "cass@cedarville.edu" },
  ] as unknown as Awaited<ReturnType<typeof prisma.user.findMany>>);
}

describe("AdminAppDetailPage", () => {
  beforeEach(() => {
    mockUseFormStatus.mockReturnValue({ pending: false });
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    vi.mocked(prisma.appRequest.findUnique).mockReset();
    vi.mocked(prisma.user.findMany).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the not authorized state for non-admins", async () => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue(null);

    render(
      await AdminAppDetailPage({ params: Promise.resolve({ id: "app-1" }) }),
    );

    expect(screen.getByText("Not Authorized")).toBeInTheDocument();
  });

  it("renders a not found state for unknown apps", async () => {
    vi.mocked(prisma.appRequest.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);

    render(
      await AdminAppDetailPage({ params: Promise.resolve({ id: "missing" }) }),
    );

    expect(screen.getByText("App Not Found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Apps" })).toHaveAttribute(
      "href",
      "/admin/apps",
    );
  });

  it("renders status, links, and management forms", async () => {
    mockAppDetail();

    render(
      await AdminAppDetailPage({ params: Promise.resolve({ id: "app-1" }) }),
    );

    expect(
      screen.getByRole("heading", { name: "Campus Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Generation: succeeded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "App Details" })).toHaveAttribute(
      "href",
      "/download/app-1",
    );
    expect(screen.getByLabelText("Add collaborator")).toBeInTheDocument();
    expect(screen.getByLabelText("Reassign owner")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Norm Normal" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Delete selected resources")).toBeInTheDocument();

    // returnTo points back at the admin apps list
    const returnTo = document.querySelector('input[name="returnTo"]');

    expect(returnTo).toHaveAttribute("value", "/admin/apps");

    // The owner is excluded from the collaborator/owner selects
    const collaboratorSelect = screen.getByLabelText("Add collaborator");

    expect(collaboratorSelect).not.toHaveTextContent("Ada Admin");
    expect(collaboratorSelect).toHaveTextContent("Cass Collab");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/admin/apps/[id]/page.test.tsx"`
Expected: FAIL — page module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/admin/apps/[id]/page.tsx` (this is the app-card JSX from the current `src/app/admin/page.tsx` reshaped into a page; the logic is identical except `returnTo` is `/admin/apps` and helpers come from `@/features/admin/status`):

```tsx
import Link from "next/link";
import React from "react";
import {
  addAppCollaboratorAction,
  reassignAppOwnerAction,
  removeAppCollaboratorAction,
} from "@/features/admin/actions";
import { AdminNotAuthorized, getAdminUserIdOrNull } from "@/features/admin/guard";
import { createdDate, StatusBadge, userLabel } from "@/features/admin/status";
import { deleteAppFormAction } from "@/features/app-deletion/actions";
import { ConfirmDeleteForm } from "@/features/app-deletion/confirm-delete-form";
import { PendingSubmitButton } from "@/features/forms/pending-submit-button";
import { prisma } from "@/lib/db";

export default async function AdminAppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminUserId = await getAdminUserIdOrNull();

  if (!adminUserId) {
    return <AdminNotAuthorized />;
  }

  const { id } = await params;
  const [request, users] = await Promise.all([
    prisma.appRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, displayName: true, email: true },
        },
        collaborators: {
          include: {
            user: {
              select: { id: true, displayName: true, email: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.user.findMany({
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
      select: { id: true, displayName: true, email: true },
    }),
  ]);

  if (!request) {
    return (
      <div className="empty-state">
        <h1 className="empty-state__title">App Not Found</h1>
        <p className="empty-state__desc">
          That app does not exist or has been removed.
        </p>
        <Link href="/admin/apps" className="btn btn--primary-solid">
          Back to Apps
        </Link>
      </div>
    );
  }

  const displayPublishUrl = request.publishUrl ?? request.primaryPublishUrl;
  const collaborators = request.collaborators.map((access) => access.user);
  const canDeleteGitHub =
    request.repositoryStatus !== "DELETED" &&
    Boolean(request.repositoryOwner && request.repositoryName);
  const canDeleteAzure =
    request.publishStatus !== "DELETED" &&
    Boolean(request.azureWebAppName || request.azureDatabaseName);

  return (
    <>
      <div className="page-header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1>{request.appName}</h1>
            <p>
              Owned by {userLabel(request.user)} · Created{" "}
              {createdDate(request.createdAt)}
            </p>
          </div>
          <Link href={`/download/${request.id}`} className="btn btn--ghost btn--sm">
            App Details
          </Link>
        </div>
      </div>

      <section className="card">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <StatusBadge label="Generation" status={request.generationStatus} />
          <StatusBadge label="Repository" status={request.repositoryStatus} />
          <StatusBadge label="Published" status={request.publishStatus} />
        </div>

        <div className="status-table" style={{ marginTop: "1rem" }}>
          <div className="status-row">
            <span className="status-row__label">Owner</span>
            <span>{userLabel(request.user)}</span>
          </div>
          <div className="status-row">
            <span className="status-row__label">Collaborators</span>
            <span>
              {collaborators.length > 0
                ? collaborators.map((user) => user.displayName).join(", ")
                : "None"}
            </span>
          </div>
          {request.repositoryUrl ? (
            <div className="status-row">
              <span className="status-row__label">Repository</span>
              <a
                href={request.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="meta-link"
              >
                {request.repositoryUrl.replace("https://github.com/", "")}
              </a>
            </div>
          ) : null}
          {displayPublishUrl ? (
            <div className="status-row">
              <span className="status-row__label">Published</span>
              <a
                href={displayPublishUrl}
                target="_blank"
                rel="noreferrer"
                className="meta-link"
              >
                {displayPublishUrl}
              </a>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid grid--2" style={{ gap: "1rem", marginTop: "1rem" }}>
        <section className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>Collaborators</h2>
          <form
            action={addAppCollaboratorAction.bind(null, request.id)}
            className="form-stack"
          >
            <label className="form-group">
              <span className="form-label">Add collaborator</span>
              <select className="form-control" name="userId" required>
                <option value="">Select a user</option>
                {users
                  .filter((user) => user.id !== request.userId)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {userLabel(user)}
                    </option>
                  ))}
              </select>
            </label>
            <div>
              <PendingSubmitButton
                idleLabel="Add Collaborator"
                pendingLabel="Adding..."
                statusText="Adding app collaborator."
                variant="secondary"
                size="sm"
              />
            </div>
          </form>

          {collaborators.length > 0 ? (
            <div className="form-stack" style={{ marginTop: "1rem" }}>
              <p className="section-title">Remove collaborators</p>
              {collaborators.map((user) => (
                <form
                  action={removeAppCollaboratorAction.bind(
                    null,
                    request.id,
                    user.id,
                  )}
                  key={user.id}
                >
                  <PendingSubmitButton
                    idleLabel={`Remove ${user.displayName}`}
                    pendingLabel="Removing..."
                    statusText="Removing collaborator."
                    variant="ghost"
                    size="sm"
                  />
                </form>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card">
          <h2 style={{ marginBottom: "0.75rem" }}>Ownership</h2>
          <form
            action={reassignAppOwnerAction.bind(null, request.id)}
            className="form-stack"
          >
            <label className="form-group">
              <span className="form-label">Reassign owner</span>
              <select
                className="form-control"
                name="userId"
                required
                defaultValue=""
              >
                <option value="">Select a new owner</option>
                {users
                  .filter((user) => user.id !== request.userId)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {userLabel(user)}
                    </option>
                  ))}
              </select>
            </label>
            <div>
              <PendingSubmitButton
                idleLabel="Reassign Owner"
                pendingLabel="Reassigning..."
                statusText="Reassigning app owner."
                variant="secondary"
                size="sm"
              />
            </div>
          </form>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Danger Zone</h2>
        <ConfirmDeleteForm
          action={deleteAppFormAction.bind(null, request.id)}
          className="form-stack"
        >
          <details className="delete-panel">
            <summary>Delete selected resources</summary>
            <div className="delete-panel__content">
              <fieldset>
                <legend>Resources to delete</legend>
                <label>
                  <input name="deletePortal" type="checkbox" />
                  Remove this app from the portal
                </label>
                {canDeleteGitHub ? (
                  <label>
                    <input name="deleteGithub" type="checkbox" />
                    Delete GitHub repository{" "}
                    <code style={{ fontSize: "0.875em" }}>
                      {request.repositoryOwner}/{request.repositoryName}
                    </code>
                  </label>
                ) : (
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-muted)",
                      margin: 0,
                    }}
                  >
                    GitHub repository already deleted or not tracked.
                  </p>
                )}
                {canDeleteAzure ? (
                  <label>
                    <input name="deleteAzure" type="checkbox" />
                    <span>
                      Delete Azure deployment
                      {request.azureWebAppName ? (
                        <>: Web App {request.azureWebAppName}</>
                      ) : null}
                      {request.azureDatabaseName ? (
                        <>
                          {" "}
                          and PostgreSQL database {request.azureDatabaseName}
                        </>
                      ) : null}
                    </span>
                  </label>
                ) : (
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-muted)",
                      margin: 0,
                    }}
                  >
                    Azure deployment already deleted or not tracked.
                  </p>
                )}
              </fieldset>
              <label>
                <input name="confirmDelete" type="checkbox" required />
                I understand that checked items will be permanently deleted.
              </label>
              <input name="returnTo" type="hidden" value="/admin/apps" />
              <PendingSubmitButton
                idleLabel="Delete Selected Resources"
                pendingLabel="Deleting..."
                statusText="Deleting selected resources."
                variant="danger"
                size="sm"
              />
            </div>
          </details>
        </ConfirmDeleteForm>
      </section>
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/admin/apps/[id]/page.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/apps/[id]/page.tsx" "src/app/admin/apps/[id]/page.test.tsx"
git commit -m "feat: add admin app detail page with management actions"
```

---

### Task 12: `/admin/events` — audit event log viewer

**Files:**
- Create: `src/app/admin/events/page.tsx`
- Test: `src/app/admin/events/page.test.tsx`

**Interfaces:**
- Consumes: `searchAuditLog`/`summarizeDetails` (Task 4), `AUDIT_EVENTS` (Task 1), Task 3, 5, 6, 7 helpers.
- Produces: the event log viewer page.

- [ ] **Step 1: Write the failing test**

Create `src/app/admin/events/page.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchAuditLog } from "@/features/admin/audit-log";
import { getAdminUserIdOrNull } from "@/features/admin/guard";
import AdminEventsPage from "./page";

vi.mock("@/features/admin/guard", () => ({
  getAdminUserIdOrNull: vi.fn(),
  AdminNotAuthorized: () => <div>Not Authorized</div>,
}));

vi.mock("@/features/admin/audit-log", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/admin/audit-log")>();

  return {
    ...actual,
    searchAuditLog: vi.fn(),
  };
});

describe("AdminEventsPage", () => {
  beforeEach(() => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    vi.mocked(searchAuditLog).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the not authorized state for non-admins", async () => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue(null);

    render(await AdminEventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Not Authorized")).toBeInTheDocument();
  });

  it("renders events with expandable detail payloads", async () => {
    vi.mocked(searchAuditLog).mockResolvedValue({
      entries: [
        {
          id: "evt-1",
          event: "SIGN_IN",
          details: { provider: "microsoft-entra-id", entraOid: "oid-1" },
          createdAt: new Date("2026-07-06T13:05:00"),
        },
      ],
      totalCount: 1,
    });

    render(await AdminEventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("SIGN_IN")).toBeInTheDocument();
    expect(
      screen.getByText(/provider: microsoft-entra-id/),
    ).toBeInTheDocument();
    expect(screen.getByText(/"entraOid": "oid-1"/)).toBeInTheDocument();
  });

  it("passes parsed filters to searchAuditLog", async () => {
    vi.mocked(searchAuditLog).mockResolvedValue({ entries: [], totalCount: 0 });

    render(
      await AdminEventsPage({
        searchParams: Promise.resolve({
          event: "SIGN_IN",
          from: "2026-07-01",
          to: "2026-07-06",
          q: "SUP-123",
          page: "2",
        }),
      }),
    );

    // The page first queries the requested page (2); because it comes back
    // empty it settles on page 1, so assert the LAST call.
    expect(vi.mocked(searchAuditLog)).toHaveBeenLastCalledWith(
      {
        event: "SIGN_IN",
        from: new Date("2026-07-01T00:00:00"),
        to: new Date("2026-07-06T23:59:59.999"),
        search: "SUP-123",
      },
      1,
      25,
    );
  });

  it("renders the filter form with event options", async () => {
    vi.mocked(searchAuditLog).mockResolvedValue({ entries: [], totalCount: 0 });

    render(await AdminEventsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByLabelText("Event type")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "SIGN_IN" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No events recorded yet.")).toBeInTheDocument();
  });
});
```

Implementation note: the page cannot clamp the page number before fetching (the total count comes back in the same `searchAuditLog` call), so it fetches the requested page and, if that returns no entries while `page > 1`, re-fetches page 1. That is why the test above asserts the last call.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/admin/events/page.test.tsx`
Expected: FAIL — page module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/admin/events/page.tsx`:

```tsx
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
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                  padding: "0.625rem 0",
                  cursor: "pointer",
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/admin/events/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/events/page.tsx src/app/admin/events/page.test.tsx
git commit -m "feat: add admin audit event log viewer"
```

---

### Task 13: Rewrite `/admin` as the overview hub and verify everything

**Files:**
- Modify: `src/app/admin/page.tsx` (full rewrite — the users/apps management UI now lives in Tasks 8–11 pages)
- Test: `src/app/admin/page.test.tsx` (create)

**Interfaces:**
- Consumes: `getAdminUserIdOrNull`/`AdminNotAuthorized` (Task 7); `prisma.user.count`, `prisma.appRequest.count`, `prisma.auditLog.count`.
- Produces: the `/admin` overview hub. This removes the old monolithic page (its pieces are all relocated by now).

- [ ] **Step 1: Write the failing test**

Create `src/app/admin/page.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminUserIdOrNull } from "@/features/admin/guard";
import { prisma } from "@/lib/db";
import AdminPage from "./page";

vi.mock("@/features/admin/guard", () => ({
  getAdminUserIdOrNull: vi.fn(),
  AdminNotAuthorized: () => <div>Not Authorized</div>,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { count: vi.fn() },
    appRequest: { count: vi.fn() },
    auditLog: { count: vi.fn() },
  },
}));

describe("AdminPage (overview hub)", () => {
  beforeEach(() => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    vi.mocked(prisma.user.count).mockResolvedValue(12);
    vi.mocked(prisma.appRequest.count).mockResolvedValue(34);
    vi.mocked(prisma.auditLog.count).mockResolvedValue(56);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the not authorized state for non-admins", async () => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue(null);

    render(await AdminPage());

    expect(screen.getByText("Not Authorized")).toBeInTheDocument();
  });

  it("renders counts linking to each admin section", async () => {
    render(await AdminPage());

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();
    expect(screen.getByText("56")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage Users/ })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    expect(screen.getByRole("link", { name: /Manage Apps/ })).toHaveAttribute(
      "href",
      "/admin/apps",
    );
    expect(screen.getByRole("link", { name: /View Events/ })).toHaveAttribute(
      "href",
      "/admin/events",
    );
  });

  it("counts events from the last seven days", async () => {
    render(await AdminPage());

    const countArgs = vi.mocked(prisma.auditLog.count).mock.calls[0][0];
    const gte = (countArgs?.where?.createdAt as { gte: Date }).gte;

    expect(gte).toBeInstanceOf(Date);
    expect(Date.now() - gte.getTime()).toBeGreaterThanOrEqual(
      7 * 24 * 60 * 60 * 1000 - 60_000,
    );
    expect(Date.now() - gte.getTime()).toBeLessThanOrEqual(
      7 * 24 * 60 * 60 * 1000 + 60_000,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/admin/page.test.tsx`
Expected: FAIL — the current page has a different shape (renders `<main>`, takes no such data).

- [ ] **Step 3: Write minimal implementation**

Replace the entire contents of `src/app/admin/page.tsx` with:

```tsx
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
```

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npm test`
Expected: all tests pass (the old admin page had no dedicated test file; nothing else imported its private helpers).

Run: `npx tsc --noEmit -p tsconfig.next.json`
Expected: no NEW errors (pre-existing errors in `src/features/repository-imports/import-repository.test.ts` are unrelated).

Run: `npm run build`
Expected: production build succeeds, listing the new `/admin/*` routes.

- [ ] **Step 5: Manual smoke check (optional but recommended)**

With the local database up (`npm run db:up`) and dev server running (`npm run dev`), visit `/admin` as an admin: hub counts render; Users/Apps/Events tabs navigate; search, filters, pagination, user GitHub-username editing, app management forms, and event detail expansion all work.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/page.test.tsx
git commit -m "feat: replace admin page with overview hub linking to sub-pages"
```
