import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WhatsChanged } from "./whats-changed";

describe("WhatsChanged", () => {
  it("renders dated plain text in a named keyboard-accessible scroll region", () => {
    render(<WhatsChanged entries={[{ date: "2026-10-28", notes: ["Publish more easily.", "<strong>Literal text</strong>"] }]} />);
    const region = screen.getByRole("region", { name: "Recent CU Launch changes" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("whats-changed__list");
    expect(screen.getByRole("heading", { name: "What’s changed", level: 2 })).toBeVisible();
    const date = within(region).getByText("October 28, 2026");
    expect(date.tagName).toBe("TIME");
    expect(date).toHaveAttribute("datetime", "2026-10-28");
    expect(within(region).getAllByRole("listitem")).toHaveLength(2);
    expect(within(region).getByText("<strong>Literal text</strong>").querySelector("strong")).toBeNull();
  });
  it("does not show an empty section", () => {
    const { container } = render(<WhatsChanged entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
