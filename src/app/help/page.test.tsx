import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpPage from "./page";

describe("HelpPage", () => {
  it("starts with quick-start guidance and offers both PDF downloads", async () => {
    render(await HelpPage());
    expect(screen.getByRole("heading", { name: /help center/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^quick start$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download quick start pdf/i })).toHaveAttribute(
      "href",
      "/docs/cedarville-app-portal-quick-start.pdf",
    );
    expect(screen.getByRole("link", { name: /download full guide pdf/i })).toHaveAttribute(
      "href",
      "/docs/cedarville-app-portal-user-guide.pdf",
    );
  });
});

