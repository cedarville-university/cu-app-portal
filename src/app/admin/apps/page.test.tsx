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
