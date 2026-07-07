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
