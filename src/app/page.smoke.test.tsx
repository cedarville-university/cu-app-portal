import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the CU Launch call to action", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "CU Launch" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Launch Your App" }),
    ).toHaveAttribute("href", "/onboarding");
    expect(
      screen.queryByRole("link", { name: /add existing app/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/launch an app, keep its code in a private online home/i)).toBeInTheDocument();
    expect(screen.queryByText(/github \(an online platform/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/microsoft’s cloud hosting service/i)).not.toBeInTheDocument();
  });
});
