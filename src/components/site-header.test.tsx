import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";
import { getServerSession } from "@/auth/session";

vi.mock("@/auth/session", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/features/auth/logout", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/features/auth/login", () => ({
  loginAction: vi.fn(),
}));

const mockGetServerSession = vi.mocked(getServerSession);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("SiteHeader", () => {
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
  });
});
