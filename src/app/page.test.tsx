import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage release notes", () => {
  it("places release notes after the existing content at the end of main", () => {
    render(<HomePage />);
    const main = screen.getByRole("main");
    const notes = screen.getByRole("heading", { name: "What’s changed" });
    expect(screen.getByText("How it works").compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.lastElementChild).toContainElement(notes);
    expect(screen.getByText("October 28, 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Apps" })).toHaveAttribute("href", "/apps");
  });
});
