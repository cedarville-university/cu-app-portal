import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OnboardingStartPage from "./page";

const mockRedirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
);

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

afterEach(() => {
  cleanup();
});

describe("OnboardingStartPage", () => {
  it("asks users where their app is starting from", async () => {
    render(await OnboardingStartPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: /where is your app today/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /i need a new app/i })).toHaveAttribute(
      "href",
      "/create",
    );
    expect(
      screen.getByRole("link", { name: /my app is already on github/i }),
    ).toHaveAttribute("href", "/apps/add?source=github");
    expect(
      screen.getByText(/bring an app you have already saved online into the portal/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /my app is only on my computer/i }),
    ).toHaveAttribute("href", "/apps/add?source=local");
    expect(screen.getByRole("list", { name: /app setup progress/i }))
      .toHaveTextContent("StartDevelopPreparePublish");
    expect(
      screen.queryByRole("link", { name: /choose a different starting point/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/portal-managed publishing workflow/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/connect and push/i)).not.toBeInTheDocument();
  });

  it.each([
    ["new", "/create"],
    ["existing", "/apps/add?source=github"],
    ["local", "/apps/add?source=local"],
  ])("redirects legacy start=%s links directly to %s", async (start, destination) => {
    await expect(
      OnboardingStartPage({ searchParams: Promise.resolve({ start }) }),
    ).rejects.toThrow(`redirect:${destination}`);
  });
});
