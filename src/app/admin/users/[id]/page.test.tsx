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
