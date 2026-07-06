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
