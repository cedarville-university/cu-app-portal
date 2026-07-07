import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchAuditLog } from "@/features/admin/audit-log";
import { resolveAuditReferences } from "@/features/admin/audit-log-references";
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

vi.mock("@/features/admin/audit-log-references", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/admin/audit-log-references")
    >();

  return {
    ...actual,
    resolveAuditReferences: vi.fn(),
  };
});

describe("AdminEventsPage", () => {
  beforeEach(() => {
    vi.mocked(getAdminUserIdOrNull).mockResolvedValue("admin-1");
    vi.mocked(searchAuditLog).mockReset();
    vi.mocked(resolveAuditReferences).mockReset();
    vi.mocked(resolveAuditReferences).mockResolvedValue({
      users: new Map(),
      apps: new Map(),
    });
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

    const signInBadges = screen.getAllByText("SIGN_IN");
    expect(signInBadges.length).toBeGreaterThan(0);
    expect(
      screen.getByText(/provider: microsoft-entra-id/),
    ).toBeInTheDocument();
    expect(screen.getByText(/"entraOid": "oid-1"/)).toBeInTheDocument();
  });

  it("resolves and links user and app references in the event details", async () => {
    vi.mocked(searchAuditLog).mockResolvedValue({
      entries: [
        {
          id: "evt-1",
          event: "SIGN_IN",
          details: { actorUserId: "user-1", appRequestId: "app-1" },
          createdAt: new Date("2026-07-06T13:05:00"),
        },
      ],
      totalCount: 1,
    });
    vi.mocked(resolveAuditReferences).mockResolvedValue({
      users: new Map([
        ["user-1", { displayName: "Ada Admin", email: "ada@cedarville.edu" }],
      ]),
      apps: new Map([["app-1", { appName: "Campus Dashboard" }]]),
    });

    render(await AdminEventsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByText(/actorUserId: Ada Admin/),
    ).toBeInTheDocument();

    const userLink = screen.getByRole("link", { name: /Ada Admin/ });
    expect(userLink).toHaveAttribute("href", "/admin/users/user-1");
    expect(userLink.textContent).toContain("ada@cedarville.edu");

    const appLink = screen.getByRole("link", { name: "Campus Dashboard" });
    expect(appLink).toHaveAttribute("href", "/admin/apps/app-1");

    expect(screen.getByText(/"actorUserId": "user-1"/)).toBeInTheDocument();
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
