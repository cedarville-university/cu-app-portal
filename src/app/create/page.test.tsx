import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CreatePage from "./page";

vi.mock("@/features/auth/logout", () => ({
  logoutAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("CreatePage", () => {
  it("lists active templates as selectable links", async () => {
    render(await CreatePage());
    expect(
      screen.getByRole("heading", { name: /create new app/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /use next.js web app/i }),
    ).toHaveAttribute("href", "/create/web-app");
  });

  it("shows an expandable GitHub explanation help box", async () => {
    render(await CreatePage());

    const helpToggle = screen.getByText("What is GitHub?");
    const helpBox = helpToggle.closest("details");

    expect(helpBox).not.toBeNull();
    expect(helpBox).not.toHaveAttribute("open");

    fireEvent.click(helpToggle);

    expect(helpBox).toHaveAttribute("open");
    expect(
      screen.getByText(/github is a secure place to store app code/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the portal uses github so codex/i),
    ).toBeInTheDocument();
  });
});
