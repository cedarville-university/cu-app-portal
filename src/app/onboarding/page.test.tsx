import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import OnboardingStartPage from "./page";

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

  it("asks about GitHub before a new app template is selected", async () => {
    render(
      await OnboardingStartPage({
        searchParams: Promise.resolve({ start: "new" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /do you already have a github account/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /yes, i have one/i })).toHaveAttribute(
      "href",
      "/create",
    );
  });
});
