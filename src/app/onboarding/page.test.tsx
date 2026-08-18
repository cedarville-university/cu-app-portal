import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import OnboardingStartPage from "./page";

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
      "/onboarding?start=new",
    );
    expect(
      screen.getByRole("link", { name: /my app is already on github/i }),
    ).toHaveAttribute("href", "/onboarding?start=existing");
  });

  it("sends a new app directly to template choices without asking about GitHub", async () => {
    render(
      await OnboardingStartPage({
        searchParams: Promise.resolve({ start: "new" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /choose a starting point/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /choose an app template/i })).toHaveAttribute(
      "href",
      "/create",
    );
    expect(screen.queryByText(/github account/i)).not.toBeInTheDocument();
  });

  it("asks whether existing app code is on GitHub or only on the computer", async () => {
    render(
      await OnboardingStartPage({
        searchParams: Promise.resolve({ start: "existing" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /where is your app's code/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /already on github/i })).toHaveAttribute(
      "href",
      "/apps/add?source=github",
    );
    expect(screen.getByRole("link", { name: /only on my computer/i })).toHaveAttribute(
      "href",
      "/apps/add?source=local#local-app",
    );
  });
});
