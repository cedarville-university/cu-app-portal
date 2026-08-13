import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("@/features/auth/login", () => ({
  loginAction: vi.fn(),
}));

describe("LoginPage", () => {
  it("shows a branded Entra sign-in action and a cancel link home", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "CU App Portal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign in with microsoft entra/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /cancel and return home/i }),
    ).toHaveAttribute("href", "/");
  });
});
