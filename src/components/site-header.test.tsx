import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";
import { getServerSession } from "@/auth/session";
import { userHasAdminRole } from "@/features/app-requests/access";

vi.mock("@/auth/session", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/features/app-requests/access", () => ({
  userHasAdminRole: vi.fn(),
}));

vi.mock("@/features/auth/logout", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/features/auth/login", () => ({
  loginAction: vi.fn(),
}));

const mockGetServerSession = vi.mocked(getServerSession);
const mockUserHasAdminRole = vi.mocked(userHasAdminRole);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("SiteHeader", () => {
  it("shows an Admin link to authenticated admins", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "admin-user",
        name: "Portal Admin",
        email: "admin@example.edu",
        entraOid: "entra-oid",
      },
      expires: "2099-01-01T00:00:00.000Z",
    });
    mockUserHasAdminRole.mockResolvedValue(true);

    render(await SiteHeader());

    expect(screen.getByRole("link", { name: /admin/i })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(userHasAdminRole).toHaveBeenCalledWith("admin-user");
  });

  it("does not show the Admin link to authenticated non-admins", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user-123",
        name: "Portal Staff",
        email: "portal.staff@example.edu",
        entraOid: "entra-oid",
      },
      expires: "2099-01-01T00:00:00.000Z",
    });
    mockUserHasAdminRole.mockResolvedValue(false);

    render(await SiteHeader());

    expect(
      screen.queryByRole("link", { name: /admin/i }),
    ).not.toBeInTheDocument();
    expect(userHasAdminRole).toHaveBeenCalledWith("user-123");
  });

  it("shows the signed-in user's name next to the log out button", async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: "user-123",
        name: "Portal Staff",
        email: "portal.staff@example.edu",
        entraOid: "entra-oid",
      },
      expires: "2099-01-01T00:00:00.000Z",
    });
    mockUserHasAdminRole.mockResolvedValue(false);

    render(await SiteHeader());

    const logoutButton = screen.getByRole("button", { name: /log out/i });
    const userName = screen.getByText("Portal Staff");

    expect(userName).toBeInTheDocument();
    expect(userName.compareDocumentPosition(logoutButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("shows a log in button when no user is signed in", async () => {
    mockGetServerSession.mockResolvedValue(null);

    render(await SiteHeader());

    expect(
      screen.getByRole("button", { name: /log in/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /log out/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Portal Staff")).not.toBeInTheDocument();
    expect(userHasAdminRole).not.toHaveBeenCalled();
  });
});
