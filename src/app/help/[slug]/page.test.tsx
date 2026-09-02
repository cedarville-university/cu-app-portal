import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpDocumentPage from "./page";

describe("HelpDocumentPage", () => {
  it("uses the current PDF downloads for quick-start and guide articles", async () => {
    render(
      await HelpDocumentPage({
        params: Promise.resolve({ slug: "quick-start" }),
      }),
    );

    expect(screen.getByRole("link", { name: /^download pdf$/i })).toHaveAttribute(
      "href",
      "/docs/cu-launch-quick-start.pdf",
    );

    render(
      await HelpDocumentPage({
        params: Promise.resolve({ slug: "guide" }),
      }),
    );

    expect(
      screen.getByRole("link", { name: /download full guide pdf/i }),
    ).toHaveAttribute("href", "/docs/cu-launch-user-guide.pdf");
  });
});
