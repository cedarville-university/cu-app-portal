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
