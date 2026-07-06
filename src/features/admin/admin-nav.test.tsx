import { render, screen, within } from "@testing-library/react";
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
    const { container } = render(<AdminNav />);
    const nav = container.querySelector('nav[aria-label="Admin sections"]');

    expect(
      within(nav!).getByRole("link", { name: "Users" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(nav!).getByRole("link", { name: "Overview" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
